/*
 * Test de résolution des noms de lieux et d'arrêts.
 *
 * Ce test existe à cause de deux défauts réels, arrivés jusqu'à l'écran
 * d'un conducteur : « Code WILSON », puis « Code ELSA_C ». Les deux
 * venaient d'un code que la base ne savait pas ramener à son lieu, et
 * aucune vérification statique ne pouvait les voir — les fichiers JSON
 * étaient parfaitement valides.
 *
 * On charge donc CTS Database avec les vraies bases du dépôt et on lui
 * demande de nommer des codes, dont ceux qui ont échoué.
 */

import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(here, "..", "..")

/* Les bases sont lues depuis le dépôt, jamais recopiées ici. */
function resource(name) {
  return fs.readFileSync(path.join(repository, name), "utf8")
}

const RESOURCES = {
  "lines.json": resource("lines.json"),
  "stops.json": resource("stops.json"),
  "places.json": resource("places.json")
}

function loadModule(name, extra = {}) {
  const source = fs.readFileSync(path.join(repository, `${name}.js`), "utf8")
  const module = { exports: {} }

  const sandbox = {
    module,
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Date, Math, JSON, Number, String, Boolean, Array, Object, Set, Map,
    Promise, RegExp, Error, isNaN, parseInt, parseFloat,
    encodeURIComponent, decodeURIComponent,
    Timer: class {
      static schedule(ms, repeats, callback) {
        setTimeout(callback, 0)
        return new this()
      }
      invalidate() {}
    },
    args: { plainTexts: [] },
    importModule: requested => {
      const key = String(requested).replace(/^.*\//, "")
      if (!loaded[key]) throw new Error(`module inattendu : ${key}`)
      return loaded[key]
    },
    ...extra
  }

  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: name })
  return module.exports
}

const loaded = {}
loaded["CTS Utils"] = loadModule("CTS Utils")

/*
 * CTS Database lit ses bases à travers CTS Config, CTS Storage et
 * CTS Resources. On ne réimplémente aucun des trois : le gestionnaire de
 * fichiers sert les fichiers du dépôt, rien d'autre n'est simulé.
 */
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

/*
 * Chaque cas dit ce que HASTUS écrit et ce que le conducteur doit lire.
 * Aucun ne doit produire « Code … » : c'est précisément le symptôme.
 */
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
  ["WILSON", "Wilson"],
  ["KIBI_A", "Kibitzenau"],
  ["KIBI_1", "Kibitzenau"],
  ["KIBI_2", "Kibitzenau"],
  ["ELS", "UPE"],
  ["KBZ", "UPK"],
  ["CRB", "UPC"]
]

/*
 * Les lignes de tram sont codées 80 à 85 sur la carte agent et doivent
 * s'afficher A à F. Un service tram passe par le même chemin qu'un bus,
 * mais son libellé vient entièrement de lines.json.
 */
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

/*
 * G et H portent une lettre comme les trams, mais ce sont des lignes de
 * bus à haut niveau de service. Les faire passer pour des trams ferait
 * annoncer un « début d'exploitation » à un conducteur de bus. Le
 * contrôle lit la liste directement dans CTS Parser plutôt que d'en
 * garder une copie qui pourrait diverger.
 */
const BUS_LETTER_CODES = ["90", "92"]

const tramCodes = new Set(
  (fs
    .readFileSync(path.join(repository, "CTS Parser.js"), "utf8")
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

/*
 * Un suffixe inconnu sur une racine connue doit rester résolu : c'est la
 * garantie qui évite d'avoir à énumérer les combinaisons une par une.
 */
for (const suffix of ["B", "D", "E", "3", "9"]) {
  const actual = await DATABASE.formatPlace(`ELSA_${suffix}`)
  if (actual !== "Elsau") {
    failures.push(`un suffixe jamais vu casse la résolution : ELSA_${suffix} → « ${actual} »`)
  }
}

/* Un code réellement inconnu doit rester reconnaissable, pas inventé. */
const unknown = await DATABASE.formatPlace("ZZZZ_A")
if (!/^Code /.test(unknown)) {
  failures.push(`un code inconnu doit rester lisible tel quel, reçu « ${unknown} »`)
}

/*
 * Les arrêts lus sur les cartes agent, y compris les variantes de quai
 * que HASTUS écrit entre parenthèses : elles nomment le même lieu et
 * doivent produire le même libellé, borné à la largeur du widget.
 */
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
  ["Rodolphe Reuss Tiroir", "Neuhof R. Reuss"]
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
  failures.push("TRAM_LINE_CODES est introuvable dans CTS Parser.js")
}

for (const code of BUS_LETTER_CODES) {
  if (tramCodes.has(code)) {
    failures.push(
      `la ligne ${code} (${await DATABASE.formatLine(code)}) est classée parmi les trams ` +
      `dans CTS Parser alors que c'est une ligne de bus`
    )
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
