// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: brown; icon-glyph: archivebox;

const CONFIG = importModule("CTS Config")
const UTILS = importModule("CTS Utils")
const { fm, files, ensureDirectories } = CONFIG
const MAX_LOG_ENTRIES = 100
const SERVICES_INDEX_VERSION = CONFIG.servicesIndexVersion
const ICLOUD_DOWNLOAD_ATTEMPTS = 4
const ICLOUD_DOWNLOAD_RETRY_MS = 250
const ICLOUD_DOWNLOAD_TIMEOUT_MS = 12000
const WIDGET_DOWNLOAD_TIMEOUT_MS = 1500

function iCloudPatience() {
  return UTILS.runsInApplication()
    ? { attempts: ICLOUD_DOWNLOAD_ATTEMPTS, timeoutMs: ICLOUD_DOWNLOAD_TIMEOUT_MS }
    : { attempts: 1, timeoutMs: WIDGET_DOWNLOAD_TIMEOUT_MS }
}

async function ensureDownloaded(path) {
  if (!fm.fileExists(path)) return false

  const { attempts, timeoutMs } = iCloudPatience()
  let lastError = null
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      if (fm.isFileDownloaded(path)) return true
      await UTILS.withTimeout(fm.downloadFileFromiCloud(path), timeoutMs)
      if (fm.isFileDownloaded(path)) return true
    } catch (error) {
      lastError = error
    }

    if (attempt < attempts) {
      await UTILS.sleep(ICLOUD_DOWNLOAD_RETRY_MS * attempt)
    }
  }

  if (lastError) throw lastError
  throw new Error("Le fichier iCloud est présent mais n’est pas encore disponible localement.")
}

async function readText(path, fallback = "") {
  const direct = readWithoutICloudConfirmation(path, null)

  if (direct !== null) return direct

  try {
    if (await ensureDownloaded(path)) return fm.readString(path)
  } catch (_) {}

  return fallback
}

async function ensureReadable(path) {
  if (readWithoutICloudConfirmation(path, null) !== null) return true

  try {
    return await ensureDownloaded(path)
  } catch (_) {
    return false
  }
}

function readWithoutICloudConfirmation(path, fallback) {
  try {
    if (!fm.fileExists(path)) return fallback

    const content = fm.readString(path)

    return typeof content === "string" && content ? content : fallback
  } catch (_) {
    return fallback
  }
}

async function readJson(path, fallback = null) {
  try {
    const content = await readText(path, "")
    return content.trim() ? JSON.parse(content) : fallback
  } catch (_) {
    return fallback
  }
}

function writeText(path, value) {
  ensureDirectories()
  fm.writeString(path, String(value))
}

function writeJson(path, value, pretty = true) {
  writeText(path, JSON.stringify(value, null, pretty ? 2 : 0))
}

async function writeTextSafely(path, value) {
  ensureDirectories()

  const content = String(value)
  const token = buildUniqueToken()
  const temporaryPath = `${path}.tmp-${token}`
  const rollbackPath = `${path}.rollback-${token}`
  const originalExisted = fm.fileExists(path)

  cleanupLegacyWriteFiles(path)
  removeFileQuietly(temporaryPath)
  removeFileQuietly(rollbackPath)

  let previousMoved = false
  let preserveRollback = false

  try {
    if (originalExisted) await ensureDownloaded(path)

    fm.writeString(temporaryPath, content)
    if (!fm.fileExists(temporaryPath) || fm.readString(temporaryPath) !== content) {
      throw new Error("La vérification du fichier temporaire a échoué.")
    }

    if (originalExisted) {
      fm.move(path, rollbackPath)
      previousMoved = true
    }

    fm.move(temporaryPath, path)
    if (!fm.fileExists(path) || fm.readString(path) !== content) {
      throw new Error("La vérification du fichier enregistré a échoué.")
    }

    removeFileQuietly(rollbackPath)
  } catch (error) {
    removeFileQuietly(temporaryPath)

    if (previousMoved) {
      try {
        if (fm.fileExists(path)) fm.remove(path)
        if (fm.fileExists(rollbackPath)) fm.move(rollbackPath, path)
      } catch (_) {
        preserveRollback = true
      }
    } else if (!originalExisted) {
      removeFileQuietly(path)
    }

    throw error
  } finally {
    removeFileQuietly(temporaryPath)
    if (!preserveRollback) removeFileQuietly(rollbackPath)
  }
}

async function writeJsonSafely(path, value, pretty = true) {
  await writeTextSafely(path, JSON.stringify(value, null, pretty ? 2 : 0))
}

const TEXT_SCALES = Object.freeze([1, 1.25])

function defaultPreferences() {
  return { textScale: TEXT_SCALES[0] }
}

function normalizePreferences(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultPreferences()
  }

  const scale = Number(value.textScale)

  if (!Number.isFinite(scale)) return defaultPreferences()

  const nearest = TEXT_SCALES.reduce((best, candidate) =>
    Math.abs(candidate - scale) < Math.abs(best - scale) ? candidate : best
  )

  return { textScale: nearest }
}

function textScales() {
  return [...TEXT_SCALES]
}

async function loadPreferences() {
  try {
    if (!fm.fileExists(files.preferences)) return defaultPreferences()

    return normalizePreferences(await readJson(files.preferences, null))
  } catch (_) {
    return defaultPreferences()
  }
}

async function savePreferences(value) {
  await writeJsonSafely(files.preferences, normalizePreferences(value))
}

/*
 * Politique de version.
 *
 * Ce que le serveur a dit la dernière fois qu'on a pu le joindre : la
 * dernière version publiée, et le plancher en dessous duquel le widget
 * ne doit plus afficher de service.
 *
 * Une lecture ne lève jamais. Un fichier absent, illisible ou incohérent
 * rend null, et null veut dire « aucune politique connue », donc aucun
 * blocage : ce fichier ne peut pas mettre le widget en panne, seulement
 * l'autoriser à s'arrêter.
 */
async function loadVersionPolicy() {
  try {
    if (!fm.fileExists(files.versionPolicy)) return null

    const value = await readJson(files.versionPolicy, null)

    if (!value || typeof value !== "object" || Array.isArray(value)) return null

    const minimumVersion = String(value.minimumVersion || "").trim()
    const latestVersion = String(value.latestVersion || "").trim()

    if (!minimumVersion) return null

    return {
      minimumVersion,
      latestVersion,
      receivedAt: String(value.receivedAt || "")
    }
  } catch (_) {
    return null
  }
}

async function saveVersionPolicy(policy) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) return false

  const minimumVersion = String(policy.minimumVersion || "").trim()

  if (!minimumVersion) return false

  await writeJsonAtomically(
    files.versionPolicy,
    {
      version: 1,
      receivedAt: new Date().toISOString(),
      latestVersion: String(policy.latestVersion || "").trim(),
      minimumVersion
    },
    {
      writeCode: "VERSION_POLICY_TEMP_WRITE_FAILED",
      commitCode: "VERSION_POLICY_COMMIT_FAILED",
      stage: "version_policy",
      writeMessage: "Le fichier temporaire de politique ne peut pas être écrit",
      commitMessage: "La politique de version n’a pas pu être validée"
    }
  )

  return true
}

function emptyServicesIndex() {
  return { version: SERVICES_INDEX_VERSION, updatedAt: "", services: [] }
}

async function loadServicesIndex() {
  const value = await readJson(files.servicesIndex, null)
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyServicesIndex()
  }
  return {
    version: Number(value.version) || SERVICES_INDEX_VERSION,
    updatedAt: String(value.updatedAt || ""),
    services: Array.isArray(value.services) ? value.services : []
  }
}

async function saveServicesIndex(index) {
  const source =
    index && typeof index === "object" && !Array.isArray(index) ? index : emptyServicesIndex()

  await writeJsonSafely(files.servicesIndex, {
    version: Number(source.version) || SERVICES_INDEX_VERSION,
    updatedAt: String(source.updatedAt || new Date().toISOString()),
    services: Array.isArray(source.services) ? source.services : []
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
    await writeJsonSafely(files.importLog, logs.slice(-MAX_LOG_ENTRIES))
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
    if (!fm.fileExists(path)) return false
    fm.remove(path)
    return true
  } catch (_) {
    return false
  }
}

/*
 * Restes des anciennes écritures, avant que les noms ne portent un
 * jeton. Le temporaire ne contient rien que quelqu'un ait pu lire ; la
 * copie de sécurité, elle, est le dernier exemplaire connu du fichier
 * tant que celui-ci n'a pas repris sa place. On ne l'efface donc que
 * lorsque l'original existe.
 */
function cleanupLegacyWriteFiles(path) {
  removeFileQuietly(`${path}.tmp`)
  if (fm.fileExists(path)) removeFileQuietly(`${path}.rollback`)
}

function removeFileQuietly(path) {
  try {
    if (path && fm.fileExists(path)) fm.remove(path)
  } catch (_) {}
}

function safeModificationDate(path) {
  try {
    const value = fm.modificationDate(path)

    return value && typeof value.getTime === "function" && Number.isFinite(value.getTime())
      ? value
      : null
  } catch (_) {
    return null
  }
}

function buildUniqueToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

async function writeJsonAtomically(path, value, options = {}) {
  const {
    writeCode = "JSON_TEMP_WRITE_FAILED",
    commitCode = "JSON_COMMIT_FAILED",
    stage = "storage",
    writeMessage = "Le fichier temporaire ne peut pas être écrit",
    commitMessage = "Le fichier n’a pas pu être validé"
  } = options

  const token = buildUniqueToken()
  const temporaryPath = `${path}.tmp-${token}`
  const rollbackPath = `${path}.rollback-${token}`

  cleanupLegacyWriteFiles(path)
  removeFileQuietly(temporaryPath)
  removeFileQuietly(rollbackPath)

  try {
    fm.writeString(temporaryPath, JSON.stringify(value, null, 2))
  } catch (error) {
    throw UTILS.createTelemetryError(
      writeCode,
      stage,
      `${writeMessage} : ${UTILS.errorMessage(error)}`,
      error
    )
  }

  let previousMoved = false

  try {
    if (fm.fileExists(path)) {
      fm.move(path, rollbackPath)
      previousMoved = true
    }

    fm.move(temporaryPath, path)
  } catch (error) {
    removeFileQuietly(temporaryPath)

    if (previousMoved && fm.fileExists(rollbackPath) && !fm.fileExists(path)) {
      try {
        fm.move(rollbackPath, path)
      } catch (_) {}
    }

    throw UTILS.createTelemetryError(
      commitCode,
      stage,
      `${commitMessage} : ${UTILS.errorMessage(error)}`,
      error
    )
  }

  removeFileQuietly(rollbackPath)
}

function sanitizeDetails(value) {
  if (value === undefined) return null
  if (value instanceof Error) return UTILS.safeError(value)
  try {
    JSON.stringify(value)
    return value
  } catch (_) {
    return String(value)
  }
}

module.exports = {
  ensureDownloaded,
  ensureReadable,
  readText,
  readJson,
  writeText,
  writeJson,
  writeTextSafely,
  writeJsonSafely,
  writeJsonAtomically,
  loadPreferences,
  textScales,
  savePreferences,
  loadVersionPolicy,
  saveVersionPolicy,
  normalizePreferences,
  loadServicesIndex,
  saveServicesIndex,
  appendLog,
  clearLog,
  loadLog,
  fileExists,
  removeFile,
  removeFileQuietly,
  buildUniqueToken,
  safeModificationDate
}
