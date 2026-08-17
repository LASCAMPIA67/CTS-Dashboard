/*
 * Chargement de tous les modules distribués, et contrôle des références
 * entre eux.
 *
 * Scriptable ne signale une fonction manquante qu'au moment où le chemin
 * d'exécution y passe : un `UTILS.errorMessage` mal orthographié survit à
 * la vérification syntaxique, à la CI, à l'installation, et n'échoue que
 * le matin où un conducteur regarde son widget. Aucun des autres tests ne
 * couvre CTS Widget Engine, CTS Services Manager ni CTS Import Pipeline.
 *
 * Ce test charge donc les dix-sept modules dans l'ordre de leurs
 * dépendances, puis relit chaque fichier pour retrouver les membres qu'il
 * consulte sur les modules qu'il importe, et vérifie que chacun existe.
 * C'est le filet qui permet de déplacer une fonction d'un module à
 * l'autre sans risquer de casser le widget.
 */

import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(here, "..", "..")

const manifest = JSON.parse(
  fs.readFileSync(path.join(repository, "version.json"), "utf8")
)

const failures = []
const sources = new Map()

for (const name of manifest.scripts) {
  sources.set(name.replace(/\.js$/, ""), fs.readFileSync(path.join(repository, name), "utf8"))
}

/* Le point d'entrée n'est pas un module : il s'exécute, il n'exporte rien. */
const modules = [...sources.keys()].filter(name => name !== "CTS Dashboard")

function dependenciesOf(name) {
  return [
    ...new Set(
      [...sources.get(name).matchAll(/importModule\(\s*"([^"]+)"/g)].map(match => match[1])
    )
  ].filter(dependency => sources.has(dependency))
}

/* Tri topologique : un module se charge après ceux qu'il importe. */
function loadOrder() {
  const ordered = []
  const seen = new Set()
  const stack = new Set()

  const visit = name => {
    if (seen.has(name)) return
    if (stack.has(name)) {
      failures.push(`dépendance circulaire autour de ${name}`)
      return
    }

    stack.add(name)
    for (const dependency of dependenciesOf(name)) visit(dependency)
    stack.delete(name)

    seen.add(name)
    ordered.push(name)
  }

  for (const name of modules) visit(name)
  return ordered
}

/*
 * Doublures de l'API Scriptable. Elles n'ont pas à être fidèles : aucun
 * module ne doit toucher au disque ni au réseau au chargement. Si l'une
 * d'elles est appelée pendant le chargement, c'est en soi une anomalie —
 * le widget paierait ce coût à chaque rafraîchissement.
 */
const touched = []

function scriptableStubs() {
  const fileManager = {
    documentsDirectory: () => "/docs",
    libraryDirectory: () => "/library",
    joinPath: (a, b) => `${a}/${b}`,
    fileExists: () => true,
    isFileDownloaded: () => true,
    readString: () => "{}",
    writeString: () => {},
    createDirectory: () => {},
    remove: () => {},
    move: () => {},
    copy: () => {},
    listContents: () => [],
    fileSize: () => 1,
    modificationDate: () => new Date(),
    isDirectory: () => false,
    downloadFileFromiCloud: async () => {}
  }

  return {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Date, Math, JSON, Number, String, Boolean, Array, Object, Set, Map,
    Promise, RegExp, Error, isNaN, parseInt, parseFloat, Intl,
    encodeURIComponent, decodeURIComponent, setTimeout,
    args: { plainTexts: [], fileURLs: [], urls: [] },
    config: { runsInWidget: false, runsInApp: true, widgetFamily: "large" },
    Script: { name: () => "test", complete: () => {}, setWidget: () => {} },
    Device: { systemVersion: () => "27.0", screenSize: () => ({ width: 393, height: 852 }) },
    Keychain: {
      contains: () => false,
      get: () => "",
      set: () => {},
      remove: () => {}
    },
    UUID: { string: () => "0000" },
    Pasteboard: { copyString: () => {} },
    Timer: class {
      static schedule(ms, repeats, callback) {
        setTimeout(callback, 0)
        return new this()
      }
      invalidate() {}
    },
    Request: class {
      constructor(url) {
        touched.push(`Request(${url})`)
        this.headers = {}
        this.response = { statusCode: 200 }
      }
      async loadString() { return "" }
      async loadJSON() { return {} }
    },
    WebView: class {
      async loadHTML() {}
      async evaluateJavaScript() { return null }
    },
    Alert: class {
      addAction() {}
      addCancelAction() {}
      addTextField() {}
      addSecureTextField() {}
      textFieldValue() { return "" }
      present() { return Promise.resolve(0) }
      presentAlert() { return Promise.resolve(0) }
      presentSheet() { return Promise.resolve(0) }
    },
    Notification: class { schedule() { return Promise.resolve() } },
    DateFormatter: class {
      string() { return "" }
    },
    Color: class {
      constructor(hex, alpha) { this.hex = hex; this.alpha = alpha }
      static dynamic(a) { return a }
      static white() { return new this("#FFFFFF") }
      static black() { return new this("#000000") }
      static clear() { return new this("#000000", 0) }
    },
    Font: new Proxy({}, { get: () => () => ({}) }),
    Size: class { constructor(w, h) { this.width = w; this.height = h } },
    Point: class { constructor(x, y) { this.x = x; this.y = y } },
    Rect: class { constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }) } },
    SFSymbol: { named: () => ({ image: {}, applyFont: () => {} }) },
    Image: { fromData: () => ({}) },
    Data: { fromString: () => ({}) },
    LinearGradient: class {},
    DrawContext: class {
      getImage() { return {} }
      setFillColor() {}
      setTextColor() {}
      setFont() {}
      fillRect() {}
      fillEllipse() {}
      drawTextInRect() {}
    },
    ListWidget: class {
      addStack() { return this }
      addText() { return { }, this }
      addSpacer() {}
      setPadding() {}
    },
    FileManager: { iCloud: () => fileManager, local: () => fileManager }
  }
}

const loaded = new Map()

for (const name of loadOrder()) {
  const module = { exports: {} }

  const sandbox = {
    ...scriptableStubs(),
    module,
    importModule: requested => {
      const key = String(requested).replace(/^.*\//, "")
      if (!loaded.has(key)) {
        failures.push(`${name} importe ${key}, qui n'a pas pu être chargé`)
        return {}
      }
      return loaded.get(key)
    }
  }

  vm.createContext(sandbox)

  try {
    vm.runInContext(sources.get(name), sandbox, { filename: `${name}.js` })
  } catch (error) {
    failures.push(`${name} ne se charge pas : ${error.message}`)
    loaded.set(name, {})
    continue
  }

  const exported = module.exports

  if (!exported || typeof exported !== "object" || !Object.keys(exported).length) {
    failures.push(`${name} n'exporte rien`)
  }

  loaded.set(name, exported || {})
}

/*
 * Les références réellement écrites dans chaque fichier : `UTILS.machin`
 * quand UTILS vient d'un importModule, et les déstructurations
 * `const { a, b } = importModule(...)`.
 */
let checked = 0

for (const consumer of modules) {
  const source = sources.get(consumer)

  const aliases = new Map()

  for (const match of source.matchAll(
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*\n?\s*importModule\(\s*"([^"]+)"/g
  )) {
    if (sources.has(match[2])) aliases.set(match[1], match[2])
  }

  for (const [alias, moduleName] of aliases) {
    const exported = loaded.get(moduleName) || {}

    for (const use of source.matchAll(
      new RegExp(`\\b${alias}\\.([A-Za-z_$][\\w$]*)`, "g")
    )) {
      checked++
      if (!(use[1] in exported)) {
        failures.push(
          `${consumer} appelle ${alias}.${use[1]}, absent des exports de ${moduleName}`
        )
      }
    }
  }

  for (const match of source.matchAll(
    /const\s*\{([^}]*)\}\s*=\s*\n?\s*importModule\(\s*"([^"]+)"/g
  )) {
    const moduleName = match[2]
    if (!sources.has(moduleName)) continue

    const exported = loaded.get(moduleName) || {}

    for (const part of match[1].split(",")) {
      const member = part.split(":")[0].trim()
      if (!member) continue
      checked++
      if (!(member in exported)) {
        failures.push(
          `${consumer} déstructure ${member} depuis ${moduleName}, qui ne l'exporte pas`
        )
      }
    }
  }

  /* Déstructuration depuis un alias déjà résolu : const { fm } = CONFIG */
  for (const match of source.matchAll(/const\s*\{([^}]*)\}\s*=\s*([A-Z][A-Z_]*)\b/g)) {
    const moduleName = aliases.get(match[2])
    if (!moduleName) continue

    const exported = loaded.get(moduleName) || {}

    for (const part of match[1].split(",")) {
      const member = part.split(":")[0].trim()
      if (!member) continue
      checked++
      if (!(member in exported)) {
        failures.push(
          `${consumer} déstructure ${member} depuis ${moduleName}, qui ne l'exporte pas`
        )
      }
    }
  }
}

if (touched.length) {
  failures.push(
    `un module atteint le réseau au chargement : ${[...new Set(touched)].join(", ")}`
  )
}

if (failures.length) {
  console.log("ÉCHEC  chargement des modules et références croisées")
  for (const failure of [...new Set(failures)]) console.log(`         ${failure}`)
  process.exit(1)
}

console.log(
  `ok     chargement des modules et références croisées ` +
    `(${modules.length} modules, ${checked} références)`
)
