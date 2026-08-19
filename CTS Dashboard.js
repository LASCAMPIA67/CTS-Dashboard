// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: cyan; icon-glyph: bus.fill;

const SCRIPT_STARTED_AT = Date.now()
const CONFIG = importModule("CTS Config")
const UTILS = importModule("CTS Utils")
const WIDGET_ENGINE = importModule("CTS Widget Engine")
const RENDERER = importModule("CTS Widget Renderer")

const ERROR_TITLE = "Erreur du Dashboard"
const ERROR_MESSAGE = "Le widget ne peut pas être affiché."
const ERROR_REFRESH_MS = 5 * 60 * 1000
const TELEMETRY_WIDGET_WAIT_MS = 1500

/*
 * Délai laissé au moteur pour retenir la vignette. Voir displayWidget.
 */
const WIDGET_COMMIT_YIELD_MS = 150

/*
 * Déclarée AVANT l'appel au point d'entrée.
 *
 * Placée plus bas, cette variable est inaccessible pendant toute
 * l'exécution — zone morte temporelle — et le widget échoue entièrement
 * sur « Cannot access 'runTrace' before initialization ». C'est le défaut
 * qui avait tué l'installateur 1.0.7, reproduit ici parce que le contrôle
 * de la CI ne surveillait que CTS Installer.js.
 */
let runTrace = null

const family = WIDGET_ENGINE.getWidgetFamily()
const analytics = loadAnalyticsClient()
const telemetryRun = createTelemetryRunSafely(analytics)

await main()
Script.complete()

async function main() {
  let context
  let widget

  try {
    CONFIG.ensureDirectories()

    /*
     * L'enregistrement d'activité part sans être attendu.
     *
     * Il était joint au chargement du contexte par un Promise.all, si
     * bien que l'affichage attendait une requête réseau — jusqu'à douze
     * secondes — avant même d'être construit. Une statistique ne doit
     * jamais retarder le service d'un conducteur.
     */
    registerAnalytics(analytics)

    context = await WIDGET_ENGINE.loadContext(new Date())
    applyContextTelemetrySafely(analytics, telemetryRun, context?.telemetry)
  } catch (error) {
    console.warn("[Dashboard]", UTILS.errorMessage(error))
    registerTelemetryIssueSafely(analytics, telemetryRun, {
      severity: "fatal",
      errorCode: "DASHBOARD_EXECUTION_FAILED",
      module: "Dashboard",
      stage: "startup"
    })
    context = {
      valid: false,
      errorTitle: ERROR_TITLE,
      errorMessage: UTILS.errorMessage(error),
      refreshAfterDate: new Date(Date.now() + ERROR_REFRESH_MS)
    }
  }

  recordRunTrace(context)

  try {
    widget = context.valid
      ? RENDERER.createWidget(family, context)
      : context.informational
        ? RENDERER.createInfoWidget(
            context.errorTitle || "Information",
            context.errorMessage || ""
          )
        : RENDERER.createErrorWidget(
            context.errorTitle || "Erreur",
            context.errorMessage || ERROR_MESSAGE
          )
    setTelemetryStageSafely(analytics, telemetryRun, "render", "success")
  } catch (error) {
    console.warn("[Dashboard]", UTILS.errorMessage(error))
    setTelemetryStageSafely(analytics, telemetryRun, "render", "error")
    registerTelemetryIssueSafely(analytics, telemetryRun, {
      severity: "fatal",
      errorCode: "WIDGET_RENDER_FAILED",
      module: "Dashboard",
      stage: "render"
    })
    widget = RENDERER.createErrorWidget(ERROR_TITLE, ERROR_MESSAGE)
  }

  if (UTILS.isValidDate(context?.refreshAfterDate)) {
    widget.refreshAfterDate = context.refreshAfterDate
  }

  await displayWidget(
    widget,
    family,
    sendTelemetrySafely(analytics, telemetryRun)
  )

  markRunCommitted()
}

/*
 * Trace de la dernière exécution, relue par le Diagnostic de CTS
 * Installer.
 *
 * Elle existe parce qu'un widget est aveugle : chez un collègue il
 * affichait « Analyse en cours » pendant que le même téléphone, à la
 * même minute, montrait son service correctement depuis Scriptable. Sans
 * trace, on ne pouvait qu'émettre des hypothèses — et j'en ai proposé
 * trois, toutes fausses, avant d'écrire ces quelques lignes.
 *
 * Elle ne contient que des états internes : ni nom, ni matricule, ni
 * horaire, ni numéro de service. Les titres enregistrés sont ceux,
 * figés, que le Dashboard sait produire.
 *
 * Elle est écrite directement, sans passer par CTS Storage : attendre
 * qu'iCloud déclare disponible une trace de diagnostic n'aurait aucun
 * sens, et son échec ne doit jamais empêcher l'affichage.
 */
function recordRunTrace(context) {
  runTrace = {
    at: new Date().toISOString(),
    version: CONFIG.dashboardVersion,
    surface: config.runsInWidget ? "widget" : "application",
    family,
    elapsedMs: Date.now() - SCRIPT_STARTED_AT,
    displayed: context?.valid
      ? "service"
      : String(context?.errorTitle || "inconnu"),
    source: String(context?.sourceOrigin || "none"),
    scan: String(context?.servicesScan?.status || "absent"),
    detected: Number(context?.servicesScan?.detected) || 0,
    /*
     * Produire un rendu et le faire retenir par iOS sont deux choses
     * différentes : un collègue avait la première sans la seconde. Écrit
     * à faux d'abord, ce drapeau ne passe à vrai que si l'exécution est
     * réellement allée jusqu'au bout.
     */
    committed: false
  }

  writeRunTrace()
}

function markRunCommitted() {
  if (!runTrace) return

  runTrace.committed = true
  runTrace.elapsedMs = Date.now() - SCRIPT_STARTED_AT

  writeRunTrace()
}

function writeRunTrace() {
  try {
    const fm = CONFIG.fm

    fm.writeString(
      fm.joinPath(CONFIG.paths.data, "last-run.json"),
      JSON.stringify(runTrace)
    )
  } catch (error) {
    console.warn("[Dashboard]", UTILS.errorMessage(error))
  }
}

function loadAnalyticsClient() {
  try {
    return importModule("CTS Analytics Client")
  } catch (error) {
    console.warn("[Analytics]", UTILS.errorMessage(error))
    return null
  }
}

function createTelemetryRunSafely(client) {
  if (!client || typeof client.createTelemetryRun !== "function") return null
  try {
    const run = client.createTelemetryRun({
      executionContext: config.runsInWidget ? "widget" : "app"
    })
    run.startedAt = SCRIPT_STARTED_AT
    return run
  } catch (error) {
    console.warn("[Analytics]", UTILS.errorMessage(error))
    return null
  }
}

async function registerAnalytics(client) {
  if (!client || typeof client.registerDailyActivity !== "function") return
  try {
    const result = await client.registerDailyActivity({
      dashboardVersion: CONFIG.dashboardVersion
    })
    if (!result?.ok) {
      console.warn("[Analytics]", result?.error || "Activité non enregistrée.")
    }
  } catch (error) {
    console.warn("[Analytics]", UTILS.errorMessage(error))
  }
}

function applyContextTelemetrySafely(client, run, telemetry) {
  if (!client || !run || !telemetry || typeof telemetry !== "object") return

  for (const [stage, status] of [
    ["pdf", telemetry.pdfStatus],
    ["parser", telemetry.parserStatus],
    ["service", telemetry.serviceStatus],
    ["archive", telemetry.archiveStatus]
  ]) {
    if (typeof status === "string" && status.trim()) {
      setTelemetryStageSafely(client, run, stage, status)
    }
  }

  for (const issue of Array.isArray(telemetry.issues) ? telemetry.issues : []) {
    registerTelemetryIssueSafely(client, run, {
      severity: issue?.severity,
      errorCode: issue?.errorCode,
      module: issue?.module,
      stage: issue?.stage
    })
  }
}

function setTelemetryStageSafely(client, run, stage, status) {
  if (!client || !run || typeof client.setTelemetryStage !== "function") return
  try {
    client.setTelemetryStage(run, stage, status)
  } catch (error) {
    console.warn("[Analytics]", UTILS.errorMessage(error))
  }
}

function registerTelemetryIssueSafely(client, run, issue) {
  if (!client || !run || typeof client.addTelemetryIssue !== "function") return
  try {
    client.addTelemetryIssue(run, issue)
  } catch (error) {
    console.warn("[Analytics]", UTILS.errorMessage(error))
  }
}

async function sendTelemetrySafely(client, run) {
  if (!client || !run || typeof client.registerTelemetrySafely !== "function") {
    return { ok: true, skipped: true, reason: "telemetry_unavailable" }
  }

  try {
    const requestPromise = client.registerTelemetrySafely({
      dashboardVersion: CONFIG.dashboardVersion,
      run
    })

    const result = config.runsInWidget
      ? await Promise.race([
          requestPromise,
          UTILS.sleep(TELEMETRY_WIDGET_WAIT_MS).then(() => ({
            ok: true,
            skipped: true,
            reason: "telemetry_wait_timeout"
          }))
        ])
      : await requestPromise

    logTelemetryFailure(result)
    return result
  } catch (error) {
    console.warn("[Analytics]", UTILS.errorMessage(error))
    return { ok: false, error: UTILS.errorMessage(error) }
  }
}

function logTelemetryFailure(result) {
  if (result?.ok === false) {
    console.warn("[Analytics]", result.error || "Télémétrie non enregistrée.")
  }
}

/*
 * Rien ne doit s'intercaler entre le rendu et sa validation.
 *
 * Script.setWidget ne suffit pas : iOS ne retient la nouvelle vignette
 * que si le script atteint Script.complete(). Or on attendait encore la
 * télémétrie — une requête réseau — juste après avoir posé le widget.
 * Quand iOS coupait le script pendant cette attente, le rendu était
 * perdu et l'écran d'accueil gardait l'image précédente.
 *
 * C'est ce qui restait chez un collègue : sa trace montrait un service
 * correctement construit en 149 ms, et sa tuile affichait toujours le
 * vieux message. Le widget travaillait bien, son travail n'était
 * simplement jamais validé.
 *
 * La télémétrie continue le temps que le script vit, et disparaît avec
 * lui sans rien réclamer. C'est ce que « best-effort » veut dire.
 */
async function displayWidget(widget, widgetFamily, telemetryPromise) {
  if (config.runsInWidget) {
    Script.setWidget(widget)

    /*
     * Rendre la main une fois avant de terminer.
     *
     * Script.complete() appelé dans la foulée de setWidget a livré une
     * vignette entièrement noire, sans le dégradé de fond ni le moindre
     * contenu : le moteur n'avait pas fini de retenir le widget. La
     * version précédente attendait la télémétrie à cet endroit, et cette
     * attente jouait ce rôle sans qu'on le sache — la supprimer a créé
     * l'écran noir.
     *
     * On rétablit donc la pause, mais bornée et détachée du réseau : la
     * télémétrie en profite si elle est prête, sinon elle est abandonnée.
     * Le rendu ne dépend plus de personne.
     */
    await Promise.race([
      telemetryPromise,
      UTILS.sleep(WIDGET_COMMIT_YIELD_MS)
    ])

    return
  }

  await Promise.all([presentWidget(widget, widgetFamily), telemetryPromise])
}

async function presentWidget(widget, widgetFamily) {
  if (widgetFamily === "small") return widget.presentSmall()
  if (widgetFamily === "medium") return widget.presentMedium()
  return widget.presentLarge()
}
