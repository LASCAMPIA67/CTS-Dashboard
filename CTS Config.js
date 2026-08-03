// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: gray; icon-glyph: gear;

// CTS Config.js
// Configuration centrale du projet CTS Dashboard.

const fm = FileManager.iCloud()

const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

function joinPath(parent, child) {
  return fm.joinPath(parent, child)
}

// =====================================================
// DOSSIER PRINCIPAL
// =====================================================

const root = joinPath(
  fm.documentsDirectory(),
  "CTS Dashboard"
)

// =====================================================
// DOSSIERS PRINCIPAUX
// =====================================================

const dataDirectory = joinPath(
  root,
  "Data"
)

const databaseDirectory = joinPath(
  root,
  "Database"
)

const cacheDirectory = joinPath(
  root,
  "Cache"
)

const servicesDirectory = joinPath(
  root,
  "Services"
)

const librariesDirectory = joinPath(
  root,
  "Libraries"
)

// =====================================================
// CHEMINS DU PROJET
// =====================================================

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

// =====================================================
// FICHIERS DU PROJET
// =====================================================

const files = {
  // Service actuellement utilisé par le widget.
  service:
    joinPath(
      paths.data,
      "service.json"
    ),

  // Sauvegarde du service précédemment actif.
  serviceBackup:
    joinPath(
      paths.data,
      "service-backup.json"
    ),

  // Historique des importations et traitements.
  importLog:
    joinPath(
      paths.data,
      "import-log.json"
    ),

  // Index des services analysés.
  servicesIndex:
    joinPath(
      paths.data,
      "services-index.json"
    ),

  // État du dernier balayage du dossier Services.
  servicesScanState:
    joinPath(
      paths.data,
      "services-scan-state.json"
    ),

  // Bibliothèque locale PDF.js.
  pdfJs:
    joinPath(
      paths.pdfEngine,
      "pdf.min.mjs"
    ),

  // Worker local de PDF.js.
  pdfWorker:
    joinPath(
      paths.pdfEngine,
      "pdf.worker.min.mjs"
    ),

  // Bases de données CTS.
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

// =====================================================
// ACTUALISATION DU WIDGET
// =====================================================

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

// =====================================================
// TRAITEMENT AUTOMATIQUE DES PDF
// =====================================================

const pdf = {
  // Seuls les fichiers PDF seront analysés.
  extension:
    ".pdf",

  // Longueur minimale considérée comme exploitable.
  minimumTextLength:
    50,

  // Protection contre les PDF anormalement volumineux.
  maximumFileSizeBytes:
    20 * 1024 * 1024,

  // Limite d’attente de l’extracteur PDF.
  extractionTimeoutMs:
    25 * SECOND_MS,

  /*
   * Nombre maximal de nouveaux PDF analysés pendant
   * une seule exécution du widget.
   *
   * Cette limite évite qu’un grand nombre de PDF
   * fasse dépasser les ressources accordées au widget.
   */
  maximumFilesPerRun:
    2,

  /*
   * Un service terminé ne pourra pas être archivé
   * avant cette marge de sécurité.
   */
  archiveGraceMs:
    1 * HOUR_MS,

  /*
   * Conservation d’un PDF archivé avant sa suppression
   * définitive automatique.
   */
  archiveRetentionMs:
    7 * DAY_MS
}

// =====================================================
// DOSSIERS OBLIGATOIRES
// =====================================================

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
    const directoryPath
    of requiredDirectories
  ) {
    if (!fm.fileExists(directoryPath)) {
      fm.createDirectory(
        directoryPath,
        true
      )
    }
  }
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  fm,
  paths,
  files,
  refresh,
  pdf,
  ensureDirectories
}
