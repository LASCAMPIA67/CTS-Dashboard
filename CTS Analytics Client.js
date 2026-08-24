// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: chart.bar.xaxis;

const API_URL = "https://cts-analytics.nameless-frog-624d.workers.dev"
const REQUEST_TIMEOUT_SECONDS = 12
const TELEMETRY_TIMEOUT_SECONDS = 8
const RETRY_DELAY_MS = 60 * 60 * 1000
const MAX_TELEMETRY_ISSUES = 50

const KEYS = {
  installationId: "CTS_ANALYTICS_INSTALLATION_ID",
  clientToken: "CTS_ANALYTICS_CLIENT_TOKEN",
  adminApiKey: "CTS_ANALYTICS_ADMIN_API_KEY",
  lastActivityDay: "CTS_ANALYTICS_LAST_ACTIVITY_DAY",
  lastAttemptAt: "CTS_ANALYTICS_LAST_ATTEMPT_AT"
}

const TELEMETRY_STAGE_PROPERTIES = {
  pdf: "pdfStatus",
  parser: "parserStatus",
  service: "serviceStatus",
  render: "renderStatus",
  archive: "archiveStatus"
}

const TELEMETRY_STAGE_VALUES = {
  pdf: new Set(["not_checked", "found", "missing", "read_error"]),
  parser: new Set(["not_run", "success", "error"]),
  service: new Set(["not_run", "found", "not_found", "error"]),
  render: new Set(["not_run", "success", "error"]),
  archive: new Set(["not_run", "success", "error"])
}

const TELEMETRY_RUN_STATUSES = new Set(["success", "warning", "error"])
const TELEMETRY_SEVERITIES = new Set(["warning", "error", "fatal"])
const TELEMETRY_CONTEXTS = new Set(["widget", "app"])

function createOpaqueId() {
  return (UUID.string() + UUID.string()).replace(/-/g, "")
}

function createInstallationId() {
  return createOpaqueId()
}

function createTelemetryRunId() {
  return createOpaqueId()
}

function createTelemetryIssueId() {
  return createOpaqueId()
}

function getInstallationId() {
  if (Keychain.contains(KEYS.installationId)) {
    return Keychain.get(KEYS.installationId)
  }

  const value = createInstallationId()

  Keychain.set(KEYS.installationId, value)

  return value
}

function getIOSMajorVersion() {
  const value = Number.parseInt(String(Device.systemVersion()).split(".")[0], 10)

  return Number.isInteger(value) ? value : null
}

function saveAdminApiKey(value) {
  saveSecret(KEYS.adminApiKey, value)
}

function hasAdminApiKey() {
  return hasSecret(KEYS.adminApiKey)
}

function removeAdminApiKey() {
  removeKey(KEYS.adminApiKey)
}

function hasClientToken() {
  return hasSecret(KEYS.clientToken)
}

function removeClientToken() {
  removeKey(KEYS.clientToken)
}

async function registerInstallation({ dashboardVersion }) {
  const result = await sendRequest({
    path: "/register",
    method: "POST",
    body: devicePayload(dashboardVersion)
  })

  const token = result.data?.clientToken

  if (result.ok && typeof token === "string" && token.trim()) {
    Keychain.set(KEYS.clientToken, token.trim())
  }

  return withVersionPolicy(result)
}

async function registerActivity({ dashboardVersion }) {
  return withVersionPolicy(
    await sendRequest({
      path: "/activity",
      method: "POST",
      apiKey: readRequiredSecret(KEYS.clientToken, "client_token_missing"),
      body: devicePayload(dashboardVersion)
    })
  )
}

/*
 * La politique de version voyage dans les réponses que ce client reçoit
 * déjà — aucun appel n'est ajouté pour elle.
 *
 * Ce module la rapporte, il ne l'applique pas et ne l'écrit nulle part :
 * celui qui parle au réseau ne doit pas être celui qui décide d'éteindre
 * le widget. Il n'importe d'ailleurs aucun autre module, et cela doit le
 * rester.
 */
function withVersionPolicy(result) {
  const policy = result?.data?.versionPolicy

  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    return result
  }

  const minimumVersion = String(policy.minimumVersion || "").trim()

  if (!minimumVersion) return result

  return {
    ...result,
    versionPolicy: {
      minimumVersion,
      latestVersion: String(policy.latestVersion || "").trim()
    }
  }
}

async function registerDailyActivity({ dashboardVersion }) {
  const version = normalizeVersion(dashboardVersion)
  const today = new Date().toISOString().slice(0, 10)

  if (readKey(KEYS.lastActivityDay) === today) {
    return {
      ok: true,
      skipped: true,
      reason: "already_registered_today"
    }
  }

  const lastAttempt = Number(readKey(KEYS.lastAttemptAt)) || 0

  if (lastAttempt && Date.now() - lastAttempt < RETRY_DELAY_MS) {
    return {
      ok: true,
      skipped: true,
      reason: "retry_delayed"
    }
  }

  Keychain.set(KEYS.lastAttemptAt, String(Date.now()))

  try {
    if (!hasClientToken()) {
      const registration = await registerInstallation({
        dashboardVersion: version
      })

      if (!registration.ok) {
        return registration
      }
    }

    let activity = await registerActivity({
      dashboardVersion: version
    })

    if (!activity.ok && activity.statusCode === 401) {
      removeClientToken()

      const registration = await registerInstallation({
        dashboardVersion: version
      })

      if (!registration.ok) {
        return registration
      }

      activity = await registerActivity({
        dashboardVersion: version
      })
    }

    if (activity.ok) {
      Keychain.set(KEYS.lastActivityDay, today)

      removeKey(KEYS.lastAttemptAt)
    }

    return activity
  } catch (error) {
    return {
      ok: false,
      statusCode: null,
      error: error?.message || String(error)
    }
  }
}

function createTelemetryRun({ executionContext = "widget" } = {}) {
  const context = String(executionContext || "").trim()

  if (!TELEMETRY_CONTEXTS.has(context)) {
    throw new Error("invalid_execution_context")
  }

  return {
    runId: createTelemetryRunId(),
    startedAt: Date.now(),
    executionContext: context,
    status: "success",
    durationMs: null,
    pdfStatus: "not_checked",
    parserStatus: "not_run",
    serviceStatus: "not_run",
    renderStatus: "not_run",
    archiveStatus: "not_run",
    issues: []
  }
}

function setTelemetryRunStatus(run, status) {
  ensureTelemetryRun(run)

  const value = String(status || "").trim()

  if (!TELEMETRY_RUN_STATUSES.has(value)) {
    throw new Error("invalid_telemetry_status")
  }

  run.status = value

  return run
}

function setTelemetryStage(run, stage, status) {
  ensureTelemetryRun(run)

  const stageName = String(stage || "").trim()
  const property = TELEMETRY_STAGE_PROPERTIES[stageName]
  const allowedValues = TELEMETRY_STAGE_VALUES[stageName]

  if (!property || !allowedValues) {
    throw new Error("invalid_telemetry_stage")
  }

  const value = String(status || "").trim()

  if (!allowedValues.has(value)) {
    throw new Error("invalid_telemetry_stage_status")
  }

  run[property] = value

  return run
}

function addTelemetryIssue(run, { severity = "error", errorCode, module, stage = null }) {
  ensureTelemetryRun(run)

  if (run.issues.length >= MAX_TELEMETRY_ISSUES) {
    return null
  }

  const normalizedSeverity = String(severity || "").trim()

  if (!TELEMETRY_SEVERITIES.has(normalizedSeverity)) {
    throw new Error("invalid_issue_severity")
  }

  const normalizedCode = normalizeErrorCode(errorCode)
  const normalizedModule = normalizeTelemetryLabel(module, "module")

  const normalizedStage =
    stage === null || stage === undefined || stage === ""
      ? null
      : normalizeTelemetryLabel(stage, "stage")

  const issue = {
    issueId: createTelemetryIssueId(),
    severity: normalizedSeverity,
    errorCode: normalizedCode,
    module: normalizedModule,
    stage: normalizedStage
  }

  run.issues.push(issue)

  return issue
}

function finishTelemetryRun(run) {
  ensureTelemetryRun(run)

  if (run.durationMs === null || run.durationMs === undefined) {
    const startedAt = Number(run.startedAt)

    if (Number.isFinite(startedAt)) {
      run.durationMs = Math.max(0, Math.min(300000, Math.round(Date.now() - startedAt)))
    }
  }

  normalizeTelemetrySignals(run)

  run.status = deriveTelemetryRunStatus(run)

  return run
}

async function registerTelemetry({ dashboardVersion, run }) {
  const version = normalizeVersion(dashboardVersion)
  const telemetryRun = normalizeTelemetryRunForSend(finishTelemetryRun(run))

  return sendRequest({
    path: "/telemetry",
    method: "POST",
    apiKey: readRequiredSecret(KEYS.clientToken, "client_token_missing"),
    body: {
      ...devicePayload(version),
      run: telemetryRun
    },
    timeoutSeconds: TELEMETRY_TIMEOUT_SECONDS
  })
}

async function registerTelemetrySafely({ dashboardVersion, run }) {
  try {
    const version = normalizeVersion(dashboardVersion)

    if (!hasClientToken()) {
      const registration = await registerInstallation({
        dashboardVersion: version
      })

      if (!registration.ok) {
        return registration
      }
    }

    let result = await registerTelemetry({
      dashboardVersion: version,
      run
    })

    if (!result.ok && result.statusCode === 401) {
      removeClientToken()

      const registration = await registerInstallation({
        dashboardVersion: version
      })

      if (!registration.ok) {
        return registration
      }

      result = await registerTelemetry({
        dashboardVersion: version,
        run
      })
    }

    return result
  } catch (error) {
    return {
      ok: false,
      statusCode: null,
      error: error?.message || String(error)
    }
  }
}

function normalizeTelemetrySignals(run) {
  ensureTelemetryRun(run)

  const issues = Array.isArray(run.issues) ? run.issues : []

  const hadScanLocked = issues.some(
    issue => String(issue?.errorCode || "").trim() === "SERVICES_SCAN_LOCKED"
  )

  const serviceFound = run.serviceStatus === "found"

  run.issues = issues.filter(issue => {
    const code = String(issue?.errorCode || "").trim()

    if (code === "SERVICES_SCAN_LOCKED") {
      return false
    }

    if (code === "PDF_NOT_FOUND" && serviceFound) {
      return false
    }

    return true
  })

  if (hadScanLocked) {
    if (run.pdfStatus === "missing") {
      run.pdfStatus = "not_checked"
    }

    if (run.serviceStatus === "not_found") {
      run.serviceStatus = "not_run"
    }
  }

  if (serviceFound && run.pdfStatus === "missing") {
    run.pdfStatus = "not_checked"
  }

  return run
}

function deriveTelemetryRunStatus(run) {
  let result = TELEMETRY_RUN_STATUSES.has(run.status) ? run.status : "success"

  for (const issue of run.issues || []) {
    result = strongestTelemetryStatus(result, severityToRunStatus(issue.severity))
  }

  if (
    run.pdfStatus === "read_error" ||
    run.parserStatus === "error" ||
    run.serviceStatus === "error" ||
    run.renderStatus === "error"
  ) {
    result = strongestTelemetryStatus(result, "error")
  }

  if (
    run.pdfStatus === "missing" ||
    run.serviceStatus === "not_found" ||
    run.archiveStatus === "error"
  ) {
    result = strongestTelemetryStatus(result, "warning")
  }

  return result
}

function strongestTelemetryStatus(first, second) {
  const weights = {
    success: 0,
    warning: 1,
    error: 2
  }

  const firstValue = weights[first] ?? 0
  const secondValue = weights[second] ?? 0

  return secondValue > firstValue ? second : first
}

function severityToRunStatus(severity) {
  if (severity === "warning") {
    return "warning"
  }

  if (severity === "error" || severity === "fatal") {
    return "error"
  }

  return "success"
}

function normalizeTelemetryRunForSend(run) {
  return {
    runId: String(run.runId).trim(),
    executionContext: String(run.executionContext).trim(),
    status: String(run.status).trim(),
    durationMs:
      run.durationMs === null || run.durationMs === undefined
        ? null
        : Math.max(0, Math.min(300000, Math.round(Number(run.durationMs)))),
    pdfStatus: String(run.pdfStatus || "not_checked").trim(),
    parserStatus: String(run.parserStatus || "not_run").trim(),
    serviceStatus: String(run.serviceStatus || "not_run").trim(),
    renderStatus: String(run.renderStatus || "not_run").trim(),
    archiveStatus: String(run.archiveStatus || "not_run").trim(),
    issues: Array.isArray(run.issues)
      ? run.issues.slice(0, MAX_TELEMETRY_ISSUES).map(issue => ({
          issueId: String(issue.issueId).trim(),
          severity: String(issue.severity).trim(),
          errorCode: String(issue.errorCode).trim(),
          module: String(issue.module).trim(),
          stage:
            issue.stage === null || issue.stage === undefined || issue.stage === ""
              ? null
              : String(issue.stage).trim()
        }))
      : []
  }
}

function ensureTelemetryRun(run) {
  if (!run || typeof run !== "object" || Array.isArray(run)) {
    throw new Error("invalid_telemetry_run")
  }

  if (typeof run.runId !== "string" || !run.runId.trim()) {
    throw new Error("telemetry_run_id_missing")
  }

  if (!Array.isArray(run.issues)) {
    run.issues = []
  }
}

function normalizeErrorCode(value) {
  const code = String(value || "")
    .trim()
    .toUpperCase()

  if (!/^[A-Z0-9_]{2,64}$/.test(code)) {
    throw new Error("invalid_error_code")
  }

  return code
}

function normalizeTelemetryLabel(value, label) {
  const normalized = String(value || "").trim()

  if (!/^[a-zA-Z0-9._-]{1,50}$/.test(normalized)) {
    throw new Error(`invalid_${label}`)
  }

  return normalized
}

async function getStatistics() {
  return sendRequest({
    path: "/stats",
    method: "GET",
    apiKey: readRequiredSecret(KEYS.adminApiKey, "admin_api_key_missing")
  })
}

async function checkHealth() {
  return sendRequest({
    path: "/health",
    method: "GET"
  })
}

function devicePayload(dashboardVersion) {
  return {
    installationId: getInstallationId(),
    dashboardVersion: normalizeVersion(dashboardVersion),
    iosMajorVersion: getIOSMajorVersion()
  }
}

function normalizeVersion(value) {
  const version = String(value || "").trim()

  if (!version) {
    throw new Error("dashboard_version_missing")
  }

  return version
}

function saveSecret(key, value) {
  const secret = String(value || "").trim()

  if (!secret) {
    throw new Error("La clé ne peut pas être vide.")
  }

  Keychain.set(key, secret)
}

function hasSecret(key) {
  return Boolean(readKey(key)?.trim())
}

function readRequiredSecret(key, errorCode) {
  const value = readKey(key)?.trim()

  if (!value) {
    throw new Error(errorCode)
  }

  return value
}

function readKey(key) {
  return Keychain.contains(key) ? String(Keychain.get(key) || "") : ""
}

function removeKey(key) {
  if (Keychain.contains(key)) {
    Keychain.remove(key)
  }
}

async function sendRequest({
  path,
  method,
  apiKey = null,
  body = null,
  timeoutSeconds = REQUEST_TIMEOUT_SECONDS
}) {
  const request = new Request(`${API_URL}${path}`)

  request.method = method

  request.timeoutInterval = timeoutSeconds

  const headers = {
    Accept: "application/json"
  }

  if (apiKey) {
    headers.Authorization = `Bearer ${String(apiKey).trim()}`
  }

  if (body !== null) {
    headers["Content-Type"] = "application/json"

    request.body = JSON.stringify(body)
  }

  request.headers = headers

  try {
    const response = await request.loadJSON()
    const statusCode = Number(request.response?.statusCode)

    if (
      !Number.isFinite(statusCode) ||
      statusCode < 200 ||
      statusCode >= 300 ||
      response?.ok !== true
    ) {
      return {
        ok: false,
        statusCode: Number.isFinite(statusCode) ? statusCode : null,
        error: response?.error || "invalid_response",
        data: response || null
      }
    }

    return {
      ok: true,
      statusCode,
      data: response
    }
  } catch (error) {
    return {
      ok: false,
      statusCode: Number(request.response?.statusCode) || null,
      error: error?.message || String(error)
    }
  }
}

module.exports = {
  getInstallationId,
  getIOSMajorVersion,
  saveAdminApiKey,
  hasAdminApiKey,
  removeAdminApiKey,
  hasClientToken,
  removeClientToken,
  registerInstallation,
  registerActivity,
  registerDailyActivity,
  createTelemetryRun,
  setTelemetryRunStatus,
  setTelemetryStage,
  addTelemetryIssue,
  finishTelemetryRun,
  registerTelemetry,
  registerTelemetrySafely,
  getStatistics,
  checkHealth
}
