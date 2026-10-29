import { isolatedModule } from "./sandbox.mjs"

function loadAnalytics() {
  let counter = 0

  return isolatedModule("CTS Analytics Client", {
    globals: {
      UUID: { string: () => `00000000-0000-0000-0000-${String(++counter).padStart(12, "0")}` },
      Device: { systemVersion: () => "18.0" },
      Keychain: {
        contains: () => false,
        get: () => "",
        set: () => {},
        remove: () => {}
      }
    }
  })
}

const ANALYTICS = loadAnalytics()
const failures = []

function finished({ stages = {}, issues = [] } = {}) {
  const run = ANALYTICS.createTelemetryRun({ executionContext: "widget" })

  for (const [stage, value] of Object.entries(stages)) {
    ANALYTICS.setTelemetryStage(run, stage, value)
  }

  for (const issue of issues) {
    ANALYTICS.addTelemetryIssue(run, issue)
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

{
  const run = finished({
    stages: { pdf: "missing", service: "not_found" },
    issues: [
      { severity: "warning", errorCode: "PDF_NOT_FOUND", module: "WidgetEngine", stage: "source" }
    ]
  })

  expect("dossier Services vide", run, "success")

  if (!codes(run).includes("PDF_NOT_FOUND")) {
    failures.push("dossier Services vide : l'incident PDF_NOT_FOUND a été effacé des diagnostics")
  }
}

{
  const run = finished({ stages: { service: "not_found" } })

  expect("service terminé sans carte suivante", run, "success")
}

{
  const run = finished({ stages: { pdf: "found", service: "not_found" } })

  expect("lecture en attente", run, "success")
}

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

{
  const run = finished({
    stages: { pdf: "found", service: "not_found" },
    issues: [
      { severity: "warning", errorCode: "SERVICE_NOT_FOUND", module: "WidgetEngine", stage: "service" }
    ]
  })

  expect("PDF détecté sans service exploitable", run, "warning")
}

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

{
  const run = finished({
    stages: { pdf: "read_error", service: "not_found" },
    issues: [
      { severity: "error", errorCode: "PDF_TEXT_EXTRACTION_FAILED", module: "PDFEngine", stage: "extraction" }
    ]
  })

  expect("PDF illisible", run, "error")
}

{
  const run = finished({
    stages: { pdf: "found", service: "not_found" },
    issues: [
      { severity: "error", errorCode: "HASTUS_VALIDATION_FAILED", module: "Importer", stage: "validation" }
    ]
  })

  expect("import refusé", run, "error")
}

{
  const run = finished({ stages: { pdf: "found", parser: "error" } })

  expect("parseur en échec", run, "error")
}

{
  const run = finished({ stages: { pdf: "found", service: "found", render: "error" } })

  expect("rendu en échec", run, "error")
}

{
  const run = finished({ stages: { service: "error" } })

  expect("index de services en erreur", run, "error")
}

{
  const run = finished({ stages: { pdf: "found", service: "found", archive: "error" } })

  expect("archivage en échec", run, "warning")
}

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

{
  const run = finished({
    stages: { pdf: "found", parser: "success", service: "found", render: "success", archive: "success" }
  })

  expect("exécution nominale", run, "success")
}

{
  const run = ANALYTICS.createTelemetryRun({ executionContext: "widget" })

  ANALYTICS.setTelemetryDriver(run, { name: "DUPONT MARIE", id: "123456" })

  if (run.driver?.name !== "DUPONT MARIE" || run.driver?.id !== "123456") {
    failures.push(
      `le conducteur n'est pas retenu sur l'exécution : ${JSON.stringify(run.driver)}`
    )
  }

  const autre = ANALYTICS.createTelemetryRun({ executionContext: "widget" })

  ANALYTICS.setTelemetryDriver(autre, { name: "MARTIN JEAN", id: "EM76" })

  if (autre.driver?.id !== "") {
    failures.push(`un matricule non numérique est conservé : « ${autre.driver?.id} »`)
  }

  if (autre.driver?.name !== "MARTIN JEAN") {
    failures.push("un matricule invalide a emporté le nom avec lui")
  }

  const vide = ANALYTICS.createTelemetryRun({ executionContext: "widget" })

  ANALYTICS.setTelemetryDriver(vide, { name: "", id: "" })

  if (vide.driver !== null) {
    failures.push(`une identité vide est retenue : ${JSON.stringify(vide.driver)}`)
  }
}

if (failures.length) {
  console.log("ÉCHEC  statut des exécutions télémétriques")
  for (const failure of failures) console.log(`         ${failure}`)
  process.exit(1)
}

console.log(
  "ok     statut des exécutions télémétriques (absence de travail, pannes réelles, " +
  "incidents conservés, identité du conducteur)"
)
