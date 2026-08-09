// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: brown; icon-glyph: archivebox;

// CTS Storage.js
// Accès centralisé au stockage iCloud et aux données persistantes CTS.

const CONFIG = importModule("CTS Config")

const {
  fm,
  files,
  ensureDirectories
} = CONFIG

const MAX_LOG_ENTRIES = 100
const SERVICES_INDEX_VERSION = 2

async function ensureDownloaded(path) {
  if (!fm.fileExists(path)) {
    return false
  }

  if (!fm.isFileDownloaded(path)) {
    await fm.downloadFileFromiCloud(path)
  }

  return true
}

async function readText(path, fallback = "") {
  try {
    if (!await ensureDownloaded(path)) {
      return fallback
    }

    return fm.readString(path)
  } catch (_) {
    return fallback
  }
}

async function readJson(path, fallback = null) {
  try {
    const content = await readText(path, "")

    if (!content.trim()) {
      return fallback
    }

    return JSON.parse(content)
  } catch (_) {
    return fallback
  }
}

function writeText(path, value) {
  ensureDirectories()
  fm.writeString(path, String(value))
}

function writeJson(path, value, pretty = true) {
  writeText(
    path,
    JSON.stringify(value, null, pretty ? 2 : 0)
  )
}

async function writeTextSafely(path, value) {
  ensureDirectories()

  const content = String(value)
  const temporaryPath = `${path}.tmp-${buildUniqueToken()}`

  cleanupLegacyWriteFiles(path)

  let previousFileExisted = false
  let previousContent = ""

  try {
    if (await ensureDownloaded(path)) {
      previousFileExisted = true
      previousContent = fm.readString(path)
    }

    fm.writeString(temporaryPath, content)

    const stagedContent = fm.readString(temporaryPath)

    if (stagedContent !== content) {
      throw new Error(
        "La vérification du fichier temporaire a échoué."
      )
    }

    fm.writeString(path, stagedContent)

    if (fm.readString(path) !== content) {
      throw new Error(
        "La vérification du fichier enregistré a échoué."
      )
    }
  } catch (error) {
    try {
      if (previousFileExisted) {
        fm.writeString(path, previousContent)
      } else if (fm.fileExists(path)) {
        fm.remove(path)
      }
    } catch (_) {}

    throw error
  } finally {
    removeFileQuietly(temporaryPath)
  }
}

async function writeJsonSafely(path, value, pretty = true) {
  await writeTextSafely(
    path,
    JSON.stringify(value, null, pretty ? 2 : 0)
  )
}

function cleanupLegacyWriteFiles(path) {
  removeFileQuietly(`${path}.tmp`)
  removeFileQuietly(`${path}.rollback`)
}

function buildUniqueToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function removeFileQuietly(path) {
  try {
    if (path && fm.fileExists(path)) {
      fm.remove(path)
    }
  } catch (_) {}
}

async function backupService() {
  try {
    if (!await ensureDownloaded(files.service)) {
      return false
    }

    await writeTextSafely(
      files.serviceBackup,
      fm.readString(files.service)
    )

    return true
  } catch (_) {
    return false
  }
}

async function saveService(service) {
  await backupService()
  await writeJsonSafely(files.service, service)
}

async function loadService() {
  return readJson(files.service, null)
}

async function loadBackupService() {
  return readJson(files.serviceBackup, null)
}

function emptyServicesIndex() {
  return {
    version: SERVICES_INDEX_VERSION,
    updatedAt: "",
    services: []
  }
}

async function loadServicesIndex() {
  const value = await readJson(files.servicesIndex, null)

  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return emptyServicesIndex()
  }

  return {
    version:
      Number(value.version) || SERVICES_INDEX_VERSION,
    updatedAt: String(value.updatedAt || ""),
    services: Array.isArray(value.services)
      ? value.services
      : []
  }
}

async function saveServicesIndex(index) {
  const source =
    index && typeof index === "object" && !Array.isArray(index)
      ? index
      : emptyServicesIndex()

  await writeJsonSafely(files.servicesIndex, {
    version:
      Number(source.version) || SERVICES_INDEX_VERSION,
    updatedAt:
      String(source.updatedAt || new Date().toISOString()),
    services: Array.isArray(source.services)
      ? source.services
      : []
  })
}

async function appendLog(type, message, details = null) {
  const current = await readJson(files.importLog, [])
  const logs = Array.isArray(current) ? current : []

  logs.push({
    timestamp: new Date().toISOString(),
    type: String(type || "info"),
    message: String(message || ""),
    details: sanitizeDetails(details)
  })

  try {
    await writeJsonSafely(
      files.importLog,
      logs.slice(-MAX_LOG_ENTRIES)
    )

    return true
  } catch (_) {
    return false
  }
}

async function clearLog() {
  try {
    await writeJsonSafely(files.importLog, [])
    return true
  } catch (_) {
    return false
  }
}

async function loadLog() {
  const value = await readJson(files.importLog, [])
  return Array.isArray(value) ? value : []
}

function fileExists(path) {
  return fm.fileExists(path)
}

function removeFile(path) {
  try {
    if (!fm.fileExists(path)) {
      return false
    }

    fm.remove(path)
    return true
  } catch (_) {
    return false
  }
}

function sanitizeDetails(value) {
  if (value === undefined) {
    return null
  }

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: value.message || String(value),
      stack: value.stack || ""
    }
  }

  try {
    JSON.stringify(value)
    return value
  } catch (_) {
    return String(value)
  }
}

module.exports = {
  ensureDownloaded,
  readText,
  readJson,
  writeText,
  writeJson,
  writeTextSafely,
  writeJsonSafely,
  backupService,
  saveService,
  loadService,
  loadBackupService,
  loadServicesIndex,
  saveServicesIndex,
  appendLog,
  clearLog,
  loadLog,
  fileExists,
  removeFile
}
