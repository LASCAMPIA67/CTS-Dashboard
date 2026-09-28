/*
 * Test des durées d'étape qu'un import écrit dans son journal.
 *
 * Ce test existe à cause d'un défaut réel, et d'une correction qui le
 * croyait réglé. Le 16 septembre, le Diagnostic a appris à écrire « non
 * terminée » pour une étape qui n'a pas tourné, au lieu de « 0 ms ». Mais le
 * pipeline d'import, qui écrit ces durées avant que le Diagnostic ne les
 * lise, convertissait déjà l'absence en zéro : Number(null) vaut 0. Le banc
 * du Diagnostic lui fournissait un journal écrit à la main, et éprouvait le
 * lecteur sans jamais passer par l'écrivain.
 *
 * Ce banc-ci passe par le pipeline réel, sur des doublures hors ligne, et
 * lit ce qu'il a consigné. Il vérifie au passage qu'un import réussi rend
 * le décompte des tranches au lieu inconnu, dont le widget fait l'incident
 * PLACE_UNKNOWN.
 */

import { importFrom, isolatedModule } from "./sandbox.mjs"

function loadModule(name, loaded) {
  return isolatedModule(name, { importModule: importFrom(loaded) })
}

const PDF_PATH = "/documents/CTS Dashboard/Services/carte.pdf"

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

/*
 * Chaque cas arrête l'import à une étape différente, et dit lesquelles ont
 * réellement tourné.
 */
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
    /*
     * Le décompte des lieux inconnus doit sortir du pipeline : c'est de lui
     * que le widget fait l'incident PLACE_UNKNOWN.
     */
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
    `lieux inconnus transmis)`
)
