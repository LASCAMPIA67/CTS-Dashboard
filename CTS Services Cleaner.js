// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: brown; icon-glyph: archivebox.fill;

// CTS Services Cleaner.js
// Archivage et suppression sécurisés des anciens PDF de services.

const CONFIG = importModule("CTS Config")
const STORAGE = importModule("CTS Storage")
const IMPORTER = importModule("CTS Importer")
const UTILS = importModule("CTS Utils")

const { fm, paths, files, pdf } = CONFIG

const CLEANUP_VERSION = 1
const CLEANUP_LOCK_TTL_MS = 2 * 60 * 1000
const CLEANUP_LOCK_PATH = fm.joinPath(paths.data, "services-cleanup.lock")
const CLEANUP_STATE_PATH = fm.joinPath(paths.data, "services-cleanup-state.json")

// ENTRETIEN PRINCIPAL

async function maintainServices(currentDate = new Date(), options = {}) {
  CONFIG.ensureDirectories()

  if (!isUsableDate(currentDate)) {
    return failureResult(
      "invalid-date",
      "La date fournie au nettoyeur est invalide.",
      "CLEANUP_INVALID_DATE",
      "archive"
    )
  }

  const lock = await acquireCleanupLock()

  if (!lock.acquired) {
    return {
      success: true,
      status: "locked",
      archived: [],
      deleted: [],
      skipped: [],
      errors: []
    }
  }

  try {
    return await performMaintenance(currentDate, options)
  } finally {
    await releaseCleanupLock(lock)
  }
}

async function performMaintenance(currentDate, options) {
  let index

  try {
    index = await IMPORTER.readCurrentIndex()
  } catch (error) {
    if (UTILS.hasTelemetryError(error)) {
      throw error
    }

    throw UTILS.createTelemetryError(
      "CLEANUP_INDEX_READ_FAILED",
      "archive",
      `L’index des services ne peut pas être lu : ${UTILS.errorMessage(error)}`,
      error
    )
  }

  const services = Array.isArray(index?.services) ? index.services : []

  const archiveGraceMs = resolveNonNegativeDelay(
    options.archiveGraceMs,
    pdf.archiveGraceMs,
    1 * 60 * 60 * 1000
  )

  const archiveRetentionMs = resolveNonNegativeDelay(
    options.archiveRetentionMs,
    pdf.archiveRetentionMs,
    7 * 24 * 60 * 60 * 1000
  )

  const cacheGraceMs = resolveNonNegativeDelay(
    options.cacheGraceMs,
    pdf.cacheGraceMs,
    60 * 1000
  )

  const archived = []
  const deleted = []
  const cacheCleared = []
  const skipped = []
  const errors = []
  let indexChanged = false

  for (const entry of services) {
    try {
      /*
       * Le vidage du cache passe avant l'archivage, et les deux sont
       * indépendants : un service terminé depuis deux minutes perd son
       * cache mais garde son PDF jusqu'à l'heure d'archivage.
       */
      const cleared = await clearFinishedServiceCache(entry, currentDate, cacheGraceMs)

      if (cleared) {
        cacheCleared.push(cleared)
        indexChanged = true
      }

      const result = await maintainEntry(entry, currentDate, archiveGraceMs, archiveRetentionMs)

      if (result.status === "archived") {
        archived.push(result)
        indexChanged = true
      } else if (result.status === "deleted") {
        deleted.push(result)
        indexChanged = true
      } else {
        skipped.push(result)
      }
    } catch (error) {
      const safeError = UTILS.safeError(error)
      const telemetry = UTILS.telemetryFromError(error, "SERVICES_CLEANUP_FAILED", "archive")

      errors.push({
        id: String(entry?.id || ""),
        service: String(entry?.service || ""),
        date: String(entry?.date || ""),
        telemetryCode: telemetry.code,
        telemetryStage: telemetry.stage,
        error: safeError.message
      })
    }
  }

  if (indexChanged) {
    index.updatedAt = new Date().toISOString()

    await writeJsonAtomically(files.servicesIndex, index, {
      writeCode: "ARCHIVE_INDEX_TEMP_WRITE_FAILED",
      commitCode: "ARCHIVE_INDEX_COMMIT_FAILED",
      stage: "archive"
    })
  }

  const result = {
    success: errors.length === 0,
    status:
      archived.length || deleted.length || cacheCleared.length ? "processed" : "idle",
    checkedAt: currentDate.toISOString(),
    cacheGraceMs,
    archiveGraceMs,
    archiveRetentionMs,
    archived,
    deleted,
    cacheCleared,
    skipped,
    errors
  }

  await saveCleanupState(result)

  if (archived.length || deleted.length || cacheCleared.length || errors.length) {
    try {
      await STORAGE.appendLog(
        errors.length ? "cleanup-warning" : "cleanup",
        "Entretien automatique des PDF de services",
        {
          archived: archived.map(item => item.fileName),
          deleted: deleted.map(item => item.fileName),
          cacheCleared: cacheCleared.map(item => item.id),
          errors
        }
      )
    } catch (_) {
      // Le journal local reste secondaire : son échec ne doit
      // pas invalider un archivage ou une suppression réussis.
    }
  }

  return result
}

// ENTRETIEN D’UNE ENTRÉE

async function maintainEntry(entry, currentDate, archiveGraceMs, archiveRetentionMs) {
  if (!isUsableIndexEntry(entry)) {
    return skippedResult(entry, "invalid-entry")
  }

  if (entry.archive?.deletedAt) {
    return skippedResult(entry, "already-deleted")
  }

  if (entry.archive?.fileName) {
    return await maintainArchivedEntry(entry, currentDate, archiveRetentionMs)
  }

  return await maintainActivePdfEntry(entry, currentDate, archiveGraceMs)
}

async function maintainActivePdfEntry(entry, currentDate, archiveGraceMs) {
  /*
   * L'heure de fin est lue sur l'entrée d'index, pas sur le cache : le
   * cache est effacé une minute après la fin du service, une heure avant
   * l'archivage du PDF. S'en remettre à lui laisserait chaque PDF dans
   * Services pour toujours.
   */
  const serviceEndDate = await resolveEntryServiceEndDate(entry)

  if (!serviceEndDate) {
    return skippedResult(entry, "end-date-unavailable")
  }

  const archiveAfterDate = new Date(serviceEndDate.getTime() + archiveGraceMs)

  if (currentDate < archiveAfterDate) {
    return {
      ...skippedResult(entry, "not-finished"),
      serviceEndAt: serviceEndDate.toISOString(),
      archiveAfter: archiveAfterDate.toISOString()
    }
  }

  const pdfFileName = String(entry.pdfFile || "").trim()

  if (!pdfFileName) {
    return skippedResult(entry, "pdf-not-indexed")
  }

  const sourcePath = fm.joinPath(paths.services, pdfFileName)

  if (!fm.fileExists(sourcePath)) {
    return skippedResult(entry, "pdf-already-absent")
  }

  /*
   * Un PDF encore en cours de synchronisation iCloud ne doit
   * jamais être déplacé : l’archivage est simplement reporté.
   */
  try {
    if (!(await STORAGE.ensureDownloaded(sourcePath))) {
      return skippedResult(entry, "pdf-already-absent")
    }
  } catch (error) {
    throw UTILS.createTelemetryError(
      "ARCHIVE_ICLOUD_DOWNLOAD_FAILED",
      "archive",
      `Le PDF à archiver n’a pas pu être téléchargé depuis iCloud : ${UTILS.errorMessage(error)}`,
      error
    )
  }

  const archiveFileName = uniqueArchiveFileName(pdfFileName)
  const archivePath = fm.joinPath(paths.servicesArchive, archiveFileName)

  try {
    fm.move(sourcePath, archivePath)
  } catch (error) {
    throw UTILS.createTelemetryError(
      "ARCHIVE_MOVE_FAILED",
      "archive",
      `Le PDF du service n’a pas pu être déplacé vers les archives : ${UTILS.errorMessage(error)}`,
      error
    )
  }

  const archivedAt = currentDate.toISOString()

  entry.archive = {
    fileName: archiveFileName,
    archivedAt,
    deletedAt: "",
    serviceEndAt: serviceEndDate.toISOString(),
    archiveAfter: archiveAfterDate.toISOString()
  }

  return {
    status: "archived",
    id: entry.id,
    service: entry.service,
    date: entry.date,
    fileName: archiveFileName,
    archivedAt
  }
}

async function maintainArchivedEntry(entry, currentDate, archiveRetentionMs) {
  const archive = entry.archive
  const archivedAtTime = Date.parse(String(archive.archivedAt || ""))

  if (!Number.isFinite(archivedAtTime)) {
    return skippedResult(entry, "invalid-archive-date")
  }

  const deleteAfterDate = new Date(archivedAtTime + archiveRetentionMs)

  if (currentDate < deleteAfterDate) {
    return {
      ...skippedResult(entry, "archive-retention"),
      deleteAfter: deleteAfterDate.toISOString()
    }
  }

  const archiveFileName = String(archive.fileName || "").trim()

  if (!archiveFileName) {
    return skippedResult(entry, "archive-file-missing")
  }

  const archivePath = fm.joinPath(paths.servicesArchive, archiveFileName)

  if (fm.fileExists(archivePath)) {
    try {
      fm.remove(archivePath)
    } catch (error) {
      throw UTILS.createTelemetryError(
        "ARCHIVE_DELETE_FAILED",
        "archive",
        `Le PDF archivé n’a pas pu être supprimé : ${UTILS.errorMessage(error)}`,
        error
      )
    }
  }

  const deletedAt = currentDate.toISOString()

  entry.archive = {
    ...archive,
    deletedAt
  }

  return {
    status: "deleted",
    id: entry.id,
    service: entry.service,
    date: entry.date,
    fileName: archiveFileName,
    deletedAt
  }
}

// VIDAGE DU CACHE D’UN SERVICE TERMINÉ

/*
 * Une fois la dernière tranche terminée, le cache d'un service n'a plus
 * aucun usage : le widget ne l'affiche plus, l'import ne le relit jamais,
 * et il restait pourtant sur l'iPhone indéfiniment — un fichier par
 * service importé, sans limite. Il est donc effacé une minute après la
 * fin, avec le texte extrait qui l'accompagne.
 *
 * L'entrée d'index reste, marquée `cache.clearedAt` : elle garde la
 * mémoire du service traité, ce qui évite qu'un PDF encore présent dans
 * Services soit réimporté, et ce qui permet de ne pas repasser sur cette
 * entrée à chaque exécution.
 */
async function clearFinishedServiceCache(entry, currentDate, cacheGraceMs) {
  if (!isUsableIndexEntry(entry) || entry.cache?.clearedAt) {
    return null
  }

  const serviceEndDate = await resolveEntryServiceEndDate(entry)

  if (!isUsableDate(serviceEndDate)) {
    return null
  }

  const clearAfterDate = new Date(serviceEndDate.getTime() + cacheGraceMs)

  if (currentDate < clearAfterDate) {
    return null
  }

  const removed = []

  for (const [directory, fileName] of [
    [paths.servicesCache, entry.cacheFile],
    [paths.servicesTextCache, entry.textFile]
  ]) {
    const name = String(fileName || "").trim()

    if (!name) continue

    const path = fm.joinPath(directory, name)

    if (!fm.fileExists(path)) continue

    try {
      fm.remove(path)
      removed.push(name)
    } catch (error) {
      throw UTILS.createTelemetryError(
        "SERVICE_CACHE_DELETE_FAILED",
        "archive",
        `Le cache du service terminé n’a pas pu être supprimé : ${UTILS.errorMessage(error)}`,
        error
      )
    }
  }

  const clearedAt = currentDate.toISOString()

  entry.cache = {
    clearedAt,
    serviceEndAt: serviceEndDate.toISOString(),
    files: removed
  }

  return {
    status: "cache-cleared",
    id: entry.id,
    service: entry.service,
    date: entry.date,
    files: removed,
    clearedAt
  }
}

/*
 * L'heure de fin d'un service se déduit de son entrée d'index — sa date
 * et l'heure de fin de sa dernière tranche, toutes deux enregistrées à
 * l'import. Le cache n'est consulté que si l'entrée est trop ancienne
 * pour les porter, ce qui évite toute migration.
 */
async function resolveEntryServiceEndDate(entry) {
  const fromEntry = resolveServiceEndDate({
    date: entry?.date,
    slices: [{ end: entry?.lastEnd }]
  })

  if (fromEntry) return fromEntry

  const source = await loadEntryService(entry)

  return source ? resolveServiceEndDate(source) : null
}

// LECTURE DES SERVICES INDEXÉS

async function loadEntryService(entry) {
  const cacheFileName = String(entry.cacheFile || "").trim()

  if (!cacheFileName) {
    return null
  }

  const cachePath = fm.joinPath(paths.servicesCache, cacheFileName)

  let source

  try {
    source = await STORAGE.readJson(cachePath, null)
  } catch (error) {
    throw UTILS.createTelemetryError(
      "ARCHIVE_SERVICE_CACHE_READ_FAILED",
      "archive",
      `Le cache du service à archiver ne peut pas être lu : ${UTILS.errorMessage(error)}`,
      error
    )
  }

  if (
    !source ||
    typeof source !== "object" ||
    Array.isArray(source) ||
    source.validation?.valid !== true ||
    !Array.isArray(source.slices) ||
    !source.slices.length
  ) {
    return null
  }

  return source
}

function resolveServiceEndDate(source) {
  const serviceDate = UTILS.parseDate(source?.date)

  if (!serviceDate) {
    return null
  }

  const slices = Array.isArray(source?.slices) ? source.slices : []

  if (!slices.length) {
    return null
  }

  const lastSlice = slices[slices.length - 1]
  const end = UTILS.normalizeTime(lastSlice?.end)

  if (!end) {
    return null
  }

  const endMinutes = UTILS.toMinutes(end)

  if (!Number.isFinite(endMinutes)) {
    return null
  }

  return new Date(
    serviceDate.getFullYear(),
    serviceDate.getMonth(),
    serviceDate.getDate(),
    0,
    endMinutes,
    0,
    0
  )
}

// ÉTAT DU NETTOYAGE

async function saveCleanupState(result) {
  const state = {
    version: CLEANUP_VERSION,
    updatedAt: new Date().toISOString(),
    lastResult: {
      success: result.success,
      status: result.status,
      checkedAt: result.checkedAt,
      archived: result.archived.length,
      deleted: result.deleted.length,
      skipped: result.skipped.length,
      errors: result.errors.length
    }
  }

  await writeJsonAtomically(CLEANUP_STATE_PATH, state, {
    writeCode: "CLEANUP_STATE_TEMP_WRITE_FAILED",
    commitCode: "CLEANUP_STATE_COMMIT_FAILED",
    stage: "archive"
  })
}

// VERROU DU NETTOYAGE

async function acquireCleanupLock() {
  const now = new Date()

  if (fm.fileExists(CLEANUP_LOCK_PATH)) {
    let existing

    try {
      existing = await STORAGE.readJson(CLEANUP_LOCK_PATH, null)
    } catch (error) {
      throw UTILS.createTelemetryError(
        "CLEANUP_LOCK_READ_FAILED",
        "archive_lock",
        `Le verrou d’entretien ne peut pas être lu : ${UTILS.errorMessage(error)}`,
        error
      )
    }

    const createdAt = Date.parse(String(existing?.createdAt || ""))

    const active = Number.isFinite(createdAt) && now.getTime() - createdAt < CLEANUP_LOCK_TTL_MS

    if (active) {
      return {
        acquired: false,
        token: ""
      }
    }

    removeFileQuietly(CLEANUP_LOCK_PATH)
  }

  const token = uniqueToken()

  try {
    fm.writeString(
      CLEANUP_LOCK_PATH,
      JSON.stringify(
        {
          token,
          createdAt: now.toISOString()
        },
        null,
        2
      )
    )
  } catch (error) {
    throw UTILS.createTelemetryError(
      "CLEANUP_LOCK_WRITE_FAILED",
      "archive_lock",
      `Le verrou d’entretien ne peut pas être créé : ${UTILS.errorMessage(error)}`,
      error
    )
  }

  return {
    acquired: true,
    token
  }
}

async function releaseCleanupLock(lock) {
  if (!lock?.acquired || !fm.fileExists(CLEANUP_LOCK_PATH)) {
    return
  }

  try {
    const current = await STORAGE.readJson(CLEANUP_LOCK_PATH, null)

    if (!current || current.token === lock.token) {
      fm.remove(CLEANUP_LOCK_PATH)
    }
  } catch (_) {
    removeFileQuietly(CLEANUP_LOCK_PATH)
  }
}

// ÉCRITURE ATOMIQUE

async function writeJsonAtomically(
  path,
  value,
  {
    writeCode = "CLEANUP_JSON_TEMP_WRITE_FAILED",
    commitCode = "CLEANUP_JSON_COMMIT_FAILED",
    stage = "archive"
  } = {}
) {
  const token = uniqueToken()
  const temporaryPath = `${path}.tmp-${token}`
  const rollbackPath = `${path}.rollback-${token}`

  removeFileQuietly(temporaryPath)
  removeFileQuietly(rollbackPath)

  try {
    fm.writeString(temporaryPath, JSON.stringify(value, null, 2))
  } catch (error) {
    throw UTILS.createTelemetryError(
      writeCode,
      stage,
      `Le fichier temporaire d’entretien ne peut pas être écrit : ${UTILS.errorMessage(error)}`,
      error
    )
  }

  let previousMoved = false

  try {
    if (fm.fileExists(path)) {
      fm.move(path, rollbackPath)
      previousMoved = true
    }

    fm.move(temporaryPath, path)
  } catch (error) {
    removeFileQuietly(temporaryPath)

    if (previousMoved && fm.fileExists(rollbackPath) && !fm.fileExists(path)) {
      try {
        fm.move(rollbackPath, path)
      } catch (_) {}
    }

    throw UTILS.createTelemetryError(
      commitCode,
      stage,
      `Le fichier d’entretien n’a pas pu être validé : ${UTILS.errorMessage(error)}`,
      error
    )
  }

  removeFileQuietly(rollbackPath)
}

// OUTILS INTERNES

function isUsableIndexEntry(entry) {
  if (
    !entry ||
    typeof entry !== "object" ||
    Array.isArray(entry) ||
    !String(entry.id || "").trim()
  ) {
    return false
  }

  return Boolean(UTILS.parseDate(String(entry.date || "")))
}

function isUsableDate(value) {
  return Boolean(
    value && typeof value.getTime === "function" && Number.isFinite(value.getTime())
  )
}

function resolveNonNegativeDelay(requested, configured, fallback) {
  const requestedValue = Number(requested)

  if (Number.isFinite(requestedValue) && requestedValue >= 0) {
    return requestedValue
  }

  const configuredValue = Number(configured)

  if (Number.isFinite(configuredValue) && configuredValue >= 0) {
    return configuredValue
  }

  return fallback
}

function uniqueArchiveFileName(originalFileName) {
  const cleanName = String(originalFileName || "Service.pdf")
    .split(/[\\/]/)
    .pop()

  let candidate = cleanName
  let suffix = 2

  while (fm.fileExists(fm.joinPath(paths.servicesArchive, candidate))) {
    const extensionIndex = cleanName.toLowerCase().lastIndexOf(".pdf")

    const baseName = extensionIndex >= 0 ? cleanName.slice(0, extensionIndex) : cleanName

    candidate = `${baseName}_${suffix}.pdf`
    suffix++
  }

  return candidate
}

function skippedResult(entry, reason) {
  return {
    status: "skipped",
    id: String(entry?.id || ""),
    service: String(entry?.service || ""),
    date: String(entry?.date || ""),
    reason: String(reason || "unknown")
  }
}

function failureResult(
  status,
  message,
  telemetryCode = "SERVICES_CLEANUP_FAILED",
  telemetryStage = "archive"
) {
  return {
    success: false,
    status,
    archived: [],
    deleted: [],
    skipped: [],
    errors: [
      {
        telemetryCode: UTILS.normalizeTelemetryCode(telemetryCode, "SERVICES_CLEANUP_FAILED"),
        telemetryStage: UTILS.normalizeTelemetryStage(telemetryStage, "archive"),
        error: String(message || "Erreur inconnue")
      }
    ]
  }
}

function uniqueToken() {
  return [Date.now(), Math.random().toString(36).slice(2, 10)].join("-")
}

function removeFileQuietly(path) {
  try {
    if (path && fm.fileExists(path)) {
      fm.remove(path)
    }
  } catch (_) {}
}

// EXPORTS

module.exports = {
  maintainServices,
  resolveServiceEndDate
}
