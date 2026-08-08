// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: cyan; icon-glyph: bus.fill;

const SCRIPT_STARTED_AT =
  Date.now()

const CONFIG =
  importModule(
    "CTS Config"
  )

const RESOURCES =
  importModule(
    "CTS Resources"
  )

const PDF_ENGINE =
  importModule(
    "CTS PDF Engine"
  )

const WIDGET_ENGINE =
  importModule(
    "CTS Widget Engine"
  )

const RENDERER =
  importModule(
    "CTS Widget Renderer"
  )


const ERROR_TITLE =
  "Erreur du Dashboard"

const ERROR_MESSAGE =
  "Le widget ne peut pas être affiché."

const ERROR_REFRESH_MS =
  5 * 60 * 1000

const TELEMETRY_WIDGET_WAIT_MS =
  1500


const family =
  WIDGET_ENGINE
    .getWidgetFamily()


const analytics =
  loadAnalyticsClient()


const telemetryRun =
  createTelemetryRunSafely(
    analytics
  )


await main()

Script.complete()



async function main() {
  let context
  let widget

  try {
    await initializeProject()

    const [loadedContext] =
      await Promise.all([
        WIDGET_ENGINE
          .loadContext(
            new Date()
          ),

        registerAnalytics(
          analytics
        )
      ])

    context =
      loadedContext

  } catch (error) {
    console.warn(
      "[Dashboard]",
      messageOf(error)
    )

    registerTelemetryIssueSafely(
      analytics,
      telemetryRun,
      {
        severity:
          "fatal",

        errorCode:
          "DASHBOARD_EXECUTION_FAILED",

        module:
          "Dashboard",

        stage:
          "startup"
      }
    )

    context = {
      valid:
        false,

      errorTitle:
        ERROR_TITLE,

      errorMessage:
        messageOf(error),

      refreshAfterDate:
        new Date(
          Date.now() +
          ERROR_REFRESH_MS
        )
    }
  }


  try {
    widget =
      context.valid
        ? RENDERER.createWidget(
            family,
            context
          )
        : RENDERER.createErrorWidget(
            context.errorTitle ||
              "Erreur",

            context.errorMessage ||
              ERROR_MESSAGE
          )

  } catch (error) {
    console.warn(
      "[Dashboard]",
      messageOf(error)
    )

    registerTelemetryIssueSafely(
      analytics,
      telemetryRun,
      {
        severity:
          "fatal",

        errorCode:
          "WIDGET_RENDER_FAILED",

        module:
          "Dashboard",

        stage:
          "render"
      }
    )

    widget =
      RENDERER.createErrorWidget(
        ERROR_TITLE,
        ERROR_MESSAGE
      )
  }


  if (
    isValidDate(
      context
        ?.refreshAfterDate
    )
  ) {
    widget.refreshAfterDate =
      context.refreshAfterDate
  }


  const telemetryPromise =
    sendTelemetrySafely(
      analytics,
      telemetryRun
    )


  await displayWidget(
    widget,
    family,
    telemetryPromise
  )
}



async function initializeProject() {
  CONFIG.ensureDirectories()

  await RESOURCES
    .ensureInstalled()

  await PDF_ENGINE
    .ensureReady()
}



function loadAnalyticsClient() {
  try {
    return importModule(
      "CTS Analytics Client"
    )
  } catch (error) {
    console.warn(
      "[Analytics]",
      messageOf(error)
    )

    return null
  }
}



function createTelemetryRunSafely(
  client
) {
  if (
    !client ||
    typeof client
      .createTelemetryRun !==
      "function"
  ) {
    return null
  }


  try {
    const run =
      client.createTelemetryRun({
        executionContext:
          config.runsInWidget
            ? "widget"
            : "app"
      })


    /*
     * On remplace le point de départ
     * créé par le Client par le véritable
     * début d'exécution de CTS Dashboard.
     *
     * La durée mesurée comprend donc aussi
     * le chargement des modules principaux.
     */
    run.startedAt =
      SCRIPT_STARTED_AT


    return run

  } catch (error) {
    console.warn(
      "[Analytics]",
      messageOf(error)
    )

    return null
  }
}



async function registerAnalytics(
  client
) {
  if (
    !client ||
    typeof client
      .registerDailyActivity !==
      "function"
  ) {
    return
  }


  try {
    const result =
      await client
        .registerDailyActivity({
          dashboardVersion:
            CONFIG
              .dashboardVersion
        })


    if (
      !result?.ok
    ) {
      console.warn(
        "[Analytics]",
        result?.error ||
          "Activité non enregistrée."
      )
    }

  } catch (error) {
    console.warn(
      "[Analytics]",
      messageOf(error)
    )
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
    typeof client
      .addTelemetryIssue !==
      "function"
  ) {
    return
  }


  try {
    client.addTelemetryIssue(
      run,
      issue
    )

  } catch (error) {
    console.warn(
      "[Analytics]",
      messageOf(error)
    )
  }
}



async function sendTelemetrySafely(
  client,
  run
) {
  if (
    !client ||
    !run ||
    typeof client
      .registerTelemetrySafely !==
      "function"
  ) {
    return {
      ok:
        true,

      skipped:
        true,

      reason:
        "telemetry_unavailable"
    }
  }


  try {
    const requestPromise =
      client
        .registerTelemetrySafely({
          dashboardVersion:
            CONFIG
              .dashboardVersion,

          run
        })


    /*
     * Dans un widget, Analytics ne doit
     * jamais pouvoir retarder excessivement
     * l'affichage.
     *
     * On laisse jusqu'à 1,5 seconde au
     * réseau. Le Dashboard reste prioritaire.
     */
    if (
      config.runsInWidget
    ) {
      const result =
        await Promise.race([
          requestPromise,

          delay(
            TELEMETRY_WIDGET_WAIT_MS
          ).then(
            () => ({
              ok:
                true,

              skipped:
                true,

              reason:
                "telemetry_wait_timeout"
            })
          )
        ])


      if (
        result &&
        result.ok === false
      ) {
        console.warn(
          "[Analytics]",
          result.error ||
            "Télémétrie non enregistrée."
        )
      }


      return result
    }


    const result =
      await requestPromise


    if (
      result &&
      result.ok === false
    ) {
      console.warn(
        "[Analytics]",
        result.error ||
          "Télémétrie non enregistrée."
      )
    }


    return result

  } catch (error) {
    console.warn(
      "[Analytics]",
      messageOf(error)
    )

    return {
      ok:
        false,

      error:
        messageOf(error)
    }
  }
}



function messageOf(
  error
) {
  return (
    error?.message
      ?.trim?.() ||
    String(
      error ||
        "Erreur inconnue."
    )
  )
}



function isValidDate(
  value
) {
  return Boolean(
    value &&
    typeof value.getTime ===
      "function" &&
    Number.isFinite(
      value.getTime()
    )
  )
}



async function displayWidget(
  widget,
  widgetFamily,
  telemetryPromise
) {
  if (
    config.runsInWidget
  ) {
    /*
     * Le widget est transmis immédiatement
     * à Scriptable avant d'attendre Analytics.
     */
    Script.setWidget(
      widget
    )


    await telemetryPromise

    return
  }


  /*
   * En exécution manuelle dans Scriptable,
   * l'envoi Analytics se fait en parallèle
   * de l'aperçu.
   */
  await Promise.all([
    presentWidget(
      widget,
      widgetFamily
    ),

    telemetryPromise
  ])
}



async function presentWidget(
  widget,
  widgetFamily
) {
  switch (
    widgetFamily
  ) {
    case "small":
      await widget
        .presentSmall()
      break


    case "medium":
      await widget
        .presentMedium()
      break


    default:
      await widget
        .presentLarge()
  }
}



function delay(
  milliseconds
) {
  return new Promise(
    resolve =>
      Timer.schedule(
        milliseconds,
        false,
        resolve
      )
  )
}