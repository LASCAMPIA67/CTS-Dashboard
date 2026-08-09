// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: yellow; icon-glyph: shippingbox.fill;

// CTS Resources.js
// Validation et réparation à la demande des bases CTS.

const CONFIG = importModule("CTS Config")
const STORAGE = importModule("CTS Storage")

const {
  fm,
  files,
  repository,
  ensureDirectories
} = CONFIG

const RESOURCES_VERSION = 4
const REQUEST_TIMEOUT_SECONDS = 20

const DATABASES = Object.freeze([
  {
    name: "lines.json",
    path: files.lines
  },
  {
    name: "stops.json",
    path: files.stops
  },
  {
    name: "places.json",
    path: files.places
  }
])

async function ensureInstalled() {
  ensureDirectories()

  const installed = []
  const repaired = []
  const preserved = []

  for (const resource of DATABASES) {
    const status = await ensureDatabase(resource)

    if (status === "installed") {
      installed.push(resource.name)
    } else if (status === "repaired") {
      repaired.push(resource.name)
    } else {
      preserved.push(resource.name)
    }
  }

  return {
    version: RESOURCES_VERSION,
    installed,
    repaired,
    preserved
  }
}

async function ensureDatabase(resource) {
  const existed = fm.fileExists(resource.path)

  if (await isValidDatabase(resource.path)) {
    return "preserved"
  }

  const content = await downloadDatabase(resource.name)
  const parsed = parseDatabase(content, resource.name)

  await STORAGE.writeTextSafely(
    resource.path,
    JSON.stringify(parsed, null, 2)
  )

  if (!await isValidDatabase(resource.path)) {
    throw new Error(
      `${resource.name} reste invalide après réparation.`
    )
  }

  return existed ? "repaired" : "installed"
}

async function isValidDatabase(path) {
  try {
    if (!await STORAGE.ensureDownloaded(path)) {
      return false
    }

    const content = fm.readString(path).trim()

    if (!content) {
      return false
    }

    const value = JSON.parse(content)

    return Boolean(
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length
    )
  } catch (_) {
    return false
  }
}

async function downloadDatabase(name) {
  const request = new Request(rawUrl(name))
  request.timeoutInterval = REQUEST_TIMEOUT_SECONDS
  request.headers = {
    "Cache-Control": "no-cache",
    Pragma: "no-cache"
  }

  let content

  try {
    content = await request.loadString()
  } catch (error) {
    throw new Error(
      `${name} impossible à télécharger : ${messageOf(error)}`
    )
  }

  const statusCode = Number(request.response?.statusCode)

  if (
    Number.isFinite(statusCode) &&
    (statusCode < 200 || statusCode >= 300)
  ) {
    throw new Error(
      `${name} impossible à télécharger : HTTP ${statusCode}`
    )
  }

  return content
}

function parseDatabase(content, name) {
  try {
    const value = JSON.parse(String(content || ""))

    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      !Object.keys(value).length
    ) {
      throw new Error("racine JSON invalide")
    }

    return value
  } catch (error) {
    throw new Error(
      `${name} invalide : ${messageOf(error)}`
    )
  }
}

function rawUrl(name) {
  return [
    "https://raw.githubusercontent.com",
    encodeURIComponent(repository.owner),
    encodeURIComponent(repository.name),
    encodeURIComponent(repository.branch),
    encodeURIComponent(name)
  ].join("/") + `?t=${Date.now()}`
}

function messageOf(error) {
  return error?.message?.trim?.() || String(error || "Erreur inconnue")
}

module.exports = {
  RESOURCES_VERSION,
  ensureInstalled
}
