// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: cyan; icon-glyph: bus.fill;

const SCRIPT_STARTED_AT = Date.now()

const CONFIG = importModule("CTS Config")
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

    applyContextTelemetrySafely(
      analytics,
      telemetryRun,
      context?.telemetry
    )
  } catch (error) {
    console.warn("[Dashboard]", messageOf(error))

    registerTelemetryIssueSafely(
      analytics,
      telemetryRun,
      {
        severity: "fatal",
        errorCode: "DASHBOARD_EXECUTION_FAILED",
        module: "Dashboard",
        stage: "startup"
      }
    )

    context = {
      valid: false,
      errorTitle: ERROR_TITLE,
      errorMessage: messageOf(error),
      refreshAfterDate: new Date(
        Date.now() + ERROR_REFRESH_MS
      )
    }
  }

  try {
    widget = context.valid
      ? RENDERER.createWidget(family, context)
      : RENDERER.createErrorWidget(
          context.errorTitle || "Erreur",
          context.errorMessage || ERROR_MESSAGE
        )

    setTelemetryStageSafely(
      analytics,
      telemetryRun,
      "render",
      "success"
    )
  } catch (error) {
    console.warn("[Dashboard]", messageOf(error))

    setTelemetryStageSafely(
      analytics,
      telemetryRun,
      "render",
      "error"
    )

    registerTelemetryIssueSafely(
      analytics,
      telemetryRun,
      {
        severity: "fatal",
        errorCode: "WIDGET_RENDER_FAILED",
        module: "Dashboard",
        stage: "render"
      }
    )

    widget = RENDERER.createErrorWidget(
      ERROR_TITLE,
      ERROR_MESSAGE
    )
  }

  if (isValidDate(context?.refreshAfterDate)) {
    widget.refreshAfterDate = context.refreshAfterDate
  }

  const telemetryPromise = sendTelemetrySafely(
    analytics,
    telemetryRun
  )

  await displayWidget(
    widget,
    family,
    telemetryPromise
  )
}

function loadAnalyticsClient() {
  try {
    return importModule("CTS Analytics Client")
  } catch (error) {
    console.warn("[Analytics]", messageOf(error))
    return null
  }
}

function createTelemetryRunSafely(client) {
  if (
    !client ||
    typeof client.createTelemetryRun !== "function"
  ) {
    return null
  }

  try {
    const run = client.createTelemetryRun({
      executionContext: config.runsInWidget
        ? "widget"
        : "app"
    })

    run.startedAt = SCRIPT_STARTED_AT
    return run
  } catch (error) {
    console.warn("[Analytics]", messageOf(error))
    return null
  }
}

async function registerAnalytics(client) {
  if (
    !client ||
    typeof client.registerDailyActivity !== "function"
  ) {
    return
  }

  try {
    const result = await client.registerDailyActivity({
      dashboardVersion: CONFIG.dashboardVersion
    })

    if (!result?.ok) {
      console.warn(
        "[Analytics]",
        result?.error || "Activité non enregistrée."
      )
    }
  } catch (error) {
    console.warn("[Analytics]", messageOf(error))
  }
}

function applyContextTelemetrySafely(
  client,
  run,
  telemetry
) {
  if (
    !client ||
    !run ||
    !telemetry ||
    typeof telemetry !== "object"
  ) {
    return
  }

  const stages = [
    ["pdf", telemetry.pdfStatus],
    ["parser", telemetry.parserStatus],
    ["service", telemetry.serviceStatus],
    ["archive", telemetry.archiveStatus]
  ]

  for (const [stage, status] of stages) {
    if (typeof status === "string" && status.trim()) {
      setTelemetryStageSafely(
        client,
        run,
        stage,
        status
      )
    }
  }

  const issues = Array.isArray(telemetry.issues)
    ? telemetry.issues
    : []

  for (const issue of issues) {
    registerTelemetryIssueSafely(
      client,
      run,
      {
        severity: issue?.severity,
        errorCode: issue?.errorCode,
        module: issue?.module,
        stage: issue?.stage
      }
    )
  }
}

function setTelemetryStageSafely(
  client,
  run,
  stage,
  status
) {
  if (
    !client ||
    !run ||
    typeof client.setTelemetryStage !== "function"
  ) {
    return
  }

  try {
    client.setTelemetryStage(run, stage, status)
  } catch (error) {
    console.warn("[Analytics]", messageOf(error))
  }
}

function registerTelemetryIssueSafely(
  client,
  run,
  issue
) {
  if (
    !client ||
    !run ||
    typeof client.addTelemetryIssue !== "function"
  ) {
    return
  }

  try {
    client.addTelemetryIssue(run, issue)
  } catch (error) {
    console.warn("[Analytics]", messageOf(error))
  }
}

async function sendTelemetrySafely(client, run) {
  if (
    !client ||
    !run ||
    typeof client.registerTelemetrySafely !== "function"
  ) {
    return {
      ok: true,
      skipped: true,
      reason: "telemetry_unavailable"
    }
  }

  try {
    const requestPromise =
      client.registerTelemetrySafely({
        dashboardVersion: CONFIG.dashboardVersion,
        run
      })

    if (config.runsInWidget) {
      const result = await Promise.race([
        requestPromise,
        delay(TELEMETRY_WIDGET_WAIT_MS).then(
          () => ({
            ok: true,
            skipped: true,
            reason: "telemetry_wait_timeout"
          })
        )
      ])

      logTelemetryFailure(result)
      return result
    }

    const result = await requestPromise
    logTelemetryFailure(result)
    return result
  } catch (error) {
    console.warn("[Analytics]", messageOf(error))

    return {
      ok: false,
      error: messageOf(error)
    }
  }
}

function logTelemetryFailure(result) {
  if (result?.ok === false) {
    console.warn(
      "[Analytics]",
      result.error || "Télémétrie non enregistrée."
    )
  }
}

function messageOf(error) {
  return (
    error?.message?.trim?.() ||
    String(error || "Erreur inconnue.")
  )
}

function isValidDate(value) {
  return Boolean(
    value &&
    typeof value.getTime === "function" &&
    Number.isFinite(value.getTime())
  )
}

async function displayWidget(
  widget,
  widgetFamily,
  telemetryPromise
) {
  if (config.runsInWidget) {
    Script.setWidget(widget)
    await telemetryPromise
    return
  }

  await Promise.all([
    presentWidget(widget, widgetFamily),
    telemetryPromise
  ])
}

async function presentWidget(widget, widgetFamily) {
  if (widgetFamily === "small") {
    await widget.presentSmall()
    return
  }

  if (widgetFamily === "medium") {
    await widget.presentMedium()
    return
  }

  await widget.presentLarge()
}

function delay(milliseconds) {
  return new Promise(resolve =>
    Timer.schedule(
      milliseconds,
      false,
      resolve
    )
  )
}
