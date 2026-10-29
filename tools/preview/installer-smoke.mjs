import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import * as ui from "./uitable-shim.mjs"
import { moduleSpace, repository, runScript, scriptableGlobals, timerDouble } from "./sandbox.mjs"

const installerPath = process.argv[2] || path.join(repository, "CTS Installer.js")

const SNAPSHOT = "6a3937ee112251d6093f6678710b6d80187f1085"

// Hors d'atteinte : rattrapée par la version réelle, la mise à jour imposée cesserait d'être éprouvée.
const FUTURE = "1.9.9"
const manifest = JSON.parse(fs.readFileSync(path.join(repository, "version.json"), "utf8"))

// Date lointaine : les vrais modules reçoivent l'horloge réelle, et ce service doit rester à venir.
const INDEXED_SERVICE = { date: "2099-06-15", number: "EA06", end: "13:30" }

function repositoryFile(name) {
  const file = path.join(repository, name)
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null
}

async function runAction(
  label,
  choice,
  {
    seed = true,
    forbidden = null,
    throttle = 0,
    rateLimit = null,
    retriedAfter = 0,
    expected = null,
    absent = null,
    installedVersion = null,
    silent = false,
    preferences = false,
    residue = false,
    stale = null,
    corrupt = null,
    unreachable = null,
    truncated = null,
    log = null,
    installerAvailable = null,
    installerUpdated = false,
    installerOpened = false,
    installerMismatched = false,
    installerWriteBroken = false,
    relaunchUnavailable = false,
    reopens = false,
    closeDuringWrite = false,
    scriptName = "CTS Installer",
    runningWriteBroken = false,
    aborts = false,
    migration = false,
    dashboard = false
  } = {}
) {
  let remainingThrottled = throttle
  let networkAttempts = 0
  const apiCalls = []
  const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cts-smoke-"))
  const docs = path.join(sandboxRoot, "Documents")
  const library = path.join(sandboxRoot, "Library")
  const PINNED = new Set(["pdf.min.mjs", "pdf.worker.min.mjs"])
  const pinnedTarget = item => path.join(library, "CTS Dashboard", item.destination)
  const legacyLibraries = path.join(docs, "CTS Dashboard", "Libraries")
  fs.mkdirSync(docs, { recursive: true })
  fs.writeFileSync(path.join(docs, "CTS Installer.js"), fs.readFileSync(installerPath))

  const runningInstaller = path.join(docs, `${scriptName}.js`)

  if (runningInstaller !== path.join(docs, "CTS Installer.js")) {
    fs.writeFileSync(runningInstaller, fs.readFileSync(installerPath))
  }

  if (seed) {
    const root = path.join(docs, "CTS Dashboard")
    for (const name of manifest.scripts) {
      if (name === "CTS Installer.js") continue
      fs.writeFileSync(path.join(docs, name), repositoryFile(name))
    }
    for (const item of manifest.resources) {
      const target = PINNED.has(item.name) && !migration
        ? pinnedTarget(item)
        : path.join(root, item.destination)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, repositoryFile(item.name))
    }
    fs.mkdirSync(path.join(root, "Data"), { recursive: true })
    fs.writeFileSync(
      path.join(root, "Data", "installation.json"),
      JSON.stringify({
        dashboardVersion: installedVersion || manifest.version,
        installerVersion: manifest.installerVersion,
        repositoryRevision: SNAPSHOT,
        files: { installed: [], updated: [], repaired: [], unchanged: [], failed: [] }
      })
    )
    fs.writeFileSync(
      path.join(root, "Data", "last-run.json"),
      JSON.stringify({
        at: "2026-08-18T15:12:00.000Z",
        version: manifest.version,
        surface: "widget",
        family: "large",
        elapsedMs: 1840,
        displayed: "Analyse en cours",
        source: "none",
        scan: "locked",
        detected: 0
      })
    )

    if (dashboard) {
      const stem = `Service_${INDEXED_SERVICE.date}_${INDEXED_SERVICE.number}`
      const cache = path.join(root, "Cache", "Services")

      fs.mkdirSync(path.join(root, "Services"), { recursive: true })
      fs.mkdirSync(path.join(cache, "Text"), { recursive: true })
      fs.writeFileSync(path.join(root, "Services", `${stem}.pdf`), "%PDF-1.7")
      fs.writeFileSync(
        path.join(cache, `${stem}.json`),
        JSON.stringify({
          date: INDEXED_SERVICE.date,
          service: INDEXED_SERVICE.number,
          validation: { valid: true, warnings: [] },
          slices: [{ dutyStart: "05:30", end: INDEXED_SERVICE.end }]
        })
      )
      fs.writeFileSync(path.join(cache, "Text", `${stem}.txt`), "texte extrait")
      fs.writeFileSync(
        path.join(root, "Data", "services-index.json"),
        JSON.stringify({
          version: 2,
          updatedAt: "",
          services: [
            {
              id: `${INDEXED_SERVICE.date}_${INDEXED_SERVICE.number}`,
              date: INDEXED_SERVICE.date,
              service: INDEXED_SERVICE.number,
              pdfFile: `${stem}.pdf`,
              cacheFile: `${stem}.json`,
              textFile: `${stem}.txt`,
              lastEnd: INDEXED_SERVICE.end,
              firstDutyStart: "05:30",
              indexedAt: "2099-06-14T18:00:00.000Z"
            }
          ]
        })
      )
    }
  }

  const legitimate = repositoryFile("CTS Utils.js")

  if (stale) {
    fs.writeFileSync(
      path.join(docs, stale),
      `${repositoryFile(stale)}\n// version en retard\n`
    )
  }

  if (truncated) {
    const resource = manifest.resources.find(item => item.name === truncated)
    const target = pinnedTarget(resource)

    fs.writeFileSync(target, fs.readFileSync(target, "utf8").slice(0, 40 * 1024))
  }

  if (residue) {
    fs.writeFileSync(path.join(docs, "CTS Utils.js.download"), "moitié téléchargé")
    fs.writeFileSync(path.join(docs, "CTS Parser.js.rollback"), "ancienne version")
    fs.writeFileSync(path.join(docs, "CTS Simulator.js.rollback"), legitimate)
    fs.writeFileSync(path.join(docs, "CTS Cassé.js.rollback"), "x")
    fs.writeFileSync(path.join(docs, "Mes Notes.js.rollback"), "à moi")
  }

  const logEntries = log
    ? [
        {
          timestamp: "2026-09-15T19:00:45.746Z",
          type: "exception",
          message: "Erreur pendant l’importation locale d’un PDF",
          details: log
        }
      ]
    : null

  const failures = []
  const shown = []
  const relaunched = []

  const RUNTIME_ERROR = /before initialization|is not defined|is not a function|undefined is not|Cannot read|null is not/i
  const ABORTED = /Opération impossible|Opération interrompue|Installation non validée|Mise à jour impossible/i

  const selectable = []

  const tables = []

  const alerted = []
  const preferencesStore = preferences ? { value: { textScale: 1 } } : null
  const selections = Array.isArray(choice) ? [...choice] : [choice]

  class RecordingTable extends ui.UITable {
    constructor() {
      super()
      this.recorded = []
      tables.push(this)
    }
    addRow(row) {
      for (const cell of row.cells || []) {
        if (cell.title) {
          shown.push(String(cell.title))
          this.recorded.push(String(cell.title))
        }
        if (cell.subtitle) {
          shown.push(String(cell.subtitle))
          this.recorded.push(String(cell.subtitle))
        }
      }
      if (typeof row.onSelect === "function") selectable.push(row)
      super.addRow(row)
    }

    async present() {
      if (selections.length) {
        const actions = this.rows.filter(row => typeof row.onSelect === "function")
        const target = actions[selections[0]]

        if (target) {
          selections.shift()

          const running = target.onSelect()
          const keepsOpen = target.dismissOnSelect === false

          if (keepsOpen && !closeDuringWrite) await running
        }
      }

      return Promise.resolve()
    }
  }

  const fileManager = {
    documentsDirectory: () => docs,
    libraryDirectory: () => library,
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

      if (runningWriteBroken && to === runningInstaller) {
        fs.writeFileSync(
          to,
          fs.readFileSync(from, "utf8").replace(/const INSTALLER_VERSION = "[^"]+"\n/, "")
        )
        fs.rmSync(from, { force: true })
        return
      }

      if (installerWriteBroken && to.endsWith("CTS Installer.js")) {
        fs.writeFileSync(
          to,
          fs.readFileSync(from, "utf8").replace(/const INSTALLER_VERSION = "[^"]+"\n/, "")
        )
        fs.rmSync(from, { force: true })
        return
      }

      fs.renameSync(from, to)
    },
    copy: (from, to) => fs.copyFileSync(from, to),
    downloadFileFromiCloud: async () => {},
    fileSize: target => Math.round(fs.statSync(target).size / 1024),
    modificationDate: target => fs.statSync(target).mtime,
    listContents: target => (fs.existsSync(target) ? fs.readdirSync(target) : [])
  }

  const globals = {
    console: {
      log: () => {},
      warn: () => {},
      error: message => failures.push(String(message))
    },
    setTimeout,
    Timer: timerDouble({ delay: milliseconds => milliseconds }),
    Color: ui.Color,
    Font: ui.Font,
    SFSymbol: ui.SFSymbol,
    UITable: RecordingTable,
    UITableRow: ui.UITableRow,
    Script: { name: () => scriptName, complete: () => {} },
    Device: { systemVersion: () => "26.6" },
    Pasteboard: { copyString: value => shown.push(String(value)) },
    config: { runsInWidget: false },
    URLScheme: {
      forRunningScript: () =>
        relaunchUnavailable ? "about:blank" : "scriptable:///run/CTS%20Installer"
    },
    Safari: { open: url => relaunched.push(String(url)) },
    FileManager: { iCloud: () => fileManager, local: () => fileManager },
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
        alerted.push(String(value))
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
        networkAttempts++

        if (this.url.includes("api.github.com")) {
          apiCalls.push(Date.now())
        }

        if (remainingThrottled > 0) {
          remainingThrottled--
          this.response = rateLimit || { statusCode: 429 }
          return rateLimit
            ? JSON.stringify({ message: "API rate limit exceeded" })
            : "429: Too Many Requests"
        }

        if (this.url.includes("api.github.com")) {
          return JSON.stringify({ sha: SNAPSHOT })
        }
        const match = this.url.match(/\/([^/?]+)(?:\?|$)/)
        const name = match ? decodeURIComponent(match[1]) : ""
        if (corrupt && name === corrupt) {
          return "<!doctype html><html><body>GitHub is having a bad day</body></html>"
        }

        if (unreachable && name === unreachable) {
          this.response = { statusCode: 500 }
          return "500: Internal Server Error"
        }

        if (installerAvailable && name === "version.json") {
          return JSON.stringify({ ...manifest, installerVersion: installerAvailable })
        }

        if (installerAvailable && name === "CTS Installer.js") {
          const source = fs.readFileSync(installerPath, "utf8")

          if (installerMismatched) return source

          return source.replace(
            /const INSTALLER_VERSION = "[^"]+"/,
            `const INSTALLER_VERSION = "${installerAvailable}"`
          )
        }

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

  const dashboardModules = dashboard ? moduleSpace(globals) : null

  const sandbox = scriptableGlobals({
    ...globals,
    importModule: name => {
      if (dashboardModules) return dashboardModules.load(name)

      if (name === "CTS Storage" && (preferencesStore || logEntries)) {
        const storage = {}

        if (preferencesStore) {
          storage.loadPreferences = async () => ({ ...preferencesStore.value })
          storage.savePreferences = async value => {
            preferencesStore.value = { textScale: Number(value?.textScale) || 1 }
          }
        }

        if (logEntries) {
          storage.loadLog = async () => logEntries
        }

        return storage
      }

      throw new Error("module absent")
    }
  })

  try {
    // `await main()` compris : une constante déclarée sous cet appel n'existe pas encore pendant main().
    await runScript("CTS Installer", sandbox, { source: fs.readFileSync(installerPath, "utf8") })
  } catch (error) {
    failures.push(`exception non rattrapée : ${error.message}`)
  }

  let aborted = false

  for (const text of shown) {
    if (RUNTIME_ERROR.test(text)) failures.push(`erreur d'exécution affichée : ${text}`)
    else if (ABORTED.test(text)) {
      aborted = true
      if (!aborts) failures.push(`opération avortée : ${text}`)
    } else if (forbidden && forbidden.test(text)) {
      failures.push(`verdict injustifié sur une installation saine : ${text}`)
    }
  }

  if (aborts && !aborted) {
    failures.push("l’opération aurait dû être refusée, elle est allée au bout")
  }

  if (expected) {
    for (const row of selectable) {
      const label = (row.cells || []).map(cell => cell.title || "").join(" ")
      if (!/Copier le rapport/i.test(label)) continue
      try {
        await row.onSelect()
      } catch (error) {
        failures.push(`rapport technique en erreur : ${error.message}`)
      }
    }
  }

  if (
    (tables.length || !(aborts && throttle)) &&
    !shown.some(text => /Créé et développé par Emilio IPPOLITO/.test(text))
  ) {
    failures.push("aucun crédit d'auteur affiché sur cet écran de gestion")
  }

  for (const table of tables) {
    const text = table.recorded.join(" ")

    if (!/Données protégées/.test(text)) continue

    if (!/Créé et développé par Emilio IPPOLITO/.test(text)) {
      failures.push("une page de gestion ne porte pas le crédit d'auteur")
    }
  }

  if (preferencesStore && Math.abs(preferencesStore.value.textScale - 1.25) > 0.01) {
    failures.push(
      `réglage non enregistré : textScale ${preferencesStore.value.textScale} au lieu de 1,25`
    )
  }

  if (silent && alerted.length) {
    failures.push(`alerte superflue après l’opération : ${alerted.join(" · ")}`)
  }

  for (const pattern of expected ? [].concat(expected) : []) {
    if (!shown.some(text => pattern.test(text))) {
      failures.push(`section attendue absente du rapport : ${pattern}`)
    }
  }

  if (absent && shown.some(text => absent.test(text))) {
    failures.push(`écran qui n’aurait pas dû être atteint : ${absent}`)
  }

  if (throttle && !aborts && networkAttempts <= throttle) {
    failures.push(
      `aucune reprise après ${throttle} refus de GitHub : ${networkAttempts} tentative(s)`
    )
  }

  if (throttle && aborts && networkAttempts !== throttle) {
    failures.push(`${networkAttempts} appel(s) pour ${throttle} refus de GitHub servi(s)`)
  }

  if (retriedAfter && !(apiCalls.length > 1 && apiCalls[1] - apiCalls[0] >= retriedAfter - 50)) {
    failures.push(
      `pause demandée par GitHub non respectée : ${apiCalls.length} appel(s), ` +
        `${apiCalls.length > 1 ? apiCalls[1] - apiCalls[0] : 0} ms d'écart au lieu de ${retriedAfter}`
    )
  }

  if (residue) {
    const here = name => fs.existsSync(path.join(docs, name))

    if (here("CTS Utils.js.download")) {
      failures.push("un téléchargement inachevé survit au balayage")
    }

    if (here("CTS Parser.js.rollback")) {
      failures.push("une copie de secours survit alors que son script est en place")
    }

    if (!here("CTS Utils.js") || !here("CTS Parser.js")) {
      failures.push("le balayage a emporté un script réel")
    }

    if (here("CTS Simulator.js.rollback") || !here("CTS Simulator.js")) {
      failures.push("un script absent n’a pas été remis en place depuis sa copie de secours")
    } else if (fs.readFileSync(path.join(docs, "CTS Simulator.js"), "utf8") !== legitimate) {
      failures.push("le script remis en place ne porte pas le contenu de la copie de secours")
    }

    if (!here("CTS Cassé.js.rollback") || here("CTS Cassé.js")) {
      failures.push("une copie de secours illisible a été remise en place ou supprimée")
    }

    if (!here("Mes Notes.js.rollback")) {
      failures.push("le balayage a touché un fichier qui n’appartient pas au projet")
    }
  }

  if (corrupt) {
    const target = path.join(docs, corrupt)
    const onDisk = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null

    if (onDisk !== repositoryFile(corrupt)) {
      failures.push(`une page d’erreur GitHub a remplacé ${corrupt}`)
    }

    if (!shown.some(text => /1 erreur/i.test(text))) {
      failures.push("le fichier refusé n’a pas été signalé comme une erreur")
    }
  }

  const expectedRelaunches = (reopens || installerOpened) && !relaunchUnavailable ? 1 : 0

  if (relaunched.length !== expectedRelaunches) {
    failures.push(
      `${expectedRelaunches} relance(s) attendue(s), ${relaunched.length} observée(s)`
    )
  }

  if (reopens && !shown.some(text => /s’ouvrira à nouveau sur l’état mis à jour/.test(text))) {
    failures.push("la réouverture après mise à jour n’a pas été annoncée avant d’être faite")
  }

  if (!reopens && shown.some(text => /s’ouvrira à nouveau sur l’état mis à jour/.test(text))) {
    failures.push("une réouverture a été annoncée alors qu’elle n’aura pas lieu")
  }

  if (
    reopens &&
    relaunchUnavailable &&
    !shown.some(text => /Relancez CTS Installer depuis la liste des scripts/.test(text))
  ) {
    failures.push("relance impossible après mise à jour sans que l’utilisateur soit prévenu")
  }

  if (installerAvailable) {
    if (installerUpdated && !shown.some(text => /Fermez cet écran pour continuer/.test(text))) {
      failures.push("la réouverture n’a pas été annoncée avant d’être faite")
    }

    if (installerUpdated) {
      if (tables.length !== 1) {
        failures.push(
          `${tables.length} écrans pour une mise à jour de l’installateur, un seul attendu`
        )
      }

      const first = tables[0]?.recorded || []

      if (!first.some(text => /Mise à jour requise/.test(text))) {
        failures.push("l’écran de mise à jour n’a jamais posé sa question")
      }

      if (!first.some(text => /Mise à jour installée/.test(text))) {
        failures.push("le résultat s’affiche ailleurs que sur l’écran déjà ouvert")
      }
    }

    if (closeDuringWrite) {
      const onDisk = fs.readFileSync(path.join(docs, "CTS Installer.js"), "utf8")

      if (!onDisk.includes(`const INSTALLER_VERSION = "${installerAvailable}"`)) {
        failures.push("l’écriture a été coupée par la fermeture de l’écran")
      }

      if (!alerted.some(text => /Mise à jour installée/.test(text))) {
        failures.push("le remplacement fait sans témoin n’a pas été signalé")
      }
    }

    if (
      relaunchUnavailable &&
      installerUpdated &&
      !shown.some(text => /Relancez-le depuis la liste des scripts/.test(text))
    ) {
      failures.push("relance impossible sans que l’utilisateur soit prévenu")
    }

    if (shown.some(text => /Continuer avec/.test(text))) {
      failures.push("le contournement « Continuer avec » est encore proposé")
    }

    const onDisk = fs.readFileSync(path.join(docs, "CTS Installer.js"), "utf8")
    const replaced = onDisk.includes(`const INSTALLER_VERSION = "${installerAvailable}"`)

    if (installerUpdated && runningInstaller !== path.join(docs, "CTS Installer.js")) {
      const running = fs.readFileSync(runningInstaller, "utf8")

      if (!running.includes(`const INSTALLER_VERSION = "${installerAvailable}"`)) {
        failures.push("le fichier réellement exécuté est resté en arrière")
      }
    }

    if (installerUpdated && !replaced) {
      failures.push("l’installateur n’a pas été remplacé alors que la mise à jour a été acceptée")
    }

    if (!installerUpdated && !aborts && replaced) {
      failures.push("l’installateur a été remplacé sans que la mise à jour ait été demandée")
    }
  }

  if (migration) {
    for (const item of manifest.resources.filter(entry => PINNED.has(entry.name))) {
      if (!fs.existsSync(pinnedTarget(item))) {
        failures.push(`${item.name} n'a pas été posé sur l'appareil`)
      }
    }

    if (fs.existsSync(legacyLibraries)) {
      failures.push("les anciennes bibliothèques restent dans iCloud après la migration")
    }
  }

  fs.rmSync(sandboxRoot, { recursive: true, force: true })
  return [...new Set(failures)]
}

// GitHub rend son compte quarante secondes avant une minute ronde : l'alerte doit annoncer cette minute-là.
const RATE_LIMIT_RESUME = new Date(Math.ceil(Date.now() / 60000 + 25) * 60000)
const RATE_LIMIT_RESET_SECONDS = RATE_LIMIT_RESUME.getTime() / 1000 - 40
const RATE_LIMIT_CLOCK =
  `${RATE_LIMIT_RESUME.getHours()} h ${String(RATE_LIMIT_RESUME.getMinutes()).padStart(2, "0")}`

// choice désigne les lignes du menu par leur rang : un ajout au menu décale les suivantes.
const scenarios = [
  { label: "vérification", choice: 0, silent: true },
  {
    label: "restes d’écriture à la racine",
    choice: 0,
    silent: true,
    residue: true,
    reopens: true
  },
  {
    label: "diagnostic",
    choice: 1,
    forbidden: /illisible|invalide|inaccessible|non résolu/i,
    expected: [/DERNIÈRE EXÉCUTION DU DASHBOARD/, /17\/17 scripts conformes au dépôt/]
  },
  {
    label: "script en retard nommé par le diagnostic",
    choice: 1,
    stale: "CTS Parser.js",
    expected: [
      /1 script ne correspond pas au dépôt/,
      /CTS Parser\.js — diffère de la version publiée/
    ]
  },
  {
    label: "dépôt injoignable : conformité inconnue, pas divergente",
    choice: 1,
    unreachable: "CTS Parser.js",
    expected: [/conformité non vérifiée sur 1 script/, /CTS Parser\.js — non vérifié/],
    absent: /ne correspond pas au dépôt/
  },
  {
    label: "bibliothèque PDF.js tronquée refusée par le diagnostic",
    choice: 1,
    truncated: "pdf.min.mjs",
    expected: [/4\/5 ressources valides/, /pdf\.min\.mjs/]
  },
  {
    label: "durée absente dite absente",
    choice: 1,
    log: {
      error: "Le moteur PDF ne s’est pas initialisé.",
      details: { name: "Error", message: "Le moteur PDF ne s’est pas initialisé.", stack: "" }
    },
    expected: [/Inspection PDF : non terminée/, /Total : non terminée/]
  },
  {
    label: "durée mesurée et durée absente distinguées",
    choice: 1,
    log: {
      telemetryCode: "PDF_EXTRACTION_FAILED",
      telemetryStage: "extraction",
      error: "L’extraction du texte du PDF a échoué.",
      details: {
        name: "TypeError",
        message: "L’extraction du texte du PDF a échoué.",
        stack: "extract@blob"
      },
      timings: {
        sourceInspectionMs: 12,
        pdfExtractionMs: 2100,
        databaseReloadMs: null,
        parserMs: null,
        registrationMs: null,
        totalMs: 2140
      }
    },
    expected: [
      /Inspection PDF : 12 ms/,
      /Extraction PDF : 2100 ms/,
      /Base CTS : non terminée/,
      /Total : 2140 ms/
    ]
  },
  { label: "taille du texte", choice: [2, 1], preferences: true, silent: true, expected: /Grandes polices/ },
  {
    label: "retrait d’un service sans le Dashboard installé",
    choice: 3,
    expected: /CTS Services Cleaner est absent/
  },
  {
    label: "index des services lu par le diagnostic",
    choice: 1,
    dashboard: true,
    expected: /\[OK\] Index des services — 1 service indexé/
  },
  {
    label: "retrait d’un service par les vrais modules",
    choice: [3, 0],
    dashboard: true,
    expected: [/Service retiré/, /3 fichiers supprimés/]
  },
  { label: "désinstallation", choice: 4, expected: /Désinstallation (terminée|partielle)/ },
  { label: "installation neuve", choice: 0, seed: false, silent: true, reopens: true },
  {
    label: "bibliothèques PDF.js déplacées d'iCloud vers l'appareil",
    choice: 0,
    silent: true,
    reopens: true,
    migration: true
  },
  { label: "aucune réouverture sans écriture", choice: 0, silent: true, reopens: false },
  {
    label: "aucune réouverture si un fichier a échoué",
    choice: 0,
    stale: "CTS Parser.js",
    corrupt: "CTS Utils.js",
    reopens: false,
    expected: /1 erreur/
  },
  {
    label: "réouverture impossible : la consigne prend le relais",
    choice: 0,
    seed: false,
    reopens: true,
    relaunchUnavailable: true
  },
  {
    label: "l’ancienne exécution s’arrête après la réouverture",
    choice: [0, 4],
    seed: false,
    silent: true,
    reopens: true,
    absent: /Désinstallation/
  },
  {
    label: "page d’erreur GitHub refusée avant écriture",
    choice: 0,
    corrupt: "CTS Utils.js",
    expected: /Vérification terminée/
  },
  { label: "reprise après un refus temporaire de GitHub", choice: 0, throttle: 1 },
  {
    label: "limite horaire de GitHub dite comme telle",
    choice: 0,
    throttle: 1,
    rateLimit: {
      statusCode: 403,
      headers: {
        // Majuscules voulues : la lecture des en-têtes ne doit pas dépendre de leur casse.
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(RATE_LIMIT_RESET_SECONDS)
      }
    },
    aborts: true,
    expected: [
      /GitHub limite le nombre de vérifications par heure/,
      new RegExp(`Relancez CTS Installer après ${RATE_LIMIT_CLOCK},`)
    ],
    absent: /Vérifiez votre connexion Internet/
  },
  {
    label: "courte pause demandée par GitHub respectée",
    choice: 0,
    throttle: 1,
    rateLimit: { statusCode: 429, headers: { "Retry-After": "2" } },
    retriedAfter: 2000
  },
  {
    label: "pauses répétées de GitHub dites comme telles",
    choice: 0,
    throttle: 4,
    rateLimit: { statusCode: 403, headers: { "Retry-After": "1" } },
    aborts: true,
    expected: /GitHub a temporairement mis votre connexion de côté/,
    absent: /Vérifiez votre connexion Internet/
  },
  {
    label: "longue pause demandée par GitHub dite comme telle",
    choice: 0,
    throttle: 1,
    rateLimit: {
      statusCode: 403,
      headers: { "Retry-After": "600", "X-RateLimit-Remaining": "12" }
    },
    aborts: true,
    expected: [
      /GitHub demande une pause avant la prochaine vérification/,
      /Relancez CTS Installer après \d{1,2} h \d{2},/
    ],
    absent: /par heure|Vérifiez votre connexion Internet/
  },
  {
    label: "mise à jour imposée sur une version en retard",
    choice: 1,
    installedVersion: "1.0.4",
    expected: [/Version trop ancienne/, /DERNIÈRE EXÉCUTION DU DASHBOARD/],
    absent: /Désinstaller/
  },
  {
    label: "mise à jour de l’installateur acceptée",
    choice: 0,
    installerAvailable: FUTURE,
    installerUpdated: true,
    installerOpened: true,
    expected: [/Mise à jour requise/, /Installer 1\.9\.9/],
    absent: /Désinstaller|Continuer avec/
  },
  {
    label: "aucune relance si le remplacement échoue",
    choice: 0,
    installerAvailable: FUTURE,
    installerMismatched: true,
    aborts: true,
    absent: /Désinstaller|Continuer avec/
  },
  {
    label: "aucune relance si le fichier posé est incomplet",
    choice: 0,
    installerAvailable: FUTURE,
    installerWriteBroken: true,
    aborts: true,
    absent: /Désinstaller|Continuer avec/
  },
  {
    label: "relance impossible : la consigne prend le relais",
    choice: 0,
    installerAvailable: FUTURE,
    installerUpdated: true,
    installerOpened: true,
    relaunchUnavailable: true,
    absent: /Désinstaller|Continuer avec/
  },
  {
    label: "écran refermé pendant l’écriture",
    choice: 0,
    installerAvailable: FUTURE,
    installerUpdated: true,
    closeDuringWrite: true,
    absent: /Désinstaller|Continuer avec/
  },
  {
    label: "script renommé : le fichier exécuté est remplacé aussi",
    choice: 0,
    scriptName: "CTS Installeur",
    installerAvailable: FUTURE,
    installerUpdated: true,
    installerOpened: true,
    absent: /Désinstaller|Continuer avec/
  },
  {
    label: "script renommé : le fichier exécuté posé incomplet arrête tout",
    choice: 0,
    scriptName: "CTS Installeur",
    installerAvailable: FUTURE,
    runningWriteBroken: true,
    aborts: true,
    absent: /Désinstaller|Continuer avec/
  },
  {
    label: "aucun contournement en fermant l’écran",
    choice: 9,
    installerAvailable: FUTURE,
    absent: /Désinstaller|Continuer avec/
  },
  {
    label: "diagnostic joignable sans mettre à jour",
    choice: [1, 9, 9],
    installerAvailable: FUTURE,
    expected: [/Mise à jour requise/, /DERNIÈRE EXÉCUTION DU DASHBOARD/],
    absent: /Désinstaller|Continuer avec/
  },
  {
    label: "retour au menu après une action",
    choice: [1, 3],
    expected: [/DERNIÈRE EXÉCUTION DU DASHBOARD/, /CTS Services Cleaner est absent/]
  },
  {
    label: "fermer le menu arrête l’installateur",
    choice: 9,
    absent: /DERNIÈRE EXÉCUTION DU DASHBOARD|Désinstallation/
  },
  {
    label: "menu accessible sur une installation à jour",
    choice: 1,
    expected: /DERNIÈRE EXÉCUTION DU DASHBOARD/,
    absent: /Version trop ancienne/
  }
]

let broken = false

for (const scenario of scenarios) {
  const failures = await runAction(scenario.label, scenario.choice, {
    seed: scenario.seed !== false,
    forbidden: scenario.forbidden || null,
    throttle: scenario.throttle || 0,
    rateLimit: scenario.rateLimit || null,
    retriedAfter: scenario.retriedAfter || 0,
    expected: scenario.expected || null,
    absent: scenario.absent || null,
    installedVersion: scenario.installedVersion || null,
    silent: scenario.silent === true,
    preferences: scenario.preferences === true,
    residue: scenario.residue === true,
    stale: scenario.stale || null,
    corrupt: scenario.corrupt || null,
    unreachable: scenario.unreachable || null,
    truncated: scenario.truncated || null,
    log: scenario.log || null,
    installerAvailable: scenario.installerAvailable || null,
    installerUpdated: scenario.installerUpdated === true,
    installerOpened: scenario.installerOpened === true,
    installerMismatched: scenario.installerMismatched === true,
    installerWriteBroken: scenario.installerWriteBroken === true,
    relaunchUnavailable: scenario.relaunchUnavailable === true,
    reopens: scenario.reopens === true,
    closeDuringWrite: scenario.closeDuringWrite === true,
    scriptName: scenario.scriptName || "CTS Installer",
    runningWriteBroken: scenario.runningWriteBroken === true,
    aborts: scenario.aborts === true,
    migration: scenario.migration === true,
    dashboard: scenario.dashboard === true
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
