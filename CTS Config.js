// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: gray; icon-glyph: gear;

const fm = FileManager.iCloud()
const DASHBOARD_VERSION = "1.0.15"
const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

const repository = Object.freeze({
  owner: "LASCAMPIA67",
  name: "CTS-Dashboard",
  branch: "main"
})

const joinPath = (parent, child) => fm.joinPath(parent, child)
const root = joinPath(fm.documentsDirectory(), "CTS Dashboard")
const paths = Object.freeze({
  root,
  data: joinPath(root, "Data"),
  database: joinPath(root, "Database"),
  cache: joinPath(root, "Cache"),
  services: joinPath(root, "Services"),
  libraries: joinPath(root, "Libraries")
})

const resolvedPaths = Object.freeze({
  ...paths,
  servicesArchive: joinPath(paths.services, "Archive"),
  servicesRejected: joinPath(paths.services, "Rejected"),
  servicesCache: joinPath(paths.cache, "Services"),
  servicesTextCache: joinPath(joinPath(paths.cache, "Services"), "Text"),
  pdfEngine: joinPath(paths.libraries, "PDF")
})

const files = Object.freeze({
  service: joinPath(resolvedPaths.data, "service.json"),
  serviceBackup: joinPath(resolvedPaths.data, "service-backup.json"),
  importLog: joinPath(resolvedPaths.data, "import-log.json"),
  servicesIndex: joinPath(resolvedPaths.data, "services-index.json"),
  servicesScanState: joinPath(resolvedPaths.data, "services-scan-state.json"),
  pdfJs: joinPath(resolvedPaths.pdfEngine, "pdf.min.mjs"),
  pdfWorker: joinPath(resolvedPaths.pdfEngine, "pdf.worker.min.mjs"),
  stops: joinPath(resolvedPaths.database, "stops.json"),
  places: joinPath(resolvedPaths.database, "places.json"),
  lines: joinPath(resolvedPaths.database, "lines.json")
})

const refresh = Object.freeze({
  activeMs: MINUTE_MS,
  unknownMs: 5 * MINUTE_MS,
  inactiveMs: 6 * HOUR_MS,
  transitionDelaySeconds: 2
})

const pdf = Object.freeze({
  extension: ".pdf",
  minimumTextLength: 50,
  maximumFileSizeBytes: 20 * 1024 * 1024,
  extractionTimeoutMs: 25 * SECOND_MS,
  maximumFilesPerRun: 2,
  /*
   * Le cache d'un service terminé est effacé une heure après la fin de
   * sa dernière tranche, en même temps que son PDF part aux archives.
   *
   * Ce délai n'est pas libre : pendant cette heure, le widget affiche
   * encore le service terminé, et il le lit dans ce cache. L'effacer
   * plus tôt ferait disparaître l'écran « Service terminé » avant
   * l'heure, ou ferait apparaître le service du lendemain trop tôt.
   * Il doit donc rester égal à SERVICE_DISPLAY_GRACE_MS de
   * CTS Services Manager ; tools/preview/cleanup-smoke.mjs le vérifie.
   */
  cacheGraceMs: HOUR_MS,
  archiveGraceMs: HOUR_MS,
  archiveRetentionMs: 7 * DAY_MS
})

const requiredDirectories = Object.freeze([
  resolvedPaths.root,
  resolvedPaths.data,
  resolvedPaths.database,
  resolvedPaths.cache,
  resolvedPaths.services,
  resolvedPaths.servicesArchive,
  resolvedPaths.servicesRejected,
  resolvedPaths.servicesCache,
  resolvedPaths.servicesTextCache,
  resolvedPaths.libraries,
  resolvedPaths.pdfEngine
])

function ensureDirectories() {
  for (const directory of requiredDirectories) {
    if (!fm.fileExists(directory)) fm.createDirectory(directory, true)
  }
}

module.exports = {
  fm,
  repository,
  paths: resolvedPaths,
  files,
  refresh,
  pdf,
  dashboardVersion: DASHBOARD_VERSION,
  ensureDirectories
}
