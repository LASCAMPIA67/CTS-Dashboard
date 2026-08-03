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
      "La date fournie au nettoyeur est invalide."
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
  const index =
    await IMPORTER.readCurrentIndex()

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
      index
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
    await fm.downloadFileFromiCloud(
      sourcePath
    )
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

  fm.move(
    sourcePath,
    archivePath
  )

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
    fm.remove(
      archivePath
    )
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

  const source =
    await STORAGE.readJson(
      cachePath,
      null
    )

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
    state
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
    const existing =
      await STORAGE.readJson(
        CLEANUP_LOCK_PATH,
        null
      )

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
  } catch (error) {
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
  value
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

  fm.writeString(
    temporaryPath,
    JSON.stringify(
      value,
      null,
      2
    )
  )

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
      fm.move(
        rollbackPath,
        path
      )
    }

    throw error
  }

  removeFileQuietly(
    rollbackPath
  )
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
  message
) {
  return {
    success: false,
    status,
    archived: [],
    deleted: [],
    skipped: [],
    errors: [
      {
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
  } catch (error) {}
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  maintainServices,
  resolveServiceEndDate
}