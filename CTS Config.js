// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: gray; icon-glyph: gear;

const fm = FileManager.iCloud()
const DASHBOARD_VERSION = "1.4.3"
const SERVICES_INDEX_VERSION = 2
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
  services: joinPath(root, "Services")
})

const resolvedPaths = Object.freeze({
  ...paths,
  servicesArchive: joinPath(paths.services, "Archive"),
  servicesRejected: joinPath(paths.services, "Rejected"),
  servicesCache: joinPath(paths.cache, "Services"),
  servicesTextCache: joinPath(joinPath(paths.cache, "Services"), "Text")
})

const files = Object.freeze({
  preferences: joinPath(resolvedPaths.data, "preferences.json"),
  importLog: joinPath(resolvedPaths.data, "import-log.json"),
  servicesIndex: joinPath(resolvedPaths.data, "services-index.json"),
  servicesScanState: joinPath(resolvedPaths.data, "services-scan-state.json"),
  versionPolicy: joinPath(resolvedPaths.data, "version-policy.json"),
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
  widgetLoadTimeoutMs: 3 * SECOND_MS,
  widgetEngineTimeoutMs: 3.5 * SECOND_MS,
  widgetExtractionTimeoutMs: 4 * SECOND_MS,
  widgetCallMarginMs: 1 * SECOND_MS,
  maximumFilesPerRun: 2,
  cacheGraceMs: HOUR_MS,
  archiveGraceMs: HOUR_MS,
  archiveRetentionMs: 7 * DAY_MS,
  residueGraceMs: HOUR_MS,
  residueSweepIntervalMs: 6 * HOUR_MS,
  missingGraceMs: HOUR_MS,
  missingObservationIntervalMs: 5 * MINUTE_MS
})

const residueDirectories = Object.freeze([
  resolvedPaths.data,
  resolvedPaths.database,
  resolvedPaths.servicesCache,
  resolvedPaths.servicesTextCache
])

const requiredDirectories = Object.freeze([
  resolvedPaths.root,
  resolvedPaths.data,
  resolvedPaths.database,
  resolvedPaths.cache,
  resolvedPaths.services,
  resolvedPaths.servicesArchive,
  resolvedPaths.servicesRejected,
  resolvedPaths.servicesCache,
  resolvedPaths.servicesTextCache
])

/*
 * Ce qui ne concerne que cet iPhone vit dans la bibliothèque locale de
 * Scriptable, hors d'iCloud : les verrous, et les deux bibliothèques
 * PDF.js, qu'iOS pouvait retirer de l'appareil faute de place et qu'il
 * fallait alors attendre ou retélécharger au moment de lire une carte.
 * L'application et le widget partagent ce dossier — la documentation ne
 * le dit pas, une mesure sur iPhone l'a établi le 23 septembre. CTS
 * Installer y dépose les bibliothèques sous le même nom de dossier.
 *
 * Le chemin se résout à l'appel : un module qui n'en a pas besoin n'a pas
 * à ouvrir le stockage local.
 */
const DEVICE_DIRECTORY = "CTS Dashboard"

function devicePath(...parts) {
  const local = FileManager.local()

  return parts.reduce(
    (path, part) => local.joinPath(path, part),
    local.joinPath(local.libraryDirectory(), DEVICE_DIRECTORY)
  )
}

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
  residueDirectories,
  dashboardVersion: DASHBOARD_VERSION,
  servicesIndexVersion: SERVICES_INDEX_VERSION,
  devicePath,
  ensureDirectories
}
