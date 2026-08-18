// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: brown; icon-glyph: archivebox;

const CONFIG = importModule("CTS Config")
const UTILS = importModule("CTS Utils")
const { fm, files, ensureDirectories } = CONFIG

const MAX_LOG_ENTRIES = 100
const SERVICES_INDEX_VERSION = 2
const ICLOUD_DOWNLOAD_ATTEMPTS = 4
const ICLOUD_DOWNLOAD_RETRY_MS = 250

async function ensureDownloaded(path) {
  if (!fm.fileExists(path)) return false

  let lastError = null
  for (let attempt = 1; attempt <= ICLOUD_DOWNLOAD_ATTEMPTS; attempt++) {
    try {
      if (fm.isFileDownloaded(path)) return true
      await fm.downloadFileFromiCloud(path)
      if (fm.isFileDownloaded(path)) return true
    } catch (error) {
      lastError = error
    }

    if (attempt < ICLOUD_DOWNLOAD_ATTEMPTS) {
      await UTILS.sleep(ICLOUD_DOWNLOAD_RETRY_MS * attempt)
    }
  }

  if (lastError) throw lastError
  throw new Error("Le fichier iCloud est présent mais n’est pas encore disponible localement.")
}

/*
 * Lire un fichier même quand iCloud refuse de le déclarer disponible.
 *
 * ensureDownloaded s'appuie sur isFileDownloaded, qui répond « non »
 * pour des fichiers pourtant parfaitement lisibles — un fichier écrit
 * quelques secondes plus tôt, ou n'importe quel fichier quand iOS
 * déprioritise iCloud. Or c'est exactement ce qui arrive dans un widget,
 * qui reçoit beaucoup moins de temps et de priorité que l'application.
 *
 * Tant que cet abandon était silencieux, le résultat était impossible à
 * diagnostiquer : chez un collègue, l'index et le cache du service
 * revenaient vides dans le widget — donc « aucun service » — alors que
 * le même téléphone affichait le service correctement depuis Scriptable,
 * à la même minute.
 *
 * On lit donc directement d'abord, et on ne réveille iCloud que si cette
 * lecture ne donne rien.
 *
 * L'ordre est le fond de l'affaire, pas un détail. ensureDownloaded
 * dépense 1,5 seconde de pauses et quatre attentes iCloud avant de
 * renoncer, et un réveil de widget enchaîne une dizaine de lectures —
 * l'index, le cache, l'état du balayage, le verrou, les lieux, chaque
 * PDF. Placé après cette dépense, le secours arrivait trop tard : le
 * widget était tué avant d'avoir rien dessiné, et laissait donc son
 * image précédente à l'écran. Placé avant, le cas normal — un fichier
 * réellement présent — ne coûte plus rien du tout.
 */
async function readText(path, fallback = "") {
  const direct = readWithoutICloudConfirmation(path, null)

  if (direct !== null) return direct

  try {
    if (await ensureDownloaded(path)) return fm.readString(path)
  } catch (_) {}

  return fallback
}

/*
 * S'assurer qu'un fichier sera lisible, sans payer iCloud quand il l'est
 * déjà. Destiné aux lectures synchrones faites plus loin — places.json
 * notamment, que normalizeService relit sans await.
 */
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

async function backupService() {
  try {
    if (!await ensureDownloaded(files.service)) return false
    await writeTextSafely(files.serviceBackup, fm.readString(files.service))
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
  const source = index && typeof index === "object" && !Array.isArray(index)
    ? index
    : emptyServicesIndex()

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

function cleanupLegacyWriteFiles(path) {
  removeFileQuietly(`${path}.tmp`)
  removeFileQuietly(`${path}.rollback`)
}

function removeFileQuietly(path) {
  try {
    if (path && fm.fileExists(path)) fm.remove(path)
  } catch (_) {}
}

function safeModificationDate(path) {
  try {
    const value = fm.modificationDate(path)

    return value &&
      typeof value.getTime === "function" &&
      Number.isFinite(value.getTime())
      ? value
      : null
  } catch (_) {
    return null
  }
}

function buildUniqueToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
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
  removeFile,
  removeFileQuietly,
  buildUniqueToken,
  safeModificationDate
}
