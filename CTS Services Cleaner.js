// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: light-gray; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: light-gray; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: brown; icon-glyph: archivebox.fill;

// CTS Services Cleaner.js
// Archivage et suppression sécurisés des anciens PDF de services.

const CONFIG =
  importModule("CTS Config")

const STORAGE =
  importModule("CTS Storage")

const IMPORTER =
  importModule("CTS Importer")

const UTILS =
  importModule("CTS Utils")

const {
  fm,
  paths,
  files,
  pdf
} = CONFIG

const CLEANUP_VERSION = 1

const CLEANUP_LOCK_PATH =
  fm.joinPath(
    paths.data,
    "services-cleanup.lock"
  )

const CLEANUP_STATE_PATH =
  fm.joinPath(
    paths.data,
    "services-cleanup-state.json"
  )

const CLEANUP_LOCK_TTL_MS =
  2 * 60 * 1000

// =====================================================
// ENTRETIEN PRINCIPAL
// =====================================================

async function maintainServices(
  currentDate = new Date(),
  options = {}
) {
  CONFIG.ensureDirectories()

  if (!isUsableDate(currentDate)) {
    return failureResult(
      "invalid-date",
      "La date fournie au nettoyeur est invalide.",
      "CLEANUP_INVALID_DATE",
      "archive"
    )
  }

  const lock =
    await acquireCleanupLock()

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
    return await performMaintenance(
      currentDate,
      options
    )
  } finally {
    await releaseCleanupLock(
      lock
    )
  }
}

async function performMaintenance(
  currentDate,
  options
) {
  let index

  try {
    index =
      await IMPORTER.readCurrentIndex()
  } catch (error) {
    if (hasTelemetryError(error)) {
      throw error
    }

    throw createTelemetryError(
      "CLEANUP_INDEX_READ_FAILED",
      "archive",
      `L’index des services ne peut pas être lu : ${errorMessage(error)}`,
      error
    )
  }

  const services =
    Array.isArray(
      index?.services
    )
      ? index.services
      : []

  const archiveGraceMs =
    resolveNonNegativeDelay(
      options.archiveGraceMs,
      pdf.archiveGraceMs,
      1 * 60 * 60 * 1000
    )

  const archiveRetentionMs =
    resolveNonNegativeDelay(
      options.archiveRetentionMs,
      pdf.archiveRetentionMs,
      7 * 24 * 60 * 60 * 1000
    )

  const archived = []
  const deleted = []
  const skipped = []
  const errors = []

  let indexChanged = false

  for (
    const entry
    of services
  ) {
    try {
      const result =
        await maintainEntry(
          entry,
          currentDate,
          archiveGraceMs,
          archiveRetentionMs
        )

      if (
        result.status ===
        "archived"
      ) {
        archived.push(result)
        indexChanged = true
      } else if (
        result.status ===
        "deleted"
      ) {
        deleted.push(result)
        indexChanged = true
      } else {
        skipped.push(result)
      }
    } catch (error) {
      const safeError =
        UTILS.safeError(error)

      const telemetry =
        telemetryFromError(
          error,
          "SERVICES_CLEANUP_FAILED",
          "archive"
        )

      errors.push({
        id:
          String(
            entry?.id || ""
          ),

        service:
          String(
            entry?.service || ""
          ),

        date:
          String(
            entry?.date || ""
          ),

        telemetryCode:
          telemetry.code,

        telemetryStage:
          telemetry.stage,

        error:
          safeError.message
      })
    }
  }

  if (indexChanged) {
    index.updatedAt =
      new Date().toISOString()

    await writeJsonAtomically(
      files.servicesIndex,
      index,
      {
        writeCode:
          "ARCHIVE_INDEX_TEMP_WRITE_FAILED",

        commitCode:
          "ARCHIVE_INDEX_COMMIT_FAILED",

        stage:
          "archive"
      }
    )
  }

  const result = {
    success:
      errors.length === 0,

    status:
      archived.length ||
      deleted.length
        ? "processed"
        : "idle",

    checkedAt:
      currentDate.toISOString(),

    archiveGraceMs,
    archiveRetentionMs,

    archived,
    deleted,
    skipped,
    errors
  }

  await saveCleanupState(
    result
  )

  if (
    archived.length ||
    deleted.length ||
    errors.length
  ) {
    try {
      await STORAGE.appendLog(
        errors.length
          ? "cleanup-warning"
          : "cleanup",

        "Entretien automatique des PDF de services",

        {
          archived:
            archived.map(
              item =>
                item.fileName
            ),

          deleted:
            deleted.map(
              item =>
                item.fileName
            ),

          errors
        }
      )
    } catch (_) {
      /*
       * Le journal local reste secondaire :
       * son échec ne doit pas invalider un
       * archivage ou une suppression réussis.
       */
    }
  }

  return result
}

// =====================================================
// ENTRETIEN D’UNE ENTRÉE
// =====================================================

async function maintainEntry(
  entry,
  currentDate,
  archiveGraceMs,
  archiveRetentionMs
) {
  if (!isUsableIndexEntry(entry)) {
    return skippedResult(
      entry,
      "invalid-entry"
    )
  }

  if (
    entry.archive?.deletedAt
  ) {
    return skippedResult(
      entry,
      "already-deleted"
    )
  }

  if (
    entry.archive?.fileName
  ) {
    return await maintainArchivedEntry(
      entry,
      currentDate,
      archiveRetentionMs
    )
  }

  return await maintainActivePdfEntry(
    entry,
    currentDate,
    archiveGraceMs
  )
}

async function maintainActivePdfEntry(
  entry,
  currentDate,
  archiveGraceMs
) {
  const source =
    await loadEntryService(
      entry
    )

  if (!source) {
    return skippedResult(
      entry,
      "cache-unavailable"
    )
  }

  const serviceEndDate =
    resolveServiceEndDate(
      source
    )

  if (!serviceEndDate) {
    return skippedResult(
      entry,
      "end-date-unavailable"
    )
  }

  const archiveAfterDate =
    new Date(
      serviceEndDate.getTime() +
      archiveGraceMs
    )

  if (
    currentDate <
    archiveAfterDate
  ) {
    return {
      ...skippedResult(
        entry,
        "not-finished"
      ),

      serviceEndAt:
        serviceEndDate
          .toISOString(),

      archiveAfter:
        archiveAfterDate
          .toISOString()
    }
  }

  const pdfFileName =
    String(
      entry.pdfFile || ""
    ).trim()

  if (!pdfFileName) {
    return skippedResult(
      entry,
      "pdf-not-indexed"
    )
  }

  const sourcePath =
    fm.joinPath(
      paths.services,
      pdfFileName
    )

  if (!fm.fileExists(sourcePath)) {
    return skippedResult(
      entry,
      "pdf-already-absent"
    )
  }

  if (
    !fm.isFileDownloaded(
      sourcePath
    )
  ) {
    try {
      await fm.downloadFileFromiCloud(
        sourcePath
      )
    } catch (error) {
      throw createTelemetryError(
        "ARCHIVE_ICLOUD_DOWNLOAD_FAILED",
        "archive",
        `Le PDF à archiver n’a pas pu être téléchargé depuis iCloud : ${errorMessage(error)}`,
        error
      )
    }
  }

  const archiveFileName =
    uniqueArchiveFileName(
      pdfFileName
    )

  const archivePath =
    fm.joinPath(
      paths.servicesArchive,
      archiveFileName
    )

  try {
    fm.move(
      sourcePath,
      archivePath
    )
  } catch (error) {
    throw createTelemetryError(
      "ARCHIVE_MOVE_FAILED",
      "archive",
      `Le PDF du service n’a pas pu être déplacé vers les archives : ${errorMessage(error)}`,
      error
    )
  }

  const archivedAt =
    currentDate.toISOString()

  entry.archive = {
    fileName:
      archiveFileName,

    archivedAt,

    deletedAt:
      "",

    serviceEndAt:
      serviceEndDate
        .toISOString(),

    archiveAfter:
      archiveAfterDate
        .toISOString()
  }

  return {
    status:
      "archived",

    id:
      entry.id,

    service:
      entry.service,

    date:
      entry.date,

    fileName:
      archiveFileName,

    archivedAt
  }
}

async function maintainArchivedEntry(
  entry,
  currentDate,
  archiveRetentionMs
) {
  const archive =
    entry.archive

  const archivedAtTime =
    Date.parse(
      String(
        archive.archivedAt || ""
      )
    )

  if (
    !Number.isFinite(
      archivedAtTime
    )
  ) {
    return skippedResult(
      entry,
      "invalid-archive-date"
    )
  }

  const deleteAfterDate =
    new Date(
      archivedAtTime +
      archiveRetentionMs
    )

  if (
    currentDate <
    deleteAfterDate
  ) {
    return {
      ...skippedResult(
        entry,
        "archive-retention"
      ),

      deleteAfter:
        deleteAfterDate
          .toISOString()
    }
  }

  const archiveFileName =
    String(
      archive.fileName || ""
    ).trim()

  if (!archiveFileName) {
    return skippedResult(
      entry,
      "archive-file-missing"
    )
  }

  const archivePath =
    fm.joinPath(
      paths.servicesArchive,
      archiveFileName
    )

  if (fm.fileExists(archivePath)) {
    try {
      fm.remove(
        archivePath
      )
    } catch (error) {
      throw createTelemetryError(
        "ARCHIVE_DELETE_FAILED",
        "archive",
        `Le PDF archivé n’a pas pu être supprimé : ${errorMessage(error)}`,
        error
      )
    }
  }

  const deletedAt =
    currentDate.toISOString()

  entry.archive = {
    ...archive,

    deletedAt
  }

  return {
    status:
      "deleted",

    id:
      entry.id,

    service:
      entry.service,

    date:
      entry.date,

    fileName:
      archiveFileName,

    deletedAt
  }
}

// =====================================================
// LECTURE DES SERVICES INDEXÉS
// =====================================================

async function loadEntryService(
  entry
) {
  const cacheFileName =
    String(
      entry.cacheFile || ""
    ).trim()

  if (!cacheFileName) {
    return null
  }

  const cachePath =
    fm.joinPath(
      paths.servicesCache,
      cacheFileName
    )

  let source

  try {
    source =
      await STORAGE.readJson(
        cachePath,
        null
      )
  } catch (error) {
    throw createTelemetryError(
      "ARCHIVE_SERVICE_CACHE_READ_FAILED",
      "archive",
      `Le cache du service à archiver ne peut pas être lu : ${errorMessage(error)}`,
      error
    )
  }

  if (
    !source ||
    typeof source !==
      "object" ||
    Array.isArray(source) ||
    source.validation?.valid !==
      true ||
    !Array.isArray(
      source.slices
    ) ||
    !source.slices.length
  ) {
    return null
  }

  return source
}

function resolveServiceEndDate(
  source
) {
  const serviceDate =
    UTILS.parseDate(
      source?.date
    )

  if (!serviceDate) {
    return null
  }

  const slices =
    Array.isArray(
      source?.slices
    )
      ? source.slices
      : []

  if (!slices.length) {
    return null
  }

  const lastSlice =
    slices[
      slices.length - 1
    ]

  const end =
    UTILS.normalizeTime(
      lastSlice?.end
    )

  if (!end) {
    return null
  }

  const endMinutes =
    UTILS.toMinutes(
      end
    )

  if (
    !Number.isFinite(
      endMinutes
    )
  ) {
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

// =====================================================
// ÉTAT DU NETTOYAGE
// =====================================================

async function saveCleanupState(
  result
) {
  const state = {
    version:
      CLEANUP_VERSION,

    updatedAt:
      new Date().toISOString(),

    lastResult: {
      success:
        result.success,

      status:
        result.status,

      checkedAt:
        result.checkedAt,

      archived:
        result.archived.length,

      deleted:
        result.deleted.length,

      skipped:
        result.skipped.length,

      errors:
        result.errors.length
    }
  }

  await writeJsonAtomically(
    CLEANUP_STATE_PATH,
    state,
    {
      writeCode:
        "CLEANUP_STATE_TEMP_WRITE_FAILED",

      commitCode:
        "CLEANUP_STATE_COMMIT_FAILED",

      stage:
        "archive"
    }
  )
}

// =====================================================
// VERROU DU NETTOYAGE
// =====================================================

async function acquireCleanupLock() {
  const now =
    new Date()

  if (
    fm.fileExists(
      CLEANUP_LOCK_PATH
    )
  ) {
    let existing

    try {
      existing =
        await STORAGE.readJson(
          CLEANUP_LOCK_PATH,
          null
        )
    } catch (error) {
      throw createTelemetryError(
        "CLEANUP_LOCK_READ_FAILED",
        "archive_lock",
        `Le verrou d’entretien ne peut pas être lu : ${errorMessage(error)}`,
        error
      )
    }

    const createdAt =
      Date.parse(
        String(
          existing?.createdAt || ""
        )
      )

    const active =
      Number.isFinite(
        createdAt
      ) &&
      now.getTime() -
        createdAt <
        CLEANUP_LOCK_TTL_MS

    if (active) {
      return {
        acquired: false,
        token: ""
      }
    }

    removeFileQuietly(
      CLEANUP_LOCK_PATH
    )
  }

  const token =
    uniqueToken()

  try {
    fm.writeString(
      CLEANUP_LOCK_PATH,
      JSON.stringify(
        {
          token,
          createdAt:
            now.toISOString()
        },
        null,
        2
      )
    )
  } catch (error) {
    throw createTelemetryError(
      "CLEANUP_LOCK_WRITE_FAILED",
      "archive_lock",
      `Le verrou d’entretien ne peut pas être créé : ${errorMessage(error)}`,
      error
    )
  }

  return {
    acquired: true,
    token
  }
}

async function releaseCleanupLock(
  lock
) {
  if (
    !lock?.acquired ||
    !fm.fileExists(
      CLEANUP_LOCK_PATH
    )
  ) {
    return
  }

  try {
    const current =
      await STORAGE.readJson(
        CLEANUP_LOCK_PATH,
        null
      )

    if (
      !current ||
      current.token ===
        lock.token
    ) {
      fm.remove(
        CLEANUP_LOCK_PATH
      )
    }
  } catch (_) {
    removeFileQuietly(
      CLEANUP_LOCK_PATH
    )
  }
}

// =====================================================
// ÉCRITURE ATOMIQUE
// =====================================================

async function writeJsonAtomically(
  path,
  value,
  {
    writeCode =
      "CLEANUP_JSON_TEMP_WRITE_FAILED",

    commitCode =
      "CLEANUP_JSON_COMMIT_FAILED",

    stage =
      "archive"
  } = {}
) {
  const token =
    uniqueToken()

  const temporaryPath =
    `${path}.tmp-${token}`

  const rollbackPath =
    `${path}.rollback-${token}`

  removeFileQuietly(
    temporaryPath
  )

  removeFileQuietly(
    rollbackPath
  )

  try {
    fm.writeString(
      temporaryPath,
      JSON.stringify(
        value,
        null,
        2
      )
    )
  } catch (error) {
    throw createTelemetryError(
      writeCode,
      stage,
      `Le fichier temporaire d’entretien ne peut pas être écrit : ${errorMessage(error)}`,
      error
    )
  }

  let previousMoved = false

  try {
    if (fm.fileExists(path)) {
      fm.move(
        path,
        rollbackPath
      )

      previousMoved = true
    }

    fm.move(
      temporaryPath,
      path
    )
  } catch (error) {
    removeFileQuietly(
      temporaryPath
    )

    if (
      previousMoved &&
      fm.fileExists(
        rollbackPath
      ) &&
      !fm.fileExists(path)
    ) {
      try {
        fm.move(
          rollbackPath,
          path
        )
      } catch (_) {}
    }

    throw createTelemetryError(
      commitCode,
      stage,
      `Le fichier d’entretien n’a pas pu être validé : ${errorMessage(error)}`,
      error
    )
  }

  removeFileQuietly(
    rollbackPath
  )
}

// =====================================================
// TÉLÉMÉTRIE LOCALE
// =====================================================

function createTelemetryError(
  code,
  stage,
  message,
  cause = null
) {
  const error =
    new Error(
      String(
        message ||
        code ||
        "Erreur d’entretien des services."
      )
    )

  error.telemetryCode =
    normalizeTelemetryCode(
      code,
      "SERVICES_CLEANUP_FAILED"
    )

  error.telemetryStage =
    normalizeTelemetryStage(
      stage,
      "archive"
    )

  if (cause) {
    try {
      error.cause = cause
    } catch (_) {}
  }

  return error
}

function hasTelemetryError(
  error
) {
  return Boolean(
    error &&
    typeof error ===
      "object" &&
    typeof error.telemetryCode ===
      "string" &&
    error.telemetryCode.trim()
  )
}

function telemetryFromError(
  error,
  fallbackCode,
  fallbackStage
) {
  return {
    code:
      normalizeTelemetryCode(
        error?.telemetryCode,
        fallbackCode
      ),

    stage:
      normalizeTelemetryStage(
        error?.telemetryStage,
        fallbackStage
      )
  }
}

function normalizeTelemetryCode(
  value,
  fallback
) {
  const normalized =
    String(
      value ||
      fallback ||
      "SERVICES_CLEANUP_FAILED"
    )
      .trim()
      .toUpperCase()
      .replace(
        /[^A-Z0-9_]/g,
        "_"
      )
      .slice(
        0,
        64
      )

  return normalized ||
    "SERVICES_CLEANUP_FAILED"
}

function normalizeTelemetryStage(
  value,
  fallback
) {
  const normalized =
    String(
      value ||
      fallback ||
      "archive"
    )
      .trim()
      .replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      )
      .slice(
        0,
        50
      )

  return normalized ||
    "archive"
}

// =====================================================
// OUTILS INTERNES
// =====================================================

function isUsableIndexEntry(
  entry
) {
  return Boolean(
    entry &&
    typeof entry ===
      "object" &&
    !Array.isArray(entry) &&
    String(
      entry.id || ""
    ).trim() &&
    /^\d{4}-\d{2}-\d{2}$/.test(
      String(
        entry.date || ""
      )
    )
  )
}

function isUsableDate(
  value
) {
  return Boolean(
    value &&
    typeof value.getTime ===
      "function" &&
    Number.isFinite(
      value.getTime()
    )
  )
}

function resolveNonNegativeDelay(
  requested,
  configured,
  fallback
) {
  const requestedValue =
    Number(requested)

  if (
    Number.isFinite(
      requestedValue
    ) &&
    requestedValue >= 0
  ) {
    return requestedValue
  }

  const configuredValue =
    Number(configured)

  if (
    Number.isFinite(
      configuredValue
    ) &&
    configuredValue >= 0
  ) {
    return configuredValue
  }

  return fallback
}

function uniqueArchiveFileName(
  originalFileName
) {
  const cleanName =
    String(
      originalFileName ||
      "Service.pdf"
    )
      .split(/[\\/]/)
      .pop()

  let candidate =
    cleanName

  let suffix = 2

  while (
    fm.fileExists(
      fm.joinPath(
        paths.servicesArchive,
        candidate
      )
    )
  ) {
    const extensionIndex =
      cleanName
        .toLowerCase()
        .lastIndexOf(
          ".pdf"
        )

    const baseName =
      extensionIndex >= 0
        ? cleanName.slice(
            0,
            extensionIndex
          )
        : cleanName

    candidate =
      `${baseName}_${suffix}.pdf`

    suffix++
  }

  return candidate
}

function skippedResult(
  entry,
  reason
) {
  return {
    status:
      "skipped",

    id:
      String(
        entry?.id || ""
      ),

    service:
      String(
        entry?.service || ""
      ),

    date:
      String(
        entry?.date || ""
      ),

    reason:
      String(
        reason || "unknown"
      )
  }
}

function failureResult(
  status,
  message,
  telemetryCode =
    "SERVICES_CLEANUP_FAILED",
  telemetryStage =
    "archive"
) {
  return {
    success: false,
    status,
    archived: [],
    deleted: [],
    skipped: [],
    errors: [
      {
        telemetryCode:
          normalizeTelemetryCode(
            telemetryCode,
            "SERVICES_CLEANUP_FAILED"
          ),

        telemetryStage:
          normalizeTelemetryStage(
            telemetryStage,
            "archive"
          ),

        error:
          String(
            message ||
            "Erreur inconnue"
          )
      }
    ]
  }
}

function uniqueToken() {
  return [
    Date.now(),

    Math.random()
      .toString(36)
      .slice(2, 10)
  ].join("-")
}

function removeFileQuietly(
  path
) {
  try {
    if (
      path &&
      fm.fileExists(path)
    ) {
      fm.remove(path)
    }
  } catch (_) {}
}

function errorMessage(
  error
) {
  if (
    error &&
    typeof error.message ===
      "string" &&
    error.message.trim()
  ) {
    return error.message.trim()
  }

  return String(
    error ||
    "Erreur inconnue"
  )
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  maintainServices,
  resolveServiceEndDate
}
