// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: cyan; icon-glyph: bus.fill;

const CONFIG = importModule("CTS Config")
const RESOURCES = importModule("CTS Resources")
const PDF_ENGINE = importModule("CTS PDF Engine")
const WIDGET_ENGINE = importModule("CTS Widget Engine")
const RENDERER = importModule("CTS Widget Renderer")

const ERROR_TITLE = "Erreur du Dashboard"
const ERROR_MESSAGE = "Le widget ne peut pas être affiché."
const ERROR_REFRESH_MS = 5 * 60 * 1000

const family = WIDGET_ENGINE.getWidgetFamily()
let context

try {
  await initializeProject()

  const [loadedContext] = await Promise.all([
    WIDGET_ENGINE.loadContext(new Date()),
    registerAnalytics()
  ])

  context = loadedContext
} catch (error) {
  context = {
    valid: false,
    errorTitle: ERROR_TITLE,
    errorMessage: messageOf(error),
    refreshAfterDate: new Date(
      Date.now() + ERROR_REFRESH_MS
    )
  }
}

const widget = context.valid
  ? RENDERER.createWidget(
      family,
      context
    )
  : RENDERER.createErrorWidget(
      context.errorTitle || "Erreur",
      context.errorMessage || ERROR_MESSAGE
    )

if (isValidDate(context.refreshAfterDate)) {
  widget.refreshAfterDate =
    context.refreshAfterDate
}

await displayWidget(widget, family)

async function initializeProject() {
  CONFIG.ensureDirectories()
  await RESOURCES.ensureInstalled()
  await PDF_ENGINE.ensureReady()
}

async function registerAnalytics() {
  try {
    const analytics = importModule(
      "CTS Analytics Client"
    )

    const result =
      await analytics.registerDailyActivity({
        dashboardVersion:
          CONFIG.dashboardVersion
      })

    if (!result?.ok) {
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

function messageOf(error) {
  return (
    error?.message?.trim?.() ||
    String(
      error ||
        "Erreur inconnue."
    )
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
  widgetFamily
) {
  if (config.runsInWidget) {
    Script.setWidget(widget)
  } else {
    switch (widgetFamily) {
      case "small":
        await widget.presentSmall()
        break

      case "medium":
        await widget.presentMedium()
        break

      default:
        await widget.presentLarge()
    }
  }

  Script.complete()
}
