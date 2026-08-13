/*
 * Test de l'entretien automatique des services.
 *
 * Le cache d'un service terminé est effacé une minute après sa fin, mais
 * son PDF ne part aux archives qu'une heure plus tard : l'archivage ne
 * doit donc plus dépendre d'un cache qui n'existe plus. C'est un
 * enchaînement de dates que seule une exécution réelle peut vérifier, et
 * dont l'échec serait silencieux — des PDF qui s'accumulent dans
 * Services sans que personne ne le remarque.
 *
 * Le nettoyeur est chargé avec un système de fichiers en mémoire, et
 * rejoué à des instants choisis autour de la fin du service.
 */

import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(here, "..", "..")

const ROOT = "/docs/CTS Dashboard"
const SERVICES = `${ROOT}/Services`
const ARCHIVE = `${SERVICES}/Archive`
const CACHE = `${ROOT}/Cache/Services`
const TEXT_CACHE = `${CACHE}/Text`
const DATA = `${ROOT}/Data`

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function loadModule(name, sandboxExtra = {}) {
  const source = fs.readFileSync(path.join(repository, `${name}.js`), "utf8")
  const module = { exports: {} }

  const sandbox = {
    module,
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Date, Math, JSON, Number, String, Boolean, Array, Object, Set, Map,
    Promise, RegExp, Error, isNaN, parseInt, parseFloat,
    encodeURIComponent, decodeURIComponent, setTimeout,
    Timer: class {
      static schedule(ms, repeats, callback) {
        setTimeout(callback, 0)
        return new this()
      }
      invalidate() {}
    },
    args: { plainTexts: [] },
    UUID: { string: () => Math.random().toString(36).slice(2) },
    importModule: requested => {
      const key = String(requested).replace(/^.*\//, "")
      if (!loaded[key]) throw new Error(`module inattendu : ${key}`)
      return loaded[key]
    },
    ...sandboxExtra
  }

  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: name })
  return module.exports
}

const loaded = {}
loaded["CTS Utils"] = loadModule("CTS Utils")

function buildWorld({ lastEnd, serviceDate }) {
  const files = new Map()

  const fm = {
    joinPath: (a, b) => `${a}/${b}`,
    fileExists: target => files.has(target),
    isFileDownloaded: () => true,
    readString: target => files.get(target) ?? "",
    writeString: (target, content) => files.set(target, String(content)),
    createDirectory: () => {},
    remove: target => files.delete(target),
    move: (from, to) => {
      files.set(to, files.get(from))
      files.delete(from)
    },
    listContents: () => [...files.keys()]
  }

  const id = `${serviceDate}_EA06`
  const stem = `Service_${serviceDate}_EA06`

  files.set(`${SERVICES}/${stem}.pdf`, "%PDF-1.7")
  files.set(
    `${CACHE}/${stem}.json`,
    JSON.stringify({
      date: serviceDate,
      validation: { valid: true },
      slices: [{ end: lastEnd }]
    })
  )
  files.set(`${TEXT_CACHE}/${stem}.txt`, "texte extrait")

  const index = {
    version: 1,
    updatedAt: "",
    services: [
      {
        id,
        date: serviceDate,
        service: "EA06",
        pdfFile: `${stem}.pdf`,
        cacheFile: `${stem}.json`,
        textFile: `${stem}.txt`,
        lastEnd,
        firstDutyStart: "05:30"
      }
    ]
  }

  files.set(`${DATA}/services-index.json`, JSON.stringify(index))

  loaded["CTS Config"] = {
    fm,
    paths: {
      root: ROOT,
      data: DATA,
      services: SERVICES,
      servicesArchive: ARCHIVE,
      servicesCache: CACHE,
      servicesTextCache: TEXT_CACHE
    },
    files: { servicesIndex: `${DATA}/services-index.json` },
    pdf: {
      cacheGraceMs: MINUTE,
      archiveGraceMs: HOUR,
      archiveRetentionMs: 7 * DAY
    },
    ensureDirectories: () => {}
  }

  loaded["CTS Storage"] = {
    readJson: async (target, fallback = null) => {
      const content = files.get(target)
      if (!content) return fallback
      try {
        return JSON.parse(content)
      } catch (_) {
        return fallback
      }
    },
    ensureDownloaded: async () => true,
    appendLog: async () => {}
  }

  loaded["CTS Importer"] = {
    readCurrentIndex: async () =>
      JSON.parse(files.get(`${DATA}/services-index.json`))
  }

  const CLEANER = loadModule("CTS Services Cleaner")

  return { files, fm, CLEANER, stem }
}

const failures = []

function check(condition, message) {
  if (!condition) failures.push(message)
}

/*
 * Service du 14 août terminé à 16:55. Chaque instant est joué sur un
 * monde neuf, sauf la séquence finale, qui rejoue le même monde pour
 * vérifier que l'enchaînement tient.
 */
async function scenario(label, { lastEnd, serviceDate, endsAt }) {
  const world = buildWorld({ lastEnd, serviceDate })
  const { files, CLEANER, stem } = world

  const cachePath = `${CACHE}/${stem}.json`
  const textPath = `${TEXT_CACHE}/${stem}.txt`
  const pdfPath = `${SERVICES}/${stem}.pdf`

  /* Une minute avant la fin : rien ne doit bouger. */
  await CLEANER.maintainServices(new Date(endsAt - MINUTE))

  check(files.has(cachePath), `${label} : le cache a été effacé avant la fin du service`)
  check(files.has(pdfPath), `${label} : le PDF a été archivé avant la fin du service`)

  /* Deux minutes après la fin : le cache part, le PDF reste. */
  const afterEnd = await CLEANER.maintainServices(new Date(endsAt + 2 * MINUTE))

  check(!files.has(cachePath), `${label} : le cache survit à la fin du service`)
  check(!files.has(textPath), `${label} : le texte extrait survit à la fin du service`)
  check(files.has(pdfPath), `${label} : le PDF a été archivé trop tôt`)
  check(
    afterEnd.cacheCleared.length === 1,
    `${label} : le vidage du cache n'est pas rapporté`
  )
  check(afterEnd.success, `${label} : l'entretien signale une erreur`)

  /* Repassage immédiat : aucune action, aucune erreur. */
  const again = await CLEANER.maintainServices(new Date(endsAt + 3 * MINUTE))

  check(
    again.cacheCleared.length === 0,
    `${label} : le cache est revidé à chaque exécution`
  )
  check(again.success, `${label} : le second passage signale une erreur`)

  /*
   * Deux heures après la fin, le cache n'existe plus depuis longtemps :
   * l'archivage doit néanmoins avoir lieu. C'est le point qui casserait
   * en silence si l'heure de fin était encore lue dans le cache.
   */
  const archived = await CLEANER.maintainServices(new Date(endsAt + 2 * HOUR))

  check(
    archived.archived.length === 1,
    `${label} : le PDF n'est pas archivé une fois le cache effacé`
  )
  check(!files.has(pdfPath), `${label} : le PDF est resté dans Services`)

  const archivedName = archived.archived[0]?.fileName
  check(
    Boolean(archivedName) && files.has(`${ARCHIVE}/${archivedName}`),
    `${label} : le PDF archivé est introuvable`
  )

  /* Huit jours plus tard, l'archive est supprimée. */
  const removed = await CLEANER.maintainServices(new Date(endsAt + 8 * DAY))

  check(
    removed.deleted.length === 1,
    `${label} : l'archive n'est pas supprimée après la rétention`
  )
  check(
    !files.has(`${ARCHIVE}/${archivedName}`),
    `${label} : le fichier archivé est resté sur le disque`
  )
}

await scenario("service ordinaire", {
  serviceDate: "2026-08-14",
  lastEnd: "16:55",
  endsAt: new Date(2026, 7, 14, 16, 55).getTime()
})

/*
 * Un service peut se terminer après minuit : HASTUS écrit 24:48, et la
 * fin réelle tombe le lendemain à 00:48. Traiter cette heure comme une
 * heure ordinaire effacerait le cache seize heures trop tôt, en plein
 * service.
 */
await scenario("service après minuit", {
  serviceDate: "2026-08-14",
  lastEnd: "24:48",
  endsAt: new Date(2026, 7, 15, 0, 48).getTime()
})

if (failures.length) {
  console.log("ÉCHEC  entretien automatique des services")
  for (const failure of [...new Set(failures)]) console.log(`         ${failure}`)
  process.exit(1)
}

console.log(
  `ok     entretien automatique des services ` +
    `(2 scénarios, vidage du cache, archivage et rétention)`
)
