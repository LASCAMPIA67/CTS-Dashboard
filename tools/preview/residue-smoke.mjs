import { importFrom, isolatedModule } from "./sandbox.mjs"

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
    acquireDeviceLock: () => ({ acquired: true, token: "verrou" }),
    releaseDeviceLock: () => {},
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
    },
    uniqueArchiveFileName: name => name,
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

  return isolatedModule("CTS Services Cleaner", {
    importModule: importFrom(loaded),
    globals: { setTimeout, config: { runsInWidget: true } }
  })
}

loaded["CTS Utils"] = isolatedModule("CTS Utils", {
  globals: { setTimeout, config: { runsInWidget: true } }
})

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

{
  const disk = createDisk()

  disk.put(`${ENGINE}/pdf.worker.min.mjs.download`, "worker")

  const CLEANER = loadCleaner(disk)
  const result = await CLEANER.maintainServices(NOW)

  check(
    disk.has(`${ENGINE}/pdf.worker.min.mjs.download`),
    "le téléchargement partiel du worker a été supprimé alors que le fichier manque"
  )
  check(
    result.residue.preserved.some(item => item.reason === "original-missing"),
    "le téléchargement partiel n'est pas signalé comme orphelin"
  )
  check(
    result.residue.removed.length === 0 && result.residue.restored.length === 0,
    "un fichier a été touché alors qu'on ne sait pas vérifier son contenu"
  )
}

{
  const disk = createDisk()
  const index = JSON.stringify({ version: 2, updatedAt: "", services: [] })

  disk.put(`${DATA}/services-index.json.rollback-1755000000000-ab12cd34`, index)
  disk.put(`${CACHE}/Service_2026-08-20_EA05.json.rollback-1755000000000-ef56gh78`, "{}")

  const CLEANER = loadCleaner(disk)
  const result = await CLEANER.maintainServices(NOW)

  check(
    disk.files.get(`${DATA}/services-index.json`)?.content === index,
    "l'index n'a pas été remis en place à partir de sa copie de sécurité"
  )
  check(
    !disk.has(`${DATA}/services-index.json.rollback-1755000000000-ab12cd34`),
    "la copie de sécurité subsiste après la remise en place"
  )
  check(
    disk.has(`${CACHE}/Service_2026-08-20_EA05.json`),
    "le cache de service n'a pas été remis en place"
  )
  check(
    result.residue.restored.length === 2,
    `${result.residue.restored.length} remise(s) en place au lieu de deux`
  )
}

{
  const disk = createDisk()

  disk.put(`${DATA}/services-index.json.rollback-1755000000000-ab12cd34`, "{ pas du JSON")
  disk.put(`${DATA}/import-log.json.rollback-1755000000000-ef56gh78`, "   ")

  const CLEANER = loadCleaner(disk)
  const result = await CLEANER.maintainServices(NOW)

  check(
    !disk.has(`${DATA}/services-index.json`),
    "un index illisible a été remis en place"
  )
  check(
    !disk.has(`${DATA}/import-log.json`),
    "un journal vide a été remis en place"
  )
  check(
    disk.has(`${DATA}/services-index.json.rollback-1755000000000-ab12cd34`) &&
      disk.has(`${DATA}/import-log.json.rollback-1755000000000-ef56gh78`),
    "une copie de sécurité illisible a été supprimée au lieu d'être conservée"
  )
  check(
    result.residue.restored.length === 0,
    "une remise en place a eu lieu malgré un contenu illisible"
  )
}

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

{
  const disk = createDisk()
  const statePath = `${DATA}/services-cleanup-state.json`

  disk.put(`${DATA}/services-index.json`, "{}")
  disk.put(`${DATA}/services-index.json.tmp-1755000000000-ab12cd34`, "{}", RECENT)
  disk.put(`${DATA}/import-log.json.rollback-1755000000000-ef56gh78`, "{ pas du JSON")

  const CLEANER = loadCleaner(disk)
  await CLEANER.maintainServices(NOW)

  const state = JSON.parse(disk.files.get(statePath).content)

  check(
    state.lastResidue.preserved === 1,
    `le diagnostic annonce ${state.lastResidue.preserved} fichier(s) conservé(s) au lieu d'un seul`
  )
}

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
  "fichiers réels intacts, copies relisibles remises en place, copies " +
  "illisibles gardées, PDF supplantés, caches orphelins, index borné, " +
  "espacement, écriture d’état)"
)
