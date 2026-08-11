// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: clock;

// CTS Simulator.js
// Outil de maintenance : affiche le widget CTS Dashboard tel qu'il
// serait à une date et une heure choisies.
//
// Ce script n'est pas distribué par CTS Installer : il ne figure pas
// dans version.json et n'est installé qu'à la main par le mainteneur.
//
// Il analyse le dossier Services comme le fait le Dashboard, avec
// l'heure réelle, afin qu'un PDF déposé juste avant soit pris en
// compte. Il ne déclenche jamais l'archivage : maintainServices avec
// une date simulée supprimerait de vrais PDF.

const CONFIG =
  importModule("CTS Config")

const STORAGE =
  importModule("CTS Storage")

const SERVICES_MANAGER =
  importModule("CTS Services Manager")

const SERVICE_ENGINE =
  importModule("CTS Service")

const RENDERER =
  importModule("CTS Widget Renderer")

const UTILS =
  importModule("CTS Utils")

await runSimulator()

Script.complete()

// =====================================================
// SIMULATEUR PRINCIPAL
// =====================================================

async function runSimulator() {
  CONFIG.ensureDirectories()

  /*
   * On lance d'abord le même balayage que le
   * Dashboard afin que les PDF présents dans
   * Services puissent être importés et indexés.
   *
   * IMPORTANT :
   * aucun nettoyage n'est exécuté avec la date
   * simulée.
   */
  const scanResult =
    await runSafeScan()

  const index =
    await STORAGE.readJson(
      CONFIG.files.servicesIndex,
      null
    )

  const entries =
    getUsableEntries(
      index
    )

  if (!entries.length) {
    await showAlert(
      "CTS Simulator",
      [
        "Aucun service indexé n'a été trouvé.",
        "",
        buildScanSummary(scanResult),
        "",
        "Ajoute une carte agent PDF dans le dossier Services puis relance le simulateur."
      ].join("\n")
    )

    return
  }

  const request =
    await requestSimulation(
      entries
    )

  if (!request) {
    return
  }

  const validation =
    validateRequest(
      request
    )

  if (!validation.valid) {
    await showAlert(
      "Simulation invalide",
      validation.error
    )

    return
  }

  const requestedEntry =
    findRequestedEntry(
      entries,
      request.service,
      request.date
    )

  if (!requestedEntry) {
    await showMissingServiceAlert(
      entries,
      request
    )

    return
  }

  const simulatedDate =
    buildSimulatedDate(
      request.date,
      request.time
    )

  if (!simulatedDate) {
    await showAlert(
      "Simulation impossible",
      "La date ou l'heure simulée n'a pas pu être construite."
    )

    return
  }

  /*
   * C'est ici que nous testons réellement
   * CTS Services Manager :
   *
   * il doit retrouver, à partir de la date
   * simulée, le service que le Dashboard
   * sélectionnerait normalement.
   */
  const selection =
    await SERVICES_MANAGER
      .resolveServiceForDate(
        simulatedDate
      )

  if (
    !selection?.found ||
    !selection.source
  ) {
    await showAlert(
      "Service non sélectionné",
      [
        `Demandé : ${request.service}`,
        `Date : ${request.date}`,
        `Heure : ${request.time}`,
        "",
        `Résultat du sélecteur : ${selection?.reason || "inconnu"}`,
        "",
        "Le service existe dans l'index mais CTS Services Manager ne l'a pas sélectionné."
      ].join("\n")
    )

    return
  }

  const selectionMatches =
    sameService(
      selection,
      request
    )

  if (!selectionMatches) {
    const continueSimulation =
      await confirmDifferentSelection(
        request,
        selection
      )

    if (!continueSimulation) {
      return
    }
  }

  const normalized =
    SERVICE_ENGINE
      .normalizeService(
        selection.source
      )

  if (!normalized.valid) {
    await showAlert(
      "Service invalide",
      normalized.error
    )

    return
  }

  const service =
    normalized.service

  const state =
    SERVICE_ENGINE.computeState(
      service,
      simulatedDate
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
    await showAlert(
      "Simulation impossible",
      "Aucune tranche ne peut être affichée pour cette simulation."
    )

    return
  }

  const context = {
    valid: true,

    source:
      selection.source,

    service,
    state,
    stats,
    displaySlice,

    currentDate:
      simulatedDate,

    refreshAfterDate:
      null,

    switchAfterDate:
      null,

    sourceOrigin:
      "simulator-services-index",

    serviceSelection:
      selection,

    servicesScan:
      scanResult,

    servicesScanError:
      "",

    serviceSelectionError:
      "",

    servicesCleanup:
      null,

    servicesCleanupError:
      ""
  }

  const diagnostic =
    buildDiagnostic({
      request,
      requestedEntry,
      selection,
      scanResult,
      service,
      state,
      displaySlice,
      simulatedDate
    })

  Pasteboard.copyString(
    JSON.stringify(
      diagnostic,
      null,
      2
    )
  )

  const ready =
    await showReadyAlert(
      diagnostic
    )

  if (!ready) {
    return
  }

  const widget =
    RENDERER.createWidget(
      "large",
      context
    )

  await widget.presentLarge()
}

// =====================================================
// BALAYAGE DES SERVICES
// =====================================================

async function runSafeScan() {
  try {
    return await SERVICES_MANAGER
      .scanServices({
        maximumFiles: 10
      })
  } catch (error) {
    return {
      success: false,
      status: "exception",
      scanned: 0,
      candidates: 0,
      processed: 0,
      imported: [],
      failed: [],
      remaining: 0,
      error:
        error?.message ||
        String(error)
    }
  }
}

// =====================================================
// SAISIE DE LA SIMULATION
// =====================================================

async function requestSimulation(
  entries
) {
  const latest =
    getLatestEntry(
      entries
    )

  const alert =
    new Alert()

  alert.title =
    "CTS Simulator"

  alert.message = [
    "Entre le service, sa date et l'heure à simuler.",
    "",
    "Les horaires après minuit sont acceptés : 25:20, 26:05, etc."
  ].join("\n")

  alert.addTextField(
    "Service — ex. YL62",
    latest?.service ||
      "YL62"
  )

  alert.addTextField(
    "Date — AAAA-MM-JJ",
    latest?.date ||
      "2026-02-16"
  )

  alert.addTextField(
    "Heure — HH:mm",
    "15:55"
  )

  alert.addAction(
    "Simuler"
  )

  alert.addCancelAction(
    "Annuler"
  )

  const choice =
    await alert.present()

  if (choice === -1) {
    return null
  }

  return {
    service:
      normalizeServiceNumber(
        alert.textFieldValue(
          0
        )
      ),

    date:
      String(
        alert.textFieldValue(
          1
        ) || ""
      ).trim(),

    time:
      UTILS.normalizeTime(
        alert.textFieldValue(
          2
        )
      )
  }
}

// =====================================================
// VALIDATION
// =====================================================

function validateRequest(
  request
) {
  if (!request.service) {
    return {
      valid: false,
      error:
        "Le numéro de service est vide."
    }
  }

  if (
    !/^[A-Z][A-Z]\d{1,3}$/.test(
      request.service
    )
  ) {
    return {
      valid: false,
      error:
        "Le numéro de service est invalide. Exemple : YL62, TS70 ou EM09."
    }
  }

  if (
    !UTILS.parseDate(
      request.date
    )
  ) {
    return {
      valid: false,
      error:
        "La date est invalide. Utilise le format AAAA-MM-JJ, par exemple 2026-02-16."
    }
  }

  if (
    !UTILS.isValidTime(
      request.time
    )
  ) {
    return {
      valid: false,
      error:
        "L'heure est invalide. Utilise HH:mm, par exemple 15:55 ou 25:20."
    }
  }

  return {
    valid: true,
    error: ""
  }
}

// =====================================================
// INDEX DES SERVICES
// =====================================================

function getUsableEntries(
  index
) {
  const services =
    Array.isArray(
      index?.services
    )
      ? index.services
      : []

  return services
    .filter(
      entry =>
        Boolean(
          entry &&
          typeof entry ===
            "object" &&
          !Array.isArray(
            entry
          ) &&
          String(
            entry.service ||
            ""
          ).trim() &&
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
    )
    .sort(
      compareEntriesNewestFirst
    )
}

function getLatestEntry(
  entries
) {
  return entries.length
    ? entries[0]
    : null
}

function findRequestedEntry(
  entries,
  service,
  date
) {
  const matches =
    entries.filter(
      entry =>
        normalizeServiceNumber(
          entry.service
        ) === service &&
        String(
          entry.date ||
          ""
        ) === date
    )

  if (!matches.length) {
    return null
  }

  return matches
    .sort(
      compareEntriesNewestFirst
    )[0]
}

function compareEntriesNewestFirst(
  first,
  second
) {
  const byDate =
    String(
      second.date ||
      ""
    ).localeCompare(
      String(
        first.date ||
        ""
      )
    )

  if (byDate !== 0) {
    return byDate
  }

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

  const safeFirst =
    Number.isFinite(
      firstTime
    )
      ? firstTime
      : 0

  const safeSecond =
    Number.isFinite(
      secondTime
    )
      ? secondTime
      : 0

  return (
    safeSecond -
    safeFirst
  )
}

// =====================================================
// DATE SIMULÉE
// =====================================================

function buildSimulatedDate(
  dateValue,
  timeValue
) {
  const date =
    UTILS.parseDate(
      dateValue
    )

  const totalMinutes =
    UTILS.toMinutes(
      timeValue
    )

  if (
    !date ||
    !Number.isFinite(
      totalMinutes
    )
  ) {
    return null
  }

  const dayOffset =
    Math.floor(
      totalMinutes /
      (24 * 60)
    )

  const minuteOfDay =
    totalMinutes %
    (24 * 60)

  const hours =
    Math.floor(
      minuteOfDay /
      60
    )

  const minutes =
    minuteOfDay %
    60

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() +
      dayOffset,
    hours,
    minutes,
    0,
    0
  )
}

// =====================================================
// CONTRÔLE DE LA SÉLECTION
// =====================================================

function sameService(
  selection,
  request
) {
  return (
    normalizeServiceNumber(
      selection?.service
    ) ===
      request.service &&
    String(
      selection?.date ||
      ""
    ) ===
      request.date
  )
}

async function confirmDifferentSelection(
  request,
  selection
) {
  const alert =
    new Alert()

  alert.title =
    "Sélection différente"

  alert.message = [
    "Le service demandé existe dans l'index, mais le sélecteur automatique du Dashboard en a choisi un autre pour cette date et cette heure.",
    "",
    `Demandé : ${request.service} · ${request.date}`,
    `Sélectionné : ${selection.service || "?"} · ${selection.date || "?"}`,
    `Raison : ${selection.reason || "inconnue"}`,
    "",
    "C'est une information importante : le Dashboard réel ferait la même sélection.",
    "",
    "Tu peux afficher le service réellement sélectionné pour le diagnostic."
  ].join("\n")

  alert.addAction(
    "Afficher"
  )

  alert.addCancelAction(
    "Annuler"
  )

  const choice =
    await alert.present()

  return choice !== -1
}

// =====================================================
// SERVICE INTROUVABLE
// =====================================================

async function showMissingServiceAlert(
  entries,
  request
) {
  const sameNumber =
    entries
      .filter(
        entry =>
          normalizeServiceNumber(
            entry.service
          ) ===
            request.service
      )
      .slice(
        0,
        6
      )

  const knownDates =
    sameNumber.length
      ? [
          "",
          "Dates indexées pour ce service :",
          ...sameNumber.map(
            entry =>
              `• ${entry.date}`
          )
        ]
      : []

  await showAlert(
    "Service non indexé",
    [
      `${request.service} n'est pas indexé pour le ${request.date}.`,
      ...knownDates,
      "",
      "Si le PDF vient d'être ajouté, vérifie qu'il se trouve bien dans le dossier Services."
    ].join("\n")
  )
}

// =====================================================
// DIAGNOSTIC
// =====================================================

function buildDiagnostic({
  request,
  requestedEntry,
  selection,
  scanResult,
  service,
  state,
  displaySlice,
  simulatedDate
}) {
  return {
    requested: {
      service:
        request.service,

      date:
        request.date,

      time:
        request.time
    },

    simulatedDate:
      simulatedDate
        .toISOString(),

    scan: {
      success:
        scanResult?.success ??
        false,

      status:
        scanResult?.status ||
        "",

      scanned:
        Number(
          scanResult?.scanned
        ) || 0,

      candidates:
        Number(
          scanResult?.candidates
        ) || 0,

      processed:
        Number(
          scanResult?.processed
        ) || 0,

      imported:
        Array.isArray(
          scanResult?.imported
        )
          ? scanResult.imported.length
          : 0,

      failed:
        Array.isArray(
          scanResult?.failed
        )
          ? scanResult.failed.length
          : 0,

      remaining:
        Number(
          scanResult?.remaining
        ) || 0,

      error:
        scanResult?.error ||
        ""
    },

    requestedIndexEntry: {
      service:
        requestedEntry?.service ||
        "",

      date:
        requestedEntry?.date ||
        "",

      pdfFile:
        requestedEntry?.pdfFile ||
        "",

      cacheFile:
        requestedEntry?.cacheFile ||
        ""
    },

    selection: {
      found:
        Boolean(
          selection?.found
        ),

      reason:
        selection?.reason ||
        "",

      service:
        selection?.service ||
        "",

      date:
        selection?.date ||
        "",

      pdfFile:
        selection?.pdfFile ||
        "",

      cacheFile:
        selection?.cacheFile ||
        "",

      serviceEndAt:
        selection?.serviceEndAt ||
        "",

      switchAfter:
        selection?.switchAfter ||
        "",

      withinGracePeriod:
        Boolean(
          selection?.withinGracePeriod
        )
    },

    service: {
      number:
        service.number,

      date:
        service.date,

      slices:
        service.slices.length
    },

    state: {
      type:
        state.type,

      label:
        state.label,

      remaining:
        state.remaining
    },

    displaySlice: {
      index:
        displaySlice.index,

      lineCode:
        displaySlice.lineCode,

      line:
        displaySlice.line,

      vehicle:
        displaySlice.vehicle,

      dutyStart:
        displaySlice.dutyStart,

      start:
        displaySlice.start,

      end:
        displaySlice.end,

      from:
        displaySlice.from,

      to:
        displaySlice.to,

      depotExitAt:
        displaySlice.depotExitAt,

      lineUpAt:
        displaySlice.lineUpAt,

      direction:
        displaySlice.direction
    }
  }
}

// =====================================================
// ÉCRAN AVANT LE WIDGET
// =====================================================

async function showReadyAlert(
  diagnostic
) {
  const slice =
    diagnostic.displaySlice

  const selection =
    diagnostic.selection

  const alert =
    new Alert()

  alert.title =
    "Simulation prête"

  alert.message = [
    `${selection.service} · ${diagnostic.requested.time}`,
    "",
    `Sélection : ${selection.reason}`,
    `Ligne ${slice.line} · Voiture ${slice.vehicle}`,
    `${slice.from} → ${slice.to}`,
    "",
    `État : ${diagnostic.state.label}`,
    "",
    "Le diagnostic complet a été copié dans le presse-papiers."
  ].join("\n")

  alert.addAction(
    "Afficher le widget"
  )

  alert.addCancelAction(
    "Annuler"
  )

  const choice =
    await alert.present()

  return choice !== -1
}

// =====================================================
// OUTILS
// =====================================================

function normalizeServiceNumber(
  value
) {
  return String(
    value ||
    ""
  )
    .trim()
    .toUpperCase()
}

function buildScanSummary(
  result
) {
  if (!result) {
    return (
      "Balayage : aucun résultat."
    )
  }

  if (
    result.status ===
    "locked"
  ) {
    return (
      "Balayage : déjà en cours."
    )
  }

  if (
    result.success ===
    false
  ) {
    return (
      `Balayage : erreur${
        result.error
          ? ` — ${result.error}`
          : ""
      }`
    )
  }

  return [
    "Balayage : OK",
    `PDF : ${Number(result.scanned) || 0}`,
    `Traités : ${Number(result.processed) || 0}`,
    `Importés : ${
      Array.isArray(result.imported)
        ? result.imported.length
        : 0
    }`
  ].join(" · ")
}

async function showAlert(
  title,
  message
) {
  const alert =
    new Alert()

  alert.title =
    String(
      title ||
      ""
    )

  alert.message =
    String(
      message ||
      ""
    )

  alert.addAction(
    "OK"
  )

  await alert.present()
}