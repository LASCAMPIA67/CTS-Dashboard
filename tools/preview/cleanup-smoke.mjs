import { importFrom, isolatedModule, readScript } from "./sandbox.mjs"

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
  return isolatedModule(name, {
    importModule: importFrom(loaded),
    globals: {
      setTimeout,
      UUID: { string: () => Math.random().toString(36).slice(2) },
      ...sandboxExtra
    }
  })
}

const loaded = {}
loaded["CTS Utils"] = loadModule("CTS Utils")

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

const displayGrace = readScript("CTS Services Manager").match(
  /const SERVICE_DISPLAY_GRACE_MS = ([\d\s*]+)/
)

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
    readCurrentIndex: async () => {
      const content = files.get(`${DATA}/services-index.json`)

      return content ? JSON.parse(content) : { version: 2, updatedAt: "", services: [] }
    },
    uniqueArchiveFileName: name => name,
    acquireDeviceLock: () => ({ acquired: true, token: "verrou" }),
    releaseDeviceLock: () => {},
    writeJsonAtomically: async (target, value) => {
      files.set(target, JSON.stringify(value, null, 2))
    }
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

async function scenario(label, { lastEnd, serviceDate, endsAt }) {
  const world = buildWorld({ lastEnd, serviceDate })
  const { files, CLEANER, stem } = world

  const cachePath = `${CACHE}/${stem}.json`
  const textPath = `${TEXT_CACHE}/${stem}.txt`
  const pdfPath = `${SERVICES}/${stem}.pdf`

  await CLEANER.maintainServices(new Date(endsAt - MINUTE))

  check(files.has(cachePath), `${label} : le cache a été effacé avant la fin du service`)
  check(files.has(pdfPath), `${label} : le PDF a été archivé avant la fin du service`)

  const during = await CLEANER.maintainServices(new Date(endsAt + 59 * MINUTE))

  check(
    files.has(cachePath),
    `${label} : le cache est effacé avant la fin de l'heure d'affichage`
  )
  check(
    during.cacheCleared.length === 0,
    `${label} : le vidage du cache a lieu pendant l'heure d'affichage`
  )

  const afterEnd = await CLEANER.maintainServices(new Date(endsAt + HOUR + 2 * MINUTE))

  check(!files.has(cachePath), `${label} : le cache survit à l'heure d'affichage`)
  check(!files.has(textPath), `${label} : le texte extrait survit à l'heure d'affichage`)
  check(
    afterEnd.cacheCleared.length === 1,
    `${label} : le vidage du cache n'est pas rapporté`
  )
  check(afterEnd.success, `${label} : l'entretien signale une erreur`)

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

  const again = await CLEANER.maintainServices(new Date(endsAt + HOUR + 3 * MINUTE))

  check(
    again.cacheCleared.length === 0,
    `${label} : le cache est revidé à chaque exécution`
  )
  check(again.success, `${label} : le second passage signale une erreur`)

  const settled = await CLEANER.maintainServices(new Date(endsAt + 2 * HOUR))

  check(
    settled.archived.length === 0 && settled.cacheCleared.length === 0,
    `${label} : l'entretien refait du travail déjà accompli`
  )
  check(settled.success, `${label} : le passage à deux heures signale une erreur`)

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

await scenario("service après minuit", {
  serviceDate: "2026-08-14",
  lastEnd: "24:48",
  endsAt: new Date(2026, 7, 15, 0, 48).getTime()
})

for (const [label, imported] of [
  [
    "un autre service",
    {
      id: "2026-08-15_EB12",
      date: "2026-08-15",
      service: "EB12",
      pdfFile: "Service_2026-08-15_EB12.pdf",
      cacheFile: "Service_2026-08-15_EB12.json",
      indexedAt: "2026-08-14T18:01:00.000Z"
    }
  ],
  [
    "le même service, réimporté",
    {
      id: "2026-08-14_EA06",
      date: "2026-08-14",
      service: "EA06",
      pdfFile: "Service_2026-08-14_EA06.pdf",
      cacheFile: "Service_2026-08-14_EA06.json",
      indexedAt: "2026-08-14T18:01:00.000Z"
    }
  ]
]) {
  const { files, fm, CLEANER } = buildWorld({ lastEnd: "16:55", serviceDate: "2026-08-14" })
  const indexPath = `${DATA}/services-index.json`
  const move = fm.move

  fm.move = (from, to) => {
    move(from, to)

    if (!to.startsWith(`${ARCHIVE}/`)) return

    const index = JSON.parse(files.get(indexPath))

    index.services = index.services.filter(entry => entry.id !== imported.id).concat(imported)
    files.set(indexPath, JSON.stringify(index))
  }

  const result = await CLEANER.maintainServices(
    new Date(new Date(2026, 7, 14, 16, 55).getTime() + HOUR + 2 * MINUTE)
  )

  const services = JSON.parse(files.get(indexPath)).services
  const examined = services.find(entry => entry.id === "2026-08-14_EA06")
  const arrived = services.find(entry => entry.indexedAt === imported.indexedAt)

  check(result.archived.length === 1, `import pendant l'entretien · ${label} : rien n'a été archivé`)
  check(
    Boolean(arrived),
    `import pendant l'entretien · ${label} : l'entretien a effacé le service que l'import venait d'écrire`
  )

  if (imported.id === "2026-08-14_EA06") {
    check(
      services.length === 1 && !arrived?.archive,
      `import pendant l'entretien · ${label} : l'archivage de l'ancienne carte a été reporté sur la nouvelle`
    )
  } else {
    check(
      services.length === 2 && Boolean(examined?.archive?.fileName) && Boolean(examined?.cache?.clearedAt),
      `import pendant l'entretien · ${label} : l'archivage du service terminé n'a pas été enregistré`
    )
  }
}

{
  const { files, fm, CLEANER } = buildWorld({ lastEnd: "16:55", serviceDate: "2026-08-14" })
  const indexPath = `${DATA}/services-index.json`
  const move = fm.move

  fm.move = (from, to) => {
    move(from, to)
    if (to.startsWith(`${ARCHIVE}/`)) files.delete(indexPath)
  }

  await CLEANER.maintainServices(
    new Date(new Date(2026, 7, 14, 16, 55).getTime() + HOUR + 2 * MINUTE)
  )

  const services = files.has(indexPath) ? JSON.parse(files.get(indexPath)).services : []

  check(
    services.length === 1 && Boolean(services[0].archive?.fileName),
    "index absent au moment d'écrire : l'entretien a écrit " +
      `${services.length} service(s) au lieu du service qu'il venait d'archiver`
  )
}

if (failures.length) {
  console.log("ÉCHEC  entretien automatique des services")
  for (const failure of [...new Set(failures)]) console.log(`         ${failure}`)
  process.exit(1)
}

console.log(
  `ok     entretien automatique des services ` +
    `(2 scénarios, vidage du cache, archivage et rétention, import pendant l'entretien, ` +
    `index absent au moment d'écrire)`
)
