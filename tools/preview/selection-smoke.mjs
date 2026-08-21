/*
 * Passage d'un service au suivant.
 *
 * Un service terminé reste affiché un moment : le conducteur qui rentre
 * au dépôt doit encore pouvoir relire ses horaires. Mais la durée juste
 * n'est pas la même selon qu'une prochaine carte agent est déjà là ou
 * non.
 *
 *   carte suivante disponible → cinq minutes, puis on bascule
 *   aucune carte suivante     → une heure, puis « aucune carte agent »
 *
 * La règle est recalculée à chaque exécution, jamais démarrée une fois
 * pour toutes : une carte déposée vingt minutes après la fin du service
 * raccourcit donc l'attente au lieu de la laisser courir. C'est ce que
 * ce banc fixe, avec les cas de bord qui vont avec.
 */

import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(here, "..", "..")
const failures = []

const ROOT = "/documents/CTS Dashboard"
const DATA = `${ROOT}/Data`
const CACHE = `${ROOT}/Cache/Services`
const MINUTE = 60 * 1000

function createFileManager(disk) {
  return {
    joinPath: (parent, child) => `${parent}/${child}`,
    documentsDirectory: () => "/documents",
    fileExists: target => disk.has(target),
    isFileDownloaded: () => true,
    downloadFileFromiCloud: async () => {},
    readString: target => {
      if (!disk.has(target)) throw new Error(`fichier absent : ${target}`)
      return disk.get(target)
    },
    writeString: (target, value) => disk.set(target, String(value)),
    remove: target => disk.delete(target),
    move: (from, to) => {
      disk.set(to, disk.get(from))
      disk.delete(from)
    },
    createDirectory: target => disk.set(target, ""),
    listContents: () => [],
    isDirectory: target => disk.get(target) === "",
    fileSize: () => 1,
    modificationDate: () => new Date()
  }
}

function loadManager(disk) {
  const loaded = {}
  const fm = createFileManager(disk)

  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Date, Math, JSON, Number, String, Boolean, Array, Object, Set, Map,
    Promise, RegExp, Error, isNaN, parseInt, parseFloat,
    encodeURIComponent, decodeURIComponent,
    config: { runsInWidget: true },
    args: { plainTexts: [], shortcutParameter: null },
    Timer: class {
      static schedule(milliseconds, repeats, callback) {
        setTimeout(callback, 0)
        return new this()
      }
      invalidate() {}
    },
    FileManager: { iCloud: () => fm, local: () => fm },
    importModule: name => load(name)
  }

  vm.createContext(sandbox)

  function load(name) {
    if (name === "CTS Importer") {
      return {
        readCurrentIndex: async () =>
          JSON.parse(disk.get(`${DATA}/services-index.json`) || '{"services":[]}'),
        importPdf: async () => ({ success: false })
      }
    }

    if (loaded[name]) return loaded[name]

    const source = fs.readFileSync(path.join(repository, `${name}.js`), "utf8")
    const module = { exports: {} }
    loaded[name] = module.exports
    vm.runInContext(
      `(function (module, exports) {\n${source}\n})`,
      sandbox,
      { filename: name }
    )(module, module.exports)
    loaded[name] = module.exports
    return module.exports
  }

  return load("CTS Services Manager")
}

const dayKey = date =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-")

/*
 * Un service d'une tranche, dont on choisit le jour et l'heure de fin.
 * Le cache porte le contenu ; l'index porte l'entrée qui le désigne.
 */
function service({ date, number, start, end }) {
  const stem = `Service_${date}_${number}`

  return {
    entry: {
      id: stem,
      date,
      service: number,
      pdfFile: `${stem}.pdf`,
      cacheFile: `${stem}.json`,
      textFile: `${stem}.txt`,
      importedAt: `${date}T04:00:00.000Z`,
      indexedAt: `${date}T04:00:00.000Z`,
      slices: 1
    },
    cache: {
      service: number,
      date,
      driver: { name: "", id: "" },
      slices: [
        {
          index: 1,
          lineCode: "10",
          line: "10",
          vehicle: "5",
          dutyStart: start,
          operationStart: start,
          start,
          end,
          dutyEnd: end,
          startPlaceCode: "UPC",
          startPlace: "UPC",
          endPlaceCode: "UPE",
          endPlace: "UPE",
          from: "UPC",
          to: "UPE",
          direction: "Elsau"
        }
      ],
      breaks: [],
      validation: { valid: true, errors: [], warnings: [] }
    },
    stem
  }
}

function world(services) {
  const disk = new Map()

  disk.set(`${DATA}/services-index.json`, JSON.stringify({
    version: 2,
    updatedAt: new Date().toISOString(),
    services: services.map(item => item.entry)
  }))

  for (const item of services) {
    disk.set(`${CACHE}/${item.stem}.json`, JSON.stringify(item.cache))
  }

  return disk
}

const today = new Date()
const TODAY = dayKey(today)
const TOMORROW = dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1))
const LATER = dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3))

const at = (hours, minutes) =>
  new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes)

const current = service({ date: TODAY, number: "EA05", start: "05:30", end: "14:00" })
const nextDay = service({ date: TOMORROW, number: "EA07", start: "05:12", end: "13:20" })
const farAway = service({ date: LATER, number: "EA09", start: "06:00", end: "14:00" })

async function selectionAt(disk, when) {
  return loadManager(disk).resolveServiceForDate(when)
}

function check(label, actual, expected) {
  if (actual !== expected) {
    failures.push(`${label} : « ${actual} » au lieu de « ${expected} »`)
  }
}

/* Test 1 — la carte suivante est déjà là : cinq minutes, puis bascule. */
{
  const disk = world([current, nextDay])

  check("A · fin + 1 min", (await selectionAt(disk, at(14, 1))).service, "EA05")
  check("A · fin + 4 min", (await selectionAt(disk, at(14, 4))).service, "EA05")
  check("A · fin + 6 min", (await selectionAt(disk, at(14, 6))).service, "EA07")
  check("A · fin + 30 min", (await selectionAt(disk, at(14, 30))).service, "EA07")
}

/* Test 2 — aucune carte suivante : une heure, puis plus de service. */
{
  const disk = world([current])

  check("B · fin + 5 min", (await selectionAt(disk, at(14, 5))).service, "EA05")
  check("B · fin + 59 min", (await selectionAt(disk, at(14, 59))).service, "EA05")

  const expired = await selectionAt(disk, at(15, 5))

  check("B · fin + 65 min", expired.found ? expired.service : "aucun", "aucun")
  check("B · motif", expired.reason, "service-finished")
}

/*
 * Test 3 — la carte suivante arrive pendant l'attente.
 *
 * Elle est déposée vingt minutes après la fin. La règle étant recalculée
 * à chaque exécution, l'attente devient celle du cas A — déjà écoulée —
 * et le conducteur ne reste pas bloqué les quarante minutes restantes.
 */
{
  const disk = world([current])

  check("C · avant dépôt", (await selectionAt(disk, at(14, 20))).service, "EA05")

  const index = JSON.parse(disk.get(`${DATA}/services-index.json`))
  index.services.push(nextDay.entry)
  disk.set(`${DATA}/services-index.json`, JSON.stringify(index))
  disk.set(`${CACHE}/${nextDay.stem}.json`, JSON.stringify(nextDay.cache))

  check("C · après dépôt", (await selectionAt(disk, at(14, 21))).service, "EA07")
}

/* Test 4 — plusieurs cartes : c'est la plus proche qui prend la suite. */
{
  const disk = world([current, farAway, nextDay])

  check("D · succession", (await selectionAt(disk, at(14, 10))).service, "EA07")
}

/* Test 5 — une carte au cache illisible ne doit pas écourter l'attente. */
{
  const disk = world([current, nextDay])
  disk.set(`${CACHE}/${nextDay.stem}.json`, "{ ceci n'est pas du JSON")

  check("E · fin + 10 min", (await selectionAt(disk, at(14, 10))).service, "EA05")

  const expired = await selectionAt(disk, at(15, 30))

  check("E · fin + 90 min", expired.found ? expired.service : "aucun", "aucun")
}

/*
 * Test 6 — aucune exécution au moment exact du basculement.
 *
 * iOS ne garantit pas de réveiller le widget à la minute près. L'état
 * doit donc se déduire de l'heure qu'il est, jamais d'un compte à
 * rebours qu'une exécution manquée laisserait en plan.
 */
{
  const disk = world([current, nextDay])

  check("F · première exécution à + 3 h", (await selectionAt(disk, at(17, 0))).service, "EA07")
}

{
  const disk = world([current])
  const expired = await selectionAt(disk, at(23, 30))

  check("F · sans suivante, + 9 h", expired.found ? expired.service : "aucun", "aucun")
}

/* Le basculement annoncé doit correspondre à la règle appliquée. */
{
  const withNext = await selectionAt(world([current, nextDay]), at(14, 1))
  const alone = await selectionAt(world([current]), at(14, 1))

  check("délai annoncé avec suivante", withNext.displayGraceMs, 5 * MINUTE)
  check("délai annoncé sans suivante", alone.displayGraceMs, 60 * MINUTE)
}

if (failures.length) {
  console.log("ÉCHEC  passage au service suivant")
  for (const failure of failures) console.log(`         ${failure}`)
  process.exit(1)
}

console.log(
  "ok     passage au service suivant " +
  "(suivante présente, absente, déposée pendant l’attente, plusieurs cartes, " +
  "cache illisible, exécution tardive)"
)
