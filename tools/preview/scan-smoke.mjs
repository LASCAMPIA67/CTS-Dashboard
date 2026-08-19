/*
 * Verrou d'analyse du dossier Services.
 *
 * Un réveil de widget peut être tué en pleine lecture d'un PDF : iOS ne
 * lui accorde que quelques secondes, la lecture en demande jusqu'à
 * vingt-cinq. Il laisse alors son verrou derrière lui, valable deux
 * minutes.
 *
 * Sans reprise, le seul contexte capable de terminer l'import —
 * l'application, où le temps ne manque pas — se voyait refuser le travail
 * par celui qui, précisément, ne pouvait pas le finir. Le conducteur
 * voyait « Analyse en cours » dans le widget comme dans l'application, et
 * sa carte agent n'était jamais importée.
 *
 * Ce banc fixe la règle : l'application passe devant un widget, jamais
 * l'inverse, et deux exécutions de même nature se respectent.
 */

import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(here, "..", "..")
const failures = []

const SERVICES = "/documents/CTS Dashboard/Services"
const LOCK = "/documents/CTS Dashboard/Data/services-scan.lock"

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
    listContents: target =>
      [...disk.keys()]
        .filter(key => key.startsWith(`${target}/`))
        .map(key => key.slice(target.length + 1))
        .filter(name => !name.includes("/")),
    isDirectory: target => disk.get(target) === "",
    fileSize: () => 1,
    modificationDate: () => new Date()
  }
}

/*
 * Le gestionnaire est chargé avec ses vraies dépendances de stockage.
 * Seul l'importateur est doublé : c'est lui qui lit réellement le PDF, ce
 * qu'aucun banc hors iPhone ne peut faire.
 */
function loadManager(disk, { runsInWidget }) {
  const loaded = {}
  const imports = []
  const fm = createFileManager(disk)

  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Date, Math, JSON, Number, String, Boolean, Array, Object, Set, Map,
    Promise, RegExp, Error, isNaN, parseInt, parseFloat,
    encodeURIComponent, decodeURIComponent,
    config: { runsInWidget },
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
        readCurrentIndex: async () => ({ version: 2, services: [] }),
        importPdf: async pdfPath => {
          imports.push(pdfPath)
          return { success: true, service: "EA05", date: "2026-08-20" }
        }
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

  return { manager: load("CTS Services Manager"), imports, fm }
}

function writeLock(disk, surface) {
  disk.set(LOCK, JSON.stringify({
    token: "verrou-en-place",
    createdAt: new Date().toISOString(),
    surface
  }))
}

function newDisk() {
  const disk = new Map()
  disk.set(SERVICES, "")
  disk.set(`${SERVICES}/DriverTimeCard (3).pdf`, "%PDF-1.4 contenu")
  return disk
}

/*
 * Les quatre combinaisons. Une seule doit passer outre le verrou :
 * l'application devant un widget.
 */
const CASES = [
  { held: "widget", runsInWidget: false, expected: true, label: "application devant un widget" },
  { held: "widget", runsInWidget: true, expected: false, label: "widget devant un widget" },
  { held: "application", runsInWidget: false, expected: false, label: "application devant une application" },
  { held: "application", runsInWidget: true, expected: false, label: "widget devant une application" }
]

for (const { held, runsInWidget, expected, label } of CASES) {
  const disk = newDisk()
  writeLock(disk, held)

  const { manager } = loadManager(disk, { runsInWidget })
  const result = await manager.scanServices({})
  const proceeded = result.status !== "locked"

  if (proceeded !== expected) {
    failures.push(
      `${label} : l'analyse ${proceeded ? "passe" : "est bloquée"} ` +
      `alors qu'elle devrait ${expected ? "passer" : "être bloquée"}`
    )
  }
}

/* Sans verrou, le PDF déposé doit être détecté et importé. */
{
  const disk = newDisk()
  const { manager, imports } = loadManager(disk, { runsInWidget: false })
  const result = await manager.scanServices({})

  if (result.status === "locked") {
    failures.push("sans verrou : l'analyse est refusée")
  }

  if (result.detected !== 1) {
    failures.push(`sans verrou : ${result.detected} PDF détecté(s) au lieu de 1`)
  }

  if (!imports.length) {
    failures.push("sans verrou : la carte agent déposée n'est pas importée")
  }
}

/* Le verrou pris porte la nature de l'exécution, sinon la reprise est aveugle. */
for (const runsInWidget of [true, false]) {
  const disk = newDisk()
  const { manager, fm } = loadManager(disk, { runsInWidget })
  let seen = ""

  const original = fm.writeString
  fm.writeString = (target, value) => {
    if (target === LOCK) {
      try { seen = String(JSON.parse(value).surface || "") } catch (_) {}
    }
    return original(target, value)
  }

  await manager.scanServices({})

  const expected = runsInWidget ? "widget" : "application"

  if (seen !== expected) {
    failures.push(`verrou pris : nature « ${seen || "absente"} » au lieu de « ${expected} »`)
  }
}

if (failures.length) {
  console.log("ÉCHEC  verrou d'analyse des services")
  for (const failure of failures) console.log(`         ${failure}`)
  process.exit(1)
}

console.log("ok     verrou d'analyse des services (4 combinaisons, détection, nature du verrou)")
