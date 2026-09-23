/*
 * Une cause, un incident.
 *
 * Deux sous-systèmes butent sur la même panne dans la même exécution :
 * iCloud injoignable arrête l'inspection de la carte agent et l'archivage
 * du même fichier, un index corrompu arrête la sélection du service et
 * l'entretien. Chacun a son code et son module, et le dédoublonnage
 * portait sur le module : la console d'administration recevait deux
 * lignes pour un fait unique, l'une rouge et l'autre orange, puisque
 * l'entretien ne coûte jamais l'affichage et que l'inspection si.
 *
 * Ce banc monte le vrai CTS Widget Engine sur des doublures qui
 * reproduisent ces deux paires, et lit la télémétrie qu'il rend à
 * CTS Dashboard : c'est elle qui part vers le serveur.
 */

import { importFrom, isolatedModule } from "./sandbox.mjs"

const ROOT = "/docs/CTS Dashboard"
const NOW = new Date(2026, 8, 14, 10, 0, 0)

function loadModule(name, loaded) {
  return isolatedModule(name, {
    importModule: importFrom(loaded),
    globals: { setTimeout, config: { runsInWidget: true } }
  })
}

/*
 * Le moteur est monté avec des doublures pour tout ce qui n'est pas la
 * télémétrie : le balayage et l'entretien rendent exactement les erreurs
 * qu'on leur demande, de sorte que les incidents observés ne puissent
 * venir que de la façon dont le moteur les enregistre.
 */
function buildEngine({ detectionErrors = [], selection = null, cleanupErrors = [] }) {
  const fm = {
    joinPath: (parent, child) => `${parent}/${child}`,
    fileExists: () => false,
    isFileDownloaded: () => true,
    readString: () => "",
    writeString: () => {},
    createDirectory: () => {},
    remove: () => {},
    move: () => {},
    isDirectory: () => false,
    listContents: () => []
  }

  const loaded = {}

  loaded["CTS Utils"] = loadModule("CTS Utils", loaded)

  loaded["CTS Config"] = {
    fm,
    paths: { root: ROOT, data: `${ROOT}/Data` },
    files: { versionPolicy: `${ROOT}/Data/version-policy.json`, places: `${ROOT}/Database/places.json` },
    refresh: { activeMs: 60000, unknownMs: 300000, inactiveMs: 21600000, transitionDelaySeconds: 2 },
    pdf: { maximumFilesPerRun: 2 },
    dashboardVersion: "1.4.2",
    ensureDirectories: () => {}
  }

  loaded["CTS Storage"] = {
    loadVersionPolicy: async () => null,
    ensureReadable: async () => true,
    loadPreferences: async () => ({ textScale: 1 })
  }

  loaded["CTS Services Manager"] = {
    scanServices: async () => ({
      success: true,
      status: "idle",
      remaining: 0,
      detected: detectionErrors.length,
      imported: [],
      failed: [],
      knownFailures: [],
      detectionErrors
    }),
    resolveServiceForDate: async () => {
      if (selection) throw selection
      return { found: false, reason: "no-service" }
    }
  }

  loaded["CTS Services Cleaner"] = {
    maintainServices: async () => ({
      success: cleanupErrors.length === 0,
      status: "idle",
      archived: [],
      deleted: [],
      skipped: [],
      errors: cleanupErrors
    })
  }

  loaded["CTS Service"] = {
    normalizeService: () => ({ valid: false, error: "doublure" }),
    computeState: () => ({ type: "WORK" }),
    computeStats: () => ({}),
    getDisplaySlice: () => null
  }

  return loadModule("CTS Widget Engine", loaded)
}

/* L'erreur telle que CTS Utils la fabrique, avec son code et son étape. */
function telemetryError(code, stage, message) {
  const error = new Error(message)

  error.telemetryCode = code
  error.telemetryStage = stage

  return error
}

const failures = []

function check(condition, message) {
  if (!condition) failures.push(message)
}

async function issuesFor(options) {
  const engine = buildEngine(options)
  const context = await engine.loadContext(NOW)

  return context?.telemetry?.issues || []
}

function withCode(issues, code) {
  return issues.filter(issue => issue.errorCode === code)
}

/* ------------------------------------------------- iCloud injoignable */

/*
 * La paire relevée sur le parc : PDF_ICLOUD_DOWNLOAD_FAILED à
 * l'inspection, ARCHIVE_ICLOUD_DOWNLOAD_FAILED à l'archivage, à la même
 * seconde, pour le même fichier resté dans le dossier Services.
 */
{
  const issues = await issuesFor({
    detectionErrors: [
      { telemetryCode: "PDF_ICLOUD_DOWNLOAD_FAILED", telemetryStage: "inspection" }
    ],
    cleanupErrors: [
      {
        telemetryCode: "ARCHIVE_ICLOUD_DOWNLOAD_FAILED",
        telemetryStage: "archive",
        error: "iCloud injoignable"
      }
    ]
  })

  const iCloud = issues.filter(issue => /ICLOUD/.test(issue.errorCode))

  check(
    iCloud.length === 1,
    `une panne iCloud enregistre ${iCloud.length} incident(s) : ` +
      JSON.stringify(iCloud.map(issue => `${issue.errorCode} · ${issue.module}`))
  )

  check(
    iCloud[0]?.errorCode === "PDF_ICLOUD_DOWNLOAD_FAILED",
    `l'incident retenu est « ${iCloud[0]?.errorCode} » : c'est le chemin de ` +
      "l'affichage qui doit nommer la panne, pas celui de l'entretien"
  )

  /*
   * Le collègue n'a pas vu son service : la gravité de l'entretien, qui
   * ne coûte jamais l'affichage, ne doit pas adoucir celle-ci.
   */
  check(
    iCloud[0]?.severity === "error",
    `la panne iCloud reste « ${iCloud[0]?.severity} » alors que le collègue n'a rien vu`
  )
}

/* ---------------------------------------------------- index corrompu */

/*
 * Le même services-index.json illisible, lu par la sélection du service
 * et par l'entretien. Deux modules, un seul fichier corrompu.
 */
{
  const issues = await issuesFor({
    selection: telemetryError("SERVICE_INDEX_INVALID", "index", "index illisible"),
    cleanupErrors: [
      {
        telemetryCode: "SERVICE_INDEX_INVALID",
        telemetryStage: "index",
        error: "index illisible"
      }
    ]
  })

  const index = withCode(issues, "SERVICE_INDEX_INVALID")

  check(
    index.length === 1,
    `un index corrompu enregistre ${index.length} incident(s) : ` +
      JSON.stringify(index.map(issue => `${issue.module} · ${issue.severity}`))
  )

  check(
    index[0]?.severity === "error",
    `l'index corrompu reste « ${index[0]?.severity} » alors que le collègue n'a rien vu`
  )
}

/* --------------------------------- ce qui ne doit surtout pas fusionner */

/*
 * Deux pannes distinctes restent deux incidents. Le dédoublonnage porte
 * sur la cause, et une lecture de PDF ratée n'est pas un index corrompu.
 */
{
  const issues = await issuesFor({
    detectionErrors: [
      { telemetryCode: "PDF_READ_FAILED", telemetryStage: "inspection" }
    ],
    cleanupErrors: [
      {
        telemetryCode: "REPLACED_ARCHIVE_DELETE_FAILED",
        telemetryStage: "residue",
        error: "suppression refusée"
      }
    ]
  })

  check(
    withCode(issues, "PDF_READ_FAILED").length === 1 &&
      withCode(issues, "REPLACED_ARCHIVE_DELETE_FAILED").length === 1,
    "deux pannes sans rapport ont fusionné : " +
      JSON.stringify(issues.map(issue => issue.errorCode))
  )

  /* L'entretien seul garde sa gravité : il n'a pas coûté l'affichage. */
  check(
    withCode(issues, "REPLACED_ARCHIVE_DELETE_FAILED")[0]?.severity === "warning",
    "un échec d'entretien sans rapport a été aggravé par une autre panne"
  )
}

/*
 * La bibliothèque PDF.js et la carte agent ne fusionnent pas, bien que ce
 * soit le même iCloud qui refuse de rendre un fichier.
 *
 * Elles ne peuvent de toute façon pas décrire la même panne : la carte se
 * télécharge avant la bibliothèque, un iCloud muet arrête donc l'import
 * sur la carte, et ces codes-là ne sortent que lorsqu'elle est déjà
 * locale. Là où ils se rencontrent — deux PDF d'une même exécution — ce
 * sont deux gestes différents, une carte à redéposer et une installation à
 * refaire. Les fusionner ferait garder le premier code vu, et afficherait
 * parfois celui de la carte pour une bibliothèque absente.
 */
for (const engineCode of [
  "PDF_ENGINE_LIBRARY_ICLOUD_FAILED",
  "PDF_ENGINE_WORKER_ICLOUD_FAILED"
]) {
  const issues = await issuesFor({
    detectionErrors: [
      { telemetryCode: "PDF_ICLOUD_DOWNLOAD_FAILED", telemetryStage: "inspection" },
      { telemetryCode: engineCode, telemetryStage: "engine" }
    ]
  })

  check(
    withCode(issues, "PDF_ICLOUD_DOWNLOAD_FAILED").length === 1 &&
      withCode(issues, engineCode).length === 1,
    `${engineCode} a fusionné avec la carte agent : ` +
      JSON.stringify(issues.map(issue => issue.errorCode))
  )
}

/* --------------------------------------------------------- résultat */

if (failures.length) {
  console.error(`\n${failures.length} problème(s) :\n`)
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error("")
  process.exit(1)
}

console.log(
  "ok     Incidents d’une exécution (une cause un incident, gravité la plus forte " +
    "retenue, chemin de l’affichage nommé avant celui de l’entretien, pannes " +
    "distinctes non fusionnées, bibliothèque PDF.js tenue à part de la carte agent)"
)
