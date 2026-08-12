// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: teal; icon-glyph: database;

const CONFIG = importModule("CTS Config")
const RESOURCES = importModule("CTS Resources")
const STORAGE = importModule("CTS Storage")
const UTILS = importModule("CTS Utils")
const { fm, files, ensureDirectories } = CONFIG

const DATABASE_LABELS = Object.freeze({
  stops: "stops.json",
  places: "places.json",
  lines: "lines.json"
})

let cache = null
let lookupIndexes = null

async function load() {
  if (cache) return cache

  ensureDirectories()

  const warnings = []

  /*
   * La réparation des bases exige le réseau. Son échec ne doit pas
   * empêcher un import : readDatabaseFile sait déjà se passer d'une
   * base absente, et le Parser retombe alors sur des libellés de
   * repli qui ne produisent que des avertissements, jamais d'erreur.
   */
  try {
    await RESOURCES.ensureInstalled()
  } catch (error) {
    warnings.push(`Bases non vérifiées : ${UTILS.errorMessage(error)}`)
  }

  const [stops, places, lines] = await Promise.all([
    readDatabaseFile(files.stops, DATABASE_LABELS.stops, warnings),
    readDatabaseFile(files.places, DATABASE_LABELS.places, warnings),
    readDatabaseFile(files.lines, DATABASE_LABELS.lines, warnings)
  ])

  cache = { stops, places, lines, warnings }
  lookupIndexes = {
    stops: buildLookupIndex(stops),
    places: buildLookupIndex(places),
    lines: buildLookupIndex(lines)
  }
  return cache
}

async function reload() {
  cache = null
  lookupIndexes = null
  return load()
}

async function readDatabaseFile(path, label, warnings) {
  if (!fm.fileExists(path)) {
    warnings.push(`Base absente : ${label}`)
    return {}
  }

  try {
    await STORAGE.ensureDownloaded(path)
    const content = fm.readString(path).trim()
    if (!content) {
      warnings.push(`Base vide : ${label}`)
      return {}
    }

    const parsed = JSON.parse(content)
    if (!isPlainObject(parsed)) {
      warnings.push(`Format invalide : ${label}`)
      return {}
    }
    return parsed
  } catch (_) {
    warnings.push(`Lecture impossible : ${label}`)
    return {}
  }
}

async function getStop(value) {
  await load()
  return resolveIndexedEntry(lookupIndexes.stops, value)
}

async function getPlace(code) {
  await load()
  return resolveIndexedEntry(lookupIndexes.places, code)
}

async function getLine(code) {
  await load()
  return resolveIndexedEntry(lookupIndexes.lines, code)
}

async function formatStop(value) {
  const name = getEntryName(await getStop(value))
  return name || formatFallbackName(cleanStopName(value))
}

async function formatPlace(code) {
  const name = getEntryName(await getPlace(code))
  if (name) return name

  const stopName = await resolvePlaceFromStops(code)
  if (stopName) return stopName

  const normalizedCode = UTILS.normalizeCode(code)
  return normalizedCode ? `Code ${normalizedCode}` : "Lieu inconnu"
}

/*
 * Un point de relève absent de places.json porte presque toujours le nom
 * de son arrêt — WILSON par exemple. Interroger la base des arrêts avant
 * d'abandonner évite d'afficher « Code WILSON » au conducteur. On tente
 * aussi le code privé de son suffixe de quai, WILSON_A donnant WILSON.
 */
async function resolvePlaceFromStops(code) {
  const direct = getEntryName(await getStop(code))
  if (direct) return direct

  const key = UTILS.normalizeKey(code)
  const base = key.replace(/\s+[A-Z0-9]$/, "")
  if (!base || base === key) return ""
  return getEntryName(await getStop(base))
}

async function formatLine(code) {
  const name = getEntryName(await getLine(code))
  if (name) return name

  const normalizedCode = UTILS.normalizeCode(code)
  if (!normalizedCode) return "?"
  const numeric = Number(normalizedCode)
  return Number.isFinite(numeric) ? String(numeric) : normalizedCode
}

async function isDepot(code) {
  return hasEntryType(await getPlace(code), "depot")
}

async function isReliefPoint(code) {
  return hasEntryType(await getPlace(code), "relief")
}

async function getWarnings() {
  return [...(await load()).warnings]
}

function buildLookupIndex(collection) {
  const index = Object.create(null)
  if (!isPlainObject(collection)) return index

  for (const [key, rawEntry] of Object.entries(collection)) {
    const entry = normalizeEntry(rawEntry)
    if (!entry) continue
    addIndexEntry(index, key, rawEntry)
    for (const alias of normalizeAliases(entry)) addIndexEntry(index, alias, rawEntry)
  }
  return index
}

function addIndexEntry(index, value, rawEntry) {
  const key = UTILS.normalizeKey(value)
  if (key && !Object.prototype.hasOwnProperty.call(index, key)) index[key] = rawEntry
}

function resolveIndexedEntry(index, value) {
  const key = UTILS.normalizeKey(value)
  if (!key || !index || !Object.prototype.hasOwnProperty.call(index, key)) return null
  return normalizeEntry(index[key])
}

function normalizeEntry(entry) {
  if (typeof entry === "string") return { name: entry }
  return isPlainObject(entry) ? entry : null
}

function normalizeAliases(entry) {
  if (!entry) return []
  if (typeof entry.aliases === "string") return [entry.aliases]
  return Array.isArray(entry.aliases)
    ? entry.aliases.filter(value => typeof value === "string")
    : []
}

function getEntryName(entry) {
  return entry && typeof entry.name === "string" ? entry.name.trim() : ""
}

function hasEntryType(entry, type) {
  return Boolean(entry && String(entry.type || "").trim().toLowerCase() === type)
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function cleanStopName(value) {
  return String(value || "")
    .replace(/^-\s*\/\s*-\s+/, "")
    .replace(/^(Régulier|Haut-le-pied|Entrée|Sortie)\s*\/\s*\S+\s+/i, "")
    .replace(/\s+/g, " ")
    .trim()
}

function formatFallbackName(value) {
  const cleaned = String(value || "").trim()
  if (!cleaned) return "Arrêt inconnu"
  return cleaned
    .toLocaleLowerCase("fr-FR")
    .replace(/(^|[\s'-])([a-zà-öø-ÿ])/g, (_, separator, letter) =>
      separator + letter.toLocaleUpperCase("fr-FR")
    )
}

module.exports = {
  load,
  reload,
  getStop,
  getPlace,
  getLine,
  formatStop,
  formatPlace,
  formatLine,
  isDepot,
  isReliefPoint,
  getWarnings,
  normalizeCode: UTILS.normalizeCode,
  normalizeKey: UTILS.normalizeKey,
  cleanStopName,
  formatFallbackName
}
