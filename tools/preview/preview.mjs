/*
 * Banc de prévisualisation du widget CTS Dashboard.
 *
 * Charge le VRAI CTS Widget Renderer (et son thème) dans un contexte muni
 * d'une émulation de l'API Scriptable, produit la mise en page de plusieurs
 * scénarios et tailles d'écran, puis en fait une capture avec Chromium.
 *
 * Limite assumée : San Francisco n'existe pas ici. Les largeurs de texte
 * sont donc approchées à quelques pour cent près. Cela n'affecte pas les
 * propriétés que l'on cherche à contrôler — symétrie, équilibre des
 * colonnes, hauteur totale, contraste — car l'écart de métrique s'applique
 * de la même façon des deux côtés.
 */

import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import vm from "node:vm"
import { fileURLToPath } from "node:url"
import * as shim from "./scriptable-shim.mjs"
import { renderSheet, widgetBody } from "./html.mjs"
import { measureBodies, measureCardWidths } from "./measure.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(here, "..", "..")
const output = process.argv[2] || path.join(here, "out")
fs.mkdirSync(output, { recursive: true })

const CHROMIUM = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium/chrome-linux/chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
].find(candidate => fs.existsSync(candidate))

/* ------------------------------------------------------------------ */
/* Chargement des modules du dépôt dans un contexte Scriptable simulé. */
/* ------------------------------------------------------------------ */

let deviceScreen = { width: 428, height: 926 }

/*
 * FileManager minimal, adossé au dépôt : `Database/places.json` pointe sur
 * le vrai fichier, si bien que CTS Service.getPlaceLookup résout les
 * libellés exactement comme sur l'iPhone. Aucune écriture n'est possible.
 */
function createFileManager() {
  const rootName = "CTS Dashboard"
  const resolve = target => {
    const marker = `${rootName}/Database/`
    const index = String(target).indexOf(marker)
    if (index === -1) return null
    return path.join(repository, String(target).slice(index + marker.length))
  }

  return {
    documentsDirectory: () => "/Documents",
    joinPath: (parent, child) => `${parent}/${child}`,
    fileExists: target => {
      const real = resolve(target)
      return real ? fs.existsSync(real) : true
    },
    isFileDownloaded: target => {
      const real = resolve(target)
      return real ? fs.existsSync(real) : true
    },
    readString: target => {
      const real = resolve(target)
      if (!real) throw new Error(`Lecture non simulée : ${target}`)
      return fs.readFileSync(real, "utf8")
    },
    createDirectory: () => {},
    downloadFileFromiCloud: async () => {},
    fileSize: () => 1,
    modificationDate: () => new Date()
  }
}

function createRuntime() {
  const modules = new Map()

  const sandbox = {
    FileManager: { iCloud: createFileManager, local: createFileManager },
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
    isNaN,
    parseInt,
    parseFloat,
    Intl,
    Device: { screenSize: () => new shim.Size(deviceScreen.width, deviceScreen.height) },
    importModule: name => loadModule(name)
  }
  shim.installGlobals(sandbox)
  vm.createContext(sandbox)

  function loadModule(name) {
    if (modules.has(name)) return modules.get(name)
    const file = path.join(repository, `${name}.js`)
    const source = fs.readFileSync(file, "utf8")
    const moduleObject = { exports: {} }
    modules.set(name, moduleObject.exports)
    const wrapper = vm.runInContext(
      `(function (module, exports) {\n${source}\n})`,
      sandbox,
      { filename: file }
    )
    wrapper(moduleObject, moduleObject.exports)
    modules.set(name, moduleObject.exports)
    return moduleObject.exports
  }

  return { loadModule, reset: () => modules.clear() }
}

const runtime = createRuntime()
const UTILS = runtime.loadModule("CTS Utils")
const SERVICE = runtime.loadModule("CTS Service")

function renderer() {
  /* Rechargé à chaque scénario : getDensity lit Device.screenSize() une
     fois par rendu, mais le thème et les densités sont sans état. */
  return runtime.loadModule("CTS Widget Renderer")
}

/* ------------------------------------------------------------------ */
/* Jeux de données réalistes.                                          */
/* ------------------------------------------------------------------ */

function slice(overrides) {
  return {
    index: 1,
    lineCode: "10",
    line: "G",
    vehicle: "12",
    dutyStart: "06:59",
    operationStart: "07:09",
    end: "09:03",
    dutyEnd: "09:03",
    startPlaceCode: "CRB",
    startPlace: "UPC",
    endPlaceCode: "CRB",
    endPlace: "UPC",
    lineUpAt: "",
    direction: "",
    depotExitAt: "",
    depotReturnAt: "",
    ...overrides
  }
}

/*
 * Matrice complète : chaque état du widget croisé avec 1, 2 et 3 tranches.
 * Les horaires sont construits pour que l'heure d'observation tombe
 * exactement dans l'état voulu, et les coupures sont déclarées comme le
 * ferait le parseur, sans quoi computeState les traiterait en pause.
 */
const LINES = [
  { line: "C4", vehicle: "3", from: "Elmerforst", to: "Elmerforst", direction: "Illkirch Fort Uhrich" },
  { line: "L1", vehicle: "204", from: "UPE", to: "UPE", direction: "Espace Eur. Entreprise" },
  { line: "17", vehicle: "5", from: "UPC", to: "UPC", direction: "Neuhof R. Reuss" }
]

const SLICE_TIMES = [
  { dutyStart: "05:30", start: "05:48", end: "09:03", dutyEnd: "09:20", exit: "05:40", back: "09:14" },
  { dutyStart: "12:31", start: "12:31", end: "16:55", dutyEnd: "17:10", exit: "", back: "17:06" },
  { dutyStart: "18:07", start: "18:07", end: "20:58", dutyEnd: "21:12", exit: "", back: "21:08" }
]

function buildSlices(count) {
  return SLICE_TIMES.slice(0, count).map((times, index) => {
    const identity = LINES[index]
    const depotStart = index === 0
    return {
      index: index + 1,
      lineCode: "10",
      line: identity.line,
      vehicle: identity.vehicle,
      dutyStart: times.dutyStart,
      operationStart: times.start,
      end: times.end,
      dutyEnd: times.dutyEnd,
      startPlaceCode: depotStart ? "CRB" : "ELME",
      startPlace: identity.from,
      endPlaceCode: "ELS",
      endPlace: identity.to,
      depotExitAt: times.exit,
      depotReturnAt: times.back,
      lineUpAt: depotStart ? "Gare Marchandises" : "",
      direction: identity.direction
    }
  })
}

/* Une coupure est déclarée entre deux tranches ; sinon c'est une pause. */
function buildBreaks(count, cut) {
  if (!cut || count < 2) return []
  return [{ type: "cut", start: SLICE_TIMES[0].end, end: SLICE_TIMES[1].start }]
}

const STATES = [
  { key: "Service dans 3 jours", at: "10:00", dayOffset: 3 },
  { key: "Avant le service", at: "05:20" },
  { key: "En service", at: "07:30" },
  { key: "Pause", at: "10:30", needs: 2 },
  { key: "Coupure", at: "10:30", needs: 2, cut: true },
  { key: "Service terminé", at: "23:30" }
]

const SCENARIOS = {}

for (const count of [1, 2, 3]) {
  for (const state of STATES) {
    if (state.needs && count < state.needs) continue
    SCENARIOS[`${state.key} · ${count} tranche${count > 1 ? "s" : ""}`] = {
      service: "EA05",
      date: "2026-08-12",
      slices: buildSlices(count),
      breaks: buildBreaks(count, state.cut),
      at: state.at,
      dayOffset: state.dayOffset || 0
    }
  }
}

function buildContext(name, screen) {
  const definition = SCENARIOS[name]
  const base = definition.reuse ? SCENARIOS[definition.reuse] : definition
  const raw = {
    service: base.service,
    date: base.date,
    driver: { name: "IPPOLITO", id: "6124" },
    slices: base.slices,
    breaks: base.breaks || [],
    validation: { valid: true, errors: [], warnings: [] }
  }

  const normalized = SERVICE.normalizeService(raw)
  if (!normalized.valid) throw new Error(`${name} : ${normalized.error}`)

  const [hours, minutes] = definition.at.split(":").map(Number)
  const at = new Date(2026, 7, 12 - (definition.dayOffset || 0), hours, minutes)

  const state = SERVICE.computeState(normalized.service, at)
  return {
    valid: true,
    service: normalized.service,
    state,
    stats: SERVICE.computeStats(normalized.service),
    displaySlice: SERVICE.getDisplaySlice(normalized.service, state)
  }
}

/* Tailles réelles du widget « large ». */
const SCREENS = [
  { name: "Pro Max", screen: 428, screenHeight: 926, width: 364, height: 382 },
  { name: "standard", screen: 390, screenHeight: 844, width: 338, height: 354 },
  { name: "mini", screen: 375, screenHeight: 812, width: 329, height: 345 },
  { name: "SE", screen: 375, screenHeight: 667, width: 321, height: 324 }
]

export function collectItems() {
  const only = process.env.PREVIEW_SCENARIOS?.split("|").filter(Boolean)
  const screensWanted = process.env.PREVIEW_SCREENS?.split("|").filter(Boolean)
  const items = []

  for (const name of Object.keys(SCENARIOS)) {
    if (only && !only.includes(name)) continue
    for (const screen of SCREENS) {
      if (screensWanted && !screensWanted.includes(screen.name)) continue
      deviceScreen = { width: screen.screen, height: screen.screenHeight }
      const context = buildContext(name, screen)
      const widget = renderer().createWidget("large", context)
      items.push({
        label: `${name} — ${screen.name} — ${context.state.label}`,
        width: screen.width,
        height: screen.height,
        body: widgetBody(widget)
      })
    }
  }
  return items
}

function main() {
  const items = collectItems()
  const screensWanted = process.env.PREVIEW_SCREENS?.split("|").filter(Boolean)

  if (process.env.PREVIEW_MODE === "widths") {
    let uneven = false
    for (const result of measureCardWidths(items, output)) {
      /* Les ressorts fixes entre les cartes ont une largeur nulle. */
      const widths = result.cards.filter(value => value > 0)
      const gap = Math.max(...widths) - Math.min(...widths)
      if (gap > 4) uneven = true
      console.log(
        `${gap > 4 ? "INÉGAL " : "ok     "} ${result.label.padEnd(52)} ` +
          `widget ${result.widget}pt · cartes ${widths.join(" / ")}`
      )
    }
    process.exit(uneven ? 1 : 0)
  }

  if (process.env.PREVIEW_MODE === "measure") {
    const results = measureBodies(items, output)
    let overflow = false
    for (const result of results) {
      const slack = result.frame - result.content
      if (slack < 0) overflow = true
      console.log(
        `${slack < 0 ? "DÉBORDE" : "ok     "} ${result.label.padEnd(52)} ` +
          `${result.content.toFixed(1)}pt / ${result.frame}pt  (marge ${slack.toFixed(1)}pt)`
      )
    }
    process.exit(overflow ? 1 : 0)
  }

  const htmlPath = path.join(output, "preview.html")
  fs.writeFileSync(htmlPath, renderSheet(items))

  if (!CHROMIUM) {
    console.log(`HTML écrit dans ${htmlPath} (Chromium introuvable, pas de capture)`)
    return
  }

  const columns = screensWanted ? screensWanted.length : SCREENS.length
  const perRow = Math.max(1, Number(process.env.PREVIEW_COLUMNS) || Math.min(columns, 4))
  const widest = Math.max(...items.map(item => item.width))
  const tallest = Math.max(...items.map(item => item.height))
  const sheetWidth = perRow * (widest + 24) + 32
  const rows = Math.ceil(items.length / perRow)
  const sheetHeight = rows * (tallest + 56) + 32

  execFileSync(
    CHROMIUM,
    [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--hide-scrollbars",
      "--force-device-scale-factor=2",
      `--virtual-time-budget=3000`,
      `--window-size=${sheetWidth},${sheetHeight}`,
      `--screenshot=${path.join(output, "preview.png")}`,
      `file://${htmlPath}`
    ],
    { stdio: "pipe" }
  )

  console.log(`Capture : ${path.join(output, "preview.png")}  (${items.length} vignettes)`)
}

if (process.env.PREVIEW_MODE !== "library") if (process.env.PREVIEW_MODE !== "library") main()
