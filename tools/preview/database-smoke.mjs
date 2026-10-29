import fs from "node:fs"
import path from "node:path"
import { importFrom, isolatedModule, readScript, repository } from "./sandbox.mjs"

function resource(name) {
  return fs.readFileSync(path.join(repository, name), "utf8")
}

const RESOURCES = {
  "lines.json": resource("lines.json"),
  "stops.json": resource("stops.json"),
  "places.json": resource("places.json")
}

function loadModule(name, extra = {}) {
  return isolatedModule(name, {
    importModule: importFrom(loaded),
    globals: extra
  })
}

const loaded = {}
loaded["CTS Utils"] = loadModule("CTS Utils")

const fileName = target => String(target).replace(/^.*\//, "")

loaded["CTS Config"] = {
  fm: {
    fileExists: target => Boolean(RESOURCES[fileName(target)]),
    readString: target => RESOURCES[fileName(target)] || ""
  },
  files: {
    stops: "/database/stops.json",
    places: "/database/places.json",
    lines: "/database/lines.json"
  },
  ensureDirectories: () => {}
}

loaded["CTS Storage"] = { ensureDownloaded: async () => true }
loaded["CTS Resources"] = { ensureInstalled: async () => true }

const DATABASE = loadModule("CTS Database")

const places = [
  ["ELSA_A", "Elsau"],
  ["ELSA_C", "Elsau"],
  ["ELSA_1", "Elsau"],
  ["ELSA", "Elsau"],
  ["HOHB_A", "Hohberg"],
  ["ELME_A", "Elmerforst"],
  ["GAMA_A", "Gare Marchandises"],
  ["LHPP_G", "Halles P. de Paris"],
  ["GACE_O", "Gare Centrale"],
  ["ESPL_2", "Esplanade"],
  ["MOVE_C", "Montagne Verte"],
  ["RORE_A", "Neuhof R. Reuss"],
  ["WICH_A", "Winston Churchill"],
  ["WICH", "Winston Churchill"],
  ["WILSON", "Wilson"],
  ["KIBI_A", "Kibitzenau"],
  ["KIBI_1", "Kibitzenau"],
  ["KIBI_2", "Kibitzenau"],
  ["ROTONDE 17", "Rotonde"],
  ["ROTONDE", "Rotonde"],
  ["HOMME DE FER V.1 ARRIVEE", "Homme de Fer V1"],
  ["ELS", "UPE"],
  ["KBZ", "UPK"],
  ["CRB", "UPC"]
]

const lines = [
  ["82", "C"],
  ["80", "A"],
  ["85", "F"],
  ["90", "G"],
  ["92", "H"],
  ["01", "C1"],
  ["08", "C8"],
  ["40", "40"]
]

const BUS_LETTER_CODES = ["90", "92"]

const tramCodes = new Set(
  (readScript("CTS Utils")
    .match(/const TRAM_LINE_CODES = new Set\(\[([^\]]*)\]\)/)?.[1] || "")
    .split(",")
    .map(value => value.trim().replace(/"/g, ""))
    .filter(Boolean)
)

const failures = []

for (const [code, expected] of places) {
  const actual = await DATABASE.formatPlace(code)
  if (actual !== expected) {
    failures.push(`formatPlace("${code}") donne « ${actual} » au lieu de « ${expected} »`)
  }
}

for (const suffix of ["B", "D", "E", "3", "9"]) {
  const actual = await DATABASE.formatPlace(`ELSA_${suffix}`)
  if (actual !== "Elsau") {
    failures.push(`un suffixe jamais vu casse la résolution : ELSA_${suffix} → « ${actual} »`)
  }
}

const unknown = await DATABASE.formatPlace("ZZZZ_A")
if (!/^Code /.test(unknown)) {
  failures.push(`un code inconnu doit rester lisible tel quel, reçu « ${unknown} »`)
}

const stops = [
  ["HOHBERG", "Hohberg"],
  ["ELSAU ARRIVEE", "Elsau"],
  ["KOENIGSHOFFEN SUD DEPART", "Koenigshoffen Sud"],
  ["CESAR JULIEN", "César Julien"],
  ["DUCS D'ALSACE", "Ducs d'Alsace"],
  ["SCHILTIGHEIM LE MARAIS", "Schilt. le Marais"],
  ["MITTELHAUSBERGEN MITTELBERG ARRIVEE", "Mittelh. Mittelberg"],
  ["RUE D'ECKBOLSHEIM", "Rue d'Eckbolsheim"],
  ["QUARTIER DES QUINZE", "Quartier des Quinze"],
  ["PLAINE DES BOUCHERS", "Plaine des Bouchers"],
  ["MONTAGNE VERTE (ARRIVEE V.1)", "Montagne Verte"],
  ["MONTAGNE VERTE (ARRIVEE V.2)", "Montagne Verte"],
  ["OBSERVATOIRE (BD D'ANVERS-ARRIVEE EX)", "Observatoire"],
  ["OBSERVATOIRE (BD LEBLOIS-ARRIVEE CV)", "Observatoire"],
  ["PLACE DE PIERRE L.10", "Place de Pierre"],
  ["LINGOLSHEIM ALOUETTES", "Lingolsheim Alouettes"],
  ["SAINT-NICOLAS", "Saint-Nicolas"],
  ["NEUHOF STOCKFELD", "Neuhof Stockfeld"],
  ["HOMME DE FER V.1 ARRIVEE", "Homme de Fer V1"],
  ["HOMME DE FER V.2 ARRIVEE", "Homme de Fer V2"],
  ["HOMME DE FER V.1", "Homme de Fer V1"],
  ["HOMME DE FER", "Homme de Fer"],
  ["COMMUNICATION WILSON V2", "Communication Wilson"],
  ["DEPOT KIBITZENAU E/S", "Dépôt Kibitzenau"],
  ["OBSERVATOIRE (Blvd Leblois)", "Observatoire"],
  ["Rodolphe Reuss Tiroir", "Neuhof R. Reuss"],
  ["ROTONDE 17", "Rotonde"]
]

for (const [raw, expected] of stops) {
  const actual = await DATABASE.formatStop(raw)
  if (actual !== expected) {
    failures.push(`formatStop("${raw}") donne « ${actual} » au lieu de « ${expected} »`)
  }
}

for (const [code, expected] of lines) {
  const actual = await DATABASE.formatLine(code)
  if (actual !== expected) {
    failures.push(`formatLine("${code}") donne « ${actual} » au lieu de « ${expected} »`)
  }
}

if (!tramCodes.size) {
  failures.push("TRAM_LINE_CODES est introuvable dans CTS Utils.js")
}

for (const code of BUS_LETTER_CODES) {
  if (tramCodes.has(code)) {
    failures.push(
      `la ligne ${code} (${await DATABASE.formatLine(code)}) est classée parmi les trams ` +
      `dans CTS Utils alors que c'est une ligne de bus`
    )
  }
}

const TRAM_LETTERS = /^[A-F]$/

for (const [code, line] of Object.entries(JSON.parse(RESOURCES["lines.json"]))) {
  if (TRAM_LETTERS.test(String(line?.name || "")) && !tramCodes.has(code)) {
    failures.push(`la ligne ${code} (${line.name}) n'est pas classée parmi les trams dans CTS Utils`)
  }
}

for (const code of tramCodes) {
  const name = await DATABASE.formatLine(code)
  if (!/^[A-Z]$/.test(name)) {
    failures.push(
      `la ligne ${code} est classée parmi les trams mais lines.json la nomme « ${name} »`
    )
  }
}

if (failures.length) {
  console.log("ÉCHEC  résolution des lieux et des arrêts")
  for (const failure of failures) console.log(`         ${failure}`)
  process.exit(1)
}

console.log(
  `ok     résolution des lieux, des arrêts et des lignes ` +
    `(${places.length + stops.length + lines.length + tramCodes.size + BUS_LETTER_CODES.length + 6} cas)`
)
