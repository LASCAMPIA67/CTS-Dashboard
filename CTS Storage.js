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
const WIDGET_DOWNLOAD_ATTEMPTS = 2
const WIDGET_DOWNLOAD_TIMEOUT_MS = 2500

/*
 * La seule attente iCloud du Dashboard : le moteur PDF l'emprunte aussi.
 *
 * Le widget accorde deux essais de deux secondes et demie par fichier. Une
 * attente unique d'une seconde et demie rendait une erreur là où il n'y
 * avait qu'un retard. La patience de l'application se compte elle aussi par
 * fichier : sur la carte et les deux bibliothèques PDF.js, elle retiendrait
 * le widget plus de deux minutes avant même la lecture. Le second essai
 * relit l'état du fichier, qu'iCloud peut déclarer disponible un instant
 * après avoir rendu la main.
 */
function iCloudPatience() {
  return UTILS.runsInApplication()
    ? { attempts: ICLOUD_DOWNLOAD_ATTEMPTS, timeoutMs: ICLOUD_DOWNLOAD_TIMEOUT_MS }
    : { attempts: WIDGET_DOWNLOAD_ATTEMPTS, timeoutMs: WIDGET_DOWNLOAD_TIMEOUT_MS }
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

/*
 * L'index des services, par le seul chemin qui le lise.
 *
 * Un index absent n'est pas une erreur : c'est une installation qui n'a
 * encore rien importé. Un index illisible en est une, et elle se lève
 * plutôt que de rendre une liste vide — un service qu'on n'affiche pas
 * parce que le fichier est cassé ne doit pas se lire comme un matin sans
 * service.
 *
 * Elle vit ici, et non dans l'importeur, parce que le widget passe par
 * cette lecture pour afficher le service du jour : la faire dépendre du
 * pipeline d'importation ferait tomber l'affichage avec lui, alors qu'il
 * n'a rien à importer pour montrer ce qui l'est déjà.
 */
async function readCurrentIndex() {
  const exists = fm.fileExists(files.servicesIndex)
  const value = await readJson(files.servicesIndex, null)

  if (!exists) return emptyServicesIndex()

  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Array.isArray(value.services)
  ) {
    throw UTILS.createTelemetryError(
      "SERVICE_INDEX_INVALID",
      "index",
      "L’index des services est invalide. Il n’a pas été remplacé."
    )
  }

  return {
    version: Number(value.version) || SERVICES_INDEX_VERSION,
    updatedAt: String(value.updatedAt || ""),
    services: value.services.filter(
      entry => entry && typeof entry === "object" && !Array.isArray(entry)
    )
  }
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

/*
 * Verrous de l'appareil.
 *
 * Un verrou dit qu'un processus de cet iPhone travaille. Rangé dans
 * iCloud, il coûtait quatre écritures synchronisées par réveil, et,
 * recopié sur un iPad de la même personne, pouvait y bloquer un balayage
 * deux minutes sans rien lui apprendre. Il vit donc dans la bibliothèque
 * locale de Scriptable, que l'application et le widget partagent : la
 * documentation ne le dit pas, une mesure sur iPhone l'a établi le
 * 23 septembre.
 *
 * Un verrou illisible compte pour absent : le garder bloquerait le
 * balayage ou l'entretien pour toujours.
 */
const DEVICE_LOCK_DIRECTORY = "CTS Dashboard"

function deviceLockPath(local, name) {
  const directory = local.joinPath(local.libraryDirectory(), DEVICE_LOCK_DIRECTORY)

  if (!local.fileExists(directory)) local.createDirectory(directory, true)

  return local.joinPath(directory, name)
}

function readDeviceLock(local, path) {
  try {
    if (!local.fileExists(path)) return null

    const value = JSON.parse(local.readString(path))

    return value && typeof value === "object" && !Array.isArray(value) ? value : null
  } catch (_) {
    return null
  }
}

function acquireDeviceLock(
  name,
  { ttlMs, applicationTakesOverWidget = false, writeCode, stage, label }
) {
  const now = new Date()
  const surface = UTILS.runsInApplication() ? "application" : "widget"
  const token = buildUniqueToken()

  try {
    const local = FileManager.local()
    const path = deviceLockPath(local, name)
    const existing = readDeviceLock(local, path)

    if (existing) {
      const createdAt = Date.parse(String(existing.createdAt || ""))
      const active = Number.isFinite(createdAt) && now.getTime() - createdAt < ttlMs
      const takesOver =
        applicationTakesOverWidget && existing.surface === "widget" && surface === "application"

      if (active && !takesOver) return { acquired: false, token: "" }
    }

    local.writeString(
      path,
      JSON.stringify({ token, createdAt: now.toISOString(), surface }, null, 2)
    )
  } catch (error) {
    throw UTILS.createTelemetryError(
      writeCode,
      stage,
      `${label} ne peut pas être créé : ${UTILS.errorMessage(error)}`,
      error
    )
  }

  return { acquired: true, token }
}

function releaseDeviceLock(name, lock) {
  if (!lock?.acquired) return

  try {
    const local = FileManager.local()
    const path = deviceLockPath(local, name)

    if (!local.fileExists(path)) return

    const current = readDeviceLock(local, path)

    if (!current || current.token === lock.token) local.remove(path)
  } catch (_) {}
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
  acquireDeviceLock,
  releaseDeviceLock,
  loadPreferences,
  textScales,
  savePreferences,
  loadVersionPolicy,
  saveVersionPolicy,
  normalizePreferences,
  readCurrentIndex,
  appendLog,
  clearLog,
  loadLog,
  fileExists,
  removeFile,
  removeFileQuietly,
  buildUniqueToken,
  safeModificationDate
}
