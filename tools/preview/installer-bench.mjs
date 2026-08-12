/*
 * Banc de mesure de CTS Installer.
 *
 * Rejoue une exécution complète — la même fonction `installOrUpdate` que
 * sur l'iPhone — dans un système de fichiers temporaire pré-rempli avec les
 * vrais fichiers du dépôt, et compte ce qui coûte : requêtes réseau, octets
 * transférés, lectures locales, redessins de la table et temps passé en
 * attente.
 *
 *   node tools/preview/installer-bench.mjs [chemin-de-CTS-Installer.js]
 *
 * Le chemin permet de mesurer une version antérieure extraite de git et de
 * comparer, ce qui est la seule façon honnête d'annoncer un gain.
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

const SNAPSHOT = "a7b0d0da0dff222be4afcc9c006cd2e79417f98b"

/*
 * Trois scénarios :
 *   verification — tout est déjà en place, snapshot inchangé
 *   stale        — tout est en place mais GitHub a bougé
 *   fresh        — rien n'est installé
 */
const SCENARIO = process.env.BENCH_SCENARIO || "verification"

/*
 * Latence appliquée à chaque requête, en millisecondes. Sans elle le banc
 * ne peut pas montrer ce que le parallélisme apporte, puisque le faux
 * GitHub répond instantanément.
 */
const LATENCY = Number(process.env.BENCH_LATENCY) || 0
const manifest = JSON.parse(fs.readFileSync(path.join(repository, "version.json"), "utf8"))

const metrics = {
  requests: 0,
  bytes: 0,
  reads: 0,
  readBytes: 0,
  writes: 0,
  renders: 0,
  sleptMs: 0
}

/* Contenu servi par le faux GitHub : les vrais fichiers du dépôt. */
function repositoryFile(name) {
  const file = path.join(repository, name)
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null
}

/* Système de fichiers temporaire, pré-rempli comme une installation saine. */
const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cts-bench-"))
const docs = path.join(sandboxRoot, "Documents")
fs.mkdirSync(docs, { recursive: true })

/*
 * Les scripts vont à la racine des documents Scriptable, pour être
 * importables ; seules les ressources vivent sous « CTS Dashboard ».
 * Semer au mauvais endroit ferait mesurer une réinstallation complète
 * au lieu d'une vérification.
 */
function seedInstallation() {
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
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      repositoryRevision:
        SCENARIO === "stale"
          ? "0000000000000000000000000000000000000000"
          : SNAPSHOT,
      files: { installed: [], updated: [], repaired: [], unchanged: [], failed: [] }
    })
  )
  fs.writeFileSync(path.join(docs, "CTS Installer.js"), fs.readFileSync(installerPath))
}

if (SCENARIO === "fresh") {
  fs.writeFileSync(path.join(docs, "CTS Installer.js"), fs.readFileSync(installerPath))
} else {
  seedInstallation()
}

const fileManager = {
  documentsDirectory: () => docs,
  joinPath: (a, b) => path.join(a, b),
  fileExists: target => fs.existsSync(target),
  isFileDownloaded: () => true,
  readString: target => {
    const content = fs.readFileSync(target, "utf8")
    metrics.reads++
    metrics.readBytes += Buffer.byteLength(content)
    return content
  },
  writeString: (target, content) => {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
    metrics.writes++
  },
  createDirectory: (target) => fs.mkdirSync(target, { recursive: true }),
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

class BenchRequest {
  constructor(url) {
    this.url = String(url)
    this.headers = {}
    this.response = { statusCode: 200 }
  }
  async loadString() {
    metrics.requests++

    if (LATENCY > 0) {
      await new Promise(resolve => setTimeout(resolve, LATENCY))
    }

    if (this.url.includes("api.github.com")) {
      return JSON.stringify({ sha: SNAPSHOT })
    }

    const match = this.url.match(/\/([^/?]+)(?:\?|$)/)
    const name = match ? decodeURIComponent(match[1]) : ""
    const content = repositoryFile(name)

    if (content === null) {
      this.response = { statusCode: 404 }
      return "404: Not Found"
    }

    metrics.bytes += Buffer.byteLength(content)
    return content
  }
}

class BenchTable extends ui.UITable {
  reload() {
    metrics.renders++
  }
  present() {
    return Promise.resolve()
  }
}

class BenchAlert {
  constructor() {
    this.actions = []
  }
  addAction(t) {
    this.actions.push(t)
  }
  addCancelAction() {}
  addDestructiveAction() {}
  present() {
    return Promise.resolve(0)
  }
  presentSheet() {
    return Promise.resolve(0)
  }
}

const source = fs
  .readFileSync(installerPath, "utf8")
  .replace(/^await main\(\)$/m, "")
  .replace(/^Script\.complete\(\)$/m, "")
  /* Le sommeil réel fausserait la mesure ; on compte le temps demandé. */
  .replace(
    /function sleep\([\s\S]*?\n}/,
    "function sleep(ms) { __countSleep(ms); return Promise.resolve() }"
  )
  /*
   * `let` au sommet d'un script n'est pas exposé sur l'objet global du
   * contexte : le banc ne pourrait pas fixer la révision résolue, et le
   * contrôle du snapshot échouerait. `var` l'expose, sans rien changer à
   * la sémantique du fichier.
   */
  .replace(
    "let repositoryRevision = REPO.branch",
    "var repositoryRevision = REPO.branch"
  )

const sandbox = {
  console,
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
  Color: ui.Color,
  Font: ui.Font,
  SFSymbol: ui.SFSymbol,
  UITable: BenchTable,
  UITableRow: ui.UITableRow,
  Alert: BenchAlert,
  Request: BenchRequest,
  Script: { name: () => "CTS Installer", complete: () => {} },
  Device: { systemVersion: () => "26.6" },
  Pasteboard: { copyString: () => {} },
  FileManager: { iCloud: () => fileManager, local: () => fileManager },
  importModule: () => {
    throw new Error("module absent")
  },
  __countSleep: ms => {
    metrics.sleptMs += Number(ms) || 0
  }
}

vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: installerPath })

const startedAt = Date.now()

const run = async () => {
  sandbox.repositoryRevision = await sandbox.resolveRepositoryRevision()
  const loaded = await sandbox.loadManifest()
  const state = await sandbox.inspect(loaded)
  await sandbox.installOrUpdate(loaded, state)
}

run()
  .then(() => {
    console.log(`Scénario ${SCENARIO} · ${path.basename(installerPath)}`)
    console.log(`  requêtes réseau        ${metrics.requests}`)
    console.log(`  octets téléchargés     ${(metrics.bytes / 1048576).toFixed(2)} Mo`)
    console.log(`  lectures locales       ${metrics.reads}`)
    console.log(`  octets lus localement  ${(metrics.readBytes / 1048576).toFixed(2)} Mo`)
    console.log(`  écritures              ${metrics.writes}`)
    console.log(`  redessins de la table  ${metrics.renders}`)
    console.log(`  attente cumulée        ${(metrics.sleptMs / 1000).toFixed(2)} s`)
    console.log(`  durée totale           ${((Date.now() - startedAt) / 1000).toFixed(2)} s`)
  })
  .catch(error => {
    console.error("Échec du banc :", error.message)
    process.exitCode = 1
  })
  .finally(() => fs.rmSync(sandboxRoot, { recursive: true, force: true }))
