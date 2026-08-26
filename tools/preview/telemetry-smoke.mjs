/*
 * Statut d'une exécution télémétrique.
 *
 * Le taux de succès de la flotte se calcule sur ce statut : le serveur
 * compte comme échec tout ce qui n'est pas « success ». Une exécution est
 * pourtant créée et envoyée à chaque lancement, y compris un jour de repos
 * où il n'y a rien à afficher. Tant que l'absence de carte agent pesait
 * comme une panne, la mesure décrivait l'agenda des collègues et non la
 * fiabilité du logiciel — une version pouvait chuter de 99 % à 69 % sans
 * qu'une seule ligne de code ait failli.
 *
 * Ce banc fixe la frontière : l'absence de travail passe en succès,
 * chaque vraie panne garde son poids, et l'incident reste enregistré pour
 * la console d'administration.
 */

import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(here, "..", "..")

function loadAnalytics() {
  const source = fs.readFileSync(path.join(repository, "CTS Analytics Client.js"), "utf8")
  const module = { exports: {} }

  let counter = 0

  const sandbox = {
    module,
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Date, Math, JSON, Number, String, Boolean, Array, Object, Set, Map,
    Promise, RegExp, Error, isNaN, parseInt, parseFloat,
    UUID: { string: () => `00000000-0000-0000-0000-${String(++counter).padStart(12, "0")}` },
    Device: { systemVersion: () => "18.0" },
    Keychain: {
      contains: () => false,
      get: () => "",
      set: () => {},
      remove: () => {}
    }
  }

  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: "CTS Analytics Client.js" })

  return module.exports
}

const ANALYTICS = loadAnalytics()
const failures = []

/*
 * Construit une exécution terminée. Les étapes non citées gardent la
 * valeur neutre que leur donne le client.
 */
function finished({ stages = {}, issues = [], status = null } = {}) {
  const run = ANALYTICS.createTelemetryRun({ executionContext: "widget" })

  for (const [stage, value] of Object.entries(stages)) {
    ANALYTICS.setTelemetryStage(run, stage, value)
  }

  for (const issue of issues) {
    ANALYTICS.addTelemetryIssue(run, issue)
  }

  if (status) {
    ANALYTICS.setTelemetryRunStatus(run, status)
  }

  return ANALYTICS.finishTelemetryRun(run)
}

function codes(run) {
  return (run.issues || []).map(issue => issue.errorCode).sort()
}

function expect(label, run, expected) {
  if (run.status !== expected) {
    failures.push(`${label} : statut « ${run.status} », attendu « ${expected} »`)
  }
}

/* Jour de repos : aucun PDF déposé, aucun service du jour. */
{
  const run = finished({
    stages: { pdf: "missing", service: "not_found" },
    issues: [
      { severity: "warning", errorCode: "PDF_NOT_FOUND", module: "WidgetEngine", stage: "source" }
    ]
  })

  expect("dossier Services vide", run, "success")

  /* L'information ne disparaît pas : la console doit continuer à la voir. */
  if (!codes(run).includes("PDF_NOT_FOUND")) {
    failures.push("dossier Services vide : l'incident PDF_NOT_FOUND a été effacé des diagnostics")
  }
}

/* Dernier service terminé, prochaine carte agent pas encore déposée. */
{
  const run = finished({ stages: { service: "not_found" } })

  expect("service terminé sans carte suivante", run, "success")
}

/* Carte agent en cours de lecture : état transitoire, pas une panne. */
{
  const run = finished({ stages: { pdf: "found", service: "not_found" } })

  expect("lecture en attente", run, "success")
}

/* Service en cours, dossier vidé après archivage : rien n'est en défaut. */
{
  const run = finished({ stages: { pdf: "missing", service: "found", render: "success" } })

  expect("service affiché, dossier vidé", run, "success")

  if (run.pdfStatus !== "not_checked") {
    failures.push(
      `service affiché, dossier vidé : pdfStatus reste « ${run.pdfStatus} » et fausse ` +
      "l'étape « PDF lu » du tableau de bord"
    )
  }
}

/*
 * PDF présent mais aucun service exploitable : là, quelque chose ne
 * fonctionne pas. L'exemption ne doit pas s'étendre à ce cas.
 */
{
  const run = finished({
    stages: { pdf: "found", service: "not_found" },
    issues: [
      { severity: "warning", errorCode: "SERVICE_NOT_FOUND", module: "WidgetEngine", stage: "service" }
    ]
  })

  expect("PDF détecté sans service exploitable", run, "warning")
}

/*
 * Un jour sans carte agent pendant lequel une vraie anomalie survient
 * reste une anomalie : l'exemption porte sur un code, pas sur l'exécution.
 */
{
  const run = finished({
    stages: { pdf: "missing", service: "not_found", archive: "error" },
    issues: [
      { severity: "warning", errorCode: "PDF_NOT_FOUND", module: "WidgetEngine", stage: "source" },
      {
        severity: "warning",
        errorCode: "REPLACED_ARCHIVE_DELETE_FAILED",
        module: "ServicesCleaner",
        stage: "archive"
      }
    ]
  })

  expect("absence de PDF accompagnée d'un échec d'archivage", run, "warning")
}

/* PDF illisible : erreur, et elle doit le rester. */
{
  const run = finished({
    stages: { pdf: "read_error", service: "not_found" },
    issues: [
      { severity: "error", errorCode: "PDF_TEXT_EXTRACTION_FAILED", module: "PDFEngine", stage: "extraction" }
    ]
  })

  expect("PDF illisible", run, "error")
}

/* Import refusé sans service en place : le moteur pose « not_found » et un incident. */
{
  const run = finished({
    stages: { pdf: "found", service: "not_found" },
    issues: [
      { severity: "error", errorCode: "HASTUS_VALIDATION_FAILED", module: "Importer", stage: "validation" }
    ]
  })

  expect("import refusé", run, "error")
}

/* Analyse impossible côté parseur. */
{
  const run = finished({ stages: { pdf: "found", parser: "error" } })

  expect("parseur en échec", run, "error")
}

/* Dessin impossible : le collègue voit un widget vide. */
{
  const run = finished({ stages: { pdf: "found", service: "found", render: "error" } })

  expect("rendu en échec", run, "error")
}

/* Index de services corrompu. */
{
  const run = finished({ stages: { service: "error" } })

  expect("index de services en erreur", run, "error")
}

/* Archivage manqué seul : avertissement conservé. */
{
  const run = finished({ stages: { pdf: "found", service: "found", archive: "error" } })

  expect("archivage en échec", run, "warning")
}

/*
 * Lecture verrouillée : un second lancement analyse déjà le PDF. Le code
 * est retiré et les étapes reviennent à leur valeur neutre — sans quoi une
 * exécution concurrente compterait deux fois.
 */
{
  const run = finished({
    stages: { pdf: "missing", service: "not_found" },
    issues: [
      { severity: "warning", errorCode: "SERVICES_SCAN_LOCKED", module: "ServicesManager", stage: "scan_lock" }
    ]
  })

  expect("analyse déjà en cours", run, "success")

  if (codes(run).length) {
    failures.push(`analyse déjà en cours : incidents résiduels ${JSON.stringify(codes(run))}`)
  }

  if (run.pdfStatus !== "not_checked" || run.serviceStatus !== "not_run") {
    failures.push(
      `analyse déjà en cours : étapes laissées à « ${run.pdfStatus} » et ` +
      `« ${run.serviceStatus} »`
    )
  }
}

/* Un statut déjà posé par le moteur ne peut pas être adouci. */
{
  const run = finished({
    stages: { pdf: "missing", service: "not_found" },
    status: "error",
    issues: [
      { severity: "warning", errorCode: "PDF_NOT_FOUND", module: "WidgetEngine", stage: "source" }
    ]
  })

  expect("statut d'erreur déjà posé", run, "error")
}

/* Exécution nominale. */
{
  const run = finished({
    stages: { pdf: "found", parser: "success", service: "found", render: "success", archive: "success" }
  })

  expect("exécution nominale", run, "success")
}

if (failures.length) {
  console.log("ÉCHEC  statut des exécutions télémétriques")
  for (const failure of failures) console.log(`         ${failure}`)
  process.exit(1)
}

console.log(
  "ok     statut des exécutions télémétriques (absence de travail, pannes réelles, " +
  "incidents conservés)"
)
