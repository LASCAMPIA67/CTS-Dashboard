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
const DATA = "/documents/CTS Dashboard/Data"
const LOCK = `${DATA}/services-scan.lock`
const STATE = `${DATA}/services-scan-state.json`

/*
 * Une date de modification figée : l'empreinte d'un fichier vaut
 * « nom | taille | date de modification », et un banc qui la laisse
 * bouger ne peut rien affirmer sur ce que le balayage a déjà vu.
 */
const FIXED_MODIFICATION_DATE = new Date("2026-08-19T06:00:00.000Z")

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
    modificationDate: () => FIXED_MODIFICATION_DATE
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

/*
 * Le widget détecte, l'application importe.
 *
 * Lire une carte agent demande jusqu'à vingt-cinq secondes ; iOS en
 * accorde quelques-unes à un widget. Le widget ne lance donc plus
 * d'import : il compte ce qui attend et le signale. L'application, elle,
 * va au bout.
 */
for (const runsInWidget of [true, false]) {
  const disk = newDisk()
  const { manager, imports } = loadManager(disk, { runsInWidget })
  const result = await manager.scanServices({})

  if (result.detected !== 1) {
    failures.push(
      `${runsInWidget ? "widget" : "application"} : ${result.detected} PDF détecté(s) au lieu de 1`
    )
  }

  if (runsInWidget) {
    if (imports.length) {
      failures.push("widget : une lecture de PDF a été lancée alors qu'il n'en a pas le temps")
    }

    if (result.remaining !== 1) {
      failures.push(`widget : ${result.remaining} carte(s) annoncée(s) en attente au lieu de 1`)
    }

    if (result.status !== "deferred") {
      failures.push(`widget : statut « ${result.status} » au lieu de « deferred »`)
    }
  } else if (!imports.length) {
    failures.push("application : la carte agent déposée n'est pas importée")
  }
}

/*
 * Un enregistrement perdu doit être refait.
 *
 * L'état de balayage retient qu'un PDF a été importé puis indexé. Mais
 * cet état ne décrit que ce qui a été fait — il ne prouve pas que le
 * cache et l'entrée d'index sont encore là. Un cache effacé à la main,
 * égaré dans une synchronisation ou jamais redescendu sur un nouvel
 * appareil laissait le fichier dans un angle mort : détecté à chaque
 * balayage, jamais réimporté, et le widget annonçait « 1 PDF détecté,
 * aucun service exploitable » sans fin. Seul un changement de nom du
 * fichier en sortait.
 *
 * Ici l'index est vide et l'état dit « indexé » : les deux se
 * contredisent, et c'est l'index qui fait foi.
 */
{
  const canonical = "Service_2026-08-20_EA05.pdf"
  const disk = new Map()
  disk.set(SERVICES, "")
  disk.set(`${SERVICES}/${canonical}`, "%PDF-1.4 contenu")

  disk.set(STATE, JSON.stringify({
    version: 1,
    files: {
      [canonical]: {
        fingerprint: [
          canonical.toLowerCase(),
          1,
          FIXED_MODIFICATION_DATE.toISOString()
        ].join("|"),
        status: "indexed",
        lastAttemptAt: new Date().toISOString(),
        service: "EA05",
        date: "2026-08-20",
        canonicalFileName: canonical
      }
    }
  }))

  const { manager, imports } = loadManager(disk, { runsInWidget: false })
  await manager.scanServices({})

  if (!imports.length) {
    failures.push(
      "enregistrement perdu : le PDF reste ignoré alors que son cache " +
      "et son entrée d'index ont disparu"
    )
  }
}

/*
 * Le refus de validation, lui, doit tenir. Il porte sur le contenu du
 * PDF, pas sur son enregistrement : le même fichier donnera le même
 * refus, et le réessayer à chaque réveil ne ferait que brûler le temps
 * que le widget n'a pas.
 */
{
  const rejected = "Service_2026-08-20_EA05.pdf"
  const disk = new Map()
  disk.set(SERVICES, "")
  disk.set(`${SERVICES}/${rejected}`, "%PDF-1.4 contenu")

  disk.set(STATE, JSON.stringify({
    version: 1,
    files: {
      [rejected]: {
        fingerprint: [
          rejected.toLowerCase(),
          1,
          FIXED_MODIFICATION_DATE.toISOString()
        ].join("|"),
        status: "validation-error",
        lastAttemptAt: new Date().toISOString(),
        error: "Carte agent illisible"
      }
    }
  }))

  const { manager, imports } = loadManager(disk, { runsInWidget: false })
  await manager.scanServices({})

  if (imports.length) {
    failures.push(
      "refus de validation : le PDF est réanalysé alors que son contenu " +
      "n'a pas changé"
    )
  }
}

/*
 * Un balayage qui ne trouve rien n'écrit rien.
 *
 * L'état du balayage était réenregistré à chaque réveil, uniquement pour
 * y inscrire une nouvelle date. Un widget réveillé souvent écrivait donc
 * dans iCloud plusieurs fois par heure sans qu'aucun fichier n'ait
 * changé — de l'usure, et autant d'occasions d'être tué en pleine
 * écriture. L'état n'est plus écrit que lorsqu'il apporte quelque chose,
 * ou une fois par heure pour rester lisible dans le diagnostic.
 */
{
  const disk = new Map()
  disk.set(SERVICES, "")

  const { manager, fm } = loadManager(disk, { runsInWidget: false })
  let writes = 0

  const original = fm.writeString
  fm.writeString = (target, value) => {
    if (String(target).startsWith(STATE)) writes++
    return original(target, value)
  }

  await manager.scanServices({})
  const afterFirst = writes

  if (afterFirst === 0) {
    failures.push("dossier vide : le premier balayage n'écrit jamais son état")
  }

  await manager.scanServices({})
  await manager.scanServices({})

  if (writes > afterFirst) {
    failures.push(
      `dossier inchangé : ${writes - afterFirst} écriture(s) d'état inutile(s)`
    )
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
  console.log("ÉCHEC  balayage des services")
  for (const failure of failures) console.log(`         ${failure}`)
  process.exit(1)
}

console.log("ok     balayage des services (verrou : 4 combinaisons, nature ; détection ; " +
  "enregistrement perdu ; refus de validation ; aucune écriture inutile ; " +
  "import réservé à l\u2019application)")
