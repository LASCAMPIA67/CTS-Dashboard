// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: tray.and.arrow.down.fill;

const UTILS = importModule("CTS Utils")

async function importPdf(pdfPath) {
  return pipeline().importPdf(pdfPath)
}

function pipeline() {
  let module
  try {
    module = importModule("CTS Import Pipeline")
  } catch (error) {
    throw UTILS.createTelemetryError(
      "IMPORT_PIPELINE_UNAVAILABLE",
      "import",
      `CTS Import Pipeline est absent ou illisible : ${UTILS.errorMessage(error)}`,
      error
    )
  }

  if (!module || typeof module.importPdf !== "function") {
    throw UTILS.createTelemetryError(
      "IMPORT_PIPELINE_UNAVAILABLE",
      "import",
      "CTS Import Pipeline est absent ou invalide."
    )
  }
  return module
}

module.exports = { importPdf }
