// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: cyan; icon-glyph: bus.fill;

const SCRIPT_STARTED_AT = Date.now()
const CONFIG = importModule("CTS Config")
const UTILS = importModule("CTS Utils")
const WIDGET_ENGINE = importModule("CTS Widget Engine")
const RENDERER = importModule("CTS Widget Renderer")

const ERROR_TITLE = "Erreur du Dashboard"
const ERROR_MESSAGE = "Le widget ne peut pas être affiché."
const ERROR_REFRESH_MS = 5 * 60 * 1000
const TELEMETRY_WIDGET_WAIT_MS = 1500

const family = WIDGET_ENGINE.getWidgetFamily()
const analytics = loadAnalyticsClient()
const telemetryRun = createTelemetryRunSafely(analytics)

await main()
Script.complete()

async function main() {
  let context
  let widget

  try {
    CONFIG.ensureDirectories()
    const [loadedContext] = await Promise.all([
      WIDGET_ENGINE.loadContext(new Date()),
      registerAnalytics(analytics)
    ])
    context = loadedContext
    applyContextTelemetrySafely(analytics, telemetryRun, context?.telemetry)
  } catch (error) {
    console.warn("[Dashboard]", UTILS.errorMessage(error))
    registerTelemetryIssueSafely(analytics, telemetryRun, {
      severity: "fatal",
      errorCode: "DASHBOARD_EXECUTION_FAILED",
      module: "Dashboard",
      stage: "startup"
    })
    context = {
      valid: false,
      errorTitle: ERROR_TITLE,
      errorMessage: UTILS.errorMessage(error),
      refreshAfterDate: new Date(Date.now() + ERROR_REFRESH_MS)
    }
  }

  recordRunTrace(context)

  try {
    widget = context.valid
      ? RENDERER.createWidget(family, context)
      : context.informational
        ? RENDERER.createInfoWidget(
            context.errorTitle || "Information",
            context.errorMessage || ""
          )
        : RENDERER.createErrorWidget(
            context.errorTitle || "Erreur",
            context.errorMessage || ERROR_MESSAGE
          )
    setTelemetryStageSafely(analytics, telemetryRun, "render", "success")
  } catch (error) {
    console.warn("[Dashboard]", UTILS.errorMessage(error))
    setTelemetryStageSafely(analytics, telemetryRun, "render", "error")
    registerTelemetryIssueSafely(analytics, telemetryRun, {
      severity: "fatal",
      errorCode: "WIDGET_RENDER_FAILED",
      module: "Dashboard",
      stage: "render"
    })
    widget = RENDERER.createErrorWidget(ERROR_TITLE, ERROR_MESSAGE)
  }

  if (UTILS.isValidDate(context?.refreshAfterDate)) {
    widget.refreshAfterDate = context.refreshAfterDate
  }

  await displayWidget(
    widget,
    family,
    sendTelemetrySafely(analytics, telemetryRun)
  )
}

/*
 * Trace de la dernière exécution, relue par le Diagnostic de CTS
 * Installer.
 *
 * Elle existe parce qu'un widget est aveugle : chez un collègue il
 * affichait « Analyse en cours » pendant que le même téléphone, à la
 * même minute, montrait son service correctement depuis Scriptable. Sans
 * trace, on ne pouvait qu'émettre des hypothèses — et j'en ai proposé
 * trois, toutes fausses, avant d'écrire ces quelques lignes.
 *
 * Elle ne contient que des états internes : ni nom, ni matricule, ni
 * horaire, ni numéro de service. Les titres enregistrés sont ceux,
 * figés, que le Dashboard sait produire.
 *
 * Elle est écrite directement, sans passer par CTS Storage : attendre
 * qu'iCloud déclare disponible une trace de diagnostic n'aurait aucun
 * sens, et son échec ne doit jamais empêcher l'affichage.
 */
function recordRunTrace(context) {
  try {
    const fm = CONFIG.fm

    fm.writeString(
      fm.joinPath(CONFIG.paths.data, "last-run.json"),
      JSON.stringify({
        at: new Date().toISOString(),
        version: CONFIG.dashboardVersion,
        surface: config.runsInWidget ? "widget" : "application",
        family,
        elapsedMs: Date.now() - SCRIPT_STARTED_AT,
        displayed: context?.valid
          ? "service"
          : String(context?.errorTitle || "inconnu"),
        source: String(context?.sourceOrigin || "none"),
        scan: String(context?.servicesScan?.status || "absent"),
        detected: Number(context?.servicesScan?.detected) || 0
      })
    )
  } catch (error) {
    console.warn("[Dashboard]", UTILS.errorMessage(error))
  }
}

function loadAnalyticsClient() {
  try {
    return importModule("CTS Analytics Client")
  } catch (error) {
    console.warn("[Analytics]", UTILS.errorMessage(error))
    return null
  }
}

function createTelemetryRunSafely(client) {
  if (!client || typeof client.createTelemetryRun !== "function") return null
  try {
    const run = client.createTelemetryRun({
      executionContext: config.runsInWidget ? "widget" : "app"
    })
    run.startedAt = SCRIPT_STARTED_AT
    return run
  } catch (error) {
    console.warn("[Analytics]", UTILS.errorMessage(error))
    return null
  }
}

async function registerAnalytics(client) {
  if (!client || typeof client.registerDailyActivity !== "function") return
  try {
    const result = await client.registerDailyActivity({
      dashboardVersion: CONFIG.dashboardVersion
    })
    if (!result?.ok) {
      console.warn("[Analytics]", result?.error || "Activité non enregistrée.")
    }
  } catch (error) {
    console.warn("[Analytics]", UTILS.errorMessage(error))
  }
}

function applyContextTelemetrySafely(client, run, telemetry) {
  if (!client || !run || !telemetry || typeof telemetry !== "object") return

  for (const [stage, status] of [
    ["pdf", telemetry.pdfStatus],
    ["parser", telemetry.parserStatus],
    ["service", telemetry.serviceStatus],
    ["archive", telemetry.archiveStatus]
  ]) {
    if (typeof status === "string" && status.trim()) {
      setTelemetryStageSafely(client, run, stage, status)
    }
  }

  for (const issue of Array.isArray(telemetry.issues) ? telemetry.issues : []) {
    registerTelemetryIssueSafely(client, run, {
      severity: issue?.severity,
      errorCode: issue?.errorCode,
      module: issue?.module,
      stage: issue?.stage
    })
  }
}

function setTelemetryStageSafely(client, run, stage, status) {
  if (!client || !run || typeof client.setTelemetryStage !== "function") return
  try {
    client.setTelemetryStage(run, stage, status)
  } catch (error) {
    console.warn("[Analytics]", UTILS.errorMessage(error))
  }
}

function registerTelemetryIssueSafely(client, run, issue) {
  if (!client || !run || typeof client.addTelemetryIssue !== "function") return
  try {
    client.addTelemetryIssue(run, issue)
  } catch (error) {
    console.warn("[Analytics]", UTILS.errorMessage(error))
  }
}

async function sendTelemetrySafely(client, run) {
  if (!client || !run || typeof client.registerTelemetrySafely !== "function") {
    return { ok: true, skipped: true, reason: "telemetry_unavailable" }
  }

  try {
    const requestPromise = client.registerTelemetrySafely({
      dashboardVersion: CONFIG.dashboardVersion,
      run
    })

    const result = config.runsInWidget
      ? await Promise.race([
          requestPromise,
          UTILS.sleep(TELEMETRY_WIDGET_WAIT_MS).then(() => ({
            ok: true,
            skipped: true,
            reason: "telemetry_wait_timeout"
          }))
        ])
      : await requestPromise

    logTelemetryFailure(result)
    return result
  } catch (error) {
    console.warn("[Analytics]", UTILS.errorMessage(error))
    return { ok: false, error: UTILS.errorMessage(error) }
  }
}

function logTelemetryFailure(result) {
  if (result?.ok === false) {
    console.warn("[Analytics]", result.error || "Télémétrie non enregistrée.")
  }
}

async function displayWidget(widget, widgetFamily, telemetryPromise) {
  if (config.runsInWidget) {
    Script.setWidget(widget)
    await telemetryPromise
    return
  }
  await Promise.all([presentWidget(widget, widgetFamily), telemetryPromise])
}

async function presentWidget(widget, widgetFamily) {
  if (widgetFamily === "small") return widget.presentSmall()
  if (widgetFamily === "medium") return widget.presentMedium()
  return widget.presentLarge()
}
