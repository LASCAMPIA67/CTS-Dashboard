import { importFrom, isolatedModule } from "./sandbox.mjs"

function loadModule(name, loaded) {
  return isolatedModule(name, { importModule: importFrom(loaded) })
}

const PDF_PATH = "/documents/CTS Dashboard/Services/carte.pdf"
const INSTALLED_VERSION = "9.9.9"

const EXTRACTED = async () => ({
  text: "texte extrait",
  pageCount: 1,
  characterCount: 13,
  engine: "PDF.js",
  engineVersion: "test"
})

const REFUSED = async () => ({
  service: "",
  date: "",
  slices: [],
  validation: { valid: false, errors: ["Aucune tranche détectée"], warnings: [] }
})

const cases = [
  {
    name: "une lecture du PDF qui échoue",
    status: "exception",
    extract: async () => {
      throw new Error("La WebView n’a pas répondu.")
    },
    measured: ["sourceInspectionMs", "totalMs"],
    absent: ["pdfExtractionMs", "databaseReloadMs", "parserMs", "registrationMs"]
  },
  {
    name: "une carte lue puis refusée à la validation",
    status: "validation-error",
    extract: EXTRACTED,
    parse: REFUSED,
    measured: ["sourceInspectionMs", "pdfExtractionMs", "databaseReloadMs", "parserMs", "totalMs"],
    absent: ["registrationMs"]
  },
  {
    name: "une carte importée dont un lieu est inconnu des bases",
    status: "imported",
    extract: EXTRACTED,
    parse: async () => ({
      service: "XX01",
      date: "2030-01-05",
      slices: [{ dutyStart: "06:48", end: "10:30" }],
      validation: {
        valid: true,
        errors: [],
        warnings: ["Lieu inconnu dans la tranche 1"],
        slicesWithUnknownPlace: 1
      }
    }),
    measured: [
      "sourceInspectionMs",
      "pdfExtractionMs",
      "databaseReloadMs",
      "parserMs",
      "registrationMs",
      "totalMs"
    ],
    absent: [],
    slicesWithUnknownPlace: 1
  }
]

const failures = []

for (const scenario of cases) {
  const logged = []
  const loaded = {}

  loaded["CTS Utils"] = loadModule("CTS Utils", loaded)
  loaded["CTS Config"] = {
    fm: {
      fileExists: () => true,
      isDirectory: () => false,
      fileSize: () => 60,
      joinPath: (a, b) => `${a}/${b}`,
      readString: () => "",
      move: () => {}
    },
    paths: {},
    files: {},
    pdf: { maximumFileSizeBytes: 20 * 1024 * 1024 },
    dashboardVersion: INSTALLED_VERSION,
    servicesIndexVersion: 2,
    ensureDirectories: () => {}
  }
  loaded["CTS Storage"] = {
    ensureDownloaded: async () => true,
    safeModificationDate: () => new Date("2030-01-05T06:00:00Z"),
    appendLog: async (type, message, details) => {
      logged.push({ type, details })
      return true
    },
    writeJsonSafely: async () => true,
    writeTextSafely: async () => true,
    uniqueArchiveFileName: name => name,
    readCurrentIndex: async () => ({ services: [] })
  }
  loaded["CTS Database"] = { reload: async () => {} }
  loaded["CTS PDF Engine"] = { extractText: scenario.extract }
  loaded["CTS Parser"] = { parseService: scenario.parse ?? REFUSED }

  const PIPELINE = loadModule("CTS Import Pipeline", loaded)
  const result = await PIPELINE.importPdf(PDF_PATH)

  if (result.status !== scenario.status) {
    failures.push(`${scenario.name} : statut « ${result.status} » au lieu de « ${scenario.status} »`)
    continue
  }

  if (logged.length !== 1) {
    failures.push(`${scenario.name} : ${logged.length} entrées de journal au lieu d'une`)
    continue
  }

  for (const [where, timings] of [
    ["résultat", result.timings],
    ["journal", logged[0].details?.timings]
  ]) {
    for (const stage of scenario.measured) {
      if (!Number.isFinite(timings?.[stage])) {
        failures.push(`${scenario.name} : ${stage} n'est pas mesurée dans le ${where}`)
      }
    }

    for (const stage of scenario.absent) {
      if (timings?.[stage] !== null) {
        failures.push(
          `${scenario.name} : ${stage} vaut ${timings?.[stage]} dans le ${where}, ` +
            `alors que l'étape n'a pas tourné`
        )
      }
    }
  }

  const expectedUnknown = scenario.slicesWithUnknownPlace

  if (expectedUnknown !== undefined && result.slicesWithUnknownPlace !== expectedUnknown) {
    failures.push(
      `${scenario.name} : ${result.slicesWithUnknownPlace} tranche(s) au lieu inconnu ` +
        `transmise(s) au lieu de ${expectedUnknown}`
    )
  }

  if (result.status === "imported" && result.indexEntry?.dashboardVersion !== INSTALLED_VERSION) {
    failures.push(
      `${scenario.name} : l'entrée d'index retient la version « ${result.indexEntry?.dashboardVersion} » ` +
        `au lieu de la version installée`
    )
  }
}

if (failures.length) {
  console.log("ÉCHEC  durées d'étape consignées par un import")
  for (const failure of failures) console.log(`         ${failure}`)
  process.exit(1)
}

const completed = cases.filter(scenario => scenario.status === "imported").length

console.log(
  `ok     durées d'étape consignées par un import (${cases.length - completed} ` +
    `imports interrompus, ${completed} complet, aucune étape absente écrite zéro, ` +
    `lieux inconnus transmis, version de lecture retenue)`
)
