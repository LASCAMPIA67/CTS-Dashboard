import * as shim from "./scriptable-shim.mjs"
import { moduleSpace, runScript, timerDouble } from "./sandbox.mjs"
const failures = []

function createFileManager(disk) {
  return {
    joinPath: (parent, child) => `${parent}/${child}`,
    documentsDirectory: () => "/documents",
    libraryDirectory: () => "/library",
    fileExists: target => disk.has(target) || target.endsWith("/"),
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
    createDirectory: () => {},
    listContents: () => [],
    isDirectory: () => false,
    fileSize: () => 1,
    modificationDate: () => new Date()
  }
}

const ACCESSORY = ["accessoryRectangular", "accessoryCircular", "accessoryInline"]

// Heure figée : sur l'horloge réelle, le résultat dépendait de l'heure du commit.
const FROZEN_NOW = new Date(2026, 7, 19, 9, 0, 0)

class FrozenDate extends Date {
  constructor(...args) {
    if (args.length === 0) {
      super(FROZEN_NOW.getTime())
      return
    }

    super(...args)
  }

  static now() {
    return FROZEN_NOW.getTime()
  }
}

function collectText(node) {
  if (!node || typeof node !== "object") return ""

  const own = node.kind === "text" ? `${node.value} ` : ""
  const children = Array.isArray(node.children) ? node.children : []

  return own + children.map(collectText).join("")
}

function seedService(disk, today) {
  const iso = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0")
  ].join("-")

  const stem = `Service_${iso}_EA05`

  disk.set("/documents/CTS Dashboard/Data/services-index.json", JSON.stringify({
    version: 2,
    updatedAt: new Date().toISOString(),
    services: [{
      id: stem,
      date: iso,
      service: "EA05",
      pdfFile: `${stem}.pdf`,
      cacheFile: `${stem}.json`,
      textFile: `${stem}.txt`,
      importedAt: new Date().toISOString(),
      indexedAt: new Date().toISOString(),
      warnings: 0,
      slices: 1
    }]
  }))

  disk.set(`/documents/CTS Dashboard/Cache/Services/${stem}.json`, JSON.stringify({
    service: "EA05",
    date: iso,
    driver: { name: "", id: "" },
    slices: [{
      index: 1,
      lineCode: "10",
      line: "10",
      vehicle: "5",
      dutyStart: "05:30",
      operationStart: "05:48",
      end: "12:40",
      dutyEnd: "12:55",
      startPlaceCode: "CRB",
      startPlace: "Cronenbourg",
      endPlaceCode: "ELS",
      endPlace: "Elsau",
      depotExitAt: "05:40",
      depotReturnAt: "12:50",
      lineUpAt: "",
      direction: "Elsau"
    }],
    breaks: [],
    validation: { valid: true, errors: [], warnings: [] }
  }))
}

async function run(
  surface,
  { family = "large", label = surface, service = false, engineFails = false } = {}
) {
  const disk = new Map()
  const fileManager = createFileManager(disk)
  const widgetsSet = []
  const presented = []
  const runsInWidget = surface === "widget"

  if (service) seedService(disk, FROZEN_NOW)

  const globals = {
    FileManager: { iCloud: () => fileManager, local: () => fileManager },
    Date: FrozenDate,
    Intl,
    config: { runsInWidget, widgetFamily: runsInWidget ? family : null },
    Device: { screenSize: () => new shim.Size(430, 932), systemVersion: () => "27.0" },
    Keychain: {
      contains: () => false,
      get: () => "",
      set: () => {},
      remove: () => {}
    },
    Request: class {
      constructor(url) { this.url = String(url); this.headers = {} }
      async loadString() { throw new Error("réseau indisponible") }
      async loadJSON() { throw new Error("réseau indisponible") }
      async load() { throw new Error("réseau indisponible") }
    },
    Timer: timerDouble({ delay: milliseconds => Math.min(milliseconds, 5) }),
    Script: {
      name: () => "CTS Dashboard",
      setWidget: widget => widgetsSet.push(widget),
      complete: () => {}
    }
  }

  shim.installGlobals(globals)

  const { sandbox, load } = moduleSpace(globals)

  if (engineFails) {
    load("CTS Widget Engine").loadContext = async () => {
      throw new Error("panne simulée du moteur")
    }
  }

  for (const family of ["presentSmall", "presentMedium", "presentLarge"]) {
    sandbox.ListWidget.prototype[family] = function () {
      presented.push(family)
      return Promise.resolve()
    }
  }

  try {
    await runScript("CTS Dashboard", sandbox)
  } catch (error) {
    failures.push(`${surface} : exception non rattrapée — ${error.message}`)
    return
  }

  if (runsInWidget && !widgetsSet.length) {
    failures.push(`${label} : Script.setWidget n'a jamais été appelé, rien ne serait affiché`)
  }

  for (const widget of widgetsSet) {
    if (!widget?.children?.length) {
      failures.push(`${label} : la vignette validée ne contient aucun élément`)
    }
    if (!ACCESSORY.includes(family) && !widget?.backgroundGradient && !widget?.backgroundColor) {
      failures.push(`${label} : la vignette validée n'a aucun fond`)
    }

    const words = collectText(widget)

    if (!words.trim()) {
      failures.push(`${label} : la vignette validée ne porte aucun texte`)
    }

    if (/IPPOLITO|Cré[ée] et développé par/i.test(words)) {
      failures.push(`${label} : la vignette porte un crédit d'auteur`)
    }

    if (
      runsInWidget &&
      family !== "large" &&
      !ACCESSORY.includes(family) &&
      !/Widget grand requis/.test(words)
    ) {
      failures.push(
        `${label} : la grande carte est livrée à une tuile ${family} ` +
        `au lieu de « Widget grand requis »`
      )
    }

    if (runsInWidget && ACCESSORY.includes(family)) {
      if (/Widget grand requis/.test(words)) {
        failures.push(`${label} : une tuile d'écran verrouillé réclame un grand widget`)
      }

      if (/PROGRAMME|Amplitude/.test(words)) {
        failures.push(`${label} : la grande carte est livrée à une tuile ${family}`)
      }

      if (service && !/\d{1,2}:\d{2}/.test(words)) {
        failures.push(`${label} : aucune heure affichée sur la tuile ${family}`)
      }
    }
  }

  if (!runsInWidget && !presented.length) {
    failures.push("application : aucun widget présenté")
  }

  for (const widget of service ? widgetsSet : []) {
    const refreshAt = widget?.refreshAfterDate

    if (!(refreshAt instanceof Date)) continue

    const minutes = (refreshAt.getTime() - FROZEN_NOW.getTime()) / 60000

    if (minutes < 4.9) {
      failures.push(
        `${label} : réveil demandé dans ${minutes.toFixed(1)} min — ` +
        `sous le rattrapage de cinq minutes en service`
      )
    }

    if (!engineFails && minutes > 5.1) {
      failures.push(
        `${label} : réveil demandé dans ${minutes.toFixed(1)} min — ` +
        `au-delà du rattrapage de cinq minutes en service`
      )
    }
  }

  for (const widget of engineFails ? widgetsSet : []) {
    const refreshAt = widget?.refreshAfterDate
    const minutes =
      refreshAt instanceof Date ? (refreshAt.getTime() - FROZEN_NOW.getTime()) / 60000 : NaN

    if (!(minutes >= 4.9 && minutes <= 5.1)) {
      failures.push(
        `${label} : après une panne, réveil demandé dans ${minutes.toFixed(1)} min ` +
          `au lieu de cinq`
      )
    }
  }

  const trace = disk.get("/documents/CTS Dashboard/Data/last-run.json")

  if (!trace) {
    failures.push(`${surface} : aucune trace d'exécution écrite`)
    return
  }

  let parsed

  try {
    parsed = JSON.parse(trace)
  } catch (_) {
    failures.push(`${surface} : trace d'exécution illisible`)
    return
  }

  if (parsed.surface !== surface) {
    failures.push(`${surface} : la trace annonce « ${parsed.surface} »`)
  }

  if (parsed.committed !== true) {
    failures.push(`${surface} : le rendu n'est pas marqué comme validé`)
  }
}

await run("widget")
await run("application")

for (const family of ["accessoryRectangular", "accessoryCircular", "accessoryInline", "extraLarge", "medium", "small"]) {
  await run("widget", { family, label: `widget ${family}`, service: true })
}

await run("widget", { label: "widget service", service: true })
await run("application", { label: "application service", service: true })
await run("widget", { label: "widget en panne", service: true, engineFails: true })

if (failures.length) {
  console.log("ÉCHEC  exécution de CTS Dashboard")
  for (const failure of failures) console.log(`         ${failure}`)
  process.exit(1)
}

console.log(
  "ok     exécution de CTS Dashboard " +
  "(widget, application, 6 familles, rendu validé, jamais vide, réveils bornés)"
)
