// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: gray; icon-glyph: gear;

const fm = FileManager.iCloud()
const DASHBOARD_VERSION = "1.0.4"

const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

const joinPath = (parent, child) =>
  fm.joinPath(parent, child)

const root = joinPath(
  fm.documentsDirectory(),
  "CTS Dashboard"
)

const dataDirectory =
  joinPath(root, "Data")

const databaseDirectory =
  joinPath(root, "Database")

const cacheDirectory =
  joinPath(root, "Cache")

const servicesDirectory =
  joinPath(root, "Services")

const librariesDirectory =
  joinPath(root, "Libraries")

const paths = {
  root,

  data:
    dataDirectory,

  database:
    databaseDirectory,

  cache:
    cacheDirectory,

  services:
    servicesDirectory,

  servicesArchive:
    joinPath(
      servicesDirectory,
      "Archive"
    ),

  servicesRejected:
    joinPath(
      servicesDirectory,
      "Rejected"
    ),

  servicesCache:
    joinPath(
      cacheDirectory,
      "Services"
    ),

  servicesTextCache:
    joinPath(
      joinPath(
        cacheDirectory,
        "Services"
      ),
      "Text"
    ),

  libraries:
    librariesDirectory,

  pdfEngine:
    joinPath(
      librariesDirectory,
      "PDF"
    )
}

const files = {
  service:
    joinPath(
      paths.data,
      "service.json"
    ),

  serviceBackup:
    joinPath(
      paths.data,
      "service-backup.json"
    ),

  importLog:
    joinPath(
      paths.data,
      "import-log.json"
    ),

  servicesIndex:
    joinPath(
      paths.data,
      "services-index.json"
    ),

  servicesScanState:
    joinPath(
      paths.data,
      "services-scan-state.json"
    ),

  pdfJs:
    joinPath(
      paths.pdfEngine,
      "pdf.min.mjs"
    ),

  pdfWorker:
    joinPath(
      paths.pdfEngine,
      "pdf.worker.min.mjs"
    ),

  stops:
    joinPath(
      paths.database,
      "stops.json"
    ),

  places:
    joinPath(
      paths.database,
      "places.json"
    ),

  lines:
    joinPath(
      paths.database,
      "lines.json"
    )
}

const refresh = {
  activeMs:
    MINUTE_MS,

  unknownMs:
    5 * MINUTE_MS,

  inactiveMs:
    6 * HOUR_MS,

  transitionDelaySeconds:
    2
}

const pdf = {
  extension:
    ".pdf",

  minimumTextLength:
    50,

  maximumFileSizeBytes:
    20 * 1024 * 1024,

  extractionTimeoutMs:
    25 * SECOND_MS,

  maximumFilesPerRun:
    2,

  archiveGraceMs:
    HOUR_MS,

  archiveRetentionMs:
    7 * DAY_MS
}

const requiredDirectories = [
  paths.root,
  paths.data,
  paths.database,
  paths.cache,
  paths.services,
  paths.servicesArchive,
  paths.servicesRejected,
  paths.servicesCache,
  paths.servicesTextCache,
  paths.libraries,
  paths.pdfEngine
]

function ensureDirectories() {
  for (
    const directory
    of requiredDirectories
  ) {
    if (!fm.fileExists(directory)) {
      fm.createDirectory(
        directory,
        true
      )
    }
  }
}

module.exports = {
  fm,
  paths,
  files,
  refresh,
  pdf,

  dashboardVersion:
    DASHBOARD_VERSION,

  ensureDirectories
}
