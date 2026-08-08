// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: green; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: folder.badge.gearshape;

// CTS Services Manager.js
// Détection, importation et sélection automatique des services PDF.

const CONFIG =
  importModule(
    "CTS Config"
  )

const IMPORTER =
  importModule(
    "CTS Importer"
  )

const STORAGE =
  importModule(
    "CTS Storage"
  )

const UTILS =
  importModule(
    "CTS Utils"
  )

const SERVICES_CLEANER =
  importModule(
    "CTS Services Cleaner"
  )

const {
  fm,
  paths,
  files,
  pdf
} = CONFIG


const SCAN_STATE_VERSION =
  1

const SCAN_LOCK_PATH =
  fm.joinPath(
    paths.data,
    "services-scan.lock"
  )

const SCAN_LOCK_TTL_MS =
  2 * 60 * 1000

const EXCEPTION_RETRY_DELAY_MS =
  15 * 60 * 1000

const SERVICE_DISPLAY_GRACE_MS =
  60 * 60 * 1000


// =====================================================
// BALAYAGE PRINCIPAL
// =====================================================

async function scanServices(
  options = {}
) {
  CONFIG.ensureDirectories()

  const lock =
    await acquireScanLock()


  if (
    !lock.acquired
  ) {
    return {
      success:
        true,

      status:
        "locked",

      detected:
        0,

      scanned:
        0,

      candidates:
        0,

      processed:
        0,

      imported:
        [],

      failed:
        [],

      knownFailures:
        [],

      detectionErrors:
        [],

      remaining:
        0
    }
  }


  try {
    return await performScan(
      options
    )
  } finally {
    await releaseScanLock(
      lock
    )
  }
}


async function performScan(
  options
) {
  const index =
    await IMPORTER
      .readCurrentIndex()


  const state =
    await loadScanState()


  const listing =
    await inspectServicesDirectory()


  const servicePdfs =
    listing.files


  const detectionErrors =
    listing.detectionErrors


  const now =
    new Date()


  const candidates =
    servicePdfs
      .filter(
        file =>
          shouldProcessPdf(
            file,
            index,
            state,
            now
          )
      )
      .sort(
        compareCandidates
      )


  const maximumFiles =
    resolveMaximumFiles(
      options.maximumFiles
    )


  const selectedCandidates =
    candidates.slice(
      0,
      maximumFiles
    )


  const imported = []
  const failed = []


  for (
    const candidate
    of selectedCandidates
  ) {
    const result =
      await importCandidate(
        candidate
      )


    if (
      result.success
    ) {
      imported.push(
        result
      )

      await recordSuccessfulImport(
        state,
        candidate,
        result
      )

    } else {
      failed.push(
        result
      )

      recordFailedImport(
        state,
        candidate,
        result
      )
    }


    state.updatedAt =
      new Date()
        .toISOString()


    await saveScanState(
      state
    )
  }


  const knownFailures =
    collectKnownFailures(
      servicePdfs,
      state,
      failed
    )


  state.updatedAt =
    new Date()
      .toISOString()


  state.lastScan = {
    scannedAt:
      state.updatedAt,

    detectedPdfCount:
      listing.detected,

    pdfCount:
      servicePdfs.length,

    detectionErrorCount:
      detectionErrors.length,

    candidateCount:
      candidates.length,

    processedCount:
      selectedCandidates.length,

    importedCount:
      imported.length,

    failedCount:
      failed.length +
      detectionErrors.length
  }


  await saveScanState(
    state
  )


  return {
    success:
      failed.length === 0 &&
      detectionErrors.length === 0,

    status:
      selectedCandidates.length
        ? "processed"
        : detectionErrors.length
          ? "detection-error"
          : "idle",

    detected:
      listing.detected,

    scanned:
      servicePdfs.length,

    candidates:
      candidates.length,

    processed:
      selectedCandidates.length,

    imported,

    failed,

    knownFailures,

    detectionErrors,

    remaining:
      Math.max(
        0,

        candidates.length -
        selectedCandidates.length
      )
  }
}


// =====================================================
// IMPORTATION D’UN CANDIDAT
// =====================================================

async function importCandidate(
  candidate
) {
  try {
    const result =
      await IMPORTER.importPdf(
        candidate.path,
        {
          activate:
            false
        }
      )


    return {
      ...result,

      detectedFileName:
        candidate.fileName,

      detectedFingerprint:
        candidate.fingerprint
    }

  } catch (error) {
    const safeError =
      UTILS.safeError(
        error
      )


    const telemetry =
      telemetryFromError(
        error,
        "SERVICE_IMPORT_FAILED",
        "import"
      )


    return {
      success:
        false,

      status:
        "exception",

      detectedFileName:
        candidate.fileName,

      detectedFingerprint:
        candidate.fingerprint,

      telemetryCode:
        telemetry.code,

      telemetryStage:
        telemetry.stage,

      error:
        safeError.message,

      details:
        safeError
    }
  }
}


// =====================================================
// LISTE DES PDF
// =====================================================

async function listServicePdfs() {
  const listing =
    await inspectServicesDirectory()


  return listing.files
}


async function inspectServicesDirectory() {
  CONFIG.ensureDirectories()


  let fileNames


  try {
    fileNames =
      fm.listContents(
        paths.services
      )

  } catch (error) {
    throw createTelemetryError(
      "SERVICES_DIRECTORY_READ_FAILED",
      "scan",
      `Le dossier Services ne peut pas être lu : ${errorMessage(error)}`,
      error
    )
  }


  const pdfFiles = []
  const detectionErrors = []

  let detected = 0


  for (
    const fileName
    of fileNames
  ) {
    if (
      !isPdfFileName(
        fileName
      )
    ) {
      continue
    }


    const path =
      fm.joinPath(
        paths.services,
        fileName
      )


    detected++


    let isDirectory =
      false


    try {
      isDirectory =
        fm.isDirectory(
          path
        )

    } catch (error) {
      const safeError =
        UTILS.safeError(
          error
        )


      const telemetry =
        telemetryFromError(
          error,
          "PDF_METADATA_READ_FAILED",
          "metadata"
        )


      detectionErrors.push({
        fileName,

        path,

        stage:
          "metadata",

        telemetryCode:
          telemetry.code,

        telemetryStage:
          telemetry.stage,

        error:
          safeError.message,

        details:
          safeError
      })


      await STORAGE.appendLog(
        "pdf-detection-error",

        "PDF détecté mais métadonnées inaccessibles",

        {
          fileName,

          path,

          telemetryCode:
            telemetry.code,

          telemetryStage:
            telemetry.stage,

          error:
            safeError.message,

          details:
            safeError
        }
      )


      continue
    }


    if (
      isDirectory
    ) {
      detected--
      continue
    }


    try {
      pdfFiles.push(
        await inspectPdf(
          path
        )
      )

    } catch (error) {
      const safeError =
        UTILS.safeError(
          error
        )


      const telemetry =
        telemetryFromError(
          error,
          "PDF_INSPECTION_FAILED",
          "inspection"
        )


      detectionErrors.push({
        fileName,

        path,

        stage:
          "inspection",

        telemetryCode:
          telemetry.code,

        telemetryStage:
          telemetry.stage,

        error:
          safeError.message,

        details:
          safeError
      })


      await STORAGE.appendLog(
        "pdf-detection-error",

        "PDF détecté mais inaccessible",

        {
          fileName,

          path,

          telemetryCode:
            telemetry.code,

          telemetryStage:
            telemetry.stage,

          error:
            safeError.message,

          details:
            safeError
        }
      )
    }
  }


  return {
    detected,

    files:
      pdfFiles,

    detectionErrors
  }
}


async function inspectPdf(
  path
) {
  if (
    !fm.fileExists(
      path
    )
  ) {
    throw createTelemetryError(
      "PDF_SOURCE_NOT_FOUND",
      "inspection",
      "Le PDF est introuvable."
    )
  }


  try {
    if (
      !fm.isFileDownloaded(
        path
      )
    ) {
      await fm
        .downloadFileFromiCloud(
          path
        )
    }

  } catch (error) {
    throw createTelemetryError(
      "PDF_ICLOUD_DOWNLOAD_FAILED",
      "inspection",

      `Le PDF n’a pas pu être téléchargé depuis iCloud : ${errorMessage(error)}`,

      error
    )
  }


  const fileName =
    fileNameFromPath(
      path
    )


  let sizeKilobytes


  try {
    sizeKilobytes =
      fm.fileSize(
        path
      )

  } catch (error) {
    throw createTelemetryError(
      "PDF_METADATA_READ_FAILED",
      "inspection",

      `La taille du PDF ne peut pas être lue : ${errorMessage(error)}`,

      error
    )
  }


  if (
    !Number.isFinite(
      sizeKilobytes
    ) ||
    sizeKilobytes <= 0
  ) {
    throw createTelemetryError(
      "PDF_EMPTY_OR_INACCESSIBLE",
      "inspection",
      "Le PDF est vide ou inaccessible."
    )
  }


  const modificationDate =
    safeModificationDate(
      path
    )


  const modifiedAt =
    modificationDate
      ? modificationDate
          .toISOString()
      : ""


  return {
    path,

    fileName,

    sizeKilobytes,

    modifiedAt,

    canonical:
      isCanonicalPdfName(
        fileName
      ),

    fingerprint:
      buildFingerprint({
        fileName,
        sizeKilobytes,
        modifiedAt
      })
  }
}


// =====================================================
// DÉCISION DE TRAITEMENT
// =====================================================

function shouldProcessPdf(
  file,
  index,
  state,
  now
) {
  if (
    isIndexedAndCurrent(
      file,
      index
    )
  ) {
    return false
  }


  const previous =
    state.files[
      file.fileName
    ]


  if (
    !previous
  ) {
    return true
  }


  if (
    previous.fingerprint !==
      file.fingerprint
  ) {
    return true
  }


  switch (
    previous.status
  ) {
    case "imported":
    case "indexed":
    case "validation-error":
      return false


    case "exception":
      return retryDelayElapsed(
        previous.lastAttemptAt,
        now
      )


    default:
      return true
  }
}


function isIndexedAndCurrent(
  file,
  index
) {
  const services =
    Array.isArray(
      index?.services
    )
      ? index.services
      : []


  const entry =
    services.find(
      item =>
        item?.pdfFile ===
        file.fileName
    )


  if (
    !entry
  ) {
    return false
  }


  if (
    !entry.cacheFile
  ) {
    return false
  }


  const cachePath =
    fm.joinPath(
      paths.servicesCache,
      entry.cacheFile
    )


  if (
    !fm.fileExists(
      cachePath
    )
  ) {
    return false
  }


  const indexedSize =
    Number(
      entry.source
        ?.sizeKilobytes
    )


  const sameSize =
    !Number.isFinite(
      indexedSize
    ) ||
    indexedSize ===
      file.sizeKilobytes


  const indexedModifiedAt =
    String(
      entry.source
        ?.modifiedAt ||
      ""
    )


  const sameModificationDate =
    !indexedModifiedAt ||
    !file.modifiedAt ||
    indexedModifiedAt ===
      file.modifiedAt


  return (
    sameSize &&
    sameModificationDate
  )
}


function retryDelayElapsed(
  lastAttemptAt,
  now
) {
  const lastAttemptTime =
    Date.parse(
      String(
        lastAttemptAt ||
        ""
      )
    )


  if (
    !Number.isFinite(
      lastAttemptTime
    )
  ) {
    return true
  }


  return (
    now.getTime() -
      lastAttemptTime >=
    EXCEPTION_RETRY_DELAY_MS
  )
}


// =====================================================
// ENREGISTREMENT DU RÉSULTAT
// =====================================================

async function recordSuccessfulImport(
  state,
  candidate,
  result
) {
  const now =
    new Date()
      .toISOString()


  state.files[
    candidate.fileName
  ] = {
    fingerprint:
      candidate.fingerprint,

    status:
      "imported",

    lastAttemptAt:
      now,

    service:
      result.service ||
      "",

    date:
      result.date ||
      "",

    canonicalFileName:
      result.pdfFileName ||
      "",

    telemetryCode:
      "",

    telemetryStage:
      "",

    timings:
      normalizeTimings(
        result.timings
      ),

    error:
      ""
  }


  if (
    !result.pdfFileName
  ) {
    return
  }


  const canonicalPath =
    fm.joinPath(
      paths.services,
      result.pdfFileName
    )


  if (
    !fm.fileExists(
      canonicalPath
    )
  ) {
    return
  }


  try {
    const canonicalInfo =
      await inspectPdf(
        canonicalPath
      )


    state.files[
      canonicalInfo.fileName
    ] = {
      fingerprint:
        canonicalInfo.fingerprint,

      status:
        "indexed",

      lastAttemptAt:
        now,

      service:
        result.service ||
        "",

      date:
        result.date ||
        "",

      canonicalFileName:
        canonicalInfo.fileName,

      telemetryCode:
        "",

      telemetryStage:
        "",

      timings:
        normalizeTimings(
          result.timings
        ),

      error:
        ""
    }

  } catch (_) {
    /*
     * L’import principal reste valide même si
     * l’empreinte canonique ne peut pas être relue.
     */
  }
}


function recordFailedImport(
  state,
  candidate,
  result
) {
  const previous =
    state.files[
      candidate.fileName
    ]


  const previousAttempts =
    Number(
      previous?.attempts
    ) || 0


  state.files[
    candidate.fileName
  ] = {
    fingerprint:
      candidate.fingerprint,

    status:
      result.status ||
      "exception",

    lastAttemptAt:
      new Date()
        .toISOString(),

    attempts:
      previousAttempts +
      1,

    service:
      result.service ||
      "",

    date:
      result.date ||
      "",

    canonicalFileName:
      "",

    telemetryCode:
      normalizeTelemetryCode(
        result.telemetryCode,

        result.status ===
          "validation-error"
          ? "HASTUS_VALIDATION_FAILED"
          : "SERVICE_IMPORT_FAILED"
      ),

    telemetryStage:
      normalizeTelemetryStage(
        result.telemetryStage,

        result.status ===
          "validation-error"
          ? "validation"
          : "import"
      ),

    timings:
      normalizeTimings(
        result.timings
      ),

    error:
      result.error ||
      (
        Array.isArray(
          result.errors
        )
          ? result.errors.join(
              " · "
            )
          : ""
      )
  }
}


function collectKnownFailures(
  servicePdfs,
  state,
  currentFailures
) {
  const currentNames =
    new Set(
      currentFailures
        .map(
          item =>
            String(
              item
                ?.detectedFileName ||
              item
                ?.sourceFileName ||
              ""
            ).trim()
        )
        .filter(
          Boolean
        )
    )


  const knownFailures =
    []


  for (
    const file
    of servicePdfs
  ) {
    if (
      currentNames.has(
        file.fileName
      )
    ) {
      continue
    }


    const previous =
      state.files[
        file.fileName
      ]


    if (
      !previous ||
      (
        previous.status !==
          "validation-error" &&
        previous.status !==
          "exception"
      )
    ) {
      continue
    }


    const error =
      String(
        previous.error ||
        ""
      ).trim()


    if (
      !error
    ) {
      continue
    }


    knownFailures.push({
      success:
        false,

      status:
        previous.status,

      detectedFileName:
        file.fileName,

      telemetryCode:
        normalizeTelemetryCode(
          previous.telemetryCode,

          previous.status ===
            "validation-error"
            ? "HASTUS_VALIDATION_FAILED"
            : "SERVICE_IMPORT_FAILED"
        ),

      telemetryStage:
        normalizeTelemetryStage(
          previous.telemetryStage,

          previous.status ===
            "validation-error"
            ? "validation"
            : "import"
        ),

      timings:
        normalizeTimings(
          previous.timings
        ),

      error,

      previous:
        true,

      lastAttemptAt:
        String(
          previous.lastAttemptAt ||
          ""
        )
    })
  }


  return knownFailures
}


// =====================================================
// ÉTAT DU BALAYAGE
// =====================================================

async function loadScanState() {
  let value


  try {
    value =
      await STORAGE.readJson(
        files.servicesScanState,
        null
      )

  } catch (error) {
    throw createTelemetryError(
      "SERVICES_SCAN_STATE_READ_FAILED",
      "scan_state",

      `L’état du balayage des services ne peut pas être lu : ${errorMessage(error)}`,

      error
    )
  }


  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    return emptyScanState()
  }


  const storedFiles =
    value.files &&
    typeof value.files ===
      "object" &&
    !Array.isArray(
      value.files
    )
      ? value.files
      : {}


  return {
    version:
      Number(
        value.version
      ) ||
      SCAN_STATE_VERSION,

    updatedAt:
      String(
        value.updatedAt ||
        ""
      ),

    lastScan:
      value.lastScan &&
      typeof value.lastScan ===
        "object" &&
      !Array.isArray(
        value.lastScan
      )
        ? value.lastScan
        : null,

    files:
      storedFiles
  }
}


function emptyScanState() {
  return {
    version:
      SCAN_STATE_VERSION,

    updatedAt:
      "",

    lastScan:
      null,

    files:
      {}
  }
}


async function saveScanState(
  state
) {
  CONFIG.ensureDirectories()


  const value = {
    version:
      SCAN_STATE_VERSION,

    updatedAt:
      state.updatedAt ||
      new Date()
        .toISOString(),

    lastScan:
      state.lastScan ||
      null,

    files:
      state.files ||
      {}
  }


  try {
    await writeJsonAtomically(
      files.servicesScanState,
      value
    )

  } catch (error) {
    if (
      hasTelemetryError(
        error
      )
    ) {
      throw error
    }


    throw createTelemetryError(
      "SERVICES_SCAN_STATE_WRITE_FAILED",
      "scan_state",

      `L’état du balayage des services ne peut pas être enregistré : ${errorMessage(error)}`,

      error
    )
  }
}


// =====================================================
// VERROU DE BALAYAGE
// =====================================================

async function acquireScanLock() {
  const now =
    new Date()


  if (
    fm.fileExists(
      SCAN_LOCK_PATH
    )
  ) {
    let existingLock


    try {
      existingLock =
        await STORAGE.readJson(
          SCAN_LOCK_PATH,
          null
        )

    } catch (error) {
      throw createTelemetryError(
        "SERVICES_SCAN_LOCK_READ_FAILED",
        "scan_lock",

        `Le verrou d’analyse des services ne peut pas être lu : ${errorMessage(error)}`,

        error
      )
    }


    const lockTime =
      Date.parse(
        String(
          existingLock
            ?.createdAt ||
          ""
        )
      )


    const lockIsActive =
      Number.isFinite(
        lockTime
      ) &&
      now.getTime() -
        lockTime <
        SCAN_LOCK_TTL_MS


    if (
      lockIsActive
    ) {
      return {
        acquired:
          false,

        token:
          ""
      }
    }


    removeFileQuietly(
      SCAN_LOCK_PATH
    )
  }


  const token =
    buildUniqueToken()


  try {
    fm.writeString(
      SCAN_LOCK_PATH,

      JSON.stringify(
        {
          token,

          createdAt:
            now.toISOString()
        },

        null,
        2
      )
    )

  } catch (error) {
    throw createTelemetryError(
      "SERVICES_SCAN_LOCK_WRITE_FAILED",
      "scan_lock",

      `Le verrou d’analyse des services ne peut pas être créé : ${errorMessage(error)}`,

      error
    )
  }


  return {
    acquired:
      true,

    token
  }
}


async function releaseScanLock(
  lock
) {
  if (
    !lock?.acquired ||
    !fm.fileExists(
      SCAN_LOCK_PATH
    )
  ) {
    return
  }


  try {
    const currentLock =
      await STORAGE.readJson(
        SCAN_LOCK_PATH,
        null
      )


    if (
      !currentLock ||
      currentLock.token ===
        lock.token
    ) {
      fm.remove(
        SCAN_LOCK_PATH
      )
    }

  } catch (_) {
    /*
     * Une erreur de libération du verrou
     * ne doit jamais empêcher l'affichage.
     */
    removeFileQuietly(
      SCAN_LOCK_PATH
    )
  }
}


// =====================================================
// ÉCRITURE ATOMIQUE
// =====================================================

async function writeJsonAtomically(
  path,
  value
) {
  const token =
    buildUniqueToken()


  const temporaryPath =
    `${path}.tmp-${token}`


  const rollbackPath =
    `${path}.rollback-${token}`


  const content =
    JSON.stringify(
      value,
      null,
      2
    )


  removeFileQuietly(
    temporaryPath
  )


  removeFileQuietly(
    rollbackPath
  )


  try {
    fm.writeString(
      temporaryPath,
      content
    )

  } catch (error) {
    throw createTelemetryError(
      "SERVICES_SCAN_STATE_TEMP_WRITE_FAILED",
      "scan_state",

      `Le fichier temporaire d’état ne peut pas être écrit : ${errorMessage(error)}`,

      error
    )
  }


  let previousMoved =
    false


  try {
    if (
      fm.fileExists(
        path
      )
    ) {
      fm.move(
        path,
        rollbackPath
      )

      previousMoved =
        true
    }


    fm.move(
      temporaryPath,
      path
    )

  } catch (error) {
    removeFileQuietly(
      temporaryPath
    )


    if (
      previousMoved &&
      fm.fileExists(
        rollbackPath
      ) &&
      !fm.fileExists(
        path
      )
    ) {
      try {
        fm.move(
          rollbackPath,
          path
        )
      } catch (_) {}
    }


    throw createTelemetryError(
      "SERVICES_SCAN_STATE_COMMIT_FAILED",
      "scan_state",

      `L’état du balayage n’a pas pu être validé : ${errorMessage(error)}`,

      error
    )
  }


  removeFileQuietly(
    rollbackPath
  )
}


// =====================================================
// SÉLECTION AUTOMATIQUE DU SERVICE
// =====================================================

async function resolveServiceForDate(
  currentDate =
    new Date()
) {
  if (
    !isUsableDate(
      currentDate
    )
  ) {
    return emptyServiceSelection(
      "invalid-date"
    )
  }


  const index =
    await IMPORTER
      .readCurrentIndex()


  const entries =
    Array.isArray(
      index?.services
    )
      ? index.services.filter(
          isUsableServiceEntry
        )
      : []


  if (
    !entries.length
  ) {
    return emptyServiceSelection(
      "empty-index"
    )
  }


  const todayKey =
    localDateKey(
      currentDate
    )


  const yesterdayDate =
    new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      currentDate.getDate() -
        1
    )


  const yesterdayKey =
    localDateKey(
      yesterdayDate
    )


  let previousDayFallback =
    null


  let todayFallback =
    null


  /*
   * Le service de la veille reste prioritaire
   * jusqu’à une heure après sa fin réelle.
   */
  const previousDayEntries =
    entries
      .filter(
        entry =>
          entry.date ===
          yesterdayKey
      )
      .sort(
        compareEntriesByNewest
      )


  for (
    const entry
    of previousDayEntries
  ) {
    const source =
      await loadIndexedService(
        entry
      )


    if (
      !source
    ) {
      continue
    }


    const timing =
      resolveServiceDisplayTiming(
        source,
        currentDate
      )


    if (
      !timing.switchAfterDate ||
      currentDate <
        timing.switchAfterDate
    ) {
      return buildServiceSelection(
        entry,
        source,
        "overnight",
        timing
      )
    }


    if (
      !previousDayFallback
    ) {
      previousDayFallback = {
        entry,
        source,
        timing
      }
    }
  }


  /*
   * Le service du jour reste sélectionné
   * jusqu’à une heure après sa dernière fin.
   */
  const todayEntries =
    entries
      .filter(
        entry =>
          entry.date ===
          todayKey
      )
      .sort(
        compareEntriesByNewest
      )


  for (
    const entry
    of todayEntries
  ) {
    const source =
      await loadIndexedService(
        entry
      )


    if (
      !source
    ) {
      continue
    }


    const timing =
      resolveServiceDisplayTiming(
        source,
        currentDate
      )


    if (
      !timing.switchAfterDate ||
      currentDate <
        timing.switchAfterDate
    ) {
      return buildServiceSelection(
        entry,
        source,
        "today",
        timing
      )
    }


    if (
      !todayFallback
    ) {
      todayFallback = {
        entry,
        source,
        timing
      }
    }
  }


  /*
   * Une fois le délai d’une heure écoulé,
   * le prochain service disponible est préparé.
   */
  const futureEntries =
    entries
      .filter(
        entry =>
          entry.date >
          todayKey
      )
      .sort(
        compareFutureEntries
      )


  for (
    const entry
    of futureEntries
  ) {
    const source =
      await loadIndexedService(
        entry
      )


    if (
      source
    ) {
      return buildServiceSelection(
        entry,
        source,
        "next",

        resolveServiceDisplayTiming(
          source,
          currentDate
        )
      )
    }
  }


  /*
   * Aucun service futur disponible :
   * on conserve le dernier service connu.
   */
  const fallback =
    todayFallback ||
    previousDayFallback


  if (
    fallback
  ) {
    return buildServiceSelection(
      fallback.entry,
      fallback.source,
      "last-known",
      fallback.timing
    )
  }


  return emptyServiceSelection(
    "no-usable-service"
  )
}


async function loadIndexedService(
  entry
) {
  if (
    !entry ||
    !entry.cacheFile
  ) {
    return null
  }


  const cachePath =
    fm.joinPath(
      paths.servicesCache,
      entry.cacheFile
    )


  let source


  try {
    source =
      await STORAGE.readJson(
        cachePath,
        null
      )

  } catch (error) {
    throw createTelemetryError(
      "SERVICE_CACHE_READ_FAILED",
      "selection",

      `Le cache du service ne peut pas être lu : ${errorMessage(error)}`,

      error
    )
  }


  if (
    !source ||
    typeof source !==
      "object" ||
    Array.isArray(
      source
    )
  ) {
    return null
  }


  if (
    source.validation
      ?.valid !==
      true ||
    !Array.isArray(
      source.slices
    ) ||
    !source.slices.length
  ) {
    return null
  }


  if (
    String(
      source.date ||
      ""
    ) !==
    String(
      entry.date ||
      ""
    )
  ) {
    return null
  }


  return source
}


function resolveServiceDisplayTiming(
  source,
  currentDate
) {
  const serviceEndDate =
    SERVICES_CLEANER
      .resolveServiceEndDate(
        source
      )


  if (
    !isUsableDate(
      serviceEndDate
    )
  ) {
    return {
      serviceEndDate:
        null,

      switchAfterDate:
        null,

      serviceEndAt:
        "",

      switchAfter:
        "",

      withinGracePeriod:
        false,

      expired:
        false
    }
  }


  const switchAfterDate =
    new Date(
      serviceEndDate
        .getTime() +
      SERVICE_DISPLAY_GRACE_MS
    )


  const currentTime =
    currentDate.getTime()


  return {
    serviceEndDate,

    switchAfterDate,

    serviceEndAt:
      serviceEndDate
        .toISOString(),

    switchAfter:
      switchAfterDate
        .toISOString(),

    withinGracePeriod:
      currentTime >=
        serviceEndDate
          .getTime() &&
      currentTime <
        switchAfterDate
          .getTime(),

    expired:
      currentTime >=
      switchAfterDate
        .getTime()
  }
}


function isUsableServiceEntry(
  entry
) {
  return Boolean(
    entry &&
    typeof entry ===
      "object" &&
    !Array.isArray(
      entry
    ) &&
    /^\d{4}-\d{2}-\d{2}$/.test(
      String(
        entry.date ||
        ""
      )
    ) &&
    String(
      entry.cacheFile ||
      ""
    ).trim()
  )
}


function compareEntriesByNewest(
  first,
  second
) {
  const firstTime =
    Date.parse(
      String(
        first.indexedAt ||
        first.importedAt ||
        ""
      )
    )


  const secondTime =
    Date.parse(
      String(
        second.indexedAt ||
        second.importedAt ||
        ""
      )
    )


  const safeFirstTime =
    Number.isFinite(
      firstTime
    )
      ? firstTime
      : 0


  const safeSecondTime =
    Number.isFinite(
      secondTime
    )
      ? secondTime
      : 0


  return (
    safeSecondTime -
    safeFirstTime
  )
}


function compareFutureEntries(
  first,
  second
) {
  const byDate =
    String(
      first.date
    )
      .localeCompare(
        String(
          second.date
        )
      )


  if (
    byDate !== 0
  ) {
    return byDate
  }


  return compareEntriesByNewest(
    first,
    second
  )
}


function buildServiceSelection(
  entry,
  source,
  reason,
  timing = {}
) {
  return {
    found:
      true,

    reason,

    entry,

    source,

    service:
      String(
        source.service ||
        ""
      ),

    date:
      String(
        source.date ||
        ""
      ),

    cacheFile:
      String(
        entry.cacheFile ||
        ""
      ),

    pdfFile:
      String(
        entry.pdfFile ||
        ""
      ),

    serviceEndAt:
      String(
        timing.serviceEndAt ||
        ""
      ),

    switchAfter:
      String(
        timing.switchAfter ||
        ""
      ),

    displayGraceMs:
      SERVICE_DISPLAY_GRACE_MS,

    withinGracePeriod:
      Boolean(
        timing.withinGracePeriod
      )
  }
}


function emptyServiceSelection(
  reason
) {
  return {
    found:
      false,

    reason:
      String(
        reason ||
        "unknown"
      ),

    entry:
      null,

    source:
      null,

    service:
      "",

    date:
      "",

    cacheFile:
      "",

    pdfFile:
      "",

    serviceEndAt:
      "",

    switchAfter:
      "",

    displayGraceMs:
      SERVICE_DISPLAY_GRACE_MS,

    withinGracePeriod:
      false
  }
}


function localDateKey(
  date
) {
  return [
    date.getFullYear(),

    String(
      date.getMonth() +
      1
    ).padStart(
      2,
      "0"
    ),

    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    )
  ].join("-")
}


function isUsableDate(
  value
) {
  return Boolean(
    value &&
    typeof value.getTime ===
      "function" &&
    typeof value.getFullYear ===
      "function" &&
    typeof value.getMonth ===
      "function" &&
    typeof value.getDate ===
      "function" &&
    typeof value.getHours ===
      "function" &&
    typeof value.getMinutes ===
      "function" &&
    Number.isFinite(
      value.getTime()
    )
  )
}


// =====================================================
// TÉLÉMÉTRIE LOCALE
// =====================================================

function createTelemetryError(
  code,
  stage,
  message,
  cause = null
) {
  const error =
    new Error(
      String(
        message ||
        code ||
        "Erreur Services Manager."
      )
    )


  error.telemetryCode =
    normalizeTelemetryCode(
      code,
      "SERVICES_MANAGER_FAILED"
    )


  error.telemetryStage =
    normalizeTelemetryStage(
      stage,
      "services"
    )


  if (
    cause
  ) {
    try {
      error.cause =
        cause
    } catch (_) {}
  }


  return error
}


function hasTelemetryError(
  error
) {
  return Boolean(
    error &&
    typeof error ===
      "object" &&
    typeof error
      .telemetryCode ===
      "string" &&
    error.telemetryCode
      .trim()
  )
}


function telemetryFromError(
  error,
  fallbackCode,
  fallbackStage
) {
  return {
    code:
      normalizeTelemetryCode(
        error
          ?.telemetryCode,

        fallbackCode
      ),

    stage:
      normalizeTelemetryStage(
        error
          ?.telemetryStage,

        fallbackStage
      )
  }
}


function normalizeTelemetryCode(
  value,
  fallback
) {
  const normalized =
    String(
      value ||
      fallback ||
      "SERVICES_MANAGER_FAILED"
    )
      .trim()
      .toUpperCase()
      .replace(
        /[^A-Z0-9_]/g,
        "_"
      )
      .slice(
        0,
        64
      )


  return normalized ||
    "SERVICES_MANAGER_FAILED"
}


function normalizeTelemetryStage(
  value,
  fallback
) {
  const normalized =
    String(
      value ||
      fallback ||
      "services"
    )
      .trim()
      .replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      )
      .slice(
        0,
        50
      )


  return normalized ||
    "services"
}


function normalizeTimings(
  value
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    return null
  }


  return {
    sourceInspectionMs:
      finiteOrNull(
        value
          .sourceInspectionMs
      ),

    pdfExtractionMs:
      finiteOrNull(
        value
          .pdfExtractionMs
      ),

    databaseReloadMs:
      finiteOrNull(
        value
          .databaseReloadMs
      ),

    parserMs:
      finiteOrNull(
        value.parserMs
      ),

    registrationMs:
      finiteOrNull(
        value
          .registrationMs
      ),

    totalMs:
      finiteOrNull(
        value.totalMs
      )
  }
}


function finiteOrNull(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null
  }


  const number =
    Number(
      value
    )


  return Number.isFinite(
    number
  )
    ? number
    : null
}


// =====================================================
// OUTILS INTERNES
// =====================================================

function resolveMaximumFiles(
  requestedValue
) {
  const configuredValue =
    Number(
      pdf.maximumFilesPerRun
    ) || 2


  const value =
    Number(
      requestedValue
    )


  const resolved =
    Number.isFinite(
      value
    )
      ? value
      : configuredValue


  return Math.max(
    1,

    Math.min(
      10,
      Math.floor(
        resolved
      )
    )
  )
}


function compareCandidates(
  first,
  second
) {
  if (
    first.canonical !==
    second.canonical
  ) {
    return first.canonical
      ? 1
      : -1
  }


  const firstTime =
    Date.parse(
      first.modifiedAt
    )


  const secondTime =
    Date.parse(
      second.modifiedAt
    )


  if (
    Number.isFinite(
      firstTime
    ) &&
    Number.isFinite(
      secondTime
    ) &&
    firstTime !==
      secondTime
  ) {
    return (
      firstTime -
      secondTime
    )
  }


  return first.fileName
    .localeCompare(
      second.fileName,

      "fr-FR",

      {
        numeric:
          true,

        sensitivity:
          "base"
      }
    )
}


function safeModificationDate(
  path
) {
  try {
    const value =
      fm.modificationDate(
        path
      )


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

  } catch (_) {
    return null
  }
}


function buildFingerprint({
  fileName,
  sizeKilobytes,
  modifiedAt
}) {
  return [
    String(
      fileName ||
      ""
    )
      .toLowerCase(),

    Number(
      sizeKilobytes
    ) || 0,

    String(
      modifiedAt ||
      ""
    )
  ].join("|")
}


function buildUniqueToken() {
  return [
    Date.now(),

    Math.random()
      .toString(
        36
      )
      .slice(
        2,
        10
      )
  ].join("-")
}


function isPdfFileName(
  fileName
) {
  return /\.pdf$/i.test(
    String(
      fileName ||
      ""
    )
  )
}


function isCanonicalPdfName(
  fileName
) {
  return /^Service_\d{4}-\d{2}-\d{2}_[A-Z0-9_-]+\.pdf$/i.test(
    String(
      fileName ||
      ""
    )
  )
}


function fileNameFromPath(
  path
) {
  return String(
    path ||
    ""
  )
    .split(
      /[\\/]/
    )
    .pop()
    .trim()
}


function removeFileQuietly(
  path
) {
  try {
    if (
      path &&
      fm.fileExists(
        path
      )
    ) {
      fm.remove(
        path
      )
    }
  } catch (_) {}
}


function errorMessage(
  error
) {
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
    "Erreur inconnue"
  )
}


// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  scanServices,
  listServicePdfs,
  loadScanState,
  resolveServiceForDate
}