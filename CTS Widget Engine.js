// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-brown; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: cyan; icon-glyph: squares.below.rectangle;

// CTS Widget Engine.js
// Préparation centralisée des données du widget CTS.

const CONFIG =
  importModule("CTS Config")

const STORAGE =
  importModule("CTS Storage")

const UTILS =
  importModule("CTS Utils")

const SERVICE_ENGINE =
  importModule("CTS Service")

const SERVICES_MANAGER =
  importModule("CTS Services Manager")

const SERVICES_CLEANER =
  importModule("CTS Services Cleaner")

const SERVICES_SCAN_REFRESH_MS =
  15 * 60 * 1000

const PENDING_SCAN_REFRESH_MS =
  60 * 1000

const FAILED_SCAN_REFRESH_MS =
  5 * 60 * 1000

// =====================================================
// CHARGEMENT DU CONTEXTE
// =====================================================

async function loadContext(
  currentDate = new Date()
) {
  CONFIG.ensureDirectories()

  /*
   * 1. Détection et importation des PDF.
   * 2. Sélection du service approprié.
   */
  const resolution =
    await resolveServiceSource(
      currentDate
    )

  /*
   * 3. Archivage et suppression des anciens PDF.
   *
   * Une erreur de nettoyage ne doit jamais
   * empêcher l’affichage du widget.
   */
  const cleanup =
    await runServicesCleanup(
      currentDate
    )

  const source =
    resolution.source

  if (!source) {
    return buildMissingServiceFailure(
      resolution,
      currentDate
    )
  }

  const normalized =
    SERVICE_ENGINE.normalizeService(
      source
    )

  if (!normalized.valid) {
    return failure(
      "Service invalide",
      normalized.error,
      currentDate
    )
  }

  const service =
    normalized.service

  const state =
    SERVICE_ENGINE.computeState(
      service,
      currentDate
    )

  const stats =
    SERVICE_ENGINE.computeStats(
      service
    )

  const displaySlice =
    SERVICE_ENGINE.getDisplaySlice(
      service,
      state
    )

  if (!displaySlice) {
    return failure(
      "Service invalide",
      "Aucune tranche ne peut être affichée.",
      currentDate
    )
  }

  const serviceRefreshAfterDate =
    computeNextRefreshDate(
      service,
      state,
      currentDate
    )

  const automaticResolution = {
    ...resolution,

    cleanupResult:
      cleanup.result,

    cleanupError:
      cleanup.error
  }

  const switchAfterDate =
    computeSelectionSwitchDate(
      automaticResolution,
      currentDate
    )

  const refreshAfterDate =
    computeAutomaticRefreshDate(
      serviceRefreshAfterDate,
      automaticResolution,
      currentDate
    )

  return {
    valid: true,

    errorTitle: "",
    errorMessage: "",

    source,
    service,
    state,
    stats,
    displaySlice,

    currentDate,
    refreshAfterDate,
    switchAfterDate,

    sourceOrigin:
      resolution.origin,

    serviceSelection:
      resolution.selection,

    servicesScan:
      resolution.scanResult,

    servicesScanError:
      resolution.scanError,

    serviceSelectionError:
      resolution.selectionError,

    servicesCleanup:
      cleanup.result,

    servicesCleanupError:
      cleanup.error
  }
}

// =====================================================
// DÉTECTION ET SÉLECTION DU SERVICE
// =====================================================

async function resolveServiceSource(
  currentDate
) {
  const scan =
    await runServicesScan()

  const selection =
    await resolveIndexedService(
      currentDate
    )

  if (
    selection.result?.found &&
    selection.result.source
  ) {
    return {
      source:
        selection.result.source,

      origin:
        "services-index",

      selection:
        selection.result,

      scanResult:
        scan.result,

      scanError:
        scan.error,

      selectionError:
        selection.error
    }
  }

  /*
   * Secours de compatibilité :
   * si l’index ou le balayage rencontre un problème,
   * le dernier service valide reste affichable.
   */
  const legacySource =
    await STORAGE.loadService()

  if (legacySource) {
    return {
      source:
        legacySource,

      origin:
        "service-json-fallback",

      selection:
        selection.result,

      scanResult:
        scan.result,

      scanError:
        scan.error,

      selectionError:
        selection.error
    }
  }

  return {
    source:
      null,

    origin:
      "none",

    selection:
      selection.result,

    scanResult:
      scan.result,

    scanError:
      scan.error,

    selectionError:
      selection.error
  }
}

async function runServicesScan() {
  try {
    const maximumFiles =
      Math.max(
        1,

        Number(
          CONFIG.pdf
            ?.maximumFilesPerRun
        ) || 1
      )

    const result =
      await SERVICES_MANAGER
        .scanServices({
          maximumFiles
        })

    return {
      result,
      error: ""
    }
  } catch (error) {
    const safeError =
      UTILS.safeError(error)

    /*
     * Une erreur de balayage ne doit jamais
     * empêcher l’affichage d’un service connu.
     */
    return {
      result: null,

      error:
        safeError.message
    }
  }
}

async function resolveIndexedService(
  currentDate
) {
  try {
    const result =
      await SERVICES_MANAGER
        .resolveServiceForDate(
          currentDate
        )

    return {
      result,
      error: ""
    }
  } catch (error) {
    const safeError =
      UTILS.safeError(error)

    return {
      result: null,

      error:
        safeError.message
    }
  }
}

// =====================================================
// NETTOYAGE AUTOMATIQUE
// =====================================================

async function runServicesCleanup(
  currentDate
) {
  try {
    const result =
      await SERVICES_CLEANER
        .maintainServices(
          currentDate
        )

    return {
      result,

      error:
        extractCleanupError(
          result
        )
    }
  } catch (error) {
    const safeError =
      UTILS.safeError(error)

    /*
     * Une erreur d’entretien ne doit jamais
     * empêcher la création du widget.
     */
    return {
      result: null,

      error:
        safeError.message
    }
  }
}

function extractCleanupError(
  result
) {
  if (
    !result ||
    result.success !== false
  ) {
    return ""
  }

  const errors =
    Array.isArray(
      result.errors
    )
      ? result.errors
      : []

  const messages =
    errors
      .map(
        item =>
          String(
            item?.error || ""
          ).trim()
      )
      .filter(Boolean)

  if (messages.length) {
    return messages.join(
      " · "
    )
  }

  return (
    "L’entretien automatique des services a rencontré une erreur."
  )
}

// =====================================================
// DIAGNOSTIC D'ABSENCE DE SERVICE
// =====================================================

function buildMissingServiceFailure(
  resolution,
  currentDate
) {
  const scanResult =
    resolution?.scanResult

  const scanError =
    String(
      resolution?.scanError || ""
    ).trim()

  if (scanError) {
    return failure(
      "Erreur d’analyse PDF",
      [
        "Le dossier Services n’a pas pu être analysé.",
        "",
        scanError
      ].join("\n"),
      currentDate
    )
  }

  const detectionErrors =
    Array.isArray(
      scanResult?.detectionErrors
    )
      ? scanResult.detectionErrors
      : []

  if (detectionErrors.length) {
    const first =
      detectionErrors[0]

    const fileName =
      displayFileName(
        first?.fileName
      )

    const error =
      firstUsefulError(
        first
      )

    return failure(
      "PDF inaccessible",
      [
        `${fileName} a bien été détecté dans le dossier Services,`,
        "mais CTS Dashboard n’arrive pas à lire ce fichier.",
        "",
        error ||
          "Le fichier est peut-être indisponible dans iCloud."
      ].join("\n"),
      currentDate
    )
  }

  const currentFailures =
    Array.isArray(
      scanResult?.failed
    )
      ? scanResult.failed
      : []

  const knownFailures =
    Array.isArray(
      scanResult?.knownFailures
    )
      ? scanResult.knownFailures
      : []

  const failedImports =
    currentFailures.length
      ? currentFailures
      : knownFailures

  if (failedImports.length) {
    const first =
      failedImports[0]

    const fileName =
      displayFileName(
        first?.detectedFileName ||
        first?.sourceFileName
      )

    const error =
      firstUsefulError(
        first
      )

    const validationFailure =
      String(
        first?.status || ""
      ) === "validation-error"

    return failure(
      validationFailure
        ? "PDF HASTUS non reconnu"
        : "Erreur d’import PDF",

      [
        `${fileName} a bien été détecté dans le dossier Services.`,
        "",
        validationFailure
          ? "Le PDF a été lu, mais les informations nécessaires au service n’ont pas été reconnues."
          : "CTS Dashboard n’a pas réussi à importer ce PDF.",
        "",
        error
      ]
        .filter(
          value =>
            String(
              value || ""
            ).length > 0
        )
        .join("\n"),

      currentDate
    )
  }

  const selectionError =
    String(
      resolution?.selectionError || ""
    ).trim()

  if (selectionError) {
    return failure(
      "Erreur de service",
      [
        "Le PDF a été analysé, mais le service ne peut pas être sélectionné.",
        "",
        selectionError
      ].join("\n"),
      currentDate
    )
  }

  if (
    scanResult?.status ===
    "locked"
  ) {
    return failure(
      "Analyse en cours",
      [
        "Le dossier Services est déjà en cours d’analyse.",
        "",
        "Relance CTS Dashboard dans quelques instants."
      ].join("\n"),
      currentDate
    )
  }

  const detected =
    Math.max(
      0,
      Number(
        scanResult?.detected ??
        scanResult?.scanned ??
        0
      ) || 0
    )

  if (detected > 0) {
    return failure(
      "Aucun service exploitable",
      [
        `${detected} PDF${detected > 1 ? " ont" : " a"} été détecté${detected > 1 ? "s" : ""} dans Services,`,
        "mais aucun service exploitable n’est disponible.",
        "",
        "Relance CTS Dashboard. Si le problème persiste, vérifie le PDF concerné."
      ].join("\n"),
      currentDate
    )
  }

  return failure(
    "Aucun PDF",
    [
      "Aucun fichier PDF n’a été trouvé dans le dossier Services.",
      "",
      "Ajoute une carte agent HASTUS au format PDF dans Services."
    ].join("\n"),
    currentDate
  )
}

function firstUsefulError(
  value
) {
  const direct =
    String(
      value?.error || ""
    ).trim()

  if (direct) {
    return direct
  }

  const errors =
    Array.isArray(
      value?.errors
    )
      ? value.errors
          .map(
            item =>
              typeof item === "string"
                ? item
                : item?.message ||
                  item?.error ||
                  ""
          )
          .map(
            item =>
              String(
                item || ""
              ).trim()
          )
          .filter(Boolean)
      : []

  if (errors.length) {
    return errors.join(
      " · "
    )
  }

  const detailsMessage =
    String(
      value?.details?.message || ""
    ).trim()

  if (detailsMessage) {
    return detailsMessage
  }

  return ""
}

function displayFileName(
  value
) {
  const fileName =
    String(
      value || ""
    ).trim()

  return fileName ||
    "Le PDF"
}

// =====================================================
// ACTUALISATION AUTOMATIQUE
// =====================================================

function computeAutomaticRefreshDate(
  serviceRefreshAfterDate,
  resolution,
  currentDate
) {
  const scanRefreshAfterDate =
    computeScanRefreshDate(
      resolution,
      currentDate
    )

  const switchAfterDate =
    computeSelectionSwitchDate(
      resolution,
      currentDate
    )

  return earliestValidDate(
    [
      serviceRefreshAfterDate,
      scanRefreshAfterDate,
      switchAfterDate
    ],

    new Date(
      currentDate.getTime() +
      SERVICES_SCAN_REFRESH_MS
    )
  )
}

function computeSelectionSwitchDate(
  resolution,
  currentDate
) {
  const rawSwitchAfter =
    String(
      resolution?.selection
        ?.switchAfter ||
      ""
    ).trim()

  if (!rawSwitchAfter) {
    return null
  }

  const switchAfterDate =
    new Date(
      rawSwitchAfter
    )

  if (
    !isValidDate(
      switchAfterDate
    )
  ) {
    return null
  }

  /*
   * Une date déjà passée ne doit pas provoquer
   * une boucle d’actualisations immédiates.
   */
  if (
    switchAfterDate.getTime() <=
    currentDate.getTime()
  ) {
    return null
  }

  return switchAfterDate
}

function computeScanRefreshDate(
  resolution,
  currentDate
) {
  const scanResult =
    resolution?.scanResult

  let delay =
    SERVICES_SCAN_REFRESH_MS

  /*
   * Une nouvelle tentative est demandée
   * rapidement si un traitement est en attente.
   */
  if (
    scanResult?.status ===
      "locked" ||
    Number(
      scanResult?.remaining
    ) > 0
  ) {
    delay =
      PENDING_SCAN_REFRESH_MS
  }

  /*
   * Une erreur de balayage, de sélection
   * ou d’entretien déclenche une nouvelle
   * tentative au bout de cinq minutes.
   */
  if (
    resolution?.scanError ||
    resolution?.selectionError ||
    resolution?.cleanupError
  ) {
    delay =
      FAILED_SCAN_REFRESH_MS
  }

  return new Date(
    currentDate.getTime() +
    delay
  )
}

function earliestValidDate(
  values,
  fallback
) {
  const validDates =
    values
      .filter(
        isValidDate
      )
      .sort(
        (
          first,
          second
        ) =>
          first.getTime() -
          second.getTime()
      )

  if (validDates.length) {
    return validDates[0]
  }

  return fallback
}

// =====================================================
// ACTUALISATION SELON L’ÉTAT DU SERVICE
// =====================================================

function computeNextRefreshDate(
  service,
  state,
  currentDate = new Date()
) {
  const fallbackRefreshDate =
    new Date(
      currentDate.getTime() +
      CONFIG.refresh.unknownMs
    )

  if (
    !service ||
    !state ||
    !Array.isArray(
      service.slices
    ) ||
    service.slices.length === 0
  ) {
    return fallbackRefreshDate
  }

  const serviceDate =
    UTILS.parseDate(
      service.date
    )

  if (!serviceDate) {
    return fallbackRefreshDate
  }

  const firstSlice =
    service.slices[0]

  switch (state.type) {
    case "NEXT":
    case "BEFORE":
      return dateForServiceTime(
        serviceDate,
        firstSlice.dutyStart,
        CONFIG.refresh
          .transitionDelaySeconds
      )

    case "WORK":
      return computeWorkRefreshDate(
        serviceDate,
        state,
        currentDate
      )

    case "PAUSE":
    case "CUT":
      if (
        state.next &&
        UTILS.isValidTime(
          state.next.start
        )
      ) {
        return dateForServiceTime(
          serviceDate,
          state.next.start,
          CONFIG.refresh
            .transitionDelaySeconds
        )
      }

      return fallbackRefreshDate

    case "DONE":
      return new Date(
        currentDate.getTime() +
        CONFIG.refresh.inactiveMs
      )

    default:
      return fallbackRefreshDate
  }
}

function computeWorkRefreshDate(
  serviceDate,
  state,
  currentDate
) {
  const activeRefreshDate =
    new Date(
      currentDate.getTime() +
      CONFIG.refresh.activeMs
    )

  if (
    !state.current ||
    !UTILS.isValidTime(
      state.current.end
    )
  ) {
    return activeRefreshDate
  }

  const sliceEndDate =
    dateForServiceTime(
      serviceDate,
      state.current.end,
      CONFIG.refresh
        .transitionDelaySeconds
    )

  return (
    activeRefreshDate <
    sliceEndDate
  )
    ? activeRefreshDate
    : sliceEndDate
}

function dateForServiceTime(
  serviceDate,
  time,
  extraSeconds = 0
) {
  if (
    !serviceDate ||
    typeof serviceDate
      .getFullYear !==
      "function" ||
    !UTILS.isValidTime(time)
  ) {
    return new Date()
  }

  const [
    hours,
    minutes
  ] = time
    .split(":")
    .map(Number)

  return new Date(
    serviceDate.getFullYear(),
    serviceDate.getMonth(),
    serviceDate.getDate(),
    hours,
    minutes,
    Number(extraSeconds) || 0,
    0
  )
}

// =====================================================
// INFORMATIONS D’AFFICHAGE
// =====================================================

function departureInfoText(
  slice
) {
  if (!slice) {
    return ""
  }

  const information = []

  if (slice.lineUpAt) {
    information.push(
      `Mise en ligne à ${slice.lineUpAt}`
    )
  }

  if (slice.direction) {
    information.push(
      `Direction ${slice.direction}`
    )
  }

  return information.join(
    " · "
  )
}

function formatServiceDate(
  service
) {
  const serviceDate =
    UTILS.parseDate(
      service?.date
    )

  return UTILS.formatDateLong(
    serviceDate
  )
}

function getWidgetFamily() {
  const family =
    String(
      config.widgetFamily ||
      "large"
    )

  if (
    family === "small" ||
    family === "medium" ||
    family === "large"
  ) {
    return family
  }

  return "large"
}

// =====================================================
// ÉCHEC SÉCURISÉ
// =====================================================

function failure(
  title,
  message,
  currentDate = new Date()
) {
  return {
    valid: false,

    errorTitle:
      String(
        title || "Erreur"
      ),

    errorMessage:
      String(
        message ||
        "Une erreur inconnue est survenue."
      ),

    source: null,
    service: null,
    state: null,
    stats: null,
    displaySlice: null,

    currentDate,

    refreshAfterDate:
      new Date(
        currentDate.getTime() +
        CONFIG.refresh.unknownMs
      ),

    switchAfterDate:
      null,

    sourceOrigin:
      "none",

    serviceSelection:
      null,

    servicesScan:
      null,

    servicesScanError:
      "",

    serviceSelectionError:
      "",

    servicesCleanup:
      null,

    servicesCleanupError:
      ""
  }
}

// =====================================================
// OUTILS INTERNES
// =====================================================

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

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  loadContext,
  computeNextRefreshDate,
  dateForServiceTime,
  departureInfoText,
  formatServiceDate,
  getWidgetFamily
}
