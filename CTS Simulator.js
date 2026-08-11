// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: clock.arrow.circlepath;

// CTS Simulator.js
// Outil de maintenance : affiche le widget CTS Dashboard tel qu'il serait
// à une date et une heure choisies, sans rien modifier sur l'iPhone.
//
// Ce script n'est PAS distribué par CTS Installer. Il ne figure pas dans
// version.json et n'est installé que par le mainteneur.
//
// IMPORTANT : ce script est strictement en lecture. Il n'appelle jamais
// CTS Widget Engine.loadContext, qui enchaîne l'analyse du dossier
// Services puis l'archivage. Simuler une date future déclencherait sinon
// l'archivage et la suppression de vrais PDF.

const CONFIG = importModule("CTS Config")
const SERVICE_ENGINE = importModule("CTS Service")
const SERVICES_MANAGER = importModule("CTS Services Manager")
const STORAGE = importModule("CTS Storage")
const RENDERER = importModule("CTS Widget Renderer")
const UTILS = importModule("CTS Utils")

await main()
Script.complete()

async function main() {
  let simulatedDate = new Date()

  for (;;) {
    const picked = await pickDate(simulatedDate)
    if (!picked) return

    simulatedDate = picked
    const context = await buildContext(simulatedDate)

    const widget = context.valid
      ? RENDERER.createWidget("large", context)
      : RENDERER.createErrorWidget(context.errorTitle, context.errorMessage)

    await widget.presentLarge()

    if (!await askAnotherTime(simulatedDate, context)) return
  }
}

async function pickDate(initialDate) {
  const picker = new DatePicker()
  picker.initialDate = initialDate

  try {
    const value = await picker.pickDateAndTime()
    return UTILS.isValidDate(value) ? value : null
  } catch (_) {
    return null
  }
}

/*
 * Reconstruit le contexte du widget à partir des seules fonctions de
 * lecture. resolveServiceForDate lit l'index et le cache des services :
 * la sélection réellement utilisée par le widget est donc testée aussi.
 */
async function buildContext(currentDate) {
  CONFIG.ensureDirectories()

  let selection = null

  try {
    selection = await SERVICES_MANAGER.resolveServiceForDate(currentDate)
  } catch (error) {
    return failure("Sélection impossible", UTILS.errorMessage(error))
  }

  const source = selection?.found && selection.source
    ? selection.source
    : await STORAGE.loadService()

  if (!source) {
    return failure(
      "Aucun service",
      "Aucun service indexé ne correspond à cette date."
    )
  }

  const normalized = SERVICE_ENGINE.normalizeService(source)

  if (!normalized.valid) {
    return failure("Service invalide", normalized.error)
  }

  const service = normalized.service
  const state = SERVICE_ENGINE.computeState(service, currentDate)
  const stats = SERVICE_ENGINE.computeStats(service)
  const displaySlice = SERVICE_ENGINE.getDisplaySlice(service, state)

  if (!displaySlice) {
    return failure(
      "Service invalide",
      "Aucune tranche ne peut être affichée."
    )
  }

  return {
    valid: true,
    errorTitle: "",
    errorMessage: "",
    service,
    state,
    stats,
    displaySlice,
    currentDate,
    selectionReason: String(selection?.reason || "aucune")
  }
}

async function askAnotherTime(simulatedDate, context) {
  const alert = new Alert()
  alert.title = "Simulation"

  alert.message = [
    `Heure simulée : ${formatDateTime(simulatedDate)}`,
    "",
    context.valid
      ? [
          `Service : ${context.service.number}`,
          `Date du service : ${context.service.date}`,
          `État : ${context.state.label}`,
          `Sélection : ${context.selectionReason}`
        ].join("\n")
      : `${context.errorTitle} — ${context.errorMessage}`,
    "",
    "Aucune donnée n'a été modifiée."
  ].join("\n")

  alert.addAction("Tester une autre heure")
  alert.addCancelAction("Terminer")

  return await alert.presentSheet() === 0
}

function formatDateTime(date) {
  const formatter = new DateFormatter()
  formatter.locale = "fr_FR"
  formatter.dateFormat = "EEEE d MMMM yyyy 'à' HH:mm"
  return formatter.string(date)
}

function failure(title, message) {
  return {
    valid: false,
    errorTitle: String(title || "Erreur"),
    errorMessage: String(message || "Une erreur inconnue est survenue."),
    service: null,
    state: null,
    stats: null,
    displaySlice: null,
    selectionReason: "aucune"
  }
}
