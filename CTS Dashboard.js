// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: cyan; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: cyan; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: cyan; icon-glyph: bus.fill;

// CTS Dashboard.js
// Point d’entrée principal et installation automatique du projet.

const CONFIG = importModule("CTS Config")
const RESOURCES = importModule("CTS Resources")
const PDF_ENGINE = importModule("CTS PDF Engine")
const WIDGET_ENGINE = importModule("CTS Widget Engine")
const RENDERER = importModule("CTS Widget Renderer")

const ERROR_TITLE = "Erreur du Dashboard"
const ERROR_MESSAGE =
  "Le widget ne peut pas être affiché."

const ERROR_REFRESH_DELAY_MS =
  5 * 60 * 1000

const family =
  WIDGET_ENGINE.getWidgetFamily()

let context

try {
  await initializeProject()

  context =
    await WIDGET_ENGINE.loadContext(
      new Date()
    )
} catch (error) {
  context = {
    valid: false,

    errorTitle:
      ERROR_TITLE,

    errorMessage:
      getErrorMessage(error),

    refreshAfterDate:
      new Date(
        Date.now() +
        ERROR_REFRESH_DELAY_MS
      )
  }
}

const widget =
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

if (
  isValidDate(
    context.refreshAfterDate
  )
) {
  widget.refreshAfterDate =
    context.refreshAfterDate
}

await displayWidget(
  widget,
  family
)

// =====================================================
// INSTALLATION AUTOMATIQUE
// =====================================================

async function initializeProject() {
  CONFIG.ensureDirectories()

  await RESOURCES.ensureInstalled()

  await PDF_ENGINE.ensureReady()
}

// =====================================================
// OUTILS
// =====================================================

function getErrorMessage(error) {
  if (
    error &&
    typeof error.message ===
      "string" &&
    error.message.trim()
  ) {
    return error.message.trim()
  }

  return String(
    error ||
    "Erreur inconnue."
  )
}

function isValidDate(value) {
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
        break
    }
  }

  Script.complete()
}