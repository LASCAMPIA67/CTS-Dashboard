/*
 * Test de l'entretien automatique des services.
 *
 * Pendant l'heure qui suit la fin de son service, le conducteur voit
 * encore son écran « Service terminé » — et le widget le lit dans le
 * cache. Le vidage du cache et l'archivage du PDF tombent donc tous deux
 * une heure après la fin : effacer le cache plus tôt couperait cet
 * écran, ou ferait apparaître le service du lendemain en avance.
 *
 * L'archivage ne peut pas non plus dépendre du cache qu'il vient de
 * perdre. C'est un enchaînement de dates que seule une exécution réelle
 * vérifie, et dont l'échec serait silencieux — des PDF qui s'accumulent
 * dans Services sans que personne ne le remarque.
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

/*
 * Les deux délais viennent des fichiers du dépôt, jamais d'une copie :
 * le vidage du cache dans CTS Config, la durée d'affichage d'un service
 * terminé dans CTS Services Manager. Le premier ne doit jamais être plus
 * court que le second, sans quoi le widget perdrait la source de l'écran
 * qu'il est encore censé montrer.
 */
const CACHE_GRACE_MS = loadModule("CTS Config", {
  FileManager: {
    iCloud: () => ({
      documentsDirectory: () => "/docs",
      joinPath: (a, b) => `${a}/${b}`,
      fileExists: () => true,
      createDirectory: () => {},
      isFileDownloaded: () => true
    })
  }
}).pdf.cacheGraceMs

const displayGrace = fs
  .readFileSync(path.join(repository, "CTS Services Manager.js"), "utf8")
  .match(/const SERVICE_DISPLAY_GRACE_MS = ([\d\s*]+)/)

const DISPLAY_GRACE_MS = displayGrace
  ? displayGrace[1]
      .split("*")
      .map(value => Number(value.trim()))
      .reduce((product, value) => product * value, 1)
  : null

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
      cacheGraceMs: CACHE_GRACE_MS,
      archiveGraceMs: HOUR,
      archiveRetentionMs: 7 * DAY
    },
    ensureDirectories: () => {}
  }

  loaded["CTS Storage"] = {
    removeFileQuietly: target => {
      if (files.has(target)) files.delete(target)
    },
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
    appendLog: async () => {},
    buildUniqueToken: () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    /*
     * L'écriture atomique réelle vit dans CTS Storage et c'est
     * storage-smoke qui l'éprouve, bascule interrompue comprise. Ici on
     * n'a besoin que de son effet : le fichier est remplacé, sans reste.
     */
    writeJsonAtomically: async (target, value) => {
      files.set(target, JSON.stringify(value, null, 2))
    }
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

check(
  Number.isFinite(CACHE_GRACE_MS) && Number.isFinite(DISPLAY_GRACE_MS),
  "les délais d'affichage ou de vidage du cache sont introuvables"
)

check(
  CACHE_GRACE_MS >= DISPLAY_GRACE_MS,
  `le cache est vidé après ${CACHE_GRACE_MS / 60000} min alors que le widget ` +
    `affiche encore le service terminé pendant ${DISPLAY_GRACE_MS / 60000} min : ` +
    `l'écran « Service terminé » perdrait sa source avant l'heure`
)

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

  /*
   * Cinquante-neuf minutes après la fin : le conducteur doit encore voir
   * son écran « Service terminé », donc le cache doit encore exister.
   */
  const during = await CLEANER.maintainServices(new Date(endsAt + 59 * MINUTE))

  check(
    files.has(cachePath),
    `${label} : le cache est effacé avant la fin de l'heure d'affichage`
  )
  check(
    during.cacheCleared.length === 0,
    `${label} : le vidage du cache a lieu pendant l'heure d'affichage`
  )

  /* Une heure et deux minutes après la fin : le cache part. */
  const afterEnd = await CLEANER.maintainServices(new Date(endsAt + HOUR + 2 * MINUTE))

  check(!files.has(cachePath), `${label} : le cache survit à l'heure d'affichage`)
  check(!files.has(textPath), `${label} : le texte extrait survit à l'heure d'affichage`)
  check(
    afterEnd.cacheCleared.length === 1,
    `${label} : le vidage du cache n'est pas rapporté`
  )
  check(afterEnd.success, `${label} : l'entretien signale une erreur`)

  /*
   * Le vidage du cache et l'archivage partagent la même échéance : ils
   * ont donc lieu au même passage, le vidage d'abord. C'est le moment
   * où l'archivage casserait s'il cherchait encore l'heure de fin dans
   * le cache qui vient de disparaître.
   */
  check(
    afterEnd.archived.length === 1,
    `${label} : le PDF n'est pas archivé au passage qui vide le cache`
  )
  check(!files.has(pdfPath), `${label} : le PDF est resté dans Services`)

  const archivedName = afterEnd.archived[0]?.fileName

  check(
    Boolean(archivedName) && files.has(`${ARCHIVE}/${archivedName}`),
    `${label} : le PDF archivé est introuvable`
  )

  /* Repassage immédiat : aucune action, aucune erreur. */
  const again = await CLEANER.maintainServices(new Date(endsAt + HOUR + 3 * MINUTE))

  check(
    again.cacheCleared.length === 0,
    `${label} : le cache est revidé à chaque exécution`
  )
  check(again.success, `${label} : le second passage signale une erreur`)

  /* Deux heures après la fin : plus rien à faire, et aucune erreur. */
  const settled = await CLEANER.maintainServices(new Date(endsAt + 2 * HOUR))

  check(
    settled.archived.length === 0 && settled.cacheCleared.length === 0,
    `${label} : l'entretien refait du travail déjà accompli`
  )
  check(settled.success, `${label} : le passage à deux heures signale une erreur`)

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
