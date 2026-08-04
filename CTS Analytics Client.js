// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: chart.bar.xaxis;

const API_URL =
  "https://cts-analytics.nameless-frog-624d.workers.dev"

const REQUEST_TIMEOUT_SECONDS = 12
const RETRY_DELAY_MS = 60 * 60 * 1000

const KEYS = {
  installationId:
    "CTS_ANALYTICS_INSTALLATION_ID",
  clientToken:
    "CTS_ANALYTICS_CLIENT_TOKEN",
  adminApiKey:
    "CTS_ANALYTICS_ADMIN_API_KEY",
  lastActivityDay:
    "CTS_ANALYTICS_LAST_ACTIVITY_DAY",
  lastAttemptAt:
    "CTS_ANALYTICS_LAST_ATTEMPT_AT"
}

function createInstallationId() {
  return (
    UUID.string() +
    UUID.string()
  ).replace(/-/g, "")
}

function getInstallationId() {
  if (Keychain.contains(
    KEYS.installationId
  )) {
    return Keychain.get(
      KEYS.installationId
    )
  }

  const value =
    createInstallationId()

  Keychain.set(
    KEYS.installationId,
    value
  )

  return value
}

function getIOSMajorVersion() {
  const value =
    Number.parseInt(
      String(
        Device.systemVersion()
      ).split(".")[0],
      10
    )

  return Number.isInteger(value)
    ? value
    : null
}

function saveAdminApiKey(value) {
  saveSecret(
    KEYS.adminApiKey,
    value
  )
}

function hasAdminApiKey() {
  return hasSecret(
    KEYS.adminApiKey
  )
}

function removeAdminApiKey() {
  removeKey(
    KEYS.adminApiKey
  )
}

function hasClientToken() {
  return hasSecret(
    KEYS.clientToken
  )
}

function removeClientToken() {
  removeKey(
    KEYS.clientToken
  )
}

async function registerInstallation({
  dashboardVersion
}) {
  const result =
    await sendRequest({
      path: "/register",
      method: "POST",
      body: devicePayload(
        dashboardVersion
      )
    })

  const token =
    result.data?.clientToken

  if (
    result.ok &&
    typeof token === "string" &&
    token.trim()
  ) {
    Keychain.set(
      KEYS.clientToken,
      token.trim()
    )
  }

  return result
}

async function registerActivity({
  dashboardVersion
}) {
  return sendRequest({
    path: "/activity",
    method: "POST",
    apiKey:
      readRequiredSecret(
        KEYS.clientToken,
        "client_token_missing"
      ),
    body: devicePayload(
      dashboardVersion
    )
  })
}

async function registerDailyActivity({
  dashboardVersion
}) {
  const version =
    normalizeVersion(
      dashboardVersion
    )

  const today =
    new Date()
      .toISOString()
      .slice(0, 10)

  if (
    readKey(
      KEYS.lastActivityDay
    ) === today
  ) {
    return {
      ok: true,
      skipped: true,
      reason:
        "already_registered_today"
    }
  }

  const lastAttempt =
    Number(
      readKey(
        KEYS.lastAttemptAt
      )
    ) || 0

  if (
    lastAttempt &&
    Date.now() - lastAttempt <
      RETRY_DELAY_MS
  ) {
    return {
      ok: true,
      skipped: true,
      reason:
        "retry_delayed"
    }
  }

  Keychain.set(
    KEYS.lastAttemptAt,
    String(Date.now())
  )

  try {
    if (!hasClientToken()) {
      const registration =
        await registerInstallation({
          dashboardVersion:
            version
        })

      if (!registration.ok) {
        return registration
      }
    }

    let activity =
      await registerActivity({
        dashboardVersion:
          version
      })

    if (
      !activity.ok &&
      activity.statusCode === 401
    ) {
      removeClientToken()

      const registration =
        await registerInstallation({
          dashboardVersion:
            version
        })

      if (!registration.ok) {
        return registration
      }

      activity =
        await registerActivity({
          dashboardVersion:
            version
        })
    }

    if (activity.ok) {
      Keychain.set(
        KEYS.lastActivityDay,
        today
      )

      removeKey(
        KEYS.lastAttemptAt
      )
    }

    return activity
  } catch (error) {
    return {
      ok: false,
      statusCode: null,
      error:
        error?.message ||
        String(error)
    }
  }
}

async function getStatistics() {
  return sendRequest({
    path: "/stats",
    method: "GET",
    apiKey:
      readRequiredSecret(
        KEYS.adminApiKey,
        "admin_api_key_missing"
      )
  })
}

async function checkHealth() {
  return sendRequest({
    path: "/health",
    method: "GET"
  })
}

function devicePayload(
  dashboardVersion
) {
  return {
    installationId:
      getInstallationId(),

    dashboardVersion:
      normalizeVersion(
        dashboardVersion
      ),

    iosMajorVersion:
      getIOSMajorVersion()
  }
}

function normalizeVersion(value) {
  const version =
    String(value || "").trim()

  if (!version) {
    throw new Error(
      "dashboard_version_missing"
    )
  }

  return version
}

function saveSecret(key, value) {
  const secret =
    String(value || "").trim()

  if (!secret) {
    throw new Error(
      "La clé ne peut pas être vide."
    )
  }

  Keychain.set(
    key,
    secret
  )
}

function hasSecret(key) {
  return Boolean(
    readKey(key)?.trim()
  )
}

function readRequiredSecret(
  key,
  errorCode
) {
  const value =
    readKey(key)?.trim()

  if (!value) {
    throw new Error(errorCode)
  }

  return value
}

function readKey(key) {
  return Keychain.contains(key)
    ? String(
        Keychain.get(key) || ""
      )
    : ""
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
  body = null
}) {
  const request =
    new Request(
      `${API_URL}${path}`
    )

  request.method = method
  request.timeoutInterval =
    REQUEST_TIMEOUT_SECONDS

  const headers = {
    Accept:
      "application/json"
  }

  if (apiKey) {
    headers.Authorization =
      `Bearer ${String(apiKey).trim()}`
  }

  if (body !== null) {
    headers["Content-Type"] =
      "application/json"

    request.body =
      JSON.stringify(body)
  }

  request.headers =
    headers

  try {
    const response =
      await request.loadJSON()

    const statusCode =
      Number(
        request.response?.statusCode
      )

    if (
      !Number.isFinite(statusCode) ||
      statusCode < 200 ||
      statusCode >= 300 ||
      response?.ok !== true
    ) {
      return {
        ok: false,
        statusCode:
          Number.isFinite(statusCode)
            ? statusCode
            : null,
        error:
          response?.error ||
          "invalid_response"
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
      statusCode:
        Number(
          request.response?.statusCode
        ) || null,
      error:
        error?.message ||
        String(error)
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

  getStatistics,
  checkHealth
}
