// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: tray.and.arrow.down.fill;

// CTS Importer.js
// Importation locale des PDF HASTUS déposés dans le dossier Services.

const CONFIG = importModule("CTS Config")
const PDF_ENGINE = importModule("CTS PDF Engine")
const PARSER = importModule("CTS Parser")
const STORAGE = importModule("CTS Storage")
const DATABASE = importModule("CTS Database")
const UTILS = importModule("CTS Utils")

const {
  fm,
  paths,
  files
} = CONFIG

const INDEX_VERSION = 2

// =====================================================
// IMPORTATION D’UN PDF
// =====================================================

async function importPdf(
  pdfPath,
  options = {}
) {
  CONFIG.ensureDirectories()

  const startedAt =
    new Date().toISOString()

  let sourceInfo = null

  try {
    sourceInfo =
      await inspectSourcePdf(
        pdfPath
      )

    const extraction =
      await PDF_ENGINE.extractText(
        sourceInfo.path
      )

    await DATABASE.reload()

    const service =
      await PARSER.parseService(
        extraction.text
      )

    if (
      !service.validation.valid
    ) {
      const result =
        buildValidationFailure(
          sourceInfo,
          extraction,
          service
        )

      await STORAGE.appendLog(
        "validation-error",
        "Import PDF HASTUS refusé",
        result
      )

      return result
    }

    const registration =
      await registerImportedService(
        service,
        extraction,
        sourceInfo
      )

    const result = {
      success: true,
      status: "imported",

      startedAt,
      completedAt:
        new Date().toISOString(),

      service:
        service.service,

      date:
        service.date,

      slices:
        service.slices.length,

      warnings:
        [...service.validation.warnings],

      sourceFileName:
        sourceInfo.fileName,

      pdfFileName:
        registration.pdfFileName,

      cacheFileName:
        registration.cacheFileName,

      textFileName:
        registration.textFileName,

      indexEntry:
        registration.indexEntry,

      extraction: {
        engine:
          extraction.engine,

        engineVersion:
          extraction.engineVersion,

        pageCount:
          extraction.pageCount,

        characterCount:
          extraction.characterCount
      }
    }

    if (options.activate === true) {
      const activation =
        await activateService(
          service
        )

      result.activated =
        activation.success

      result.activationError =
        activation.error
    } else {
      result.activated = false
      result.activationError = ""
    }

    await STORAGE.appendLog(
      "success",
      "Service PDF importé",
      result
    )

    return result
  } catch (error) {
    const safeError =
      UTILS.safeError(error)

    const result = {
      success: false,
      status: "exception",

      startedAt,
      completedAt:
        new Date().toISOString(),

      sourceFileName:
        sourceInfo?.fileName || "",

      error:
        safeError.message,

      details:
        safeError
    }

    await STORAGE.appendLog(
      "exception",
      "Erreur pendant l’importation locale d’un PDF",
      result
    )

    return result
  }
}

// =====================================================
// INSPECTION DU PDF SOURCE
// =====================================================

async function inspectSourcePdf(
  pdfPath
) {
  const normalizedPath =
    String(pdfPath || "")
      .trim()

  if (!normalizedPath) {
    throw new Error(
      "Aucun chemin de PDF n’a été fourni à l’importeur."
    )
  }

  if (!fm.fileExists(normalizedPath)) {
    throw new Error(
      "Le PDF à importer est introuvable."
    )
  }

  if (fm.isDirectory(normalizedPath)) {
    throw new Error(
      "Le chemin fourni correspond à un dossier et non à un PDF."
    )
  }

  const fileName =
    fileNameFromPath(
      normalizedPath
    )

  if (!/\.pdf$/i.test(fileName)) {
    throw new Error(
      "Le fichier à importer doit être un PDF."
    )
  }

  if (
    !fm.isFileDownloaded(
      normalizedPath
    )
  ) {
    await fm.downloadFileFromiCloud(
      normalizedPath
    )
  }

  const sizeKilobytes =
    fm.fileSize(
      normalizedPath
    )

  if (
    !Number.isFinite(
      sizeKilobytes
    ) ||
    sizeKilobytes <= 0
  ) {
    throw new Error(
      "Le PDF est vide ou inaccessible."
    )
  }

  const maximumKilobytes =
    (
      Number(
        CONFIG.pdf.maximumFileSizeBytes
      ) ||
      20 * 1024 * 1024
    ) /
    1024

  if (
    sizeKilobytes >
    maximumKilobytes
  ) {
    throw new Error(
      "Le PDF dépasse la taille maximale autorisée."
    )
  }

  const modificationDate =
    safeModificationDate(
      normalizedPath
    )

  return {
    path:
      normalizedPath,

    fileName,

    sizeKilobytes,

    modifiedAt:
      modificationDate
        ? modificationDate.toISOString()
        : "",

    fingerprint:
      buildFingerprint({
        fileName,
        sizeKilobytes,
        modifiedAt:
          modificationDate
            ? modificationDate.toISOString()
            : ""
      })
  }
}

function safeModificationDate(path) {
  try {
    const value =
      fm.modificationDate(path)

    return (
      value &&
      typeof value.getTime ===
        "function" &&
      Number.isFinite(
        value.getTime()
      )
    )
      ? value
      : null
  } catch (error) {
    return null
  }
}

// =====================================================
// ENREGISTREMENT TRANSACTIONNEL
// =====================================================

async function registerImportedService(
  service,
  extraction,
  sourceInfo
) {
  const plan =
    createImportPlan(
      service,
      sourceInfo
    )

  const cacheSnapshot =
    await snapshotTextFile(
      plan.cachePath
    )

  const textSnapshot =
    await snapshotTextFile(
      plan.textPath
    )

  const indexSnapshot =
    await snapshotTextFile(
      files.servicesIndex
    )

  let pdfTransaction = null

  try {
    await STORAGE.writeJsonSafely(
      plan.cachePath,
      service
    )

    await writeTextSafely(
      plan.textPath,
      extraction.text
    )

    pdfTransaction =
      await movePdfToCanonicalName(
        plan
      )

    const index =
      await buildUpdatedIndex(
        plan,
        service,
        extraction,
        sourceInfo,
        pdfTransaction.fileName
      )

    await STORAGE.writeJsonSafely(
      files.servicesIndex,
      index
    )

    const indexEntry =
      index.services.find(
        entry =>
          entry.id === plan.id
      ) || null

    return {
      id:
        plan.id,

      pdfFileName:
        pdfTransaction.fileName,

      cacheFileName:
        plan.cacheFileName,

      textFileName:
        plan.textFileName,

      indexEntry
    }
  } catch (error) {
    await restoreTextFile(
      files.servicesIndex,
      indexSnapshot
    )

    if (pdfTransaction) {
      await pdfTransaction.rollback()
    }

    await restoreTextFile(
      plan.textPath,
      textSnapshot
    )

    await restoreTextFile(
      plan.cachePath,
      cacheSnapshot
    )

    throw error
  }
}

// =====================================================
// PLAN D’IMPORTATION
// =====================================================

function createImportPlan(
  service,
  sourceInfo
) {
  const date =
    String(
      service.date || ""
    ).trim()

  if (!UTILS.parseDate(date)) {
    throw new Error(
      "La date détectée dans le PDF est invalide."
    )
  }

  const serviceNumber =
    sanitizeServiceNumber(
      service.service
    )

  if (!serviceNumber) {
    throw new Error(
      "Le numéro de service détecté est invalide."
    )
  }

  const stem =
    `Service_${date}_${serviceNumber}`

  const pdfFileName =
    `${stem}.pdf`

  const cacheFileName =
    `${stem}.json`

  const textFileName =
    `${stem}.txt`

  return {
    id:
      `${date}_${serviceNumber}`,

    date,
    serviceNumber,

    sourcePath:
      sourceInfo.path,

    sourceFileName:
      sourceInfo.fileName,

    pdfFileName,

    pdfPath:
      fm.joinPath(
        paths.services,
        pdfFileName
      ),

    cacheFileName,

    cachePath:
      fm.joinPath(
        paths.servicesCache,
        cacheFileName
      ),

    textFileName,

    textPath:
      fm.joinPath(
        paths.servicesTextCache,
        textFileName
      )
  }
}

function sanitizeServiceNumber(
  value
) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(
      /[^A-Z0-9_-]/g,
      ""
    )
}

// =====================================================
// RENOMMAGE CANONIQUE DU PDF
// =====================================================

async function movePdfToCanonicalName(
  plan
) {
  if (
    plan.sourcePath ===
    plan.pdfPath
  ) {
    return {
      fileName:
        plan.pdfFileName,

      rollback:
        async () => {}
    }
  }

  let archivedPreviousPath = ""

  if (
    fm.fileExists(
      plan.pdfPath
    )
  ) {
    if (
      !fm.isFileDownloaded(
        plan.pdfPath
      )
    ) {
      await fm.downloadFileFromiCloud(
        plan.pdfPath
      )
    }

    archivedPreviousPath =
      getUniqueArchivePath(
        [
          "Remplace",
          timestampForFileName(),
          plan.pdfFileName
        ].join("_")
      )

    fm.move(
      plan.pdfPath,
      archivedPreviousPath
    )
  }

  try {
    fm.move(
      plan.sourcePath,
      plan.pdfPath
    )
  } catch (error) {
    restoreArchivedPreviousPdf(
      archivedPreviousPath,
      plan.pdfPath
    )

    throw error
  }

  return {
    fileName:
      plan.pdfFileName,

    rollback:
      async () => {
        try {
          if (
            fm.fileExists(
              plan.pdfPath
            ) &&
            !fm.fileExists(
              plan.sourcePath
            )
          ) {
            fm.move(
              plan.pdfPath,
              plan.sourcePath
            )
          }

          restoreArchivedPreviousPdf(
            archivedPreviousPath,
            plan.pdfPath
          )
        } catch (rollbackError) {
          // L’erreur principale reste prioritaire.
        }
      }
  }
}

function restoreArchivedPreviousPdf(
  archivedPath,
  canonicalPath
) {
  if (
    archivedPath &&
    fm.fileExists(
      archivedPath
    ) &&
    !fm.fileExists(
      canonicalPath
    )
  ) {
    fm.move(
      archivedPath,
      canonicalPath
    )
  }
}

function getUniqueArchivePath(
  fileName
) {
  let candidate =
    fm.joinPath(
      paths.servicesArchive,
      fileName
    )

  let suffix = 2

  while (
    fm.fileExists(
      candidate
    )
  ) {
    const extensionIndex =
      fileName
        .toLowerCase()
        .lastIndexOf(
          ".pdf"
        )

    const baseName =
      extensionIndex >= 0
        ? fileName.slice(
            0,
            extensionIndex
          )
        : fileName

    candidate =
      fm.joinPath(
        paths.servicesArchive,
        `${baseName}_${suffix}.pdf`
      )

    suffix++
  }

  return candidate
}

// =====================================================
// INDEX DES SERVICES
// =====================================================

async function buildUpdatedIndex(
  plan,
  service,
  extraction,
  sourceInfo,
  pdfFileName
) {
  const current =
    await readCurrentIndex()

  const previousEntry =
    current.services.find(
      entry =>
        entry.id === plan.id
    ) || null

  const now =
    new Date().toISOString()

  const entry = {
    id:
      plan.id,

    date:
      plan.date,

    service:
      plan.serviceNumber,

    pdfFile:
      pdfFileName ||
      previousEntry?.pdfFile ||
      "",

    cacheFile:
      plan.cacheFileName,

    textFile:
      plan.textFileName,

    importedAt:
      service.importedAt ||
      now,

    indexedAt:
      now,

    warnings:
      service.validation.warnings.length,

    slices:
      service.slices.length,

    firstDutyStart:
      service.slices[0]?.dutyStart ||
      "",

    lastEnd:
      service.slices[
        service.slices.length - 1
      ]?.end || "",

    source: {
      originalFileName:
        sourceInfo.fileName,

      sizeKilobytes:
        sourceInfo.sizeKilobytes,

      modifiedAt:
        sourceInfo.modifiedAt,

      fingerprint:
        sourceInfo.fingerprint
    },

    extraction: {
      engine:
        extraction.engine,

      engineVersion:
        extraction.engineVersion,

      pageCount:
        extraction.pageCount,

      characterCount:
        extraction.characterCount
    }
  }

  const services =
    current.services
      .filter(
        item =>
          item.id !== plan.id
      )
      .concat(entry)
      .sort(
        compareIndexEntries
      )

  return {
    version:
      INDEX_VERSION,

    updatedAt:
      now,

    services
  }
}

async function readCurrentIndex() {
  const exists =
    fm.fileExists(
      files.servicesIndex
    )

  const value =
    await STORAGE.readJson(
      files.servicesIndex,
      null
    )

  if (!exists) {
    return {
      version:
        INDEX_VERSION,

      updatedAt:
        "",

      services:
        []
    }
  }

  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Array.isArray(
      value.services
    )
  ) {
    throw new Error(
      "L’index des services est invalide. Il n’a pas été remplacé."
    )
  }

  return {
    version:
      Number(
        value.version
      ) ||
      INDEX_VERSION,

    updatedAt:
      String(
        value.updatedAt || ""
      ),

    services:
      value.services.filter(
        entry =>
          entry &&
          typeof entry ===
            "object" &&
          !Array.isArray(entry)
      )
  }
}

function compareIndexEntries(
  first,
  second
) {
  const byDate =
    String(first.date)
      .localeCompare(
        String(second.date)
      )

  if (byDate !== 0) {
    return byDate
  }

  return String(
    first.service
  ).localeCompare(
    String(second.service)
  )
}

// =====================================================
// ACTIVATION D’UN SERVICE
// =====================================================

async function activateService(
  service
) {
  try {
    await STORAGE.saveService(
      service
    )

    return {
      success: true,
      error: ""
    }
  } catch (error) {
    const safeError =
      UTILS.safeError(error)

    return {
      success: false,
      error:
        safeError.message
    }
  }
}

// =====================================================
// ÉCHEC DE VALIDATION
// =====================================================

function buildValidationFailure(
  sourceInfo,
  extraction,
  service
) {
  return {
    success: false,
    status:
      "validation-error",

    completedAt:
      new Date().toISOString(),

    sourceFileName:
      sourceInfo.fileName,

    service:
      service.service || "",

    date:
      service.date || "",

    errors:
      [...service.validation.errors],

    warnings:
      [...service.validation.warnings],

    extraction: {
      engine:
        extraction.engine,

      engineVersion:
        extraction.engineVersion,

      pageCount:
        extraction.pageCount,

      characterCount:
        extraction.characterCount
    }
  }
}

// =====================================================
// ÉCRITURES ET RESTAURATIONS
// =====================================================

async function writeTextSafely(
  path,
  value
) {
  const temporaryPath =
    `${path}.import-${Date.now()}`

  try {
    fm.writeString(
      temporaryPath,
      String(value || "")
    )

    if (
      fm.fileExists(path)
    ) {
      fm.remove(path)
    }

    fm.move(
      temporaryPath,
      path
    )
  } catch (error) {
    removeFileQuietly(
      temporaryPath
    )

    throw error
  }
}

async function snapshotTextFile(
  path
) {
  if (!fm.fileExists(path)) {
    return {
      existed: false,
      content: ""
    }
  }

  if (
    !fm.isFileDownloaded(path)
  ) {
    await fm.downloadFileFromiCloud(
      path
    )
  }

  return {
    existed: true,
    content:
      fm.readString(path)
  }
}

async function restoreTextFile(
  path,
  snapshot
) {
  try {
    if (snapshot.existed) {
      fm.writeString(
        path,
        snapshot.content
      )

      return
    }

    if (
      fm.fileExists(path)
    ) {
      fm.remove(path)
    }
  } catch (restoreError) {
    // La transaction principale reste prioritaire.
  }
}

// =====================================================
// OUTILS INTERNES
// =====================================================

function buildFingerprint({
  fileName,
  sizeKilobytes,
  modifiedAt
}) {
  return [
    String(fileName || "")
      .toLowerCase(),

    Number(sizeKilobytes) || 0,

    String(modifiedAt || "")
  ].join("|")
}

function fileNameFromPath(path) {
  return String(path || "")
    .split(/[\\/]/)
    .pop()
    .trim()
}

function timestampForFileName() {
  return new Date()
    .toISOString()
    .replace(
      /[-:]/g,
      ""
    )
    .replace(
      /\.\d{3}Z$/,
      "Z"
    )
}

function removeFileQuietly(path) {
  try {
    if (
      path &&
      fm.fileExists(path)
    ) {
      fm.remove(path)
    }
  } catch (error) {}
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  importPdf,
  activateService,
  readCurrentIndex
}