// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: tray.and.arrow.down.fill;

// CTS Importer.js
// Façade légère : l’import PDF lourd n’est chargé qu’en cas de besoin.

const CONFIG = importModule("CTS Config")
const STORAGE = importModule("CTS Storage")

const INDEX_VERSION = 2

async function importPdf(pdfPath, options = {}) {
  return pipeline().importPdf(pdfPath, options)
}

async function activateService(service) {
  return pipeline().activateService(service)
}

async function readCurrentIndex() {
  const exists = CONFIG.fm.fileExists(
    CONFIG.files.servicesIndex
  )

  const value = await STORAGE.readJson(
    CONFIG.files.servicesIndex,
    null
  )

  if (!exists) {
    return {
      version: INDEX_VERSION,
      updatedAt: "",
      services: []
    }
  }

  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Array.isArray(value.services)
  ) {
    throw createIndexError(
      "SERVICE_INDEX_INVALID",
      "L’index des services est invalide. Il n’a pas été remplacé."
    )
  }

  return {
    version: Number(value.version) || INDEX_VERSION,
    updatedAt: String(value.updatedAt || ""),
    services: value.services.filter(
      entry =>
        entry &&
        typeof entry === "object" &&
        !Array.isArray(entry)
    )
  }
}

function pipeline() {
  const module = importModule("CTS Import Pipeline")

  if (
    !module ||
    typeof module.importPdf !== "function" ||
    typeof module.activateService !== "function"
  ) {
    throw new Error(
      "CTS Import Pipeline est absent ou invalide."
    )
  }

  return module
}

function createIndexError(code, message) {
  const error = new Error(message)
  error.telemetryCode = code
  error.telemetryStage = "index"
  return error
}

module.exports = {
  importPdf,
  activateService,
  readCurrentIndex
}
