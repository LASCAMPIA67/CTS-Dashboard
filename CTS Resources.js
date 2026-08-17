// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: yellow; icon-glyph: shippingbox.fill;

const CONFIG = importModule("CTS Config")
const STORAGE = importModule("CTS Storage")
const UTILS = importModule("CTS Utils")
const { fm, files, repository, ensureDirectories } = CONFIG

const RESOURCES_VERSION = 4
const REQUEST_TIMEOUT_SECONDS = 20
const DATABASES = Object.freeze([
  { name: "lines.json", path: files.lines },
  { name: "stops.json", path: files.stops },
  { name: "places.json", path: files.places }
])

async function ensureInstalled() {
  ensureDirectories()
  const result = { version: RESOURCES_VERSION, installed: [], repaired: [], preserved: [] }

  for (const resource of DATABASES) {
    const status = await ensureDatabase(resource)
    result[status].push(resource.name)
  }
  return result
}

async function ensureDatabase(resource) {
  const existed = fm.fileExists(resource.path)
  if (await isValidDatabase(resource.path)) return "preserved"

  const parsed = parseDatabase(await downloadDatabase(resource.name), resource.name)
  await STORAGE.writeTextSafely(resource.path, JSON.stringify(parsed, null, 2))

  if (!await isValidDatabase(resource.path)) {
    throw new Error(`${resource.name} reste invalide après réparation.`)
  }
  return existed ? "repaired" : "installed"
}

async function isValidDatabase(path) {
  try {
    if (!await STORAGE.ensureDownloaded(path)) return false
    const content = fm.readString(path).trim()
    if (!content) return false
    const value = JSON.parse(content)
    return Boolean(
      value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length
    )
  } catch (_) {
    return false
  }
}

async function downloadDatabase(name) {
  const request = new Request(rawUrl(name))
  request.timeoutInterval = REQUEST_TIMEOUT_SECONDS
  request.headers = { "Cache-Control": "no-cache", Pragma: "no-cache" }

  let content
  try {
    content = await request.loadString()
  } catch (error) {
    throw new Error(`${name} impossible à télécharger : ${UTILS.errorMessage(error)}`)
  }

  const statusCode = Number(request.response?.statusCode)
  if (Number.isFinite(statusCode) && (statusCode < 200 || statusCode >= 300)) {
    throw new Error(`${name} impossible à télécharger : HTTP ${statusCode}`)
  }
  return content
}

function parseDatabase(content, name) {
  try {
    const value = JSON.parse(String(content || ""))
    if (!value || typeof value !== "object" || Array.isArray(value) || !Object.keys(value).length) {
      throw new Error("racine JSON invalide")
    }
    return value
  } catch (error) {
    throw new Error(`${name} invalide : ${UTILS.errorMessage(error)}`)
  }
}

/*
 * Contrôle de la version publiée.
 *
 * Un collègue resté sur une ancienne version continuait d'afficher son
 * service sans jamais savoir qu'il était en retard. Le widget le lui dit
 * désormais — mais à trois conditions, parce qu'un conducteur qui ne voit
 * pas son service à 5 h du matin est un problème plus grave qu'un widget
 * en retard :
 *
 *   1. le contrôle ne bloque jamais l'affichage : sans réseau, sans
 *      réponse, ou en cas de doute, la fonction renvoie null et le
 *      service s'affiche normalement ;
 *   2. la réponse est mise en cache six heures, si bien que le widget ne
 *      paie le réseau que quatre fois par jour au plus ;
 *   3. seule une version publiée strictement supérieure est signalée.
 */
const VERSION_CHECK_TTL_MS = 6 * 60 * 60 * 1000
const VERSION_CHECK_TIMEOUT_SECONDS = 6
const VERSION_CHECK_PATH = fm.joinPath(CONFIG.paths.data, "version-check.json")

async function checkPublishedVersion(currentDate = new Date()) {
  const installed = CONFIG.dashboardVersion

  if (!installed) return null

  const published = await resolvePublishedVersion(currentDate)

  if (!published) return null

  return UTILS.compareVersions(published, installed) > 0
    ? { installed, published }
    : null
}

async function resolvePublishedVersion(currentDate) {
  const cached = await STORAGE.readJson(VERSION_CHECK_PATH, null)
  const checkedAt = Date.parse(String(cached?.checkedAt || ""))

  if (
    Number.isFinite(checkedAt) &&
    currentDate.getTime() - checkedAt < VERSION_CHECK_TTL_MS
  ) {
    return normalizeVersion(cached?.published)
  }

  const published = await downloadPublishedVersion()

  /*
   * Un échec est mémorisé comme les autres : réessayer à chaque
   * rafraîchissement pendant une panne de réseau coûterait plus que de
   * patienter six heures, et l'absence de réponse ne bloque rien.
   */
  try {
    await STORAGE.writeJson(VERSION_CHECK_PATH, {
      checkedAt: currentDate.toISOString(),
      published
    })
  } catch (_) {}

  return published
}

async function downloadPublishedVersion() {
  try {
    const request = new Request(rawUrl("version.json"))
    request.timeoutInterval = VERSION_CHECK_TIMEOUT_SECONDS
    request.headers = { "Cache-Control": "no-cache", Pragma: "no-cache" }

    const manifest = await request.loadJSON()
    const statusCode = Number(request.response?.statusCode)

    if (Number.isFinite(statusCode) && (statusCode < 200 || statusCode >= 300)) {
      return ""
    }

    return normalizeVersion(manifest?.version)
  } catch (_) {
    return ""
  }
}

function normalizeVersion(value) {
  const version = String(value || "").trim()
  return /^\d+(\.\d+){0,3}$/.test(version) ? version : ""
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

module.exports = { RESOURCES_VERSION, ensureInstalled, checkPublishedVersion }
