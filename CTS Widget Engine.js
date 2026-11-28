// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: cyan; icon-glyph: squares.below.rectangle;

const CONFIG = importModule("CTS Config")
const STORAGE = importModule("CTS Storage")
const UTILS = importModule("CTS Utils")
const SERVICE_ENGINE = importModule("CTS Service")
const SERVICES_MANAGER = importModule("CTS Services Manager")
const SERVICES_CLEANER = importModule("CTS Services Cleaner")
const telemetryFromError = UTILS.telemetryFromError
const normalizeTelemetryCode = UTILS.normalizeTelemetryCode
const normalizeTelemetryStage = UTILS.normalizeTelemetryStage
const normalizeImportTimings = UTILS.normalizeImportTimings
const isValidDate = UTILS.isUsableDate
const SERVICES_SCAN_REFRESH_MS = 15 * 60 * 1000
const ON_DUTY_SCAN_REFRESH_MS = 5 * 60 * 1000
const ON_DUTY_STATES = ["WORK", "PAUSE", "CUT"]
const PENDING_SCAN_REFRESH_MS = 5 * 60 * 1000
const FAILED_SCAN_REFRESH_MS = 5 * 60 * 1000
const MAX_TELEMETRY_ISSUES = 12
const INDEX_AWAITING_ICLOUD_CODE = "SERVICE_INDEX_ICLOUD_DOWNLOAD_FAILED"

// Les codes iCloud des bibliothèques PDF.js restent à part : autre panne, autre geste.
const TELEMETRY_CAUSES = {
  ARCHIVE_ICLOUD_DOWNLOAD_FAILED: "ICLOUD_DOWNLOAD",
  ICLOUD_DOWNLOAD_FAILED: "ICLOUD_DOWNLOAD",
  PDF_CANONICAL_ICLOUD_FAILED: "ICLOUD_DOWNLOAD",
  PDF_ICLOUD_DOWNLOAD_FAILED: "ICLOUD_DOWNLOAD"
}

const PDF_STAGES = new Set([
  "source",
  "metadata",
  "inspection",
  "engine",
  "engine_install",
  "extraction"
])

const REGISTRATION_STAGES = new Set([
  "registration",
  "cache",
  "text_cache",
  "canonicalize",
  "index",
  "activation"
])

const TELEMETRY_SEVERITY_WEIGHTS = {
  warning: 0,
  error: 1,
  fatal: 2
}

async function loadContext(currentDate = new Date()) {
  const blocked = await resolveVersionBlock(currentDate)

  if (blocked) return blocked

  const resolution = await resolveServiceSource(currentDate)
  const cleanup = await runServicesCleanup(currentDate, resolution.scanResult)

  if (!resolution.source) {
    return buildMissingServiceFailure(resolution, cleanup, currentDate)
  }

  return buildServiceContext(resolution, cleanup, currentDate)
}

async function buildServiceContext(resolution, cleanup, currentDate) {
  const telemetry = buildContextTelemetry(resolution, cleanup, true)

  try {
    await STORAGE.ensureReadable(CONFIG.files.places)
  } catch (_) {}

  const normalized = SERVICE_ENGINE.normalizeService(resolution.source)

  if (!normalized.valid) {
    return serviceFailure(telemetry, "SERVICE_NORMALIZATION_FAILED", normalized.error, currentDate)
  }

  const service = normalized.service
  const state = SERVICE_ENGINE.computeState(service, currentDate)

  if (state.type === "DONE" && servicesFolderIsEmpty(resolution)) {
    telemetry.pdfStatus = "missing"

    return information(
      "Service terminé",
      [
        "Ton service est terminé et aucune carte agent ne se trouve dans le dossier Services.",
        "",
        "Dépose ta prochaine carte agent PDF dans Services pour voir ton prochain service."
      ].join("\n"),
      currentDate,
      telemetry
    )
  }

  const preferences = await STORAGE.loadPreferences()
  const displaySlice = SERVICE_ENGINE.getDisplaySlice(service, state)

  if (!displaySlice) {
    return serviceFailure(
      telemetry,
      "SERVICE_DISPLAY_SLICE_MISSING",
      "Aucune tranche ne peut être affichée.",
      currentDate
    )
  }

  const refreshResolution = { ...resolution, cleanupError: cleanup.error }

  return {
    valid: true,
    errorTitle: "",
    errorMessage: "",
    source: resolution.source,
    service,
    state,
    stats: SERVICE_ENGINE.computeStats(service),
    displaySlice,
    currentDate,
    refreshAfterDate: computeAutomaticRefreshDate(
      computeNextRefreshDate(service, state, currentDate),
      refreshResolution,
      currentDate,
      state
    ),
    switchAfterDate: computeSelectionSwitchDate(refreshResolution, currentDate),
    sourceOrigin: resolution.origin,
    serviceSelection: resolution.selection,
    servicesScan: resolution.scanResult,
    servicesScanError: resolution.scanError,
    serviceSelectionError: resolution.selectionError,
    servicesCleanup: cleanup.result,
    servicesCleanupError: cleanup.error,
    pendingImports: Math.max(0, Number(resolution.scanResult?.remaining) || 0),
    preferences,
    telemetry
  }
}

function serviceFailure(telemetry, errorCode, message, currentDate) {
  telemetry.serviceStatus = "error"

  addDiagnosticIssue(telemetry, {
    severity: "error",
    errorCode,
    module: "WidgetEngine",
    stage: "service"
  })

  return failure("Service invalide", message, currentDate, telemetry)
}

async function resolveServiceSource(currentDate) {
  const scan = await runServicesScan()
  const selection = await resolveIndexedService(currentDate, scan.result?.index)
  const found = Boolean(selection.result?.found && selection.result.source)

  return {
    source: found ? selection.result.source : null,
    origin: found ? "services-index" : "none",
    selection: selection.result,
    scanResult: scan.result,
    scanError: scan.error,
    scanTelemetryCode: scan.telemetryCode,
    scanTelemetryStage: scan.telemetryStage,
    selectionError: selection.error,
    selectionTelemetryCode: selection.telemetryCode,
    selectionTelemetryStage: selection.telemetryStage
  }
}

async function attempt(operation, fallbackCode, fallbackStage) {
  try {
    return { result: await operation(), error: "", telemetryCode: "", telemetryStage: "" }
  } catch (error) {
    const telemetry = telemetryFromError(error, fallbackCode, fallbackStage)

    return {
      result: null,
      error: UTILS.safeError(error).message,
      telemetryCode: telemetry.code,
      telemetryStage: telemetry.stage
    }
  }
}

function runServicesScan() {
  const maximumFiles = Math.max(1, Number(CONFIG.pdf?.maximumFilesPerRun) || 1)

  return attempt(
    () => SERVICES_MANAGER.scanServices({ maximumFiles }),
    "SERVICES_SCAN_FAILED",
    "scan"
  )
}

function resolveIndexedService(currentDate, knownIndex) {
  return attempt(
    () => SERVICES_MANAGER.resolveServiceForDate(currentDate, knownIndex),
    "SERVICE_SELECTION_FAILED",
    "selection"
  )
}

async function runServicesCleanup(currentDate, scanResult) {
  const outcome = await attempt(
    () => SERVICES_CLEANER.maintainServices(currentDate, scanSnapshot(scanResult)),
    "SERVICES_CLEANUP_FAILED",
    "archive"
  )

  if (outcome.error) {
    return {
      ...outcome,
      telemetryIssues: [{ errorCode: outcome.telemetryCode, stage: outcome.telemetryStage }]
    }
  }

  const cleanupError = extractCleanupError(outcome.result)
  const telemetryIssues = extractCleanupTelemetryIssues(outcome.result)
  const primaryTelemetry = telemetryIssues[0] || null

  return {
    result: outcome.result,
    error: cleanupError,
    telemetryCode: cleanupError ? primaryTelemetry?.errorCode || "SERVICES_CLEANUP_FAILED" : "",
    telemetryStage: cleanupError ? primaryTelemetry?.stage || "archive" : "",
    telemetryIssues
  }
}

function scanSnapshot(scanResult) {
  if (!scanResult || scanResult.status === "locked") return {}

  return { servicesListed: true, index: scanResult.index || null }
}

function extractCleanupError(result) {
  if (!result || result.success !== false) {
    return ""
  }

  const messages = arrayOf(result.errors)
    .map(item => String(item?.error || "").trim())
    .filter(Boolean)

  if (messages.length) {
    return messages.join(" · ")
  }

  return "L’entretien automatique des services a rencontré une erreur."
}

function extractCleanupTelemetryIssues(result) {
  if (!result || result.success !== false) {
    return []
  }

  const issues = []

  for (const item of arrayOf(result.errors)) {
    const issue = {
      errorCode: normalizeTelemetryCode(item?.telemetryCode, "SERVICES_CLEANUP_FAILED"),
      stage: normalizeTelemetryStage(item?.telemetryStage, "archive")
    }

    const duplicate = issues.some(
      current => current.errorCode === issue.errorCode && current.stage === issue.stage
    )

    if (!duplicate) {
      issues.push(issue)
    }

    if (issues.length >= MAX_TELEMETRY_ISSUES) {
      break
    }
  }

  if (!issues.length) {
    issues.push({
      errorCode: "SERVICES_CLEANUP_FAILED",
      stage: "archive"
    })
  }

  return issues
}

function arrayOf(value) {
  return Array.isArray(value) ? value : []
}

function detectedCount(scanResult) {
  return Math.max(0, Number(scanResult?.detected ?? scanResult?.scanned ?? 0) || 0)
}

function buildMissingServiceFailure(resolution, cleanup, currentDate) {
  return {
    ...buildMissingServiceContext(resolution, cleanup, currentDate),
    servicesScan: resolution?.scanResult || null,
    servicesScanError: String(resolution?.scanError || "")
  }
}

const MISSING_SERVICE_SCREENS = Object.freeze([
  awaitingICloudScreen,
  scanErrorScreen,
  detectionErrorScreen,
  importFailureScreen,
  selectionErrorScreen,
  lockedScanScreen,
  finishedServiceScreen,
  pendingImportScreen,
  unusableServiceScreen
])

function buildMissingServiceContext(resolution, cleanup, currentDate) {
  const telemetry = buildContextTelemetry(resolution, cleanup, false)

  for (const screen of MISSING_SERVICE_SCREENS) {
    const context = screen(resolution, currentDate, telemetry)

    if (context) return context
  }

  return noPdfScreen(currentDate, telemetry)
}

function awaitingICloudScreen(resolution, currentDate, telemetry) {
  const codes = [resolution?.scanTelemetryCode, resolution?.selectionTelemetryCode]

  if (!codes.includes(INDEX_AWAITING_ICLOUD_CODE)) return null

  return failure(
    "Synchronisation iCloud",
    [
      "La liste de tes services n’est pas encore arrivée d’iCloud sur cet iPhone.",
      "",
      "Le widget attend la synchronisation et réessaie tout seul."
    ].join("\n"),
    currentDate,
    telemetry
  )
}

function scanErrorScreen(resolution, currentDate, telemetry) {
  const scanError = String(resolution?.scanError || "").trim()

  if (!scanError) return null

  return failure(
    "Erreur d’analyse PDF",
    ["Le dossier Services n’a pas pu être analysé.", "", scanError].join("\n"),
    currentDate,
    telemetry
  )
}

function detectionErrorScreen(resolution, currentDate, telemetry) {
  const [first] = arrayOf(resolution?.scanResult?.detectionErrors)

  if (!first) return null

  return failure(
    "PDF inaccessible",
    [
      `${displayFileName(first?.fileName)} a bien été détecté dans le dossier Services,`,
      "mais CTS Dashboard n’arrive pas à lire ce fichier.",
      "",
      firstUsefulError(first) || "Le fichier est peut-être indisponible dans iCloud."
    ].join("\n"),
    currentDate,
    telemetry
  )
}

function importFailureScreen(resolution, currentDate, telemetry) {
  const scanResult = resolution?.scanResult
  const currentFailures = arrayOf(scanResult?.failed)
  const [first] = currentFailures.length ? currentFailures : arrayOf(scanResult?.knownFailures)

  if (!first) return null

  const fileName = displayFileName(first?.detectedFileName || first?.sourceFileName)
  const validationFailure = String(first?.status || "") === "validation-error"

  return failure(
    validationFailure ? "PDF HASTUS non reconnu" : "Erreur d’import PDF",
    [
      `${fileName} a bien été détecté dans le dossier Services.`,
      "",
      validationFailure
        ? "Le PDF a été lu, mais les informations nécessaires au service n’ont pas été reconnues."
        : "CTS Dashboard n’a pas réussi à importer ce PDF.",
      "",
      firstUsefulError(first)
    ]
      .filter(value => String(value || "").length > 0)
      .join("\n"),
    currentDate,
    telemetry
  )
}

function selectionErrorScreen(resolution, currentDate, telemetry) {
  const selectionError = String(resolution?.selectionError || "").trim()

  if (!selectionError) return null

  return failure(
    "Erreur de service",
    [
      "Le PDF a été analysé, mais le service ne peut pas être sélectionné.",
      "",
      selectionError
    ].join("\n"),
    currentDate,
    telemetry
  )
}

function lockedScanScreen(resolution, currentDate, telemetry) {
  if (resolution?.scanResult?.status !== "locked") return null

  addDiagnosticIssue(telemetry, {
    severity: "warning",
    errorCode: "SERVICES_SCAN_LOCKED",
    module: "ServicesManager",
    stage: "scan_lock"
  })

  const locked = information(
    "Lecture en attente",
    [
      "Ta carte agent est déjà en cours de lecture.",
      "",
      "Elle s’affichera au prochain réveil du widget. Touche ce widget pour ne pas attendre."
    ].join("\n"),
    currentDate,
    telemetry
  )

  return {
    ...locked,
    refreshAfterDate: new Date(currentDate.getTime() + PENDING_SCAN_REFRESH_MS)
  }
}

function finishedServiceScreen(resolution, currentDate, telemetry) {
  if (String(resolution?.selection?.reason || "") !== "service-finished") return null

  telemetry.serviceStatus = "not_found"

  return information(
    "Aucune carte agent",
    [
      "Ton dernier service est terminé et aucune prochaine carte agent n’est disponible.",
      "",
      "Dépose ta prochaine carte agent PDF dans le dossier Services."
    ].join("\n"),
    currentDate,
    telemetry
  )
}

function pendingImportScreen(resolution, currentDate, telemetry) {
  const waiting = Number(resolution?.scanResult?.remaining)

  if (!(waiting > 0)) return null

  telemetry.pdfStatus = "found"
  telemetry.serviceStatus = "not_found"

  return information(
    "Lecture en attente",
    [
      waiting > 1
        ? `${waiting} cartes agent attendent d’être lues.`
        : "Ta carte agent n’a pas pu être lue dans le temps accordé au widget.",
      "",
      "Elle sera reprise automatiquement. Touche ce widget pour ne pas attendre."
    ].join("\n"),
    currentDate,
    telemetry
  )
}

function unusableServiceScreen(resolution, currentDate, telemetry) {
  const detected = detectedCount(resolution?.scanResult)

  if (detected <= 0) return null

  telemetry.pdfStatus = "found"
  telemetry.serviceStatus = "not_found"

  addDiagnosticIssue(telemetry, {
    severity: "error",
    errorCode: "SERVICE_NOT_FOUND",
    module: "WidgetEngine",
    stage: "service"
  })

  return failure(
    "Aucun service exploitable",
    [
      `${detected} PDF${detected > 1 ? " ont" : " a"} été détecté${detected > 1 ? "s" : ""} dans Services,`,
      "mais aucun service exploitable n’est disponible.",
      "",
      "Relance CTS Dashboard. Si le problème persiste, vérifie le PDF concerné."
    ].join("\n"),
    currentDate,
    telemetry
  )
}

function noPdfScreen(currentDate, telemetry) {
  telemetry.pdfStatus = "missing"
  telemetry.serviceStatus = "not_found"

  addDiagnosticIssue(telemetry, {
    severity: "warning",
    errorCode: "PDF_NOT_FOUND",
    module: "WidgetEngine",
    stage: "source"
  })

  return failure(
    "Aucun PDF",
    [
      "Aucun fichier PDF n’a été trouvé dans le dossier Services.",
      "",
      "Ajoute une carte agent HASTUS au format PDF dans Services."
    ].join("\n"),
    currentDate,
    telemetry
  )
}

function firstUsefulError(value) {
  const direct = String(value?.error || "").trim()

  if (direct) {
    return direct
  }

  const errors = arrayOf(value?.errors)
    .map(item => (typeof item === "string" ? item : item?.message || item?.error || ""))
    .map(item => String(item || "").trim())
    .filter(Boolean)

  if (errors.length) {
    return errors.join(" · ")
  }

  return String(value?.details?.message || "").trim()
}

function displayFileName(value) {
  const fileName = String(value || "").trim()

  return fileName || "Le PDF"
}

function buildContextTelemetry(resolution, cleanup, hasSource) {
  const telemetry = {
    pdfStatus: "not_checked",
    parserStatus: "not_run",
    serviceStatus: hasSource ? "found" : "not_found",
    archiveStatus: "not_run",
    issues: [],
    timings: null
  }

  const scanResult = resolution?.scanResult
  const detected = detectedCount(scanResult)
  const imported = arrayOf(scanResult?.imported)

  if (detected > 0) {
    telemetry.pdfStatus = "found"
  }

  applyScanTelemetry(telemetry, resolution, hasSource)
  applyImportTelemetry(telemetry, scanResult, hasSource)
  applySelectionTelemetry(telemetry, resolution, hasSource)
  applyCleanupTelemetry(telemetry, cleanup)

  if (!hasSource && detected <= 0 && telemetry.pdfStatus === "not_checked") {
    telemetry.pdfStatus = "missing"
  }

  if (imported.some(item => item?.slicesWithUnknownPlace > 0)) {
    addDiagnosticIssue(telemetry, {
      severity: "warning",
      errorCode: "PLACE_UNKNOWN",
      module: "Importer",
      stage: "validation"
    })
  }

  return telemetry
}

function applyScanTelemetry(telemetry, resolution, hasSource) {
  const severity = hasSource ? "warning" : "error"

  if (resolution?.scanError) {
    telemetry.pdfStatus = "read_error"

    addDiagnosticIssue(telemetry, {
      severity,
      errorCode: resolution.scanTelemetryCode || "SERVICES_SCAN_FAILED",
      module: "ServicesManager",
      stage: resolution.scanTelemetryStage || "scan"
    })
  }

  for (const item of arrayOf(resolution?.scanResult?.detectionErrors)) {
    telemetry.pdfStatus = "read_error"

    addDiagnosticIssue(telemetry, {
      severity,
      errorCode: item?.telemetryCode || "PDF_INSPECTION_FAILED",
      module: "ServicesManager",
      stage: item?.telemetryStage || item?.stage || "inspection"
    })
  }
}

function applyImportTelemetry(telemetry, scanResult, hasSource) {
  const imported = arrayOf(scanResult?.imported)

  if (imported.length) {
    telemetry.pdfStatus = telemetry.pdfStatus === "read_error" ? "read_error" : "found"
    telemetry.parserStatus = "success"
    telemetry.timings = normalizeImportTimings(imported[0]?.timings)
  }

  const failed = arrayOf(scanResult?.failed)

  for (const item of failed) {
    applyImportFailureTelemetry(telemetry, item, hasSource)
  }

  const [knownFailure] = arrayOf(scanResult?.knownFailures)

  if (!failed.length && !hasSource && knownFailure) {
    applyImportFailureTelemetry(telemetry, knownFailure, false)
  }
}

function applySelectionTelemetry(telemetry, resolution, hasSource) {
  if (!resolution?.selectionError) return

  telemetry.serviceStatus = hasSource ? "found" : "error"

  addDiagnosticIssue(telemetry, {
    severity: hasSource ? "warning" : "error",
    errorCode: resolution.selectionTelemetryCode || "SERVICE_SELECTION_FAILED",
    module: "ServicesManager",
    stage: resolution.selectionTelemetryStage || "selection"
  })
}

function applyCleanupTelemetry(telemetry, cleanup) {
  if (cleanup?.result?.status === "locked") {
    telemetry.archiveStatus = "not_run"
  } else if (cleanup?.result) {
    telemetry.archiveStatus = cleanup.result.success === false ? "error" : "success"
  }

  if (!cleanup?.error) return

  telemetry.archiveStatus = "error"

  const cleanupIssues = arrayOf(cleanup.telemetryIssues).length
    ? cleanup.telemetryIssues
    : [
        {
          errorCode: cleanup.telemetryCode || "SERVICES_CLEANUP_FAILED",
          stage: cleanup.telemetryStage || "archive"
        }
      ]

  for (const item of cleanupIssues) {
    addDiagnosticIssue(telemetry, {
      severity: "warning",
      errorCode: item?.errorCode || "SERVICES_CLEANUP_FAILED",
      module: "ServicesCleaner",
      stage: item?.stage || "archive"
    })
  }
}

function applyImportFailureTelemetry(telemetry, item, hasSource) {
  const status = String(item?.status || "")

  const fallbackCode =
    status === "validation-error" ? "HASTUS_VALIDATION_FAILED" : "SERVICE_IMPORT_FAILED"

  const fallbackStage = status === "validation-error" ? "validation" : "import"
  const code = normalizeTelemetryCode(item?.telemetryCode, fallbackCode)
  const stage = normalizeTelemetryStage(item?.telemetryStage, fallbackStage)

  if (PDF_STAGES.has(stage)) {
    telemetry.pdfStatus = "read_error"
  } else if (telemetry.pdfStatus !== "read_error") {
    telemetry.pdfStatus = "found"
  }

  if (stage === "parser") {
    telemetry.parserStatus = "error"
  } else if (stage === "validation" || REGISTRATION_STAGES.has(stage)) {
    telemetry.parserStatus = "success"
  }

  if (stage === "validation") {
    telemetry.serviceStatus = hasSource ? "found" : "not_found"
  } else if (REGISTRATION_STAGES.has(stage) || stage === "database" || stage === "import") {
    telemetry.serviceStatus = hasSource ? "found" : "error"
  }

  if (!telemetry.timings && item?.timings) {
    telemetry.timings = normalizeImportTimings(item.timings)
  }

  addDiagnosticIssue(telemetry, {
    severity: hasSource ? "warning" : "error",
    errorCode: code,
    module: "Importer",
    stage
  })
}

function addDiagnosticIssue(telemetry, issue) {
  if (!telemetry || !Array.isArray(telemetry.issues)) {
    return
  }

  const normalized = {
    severity: normalizeIssueSeverity(issue?.severity),
    errorCode: normalizeTelemetryCode(issue?.errorCode, "DASHBOARD_UNKNOWN_ERROR"),
    module: normalizeTelemetryStage(issue?.module, "WidgetEngine"),
    stage: normalizeTelemetryStage(issue?.stage, "unknown")
  }

  const cause = telemetryCause(normalized.errorCode)

  const existing = telemetry.issues.filter(
    current => telemetryCause(current.errorCode) === cause
  )[0]

  // Le plafond après la recherche : une cause déjà notée doit pouvoir s'aggraver liste pleine.
  if (existing) {
    existing.severity = strongestIssueSeverity(existing.severity, normalized.severity)
    return
  }

  if (telemetry.issues.length >= MAX_TELEMETRY_ISSUES) {
    return
  }

  telemetry.issues.push(normalized)
}

function telemetryCause(errorCode) {
  return TELEMETRY_CAUSES[errorCode] || errorCode
}

function strongestIssueSeverity(first, second) {
  const firstWeight = TELEMETRY_SEVERITY_WEIGHTS[first] ?? 0
  const secondWeight = TELEMETRY_SEVERITY_WEIGHTS[second] ?? 0

  return secondWeight > firstWeight ? second : first
}

function normalizeIssueSeverity(value) {
  const severity = String(value || "error")
    .trim()
    .toLowerCase()

  return ["warning", "error", "fatal"].includes(severity) ? severity : "error"
}

function computeAutomaticRefreshDate(serviceRefreshAfterDate, resolution, currentDate, state) {
  const fallbackDelay = onDutyDelay(state)
  const scanRefreshAfterDate = computeScanRefreshDate(resolution, currentDate, fallbackDelay)
  const switchAfterDate = computeSelectionSwitchDate(resolution, currentDate)

  return earliestValidDate(
    [serviceRefreshAfterDate, scanRefreshAfterDate, switchAfterDate],
    new Date(currentDate.getTime() + fallbackDelay),
    currentDate
  )
}

function onDutyDelay(state) {
  return ON_DUTY_STATES.includes(String(state?.type || ""))
    ? ON_DUTY_SCAN_REFRESH_MS
    : SERVICES_SCAN_REFRESH_MS
}

function computeSelectionSwitchDate(resolution, currentDate) {
  const rawSwitchAfter = String(resolution?.selection?.switchAfter || "").trim()

  if (!rawSwitchAfter) {
    return null
  }

  const switchAfterDate = new Date(rawSwitchAfter)

  if (!isValidDate(switchAfterDate)) {
    return null
  }

  if (switchAfterDate.getTime() <= currentDate.getTime()) {
    return null
  }

  return switchAfterDate
}

function computeScanRefreshDate(resolution, currentDate, baseDelay = SERVICES_SCAN_REFRESH_MS) {
  const scanResult = resolution?.scanResult
  let delay = baseDelay

  if (scanResult?.status === "locked") {
    delay = PENDING_SCAN_REFRESH_MS
  }

  if (resolution?.scanError || resolution?.selectionError || resolution?.cleanupError) {
    delay = FAILED_SCAN_REFRESH_MS
  }

  return new Date(currentDate.getTime() + delay)
}

function earliestValidDate(values, fallback, after) {
  const validDates = values
    .filter(
      value => isValidDate(value) && (!isValidDate(after) || value.getTime() > after.getTime())
    )
    .sort((first, second) => first.getTime() - second.getTime())

  if (validDates.length) {
    return validDates[0]
  }

  return fallback
}

function computeNextRefreshDate(service, state, currentDate = new Date()) {
  const fallbackRefreshDate = new Date(currentDate.getTime() + CONFIG.refresh.unknownMs)

  if (!service || !state || !Array.isArray(service.slices) || service.slices.length === 0) {
    return fallbackRefreshDate
  }

  const serviceDate = UTILS.parseDate(service.date)

  if (!serviceDate) {
    return fallbackRefreshDate
  }

  const firstSlice = service.slices[0]

  switch (state.type) {
    case "NEXT":
    case "BEFORE":
      return computeBeforeRefreshDate(serviceDate, firstSlice, currentDate)

    case "WORK":
      return computeWorkRefreshDate(serviceDate, state, currentDate)

    case "PAUSE":
    case "CUT":
      if (state.next && UTILS.isValidTime(state.next.start)) {
        return dateForServiceTime(
          serviceDate,
          state.next.start,
          CONFIG.refresh.transitionDelaySeconds
        )
      }

      return fallbackRefreshDate

    case "DONE":
      return new Date(currentDate.getTime() + CONFIG.refresh.inactiveMs)

    default:
      return fallbackRefreshDate
  }
}

function computeBeforeRefreshDate(serviceDate, firstSlice, currentDate) {
  const transitions = [firstSlice.dutyStart, firstSlice.start]

  for (const time of transitions) {
    if (!UTILS.isValidTime(time)) {
      continue
    }

    const transitionDate = dateForServiceTime(
      serviceDate,
      time,
      CONFIG.refresh.transitionDelaySeconds
    )

    if (transitionDate.getTime() > currentDate.getTime()) {
      return transitionDate
    }
  }

  return new Date(currentDate.getTime() + CONFIG.refresh.activeMs)
}

function computeWorkRefreshDate(serviceDate, state, currentDate) {
  const activeRefreshDate = new Date(currentDate.getTime() + CONFIG.refresh.activeMs)

  if (!state.current || !UTILS.isValidTime(state.current.end)) {
    return activeRefreshDate
  }

  const sliceEndDate = dateForServiceTime(
    serviceDate,
    state.current.end,
    CONFIG.refresh.transitionDelaySeconds
  )

  return sliceEndDate.getTime() > currentDate.getTime() ? sliceEndDate : activeRefreshDate
}

function dateForServiceTime(serviceDate, time, extraSeconds = 0) {
  if (
    !serviceDate ||
    typeof serviceDate.getFullYear !== "function" ||
    !UTILS.isValidTime(time)
  ) {
    return new Date()
  }

  const [hours, minutes] = time.split(":").map(Number)

  return new Date(
    serviceDate.getFullYear(),
    serviceDate.getMonth(),
    serviceDate.getDate(),
    hours,
    minutes,
    Number(extraSeconds) || 0,
    0
  )
}

function getWidgetFamily() {
  return String(config.widgetFamily || "").trim() || "large"
}

function servicesFolderIsEmpty(resolution) {
  const scan = resolution?.scanResult

  if (!scan) return false
  if (String(resolution?.scanError || "").trim()) return false
  if (scan.status === "locked") return false

  return Number(scan.detected) === 0
}

async function resolveVersionBlock(currentDate) {
  let policy

  try {
    policy = await STORAGE.loadVersionPolicy()
  } catch (_) {
    return null
  }

  if (!policy) return null

  const installed = CONFIG.dashboardVersion
  const belowFloor = UTILS.compareVersions(installed, policy.minimumVersion)

  if (belowFloor === null || belowFloor >= 0) return null

  if (policy.latestVersion) {
    const floorAboveLatest = UTILS.compareVersions(policy.minimumVersion, policy.latestVersion)

    if (floorAboveLatest === null || floorAboveLatest > 0) return null
  }

  return {
    ...failure(
      "Mise à jour requise",
      [
        "Cette version de CTS Dashboard n’est plus prise en charge.",
        "",
        "Ouvrez Scriptable, puis lancez CTS Installer pour la mettre à jour."
      ].join("\n"),
      currentDate,
      versionBlockTelemetry()
    ),
    versionBlocked: true,
    installedVersion: installed,
    minimumVersion: policy.minimumVersion
  }
}

function versionBlockTelemetry() {
  return {
    pdfStatus: "not_checked",
    parserStatus: "not_run",
    serviceStatus: "error",
    archiveStatus: "not_run",
    issues: [
      {
        severity: "error",
        errorCode: "VERSION_UPDATE_REQUIRED",
        module: "WidgetEngine",
        stage: "version"
      }
    ],
    timings: null
  }
}

function information(title, message, currentDate, telemetry) {
  return {
    ...failure(title, message, currentDate, telemetry),
    informational: true
  }
}

function failure(title, message, currentDate = new Date(), telemetry = null) {
  return {
    valid: false,
    informational: false,
    errorTitle: String(title || "Erreur"),
    errorMessage: String(message || "Une erreur inconnue est survenue."),
    source: null,
    service: null,
    state: null,
    stats: null,
    displaySlice: null,
    currentDate,
    refreshAfterDate: new Date(currentDate.getTime() + CONFIG.refresh.unknownMs),
    switchAfterDate: null,
    sourceOrigin: "none",
    serviceSelection: null,
    servicesScan: null,
    servicesScanError: "",
    serviceSelectionError: "",
    servicesCleanup: null,
    servicesCleanupError: "",
    telemetry: telemetry || {
      pdfStatus: "not_checked",
      parserStatus: "not_run",
      serviceStatus: "error",
      archiveStatus: "not_run",
      issues: [],
      timings: null
    }
  }
}

module.exports = {
  loadContext,
  getWidgetFamily
}
