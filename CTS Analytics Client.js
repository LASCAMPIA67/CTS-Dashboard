// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: chart.bar.xaxis;

const API_URL =
  "https://cts-analytics.nameless-frog-624d.workers.dev"

const REQUEST_TIMEOUT_SECONDS = 12

const KEYCHAIN_KEYS = {
  installationId:
    "CTS_ANALYTICS_INSTALLATION_ID",

  clientToken:
    "CTS_ANALYTICS_CLIENT_TOKEN",

  adminApiKey:
    "CTS_ANALYTICS_ADMIN_API_KEY"
}

function createInstallationId() {
  return [
    UUID.string(),
    UUID.string()
  ]
    .join("")
    .replace(/-/g, "")
}

function getInstallationId() {
  const key =
    KEYCHAIN_KEYS.installationId

  if (Keychain.contains(key)) {
    return Keychain.get(key)
  }

  const installationId =
    createInstallationId()

  Keychain.set(
    key,
    installationId
  )

  return installationId
}

function getIOSMajorVersion() {
  const version =
    String(
      Device.systemVersion()
    )

  const major =
    Number.parseInt(
      version.split(".")[0],
      10
    )

  return Number.isInteger(major)
    ? major
    : null
}

function saveAdminApiKey(value) {
  saveSecret(
    KEYCHAIN_KEYS.adminApiKey,
    value
  )
}

function hasAdminApiKey() {
  return hasSecret(
    KEYCHAIN_KEYS.adminApiKey
  )
}

function removeAdminApiKey() {
  removeSecret(
    KEYCHAIN_KEYS.adminApiKey
  )
}

function hasClientToken() {
  return hasSecret(
    KEYCHAIN_KEYS.clientToken
  )
}

function removeClientToken() {
  removeSecret(
    KEYCHAIN_KEYS.clientToken
  )
}

async function registerInstallation({
  dashboardVersion
}) {
  const result =
    await sendRequest({
      path: "/register",
      method: "POST",
      body: {
        installationId:
          getInstallationId(),

        dashboardVersion,

        iosMajorVersion:
          getIOSMajorVersion()
      }
    })

  if (
    result.ok &&
    typeof result.data?.clientToken
      === "string" &&
    result.data.clientToken.trim()
  ) {
    Keychain.set(
      KEYCHAIN_KEYS.clientToken,
      result.data.clientToken.trim()
    )
  }

  return result
}

async function registerActivity({
  dashboardVersion
}) {
  const clientToken =
    readRequiredSecret(
      KEYCHAIN_KEYS.clientToken,
      "client_token_missing"
    )

  return sendRequest({
    path: "/activity",
    apiKey:
      clientToken,
    method: "POST",
    body: {
      installationId:
        getInstallationId(),

      dashboardVersion,

      iosMajorVersion:
        getIOSMajorVersion()
    }
  })
}

async function getStatistics() {
  const adminApiKey =
    readRequiredSecret(
      KEYCHAIN_KEYS.adminApiKey,
      "admin_api_key_missing"
    )

  return sendRequest({
    path: "/stats",
    apiKey:
      adminApiKey,
    method: "GET"
  })
}

async function checkHealth() {
  return sendRequest({
    path: "/health",
    method: "GET"
  })
}

function saveSecret(
  key,
  value
) {
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
  return (
    Keychain.contains(key) &&
    Boolean(
      String(
        Keychain.get(key) || ""
      ).trim()
    )
  )
}

function readRequiredSecret(
  key,
  errorCode
) {
  if (!hasSecret(key)) {
    throw new Error(errorCode)
  }

  return String(
    Keychain.get(key)
  ).trim()
}

function removeSecret(key) {
  if (Keychain.contains(key)) {
    Keychain.remove(key)
  }
}

async function sendRequest({
  path,
  apiKey = null,
  method,
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
  getStatistics,
  checkHealth
}