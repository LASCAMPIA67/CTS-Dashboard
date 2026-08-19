/*
 * Prévisualisation des pages de CTS Installer.
 *
 * Le fichier s'exécute normalement de haut en bas et lance `main()`, qui
 * exige le réseau et iCloud. On charge donc la source privée de ses deux
 * dernières lignes — l'appel à `main()` et `Script.complete()` — ce qui
 * laisse toutes les fonctions accessibles sans rien exécuter. Aucune autre
 * transformation : ce sont bien les vraies fonctions de rendu qui sont
 * appelées ensuite.
 */

import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import * as ui from "./uitable-shim.mjs"
import { renderTable, renderSheet, USABLE_HEIGHT } from "./installer-html.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(here, "..", "..")
const output = process.argv[2] || path.join(here, "out-installer")
fs.mkdirSync(output, { recursive: true })

const CHROMIUM = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium/chrome-linux/chrome",
  "/usr/bin/chromium"
].find(candidate => fs.existsSync(candidate))

const tables = []

function loadInstaller() {
  const source = fs
    .readFileSync(path.join(repository, "CTS Installer.js"), "utf8")
    .replace(/^await main\(\)$/m, "/* main() neutralisé pour la prévisualisation */")
    .replace(/^Script\.complete\(\)$/m, "")

  class RecordingTable extends ui.UITable {
    constructor() {
      super()
      tables.push(this)
    }
  }

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
    Color: ui.Color,
    Font: ui.Font,
    SFSymbol: ui.SFSymbol,
    UITable: RecordingTable,
    UITableRow: ui.UITableRow,
    Script: { name: () => "CTS Installer", complete: () => {} },
    Device: { systemVersion: () => "26.6" },
    Pasteboard: { copyString: () => {} },
    Alert: class {
      constructor() {
        this.actions = []
      }
      addAction(t) {
        this.actions.push(t)
      }
      addCancelAction() {}
      addDestructiveAction() {}
      present() {
        return Promise.resolve(-1)
      }
      presentSheet() {
        return Promise.resolve(-1)
      }
    },
    Request: class {
      loadString() {
        return Promise.resolve("")
      }
    },
    FileManager: {
      iCloud: () => ({
        documentsDirectory: () => "/Documents",
        joinPath: (a, b) => `${a}/${b}`,
        fileExists: () => false,
        isFileDownloaded: () => true,
        readString: () => "",
        createDirectory: () => {},
        downloadFileFromiCloud: async () => {},
        fileSize: () => 1,
        modificationDate: () => new Date()
      })
    },
    importModule: () => ({})
  }

  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: "CTS Installer.js" })
  return sandbox
}

const installer = loadInstaller()

/* ------------------------------------------------------------------ */
/* Jeux d'état réalistes.                                              */
/* ------------------------------------------------------------------ */

const MANIFEST = JSON.parse(fs.readFileSync(path.join(repository, "version.json"), "utf8"))

function buildEntries() {
  return [
    ...MANIFEST.scripts.map(name => ({ name, type: "Script", destination: name })),
    ...MANIFEST.resources.map(item => ({
      name: item.name,
      type: "Ressource",
      destination: item.destination
    }))
  ]
}

function systemState(statuses) {
  const labels = {
    installer: "Installer",
    github: "GitHub",
    directories: "Dossiers",
    retry: "Reprises",
    verification: "Final"
  }
  const systems = {}
  for (const [key, short] of Object.entries(labels)) {
    systems[key] = {
      short,
      status: statuses[key]?.status || "pending",
      detail: statuses[key]?.detail || "En attente"
    }
  }
  return systems
}

function progressState() {
  const entries = buildEntries().map((entry, index) => ({
    ...entry,
    status: index < 10 ? "unchanged" : "pending",
    detail: index < 10 ? "Déjà à jour" : `${entry.type} — En attente`
  }))

  return {
    completed: 10,
    total: entries.length,
    current: "CTS Services Cleaner.js · Déjà à jour",
    title: "Vérifier CTS Dashboard",
    version: MANIFEST.version,
    operation: "verification",
    systems: systemState({
      installer: { status: "success", detail: "Installateur protégé" },
      github: { status: "success", detail: "Snapshot a7b0d0d validé" },
      directories: { status: "success", detail: "Arborescence prête" }
    }),
    entries,
    result: null
  }
}

function finalState() {
  const entries = buildEntries().map((entry, index) => ({
    ...entry,
    status: index === 4 ? "updated" : "unchanged",
    detail: index === 4 ? "Mis à jour" : "Déjà à jour"
  }))

  return {
    completed: entries.length,
    total: entries.length,
    current: "Opération terminée",
    title: "Vérifier CTS Dashboard",
    version: MANIFEST.version,
    operation: "verification",
    systems: systemState({
      installer: { status: "success", detail: "Installateur protégé" },
      github: { status: "success", detail: "Snapshot a7b0d0d validé" },
      directories: { status: "success", detail: "Arborescence prête" },
      retry: { status: "success", detail: "Aucune nouvelle tentative nécessaire" },
      verification: { status: "success", detail: "22/22 fichiers valides" }
    }),
    entries,
    result: {
      success: true,
      title: "Vérification terminée",
      message: `CTS Dashboard ${MANIFEST.version} est prêt.`,
      summary: {
        installed: [],
        updated: ["stops.json"],
        repaired: [],
        unchanged: entries.filter(e => e.status === "unchanged").map(e => e.name),
        failed: []
      },
      duration: 6000,
      valid: 22,
      total: 22
    }
  }
}

function diagnosticState() {
  return {
    generatedAt: new Date().toISOString(),
    dashboardVersion: MANIFEST.version,
    installerVersion: MANIFEST.installerVersion,
    iosVersion: "26.6",
    snapshot: "a7b0d0d",
    checks: [
      { title: "Installation", status: "success", detail: "22/22 fichiers valides · Dashboard 1.0.12" },
      { title: "GitHub", status: "success", detail: "Snapshot a7b0d0d accessible" },
      { title: "Dossiers iCloud", status: "success", detail: "11/11 dossiers présents" },
      { title: "Écriture iCloud", status: "success", detail: "Lecture et écriture confirmées" },
      { title: "Ressources", status: "success", detail: "5/5 ressources valides" },
      { title: "Dossier Services", status: "success", detail: "1 PDF · 3 archivés · 0 rejeté" },
      { title: "Index des services", status: "warning", detail: "Index vide — aucun service importé" },
      { title: "Journal d’import", status: "success", detail: "Dernier import réussi il y a 2 h" },
      { title: "Analytics", status: "success", detail: "Jeton présent · dernier envoi ce jour" },
      { title: "Espace disque", status: "success", detail: "Aucune anomalie détectée" }
    ],
    lastImport: null,
    lastFailure: null
  }
}

/*
 * Les trois états d'accueil. Ce sont eux que le conducteur voit en
 * premier, et ils partagent le même squelette : identité, versions,
 * santé, actions, crédit. Les rendre côte à côte est la seule façon de
 * juger s'ils appartiennent au même produit.
 */
function menuStates() {
  const files = MANIFEST.scripts.length + MANIFEST.resources.length

  return [
    {
      label: "Mise à jour Installer",
      run: () => installer.handleInstallerUpdate({ ...MANIFEST, installerVersion: "1.0.16" })
    },
    {
      label: "Mise à jour Dashboard",
      run: () =>
        installer.menu(MANIFEST, {
          present: true,
          complete: true,
          existing: files,
          valid: files,
          total: files,
          installedVersion: "1.0.27",
          missing: [],
          invalid: [],
          reasons: {}
        })
    },
    {
      label: "Tout est à jour",
      run: () =>
        installer.menu(MANIFEST, {
          present: true,
          complete: true,
          existing: files,
          valid: files,
          total: files,
          installedVersion: MANIFEST.version,
          missing: [],
          invalid: [],
          reasons: {}
        })
    },
    {
      label: "Réparation nécessaire",
      run: () =>
        installer.menu(MANIFEST, {
          present: true,
          complete: false,
          existing: files - 3,
          valid: files - 4,
          total: files,
          installedVersion: MANIFEST.version,
          missing: ["CTS Parser.js", "stops.json"],
          invalid: ["CTS Widget Renderer.js", "CTS Services Manager.js"],
          reasons: {}
        })
    },
    {
      label: "Textes longs",
      run: () =>
        installer.menu(
          { ...MANIFEST, version: "10.12.144" },
          {
            present: true,
            complete: false,
            existing: files,
            valid: files - 9,
            total: files,
            installedVersion: "10.12.143",
            missing: [
              "CTS Widget Renderer.js",
              "CTS Services Manager.js",
              "CTS Import Pipeline.js",
              "CTS Analytics Client.js",
              "pdf.worker.min.mjs"
            ],
            invalid: ["CTS Parser.js", "CTS PDF Engine.js", "stops.json", "places.json"],
            reasons: {}
          }
        )
    },
    {
      label: "Installation neuve",
      run: () =>
        installer.menu(MANIFEST, {
          present: false,
          complete: false,
          existing: 0,
          valid: 0,
          total: files,
          installedVersion: null,
          missing: [],
          invalid: [],
          reasons: {}
        })
    }
  ]
}

/* ------------------------------------------------------------------ */

async function main() {
  const panels = []

  for (const scheme of ["dark", "light"]) {
    for (const state of menuStates()) {
      tables.length = 0
      await state.run()
      const table = tables[tables.length - 1]
      if (table) {
        table.showSeparators = true
        panels.push({ ...renderTable(table, { scheme, label: `${state.label} — ${scheme}` }) })
      }
    }
  }

  for (const scheme of ["dark", "light"]) {
    const progress = new installer.UITable()
    progress.showSeparators = true
    installer.renderProgressPage(progress, progressState(), false)
    panels.push({ ...renderTable(progress, { scheme, label: `Progression — ${scheme}` }) })

    const final = new installer.UITable()
    final.showSeparators = true
    installer.renderFinalPage(final, finalState(), false)
    panels.push({ ...renderTable(final, { scheme, label: `Résultat — ${scheme}` }) })

    tables.length = 0
    await installer.presentDiagnostic(diagnosticState())
    const diagnostic = tables[tables.length - 1]
    panels.push({ ...renderTable(diagnostic, { scheme, label: `Diagnostic — ${scheme}` }) })
  }

  if (process.env.INSTALLER_MODE === "measure") {
    let overflow = false
    for (const panel of panels) {
      const worst = Math.min(...Object.values(USABLE_HEIGHT))
      const fits = panel.height <= worst
      if (!fits) overflow = true
      console.log(
        `${fits ? "tient  " : "DÉBORDE"} ${panel.label.padEnd(26)} ${panel.height} pt ` +
          `(écran le plus petit : ${worst} pt)`
      )
    }
    process.exit(overflow ? 1 : 0)
  }

  const file = path.join(output, "installer.html")
  fs.writeFileSync(file, renderSheet(panels))

  if (!CHROMIUM) {
    console.log(`HTML écrit dans ${file}`)
    return
  }

  const perRow = Number(process.env.INSTALLER_COLUMNS) || 3
  const tallest = Math.max(...panels.map(p => p.height))
  execFileSync(
    CHROMIUM,
    [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--hide-scrollbars",
      "--force-device-scale-factor=2",
      "--virtual-time-budget=3000",
      `--window-size=${perRow * 410 + 40},${Math.ceil(panels.length / perRow) * (tallest + 80) + 40}`,
      `--screenshot=${path.join(output, "installer.png")}`,
      `file://${file}`
    ],
    { stdio: "pipe" }
  )

  console.log(`Capture : ${path.join(output, "installer.png")}  (${panels.length} pages)`)
}

main()
