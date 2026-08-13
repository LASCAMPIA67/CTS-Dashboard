/*
 * Test de fumée de CTS Analytics Admin.
 *
 * Le fichier est exécuté ENTIER, `await main()` compris, comme l'iPhone
 * l'exécute — c'est la seule façon de voir une constante restée dans sa
 * zone morte temporelle, qui a déjà atteint un utilisateur avec
 * CTS Installer 1.0.7.
 *
 * Cinq formes de réponse sont jouées, dont trois dégradées : le serveur
 * de statistiques n'est pas garanti, et une console d'administration qui
 * plante sur une réponse partielle ne sert à rien le jour où le Worker
 * change. Chaque écran est ensuite parcouru, ligne par ligne, en
 * déclenchant tous les onSelect.
 */

import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"
import * as ui from "./uitable-shim.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(here, "..", "..")
const adminPath = path.join(repository, "CTS Analytics Admin.js")

/* Réponse complète, telle que le Worker la construit. */
const FULL = {
  ok: true,
  generatedAt: new Date().toISOString(),
  summary: {
    total_installations: 14,
    active_today: 9,
    active_24h: 11,
    active_7d: 13,
    active_30d: 14,
    total_launches: 1284,
    new_installations_today: 1,
    new_installations_7d: 4,
    new_installations_30d: 14,
    latest_installation_at: new Date(Date.now() - 3600000).toISOString(),
    latest_activity_at: new Date(Date.now() - 600000).toISOString()
  },
  telemetrySummary: {
    total_runs: 4820,
    installations_with_runs: 13,
    runs_today: 96,
    runs_24h: 121,
    runs_7d: 812,
    runs_30d: 3104,
    successes_7d: 800,
    warnings_7d: 9,
    errors_7d: 3,
    affected_installations_7d: 2,
    success_rate_7d: 98.5,
    average_duration_ms_7d: 412.7,
    maximum_duration_ms_7d: 9120,
    latest_run_at: new Date(Date.now() - 300000).toISOString()
  },
  issueSummary: {
    total_issues: 96,
    issues_24h: 2,
    issues_7d: 12,
    issues_30d: 41,
    warnings_7d: 9,
    errors_7d: 3,
    fatal_7d: 0,
    affected_installations_7d: 3,
    installations_with_errors_7d: 2,
    latest_issue_at: new Date(Date.now() - 7200000).toISOString()
  },
  pipelineSummary: {
    pdf_found_7d: 690,
    pdf_missing_7d: 118,
    pdf_read_errors_7d: 4,
    parser_successes_7d: 686,
    parser_errors_7d: 4,
    service_found_7d: 700,
    service_not_found_7d: 108,
    service_errors_7d: 4,
    render_successes_7d: 809,
    render_errors_7d: 3,
    archive_successes_7d: 44,
    archive_errors_7d: 0
  },
  versions: [
    { version: "1.0.14", installations: 9 },
    { version: "1.0.13", installations: 4 },
    { version: "1.0.12", installations: 1 }
  ],
  iosVersions: [
    { version: 26, installations: 8 },
    { version: 27, installations: 6 }
  ],
  telemetryVersions: [
    {
      version: "1.0.14",
      runs: 500,
      installations: 9,
      successes: 497,
      warnings: 2,
      errors: 1,
      affected_installations: 1,
      average_duration_ms: 388.2,
      maximum_duration_ms: 4100,
      success_rate: 99.4
    },
    {
      version: "1.0.12",
      runs: 120,
      installations: 1,
      successes: 108,
      warnings: 8,
      errors: 4,
      affected_installations: 1,
      average_duration_ms: 902.5,
      maximum_duration_ms: 9120,
      success_rate: 90
    }
  ],
  telemetryIOSVersions: [
    {
      version: 26,
      runs: 400,
      installations: 8,
      successes: 396,
      warnings: 3,
      errors: 1,
      affected_installations: 1,
      average_duration_ms: 401,
      success_rate: 99
    }
  ],
  topIssues: [
    {
      error_code: "PDF_PAGE_TEXT_EXTRACTION_FAILED",
      module: "CTS PDF Engine",
      severity: "error",
      occurrences: 18,
      affected_installations: 2,
      latest_occurrence_at: new Date(Date.now() - 7200000).toISOString()
    },
    {
      error_code: "HASTUS_VALIDATION_FAILED",
      module: "CTS Parser",
      severity: "warning",
      occurrences: 9,
      affected_installations: 3,
      latest_occurrence_at: new Date(Date.now() - 86400000).toISOString()
    }
  ],
  recentIssues: [
    {
      occurred_at: new Date(Date.now() - 7200000).toISOString(),
      severity: "error",
      error_code: "PDF_PAGE_TEXT_EXTRACTION_FAILED",
      module: "CTS PDF Engine",
      stage: "extraction",
      dashboard_version: "1.0.12",
      ios_major_version: 26
    },
    {
      occurred_at: new Date(Date.now() - 90000000).toISOString(),
      severity: "warning",
      error_code: "HASTUS_VALIDATION_FAILED",
      module: "CTS Parser",
      stage: "validation",
      dashboard_version: "1.0.13",
      ios_major_version: 27
    }
  ],
  activityHistory: buildHistory(30, index => 5 + (index % 7)),
  installationHistory: buildHistory(30, index => (index % 9 === 0 ? 1 : 0)),
  recentInstallations: [
    {
      installed_at: new Date(Date.now() - 3600000).toISOString(),
      last_active_at: new Date(Date.now() - 600000).toISOString(),
      dashboard_version: "1.0.14",
      ios_major_version: 27,
      launch_count: 12,
      last_update_at: new Date(Date.now() - 3600000).toISOString()
    },
    {
      installed_at: new Date(Date.now() - 40 * 86400000).toISOString(),
      last_active_at: new Date(Date.now() - 35 * 86400000).toISOString(),
      dashboard_version: "1.0.12",
      ios_major_version: 26,
      launch_count: 3,
      last_update_at: null
    }
  ]
}

function buildHistory(days, valueAt) {
  const rows = []

  for (let index = 0; index < days; index++) {
    const date = new Date(Date.now() - (days - 1 - index) * 86400000)

    rows.push({
      day: date.toISOString().slice(0, 10),
      active_installations: valueAt(index),
      installations: valueAt(index)
    })
  }

  return rows
}

/* Le serveur répond, mais la base est vide : premier jour de mise en service. */
const EMPTY = {
  ok: true,
  generatedAt: new Date().toISOString(),
  summary: {
    total_installations: 0,
    active_today: 0,
    active_24h: 0,
    active_7d: 0,
    active_30d: 0,
    total_launches: 0,
    new_installations_today: 0,
    new_installations_7d: 0,
    new_installations_30d: 0,
    latest_installation_at: null,
    latest_activity_at: null
  },
  telemetrySummary: {
    total_runs: 0,
    installations_with_runs: 0,
    runs_today: 0,
    runs_24h: 0,
    runs_7d: 0,
    runs_30d: 0,
    successes_7d: 0,
    warnings_7d: 0,
    errors_7d: 0,
    affected_installations_7d: 0,
    success_rate_7d: 0,
    average_duration_ms_7d: null,
    maximum_duration_ms_7d: null,
    latest_run_at: null
  },
  issueSummary: {
    total_issues: 0,
    issues_24h: 0,
    issues_7d: 0,
    issues_30d: 0,
    warnings_7d: 0,
    errors_7d: 0,
    fatal_7d: 0,
    affected_installations_7d: 0,
    installations_with_errors_7d: 0,
    latest_issue_at: null
  },
  pipelineSummary: {},
  versions: [],
  iosVersions: [],
  telemetryVersions: [],
  telemetryIOSVersions: [],
  topIssues: [],
  recentIssues: [],
  activityHistory: [],
  installationHistory: [],
  recentInstallations: []
}

/* Le Worker a changé : la moitié des sections a disparu. */
const PARTIAL = {
  ok: true,
  generatedAt: new Date().toISOString(),
  summary: { total_installations: 5, active_7d: 3 }
}

async function run(label, { response, expectAlert = null }) {
  const files = new Map()
  const shown = []
  const failures = []
  const clipboard = []

  const fileManager = {
    documentsDirectory: () => "/docs",
    joinPath: (a, b) => `${a}/${b}`,
    fileExists: target => files.has(target),
    isFileDownloaded: () => true,
    readString: target => files.get(target) || "",
    writeString: (target, content) => files.set(target, content),
    createDirectory: target => files.set(target, ""),
    remove: target => files.delete(target)
  }

  /* Toute ligne construite est enregistrée, et tout onSelect déclenché. */
  const selectable = []

  class RecordingRow extends ui.UITableRow {
    addText(title, subtitle) {
      const cell = super.addText(title, subtitle)
      if (cell.title) shown.push(String(cell.title))
      if (cell.subtitle) shown.push(String(cell.subtitle))
      return cell
    }
    addImage(image) {
      if (!image) failures.push("une cellule image a reçu une valeur vide")
      return super.addImage(image)
    }
  }

  class RecordingTable extends ui.UITable {
    addRow(row) {
      if (typeof row.onSelect === "function") selectable.push(row.onSelect)
      super.addRow(row)
    }
    present() {
      return Promise.resolve()
    }
  }

  class Rect {
    constructor(x, y, width, height) {
      for (const [name, value] of Object.entries({ x, y, width, height })) {
        if (!Number.isFinite(value)) {
          failures.push(`Rect reçoit ${name} = ${value}`)
        }
      }
      Object.assign(this, { x, y, width, height })
    }
  }

  class DrawContext {
    constructor() {
      this.size = null
      this.opaque = true
      this.respectScreenScale = false
    }
    setFillColor() {}
    setStrokeColor() {}
    setTextColor() {}
    setFont() {}
    fillRect() {}
    fillEllipse() {}
    drawTextInRect() {}
    getImage() {
      return { drawn: true }
    }
  }

  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: m => failures.push(String(m)) },
    Date, Math, JSON, Number, String, Boolean, Array, Object, Set, Map,
    Promise, RegExp, Error, isNaN, parseInt, parseFloat,
    encodeURIComponent, decodeURIComponent, setTimeout,
    Color: ui.Color,
    Font: ui.Font,
    SFSymbol: ui.SFSymbol,
    UITable: RecordingTable,
    UITableRow: RecordingRow,
    DrawContext,
    Rect,
    Size: class {
      constructor(width, height) {
        this.width = width
        this.height = height
      }
    },
    DateFormatter: class {
      constructor() {
        this.locale = ""
        this.dateFormat = ""
      }
      string(date) {
        return date.toISOString()
      }
    },
    Script: { name: () => "CTS Analytics Admin", complete: () => {} },
    Device: { systemVersion: () => "27.0" },
    Pasteboard: { copyString: value => clipboard.push(String(value)) },
    FileManager: { iCloud: () => fileManager, local: () => fileManager },
    Alert: class {
      constructor() {
        this.actions = []
      }
      addAction(t) { this.actions.push(t) }
      addCancelAction() {}
      addDestructiveAction(t) { this.actions.push(t) }
      addSecureTextField() {}
      textFieldValue() { return "clé-de-test" }
      set title(value) { shown.push(String(value)); this._title = value }
      get title() { return this._title }
      set message(value) { shown.push(String(value)); this._message = value }
      get message() { return this._message }
      present() { return Promise.resolve(0) }
      presentAlert() { return Promise.resolve(0) }
      presentSheet() { return Promise.resolve(0) }
    },
    importModule: name => {
      if (name !== "CTS Analytics Client") {
        throw new Error(`module inattendu : ${name}`)
      }

      return {
        hasAdminApiKey: () => true,
        saveAdminApiKey: () => {},
        removeAdminApiKey: () => {},
        getStatistics: async () => response,
        checkHealth: async () => ({
          ok: true,
          statusCode: 200,
          data: {
            ok: true,
            database: "online",
            registration: "online",
            telemetry: "online",
            installations: 14,
            telemetryRuns: 4820,
            telemetryIssues: 96
          }
        })
      }
    }
  }

  vm.createContext(sandbox)

  const source = fs.readFileSync(adminPath, "utf8")

  try {
    await vm.runInContext(
      `(async () => {\n${source}\n})()`,
      sandbox,
      { filename: adminPath }
    )
  } catch (error) {
    failures.push(`exception non rattrapée : ${error.message}`)
  }

  /*
   * Chaque ligne interactive est ensuite déclenchée : c'est là que se
   * cachent les écrans secondaires, les filtres et les exports, qu'un
   * simple lancement ne visiterait jamais.
   */
  for (const handler of [...selectable]) {
    try {
      await handler()
    } catch (error) {
      failures.push(`onSelect lève : ${error.message}`)
    }
  }

  const text = shown.join(" | ")

  const RUNTIME = /before initialization|is not defined|is not a function|undefined is not|Cannot read|null is not|NaN|undefined/

  for (const line of shown) {
    if (RUNTIME.test(line)) failures.push(`texte fautif affiché : ${line.split("\n")[0]}`)
  }

  if (expectAlert && !text.includes(expectAlert)) {
    failures.push(`alerte attendue absente : « ${expectAlert} »`)
  }

  if (failures.length) {
    console.log(`ÉCHEC  ${label}`)
    for (const failure of [...new Set(failures)]) console.log(`         ${failure}`)
    return false
  }

  console.log(`ok     ${label}  (${shown.length} textes, ${selectable.length} actions)`)
  return true
}

const scenarios = [
  { label: "réponse complète", response: { ok: true, statusCode: 200, data: FULL } },
  { label: "base vide", response: { ok: true, statusCode: 200, data: EMPTY } },
  { label: "réponse partielle", response: { ok: true, statusCode: 200, data: PARTIAL } },
  {
    label: "clé refusée",
    response: { ok: false, statusCode: 401, error: "unauthorized" },
    expectAlert: "Accès refusé"
  },
  {
    label: "serveur injoignable",
    response: { ok: false, statusCode: null, error: "network" },
    expectAlert: "Statistiques indisponibles"
  }
]

let broken = false

for (const scenario of scenarios) {
  if (!(await run(scenario.label, scenario))) broken = true
}

process.exit(broken ? 1 : 0)
