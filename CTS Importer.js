// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: tray.and.arrow.down.fill;

const STORAGE = importModule("CTS Storage")
const UTILS = importModule("CTS Utils")

async function importPdf(pdfPath, options = {}) {
  return pipeline().importPdf(pdfPath, options)
}

/*
 * Passée à CTS Storage, et non au pipeline comme importPdf : lire l'index
 * n'a aucun besoin de la machinerie d'importation, et le widget passe par
 * ici pour afficher le service du jour.
 */
async function readCurrentIndex() {
  return STORAGE.readCurrentIndex()
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

module.exports = { importPdf, readCurrentIndex }
