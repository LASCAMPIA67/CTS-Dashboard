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
  if (name) return name

  /*
   * HASTUS suffixe certains arrêts par ARRIVEE, DEPART ou TERMINUS. Les
   * plus courants figurent tels quels dans stops.json, mais aucun ne peut
   * tous les prévoir : un arrêt oublié tombait alors dans le repli avec
   * son suffixe, ce qui donnait des libellés de trente-cinq caractères que
   * le widget finissait par tronquer. On réessaie donc sans le suffixe.
   */
  const stripped = stripHastusQualifier(value)
  if (stripped) {
    const fallbackName = getEntryName(await getStop(stripped))
    if (fallbackName) return fallbackName
  }

  return formatFallbackName(cleanStopName(stripped || value))
}

function stripHastusQualifier(value) {
  const cleaned = cleanStopName(value)
  const stripped = cleaned.replace(/\s+(ARRIV[EÉ]E|D[EÉ]PART|TERMIN[IU]S)\s*$/i, "").trim()
  return stripped && stripped !== cleaned ? stripped : ""
}

/*
 * HASTUS écrit un point de relève sous la forme RACINE_SUFFIXE : ELSA_A,
 * ELSA_C, LHPP_G, ESPL_1. La racine désigne le lieu, le suffixe le quai
 * ou le sens. Énumérer les combinaisons ne tient pas : une seule oubliée
 * — ELSA_C — affichait « Code ELSA_C » au conducteur alors qu'ELSA était
 * en base depuis toujours.
 *
 * L'ordre de résolution va donc du plus précis au plus général : le code
 * exact, qui permet à un suffixe de porter un nom différent si un jour
 * c'est nécessaire ; puis la racine ; puis la base des arrêts, pour les
 * points de relève qui portent simplement le nom de leur arrêt.
 */
async function formatPlace(code) {
  const name = getEntryName(await getPlace(code))
  if (name) return name

  const root = codeRoot(code)
  if (root) {
    const rootName = getEntryName(await getPlace(root))
    if (rootName) return rootName
  }

  const stopName = await resolvePlaceFromStops(code, root)
  if (stopName) return stopName

  const normalizedCode = UTILS.normalizeCode(code)
  return normalizedCode ? `Code ${normalizedCode}` : "Lieu inconnu"
}

/*
 * La racine d'un code de relève, ou "" si le code n'en a pas. normalizeKey
 * remplace le souligné par une espace, donc ELSA_C devient « ELSA C ».
 */
function codeRoot(code) {
  const key = UTILS.normalizeKey(code)
  const root = key.replace(/\s+[A-Z0-9]{1,2}$/, "")
  return root && root !== key ? root : ""
}

/*
 * Un point de relève absent de places.json porte presque toujours le nom
 * de son arrêt — WILSON par exemple. Interroger la base des arrêts avant
 * d'abandonner évite d'afficher « Code WILSON » au conducteur.
 */
async function resolvePlaceFromStops(code, root) {
  const direct = getEntryName(await getStop(code))
  if (direct) return direct

  return root ? getEntryName(await getStop(root)) : ""
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
  return shortenStopLabel(
    cleaned
      .toLocaleLowerCase("fr-FR")
      .replace(/(^|[\s'-])([a-zà-öø-ÿ])/g, (_, separator, letter) =>
        separator + letter.toLocaleUpperCase("fr-FR")
      )
  )
}

/*
 * Longueur au-delà de laquelle le widget réduit la police d'un nom
 * d'arrêt. stops.json est plafonné à cette valeur par la CI ; le repli,
 * lui, reçoit un texte de PDF qu'aucune règle ne borne, d'où ce garde-fou.
 */
const MAX_STOP_LABEL_LENGTH = 21
const ABBREVIATION_LENGTHS = Object.freeze([8, 6, 4])

/*
 * Un nom CTS se lit « commune arrêt » : c'est le dernier mot qui distingue.
 * On abrège donc les mots précédents, du plus long au plus court, et jamais
 * le dernier — « Mittelhausbergen Mittelberg » devient « Mittelha. Mittelberg »,
 * qui reste reconnaissable, plutôt que d'être coupé net par le widget.
 *
 * Trois passes de plus en plus courtes : la première suffit aux noms réels,
 * les suivantes ne servent qu'à un libellé inattendu. Si même la dernière ne
 * suffit pas, on rend le nom tel quel — mieux vaut laisser le widget réduire
 * la police que produire une suite d'initiales illisible.
 */
function shortenStopLabel(value) {
  const words = String(value || "").split(/\s+/).filter(Boolean)
  const length = () => words.join(" ").length
  if (length() <= MAX_STOP_LABEL_LENGTH) return words.join(" ")

  for (const limit of ABBREVIATION_LENGTHS) {
    for (let pass = 0; pass < words.length; pass++) {
      let target = -1
      let longest = limit + 1

      for (let index = 0; index < words.length - 1; index++) {
        if (words[index].length > longest) {
          longest = words[index].length
          target = index
        }
      }

      if (target === -1) break
      words[target] = `${words[target].slice(0, limit)}.`
      if (length() <= MAX_STOP_LABEL_LENGTH) return words.join(" ")
    }
  }

  return words.join(" ")
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
  shortenStopLabel,
  formatFallbackName
}
