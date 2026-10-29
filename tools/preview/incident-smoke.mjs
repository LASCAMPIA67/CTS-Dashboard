import { importFrom, isolatedModule } from "./sandbox.mjs"

const ROOT = "/docs/CTS Dashboard"
const NOW = new Date(2026, 8, 14, 10, 0, 0)

function loadModule(name, loaded) {
  return isolatedModule(name, {
    importModule: importFrom(loaded),
    globals: { setTimeout, config: { runsInWidget: true } }
  })
}

function buildEngine({
  detectionErrors = [],
  imported = [],
  scan = null,
  selection = null,
  cleanupErrors = []
}) {
  const fm = {
    joinPath: (parent, child) => `${parent}/${child}`,
    fileExists: () => false,
    isFileDownloaded: () => true,
    readString: () => "",
    writeString: () => {},
    createDirectory: () => {},
    remove: () => {},
    move: () => {},
    isDirectory: () => false,
    listContents: () => []
  }

  const loaded = {}

  loaded["CTS Utils"] = loadModule("CTS Utils", loaded)

  loaded["CTS Config"] = {
    fm,
    paths: { root: ROOT, data: `${ROOT}/Data` },
    files: { versionPolicy: `${ROOT}/Data/version-policy.json`, places: `${ROOT}/Database/places.json` },
    refresh: { activeMs: 60000, unknownMs: 300000, inactiveMs: 21600000, transitionDelaySeconds: 2 },
    pdf: { maximumFilesPerRun: 2 },
    dashboardVersion: "1.4.2",
    ensureDirectories: () => {}
  }

  loaded["CTS Storage"] = {
    loadVersionPolicy: async () => null,
    ensureReadable: async () => true,
    loadPreferences: async () => ({ textScale: 1 })
  }

  loaded["CTS Services Manager"] = {
    scanServices: async () => {
      if (scan) throw scan

      return {
        success: true,
        status: "idle",
        remaining: 0,
        detected: detectionErrors.length + imported.length,
        imported,
        failed: [],
        knownFailures: [],
        detectionErrors
      }
    },
    resolveServiceForDate: async () => {
      if (selection) throw selection
      return { found: false, reason: "no-service" }
    }
  }

  loaded["CTS Services Cleaner"] = {
    maintainServices: async () => ({
      success: cleanupErrors.length === 0,
      status: "idle",
      archived: [],
      deleted: [],
      skipped: [],
      errors: cleanupErrors
    })
  }

  loaded["CTS Service"] = {
    normalizeService: () => ({ valid: false, error: "doublure" }),
    computeState: () => ({ type: "WORK" }),
    computeStats: () => ({}),
    getDisplaySlice: () => null
  }

  return loadModule("CTS Widget Engine", loaded)
}

function telemetryError(code, stage, message) {
  const error = new Error(message)

  error.telemetryCode = code
  error.telemetryStage = stage

  return error
}

const failures = []

function check(condition, message) {
  if (!condition) failures.push(message)
}

async function issuesFor(options) {
  const engine = buildEngine(options)
  const context = await engine.loadContext(NOW)

  return context?.telemetry?.issues || []
}

function withCode(issues, code) {
  return issues.filter(issue => issue.errorCode === code)
}

{
  const issues = await issuesFor({
    detectionErrors: [
      { telemetryCode: "PDF_ICLOUD_DOWNLOAD_FAILED", telemetryStage: "inspection" }
    ],
    cleanupErrors: [
      {
        telemetryCode: "ARCHIVE_ICLOUD_DOWNLOAD_FAILED",
        telemetryStage: "archive",
        error: "iCloud injoignable"
      }
    ]
  })

  const iCloud = issues.filter(issue => /ICLOUD/.test(issue.errorCode))

  check(
    iCloud.length === 1,
    `une panne iCloud enregistre ${iCloud.length} incident(s) : ` +
      JSON.stringify(iCloud.map(issue => `${issue.errorCode} · ${issue.module}`))
  )

  check(
    iCloud[0]?.errorCode === "PDF_ICLOUD_DOWNLOAD_FAILED",
    `l'incident retenu est « ${iCloud[0]?.errorCode} » : c'est le chemin de ` +
      "l'affichage qui doit nommer la panne, pas celui de l'entretien"
  )

  check(
    iCloud[0]?.severity === "error",
    `la panne iCloud reste « ${iCloud[0]?.severity} » alors que le collègue n'a rien vu`
  )
}

{
  const issues = await issuesFor({
    selection: telemetryError("SERVICE_INDEX_INVALID", "index", "index illisible"),
    cleanupErrors: [
      {
        telemetryCode: "SERVICE_INDEX_INVALID",
        telemetryStage: "index",
        error: "index illisible"
      }
    ]
  })

  const index = withCode(issues, "SERVICE_INDEX_INVALID")

  check(
    index.length === 1,
    `un index corrompu enregistre ${index.length} incident(s) : ` +
      JSON.stringify(index.map(issue => `${issue.module} · ${issue.severity}`))
  )

  check(
    index[0]?.severity === "error",
    `l'index corrompu reste « ${index[0]?.severity} » alors que le collègue n'a rien vu`
  )
}

{
  const awaiting = () =>
    telemetryError("SERVICE_INDEX_ICLOUD_DOWNLOAD_FAILED", "index", "index pas encore arrivé")

  const engine = buildEngine({
    scan: awaiting(),
    selection: awaiting(),
    cleanupErrors: [
      {
        telemetryCode: "SERVICE_INDEX_ICLOUD_DOWNLOAD_FAILED",
        telemetryStage: "index",
        error: "index pas encore arrivé"
      }
    ]
  })

  const context = await engine.loadContext(NOW)
  const index = withCode(context.telemetry?.issues || [], "SERVICE_INDEX_ICLOUD_DOWNLOAD_FAILED")

  check(
    index.length === 1 && index[0].severity === "error",
    `un index pas encore arrivé enregistre ${JSON.stringify(index)} au lieu d'un incident rouge`
  )

  check(
    context.errorTitle === "Synchronisation iCloud" && /iCloud/.test(context.errorMessage),
    `un index pas encore arrivé affiche « ${context.errorTitle} » : ` +
      "le collègue doit lire qu'iCloud n'a pas fini, pas qu'une carte est en cause"
  )
}

{
  const issues = await issuesFor({
    detectionErrors: [
      { telemetryCode: "PDF_READ_FAILED", telemetryStage: "inspection" }
    ],
    cleanupErrors: [
      {
        telemetryCode: "REPLACED_ARCHIVE_DELETE_FAILED",
        telemetryStage: "residue",
        error: "suppression refusée"
      }
    ]
  })

  check(
    withCode(issues, "PDF_READ_FAILED").length === 1 &&
      withCode(issues, "REPLACED_ARCHIVE_DELETE_FAILED").length === 1,
    "deux pannes sans rapport ont fusionné : " +
      JSON.stringify(issues.map(issue => issue.errorCode))
  )

  check(
    withCode(issues, "REPLACED_ARCHIVE_DELETE_FAILED")[0]?.severity === "warning",
    "un échec d'entretien sans rapport a été aggravé par une autre panne"
  )
}

for (const engineCode of [
  "PDF_ENGINE_LIBRARY_ICLOUD_FAILED",
  "PDF_ENGINE_WORKER_ICLOUD_FAILED"
]) {
  const issues = await issuesFor({
    detectionErrors: [
      { telemetryCode: "PDF_ICLOUD_DOWNLOAD_FAILED", telemetryStage: "inspection" },
      { telemetryCode: engineCode, telemetryStage: "engine" }
    ]
  })

  check(
    withCode(issues, "PDF_ICLOUD_DOWNLOAD_FAILED").length === 1 &&
      withCode(issues, engineCode).length === 1,
    `${engineCode} a fusionné avec la carte agent : ` +
      JSON.stringify(issues.map(issue => issue.errorCode))
  )
}

{
  const unknown = withCode(
    await issuesFor({ imported: [{ success: true, status: "imported", slicesWithUnknownPlace: 1 }] }),
    "PLACE_UNKNOWN"
  )

  check(
    unknown.length === 1 && unknown[0].severity === "warning",
    `un lieu inconnu enregistre ${JSON.stringify(unknown)} au lieu d'un avertissement PLACE_UNKNOWN`
  )

  check(
    JSON.stringify(Object.keys(unknown[0] || {}).sort()) ===
      JSON.stringify(["errorCode", "module", "severity", "stage"]),
    `l'incident PLACE_UNKNOWN porte d'autres champs : ${JSON.stringify(unknown[0])}`
  )

  const known = withCode(
    await issuesFor({ imported: [{ success: true, status: "imported", slicesWithUnknownPlace: 0 }] }),
    "PLACE_UNKNOWN"
  )

  check(known.length === 0, "un import aux lieux tous connus a signalé un lieu inconnu")
}

if (failures.length) {
  console.error(`\n${failures.length} problème(s) :\n`)
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error("")
  process.exit(1)
}

console.log(
  "ok     Incidents d’une exécution (une cause un incident, gravité la plus forte " +
    "retenue, chemin de l’affichage nommé avant celui de l’entretien, pannes " +
    "distinctes non fusionnées, bibliothèque PDF.js tenue à part de la carte agent, " +
    "lieu inconnu signalé sans son code, index en attente d’iCloud dit comme tel)"
)
