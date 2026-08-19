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
const normalizeImportTimings = UTILS.normalizeImportTimings
const isValidDate = UTILS.isUsableDate
const SERVICES_SCAN_REFRESH_MS = 15 * 60 * 1000
const PENDING_SCAN_REFRESH_MS = 60 * 1000
const FAILED_SCAN_REFRESH_MS = 5 * 60 * 1000
const MAX_TELEMETRY_ISSUES = 12

async function loadContext(currentDate = new Date()) {
  CONFIG.ensureDirectories()

  const resolution = await resolveServiceSource(currentDate)
  const cleanup = await runServicesCleanup(currentDate)
  const source = resolution.source

  if (!source) {
    return buildMissingServiceFailure(resolution, cleanup, currentDate)
  }

  const telemetry = buildContextTelemetry(resolution, cleanup, true)

  try {
    await STORAGE.ensureReadable(CONFIG.files.places)
  } catch (_) {}

  const normalized = SERVICE_ENGINE.normalizeService(source)

  if (!normalized.valid) {
    telemetry.serviceStatus = "error"

    addDiagnosticIssue(telemetry, {
      severity: "error",
      errorCode: "SERVICE_NORMALIZATION_FAILED",
      module: "WidgetEngine",
      stage: "service"
    })

    return failure("Service invalide", normalized.error, currentDate, telemetry)
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

  const stats = SERVICE_ENGINE.computeStats(service)
  const displaySlice = SERVICE_ENGINE.getDisplaySlice(service, state)

  if (!displaySlice) {
    telemetry.serviceStatus = "error"

    addDiagnosticIssue(telemetry, {
      severity: "error",
      errorCode: "SERVICE_DISPLAY_SLICE_MISSING",
      module: "WidgetEngine",
      stage: "service"
    })

    return failure(
      "Service invalide",
      "Aucune tranche ne peut être affichée.",
      currentDate,
      telemetry
    )
  }

  const serviceRefreshAfterDate = computeNextRefreshDate(service, state, currentDate)

  const automaticResolution = {
    ...resolution,
    cleanupResult: cleanup.result,
    cleanupError: cleanup.error,
    cleanupTelemetryCode: cleanup.telemetryCode,
    cleanupTelemetryStage: cleanup.telemetryStage
  }

  const switchAfterDate = computeSelectionSwitchDate(automaticResolution, currentDate)

  const refreshAfterDate = computeAutomaticRefreshDate(
    serviceRefreshAfterDate,
    automaticResolution,
    currentDate
  )

  return {
    valid: true,
    errorTitle: "",
    errorMessage: "",
    source,
    service,
    state,
    stats,
    displaySlice,
    currentDate,
    refreshAfterDate,
    switchAfterDate,
    sourceOrigin: resolution.origin,
    serviceSelection: resolution.selection,
    servicesScan: resolution.scanResult,
    servicesScanError: resolution.scanError,
    serviceSelectionError: resolution.selectionError,
    servicesCleanup: cleanup.result,
    servicesCleanupError: cleanup.error,
    telemetry
  }
}

async function resolveServiceSource(currentDate) {
  const scan = await runServicesScan()
  const selection = await resolveIndexedService(currentDate)

  if (selection.result?.found && selection.result.source) {
    return {
      source: selection.result.source,
      origin: "services-index",
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

  return {
    source: null,
    origin: "none",
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

async function runServicesScan() {
  try {
    const maximumFiles = Math.max(1, Number(CONFIG.pdf?.maximumFilesPerRun) || 1)

    const result = await SERVICES_MANAGER.scanServices({
      maximumFiles
    })

    return {
      result,
      error: "",
      telemetryCode: "",
      telemetryStage: ""
    }
  } catch (error) {
    const safeError = UTILS.safeError(error)
    const telemetry = telemetryFromError(error, "SERVICES_SCAN_FAILED", "scan")

    return {
      result: null,
      error: safeError.message,
      telemetryCode: telemetry.code,
      telemetryStage: telemetry.stage
    }
  }
}

async function resolveIndexedService(currentDate) {
  try {
    const result = await SERVICES_MANAGER.resolveServiceForDate(currentDate)

    return {
      result,
      error: "",
      telemetryCode: "",
      telemetryStage: ""
    }
  } catch (error) {
    const safeError = UTILS.safeError(error)
    const telemetry = telemetryFromError(error, "SERVICE_SELECTION_FAILED", "selection")

    return {
      result: null,
      error: safeError.message,
      telemetryCode: telemetry.code,
      telemetryStage: telemetry.stage
    }
  }
}

async function runServicesCleanup(currentDate) {
  try {
    const result = await SERVICES_CLEANER.maintainServices(currentDate)
    const cleanupError = extractCleanupError(result)
    const telemetryIssues = extractCleanupTelemetryIssues(result)
    const primaryTelemetry = telemetryIssues[0] || null

    return {
      result,
      error: cleanupError,
      telemetryCode: cleanupError
        ? primaryTelemetry?.errorCode || "SERVICES_CLEANUP_FAILED"
        : "",
      telemetryStage: cleanupError ? primaryTelemetry?.stage || "archive" : "",
      telemetryIssues
    }
  } catch (error) {
    const safeError = UTILS.safeError(error)
    const telemetry = telemetryFromError(error, "SERVICES_CLEANUP_FAILED", "archive")

    return {
      result: null,
      error: safeError.message,
      telemetryCode: telemetry.code,
      telemetryStage: telemetry.stage,
      telemetryIssues: [
        {
          errorCode: telemetry.code,
          stage: telemetry.stage
        }
      ]
    }
  }
}

function extractCleanupError(result) {
  if (!result || result.success !== false) {
    return ""
  }

  const errors = Array.isArray(result.errors) ? result.errors : []
  const messages = errors.map(item => String(item?.error || "").trim()).filter(Boolean)

  if (messages.length) {
    return messages.join(" · ")
  }

  return "L’entretien automatique des services a rencontré une erreur."
}

function extractCleanupTelemetryIssues(result) {
  if (!result || result.success !== false) {
    return []
  }

  const errors = Array.isArray(result.errors) ? result.errors : []
  const issues = []

  for (const item of errors) {
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

function buildMissingServiceFailure(resolution, cleanup, currentDate) {
  return {
    ...buildMissingServiceContext(resolution, cleanup, currentDate),
    servicesScan: resolution?.scanResult || null,
    servicesScanError: String(resolution?.scanError || "")
  }
}

function buildMissingServiceContext(resolution, cleanup, currentDate) {
  const scanResult = resolution?.scanResult
  const telemetry = buildContextTelemetry(resolution, cleanup, false)
  const scanError = String(resolution?.scanError || "").trim()

  if (scanError) {
    return failure(
      "Erreur d’analyse PDF",
      ["Le dossier Services n’a pas pu être analysé.", "", scanError].join("\n"),
      currentDate,
      telemetry
    )
  }

  const detectionErrors = Array.isArray(scanResult?.detectionErrors)
    ? scanResult.detectionErrors
    : []

  if (detectionErrors.length) {
    const first = detectionErrors[0]
    const fileName = displayFileName(first?.fileName)
    const error = firstUsefulError(first)

    return failure(
      "PDF inaccessible",
      [
        `${fileName} a bien été détecté dans le dossier Services,`,
        "mais CTS Dashboard n’arrive pas à lire ce fichier.",
        "",
        error || "Le fichier est peut-être indisponible dans iCloud."
      ].join("\n"),
      currentDate,
      telemetry
    )
  }

  const currentFailures = Array.isArray(scanResult?.failed) ? scanResult.failed : []
  const knownFailures = Array.isArray(scanResult?.knownFailures) ? scanResult.knownFailures : []
  const failedImports = currentFailures.length ? currentFailures : knownFailures

  if (failedImports.length) {
    const first = failedImports[0]
    const fileName = displayFileName(first?.detectedFileName || first?.sourceFileName)
    const error = firstUsefulError(first)
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
        error
      ]
        .filter(value => String(value || "").length > 0)
        .join("\n"),
      currentDate,
      telemetry
    )
  }

  const selectionError = String(resolution?.selectionError || "").trim()

  if (selectionError) {
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

  if (scanResult?.status === "locked") {
    addDiagnosticIssue(telemetry, {
      severity: "warning",
      errorCode: "SERVICES_SCAN_LOCKED",
      module: "ServicesManager",
      stage: "scan_lock"
    })

    const locked = failure(
      "Analyse en cours",
      [
        "Ta carte agent est en cours de lecture.",
        "",
        "Le widget se met à jour tout seul dans un instant."
      ].join("\n"),
      currentDate,
      telemetry
    )

    return {
      ...locked,
      refreshAfterDate: new Date(currentDate.getTime() + CONFIG.refresh.activeMs)
    }
  }

  const detected = Math.max(0, Number(scanResult?.detected ?? scanResult?.scanned ?? 0) || 0)

  if (detected > 0) {
    telemetry.pdfStatus = "found"

    telemetry.serviceStatus = "not_found"

    addDiagnosticIssue(telemetry, {
      severity: "warning",
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

  const errors = Array.isArray(value?.errors)
    ? value.errors
        .map(item => (typeof item === "string" ? item : item?.message || item?.error || ""))
        .map(item => String(item || "").trim())
        .filter(Boolean)
    : []

  if (errors.length) {
    return errors.join(" · ")
  }

  const detailsMessage = String(value?.details?.message || "").trim()

  if (detailsMessage) {
    return detailsMessage
  }

  return ""
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
  const detected = Math.max(0, Number(scanResult?.detected ?? scanResult?.scanned ?? 0) || 0)

  if (detected > 0) {
    telemetry.pdfStatus = "found"
  }

  if (resolution?.scanError) {
    telemetry.pdfStatus = "read_error"

    addDiagnosticIssue(telemetry, {
      severity: hasSource ? "warning" : "error",
      errorCode: resolution.scanTelemetryCode || "SERVICES_SCAN_FAILED",
      module: "ServicesManager",
      stage: resolution.scanTelemetryStage || "scan"
    })
  }

  const detectionErrors = Array.isArray(scanResult?.detectionErrors)
    ? scanResult.detectionErrors
    : []

  for (const item of detectionErrors) {
    telemetry.pdfStatus = "read_error"

    addDiagnosticIssue(telemetry, {
      severity: hasSource ? "warning" : "error",
      errorCode: item?.telemetryCode || "PDF_INSPECTION_FAILED",
      module: "ServicesManager",
      stage: item?.telemetryStage || item?.stage || "inspection"
    })
  }

  const imported = Array.isArray(scanResult?.imported) ? scanResult.imported : []

  if (imported.length) {
    telemetry.pdfStatus = telemetry.pdfStatus === "read_error" ? "read_error" : "found"

    telemetry.parserStatus = "success"

    telemetry.timings = normalizeImportTimings(imported[0]?.timings)
  }

  const failed = Array.isArray(scanResult?.failed) ? scanResult.failed : []

  for (const item of failed) {
    applyImportFailureTelemetry(telemetry, item, hasSource)
  }

  if (!failed.length && !hasSource) {
    const knownFailures = Array.isArray(scanResult?.knownFailures)
      ? scanResult.knownFailures
      : []

    if (knownFailures.length) {
      applyImportFailureTelemetry(telemetry, knownFailures[0], false)
    }
  }

  if (resolution?.selectionError) {
    telemetry.serviceStatus = hasSource ? "found" : "error"

    addDiagnosticIssue(telemetry, {
      severity: hasSource ? "warning" : "error",
      errorCode: resolution.selectionTelemetryCode || "SERVICE_SELECTION_FAILED",
      module: "ServicesManager",
      stage: resolution.selectionTelemetryStage || "selection"
    })
  }

  if (cleanup?.result?.status === "locked") {
    telemetry.archiveStatus = "not_run"
  } else if (cleanup?.result) {
    telemetry.archiveStatus = cleanup.result.success === false ? "error" : "success"
  }

  if (cleanup?.error) {
    telemetry.archiveStatus = "error"

    const cleanupIssues =
      Array.isArray(cleanup?.telemetryIssues) && cleanup.telemetryIssues.length
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

  if (!hasSource && detected <= 0 && telemetry.pdfStatus === "not_checked") {
    telemetry.pdfStatus = "missing"
  }

  return telemetry
}

function applyImportFailureTelemetry(telemetry, item, hasSource) {
  const status = String(item?.status || "")

  const fallbackCode =
    status === "validation-error" ? "HASTUS_VALIDATION_FAILED" : "SERVICE_IMPORT_FAILED"

  const fallbackStage = status === "validation-error" ? "validation" : "import"
  const code = normalizeTelemetryCode(item?.telemetryCode, fallbackCode)
  const stage = normalizeTelemetryStage(item?.telemetryStage, fallbackStage)

  const pdfStages = new Set([
    "source",
    "metadata",
    "inspection",
    "engine",
    "engine_install",
    "extraction"
  ])

  const parsedStages = new Set([
    "validation",
    "registration",
    "cache",
    "text_cache",
    "canonicalize",
    "index",
    "activation"
  ])

  if (pdfStages.has(stage)) {
    telemetry.pdfStatus = "read_error"
  } else if (telemetry.pdfStatus !== "read_error") {
    telemetry.pdfStatus = "found"
  }

  if (stage === "parser") {
    telemetry.parserStatus = "error"
  } else if (parsedStages.has(stage)) {
    telemetry.parserStatus = "success"
  }

  if (stage === "validation") {
    telemetry.serviceStatus = hasSource ? "found" : "not_found"
  } else if (
    stage === "registration" ||
    stage === "cache" ||
    stage === "text_cache" ||
    stage === "canonicalize" ||
    stage === "index" ||
    stage === "activation" ||
    stage === "database" ||
    stage === "import"
  ) {
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
  if (
    !telemetry ||
    !Array.isArray(telemetry.issues) ||
    telemetry.issues.length >= MAX_TELEMETRY_ISSUES
  ) {
    return
  }

  const normalized = {
    severity: normalizeIssueSeverity(issue?.severity),
    errorCode: normalizeTelemetryCode(issue?.errorCode, "DASHBOARD_UNKNOWN_ERROR"),
    module: normalizeTelemetryLabel(issue?.module, "WidgetEngine"),
    stage: normalizeTelemetryStage(issue?.stage, "unknown")
  }

  const duplicate = telemetry.issues.some(
    current =>
      current.errorCode === normalized.errorCode &&
      current.module === normalized.module &&
      current.stage === normalized.stage
  )

  if (!duplicate) {
    telemetry.issues.push(normalized)
  }
}

function normalizeIssueSeverity(value) {
  const severity = String(value || "error")
    .trim()
    .toLowerCase()

  return ["warning", "error", "fatal"].includes(severity) ? severity : "error"
}

function normalizeTelemetryCode(value, fallback) {
  const normalized = String(value || fallback || "DASHBOARD_UNKNOWN_ERROR")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .slice(0, 64)

  return normalized || "DASHBOARD_UNKNOWN_ERROR"
}

function normalizeTelemetryStage(value, fallback) {
  const normalized = String(value || fallback || "unknown")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 50)

  return normalized || "unknown"
}

function normalizeTelemetryLabel(value, fallback) {
  return normalizeTelemetryStage(value, fallback)
}

function computeAutomaticRefreshDate(serviceRefreshAfterDate, resolution, currentDate) {
  const scanRefreshAfterDate = computeScanRefreshDate(resolution, currentDate)
  const switchAfterDate = computeSelectionSwitchDate(resolution, currentDate)

  return earliestValidDate(
    [serviceRefreshAfterDate, scanRefreshAfterDate, switchAfterDate],
    new Date(currentDate.getTime() + SERVICES_SCAN_REFRESH_MS),
    currentDate
  )
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

function computeScanRefreshDate(resolution, currentDate) {
  const scanResult = resolution?.scanResult
  let delay = SERVICES_SCAN_REFRESH_MS

  if (scanResult?.status === "locked" || Number(scanResult?.remaining) > 0) {
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

  return activeRefreshDate < sliceEndDate ? activeRefreshDate : sliceEndDate
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
  computeNextRefreshDate,
  dateForServiceTime,
  getWidgetFamily
}
