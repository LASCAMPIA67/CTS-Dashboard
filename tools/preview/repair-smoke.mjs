/*
 * Test de fumée de CTS Repair.
 *
 * Ce script est le seul recours d'un conducteur dont l'installateur ne
 * peut plus s'écrire lui-même : il doit fonctionner du premier coup, sans
 * filet, et ne jamais laisser l'iPhone sans installateur. Le fichier est
 * donc exécuté entier — `await main()` compris — sur des doublures, dans
 * cinq situations.
 */

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"
import * as ui from "./uitable-shim.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(here, "..", "..")
const repairPath = path.join(repository, "CTS Repair.js")
const installerSource = fs.readFileSync(path.join(repository, "CTS Installer.js"), "utf8")

/* Un installateur qui reproduit le défaut de 1.0.7. */
const brokenInstaller = installerSource.replace(
  /^await main\(\)$/m,
  "await main()\nconst LATE_CONSTANT = 1"
)

async function run(label, { seed, serve, expect }) {
  const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cts-repair-"))
  const docs = path.join(sandboxRoot, "Documents")
  fs.mkdirSync(docs, { recursive: true })

  for (const name of seed) {
    fs.writeFileSync(path.join(docs, name), "// ancien installateur cassé\n")
  }

  const shown = []
  const failures = []

  const fm = {
    documentsDirectory: () => docs,
    joinPath: (a, b) => path.join(a, b),
    fileExists: target => fs.existsSync(target),
    readString: target => fs.readFileSync(target, "utf8"),
    writeString: (target, content) => fs.writeFileSync(target, content),
    remove: target => fs.rmSync(target, { recursive: true, force: true }),
    move: (from, to) => fs.renameSync(from, to),
    listContents: target => fs.readdirSync(target)
  }

  class RecordingTable extends ui.UITable {
    addRow(row) {
      for (const cell of row.cells || []) {
        if (cell.title) shown.push(String(cell.title))
        if (cell.subtitle) shown.push(String(cell.subtitle))
      }
      super.addRow(row)
    }
  }

  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: m => failures.push(String(m)) },
    Date, Math, JSON, Number, String, Boolean, Array, Object, Promise, RegExp, Error,
    encodeURIComponent,
    setTimeout,
    Timer: class {
      static schedule(milliseconds, repeats, callback) {
        setTimeout(callback, Math.min(milliseconds, 5))
        return new this()
      }
      invalidate() {}
    },
    Font: ui.Font,
    UITable: RecordingTable,
    UITableRow: ui.UITableRow,
    Script: { name: () => "CTS Repair", complete: () => {} },
    FileManager: { iCloud: () => fm, local: () => fm },
    Alert: class {
      constructor() { this.actions = [] }
      addAction(t) { this.actions.push(t) }
      addCancelAction() {}
      set title(v) { shown.push(String(v)); this._t = v }
      get title() { return this._t }
      set message(v) { shown.push(String(v)); this._m = v }
      get message() { return this._m }
      present() { return Promise.resolve(0) }
      presentSheet() { return Promise.resolve(0) }
    },
    Request: class {
      constructor(url) {
        this.url = String(url)
        this.headers = {}
        this.response = { statusCode: 200 }
      }
      async loadString() {
        const served = serve()
        if (served === null) {
          this.response = { statusCode: 500 }
          throw new Error("réseau indisponible")
        }
        return served
      }
    }
  }

  vm.createContext(sandbox)

  try {
    await vm.runInContext(
      `(async () => {\n${fs.readFileSync(repairPath, "utf8")}\n})()`,
      sandbox,
      { filename: repairPath }
    )
  } catch (error) {
    failures.push(`exception non rattrapée : ${error.message}`)
  }

  const written = fs
    .readdirSync(docs)
    .filter(name => fs.readFileSync(path.join(docs, name), "utf8") === installerSource)
    .sort()

  const leftovers = fs.readdirSync(docs).filter(name => /\.rollback$/.test(name))
  const missing = seed.filter(name => !fs.existsSync(path.join(docs, name)))

  if (leftovers.length) failures.push(`résidus : ${leftovers.join(", ")}`)
  if (missing.length) failures.push(`fichiers perdus : ${missing.join(", ")}`)

  const text = shown.join(" | ")
  for (const needle of expect.shows || []) {
    if (!text.includes(needle)) failures.push(`texte attendu absent : « ${needle} »`)
  }
  for (const needle of expect.hides || []) {
    if (text.includes(needle)) failures.push(`texte interdit présent : « ${needle} »`)
  }
  if (JSON.stringify(written) !== JSON.stringify(expect.written)) {
    failures.push(
      `fichiers réparés ${JSON.stringify(written)} ` +
      `au lieu de ${JSON.stringify(expect.written)}`
    )
  }

  fs.rmSync(sandboxRoot, { recursive: true, force: true })

  if (failures.length) {
    console.log(`ÉCHEC  ${label}`)
    for (const failure of [...new Set(failures)]) console.log(`         ${failure}`)
    return false
  }

  console.log(`ok     ${label}`)
  return true
}

const scenarios = [
  {
    label: "installateur cassé remplacé",
    seed: ["CTS Installer.js"],
    serve: () => installerSource,
    expect: { written: ["CTS Installer.js"], shows: ["Réparation terminée", "1.0.8"] }
  },
  {
    label: "doublon réparé aussi",
    seed: ["CTS Installer.js", "CTS Installer 1.js"],
    serve: () => installerSource,
    expect: { written: ["CTS Installer 1.js", "CTS Installer.js"] }
  },
  {
    label: "aucun installateur présent",
    seed: [],
    serve: () => installerSource,
    expect: { written: ["CTS Installer.js"] }
  },
  {
    label: "version publiée encore malade",
    seed: ["CTS Installer.js"],
    serve: () => brokenInstaller,
    expect: {
      written: [],
      shows: ["Réparation impossible", "défaut d'initialisation"],
      hides: ["Réparation terminée"]
    }
  },
  {
    label: "réseau indisponible",
    seed: ["CTS Installer.js"],
    serve: () => null,
    expect: {
      written: [],
      shows: ["Réparation impossible"],
      hides: ["Réparation terminée"]
    }
  }
]

let broken = false
for (const scenario of scenarios) {
  if (!(await run(scenario.label, scenario))) broken = true
}

process.exit(broken ? 1 : 0)
