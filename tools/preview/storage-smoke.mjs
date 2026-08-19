/*
 * Test de lecture des fichiers iCloud.
 *
 * Ce banc existe à cause d'un défaut arrivé jusqu'à l'écran d'un
 * conducteur : son service s'affichait parfaitement quand il lançait
 * CTS Dashboard depuis Scriptable, et son widget affichait « Analyse en
 * cours » à la même minute, sur le même téléphone.
 *
 * La cause n'était pas le service, ni le PDF, ni l'index : c'était la
 * lecture. isFileDownloaded répond « non » pour des fichiers pourtant
 * lisibles dès qu'iOS déprioritise iCloud — ce qu'il fait précisément
 * dans un widget, qui reçoit bien moins de temps que l'application.
 * L'index et le cache revenaient donc vides, sans le moindre message.
 *
 * On rejoue donc ici un disque où iCloud ne confirme jamais rien.
 */

import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(here, "..", "..")

/*
 * Disque en mémoire. `confirmsDownloads` reproduit le comportement
 * d'iCloud : à false, aucun fichier n'est jamais déclaré disponible,
 * bien qu'il soit réellement là et parfaitement lisible.
 */
function createFileManager({ confirmsDownloads, stalls = false, unreadable = false }) {
  const disk = new Map()
  const calls = { downloads: 0 }

  return {
    disk,
    calls,
    joinPath: (parent, child) => `${parent}/${child}`,
    documentsDirectory: () => "/documents",
    fileExists: target => disk.has(target),
    createDirectory: () => {},
    isFileDownloaded: () => confirmsDownloads,
    /*
     * `stalls` reproduit iCloud en mauvais état : iOS n'impose aucune
     * limite à cet appel, et la promesse ne se résout jamais.
     */
    downloadFileFromiCloud: () => {
      calls.downloads++
      return stalls ? new Promise(() => {}) : Promise.resolve()
    },
    readString: target => {
      if (!disk.has(target)) throw new Error(`fichier absent : ${target}`)
      /* Fichier présent mais pas encore matérialisé : la lecture échoue. */
      if (unreadable) throw new Error("fichier non disponible localement")
      return disk.get(target)
    },
    writeString: (target, value) => disk.set(target, String(value)),
    remove: target => disk.delete(target),
    move: (from, to) => {
      if (!disk.has(from)) throw new Error(`fichier absent : ${from}`)
      disk.set(to, disk.get(from))
      disk.delete(from)
    },
    fileSize: target => (disk.has(target) ? 1 : 0),
    modificationDate: () => new Date()
  }
}

function loadStorage(fm) {
  const loaded = {}
  const modules = ["CTS Config", "CTS Utils", "CTS Storage"]

  for (const name of modules) {
    const source = fs.readFileSync(path.join(repository, `${name}.js`), "utf8")
    const module = { exports: {} }

    const sandbox = {
      module,
      console: { log: () => {}, warn: () => {}, error: () => {} },
      Date, Math, JSON, Number, String, Boolean, Array, Object, Set, Map,
      Promise, RegExp, Error, isNaN, parseInt, parseFloat,
      encodeURIComponent, decodeURIComponent,
      /* Le Timer de Scriptable compte en millisecondes. */
      Timer: class {
        static schedule(milliseconds, repeats, callback) {
          setTimeout(callback, 0)
          return new this()
        }
        invalidate() {}
      },
      FileManager: { iCloud: () => fm, local: () => fm },
      importModule: requested => {
        const key = String(requested).replace(/^.*\//, "")
        if (!loaded[key]) throw new Error(`module inattendu : ${key}`)
        return loaded[key]
      }
    }

    vm.createContext(sandbox)
    vm.runInContext(source, sandbox, { filename: name })
    loaded[name] = module.exports
  }

  return loaded["CTS Storage"]
}

const failures = []
const INDEX = { version: 2, services: [{ pdfFile: "EA06.pdf", cacheFile: "EA06.json" }] }

/*
 * Le cas du conducteur : le fichier est là, iCloud ne le confirme pas.
 * Avant correction, readJson renvoyait null et le widget concluait
 * « aucun service » alors que tout était sur le disque.
 */
{
  const fm = createFileManager({ confirmsDownloads: false })
  const STORAGE = loadStorage(fm)
  const target = "/documents/CTS Dashboard/Data/services-index.json"

  fm.disk.set(target, JSON.stringify(INDEX))

  const read = await STORAGE.readJson(target, null)

  if (JSON.stringify(read) !== JSON.stringify(INDEX)) {
    failures.push(
      "iCloud ne confirme pas le téléchargement : l'index revient " +
      `${JSON.stringify(read)} au lieu de son contenu réel`
    )
  }

  /*
   * Le fichier est là : le réveiller coûte 1,5 seconde de pauses, et un
   * widget n'a pas ce temps. Un fichier présent ne doit rien coûter.
   */
  if (fm.calls.downloads !== 0) {
    failures.push(
      `fichier présent : ${fm.calls.downloads} attente(s) iCloud alors qu'il était lisible`
    )
  }
}

/* Le chemin normal ne doit rien perdre au passage. */
{
  const fm = createFileManager({ confirmsDownloads: true })
  const STORAGE = loadStorage(fm)
  const target = "/documents/CTS Dashboard/Data/services-index.json"

  fm.disk.set(target, JSON.stringify(INDEX))

  const read = await STORAGE.readJson(target, null)

  if (JSON.stringify(read) !== JSON.stringify(INDEX)) {
    failures.push("iCloud confirme le téléchargement mais l'index ne revient pas")
  }
}

/*
 * Un fichier réellement absent doit continuer à rendre la valeur de
 * repli : la lecture de secours ne doit pas inventer de contenu.
 */
for (const confirmsDownloads of [true, false]) {
  const fm = createFileManager({ confirmsDownloads })
  const STORAGE = loadStorage(fm)

  const read = await STORAGE.readJson("/documents/absent.json", null)

  if (read !== null) {
    failures.push(
      `fichier absent (iCloud ${confirmsDownloads ? "confirme" : "ne confirme pas"}) : ` +
      `readJson rend ${JSON.stringify(read)} au lieu de la valeur de repli`
    )
  }
}

/* Un contenu illisible reste un contenu illisible, pas une exception. */
{
  const fm = createFileManager({ confirmsDownloads: false })
  const STORAGE = loadStorage(fm)
  const target = "/documents/casse.json"

  fm.disk.set(target, "{ ceci n'est pas du JSON")

  const read = await STORAGE.readJson(target, null)

  if (read !== null) {
    failures.push(`JSON invalide : readJson rend ${JSON.stringify(read)} au lieu de null`)
  }
}

/*
 * Le cœur de l'affaire : iCloud ne répond jamais.
 *
 * Sans borne, readJson n'aurait jamais rendu la main. Un widget qui
 * l'attend ne dessine rien, et l'écran d'accueil garde son image
 * précédente — c'est « Analyse en cours » qui ne partait plus.
 */
{
  const fm = createFileManager({ confirmsDownloads: false, stalls: true, unreadable: true })
  const STORAGE = loadStorage(fm)
  const target = "/documents/CTS Dashboard/Data/services-index.json"

  fm.disk.set(target, JSON.stringify(INDEX))

  let guard
  const startedAt = Date.now()
  const read = await Promise.race([
    STORAGE.readJson(target, "PAS-DE-REPONSE"),
    new Promise(resolve => { guard = setTimeout(() => resolve("BLOQUÉ"), 8000) })
  ])
  clearTimeout(guard)
  const elapsed = Date.now() - startedAt

  if (read === "BLOQUÉ") {
    failures.push("iCloud muet : readJson ne rend jamais la main")
  } else if (read !== "PAS-DE-REPONSE") {
    failures.push(`iCloud muet : readJson rend ${JSON.stringify(read)} au lieu du repli`)
  }

  /*
   * Un widget ne dispose que de quelques secondes en tout : la lecture
   * doit renoncer bien avant, sinon il meurt sans rien afficher.
   */
  if (elapsed > 4000) {
    failures.push(`iCloud muet : ${elapsed} ms avant de renoncer, trop pour un widget`)
  }
}

/*
 * Écriture atomique JSON.
 *
 * Ce code vivait en double, recopié à l'identique dans le gestionnaire
 * de services et dans le nettoyeur, et aucune des deux copies n'était
 * éprouvée. Elles n'en font plus qu'une, ce qui rend ce contrôle
 * nécessaire : l'état du balayage et l'index des services passent par
 * là, et une écriture interrompue ne doit jamais laisser un fichier
 * tronqué derrière elle.
 */
{
  const fm = createFileManager({ confirmsDownloads: true })
  const STORAGE = loadStorage(fm)
  const target = "/documents/CTS Dashboard/Data/services-scan-state.json"

  await STORAGE.writeJsonAtomically(target, { version: 1, files: {} })

  const written = fm.disk.get(target)

  if (!written) {
    failures.push("écriture atomique : le fichier n'est pas écrit")
  } else {
    try {
      const parsed = JSON.parse(written)
      if (parsed.version !== 1) {
        failures.push("écriture atomique : le contenu écrit ne correspond pas")
      }
    } catch (_) {
      failures.push("écriture atomique : le fichier écrit n'est pas du JSON")
    }
  }

  const leftovers = [...fm.disk.keys()].filter(key => /\.(tmp|rollback)-/.test(key))

  if (leftovers.length) {
    failures.push(`écriture atomique : ${leftovers.length} fichier(s) temporaire(s) laissé(s)`)
  }
}

/*
 * Le même, interrompu au moment de la bascule. L'ancien contenu doit
 * revenir intact : c'est toute la raison d'être du fichier de secours.
 */
{
  const fm = createFileManager({ confirmsDownloads: true })
  const STORAGE = loadStorage(fm)
  const target = "/documents/CTS Dashboard/Data/services-index.json"
  const original = JSON.stringify(INDEX)

  fm.disk.set(target, original)

  const move = fm.move
  fm.move = (from, to) => {
    if (from.includes(".tmp-")) throw new Error("bascule interrompue")
    return move(from, to)
  }

  let thrown = null

  try {
    await STORAGE.writeJsonAtomically(target, { version: 99 }, {
      commitCode: "TEST_COMMIT_FAILED",
      stage: "test"
    })
  } catch (error) {
    thrown = error
  }

  fm.move = move

  if (!thrown) {
    failures.push("bascule interrompue : aucune erreur n'est levée")
  } else if (thrown.telemetryCode !== "TEST_COMMIT_FAILED") {
    failures.push(`bascule interrompue : code « ${thrown.telemetryCode} » inattendu`)
  }

  if (fm.disk.get(target) !== original) {
    failures.push("bascule interrompue : l'ancien contenu n'est pas restauré")
  }

  const leftovers = [...fm.disk.keys()].filter(key => /\.(tmp|rollback)-/.test(key))

  if (leftovers.length) {
    failures.push(`bascule interrompue : ${leftovers.length} fichier(s) temporaire(s) laissé(s)`)
  }
}

if (failures.length) {
  console.log("ÉCHEC  lecture des fichiers iCloud")
  for (const failure of failures) console.log(`         ${failure}`)
  process.exit(1)
}

console.log(
  "ok     lecture des fichiers iCloud " +
  "(iCloud muet, iCloud normal, absent, illisible, sans réponse, aucune attente inutile, " +
  "écriture atomique, bascule interrompue)"
)
