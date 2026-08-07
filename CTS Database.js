// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: teal; icon-glyph: database;

// CTS Database.js
// Chargement et résolution des lignes, lieux et arrêts CTS.

const CONFIG = importModule("CTS Config")
const RESOURCES = importModule("CTS Resources")

const {
  fm,
  files,
  ensureDirectories
} = CONFIG

const DATABASE_LABELS = {
  stops: "stops.json",
  places: "places.json",
  lines: "lines.json"
}

let cache = null
let lookupIndexes = null

async function load() {
  if (cache) {
    return cache
  }

  ensureDirectories()
  await RESOURCES.ensureInstalled()

  const warnings = []

  const stops = await readDatabaseFile(
    files.stops,
    DATABASE_LABELS.stops,
    warnings
  )

  const places = await readDatabaseFile(
    files.places,
    DATABASE_LABELS.places,
    warnings
  )

  const lines = await readDatabaseFile(
    files.lines,
    DATABASE_LABELS.lines,
    warnings
  )

  cache = {
    stops,
    places,
    lines,
    warnings
  }

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

async function readDatabaseFile(
  path,
  label,
  warnings
) {
  if (!fm.fileExists(path)) {
    warnings.push(
      `Base absente : ${label}`
    )

    return {}
  }

  try {
    if (!fm.isFileDownloaded(path)) {
      await fm.downloadFileFromiCloud(
        path
      )
    }

    const content =
      fm.readString(path).trim()

    if (!content) {
      warnings.push(
        `Base vide : ${label}`
      )

      return {}
    }

    const parsed =
      JSON.parse(content)

    if (!isPlainObject(parsed)) {
      warnings.push(
        `Format invalide : ${label}`
      )

      return {}
    }

    return parsed
  } catch (error) {
    warnings.push(
      `Lecture impossible : ${label}`
    )

    return {}
  }
}

async function getStop(value) {
  await load()

  return resolveIndexedEntry(
    lookupIndexes.stops,
    value
  )
}

async function getPlace(code) {
  await load()

  return resolveIndexedEntry(
    lookupIndexes.places,
    code
  )
}

async function getLine(code) {
  await load()

  return resolveIndexedEntry(
    lookupIndexes.lines,
    code
  )
}

async function formatStop(value) {
  const entry =
    await getStop(value)

  const name =
    getEntryName(entry)

  return name || formatFallbackName(
    cleanStopName(value)
  )
}

async function formatPlace(code) {
  const entry =
    await getPlace(code)

  const name =
    getEntryName(entry)

  if (name) {
    return name
  }

  const normalizedCode =
    normalizeCode(code)

  return normalizedCode
    ? `Code ${normalizedCode}`
    : "Lieu inconnu"
}

async function formatLine(code) {
  const entry =
    await getLine(code)

  const name =
    getEntryName(entry)

  if (name) {
    return name
  }

  const normalizedCode =
    normalizeCode(code)

  if (!normalizedCode) {
    return "?"
  }

  const numeric =
    Number(normalizedCode)

  return Number.isFinite(numeric)
    ? String(numeric)
    : normalizedCode
}

async function isDepot(code) {
  return hasEntryType(
    await getPlace(code),
    "depot"
  )
}

async function isReliefPoint(code) {
  return hasEntryType(
    await getPlace(code),
    "relief"
  )
}

async function getWarnings() {
  const database =
    await load()

  return [...database.warnings]
}

function buildLookupIndex(collection) {
  const index =
    Object.create(null)

  if (!isPlainObject(collection)) {
    return index
  }

  for (
    const [key, rawEntry]
    of Object.entries(collection)
  ) {
    const entry =
      normalizeEntry(rawEntry)

    if (!entry) {
      continue
    }

    addIndexEntry(
      index,
      key,
      rawEntry
    )

    for (
      const alias
      of normalizeAliases(entry)
    ) {
      addIndexEntry(
        index,
        alias,
        rawEntry
      )
    }
  }

  return index
}

function addIndexEntry(
  index,
  value,
  rawEntry
) {
  const key =
    normalizeKey(value)

  if (
    key &&
    !Object.prototype.hasOwnProperty.call(
      index,
      key
    )
  ) {
    index[key] =
      rawEntry
  }
}

function resolveIndexedEntry(
  index,
  value
) {
  const key =
    normalizeKey(value)

  if (
    !key ||
    !index ||
    !Object.prototype.hasOwnProperty.call(
      index,
      key
    )
  ) {
    return null
  }

  return normalizeEntry(
    index[key]
  )
}

function normalizeEntry(entry) {
  if (typeof entry === "string") {
    return {
      name: entry
    }
  }

  return isPlainObject(entry)
    ? entry
    : null
}

function normalizeAliases(entry) {
  if (!entry) {
    return []
  }

  const aliases =
    entry.aliases

  if (typeof aliases === "string") {
    return [aliases]
  }

  return Array.isArray(aliases)
    ? aliases.filter(
        value =>
          typeof value === "string"
      )
    : []
}

function getEntryName(entry) {
  return (
    entry &&
    typeof entry.name === "string"
  )
    ? entry.name.trim()
    : ""
}

function hasEntryType(
  entry,
  type
) {
  return Boolean(
    entry &&
    String(entry.type || "")
      .trim()
      .toLowerCase() === type
  )
}

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
}

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
}

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[’`]/g,
      "'"
    )
    .replace(
      /[^A-Z0-9']/gi,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim()
    .toUpperCase()
}

function cleanStopName(value) {
  return String(value || "")
    .replace(
      /^-\s*\/\s*-\s+/,
      ""
    )
    .replace(
      /^(Régulier|Haut-le-pied|Entrée|Sortie)\s*\/\s*\S+\s+/i,
      ""
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim()
}

function formatFallbackName(value) {
  const cleaned =
    String(value || "").trim()

  if (!cleaned) {
    return "Arrêt inconnu"
  }

  return cleaned
    .toLocaleLowerCase("fr-FR")
    .replace(
      /(^|[\s'-])([a-zà-öø-ÿ])/g,
      (
        match,
        separator,
        letter
      ) =>
        separator +
        letter.toLocaleUpperCase(
          "fr-FR"
        )
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
  normalizeCode,
  normalizeKey,
  cleanStopName,
  formatFallbackName
}
