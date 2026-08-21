// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: folder.badge.gearshape;

const CONFIG = importModule("CTS Config")
const IMPORTER = importModule("CTS Importer")
const STORAGE = importModule("CTS Storage")
const UTILS = importModule("CTS Utils")
const SERVICES_CLEANER = importModule("CTS Services Cleaner")
const { fm, paths, files, pdf } = CONFIG
const removeFileQuietly = STORAGE.removeFileQuietly
const normalizeTimings = UTILS.normalizeImportTimings
const isUsableDate = UTILS.isUsableDate
const runsInApplication = UTILS.runsInApplication

const {
  createTelemetryError,
  hasTelemetryError,
  telemetryFromError,
  normalizeTelemetryCode,
  normalizeTelemetryStage,
  errorMessage
} = UTILS

const SCAN_STATE_VERSION = 1
const SCAN_LOCK_PATH = fm.joinPath(paths.data, "services-scan.lock")
const SCAN_LOCK_TTL_MS = 2 * 60 * 1000
const SCAN_STATE_HEARTBEAT_MS = 60 * 60 * 1000
const EXCEPTION_RETRY_DELAY_MS = 15 * 60 * 1000
const SERVICE_DISPLAY_GRACE_MS = 60 * 60 * 1000
const SERVICE_HANDOVER_GRACE_MS = 5 * 60 * 1000

const BUDGET_TIMEOUT_CODES = Object.freeze([
  "PDF_EXTRACTION_TIMEOUT",
  "PDF_ENGINE_INIT_TIMEOUT",
  "PDF_ENGINE_WEBVIEW_LOAD_FAILED"
])

async function scanServices(options = {}) {
  CONFIG.ensureDirectories()

  const lock = await acquireScanLock()

  if (!lock.acquired) {
    return {
      success: true,
      status: "locked",
      detected: 0,
      scanned: 0,
      candidates: 0,
      processed: 0,
      imported: [],
      failed: [],
      knownFailures: [],
      detectionErrors: [],
      remaining: 0
    }
  }

  try {
    return await performScan(options)
  } finally {
    await releaseScanLock(lock)
  }
}

async function performScan(options) {
  const index = await IMPORTER.readCurrentIndex()
  const state = await loadScanState()
  const signatureBefore = scanStateSignature(state)
  const previousWriteAt = Date.parse(String(state.updatedAt || ""))
  const listing = await inspectServicesDirectory()
  const servicePdfs = listing.files
  const detectionErrors = listing.detectionErrors
  const now = new Date()
  const candidates = servicePdfs
    .filter(file => shouldProcessPdf(file, index, state, now))
    .sort(compareCandidates)

  const maximumFiles = resolveMaximumFiles(options.maximumFiles)
  const selectedCandidates = candidates.slice(0, maximumFiles)
  const imported = []
  const failed = []
  const deferred = []

  for (const candidate of selectedCandidates) {
    recordAttemptedImport(state, candidate)
    state.updatedAt = new Date().toISOString()
    await saveScanState(state)

    const result = await importCandidate(candidate)

    if (result.success) {
      imported.push(result)
      await recordSuccessfulImport(state, candidate, result)
    } else if (ranOutOfWidgetBudget(result)) {
      deferred.push(result)
    } else {
      failed.push(result)
      recordFailedImport(state, candidate, result)
    }

    state.updatedAt = new Date().toISOString()
    await saveScanState(state)
  }

  const knownFailures = collectKnownFailures(servicePdfs, state, failed)

  state.updatedAt = new Date().toISOString()
  state.lastScan = {
    scannedAt: state.updatedAt,
    detectedPdfCount: listing.detected,
    pdfCount: servicePdfs.length,
    detectionErrorCount: detectionErrors.length,
    candidateCount: candidates.length,
    processedCount: selectedCandidates.length,
    importedCount: imported.length,
    failedCount: failed.length + detectionErrors.length
  }

  await saveScanStateIfUseful(state, signatureBefore, previousWriteAt, now)

  return {
    success: failed.length === 0 && detectionErrors.length === 0,
    status: selectedCandidates.length
      ? "processed"
      : detectionErrors.length
        ? "detection-error"
        : candidates.length
          ? "deferred"
          : "idle",
    detected: listing.detected,
    scanned: servicePdfs.length,
    candidates: candidates.length,
    processed: selectedCandidates.length,
    imported,
    failed,
    knownFailures,
    detectionErrors,
    remaining: Math.max(0, candidates.length - selectedCandidates.length + deferred.length)
  }
}

function ranOutOfWidgetBudget(result) {
  if (runsInApplication()) return false

  return BUDGET_TIMEOUT_CODES.includes(String(result?.telemetryCode || ""))
}

async function importCandidate(candidate) {
  try {
    const result = await IMPORTER.importPdf(candidate.path)

    return {
      ...result,
      detectedFileName: candidate.fileName,
      detectedFingerprint: candidate.fingerprint
    }
  } catch (error) {
    const safeError = UTILS.safeError(error)
    const telemetry = telemetryFromError(error, "SERVICE_IMPORT_FAILED", "import")

    return {
      success: false,
      status: "exception",
      detectedFileName: candidate.fileName,
      detectedFingerprint: candidate.fingerprint,
      telemetryCode: telemetry.code,
      telemetryStage: telemetry.stage,
      error: safeError.message,
      details: safeError
    }
  }
}

async function listServicePdfs() {
  return (await inspectServicesDirectory()).files
}

async function inspectServicesDirectory() {
  CONFIG.ensureDirectories()

  let fileNames

  try {
    fileNames = fm.listContents(paths.services)
  } catch (error) {
    throw createTelemetryError(
      "SERVICES_DIRECTORY_READ_FAILED",
      "scan",
      `Le dossier Services ne peut pas être lu : ${errorMessage(error)}`,
      error
    )
  }

  const pdfFiles = []
  const detectionErrors = []
  let detected = 0

  for (const fileName of fileNames) {
    if (!isPdfFileName(fileName)) {
      continue
    }

    const path = fm.joinPath(paths.services, fileName)
    detected++

    let isDirectory = false

    try {
      isDirectory = fm.isDirectory(path)
    } catch (error) {
      const failure = buildDetectionFailure({
        error,
        fileName,
        path,
        stage: "metadata",
        fallbackCode: "PDF_METADATA_READ_FAILED"
      })

      detectionErrors.push(failure)
      await logDetectionFailure("PDF détecté mais métadonnées inaccessibles", failure)
      continue
    }

    if (isDirectory) {
      detected--
      continue
    }

    try {
      pdfFiles.push(await inspectPdf(path))
    } catch (error) {
      const failure = buildDetectionFailure({
        error,
        fileName,
        path,
        stage: "inspection",
        fallbackCode: "PDF_INSPECTION_FAILED"
      })

      detectionErrors.push(failure)
      await logDetectionFailure("PDF détecté mais inaccessible", failure)
    }
  }

  return {
    detected,
    files: pdfFiles,
    detectionErrors
  }
}

function buildDetectionFailure({ error, fileName, path, stage, fallbackCode }) {
  const safeError = UTILS.safeError(error)
  const telemetry = telemetryFromError(error, fallbackCode, stage)

  return {
    fileName,
    path,
    stage,
    telemetryCode: telemetry.code,
    telemetryStage: telemetry.stage,
    error: safeError.message,
    details: safeError
  }
}

async function logDetectionFailure(message, failure) {
  await STORAGE.appendLog("pdf-detection-error", message, {
    fileName: failure.fileName,
    path: failure.path,
    telemetryCode: failure.telemetryCode,
    telemetryStage: failure.telemetryStage,
    error: failure.error,
    details: failure.details
  })
}

async function inspectPdf(path) {
  if (!fm.fileExists(path)) {
    throw createTelemetryError("PDF_SOURCE_NOT_FOUND", "inspection", "Le PDF est introuvable.")
  }

  try {
    if (!(await STORAGE.ensureDownloaded(path))) {
      throw createTelemetryError(
        "PDF_SOURCE_NOT_FOUND",
        "inspection",
        "Le PDF est introuvable."
      )
    }
  } catch (error) {
    if (hasTelemetryError(error)) {
      throw error
    }

    throw createTelemetryError(
      "PDF_ICLOUD_DOWNLOAD_FAILED",
      "inspection",
      `Le PDF n’a pas pu être téléchargé depuis iCloud : ${errorMessage(error)}`,
      error
    )
  }

  const fileName = UTILS.fileNameFromPath(path)
  let sizeKilobytes

  try {
    sizeKilobytes = fm.fileSize(path)
  } catch (error) {
    throw createTelemetryError(
      "PDF_METADATA_READ_FAILED",
      "inspection",
      `La taille du PDF ne peut pas être lue : ${errorMessage(error)}`,
      error
    )
  }

  if (!Number.isFinite(sizeKilobytes) || sizeKilobytes <= 0) {
    throw createTelemetryError(
      "PDF_EMPTY_OR_INACCESSIBLE",
      "inspection",
      "Le PDF est vide ou inaccessible."
    )
  }

  const modificationDate = STORAGE.safeModificationDate(path)
  const modifiedAt = modificationDate ? modificationDate.toISOString() : ""

  return {
    path,
    fileName,
    sizeKilobytes,
    modifiedAt,
    canonical: isCanonicalPdfName(fileName),
    fingerprint: UTILS.buildFingerprint({
      fileName,
      sizeKilobytes,
      modifiedAt
    })
  }
}

function shouldProcessPdf(file, index, state, now) {
  if (isIndexedAndCurrent(file, index)) {
    return false
  }

  const previous = state.files[file.fileName]

  if (!previous) {
    return true
  }

  if (previous.fingerprint !== file.fingerprint) {
    return true
  }

  switch (previous.status) {
    case "imported":
    case "indexed":
      return true

    case "validation-error":
      return false

    case "exception":
      return retryDelayElapsed(previous.lastAttemptAt, now)

    case "interrupted":
      return runsInApplication() || retryDelayElapsed(previous.lastAttemptAt, now)

    default:
      return true
  }
}

function isIndexedAndCurrent(file, index) {
  const services = Array.isArray(index?.services) ? index.services : []
  const entry = services.find(item => item?.pdfFile === file.fileName)

  if (!entry?.cacheFile) {
    return false
  }

  if (entry.cache?.clearedAt) {
    return true
  }

  const cachePath = fm.joinPath(paths.servicesCache, entry.cacheFile)

  if (!fm.fileExists(cachePath)) {
    return false
  }

  const indexedSize = Number(entry.source?.sizeKilobytes)
  const sameSize = !Number.isFinite(indexedSize) || indexedSize === file.sizeKilobytes
  const indexedModifiedAt = String(entry.source?.modifiedAt || "")
  const sameModificationDate =
    !indexedModifiedAt || !file.modifiedAt || indexedModifiedAt === file.modifiedAt

  return sameSize && sameModificationDate
}

function retryDelayElapsed(lastAttemptAt, now) {
  const lastAttemptTime = Date.parse(String(lastAttemptAt || ""))

  return (
    !Number.isFinite(lastAttemptTime) ||
    now.getTime() - lastAttemptTime >= EXCEPTION_RETRY_DELAY_MS
  )
}

async function recordSuccessfulImport(state, candidate, result) {
  const now = new Date().toISOString()
  const timings = normalizeTimings(result.timings)

  state.files[candidate.fileName] = {
    fingerprint: candidate.fingerprint,
    status: "imported",
    lastAttemptAt: now,
    service: result.service || "",
    date: result.date || "",
    canonicalFileName: result.pdfFileName || "",
    telemetryCode: "",
    telemetryStage: "",
    timings,
    error: ""
  }

  if (!result.pdfFileName) {
    return
  }

  const canonicalPath = fm.joinPath(paths.services, result.pdfFileName)

  if (!fm.fileExists(canonicalPath)) {
    return
  }

  try {
    const canonicalInfo = await inspectPdf(canonicalPath)

    state.files[canonicalInfo.fileName] = {
      fingerprint: canonicalInfo.fingerprint,
      status: "indexed",
      lastAttemptAt: now,
      service: result.service || "",
      date: result.date || "",
      canonicalFileName: canonicalInfo.fileName,
      telemetryCode: "",
      telemetryStage: "",
      timings,
      error: ""
    }
  } catch (_) {}
}

function recordAttemptedImport(state, candidate) {
  const previous = state.files[candidate.fileName]

  state.files[candidate.fileName] = {
    ...(previous || {}),
    fingerprint: candidate.fingerprint,
    status: "interrupted",
    lastAttemptAt: new Date().toISOString(),
    attempts: (Number(previous?.attempts) || 0) + 1
  }
}

function recordFailedImport(state, candidate, result) {
  const previous = state.files[candidate.fileName]
  const previousAttempts = Number(previous?.attempts) || 0
  const validationFailure = result.status === "validation-error"

  state.files[candidate.fileName] = {
    fingerprint: candidate.fingerprint,
    status: result.status || "exception",
    lastAttemptAt: new Date().toISOString(),
    attempts: previousAttempts + 1,
    service: result.service || "",
    date: result.date || "",
    canonicalFileName: "",
    telemetryCode: normalizeTelemetryCode(
      result.telemetryCode,
      validationFailure ? "HASTUS_VALIDATION_FAILED" : "SERVICE_IMPORT_FAILED"
    ),
    telemetryStage: normalizeTelemetryStage(
      result.telemetryStage,
      validationFailure ? "validation" : "import"
    ),
    timings: normalizeTimings(result.timings),
    error: result.error || (Array.isArray(result.errors) ? result.errors.join(" · ") : "")
  }
}

function collectKnownFailures(servicePdfs, state, currentFailures) {
  const currentNames = new Set(
    currentFailures
      .map(item => String(item?.detectedFileName || item?.sourceFileName || "").trim())
      .filter(Boolean)
  )

  const knownFailures = []

  for (const file of servicePdfs) {
    if (currentNames.has(file.fileName)) {
      continue
    }

    const previous = state.files[file.fileName]

    if (!previous || !["validation-error", "exception"].includes(previous.status)) {
      continue
    }

    const error = String(previous.error || "").trim()

    if (!error) {
      continue
    }

    const validationFailure = previous.status === "validation-error"

    knownFailures.push({
      success: false,
      status: previous.status,
      detectedFileName: file.fileName,
      telemetryCode: normalizeTelemetryCode(
        previous.telemetryCode,
        validationFailure ? "HASTUS_VALIDATION_FAILED" : "SERVICE_IMPORT_FAILED"
      ),
      telemetryStage: normalizeTelemetryStage(
        previous.telemetryStage,
        validationFailure ? "validation" : "import"
      ),
      timings: normalizeTimings(previous.timings),
      error,
      previous: true,
      lastAttemptAt: String(previous.lastAttemptAt || "")
    })
  }

  return knownFailures
}

async function loadScanState() {
  let value

  try {
    value = await STORAGE.readJson(files.servicesScanState, null)
  } catch (error) {
    throw createTelemetryError(
      "SERVICES_SCAN_STATE_READ_FAILED",
      "scan_state",
      `L’état du balayage des services ne peut pas être lu : ${errorMessage(error)}`,
      error
    )
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyScanState()
  }

  const storedFiles =
    value.files && typeof value.files === "object" && !Array.isArray(value.files)
      ? value.files
      : {}

  return {
    version: Number(value.version) || SCAN_STATE_VERSION,
    updatedAt: String(value.updatedAt || ""),
    lastScan:
      value.lastScan && typeof value.lastScan === "object" && !Array.isArray(value.lastScan)
        ? value.lastScan
        : null,
    files: storedFiles
  }
}

function emptyScanState() {
  return {
    version: SCAN_STATE_VERSION,
    updatedAt: "",
    lastScan: null,
    files: {}
  }
}

function scanStateSignature(state) {
  const lastScan =
    state.lastScan && typeof state.lastScan === "object" && !Array.isArray(state.lastScan)
      ? { ...state.lastScan }
      : null

  if (lastScan) delete lastScan.scannedAt

  return JSON.stringify({ files: state.files, lastScan })
}

async function saveScanStateIfUseful(state, signatureBefore, previousWriteAt, now) {
  const unchanged = scanStateSignature(state) === signatureBefore
  const elapsed = now.getTime() - previousWriteAt
  const recent =
    Number.isFinite(previousWriteAt) && elapsed >= 0 && elapsed < SCAN_STATE_HEARTBEAT_MS

  if (unchanged && recent) return false

  await saveScanState(state)
  return true
}

async function saveScanState(state) {
  CONFIG.ensureDirectories()

  const value = {
    version: SCAN_STATE_VERSION,
    updatedAt: state.updatedAt || new Date().toISOString(),
    lastScan: state.lastScan || null,
    files: state.files || {}
  }

  try {
    await STORAGE.writeJsonAtomically(files.servicesScanState, value, {
      writeCode: "SERVICES_SCAN_STATE_TEMP_WRITE_FAILED",
      commitCode: "SERVICES_SCAN_STATE_COMMIT_FAILED",
      stage: "scan_state",
      writeMessage: "Le fichier temporaire d’état ne peut pas être écrit",
      commitMessage: "L’état du balayage n’a pas pu être validé"
    })
  } catch (error) {
    if (hasTelemetryError(error)) {
      throw error
    }

    throw createTelemetryError(
      "SERVICES_SCAN_STATE_WRITE_FAILED",
      "scan_state",
      `L’état du balayage des services ne peut pas être enregistré : ${errorMessage(error)}`,
      error
    )
  }
}

async function acquireScanLock() {
  const now = new Date()

  if (fm.fileExists(SCAN_LOCK_PATH)) {
    let existingLock

    try {
      existingLock = await STORAGE.readJson(SCAN_LOCK_PATH, null)
    } catch (error) {
      throw createTelemetryError(
        "SERVICES_SCAN_LOCK_READ_FAILED",
        "scan_lock",
        `Le verrou d’analyse des services ne peut pas être lu : ${errorMessage(error)}`,
        error
      )
    }

    const lockTime = Date.parse(String(existingLock?.createdAt || ""))
    const lockIsActive =
      Number.isFinite(lockTime) && now.getTime() - lockTime < SCAN_LOCK_TTL_MS

    const heldByWidget = String(existingLock?.surface || "") === "widget"
    const canTakeOver = heldByWidget && runsInApplication()

    if (lockIsActive && !canTakeOver) {
      return {
        acquired: false,
        token: ""
      }
    }

    removeFileQuietly(SCAN_LOCK_PATH)
  }

  const token = STORAGE.buildUniqueToken()

  try {
    fm.writeString(
      SCAN_LOCK_PATH,
      JSON.stringify(
        {
          token,
          createdAt: now.toISOString(),
          surface: runsInApplication() ? "application" : "widget"
        },
        null,
        2
      )
    )
  } catch (error) {
    throw createTelemetryError(
      "SERVICES_SCAN_LOCK_WRITE_FAILED",
      "scan_lock",
      `Le verrou d’analyse des services ne peut pas être créé : ${errorMessage(error)}`,
      error
    )
  }

  return {
    acquired: true,
    token
  }
}

async function releaseScanLock(lock) {
  if (!lock?.acquired || !fm.fileExists(SCAN_LOCK_PATH)) {
    return
  }

  try {
    const currentLock = await STORAGE.readJson(SCAN_LOCK_PATH, null)

    if (!currentLock || currentLock.token === lock.token) {
      fm.remove(SCAN_LOCK_PATH)
    }
  } catch (_) {
    removeFileQuietly(SCAN_LOCK_PATH)
  }
}

async function resolveServiceForDate(currentDate = new Date()) {
  if (!isUsableDate(currentDate)) {
    return emptyServiceSelection("invalid-date")
  }

  const index = await IMPORTER.readCurrentIndex()
  const entries = Array.isArray(index?.services)
    ? index.services.filter(isUsableServiceEntry)
    : []

  if (!entries.length) {
    return emptyServiceSelection("empty-index")
  }

  const findSuccessorOfYesterday = successorFinder(entries, localDateKey(new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    currentDate.getDate() - 1
  )))
  const todayKey = localDateKey(currentDate)
  const yesterdayDate = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    currentDate.getDate() - 1
  )
  const yesterdayKey = localDateKey(yesterdayDate)
  const findSuccessorOfToday = successorFinder(entries, localDateKey(currentDate))
  let expiredCandidate = null
  const previousDayEntries = entries
    .filter(entry => entry.date === yesterdayKey)
    .sort(compareEntriesByNewest)

  for (const entry of previousDayEntries) {
    const source = await loadIndexedService(entry)

    if (!source) {
      continue
    }

    const timing = await resolveDisplayTiming(source, currentDate, findSuccessorOfYesterday)

    if (!timing.switchAfterDate || currentDate < timing.switchAfterDate) {
      return buildServiceSelection(entry, source, "overnight", timing)
    }

    expiredCandidate = expiredCandidate || { entry, source, timing }
  }

  const todayEntries = entries
    .filter(entry => entry.date === todayKey)
    .sort(compareEntriesByNewest)

  for (const entry of todayEntries) {
    const source = await loadIndexedService(entry)

    if (!source) {
      continue
    }

    const timing = await resolveDisplayTiming(source, currentDate, findSuccessorOfToday)

    if (!timing.switchAfterDate || currentDate < timing.switchAfterDate) {
      return buildServiceSelection(entry, source, "today", timing)
    }

    expiredCandidate = { entry, source, timing }
  }

  const futureEntries = entries
    .filter(entry => entry.date > todayKey)
    .sort(compareFutureEntries)

  for (const entry of futureEntries) {
    const source = await loadIndexedService(entry)

    if (source) {
      return buildServiceSelection(
        entry,
        source,
        "next",
        resolveServiceDisplayTiming(source, currentDate)
      )
    }
  }

  if (expiredCandidate) {
    return emptyServiceSelection("service-finished")
  }

  return emptyServiceSelection("no-usable-service")
}

async function loadIndexedService(entry) {
  if (!entry?.cacheFile) {
    return null
  }

  const cachePath = fm.joinPath(paths.servicesCache, entry.cacheFile)
  let source

  try {
    source = await STORAGE.readJson(cachePath, null)
  } catch (error) {
    throw createTelemetryError(
      "SERVICE_CACHE_READ_FAILED",
      "selection",
      `Le cache du service ne peut pas être lu : ${errorMessage(error)}`,
      error
    )
  }

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null
  }

  if (
    source.validation?.valid !== true ||
    !Array.isArray(source.slices) ||
    !source.slices.length
  ) {
    return null
  }

  if (String(source.date || "") !== String(entry.date || "")) {
    return null
  }

  return source
}

function resolveServiceDisplayTiming(source, currentDate, graceMs = SERVICE_DISPLAY_GRACE_MS) {
  const serviceEndDate = SERVICES_CLEANER.resolveServiceEndDate(source)

  if (!isUsableDate(serviceEndDate)) {
    return {
      serviceEndDate: null,
      switchAfterDate: null,
      serviceEndAt: "",
      switchAfter: "",
      graceMs,
      withinGracePeriod: false,
      expired: false
    }
  }

  const switchAfterDate = new Date(serviceEndDate.getTime() + graceMs)
  const currentTime = currentDate.getTime()

  return {
    serviceEndDate,
    switchAfterDate,
    serviceEndAt: serviceEndDate.toISOString(),
    switchAfter: switchAfterDate.toISOString(),
    graceMs,
    withinGracePeriod:
      currentTime >= serviceEndDate.getTime() && currentTime < switchAfterDate.getTime(),
    expired: currentTime >= switchAfterDate.getTime()
  }
}

async function resolveDisplayTiming(source, currentDate, findSuccessor) {
  const provisional = resolveServiceDisplayTiming(source, currentDate)

  if (!provisional.serviceEndDate) return provisional
  if (currentDate.getTime() < provisional.serviceEndDate.getTime()) return provisional

  const successor = await findSuccessor()

  if (!successor) return provisional

  return resolveServiceDisplayTiming(source, currentDate, SERVICE_HANDOVER_GRACE_MS)
}

function successorFinder(entries, afterDateKey) {
  let resolved
  let done = false

  return async () => {
    if (done) return resolved

    done = true
    resolved = null

    const later = entries
      .filter(entry => String(entry.date) > afterDateKey)
      .sort(compareFutureEntries)

    for (const entry of later) {
      const source = await loadIndexedService(entry)

      if (source) {
        resolved = { entry, source }
        break
      }
    }

    return resolved
  }
}

function isUsableServiceEntry(entry) {
  if (
    !entry ||
    typeof entry !== "object" ||
    Array.isArray(entry) ||
    !String(entry.cacheFile || "").trim()
  ) {
    return false
  }

  return Boolean(UTILS.parseDate(String(entry.date || "")))
}

function compareEntriesByNewest(first, second) {
  const firstTime = Date.parse(String(first.indexedAt || first.importedAt || ""))
  const secondTime = Date.parse(String(second.indexedAt || second.importedAt || ""))
  const safeFirstTime = Number.isFinite(firstTime) ? firstTime : 0
  const safeSecondTime = Number.isFinite(secondTime) ? secondTime : 0

  return safeSecondTime - safeFirstTime
}

function compareFutureEntries(first, second) {
  const byDate = String(first.date).localeCompare(String(second.date))

  return byDate !== 0 ? byDate : compareEntriesByNewest(first, second)
}

function buildServiceSelection(entry, source, reason, timing = {}) {
  return {
    found: true,
    reason,
    entry,
    source,
    service: String(source.service || ""),
    date: String(source.date || ""),
    cacheFile: String(entry.cacheFile || ""),
    pdfFile: String(entry.pdfFile || ""),
    serviceEndAt: String(timing.serviceEndAt || ""),
    switchAfter: String(timing.switchAfter || ""),
    displayGraceMs: Number(timing.graceMs) || SERVICE_DISPLAY_GRACE_MS,
    withinGracePeriod: Boolean(timing.withinGracePeriod)
  }
}

function emptyServiceSelection(reason) {
  return {
    found: false,
    reason: String(reason || "unknown"),
    entry: null,
    source: null,
    service: "",
    date: "",
    cacheFile: "",
    pdfFile: "",
    serviceEndAt: "",
    switchAfter: "",
    displayGraceMs: SERVICE_DISPLAY_GRACE_MS,
    withinGracePeriod: false
  }
}

function localDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-")
}

function resolveMaximumFiles(requestedValue) {
  const configuredValue = Number(pdf.maximumFilesPerRun) || 2
  const value = Number(requestedValue)
  const resolved = Number.isFinite(value) ? value : configuredValue
  const bounded = Math.max(1, Math.min(10, Math.floor(resolved)))

  return runsInApplication() ? bounded : Math.min(1, bounded)
}

function compareCandidates(first, second) {
  if (first.canonical !== second.canonical) {
    return first.canonical ? 1 : -1
  }

  const firstTime = Date.parse(first.modifiedAt)
  const secondTime = Date.parse(second.modifiedAt)

  if (Number.isFinite(firstTime) && Number.isFinite(secondTime) && firstTime !== secondTime) {
    return firstTime - secondTime
  }

  return first.fileName.localeCompare(second.fileName, "fr-FR", {
    numeric: true,
    sensitivity: "base"
  })
}

function isPdfFileName(fileName) {
  return /\.pdf$/i.test(String(fileName || ""))
}

function isCanonicalPdfName(fileName) {
  return /^Service_\d{4}-\d{2}-\d{2}_[A-Z0-9_-]+\.pdf$/i.test(String(fileName || ""))
}

module.exports = {
  scanServices,
  listServicePdfs,
  loadScanState,
  resolveServiceForDate
}
