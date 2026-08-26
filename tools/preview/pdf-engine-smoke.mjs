/*
 * Préparation du moteur PDF.
 *
 * ensureReady() est la première instruction de toute lecture de carte
 * agent. Ce qui échoue ici n'échoue pas dans un coin : le PDF n'est pas lu,
 * aucun service n'est affiché, et le widget reste muet.
 *
 * Ce banc existe à cause d'un défaut réel. engine.json, écrit là et lu par
 * personne — ni le widget, ni le Diagnostic, ni l'installateur — levait une
 * erreur quand il ne pouvait pas s'écrire. Un collègue dont ce seul fichier
 * résistait n'a jamais pu lire une seule carte agent : 132 tentatives, 132
 * échecs, pour un fichier que rien n'ouvre.
 *
 * Deux règles en découlent, et ce banc les tient : ce qui ne sert à
 * personne ne doit arrêter personne, et des métadonnées d'installation ne
 * s'écrivent qu'à l'installation — pas à chaque réveil du widget. La
 * troisième borne le reste : ce dont le moteur dépend vraiment continue,
 * lui, d'arrêter tout.
 */

import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(here, "..", "..")

const DOCS = "/documents"
const ENGINE = `${DOCS}/CTS Dashboard/Libraries/PDF`
const LIBRARY = `${ENGINE}/pdf.min.mjs`
const WORKER = `${ENGINE}/pdf.worker.min.mjs`
const METADATA = `${ENGINE}/engine.json`

/*
 * Le moteur juge une bibliothèque sur sa taille : en deçà de 40 ko, il la
 * refuse. Les doublures raisonnent donc en kilo-octets, comme Scriptable.
 */
const VALID_SIZE_KB = 400
const TRUNCATED_SIZE_KB = 1

function buildWorld({
  librariesPresent = true,
  metadataWriteFails = false,
  downloadSizeKb = VALID_SIZE_KB,
  shrinkOnMove = false
} = {}) {
  const disk = new Map()
  const written = []
  const downloads = []

  if (librariesPresent) {
    disk.set(LIBRARY, VALID_SIZE_KB)
    disk.set(WORKER, VALID_SIZE_KB)
  }

  const fm = {
    joinPath: (a, b) => `${a}/${b}`,
    documentsDirectory: () => DOCS,
    fileExists: target => disk.has(target),
    createDirectory: () => {},
    isFileDownloaded: () => true,
    downloadFileFromiCloud: async () => {},
    fileSize: target => disk.get(target) ?? 0,
    write: (target, data) => disk.set(target, Number(data?.sizeKilobytes) || 0),
    writeString: (target, content) => {
      if (metadataWriteFails && target === METADATA) {
        throw new Error("iCloud a refusé l’écriture")
      }

      written.push(target)
      disk.set(target, Math.max(1, Math.round(String(content).length / 1024)))
    },
    move: (from, to) => {
      /*
       * Le téléchargement était de bonne taille, le fichier posé ne l'est
       * pas : iCloud n'a pas matérialisé ce qu'il a accepté. Seul un
       * contrôle après la bascule le voit.
       */
      disk.set(to, shrinkOnMove ? TRUNCATED_SIZE_KB : disk.get(from))
      disk.delete(from)
    },
    remove: target => disk.delete(target)
  }

  const loaded = {}

  const load = name => {
    const module = { exports: {} }

    const sandbox = {
      module,
      console: { log: () => {}, warn: () => {}, error: () => {} },
      Date, Math, JSON, Number, String, Boolean, Array, Object, Set, Map,
      Promise, RegExp, Error, isNaN, parseInt, parseFloat,
      encodeURIComponent, decodeURIComponent,
      config: { runsInWidget: true },
      args: { plainTexts: [], shortcutParameter: null },
      Timer: class {
        static schedule(milliseconds, repeats, callback) {
          setTimeout(callback, 0)
          return new this()
        }
        invalidate() {}
      },
      /*
       * Le téléchargement rend un objet dont seule la taille compte ici :
       * c'est ce que le moteur mesure après l'avoir écrit.
       */
      Request: class {
        constructor(url) {
          this.url = url
          this.response = { statusCode: 200 }
        }
        async load() {
          downloads.push(this.url)
          return { sizeKilobytes: downloadSizeKb }
        }
      },
      FileManager: { iCloud: () => fm, local: () => fm },
      importModule: dependency => loaded[dependency]
    }

    vm.createContext(sandbox)
    vm.runInContext(fs.readFileSync(path.join(repository, `${name}.js`), "utf8"), sandbox, {
      filename: name
    })

    loaded[name] = module.exports

    return module.exports
  }

  load("CTS Config")
  load("CTS Utils")

  return { engine: load("CTS PDF Engine"), disk, written, downloads }
}

const failures = []

async function attempt(world) {
  try {
    return { result: await world.engine.ensureReady(), error: null }
  } catch (error) {
    return { result: null, error }
  }
}

/*
 * Le cas du collègue : bibliothèques en place, engine.json impossible à
 * écrire. La lecture doit se préparer normalement.
 */
{
  const world = buildWorld({ metadataWriteFails: true })
  const { result, error } = await attempt(world)

  if (error) {
    failures.push(
      `un fichier que personne ne lit a interrompu la préparation : ${error.message || error}`
    )
  } else if (!result?.ready) {
    failures.push("le moteur ne se déclare pas prêt alors que ses deux fichiers sont valides")
  }
}

/*
 * Et il n'est même pas tenté : rien n'a été installé, il n'y a donc rien à
 * documenter. C'est ce qui rend le cas précédent impossible à revivre.
 */
{
  const world = buildWorld()

  await attempt(world)

  if (world.written.includes(METADATA)) {
    failures.push(
      "engine.json est réécrit à chaque lecture, sans qu’aucune installation ait eu lieu"
    )
  }

  if (world.downloads.length) {
    failures.push(`des bibliothèques valides ont été retéléchargées : ${world.downloads.length}`)
  }
}

/*
 * Installation neuve : là, il y a bien quelque chose à documenter.
 */
{
  const world = buildWorld({ librariesPresent: false })
  const { error } = await attempt(world)

  if (error) {
    failures.push(`installation neuve refusée : ${error.message || error}`)
  }

  if (world.downloads.length !== 2) {
    failures.push(`installation neuve : ${world.downloads.length} téléchargement(s), deux attendus`)
  }

  if (!world.written.includes(METADATA) || !world.disk.has(METADATA)) {
    failures.push("une installation neuve ne laisse aucune trace de la version du moteur")
  }
}

/*
 * Installation neuve dont les métadonnées résistent : les bibliothèques
 * sont en place, c'est tout ce qui compte.
 */
{
  const world = buildWorld({ librariesPresent: false, metadataWriteFails: true })
  const { result, error } = await attempt(world)

  if (error) {
    failures.push(
      `une installation réussie a été annulée par ses métadonnées : ${error.message || error}`
    )
  } else if (!result?.ready) {
    failures.push("moteur installé mais déclaré non prêt à cause de ses métadonnées")
  }

  if (!world.disk.has(LIBRARY) || !world.disk.has(WORKER)) {
    failures.push("les bibliothèques n’ont pas survécu à l’échec des métadonnées")
  }
}

/*
 * La contrepartie : ce dont le moteur dépend vraiment continue d'arrêter
 * tout. Une bibliothèque servie tronquée ne doit jamais passer pour
 * installée — sans quoi l'indulgence accordée aux métadonnées se serait
 * étendue à ce qui compte.
 */
{
  const world = buildWorld({ librariesPresent: false, downloadSizeKb: TRUNCATED_SIZE_KB })
  const { error } = await attempt(world)

  if (!error) {
    failures.push("une bibliothèque tronquée a été acceptée comme installée")
  }
}

/*
 * Et la même chose une bascule plus tard : la réponse était de bonne
 * taille, le fichier posé ne l'est pas. Le contrôle d'après l'écriture est
 * le seul à pouvoir le dire.
 */
{
  const world = buildWorld({ librariesPresent: false, shrinkOnMove: true })
  const { error } = await attempt(world)

  if (!error) {
    failures.push("une bibliothèque posée incomplète a été acceptée comme installée")
  }
}

if (failures.length) {
  console.log("ÉCHEC  préparation du moteur PDF")
  for (const failure of failures) console.log(`         ${failure}`)
  process.exit(1)
}

console.log(
  "ok     préparation du moteur PDF (métadonnées jamais bloquantes, écrites à " +
  "l’installation seulement, bibliothèques toujours contrôlées)"
)
