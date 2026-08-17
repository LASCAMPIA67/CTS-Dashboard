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
 * Le widget ne contrôle plus la version publiée.
 *
 * Cette fonction a existé de la 1.0.17 à la 1.0.18, et elle est retirée
 * volontairement. Le principe était bon — prévenir un collègue resté en
 * arrière — mais son coût réel ne l'était pas : le seul moyen de savoir
 * si une version existe est d'interroger GitHub, et un widget qui se
 * rafraîchit toutes les minutes pendant un service transforme la moindre
 * défaillance de sa mémoire locale en rafale de requêtes. GitHub met
 * alors l'adresse de côté (429, puis 503) — et met du même coup CTS
 * Installer hors service, c'est-à-dire précisément l'outil qui aurait
 * permis de se rattraper.
 *
 * Une fonction de confort ne doit pas pouvoir couper l'accès à l'outil de
 * réparation. Le rappel de mise à jour se fait donc à nouveau par le
 * message envoyé à la communauté, et le widget ne parle plus à GitHub que
 * pour installer une base de données manquante.
 */

function rawUrl(name) {
  return [
    "https://raw.githubusercontent.com",
    encodeURIComponent(repository.owner),
    encodeURIComponent(repository.name),
    encodeURIComponent(repository.branch),
    encodeURIComponent(name)
  ].join("/") + `?t=${Date.now()}`
}

module.exports = { RESOURCES_VERSION, ensureInstalled }
