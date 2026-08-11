// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: tray.and.arrow.down.fill;

// CTS Import Pipeline.js
// Pipeline lourd d’import PDF HASTUS. Chargé uniquement lorsqu’un PDF doit être importé.

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

async function importPdf(pdfPath, options = {}) {
  CONFIG.ensureDirectories()

  const startedAt = new Date().toISOString()
  const startedAtMs = Date.now()
  const timings = {
    sourceInspectionMs: null,
    pdfExtractionMs: null,
    databaseReloadMs: null,
    parserMs: null,
    registrationMs: null,
    totalMs: null
  }

  let sourceInfo = null

  try {
    let stageStartedAt = Date.now()

    sourceInfo = await inspectSourcePdf(pdfPath)
    timings.sourceInspectionMs = elapsedMs(stageStartedAt)

    stageStartedAt = Date.now()

    const extraction = await withTelemetryError(
      () => PDF_ENGINE.extractText(sourceInfo.path),
      "PDF_EXTRACTION_FAILED",
      "extraction",
      "L’extraction du texte du PDF a échoué."
    )

    timings.pdfExtractionMs = elapsedMs(stageStartedAt)

    stageStartedAt = Date.now()

    await withTelemetryError(
      () => DATABASE.reload(),
      "DATABASE_RELOAD_FAILED",
      "database",
      "La base de données CTS n’a pas pu être rechargée."
    )

    timings.databaseReloadMs = elapsedMs(stageStartedAt)

    stageStartedAt = Date.now()

    const service = await withTelemetryError(
      () => PARSER.parseService(extraction.text),
      "PARSER_EXECUTION_FAILED",
      "parser",
      "Le Parser CTS n’a pas pu analyser le texte HASTUS."
    )

    timings.parserMs = elapsedMs(stageStartedAt)

    if (
      !service ||
      typeof service !== "object" ||
      Array.isArray(service)
    ) {
      throw createTelemetryError(
        "PARSER_INVALID_RESULT",
        "parser",
        "Le Parser CTS a renvoyé un résultat invalide."
      )
    }

    if (
      !service.validation ||
      typeof service.validation !== "object"
    ) {
      throw createTelemetryError(
        "PARSER_VALIDATION_MISSING",
        "parser",
        "Le Parser CTS n’a pas fourni de résultat de validation."
      )
    }

    if (!service.validation.valid) {
      timings.totalMs = elapsedMs(startedAtMs)

      const result = buildValidationFailure(
        sourceInfo,
        extraction,
        service,
        timings
      )

      await STORAGE.appendLog(
        "validation-error",
        "Import PDF HASTUS refusé",
        result
      )

      return result
    }

    stageStartedAt = Date.now()

    const registration = await registerImportedService(
      service,
      extraction,
      sourceInfo
    )

    timings.registrationMs = elapsedMs(stageStartedAt)
    timings.totalMs = elapsedMs(startedAtMs)

    const result = {
      success: true,
      status: "imported",
      telemetryCode: "",
      telemetryStage: "",
      startedAt,
      completedAt: new Date().toISOString(),
      service: service.service,
      date: service.date,
      slices: service.slices.length,
      warnings: [...service.validation.warnings],
      sourceFileName: sourceInfo.fileName,
      pdfFileName: registration.pdfFileName,
      cacheFileName: registration.cacheFileName,
      textFileName: registration.textFileName,
      indexEntry: registration.indexEntry,
      extraction: {
        engine: extraction.engine,
        engineVersion: extraction.engineVersion,
        pageCount: extraction.pageCount,
        characterCount: extraction.characterCount
      },
      timings: cloneTimings(timings)
    }

    if (options.activate === true) {
      const activation = await activateService(service)
      result.activated = activation.success
      result.activationError = activation.error
      result.activationTelemetryCode = activation.telemetryCode
      result.activationTelemetryStage = activation.telemetryStage
    } else {
      result.activated = false
      result.activationError = ""
      result.activationTelemetryCode = ""
      result.activationTelemetryStage = ""
    }

    await STORAGE.appendLog(
      "success",
      "Service PDF importé",
      result
    )

    return result
  } catch (error) {
    const telemetry = telemetryFromError(
      error,
      "SERVICE_IMPORT_FAILED",
      "import"
    )
    const safeError = UTILS.safeError(error)

    timings.totalMs = elapsedMs(startedAtMs)

    const result = {
      success: false,
      status: "exception",
      telemetryCode: telemetry.code,
      telemetryStage: telemetry.stage,
      startedAt,
      completedAt: new Date().toISOString(),
      sourceFileName: sourceInfo?.fileName || "",
      error: safeError.message,
      details: safeError,
      timings: cloneTimings(timings)
    }

    await STORAGE.appendLog(
      "exception",
      "Erreur pendant l’importation locale d’un PDF",
      result
    )

    return result
  }
}

async function inspectSourcePdf(pdfPath) {
  const normalizedPath = String(pdfPath || "").trim()

  if (!normalizedPath) {
    throw createTelemetryError(
      "PDF_PATH_MISSING",
      "source",
      "Aucun chemin de PDF n’a été fourni à l’importeur."
    )
  }

  if (!fm.fileExists(normalizedPath)) {
    throw createTelemetryError(
      "PDF_SOURCE_NOT_FOUND",
      "source",
      "Le PDF à importer est introuvable."
    )
  }

  let isDirectory

  try {
    isDirectory = fm.isDirectory(normalizedPath)
  } catch (error) {
    throw createTelemetryError(
      "PDF_METADATA_READ_FAILED",
      "source",
      `Les métadonnées du PDF ne peuvent pas être lues : ${errorMessage(error)}`,
      error
    )
  }

  if (isDirectory) {
    throw createTelemetryError(
      "PDF_PATH_IS_DIRECTORY",
      "source",
      "Le chemin fourni correspond à un dossier et non à un PDF."
    )
  }

  const fileName = UTILS.fileNameFromPath(normalizedPath)

  if (!/\.pdf$/i.test(fileName)) {
    throw createTelemetryError(
      "PDF_INVALID_EXTENSION",
      "source",
      "Le fichier à importer doit être un PDF."
    )
  }

  try {
    if (!await STORAGE.ensureDownloaded(normalizedPath)) {
      throw createTelemetryError(
        "PDF_SOURCE_NOT_FOUND",
        "source",
        "Le PDF à importer est introuvable."
      )
    }
  } catch (error) {
    if (hasTelemetryError(error)) {
      throw error
    }

    throw createTelemetryError(
      "PDF_ICLOUD_DOWNLOAD_FAILED",
      "source",
      `Le PDF n’a pas pu être téléchargé depuis iCloud : ${errorMessage(error)}`,
      error
    )
  }

  let sizeKilobytes

  try {
    sizeKilobytes = fm.fileSize(normalizedPath)
  } catch (error) {
    throw createTelemetryError(
      "PDF_METADATA_READ_FAILED",
      "source",
      `La taille du PDF ne peut pas être lue : ${errorMessage(error)}`,
      error
    )
  }

  if (!Number.isFinite(sizeKilobytes) || sizeKilobytes <= 0) {
    throw createTelemetryError(
      "PDF_EMPTY_OR_INACCESSIBLE",
      "source",
      "Le PDF est vide ou inaccessible."
    )
  }

  const maximumKilobytes =
    (Number(CONFIG.pdf.maximumFileSizeBytes) || 20 * 1024 * 1024) /
    1024

  if (sizeKilobytes > maximumKilobytes) {
    throw createTelemetryError(
      "PDF_TOO_LARGE",
      "source",
      "Le PDF dépasse la taille maximale autorisée."
    )
  }

  const modificationDate = STORAGE.safeModificationDate(normalizedPath)
  const modifiedAt = modificationDate
    ? modificationDate.toISOString()
    : ""

  return {
    path: normalizedPath,
    fileName,
    sizeKilobytes,
    modifiedAt,
    fingerprint: UTILS.buildFingerprint({
      fileName,
      sizeKilobytes,
      modifiedAt
    })
  }
}

async function registerImportedService(
  service,
  extraction,
  sourceInfo
) {
  const plan = await withTelemetryError(
    () => Promise.resolve(createImportPlan(service, sourceInfo)),
    "SERVICE_IMPORT_PLAN_FAILED",
    "registration",
    "Le plan d’importation du service n’a pas pu être créé."
  )

  const cacheSnapshot = await withTelemetryError(
    () => snapshotTextFile(plan.cachePath),
    "SERVICE_CACHE_SNAPSHOT_FAILED",
    "cache",
    "Le cache existant du service n’a pas pu être préparé."
  )

  const textSnapshot = await withTelemetryError(
    () => snapshotTextFile(plan.textPath),
    "SERVICE_TEXT_CACHE_SNAPSHOT_FAILED",
    "text_cache",
    "Le cache texte existant n’a pas pu être préparé."
  )

  const indexSnapshot = await withTelemetryError(
    () => snapshotTextFile(files.servicesIndex),
    "SERVICE_INDEX_SNAPSHOT_FAILED",
    "index",
    "L’index existant des services n’a pas pu être préparé."
  )

  let pdfTransaction = null

  try {
    await withTelemetryError(
      () => STORAGE.writeJsonSafely(plan.cachePath, service),
      "SERVICE_CACHE_WRITE_FAILED",
      "cache",
      "Le cache JSON du service n’a pas pu être enregistré."
    )

    await withTelemetryError(
      () => STORAGE.writeTextSafely(plan.textPath, extraction.text),
      "SERVICE_TEXT_CACHE_WRITE_FAILED",
      "text_cache",
      "Le texte extrait du PDF n’a pas pu être enregistré."
    )

    pdfTransaction = await movePdfToCanonicalName(plan)

    const index = await withTelemetryError(
      () => buildUpdatedIndex(
        plan,
        service,
        extraction,
        sourceInfo,
        pdfTransaction.fileName
      ),
      "SERVICE_INDEX_BUILD_FAILED",
      "index",
      "Le nouvel index des services n’a pas pu être construit."
    )

    await withTelemetryError(
      () => STORAGE.writeJsonSafely(files.servicesIndex, index),
      "SERVICE_INDEX_WRITE_FAILED",
      "index",
      "L’index des services n’a pas pu être enregistré."
    )

    const indexEntry = index.services.find(
      entry => entry.id === plan.id
    ) || null

    return {
      id: plan.id,
      pdfFileName: pdfTransaction.fileName,
      cacheFileName: plan.cacheFileName,
      textFileName: plan.textFileName,
      indexEntry
    }
  } catch (error) {
    await restoreTextFile(files.servicesIndex, indexSnapshot)

    if (pdfTransaction) {
      await pdfTransaction.rollback()
    }

    await restoreTextFile(plan.textPath, textSnapshot)
    await restoreTextFile(plan.cachePath, cacheSnapshot)
    throw error
  }
}

function createImportPlan(service, sourceInfo) {
  const date = String(service.date || "").trim()

  if (!UTILS.parseDate(date)) {
    throw createTelemetryError(
      "SERVICE_DATE_INVALID",
      "registration",
      "La date détectée dans le PDF est invalide."
    )
  }

  const serviceNumber = sanitizeServiceNumber(service.service)

  if (!serviceNumber) {
    throw createTelemetryError(
      "SERVICE_NUMBER_INVALID",
      "registration",
      "Le numéro de service détecté est invalide."
    )
  }

  const stem = `Service_${date}_${serviceNumber}`
  const pdfFileName = `${stem}.pdf`
  const cacheFileName = `${stem}.json`
  const textFileName = `${stem}.txt`

  return {
    id: `${date}_${serviceNumber}`,
    date,
    serviceNumber,
    sourcePath: sourceInfo.path,
    sourceFileName: sourceInfo.fileName,
    pdfFileName,
    pdfPath: fm.joinPath(paths.services, pdfFileName),
    cacheFileName,
    cachePath: fm.joinPath(paths.servicesCache, cacheFileName),
    textFileName,
    textPath: fm.joinPath(paths.servicesTextCache, textFileName)
  }
}

function sanitizeServiceNumber(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
}

async function movePdfToCanonicalName(plan) {
  if (plan.sourcePath === plan.pdfPath) {
    return {
      fileName: plan.pdfFileName,
      rollback: async () => {}
    }
  }

  let archivedPreviousPath = ""

  if (fm.fileExists(plan.pdfPath)) {
    try {
      await STORAGE.ensureDownloaded(plan.pdfPath)
    } catch (error) {
      throw createTelemetryError(
        "PDF_CANONICAL_ICLOUD_FAILED",
        "canonicalize",
        `Le PDF canonique existant n’a pas pu être téléchargé depuis iCloud : ${errorMessage(error)}`,
        error
      )
    }

    archivedPreviousPath = getUniqueArchivePath(
      [
        "Remplace",
        timestampForFileName(),
        plan.pdfFileName
      ].join("_")
    )

    try {
      fm.move(plan.pdfPath, archivedPreviousPath)
    } catch (error) {
      throw createTelemetryError(
        "PDF_CANONICAL_ARCHIVE_FAILED",
        "canonicalize",
        `L’ancien PDF canonique n’a pas pu être archivé : ${errorMessage(error)}`,
        error
      )
    }
  }

  try {
    fm.move(plan.sourcePath, plan.pdfPath)
  } catch (error) {
    restoreArchivedPreviousPdf(
      archivedPreviousPath,
      plan.pdfPath
    )

    throw createTelemetryError(
      "PDF_CANONICAL_MOVE_FAILED",
      "canonicalize",
      `Le PDF n’a pas pu être renommé ou déplacé vers son nom canonique : ${errorMessage(error)}`,
      error
    )
  }

  return {
    fileName: plan.pdfFileName,
    rollback: async () => {
      try {
        if (
          fm.fileExists(plan.pdfPath) &&
          !fm.fileExists(plan.sourcePath)
        ) {
          fm.move(plan.pdfPath, plan.sourcePath)
        }

        restoreArchivedPreviousPdf(
          archivedPreviousPath,
          plan.pdfPath
        )
      } catch (_) {}
    }
  }
}

function restoreArchivedPreviousPdf(
  archivedPath,
  canonicalPath
) {
  if (
    archivedPath &&
    fm.fileExists(archivedPath) &&
    !fm.fileExists(canonicalPath)
  ) {
    try {
      fm.move(archivedPath, canonicalPath)
    } catch (_) {}
  }
}

function getUniqueArchivePath(fileName) {
  let candidate = fm.joinPath(
    paths.servicesArchive,
    fileName
  )
  let suffix = 2

  while (fm.fileExists(candidate)) {
    const extensionIndex = fileName
      .toLowerCase()
      .lastIndexOf(".pdf")
    const baseName = extensionIndex >= 0
      ? fileName.slice(0, extensionIndex)
      : fileName

    candidate = fm.joinPath(
      paths.servicesArchive,
      `${baseName}_${suffix}.pdf`
    )
    suffix++
  }

  return candidate
}

async function buildUpdatedIndex(
  plan,
  service,
  extraction,
  sourceInfo,
  pdfFileName
) {
  const current = await readCurrentIndex()
  const previousEntry = current.services.find(
    entry => entry.id === plan.id
  ) || null
  const now = new Date().toISOString()

  const entry = {
    id: plan.id,
    date: plan.date,
    service: plan.serviceNumber,
    pdfFile: pdfFileName || previousEntry?.pdfFile || "",
    cacheFile: plan.cacheFileName,
    textFile: plan.textFileName,
    importedAt: service.importedAt || now,
    indexedAt: now,
    warnings: service.validation.warnings.length,
    slices: service.slices.length,
    firstDutyStart: service.slices[0]?.dutyStart || "",
    lastEnd: service.slices[service.slices.length - 1]?.end || "",
    source: {
      originalFileName: sourceInfo.fileName,
      sizeKilobytes: sourceInfo.sizeKilobytes,
      modifiedAt: sourceInfo.modifiedAt,
      fingerprint: sourceInfo.fingerprint
    },
    extraction: {
      engine: extraction.engine,
      engineVersion: extraction.engineVersion,
      pageCount: extraction.pageCount,
      characterCount: extraction.characterCount
    }
  }

  const services = current.services
    .filter(item => item.id !== plan.id)
    .concat(entry)
    .sort(compareIndexEntries)

  return {
    version: INDEX_VERSION,
    updatedAt: now,
    services
  }
}

async function readCurrentIndex() {
  const exists = fm.fileExists(files.servicesIndex)
  const value = await STORAGE.readJson(files.servicesIndex, null)

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
    throw createTelemetryError(
      "SERVICE_INDEX_INVALID",
      "index",
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

function compareIndexEntries(first, second) {
  const byDate = String(first.date).localeCompare(
    String(second.date)
  )

  if (byDate !== 0) {
    return byDate
  }

  return String(first.service).localeCompare(
    String(second.service)
  )
}

async function activateService(service) {
  try {
    await STORAGE.saveService(service)

    return {
      success: true,
      error: "",
      telemetryCode: "",
      telemetryStage: ""
    }
  } catch (error) {
    const safeError = UTILS.safeError(error)

    return {
      success: false,
      error: safeError.message,
      telemetryCode: "SERVICE_ACTIVATION_FAILED",
      telemetryStage: "activation"
    }
  }
}

function buildValidationFailure(
  sourceInfo,
  extraction,
  service,
  timings
) {
  return {
    success: false,
    status: "validation-error",
    telemetryCode: "HASTUS_VALIDATION_FAILED",
    telemetryStage: "validation",
    completedAt: new Date().toISOString(),
    sourceFileName: sourceInfo.fileName,
    service: service.service || "",
    date: service.date || "",
    errors: Array.isArray(service.validation.errors)
      ? [...service.validation.errors]
      : [],
    warnings: Array.isArray(service.validation.warnings)
      ? [...service.validation.warnings]
      : [],
    extraction: {
      engine: extraction.engine,
      engineVersion: extraction.engineVersion,
      pageCount: extraction.pageCount,
      characterCount: extraction.characterCount
    },
    timings: cloneTimings(timings)
  }
}

async function snapshotTextFile(path) {
  if (!await STORAGE.ensureDownloaded(path)) {
    return {
      existed: false,
      content: ""
    }
  }

  return {
    existed: true,
    content: fm.readString(path)
  }
}

async function restoreTextFile(path, snapshot) {
  try {
    if (snapshot.existed) {
      fm.writeString(path, snapshot.content)
      return
    }

    if (fm.fileExists(path)) {
      fm.remove(path)
    }
  } catch (_) {}
}

async function withTelemetryError(
  operation,
  fallbackCode,
  fallbackStage,
  fallbackMessage
) {
  try {
    return await operation()
  } catch (error) {
    if (hasTelemetryError(error)) {
      throw error
    }

    throw createTelemetryError(
      fallbackCode,
      fallbackStage,
      [
        String(fallbackMessage || "").trim(),
        errorMessage(error)
      ].filter(Boolean).join(" ").trim(),
      error
    )
  }
}

function createTelemetryError(
  code,
  stage,
  message,
  cause = null
) {
  return UTILS.createTelemetryError(
    UTILS.normalizeTelemetryCode(
      code,
      "SERVICE_IMPORT_FAILED"
    ),
    UTILS.normalizeTelemetryStage(
      stage,
      "import"
    ),
    message,
    cause
  )
}

function hasTelemetryError(error) {
  return UTILS.hasTelemetryError(error)
}

function telemetryFromError(
  error,
  fallbackCode,
  fallbackStage
) {
  return UTILS.telemetryFromError(
    error,
    fallbackCode,
    fallbackStage
  )
}

function elapsedMs(startedAt) {
  const value = Date.now() - Number(startedAt)

  return Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : null
}

function cloneTimings(timings) {
  return {
    sourceInspectionMs: finiteOrNull(timings?.sourceInspectionMs),
    pdfExtractionMs: finiteOrNull(timings?.pdfExtractionMs),
    databaseReloadMs: finiteOrNull(timings?.databaseReloadMs),
    parserMs: finiteOrNull(timings?.parserMs),
    registrationMs: finiteOrNull(timings?.registrationMs),
    totalMs: finiteOrNull(timings?.totalMs)
  }
}

function finiteOrNull(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function timestampForFileName() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z")
}

function errorMessage(error) {
  return UTILS.errorMessage(error)
}

module.exports = {
  importPdf,
  activateService
}