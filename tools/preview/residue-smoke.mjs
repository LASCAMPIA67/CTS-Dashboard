/*
 * Balayage des restes d'écriture.
 *
 * Une écriture atomique passe par un temporaire puis par une copie de
 * sécurité. iOS peut arrêter un widget entre deux déplacements, et le
 * jeton unique du nom fait qu'aucune écriture suivante ne repassera par
 * là : le reste s'installe pour de bon.
 *
 * Le point délicat n'est pas de les effacer, c'est de savoir lesquels.
 * Entre le déplacement du fichier vers « .rollback » et l'arrivée du
 * temporaire à sa place, la copie de sécurité est le seul exemplaire
 * des données. Ce banc vérifie donc surtout ce que le balayage NE
 * supprime PAS : une copie de sécurité orpheline, un reste trop récent,
 * un fichier dont l'âge est illisible, et tout ce qui ne porte pas une
 * de nos extensions de travail.
 */

import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(here, "..", "..")

const ROOT = "/docs/CTS Dashboard"
const DATA = `${ROOT}/Data`
const DATABASE = `${ROOT}/Database`
const CACHE = `${ROOT}/Cache/Services`
const TEXT_CACHE = `${CACHE}/Text`
const ENGINE = `${ROOT}/Libraries/PDF`
const SERVICES = `${ROOT}/Services`
const ARCHIVE = `${SERVICES}/Archive`

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const NOW = new Date("2026-08-22T12:00:00.000Z")
const OLD = new Date(NOW.getTime() - 3 * HOUR)
const RECENT = new Date(NOW.getTime() - 5 * MINUTE)
const ANCIENT = new Date(NOW.getTime() - 30 * DAY)

const failures = []
const loaded = {}

function check(condition, message) {
  if (!condition) failures.push(message)
}

/*
 * Un disque en mémoire où chaque fichier porte une date de
 * modification, puisque c'est elle qui décide de l'âge d'un reste.
 */
function createDisk() {
  const files = new Map()

  return {
    files,
    put(target, content, modifiedAt = OLD) {
      files.set(target, { content: String(content), modifiedAt })
    },
    has: target => files.has(target),
    isDirectory: target => [...files.keys()].some(key => key.startsWith(`${target}/`)),
    names(directory) {
      const prefix = `${directory}/`

      return [...files.keys()]
        .filter(key => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"))
        .map(key => key.slice(prefix.length))
    }
  }
}

function loadCleaner(disk, { readableDates = true } = {}) {
  const fm = {
    joinPath: (parent, child) => `${parent}/${child}`,
    fileExists: target => disk.has(target) || disk.isDirectory(target),
    isDirectory: target => !disk.has(target) && disk.isDirectory(target),
    isFileDownloaded: () => true,
    readString: target => disk.files.get(target)?.content ?? "",
    writeString: (target, content) => disk.put(target, content, NOW),
    createDirectory: () => {},
    remove: target => disk.files.delete(target),
    move: (from, to) => {
      disk.files.set(to, disk.files.get(from))
      disk.files.delete(from)
    },
    listContents: directory => disk.names(directory),
    modificationDate: target => {
      if (!readableDates) throw new Error("date illisible")
      return disk.files.get(target)?.modifiedAt ?? null
    }
  }

  loaded["CTS Config"] = {
    fm,
    paths: {
      root: ROOT,
      data: DATA,
      database: DATABASE,
      services: SERVICES,
      servicesArchive: ARCHIVE,
      servicesCache: CACHE,
      servicesTextCache: TEXT_CACHE,
      pdfEngine: ENGINE
    },
    files: { servicesIndex: `${DATA}/services-index.json` },
    pdf: {
      cacheGraceMs: HOUR,
      archiveGraceMs: HOUR,
      archiveRetentionMs: 7 * DAY,
      residueGraceMs: HOUR,
      residueSweepIntervalMs: 6 * HOUR
    },
    residueDirectories: [DATA, DATABASE, CACHE, TEXT_CACHE, ENGINE],
    ensureDirectories: () => {}
  }

  loaded["CTS Storage"] = {
    removeFileQuietly: target => disk.files.delete(target),
    readJson: async (target, fallback = null) => {
      const entry = disk.files.get(target)
      if (!entry) return fallback
      try {
        return JSON.parse(entry.content)
      } catch (_) {
        return fallback
      }
    },
    ensureDownloaded: async () => true,
    appendLog: async () => {},
    buildUniqueToken: () => "1-aaaa",
    safeModificationDate: target => {
      try {
        const value = fm.modificationDate(target)
        return value && Number.isFinite(value.getTime()) ? value : null
      } catch (_) {
        return null
      }
    },
    writeJsonAtomically: async (target, value) => {
      disk.put(target, JSON.stringify(value, null, 2), NOW)
    }
  }

  /* Comme le vrai : l'index vient du disque, pas d'une copie figée. */
  loaded["CTS Importer"] = {
    readCurrentIndex: async () => {
      const entry = disk.files.get(`${DATA}/services-index.json`)
      const value = entry ? JSON.parse(entry.content) : null

      return {
        version: Number(value?.version) || 2,
        updatedAt: String(value?.updatedAt || ""),
        services: Array.isArray(value?.services) ? value.services : []
      }
    }
  }

  const source = fs.readFileSync(path.join(repository, "CTS Services Cleaner.js"), "utf8")
  const module = { exports: {} }

  const sandbox = {
    module,
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Date, Math, JSON, Number, String, Boolean, Array, Object, Set, Map,
    Promise, RegExp, Error, isNaN, parseInt, parseFloat, setTimeout,
    config: { runsInWidget: true },
    args: { plainTexts: [] },
    importModule: name => {
      const key = String(name).replace(/^.*\//, "")
      if (!loaded[key]) throw new Error(`module inattendu : ${key}`)
      return loaded[key]
    }
  }

  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: "CTS Services Cleaner" })

  return module.exports
}

loaded["CTS Utils"] = (() => {
  const source = fs.readFileSync(path.join(repository, "CTS Utils.js"), "utf8")
  const module = { exports: {} }
  const sandbox = {
    module,
    Date, Math, JSON, Number, String, Boolean, Array, Object, Set, Map,
    Promise, RegExp, Error, isNaN, parseInt, parseFloat, setTimeout,
    config: { runsInWidget: true },
    args: { plainTexts: [] },
    console: { log: () => {} }
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: "CTS Utils" })
  return module.exports
})()

/*
 * Test 1 — ce qui doit disparaître.
 *
 * Un temporaire n'est jamais l'exemplaire unique : soit l'original tient
 * sa place, soit la copie de sécurité le protège, soit le fichier
 * n'avait encore jamais existé.
 */
{
  const disk = createDisk()

  disk.put(`${DATA}/services-index.json`, "{}")
  disk.put(`${DATA}/services-index.json.tmp-1755000000000-ab12cd34`, "{}")
  disk.put(`${DATA}/services-index.json.rollback-1755000000000-ab12cd34`, "{}")
  disk.put(`${DATA}/import-log.json.tmp`, "[]")
  disk.put(`${DATA}/import-log.json`, "[]")
  disk.put(`${DATA}/.cts-diagnostic-1755000000000.tmp`, "CTS")
  disk.put(`${DATABASE}/lines.json`, "{}")
  disk.put(`${DATABASE}/lines.json.rollback`, "{}")
  disk.put(`${CACHE}/Service_2026-08-20_EA05.json`, "{}")
  disk.put(`${CACHE}/Service_2026-08-20_EA05.json.tmp-1755000000000-ef56gh78`, "{}")
  disk.put(`${TEXT_CACHE}/Service_2026-08-20_EA05.txt.rollback-1755000000000-ij90kl12`, "x")
  disk.put(`${TEXT_CACHE}/Service_2026-08-20_EA05.txt`, "x")
  disk.put(`${ENGINE}/pdf.min.mjs`, "lib")
  disk.put(`${ENGINE}/pdf.min.mjs.download`, "lib")

  const CLEANER = loadCleaner(disk)
  const result = await CLEANER.maintainServices(NOW)
  const removed = result.residue.removed.map(item => item.fileName).sort()

  check(result.residue !== null, "aucun balayage n'a eu lieu")

  for (const name of [
    "services-index.json.tmp-1755000000000-ab12cd34",
    "services-index.json.rollback-1755000000000-ab12cd34",
    "import-log.json.tmp",
    ".cts-diagnostic-1755000000000.tmp",
    "lines.json.rollback",
    "Service_2026-08-20_EA05.json.tmp-1755000000000-ef56gh78",
    "Service_2026-08-20_EA05.txt.rollback-1755000000000-ij90kl12",
    "pdf.min.mjs.download"
  ]) {
    check(removed.includes(name), `« ${name} » aurait dû être effacé`)
  }

  for (const kept of [
    `${DATA}/services-index.json`,
    `${DATA}/import-log.json`,
    `${DATABASE}/lines.json`,
    `${CACHE}/Service_2026-08-20_EA05.json`,
    `${TEXT_CACHE}/Service_2026-08-20_EA05.txt`,
    `${ENGINE}/pdf.min.mjs`
  ]) {
    check(disk.has(kept), `« ${kept} » a été effacé alors qu'il est le fichier réel`)
  }
}

/*
 * Test 2 — la copie de sécurité orpheline.
 *
 * L'original manque : cette copie est peut-être le dernier état lisible
 * du fichier. Elle est conservée et signalée, jamais supprimée. Même
 * chose pour un téléchargement partiel dont la destination manque.
 */
{
  const disk = createDisk()

  disk.put(`${DATA}/services-index.json.rollback-1755000000000-ab12cd34`, '{"services":[]}')
  disk.put(`${ENGINE}/pdf.worker.min.mjs.download`, "worker")

  const CLEANER = loadCleaner(disk)
  const result = await CLEANER.maintainServices(NOW)
  const preserved = result.residue.preserved

  check(
    disk.has(`${DATA}/services-index.json.rollback-1755000000000-ab12cd34`),
    "la copie de sécurité orpheline de l'index a été supprimée"
  )
  check(
    disk.has(`${ENGINE}/pdf.worker.min.mjs.download`),
    "le téléchargement partiel du worker a été supprimé alors que le fichier manque"
  )
  check(
    preserved.filter(item => item.reason === "original-missing").length === 2,
    "les fichiers conservés ne sont pas signalés comme orphelins"
  )
  check(
    result.residue.removed.length === 0,
    "un fichier a été effacé alors qu'aucun n'était prouvé inutile"
  )
}

/* Test 3 — un reste trop récent peut appartenir à une écriture en cours. */
{
  const disk = createDisk()

  disk.put(`${DATA}/services-index.json`, "{}")
  disk.put(`${DATA}/services-index.json.tmp-1755000000000-ab12cd34`, "{}", RECENT)

  const CLEANER = loadCleaner(disk)
  const result = await CLEANER.maintainServices(NOW)

  check(
    disk.has(`${DATA}/services-index.json.tmp-1755000000000-ab12cd34`),
    "un reste vieux de cinq minutes a été effacé"
  )
  check(
    result.residue.preserved.some(item => item.reason === "too-recent"),
    "le reste récent n'est pas signalé comme tel"
  )
}

/*
 * Un reste écarté pour cause de jeunesse n'est pas une anomalie : il
 * partira tout seul au balayage suivant. Le diagnostic ne doit donc pas
 * le compter comme un fichier conservé faute de preuve.
 */
{
  const disk = createDisk()
  const statePath = `${DATA}/services-cleanup-state.json`

  disk.put(`${DATA}/services-index.json`, "{}")
  disk.put(`${DATA}/services-index.json.tmp-1755000000000-ab12cd34`, "{}", RECENT)
  disk.put(`${DATA}/import-log.json.rollback-1755000000000-ef56gh78`, "[]")

  const CLEANER = loadCleaner(disk)
  await CLEANER.maintainServices(NOW)

  const state = JSON.parse(disk.files.get(statePath).content)

  check(
    state.lastResidue.preserved === 1,
    `le diagnostic annonce ${state.lastResidue.preserved} fichier(s) conservé(s) au lieu d'un seul`
  )
}

/* Test 4 — âge illisible : on ne peut rien prouver, donc on conserve. */
{
  const disk = createDisk()

  disk.put(`${DATA}/services-index.json`, "{}")
  disk.put(`${DATA}/services-index.json.tmp-1755000000000-ab12cd34`, "{}")

  const CLEANER = loadCleaner(disk, { readableDates: false })
  const result = await CLEANER.maintainServices(NOW)

  check(
    disk.has(`${DATA}/services-index.json.tmp-1755000000000-ab12cd34`),
    "un reste sans date lisible a été effacé"
  )
  check(
    result.residue.preserved.some(item => item.reason === "age-unknown"),
    "le reste sans date n'est pas signalé"
  )
}

/*
 * Test 5 — tout ce qui n'est pas un reste doit être laissé tranquille,
 * y compris les verrous, qui ont leur propre durée de vie.
 */
{
  const disk = createDisk()

  const untouched = [
    `${DATA}/services-index.json`,
    `${DATA}/services-scan-state.json`,
    `${DATA}/preferences.json`,
    `${DATA}/services-scan.lock`,
    `${DATABASE}/places.json`,
    `${CACHE}/Service_2026-08-20_EA05.json`,
    `${ENGINE}/pdf.worker.min.mjs`
  ]

  for (const target of untouched) disk.put(target, "{}", ANCIENT)

  disk.put(
    `${DATA}/services-index.json`,
    JSON.stringify({
      version: 2,
      updatedAt: "",
      services: [
        {
          id: "2026-08-20_EA05",
          date: "2026-08-20",
          service: "EA05",
          cacheFile: "Service_2026-08-20_EA05.json"
        }
      ]
    }),
    ANCIENT
  )

  const CLEANER = loadCleaner(disk)
  await CLEANER.maintainServices(NOW)

  for (const target of untouched) {
    check(disk.has(target), `« ${target} » a été effacé par le balayage`)
  }
}

/*
 * Test 6 — les PDF supplantés d'un service réimporté.
 *
 * Ils ne sont référencés nulle part et vivent dans le dossier Archive,
 * dont la règle est déjà une rétention de sept jours. Avant l'échéance
 * ils restent ; après, ils partent.
 */
{
  const disk = createDisk()

  disk.put(
    `${ARCHIVE}/Remplace_20260815T040000Z_Service_2026-08-15_EA05.pdf`,
    "%PDF",
    ANCIENT
  )
  disk.put(
    `${ARCHIVE}/Remplace_20260822T040000Z_Service_2026-08-22_EA07.pdf`,
    "%PDF",
    new Date(NOW.getTime() - 2 * DAY)
  )
  disk.put(`${ARCHIVE}/Service_2026-08-01_EA01.pdf`, "%PDF", ANCIENT)

  const CLEANER = loadCleaner(disk)
  await CLEANER.maintainServices(NOW)

  check(
    !disk.has(`${ARCHIVE}/Remplace_20260815T040000Z_Service_2026-08-15_EA05.pdf`),
    "un PDF supplanté vieux de trente jours n'a pas été effacé"
  )
  check(
    disk.has(`${ARCHIVE}/Remplace_20260822T040000Z_Service_2026-08-22_EA07.pdf`),
    "un PDF supplanté vieux de deux jours a été effacé avant l'échéance"
  )
  check(
    disk.has(`${ARCHIVE}/Service_2026-08-01_EA01.pdf`),
    "une archive régulière a été effacée par la règle des PDF supplantés"
  )
}

/*
 * Test 7 — le balayage est espacé.
 *
 * Il parcourt cinq dossiers ; le refaire à chaque réveil du widget
 * coûterait pour rien. La date du dernier passage est gardée dans
 * l'état d'entretien, et c'est elle qui décide.
 */
{
  const disk = createDisk()

  disk.put(`${DATA}/services-index.json`, "{}")

  const CLEANER = loadCleaner(disk)

  const first = await CLEANER.maintainServices(NOW)
  const soon = await CLEANER.maintainServices(new Date(NOW.getTime() + HOUR))
  const later = await CLEANER.maintainServices(new Date(NOW.getTime() + 7 * HOUR))

  check(first.residue !== null, "le premier passage n'a pas balayé")
  check(soon.residue === null, "le balayage a été refait une heure plus tard")
  check(later.residue !== null, "le balayage n'a pas repris après six heures")
}

/*
 * Test 8 — l'état d'entretien n'est pas réécrit pour rien.
 *
 * Rien à archiver, rien à balayer : iCloud ne doit pas travailler. Le
 * fichier ne bouge donc pas avant l'heure de battement.
 */
{
  const disk = createDisk()
  const statePath = `${DATA}/services-cleanup-state.json`

  disk.put(`${DATA}/services-index.json`, "{}")

  const CLEANER = loadCleaner(disk)

  await CLEANER.maintainServices(NOW)

  const afterFirst = disk.files.get(statePath).content

  disk.files.get(statePath).modifiedAt = NOW
  await CLEANER.maintainServices(new Date(NOW.getTime() + 10 * MINUTE))

  check(
    disk.files.get(statePath).content === afterFirst,
    "l'état d'entretien a été réécrit alors que rien n'avait changé"
  )
}

/*
 * Test 9 — l'oubli des services entièrement liquidés.
 *
 * L'index est relu à chaque réveil du widget. Une entrée qui ne désigne
 * plus aucun fichier ne peut plus rien apprendre à personne : ni au
 * balayage, ni au scanner, ni au widget. Elle part. Tout le reste — un
 * PDF encore là, une archive encore là, un cache encore là, une date
 * trop récente, une liquidation inachevée — reste.
 */
{
  const disk = createDisk()

  const entry = (id, extra = {}) => ({
    id,
    date: id.slice(0, 10),
    service: id.slice(11),
    pdfFile: `Service_${id}.pdf`,
    cacheFile: `Service_${id}.json`,
    textFile: `Service_${id}.txt`,
    archive: { fileName: `Service_${id}.pdf`, archivedAt: "", deletedAt: "2026-08-01T00:00:00.000Z" },
    cache: { clearedAt: "2026-08-01T00:00:00.000Z" },
    ...extra
  })

  const services = [
    entry("2026-07-01_EA01"),
    entry("2026-07-02_EA02"),
    entry("2026-07-03_EA03"),
    entry("2026-07-04_EA04"),
    entry("2026-08-20_EA05"),
    entry("2026-07-05_EA06", { archive: { fileName: "x.pdf", archivedAt: "", deletedAt: "" } }),
    entry("2026-07-06_EA07", { cache: { clearedAt: "" } })
  ]

  disk.put(`${DATA}/services-index.json`, JSON.stringify({ version: 2, updatedAt: "", services }))
  disk.put(`${SERVICES}/Service_2026-07-02_EA02.pdf`, "%PDF")
  disk.put(`${ARCHIVE}/Service_2026-07-03_EA03.pdf`, "%PDF")
  disk.put(`${CACHE}/Service_2026-07-04_EA04.json`, "{}")

  const CLEANER = loadCleaner(disk)
  const result = await CLEANER.maintainServices(NOW)

  check(
    result.forgotten.join(",") === "2026-07-01_EA01",
    `oubli inattendu : « ${result.forgotten.join(", ")} »`
  )

  const remaining = JSON.parse(disk.files.get(`${DATA}/services-index.json`).content)

  check(remaining.services.length === 6, "l'index n'a pas été réécrit sans l'entrée oubliée")
}

/*
 * Test 10 — les caches sans entrée d'index.
 *
 * Ils ne sont plus atteignables. Mais un index absent n'est pas un
 * index vide : il peut être en reconstruction, et le cache servira. On
 * ne balaie donc rien tant que le fichier d'index n'existe pas, ni
 * avant la rétention.
 */
{
  const disk = createDisk()

  disk.put(
    `${DATA}/services-index.json`,
    JSON.stringify({
      version: 2,
      updatedAt: "",
      services: [
        {
          id: "2026-08-20_EA05",
          date: "2026-08-20",
          service: "EA05",
          cacheFile: "Service_2026-08-20_EA05.json",
          textFile: "Service_2026-08-20_EA05.txt"
        }
      ]
    })
  )

  disk.put(`${CACHE}/Service_2026-08-20_EA05.json`, "{}", ANCIENT)
  disk.put(`${CACHE}/Service_2026-01-01_EA99.json`, "{}", ANCIENT)
  disk.put(`${TEXT_CACHE}/Service_2026-01-01_EA99.txt`, "x", ANCIENT)
  disk.put(`${TEXT_CACHE}/Service_2026-08-21_EA06.txt`, "x", new Date(NOW.getTime() - 2 * DAY))

  const CLEANER = loadCleaner(disk)

  await CLEANER.maintainServices(NOW)

  check(
    disk.has(`${CACHE}/Service_2026-08-20_EA05.json`),
    "un cache nommé par l'index a été effacé"
  )
  check(
    !disk.has(`${CACHE}/Service_2026-01-01_EA99.json`),
    "un cache orphelin de janvier n'a pas été effacé"
  )
  check(
    !disk.has(`${TEXT_CACHE}/Service_2026-01-01_EA99.txt`),
    "un texte orphelin de janvier n'a pas été effacé"
  )
  check(
    disk.has(`${TEXT_CACHE}/Service_2026-08-21_EA06.txt`),
    "un cache orphelin vieux de deux jours a été effacé avant la rétention"
  )
}

/* Sans fichier d'index, rien n'est touché : il peut être en reconstruction. */
{
  const disk = createDisk()

  disk.put(`${CACHE}/Service_2026-01-01_EA99.json`, "{}", ANCIENT)

  const CLEANER = loadCleaner(disk)

  await CLEANER.maintainServices(NOW)

  check(
    disk.has(`${CACHE}/Service_2026-01-01_EA99.json`),
    "un cache a été effacé alors que l'index n'existe pas"
  )
}

/* Le classement des noms, isolé du reste. */
{
  const disk = createDisk()
  const { classifyResidue } = loadCleaner(disk)

  const expected = [
    ["services-index.json.tmp-1755000000000-ab12cd34", "temp"],
    ["services-index.json.tmp", "temp"],
    ["services-index.json.rollback-1755000000000-ab12cd34", "rollback"],
    ["services-index.json.rollback", "rollback"],
    ["pdf.min.mjs.download", "download"],
    [".cts-diagnostic-1755000000000.tmp", "diagnostic"],
    ["services-index.json", null],
    ["services-scan.lock", null],
    ["Service_2026-08-20_EA05.pdf", null],
    ["Remplace_20260815T040000Z_Service_2026-08-15_EA05.pdf", null]
  ]

  for (const [name, kind] of expected) {
    const found = classifyResidue(name)

    check(
      (found?.kind ?? null) === kind,
      `« ${name} » classé « ${found?.kind ?? "aucun"} » au lieu de « ${kind ?? "aucun"} »`
    )
  }

  check(
    classifyResidue("services-index.json.rollback-1755000000000-ab12cd34").baseName ===
      "services-index.json",
    "le fichier d'origine n'est pas déduit du nom de la copie de sécurité"
  )
}

if (failures.length) {
  console.log("ÉCHEC  balayage des restes d’écriture")
  for (const failure of failures) console.log(`         ${failure}`)
  process.exit(1)
}

console.log(
  "ok     balayage des restes d’écriture " +
  "(temporaires, copies orphelines conservées, reste récent, âge illisible, " +
  "fichiers réels intacts, PDF supplantés, caches orphelins, index borné, " +
  "espacement, écriture d’état)"
)
