// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: brown; icon-glyph: archivebox.fill;

const CONFIG = importModule("CTS Config")
const STORAGE = importModule("CTS Storage")
const IMPORTER = importModule("CTS Importer")
const UTILS = importModule("CTS Utils")
const { fm, paths, files, pdf } = CONFIG
const REPLACED_PDF_PREFIX = "Remplace_"
const isUsableDate = UTILS.isUsableDate
const removeFileQuietly = STORAGE.removeFileQuietly
const CLEANUP_WRITE_MESSAGE = "Le fichier temporaire d’entretien ne peut pas être écrit"
const CLEANUP_COMMIT_MESSAGE = "Le fichier d’entretien n’a pas pu être validé"
const CLEANUP_VERSION = 1
const CLEANUP_LOCK_TTL_MS = 2 * 60 * 1000
const CLEANUP_STATE_HEARTBEAT_MS = 60 * 60 * 1000
const CLEANUP_LOCK_PATH = fm.joinPath(paths.data, "services-cleanup.lock")
const CLEANUP_STATE_PATH = fm.joinPath(paths.data, "services-cleanup-state.json")

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

  const residueGraceMs = resolveNonNegativeDelay(
    options.residueGraceMs,
    pdf.residueGraceMs,
    60 * 60 * 1000
  )

  const previousState = await loadCleanupState()

  const archived = []
  const deleted = []
  const cacheCleared = []
  const skipped = []
  const errors = []
  let indexChanged = false

  for (const entry of services) {
    try {
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

    await STORAGE.writeJsonAtomically(files.servicesIndex, index, {
      writeCode: "ARCHIVE_INDEX_TEMP_WRITE_FAILED",
      commitCode: "ARCHIVE_INDEX_COMMIT_FAILED",
      stage: "archive",
      writeMessage: CLEANUP_WRITE_MESSAGE,
      commitMessage: CLEANUP_COMMIT_MESSAGE
    })
  }

  let residue = null

  if (options.sweepResidue !== false && shouldSweepResidue(previousState, currentDate)) {
    residue = await sweepResidue(currentDate, residueGraceMs)

    const replaced = sweepReplacedArchives(currentDate, archiveRetentionMs)

    for (const fileName of replaced.removed) {
      residue.removed.push({ fileName, kind: "replaced-archive" })
    }

    residue.errors.push(...replaced.errors)
  }

  const result = {
    success: errors.length === 0,
    status: archived.length || deleted.length || cacheCleared.length ? "processed" : "idle",
    checkedAt: currentDate.toISOString(),
    cacheGraceMs,
    archiveGraceMs,
    archiveRetentionMs,
    residueGraceMs,
    archived,
    deleted,
    cacheCleared,
    residue,
    skipped,
    errors
  }

  if (residue || indexChanged || errors.length || stateWriteIsStale(previousState, currentDate)) {
    await saveCleanupState(result, previousState)
  }

  if (residue && (residue.removed.length || residue.errors.length)) {
    try {
      await STORAGE.appendLog(
        residue.errors.length ? "cleanup-warning" : "cleanup",
        "Nettoyage des restes d’écriture",
        {
          removed: residue.removed.map(item => item.fileName),
          preserved: residue.preserved.length,
          errors: residue.errors
        }
      )
    } catch (_) {}
  }

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
    } catch (_) {}
  }

  return result
}

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

async function resolveEntryServiceEndDate(entry) {
  const fromEntry = resolveServiceEndDate({
    date: entry?.date,
    slices: [{ end: entry?.lastEnd }]
  })

  if (fromEntry) return fromEntry

  const source = await loadEntryService(entry)

  return source ? resolveServiceEndDate(source) : null
}

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

/*
 * Balayage des restes d'écriture.
 *
 * Une écriture atomique passe par un fichier temporaire puis par une
 * copie de sécurité, tous deux effacés une fois l'écriture validée. iOS
 * peut interrompre un widget entre deux de ces déplacements : le reste
 * survit alors au tour suivant. Comme le jeton du nom est unique, il ne
 * sera jamais réutilisé ni réécrit — il faut donc venir le chercher.
 *
 * La règle décisive est celle de la copie de sécurité. Entre le moment
 * où le fichier d'origine est déplacé vers « .rollback » et celui où le
 * temporaire prend sa place, la copie de sécurité est le SEUL
 * exemplaire des données. Une copie de sécurité dont le fichier
 * d'origine est absent n'est donc jamais supprimée : elle est comptée
 * et signalée, pas effacée. Le temporaire, lui, ne peut jamais être cet
 * exemplaire unique — soit l'original tient toujours sa place, soit la
 * copie de sécurité le protège, soit le fichier n'avait encore jamais
 * existé et personne n'en connaissait le contenu.
 */
const RESIDUE_RULES = Object.freeze([
  { kind: "diagnostic", match: /^\.cts-diagnostic-\d+\.tmp$/ },
  { kind: "temp", match: /^(.+)\.tmp-\d+-[a-z0-9]+$/ },
  { kind: "temp", match: /^(.+)\.tmp$/ },
  { kind: "rollback", match: /^(.+)\.rollback-\d+-[a-z0-9]+$/ },
  { kind: "rollback", match: /^(.+)\.rollback$/ },
  { kind: "download", match: /^(.+)\.download$/ }
])

function classifyResidue(fileName) {
  for (const rule of RESIDUE_RULES) {
    const found = rule.match.exec(fileName)

    if (found) return { kind: rule.kind, baseName: found[1] || "" }
  }

  return null
}

async function sweepResidue(currentDate, graceMs) {
  const removed = []
  const preserved = []
  const errors = []
  const directories = Array.isArray(CONFIG.residueDirectories)
    ? CONFIG.residueDirectories
    : []

  for (const directory of directories) {
    if (!fm.fileExists(directory)) continue

    let fileNames

    try {
      fileNames = fm.listContents(directory)
    } catch (error) {
      errors.push({
        directory,
        telemetryCode: "RESIDUE_DIRECTORY_READ_FAILED",
        telemetryStage: "residue",
        error: UTILS.errorMessage(error)
      })
      continue
    }

    for (const fileName of Array.isArray(fileNames) ? fileNames : []) {
      const residue = classifyResidue(String(fileName || ""))

      if (!residue) continue

      const path = fm.joinPath(directory, fileName)

      try {
        if (fm.isDirectory(path)) continue
      } catch (_) {
        preserved.push({ fileName, reason: "metadata-unreadable" })
        continue
      }

      /*
       * Sans date de modification lisible, l'âge du reste est inconnu :
       * il pourrait appartenir à une écriture en cours. On conserve.
       */
      const modifiedAt = STORAGE.safeModificationDate(path)

      if (!modifiedAt) {
        preserved.push({ fileName, reason: "age-unknown" })
        continue
      }

      if (currentDate.getTime() - modifiedAt.getTime() < graceMs) {
        preserved.push({ fileName, reason: "too-recent" })
        continue
      }

      /*
       * Une copie de sécurité ou un téléchargement partiel dont la
       * destination manque peut être le dernier état lisible du
       * fichier. On ne l'efface pas.
       */
      if (residue.kind !== "temp" && residue.kind !== "diagnostic") {
        if (!fm.fileExists(fm.joinPath(directory, residue.baseName))) {
          preserved.push({ fileName, reason: "original-missing" })
          continue
        }
      }

      try {
        fm.remove(path)
        removed.push({ fileName, kind: residue.kind })
      } catch (error) {
        errors.push({
          fileName,
          telemetryCode: "RESIDUE_DELETE_FAILED",
          telemetryStage: "residue",
          error: UTILS.errorMessage(error)
        })
      }
    }
  }

  return { removed, preserved, errors }
}

/*
 * Les PDF « Remplace_… » sont les exemplaires supplantés d'un service
 * réimporté. Aucun code ne les relit ; ils vivent dans le dossier
 * Archive, dont la règle est déjà une rétention de sept jours. On leur
 * applique exactement cette règle, ni plus courte ni plus longue.
 */
function sweepReplacedArchives(currentDate, retentionMs) {
  const removed = []
  const errors = []

  if (!fm.fileExists(paths.servicesArchive)) return { removed, errors }

  let fileNames

  try {
    fileNames = fm.listContents(paths.servicesArchive)
  } catch (error) {
    errors.push({
      directory: paths.servicesArchive,
      telemetryCode: "RESIDUE_DIRECTORY_READ_FAILED",
      telemetryStage: "residue",
      error: UTILS.errorMessage(error)
    })

    return { removed, errors }
  }

  for (const fileName of Array.isArray(fileNames) ? fileNames : []) {
    const name = String(fileName || "")

    if (!name.startsWith(REPLACED_PDF_PREFIX) || !/\.pdf$/i.test(name)) continue

    const path = fm.joinPath(paths.servicesArchive, name)
    const modifiedAt = STORAGE.safeModificationDate(path)

    if (!modifiedAt) continue
    if (currentDate.getTime() - modifiedAt.getTime() < retentionMs) continue

    try {
      fm.remove(path)
      removed.push(name)
    } catch (error) {
      errors.push({
        fileName: name,
        telemetryCode: "REPLACED_ARCHIVE_DELETE_FAILED",
        telemetryStage: "residue",
        error: UTILS.errorMessage(error)
      })
    }
  }

  return { removed, errors }
}

function shouldSweepResidue(previousState, currentDate) {
  if (UTILS.runsInApplication()) return true

  const lastSweep = Date.parse(String(previousState?.lastResidueSweepAt || ""))

  if (!Number.isFinite(lastSweep)) return true

  const interval = resolveNonNegativeDelay(
    undefined,
    pdf.residueSweepIntervalMs,
    6 * 60 * 60 * 1000
  )

  return currentDate.getTime() - lastSweep >= interval
}

/*
 * L'état d'entretien ne porte, une fois tout rangé, que sa propre date.
 * Le réécrire à chaque réveil du widget ferait travailler iCloud pour
 * rien. On ne le réécrit donc que s'il s'est passé quelque chose, ou si
 * la dernière trace remonte à plus d'une heure — assez pour qu'un
 * diagnostic sache que l'entretien tourne encore.
 */
function stateWriteIsStale(previousState, currentDate) {
  const writtenAt = Date.parse(String(previousState?.updatedAt || ""))

  return !Number.isFinite(writtenAt) || currentDate.getTime() - writtenAt >= CLEANUP_STATE_HEARTBEAT_MS
}

async function loadCleanupState() {
  try {
    const value = await STORAGE.readJson(CLEANUP_STATE_PATH, null)

    return value && typeof value === "object" && !Array.isArray(value) ? value : null
  } catch (_) {
    return null
  }
}

async function saveCleanupState(result, previousState) {
  const state = {
    version: CLEANUP_VERSION,
    updatedAt: result.checkedAt,
    lastResidueSweepAt: String(
      result.residue ? result.checkedAt : previousState?.lastResidueSweepAt || ""
    ),
    lastResidue: result.residue
      ? {
          checkedAt: result.checkedAt,
          removed: result.residue.removed.length,
          /*
           * Un reste écarté parce qu'il vient d'être écrit n'a rien
           * d'anormal : il partira au balayage suivant. Seuls comptent
           * ici ceux qu'on ne sait pas trancher.
           */
          preserved: result.residue.preserved.filter(item => item.reason !== "too-recent").length,
          errors: result.residue.errors.length
        }
      : previousState?.lastResidue || null,
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

  await STORAGE.writeJsonAtomically(CLEANUP_STATE_PATH, state, {
    writeCode: "CLEANUP_STATE_TEMP_WRITE_FAILED",
    commitCode: "CLEANUP_STATE_COMMIT_FAILED",
    stage: "archive",
    writeMessage: CLEANUP_WRITE_MESSAGE,
    commitMessage: CLEANUP_COMMIT_MESSAGE
  })
}

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

  const token = STORAGE.buildUniqueToken()

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

module.exports = {
  maintainServices,
  resolveServiceEndDate,
  classifyResidue
}
