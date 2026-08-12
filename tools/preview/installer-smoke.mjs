/*
 * Test de fumée de CTS Installer : exécute le fichier ENTIER, `await main()`
 * compris, sur des doublures, et refuse toute erreur d'exécution.
 *
 * Ce test existe à cause d'un bug réel. Une constante de premier niveau
 * déclarée sous `await main()` reste dans sa zone morte temporelle pendant
 * toute l'exécution ; la fonction qui l'utilise lève « Cannot access … before
 * initialization ». Ni la vérification syntaxique ni le banc de mesure ne
 * pouvaient le voir : le banc neutralise `await main()` et évalue donc le
 * fichier de bout en bout avant d'appeler quoi que ce soit, ce qui initialise
 * tout. Il fallait exécuter le fichier comme l'iPhone l'exécute.
 *
 * Les trois actions du menu sont jouées : vérification, diagnostic,
 * désinstallation.
 */

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"
import * as ui from "./uitable-shim.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(here, "..", "..")
const installerPath = process.argv[2] || path.join(repository, "CTS Installer.js")

const SNAPSHOT = "6a3937ee112251d6093f6678710b6d80187f1085"
const manifest = JSON.parse(fs.readFileSync(path.join(repository, "version.json"), "utf8"))

function repositoryFile(name) {
  const file = path.join(repository, name)
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null
}

/*
 * Chaque action du menu est jouée dans son propre système de fichiers, et
 * l'alerte répond toujours le même index — celui de l'action visée.
 */
async function runAction(label, choice, { seed = true } = {}) {
  const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cts-smoke-"))
  const docs = path.join(sandboxRoot, "Documents")
  fs.mkdirSync(docs, { recursive: true })
  fs.writeFileSync(path.join(docs, "CTS Installer.js"), fs.readFileSync(installerPath))

  if (seed) {
    const root = path.join(docs, "CTS Dashboard")
    for (const name of manifest.scripts) {
      if (name === "CTS Installer.js") continue
      fs.writeFileSync(path.join(docs, name), repositoryFile(name))
    }
    for (const item of manifest.resources) {
      const target = path.join(root, item.destination)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, repositoryFile(item.name))
    }
    fs.mkdirSync(path.join(root, "Data"), { recursive: true })
    fs.writeFileSync(
      path.join(root, "Data", "installation.json"),
      JSON.stringify({
        dashboardVersion: manifest.version,
        installerVersion: manifest.installerVersion,
        repositoryRevision: SNAPSHOT,
        files: { installed: [], updated: [], repaired: [], unchanged: [], failed: [] }
      })
    )
  }

  const failures = []
  const shown = []

  /*
   * L'erreur ne remonte pas à la console : main() la rattrape et l'affiche.
   * On observe donc ce que le conducteur verrait — le texte des alertes et
   * celui des lignes de table — puis on y cherche les signatures d'une
   * erreur d'exécution ou d'une opération avortée.
   */
  const RUNTIME_ERROR = /before initialization|is not defined|is not a function|undefined is not|Cannot read|null is not/i
  const ABORTED = /Opération impossible|Opération interrompue|Installation non validée/i

  class RecordingTable extends ui.UITable {
    addRow(row) {
      for (const cell of row.cells || []) {
        if (cell.title) shown.push(String(cell.title))
        if (cell.subtitle) shown.push(String(cell.subtitle))
      }
      super.addRow(row)
    }
  }

  const fileManager = {
    documentsDirectory: () => docs,
    joinPath: (a, b) => path.join(a, b),
    fileExists: target => fs.existsSync(target),
    isFileDownloaded: () => true,
    readString: target => fs.readFileSync(target, "utf8"),
    writeString: (target, content) => {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, content)
    },
    createDirectory: target => fs.mkdirSync(target, { recursive: true }),
    remove: target => fs.rmSync(target, { recursive: true, force: true }),
    move: (from, to) => {
      fs.mkdirSync(path.dirname(to), { recursive: true })
      fs.renameSync(from, to)
    },
    copy: (from, to) => fs.copyFileSync(from, to),
    downloadFileFromiCloud: async () => {},
    fileSize: target => Math.round(fs.statSync(target).size / 1024),
    modificationDate: target => fs.statSync(target).mtime,
    listContents: target => (fs.existsSync(target) ? fs.readdirSync(target) : [])
  }

  const sandbox = {
    console: {
      log: () => {},
      warn: () => {},
      error: message => failures.push(String(message))
    },
    Date,
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    Promise,
    RegExp,
    Error,
    isNaN,
    parseInt,
    parseFloat,
    encodeURIComponent,
    decodeURIComponent,
    setTimeout,
    /* Scriptable planifie ses attentes avec Timer, pas avec setTimeout. */
    Timer: class {
      static schedule(seconds, repeats, callback) {
        setTimeout(callback, seconds * 1000)
        return new this()
      }
      invalidate() {}
    },
    Color: ui.Color,
    Font: ui.Font,
    SFSymbol: ui.SFSymbol,
    UITable: RecordingTable,
    UITableRow: ui.UITableRow,
    Script: { name: () => "CTS Installer", complete: () => {} },
    Device: { systemVersion: () => "26.6" },
    Pasteboard: { copyString: () => {} },
    FileManager: { iCloud: () => fileManager, local: () => fileManager },
    importModule: () => {
      throw new Error("module absent")
    },
    Alert: class {
      constructor() {
        this.actions = []
      }
      addAction(t) {
        this.actions.push(t)
      }
      addCancelAction() {}
      addDestructiveAction(t) {
        this.actions.push(t)
      }
      set title(value) {
        shown.push(String(value))
        this._title = value
      }
      get title() {
        return this._title
      }
      set message(value) {
        shown.push(String(value))
        this._message = value
      }
      get message() {
        return this._message
      }
      /*
       * L'alerte d'erreur du script n'a qu'une action ; y répondre 0 est
       * sans effet. Les menus, eux, reçoivent l'index visé.
       */
      present() {
        return Promise.resolve(0)
      }
      presentSheet() {
        return Promise.resolve(choice)
      }
    },
    Request: class {
      constructor(url) {
        this.url = String(url)
        this.headers = {}
        this.response = { statusCode: 200 }
      }
      async loadString() {
        if (this.url.includes("api.github.com")) {
          return JSON.stringify({ sha: SNAPSHOT })
        }
        const match = this.url.match(/\/([^/?]+)(?:\?|$)/)
        const name = match ? decodeURIComponent(match[1]) : ""
        const content =
          name === "CTS Installer.js"
            ? fs.readFileSync(installerPath, "utf8")
            : repositoryFile(name)
        if (content === null) {
          this.response = { statusCode: 404 }
          return "404: Not Found"
        }
        return content
      }
    }
  }

  /*
   * Le fichier est exécuté tel quel. `await main()` est conservé : c'est
   * précisément ce que ce test doit éprouver.
   */
  const source = fs.readFileSync(installerPath, "utf8")

  vm.createContext(sandbox)

  try {
    await vm.runInContext(
      `(async () => {\n${source.replace(/^await main\(\)$/m, "await main()")}\n})()`,
      sandbox,
      { filename: installerPath }
    )
  } catch (error) {
    failures.push(`exception non rattrapée : ${error.message}`)
  }

  for (const text of shown) {
    if (RUNTIME_ERROR.test(text)) failures.push(`erreur d'exécution affichée : ${text}`)
    else if (ABORTED.test(text)) failures.push(`opération avortée : ${text}`)
  }

  fs.rmSync(sandboxRoot, { recursive: true, force: true })
  return [...new Set(failures)]
}

const scenarios = [
  { label: "vérification", choice: 0 },
  { label: "diagnostic", choice: 1 },
  { label: "désinstallation", choice: 2 },
  { label: "installation neuve", choice: 0, seed: false }
]

let broken = false

for (const scenario of scenarios) {
  const failures = await runAction(scenario.label, scenario.choice, {
    seed: scenario.seed !== false
  })

  if (failures.length) {
    broken = true
    console.log(`ÉCHEC  ${scenario.label}`)
    for (const failure of failures) console.log(`         ${failure}`)
  } else {
    console.log(`ok     ${scenario.label}`)
  }
}

process.exit(broken ? 1 : 0)
