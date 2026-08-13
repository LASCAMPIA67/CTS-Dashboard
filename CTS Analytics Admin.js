// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: chart.bar.xaxis;

/*
 * CTS Analytics Admin — console de statistiques du projet CTS Dashboard.
 *
 * Elle ne mesure rien elle-même. Chaque iPhone équipé du Dashboard envoie
 * au Worker Cloudflare une inscription anonyme, une activité quotidienne
 * et une télémétrie par exécution ; ce script lit l'agrégat renvoyé par
 * GET /stats et le met en forme.
 *
 * Principe de rédaction : ne jamais afficher un chiffre que le serveur
 * n'a pas envoyé. Tout ce qui manque est signalé comme manquant, jamais
 * remplacé par un zéro qui se ferait passer pour une mesure.
 *
 * Fenêtres réellement calculées par le Worker, et donc les seules
 * affichables : aujourd'hui, 24 heures, 7 jours, 30 jours. Certaines
 * mesures — taux de succès, durées, étapes du pipeline — n'existent que
 * sur 7 jours ; elles portent alors la marque « 7 J » à l'écran.
 */

const analytics = importModule("CTS Analytics Client")
const fm = FileManager.iCloud()

const ADMIN_VERSION = "2.0"

/* Bornes d'affichage, généreuses : le serveur en renvoie autant. */
const MAX_TOP_ISSUES = 30
const MAX_RECENT_ISSUES = 50
const MAX_RECENT_INSTALLATIONS = 20
const HISTORY_DAYS = 30

/* Une installation sans signe de vie depuis ce délai est dite dormante. */
const DORMANT_DAYS = 30

/*
 * Pondération du score de santé. La fiabilité pèse la moitié parce
 * qu'un widget qui échoue est un conducteur qui ne sait pas quand il
 * prend son service ; l'adoption et l'activité comptent moins parce
 * qu'elles dépendent des collègues, pas du code.
 */
const HEALTH_WEIGHTS = {
  reliability: 50,
  errorFreeUsers: 25,
  adoption: 15,
  activity: 10
}

/*
 * Sections attendues dans la réponse de GET /stats. L'écran « Données
 * brutes » compare cette liste à ce que le serveur envoie réellement :
 * quand le Worker évoluera, le manque se verra là avant de se traduire
 * par un chiffre faux ailleurs.
 *
 * Toutes les constantes de premier niveau sont déclarées avant l'appel
 * à main(). Une déclaration placée plus bas resterait dans sa zone morte
 * temporelle pendant toute l'exécution et lèverait « Cannot access …
 * before initialization » au moment précis où le chemin y passe.
 */
const EXPECTED_SECTIONS = [
  "summary",
  "telemetrySummary",
  "issueSummary",
  "pipelineSummary",
  "versions",
  "iosVersions",
  "telemetryVersions",
  "telemetryIOSVersions",
  "topIssues",
  "recentIssues",
  "activityHistory",
  "installationHistory",
  "recentInstallations"
]

const COLORS = {
  red: new Color("#E30613"),
  blue: new Color("#0A84FF"),
  green: new Color("#28A745"),
  orange: new Color("#F08C00"),
  purple: new Color("#8E5BF0"),
  teal: new Color("#0FA3A3"),
  gray: new Color("#8E8E93"),

  secondary: Color.dynamic(
    new Color("#6D6D72"),
    new Color("#98989D")
  ),

  primary: Color.dynamic(
    new Color("#111111"),
    new Color("#F5F5F7")
  ),

  faint: Color.dynamic(
    new Color("#C7C7CC"),
    new Color("#48484A")
  )
}

const DATE_FORMATTER = new DateFormatter()
DATE_FORMATTER.locale = "fr_FR"
DATE_FORMATTER.dateFormat = "dd/MM/yyyy à HH:mm"

const DAY_FORMATTER = new DateFormatter()
DAY_FORMATTER.locale = "fr_FR"
DAY_FORMATTER.dateFormat = "dd/MM"

/*
 * Tout l'état de la console tient ici. Les écrans se redessinent à
 * partir de cet objet : aucune vue ne conserve sa propre copie, ce qui
 * évite qu'un rafraîchissement laisse un écran en arrière.
 */
const state = {
  payload: null,
  fetchedAt: null,
  fromCache: false,
  loading: false,
  period: "7d",
  severityFilter: "all",
  health: null,
  healthCheckedAt: null,
  healthDurationMs: null
}

await main()
Script.complete()

// =====================================================
// LANCEMENT
// =====================================================

async function main() {
  try {
    await ensureAdminKey()

    const loaded = await loadStatistics()

    /*
     * Un échec est toujours annoncé, même quand le cache permettrait
     * d'afficher quelque chose : une clé devenue invalide qui laisse
     * apparaître de vieux chiffres est pire qu'un écran d'erreur. Après
     * l'alerte, on repart du cache — sauf sur un 401, où il n'y a plus
     * rien à administrer tant que la clé n'est pas ressaisie.
     */
    if (!loaded.ok) {
      await handleApiError(loaded)

      if (loaded.statusCode === 401 || !state.payload) return
    }

    await presentDashboard()
  } catch (error) {
    await showAlert("CTS Analytics", messageOf(error))
  }
}

/*
 * Le cache sert de filet : sans réseau la console s'ouvre quand même,
 * avec la date de la dernière réponse affichée en clair. Une statistique
 * périmée annoncée comme telle vaut mieux qu'un écran vide.
 */
async function loadStatistics({ force = false } = {}) {
  if (!force) {
    const cached = readCache()

    if (cached) {
      state.payload = cached.payload
      state.fetchedAt = cached.fetchedAt
      state.fromCache = true
    }
  }

  const result = await analytics.getStatistics()

  if (result.ok && isRecord(result.data)) {
    state.payload = result.data
    state.fetchedAt = new Date().toISOString()
    state.fromCache = false
    writeCache(result.data)
  }

  return result
}

// =====================================================
// CLÉ ADMINISTRATEUR
// =====================================================

async function ensureAdminKey() {
  if (analytics.hasAdminApiKey()) return

  const alert = new Alert()

  alert.title = "Configuration administrateur"

  alert.message = [
    "Saisissez votre clé ADMIN_API_KEY.",
    "",
    "Elle sera enregistrée uniquement dans le Keychain sécurisé de cet iPhone."
  ].join("\n")

  alert.addSecureTextField("ADMIN_API_KEY")
  alert.addAction("Enregistrer")
  alert.addCancelAction("Annuler")

  if (await alert.presentAlert() !== 0) {
    throw new Error("Configuration annulée.")
  }

  const value = alert.textFieldValue(0).trim()

  if (!value) throw new Error("La clé administrateur est vide.")

  analytics.saveAdminApiKey(value)
}

async function replaceAdminKey() {
  const alert = new Alert()

  alert.title = "Modifier la clé administrateur"
  alert.message = "Saisissez la nouvelle valeur de ADMIN_API_KEY."

  alert.addSecureTextField("Nouvelle clé")
  alert.addAction("Enregistrer")
  alert.addCancelAction("Annuler")

  if (await alert.presentAlert() !== 0) return

  const value = alert.textFieldValue(0).trim()

  if (!value) {
    await showAlert("Clé non modifiée", "La valeur saisie est vide.")
    return
  }

  analytics.saveAdminApiKey(value)

  await showAlert(
    "Clé mise à jour",
    "La nouvelle clé administrateur a été enregistrée dans le Keychain."
  )
}

// =====================================================
// MODÈLE
// =====================================================

/*
 * Une seule lecture du JSON, un seul modèle. Les noms de champs du
 * Worker sont en snake_case ; les variantes camelCase sont acceptées
 * pour survivre à une évolution du serveur sans planter.
 */
function derive(payload) {
  const root = recordOf(payload)
  const summary = recordOf(root.summary)
  const telemetry = recordOf(root.telemetrySummary)
  const issues = recordOf(root.issueSummary)
  const pipeline = recordOf(root.pipelineSummary)

  const installations = {
    total: num(summary, ["total_installations", "totalInstallations"]),
    activeToday: num(summary, ["active_today", "activeToday"]),
    active24h: num(summary, ["active_24h", "active24h"]),
    active7d: num(summary, ["active_7d", "active7d"]),
    active30d: num(summary, ["active_30d", "active30d"]),
    totalLaunches: num(summary, ["total_launches", "totalLaunches"]),
    newToday: num(summary, ["new_installations_today", "newInstallationsToday"]),
    new7d: num(summary, ["new_installations_7d", "newInstallations7d"]),
    new30d: num(summary, ["new_installations_30d", "newInstallations30d"]),
    latestInstallationAt: raw(summary, ["latest_installation_at", "latestInstallationAt"]),
    latestActivityAt: raw(summary, ["latest_activity_at", "latestActivityAt"])
  }

  const runs = {
    total: num(telemetry, ["total_runs", "totalRuns"]),
    installationsWithRuns: num(telemetry, ["installations_with_runs", "installationsWithRuns"]),
    today: num(telemetry, ["runs_today", "runsToday"]),
    last24h: num(telemetry, ["runs_24h", "runs24h"]),
    last7d: num(telemetry, ["runs_7d", "runs7d"]),
    last30d: num(telemetry, ["runs_30d", "runs30d"]),
    successes7d: num(telemetry, ["successes_7d", "successes7d"]),
    warnings7d: num(telemetry, ["warnings_7d", "warnings7d"]),
    errors7d: num(telemetry, ["errors_7d", "errors7d"]),
    affected7d: num(telemetry, ["affected_installations_7d", "affectedInstallations7d"]),
    successRate7d: nullableNum(telemetry, ["success_rate_7d", "successRate7d"]),
    averageDuration7d: nullableNum(telemetry, ["average_duration_ms_7d", "averageDurationMs7d"]),
    maximumDuration7d: nullableNum(telemetry, ["maximum_duration_ms_7d", "maximumDurationMs7d"]),
    latestRunAt: raw(telemetry, ["latest_run_at", "latestRunAt"])
  }

  const diagnostics = {
    total: num(issues, ["total_issues", "totalIssues"]),
    last24h: num(issues, ["issues_24h", "issues24h"]),
    last7d: num(issues, ["issues_7d", "issues7d"]),
    last30d: num(issues, ["issues_30d", "issues30d"]),
    warnings7d: num(issues, ["warnings_7d", "warning_7d", "warnings7d"]),
    errors7d: num(issues, ["errors_7d", "error_7d", "errors7d"]),
    fatal7d: num(issues, ["fatal_7d", "fatal7d"]),
    affected7d: num(issues, ["affected_installations_7d", "affectedInstallations7d"]),
    installationsWithErrors7d: num(issues, [
      "installations_with_errors_7d",
      "installationsWithErrors7d"
    ]),
    latestIssueAt: raw(issues, ["latest_issue_at", "latestIssueAt"])
  }

  const versions = list(root.versions).map(item => ({
    version: text(item, ["version", "dashboard_version", "dashboardVersion"], "Inconnue"),
    installations: num(item, ["installations", "count"])
  }))

  const iosVersions = list(root.iosVersions).map(item => ({
    version: text(item, ["version", "ios_major_version", "iosMajorVersion"], "Inconnu"),
    installations: num(item, ["installations", "count"])
  }))

  const reliability = source =>
    list(source).map(item => ({
      version: text(item, ["version", "dashboard_version", "ios_major_version"], "Inconnue"),
      runs: num(item, ["runs"]),
      installations: num(item, ["installations"]),
      successes: num(item, ["successes"]),
      warnings: num(item, ["warnings"]),
      errors: num(item, ["errors"]),
      affected: num(item, ["affected_installations", "affectedInstallations"]),
      averageDuration: nullableNum(item, ["average_duration_ms", "averageDurationMs"]),
      maximumDuration: nullableNum(item, ["maximum_duration_ms", "maximumDurationMs"]),
      successRate: nullableNum(item, ["success_rate", "successRate"])
    }))

  const stages = buildStages(pipeline)

  const history = buildHistory(root)

  const latest = latestVersion(versions.map(item => item.version))

  const onLatest = versions
    .filter(item => item.version === latest)
    .reduce((sum, item) => sum + item.installations, 0)

  const model = {
    generatedAt: raw(root, ["generatedAt", "generated_at"]),
    installations,
    runs,
    diagnostics,
    stages,
    versions,
    iosVersions,
    versionReliability: reliability(root.telemetryVersions),
    iosReliability: reliability(root.telemetryIOSVersions),
    topIssues: list(root.topIssues).map(item => ({
      code: text(item, ["error_code", "errorCode", "code"], "UNKNOWN_ERROR"),
      module: text(item, ["module"], ""),
      severity: text(item, ["severity"], "warning"),
      occurrences: num(item, ["occurrences", "count"]),
      affected: num(item, ["affected_installations", "affectedInstallations"]),
      latestAt: raw(item, ["latest_occurrence_at", "latestOccurrenceAt"])
    })),
    recentIssues: list(root.recentIssues).map(item => ({
      occurredAt: raw(item, ["occurred_at", "occurredAt"]),
      severity: text(item, ["severity"], "warning"),
      code: text(item, ["error_code", "errorCode"], "UNKNOWN_ERROR"),
      module: text(item, ["module"], ""),
      stage: text(item, ["stage"], ""),
      version: text(item, ["dashboard_version", "dashboardVersion"], ""),
      ios: text(item, ["ios_major_version", "iosMajorVersion"], "")
    })),
    recentInstallations: list(root.recentInstallations).map(item => ({
      installedAt: raw(item, ["installed_at", "installedAt"]),
      lastActiveAt: raw(item, ["last_active_at", "lastActiveAt"]),
      version: text(item, ["dashboard_version", "dashboardVersion"], "Inconnue"),
      ios: text(item, ["ios_major_version", "iosMajorVersion"], "?"),
      launches: num(item, ["launch_count", "launchCount"]),
      lastUpdateAt: raw(item, ["last_update_at", "lastUpdateAt"])
    })),
    history,
    latestVersion: latest,
    installationsOnLatest: onLatest,
    dormant: Math.max(0, installations.total - installations.active30d),
    adoption: ratio(onLatest, installations.total),
    retention7d: ratio(installations.active7d, installations.total),
    retention30d: ratio(installations.active30d, installations.total),
    runsPerActive:
      installations.active7d > 0 ? runs.last7d / installations.active7d : null,
    launchesPerInstallation:
      installations.total > 0 ? installations.totalLaunches / installations.total : null,
    errorFreeShare: ratio(
      Math.max(0, installations.total - diagnostics.installationsWithErrors7d),
      installations.total
    )
  }

  model.healthScore = healthScore(model)

  return model
}

/*
 * Le pipeline est la question « où ça casse ». Chaque étape a ses
 * propres issues possibles ; un PDF absent n'est pas une panne, c'est un
 * jour sans carte agent déposée, d'où sa présence en information et non
 * en échec.
 */
function buildStages(pipeline) {
  const value = keys => num(pipeline, keys)

  const pdfFound = value(["pdf_found_7d", "pdfFound7d"])
  const pdfMissing = value(["pdf_missing_7d", "pdfMissing7d"])
  const pdfReadErrors = value(["pdf_read_errors_7d", "pdfReadErrors7d"])

  const parserSuccess = value(["parser_successes_7d", "parserSuccesses7d"])
  const parserErrors = value(["parser_errors_7d", "parserErrors7d"])

  const serviceFound = value(["service_found_7d", "serviceFound7d"])
  const serviceNotFound = value(["service_not_found_7d", "serviceNotFound7d"])
  const serviceErrors = value(["service_errors_7d", "serviceErrors7d"])

  const renderSuccess = value(["render_successes_7d", "renderSuccesses7d"])
  const renderErrors = value(["render_errors_7d", "renderErrors7d"])

  const archiveSuccess = value(["archive_successes_7d", "archiveSuccesses7d"])
  const archiveErrors = value(["archive_errors_7d", "archiveErrors7d"])

  const stage = (name, symbol, success, failures, notes) => ({
    name,
    symbol,
    success,
    failures,
    attempts: success + failures,
    failureRate: success + failures > 0 ? (failures / (success + failures)) * 100 : null,
    notes
  })

  return [
    stage("Lecture du PDF", "doc.text.fill", pdfFound, pdfReadErrors, [
      pdfMissing > 0 ? `${formatNumber(pdfMissing)} sans PDF déposé` : ""
    ]),
    stage("Analyse HASTUS", "text.magnifyingglass", parserSuccess, parserErrors, []),
    stage("Sélection du service", "calendar", serviceFound, serviceErrors, [
      serviceNotFound > 0 ? `${formatNumber(serviceNotFound)} sans service du jour` : ""
    ]),
    stage("Rendu du widget", "rectangle.3.group.fill", renderSuccess, renderErrors, []),
    stage("Archivage", "archivebox.fill", archiveSuccess, archiveErrors, [])
  ]
}

/* Les deux historiques du serveur sont fusionnés par jour. */
function buildHistory(root) {
  const map = new Map()

  const touch = key => {
    if (!map.has(key)) {
      map.set(key, { key, active: 0, installations: 0 })
    }
    return map.get(key)
  }

  for (const item of list(root.activityHistory)) {
    const key = dayKey(item)
    if (key) touch(key).active = num(item, ["active_installations", "active", "count"])
  }

  for (const item of list(root.installationHistory)) {
    const key = dayKey(item)
    if (key) touch(key).installations = num(item, ["installations", "count"])
  }

  return [...map.values()]
    .sort((first, second) => first.key.localeCompare(second.key))
    .slice(-HISTORY_DAYS)
}

function dayKey(item) {
  const value = raw(item, ["day", "date", "activity_day", "installation_day"])
  return value ? String(value).slice(0, 10) : ""
}

/*
 * Score sur 100. La formule est affichée dans la console : un indicateur
 * qu'on ne peut pas décomposer ne sert à rien quand il baisse.
 */
function healthScore(model) {
  const parts = []

  const reliability = model.runs.successRate7d

  parts.push({
    label: "Fiabilité des exécutions",
    detail:
      reliability === null
        ? "aucune exécution mesurée"
        : `${formatPercent(reliability)} % de succès sur 7 j`,
    weight: HEALTH_WEIGHTS.reliability,
    score:
      reliability === null
        ? null
        : HEALTH_WEIGHTS.reliability * clamp01((reliability - 80) / 20)
  })

  parts.push({
    label: "Collègues sans erreur",
    detail:
      model.installations.total > 0
        ? `${formatPercent(model.errorFreeShare)} % du parc`
        : "aucune installation",
    weight: HEALTH_WEIGHTS.errorFreeUsers,
    score:
      model.installations.total > 0
        ? HEALTH_WEIGHTS.errorFreeUsers * clamp01(model.errorFreeShare / 100)
        : null
  })

  parts.push({
    label: "Adoption de la dernière version",
    detail:
      model.latestVersion
        ? `${formatPercent(model.adoption)} % en ${model.latestVersion}`
        : "aucune version connue",
    weight: HEALTH_WEIGHTS.adoption,
    score: model.latestVersion
      ? HEALTH_WEIGHTS.adoption * clamp01(model.adoption / 100)
      : null
  })

  parts.push({
    label: "Activité du parc",
    detail:
      model.installations.total > 0
        ? `${formatPercent(model.retention7d)} % actifs sur 7 j`
        : "aucune installation",
    weight: HEALTH_WEIGHTS.activity,
    score:
      model.installations.total > 0
        ? HEALTH_WEIGHTS.activity * clamp01(model.retention7d / 100)
        : null
  })

  const measured = parts.filter(part => part.score !== null)

  const earned = measured.reduce((sum, part) => sum + part.score, 0)
  const possible = measured.reduce((sum, part) => sum + part.weight, 0)

  return {
    parts,
    value: possible > 0 ? Math.round((earned / possible) * 100) : null,
    measured: measured.length,
    total: parts.length
  }
}

// =====================================================
// ÉCRAN PRINCIPAL
// =====================================================

async function presentDashboard() {
  const table = new UITable()
  table.showSeparators = false

  renderDashboard(table)

  await table.present(true)
}

/*
 * Les écrans se redessinent en place : removeAllRows puis reload. La
 * version précédente rappelait main() depuis une ligne, ce qui empilait
 * une nouvelle table par-dessus l'ancienne à chaque actualisation.
 */
function renderDashboard(table) {
  table.removeAllRows()

  const model = derive(state.payload)

  addMastheadRow(table, model)

  if (state.loading) {
    addNoticeRow(table, "Actualisation en cours…", "arrow.clockwise", COLORS.blue)
  } else if (state.fromCache) {
    addNoticeRow(
      table,
      `Données en cache · ${relativeDate(state.fetchedAt)}`,
      "wifi.slash",
      COLORS.orange
    )
  }

  addHealthBlock(table, model)
  addKeyFigures(table, model)
  addActivityChart(table, model)
  addNavigation(table, model)
  addTools(table, model)
  addPrivacyFooter(table)

  table.reload()
}

function addMastheadRow(table, model) {
  const row = new UITableRow()
  row.height = 92
  row.isHeader = true

  const symbol = SFSymbol.named("chart.bar.xaxis")
  symbol.applyFont(Font.systemFont(28))
  row.addImage(symbol.image).widthWeight = 14

  const cell = row.addText(
    "CTS Analytics",
    [
      `${formatNumber(model.installations.total)} collègue${plural(
        model.installations.total
      )}`,
      `${formatNumber(model.installations.totalLaunches)} lancement${plural(
        model.installations.totalLaunches
      )}`,
      `actualisé ${relativeDate(model.generatedAt || state.fetchedAt)}`
    ].join("  ·  ")
  )

  cell.widthWeight = 86
  cell.titleFont = Font.boldSystemFont(22)
  cell.subtitleFont = Font.systemFont(11)
  cell.titleColor = COLORS.red
  cell.subtitleColor = COLORS.secondary

  table.addRow(row)
}

function addHealthBlock(table, model) {
  addSection(table, "SANTÉ DU PROJET", COLORS.green)

  const score = model.healthScore

  const row = new UITableRow()
  row.height = 86
  row.dismissOnSelect = false

  const value = row.addText(
    score.value === null ? "—" : String(score.value),
    "SCORE / 100"
  )

  value.widthWeight = 22
  value.titleFont = Font.boldSystemFont(34)
  value.subtitleFont = Font.boldSystemFont(8)
  value.titleColor = scoreColor(score.value)
  value.subtitleColor = COLORS.secondary
  value.centerAligned()

  const gauge = row.addImage(gaugeImage(score.value, scoreColor(score.value)))
  gauge.widthWeight = 70

  const chevron = row.addText("›")
  chevron.widthWeight = 8
  chevron.titleFont = Font.boldSystemFont(22)
  chevron.titleColor = COLORS.secondary
  chevron.rightAligned()

  row.onSelect = async () => {
    await presentHealthDetail(model)
  }

  table.addRow(row)
}

function addKeyFigures(table, model) {
  const window = state.period === "30d" ? "30 JOURS" : "7 JOURS"

  addSection(table, `CHIFFRES CLÉS · ${window}`, COLORS.red, {
    action: state.period === "30d" ? "voir 7 j" : "voir 30 j",
    onSelect: table => {
      state.period = state.period === "30d" ? "7d" : "30d"
      renderDashboard(table)
    }
  })

  const periodic = state.period === "30d"
    ? {
        active: model.installations.active30d,
        fresh: model.installations.new30d,
        runs: model.runs.last30d,
        issues: model.diagnostics.last30d
      }
    : {
        active: model.installations.active7d,
        fresh: model.installations.new7d,
        runs: model.runs.last7d,
        issues: model.diagnostics.last7d
      }

  addMetricGrid(table, [
    {
      value: model.installations.total,
      title: "UTILISATEURS",
      color: COLORS.red
    },
    {
      value: periodic.active,
      title: "ACTIFS",
      color: COLORS.green
    },
    {
      value: model.installations.totalLaunches,
      title: "LANCEMENTS",
      color: COLORS.purple
    },
    {
      value: periodic.runs,
      title: "EXÉCUTIONS",
      color: COLORS.blue
    },
    {
      value:
        model.runs.successRate7d === null
          ? "—"
          : `${formatPercent(model.runs.successRate7d)} %`,
      title: "SUCCÈS · 7 J",
      color: reliabilityColor(model.runs.successRate7d)
    },
    {
      value: periodic.issues,
      title: "DIAGNOSTICS",
      color: periodic.issues > 0 ? COLORS.orange : COLORS.green
    }
  ], 3)
}

function addActivityChart(table, model) {
  addSection(table, "ACTIVITÉ · 30 DERNIERS JOURS", COLORS.blue)

  if (!model.history.length) {
    addEmptyRow(table, "Aucun historique renvoyé par le serveur.")
    return
  }

  const row = new UITableRow()
  row.height = 132

  row.addImage(
    activityChartImage(model.history)
  ).widthWeight = 100

  table.addRow(row)

  const legend = new UITableRow()
  legend.height = 34

  const left = legend.addText(
    `▍ Collègues actifs par jour · pic ${formatNumber(
      Math.max(...model.history.map(item => item.active), 0)
    )}`
  )
  left.widthWeight = 62
  left.titleFont = Font.systemFont(10)
  left.titleColor = COLORS.blue

  const right = legend.addText(
    `● Nouvelles installations · ${formatNumber(
      model.history.reduce((sum, item) => sum + item.installations, 0)
    )} sur 30 j`
  )
  right.widthWeight = 38
  right.titleFont = Font.systemFont(10)
  right.titleColor = COLORS.green
  right.rightAligned()

  table.addRow(legend)
}

function addNavigation(table, model) {
  addSection(table, "EXPLORER", COLORS.purple)

  const worst = worstStage(model.stages)

  const entries = [
    {
      title: "Collègues et adoption",
      subtitle: `${formatNumber(model.installations.active7d)}/${formatNumber(
        model.installations.total
      )} actifs · ${formatPercent(model.adoption)} % en ${model.latestVersion || "?"}`,
      symbol: "person.2.fill",
      color: COLORS.green,
      screen: () => presentAudience(model)
    },
    {
      title: "Exécutions et fiabilité",
      subtitle: `${formatNumber(model.runs.last7d)} sur 7 j · ${
        model.runs.averageDuration7d === null
          ? "durée inconnue"
          : `${formatDurationMs(model.runs.averageDuration7d)} en moyenne`
      }`,
      symbol: "speedometer",
      color: COLORS.blue,
      screen: () => presentRuns(model)
    },
    {
      title: "Étapes du pipeline",
      subtitle: worst
        ? `point faible : ${worst.name} · ${formatPercent(worst.failureRate)} % d'échec`
        : "aucune étape mesurée",
      symbol: "point.3.connected.trianglepath.dotted",
      color: worst && worst.failureRate > 5 ? COLORS.red : COLORS.teal,
      screen: () => presentPipeline(model)
    },
    {
      title: "Diagnostics",
      subtitle: `${formatNumber(model.diagnostics.last7d)} sur 7 j · ${formatNumber(
        model.diagnostics.installationsWithErrors7d
      )} collègue${plural(model.diagnostics.installationsWithErrors7d)} en erreur`,
      symbol: "exclamationmark.triangle.fill",
      color: diagnosticsColor(model.diagnostics),
      screen: () => presentDiagnostics(model)
    },
    {
      title: "Versions",
      subtitle: versionsSummary(model),
      symbol: "shippingbox.fill",
      color: COLORS.orange,
      screen: () => presentVersions(model)
    },
    {
      title: "Données brutes",
      subtitle: "Champs renvoyés par le serveur et champs manquants",
      symbol: "curlybraces",
      color: COLORS.gray,
      screen: () => presentRawPayload()
    }
  ]

  for (const entry of entries) {
    const row = navigationRow(entry.title, entry.subtitle, entry.symbol, entry.color)
    row.onSelect = async () => {
      await entry.screen()
    }
    table.addRow(row)
  }
}

function addTools(table) {
  addSection(table, "OUTILS", COLORS.secondary)

  const refresh = actionRow(
    "Actualiser",
    "Interroger le serveur maintenant",
    "arrow.clockwise.circle.fill",
    COLORS.blue
  )

  refresh.onSelect = async () => {
    state.loading = true
    renderDashboard(table)

    const result = await loadStatistics({ force: true })

    state.loading = false
    renderDashboard(table)

    if (!result.ok) await handleApiError(result)
  }

  table.addRow(refresh)

  const health = actionRow(
    "Santé du serveur",
    state.health
      ? `${state.health.database} · ${formatDurationMs(state.healthDurationMs)}`
      : "Vérifier la base de données et la limitation de débit",
    "waveform.path.ecg",
    COLORS.teal
  )

  health.onSelect = async () => {
    await runHealthCheck()
    renderDashboard(table)
  }

  table.addRow(health)

  const exportRow = actionRow(
    "Exporter",
    "JSON complet, CSV d'activité ou presse-papiers",
    "square.and.arrow.up.fill",
    COLORS.green
  )

  exportRow.onSelect = async () => {
    await presentExportMenu()
  }

  table.addRow(exportRow)

  const keyRow = actionRow(
    "Clé administrateur",
    "Modifier la clé enregistrée sur cet iPhone",
    "key.fill",
    COLORS.orange
  )

  keyRow.onSelect = async () => {
    await replaceAdminKey()
  }

  table.addRow(keyRow)
}

function addPrivacyFooter(table) {
  const row = new UITableRow()
  row.height = 56

  const text = row.addText(
    `Confidentialité · CTS Analytics Admin ${ADMIN_VERSION}`,
    "Identifiants d’installation opaques · aucun nom, matricule, horaire ni contenu de carte agent"
  )

  text.titleFont = Font.semiboldSystemFont(11)
  text.subtitleFont = Font.systemFont(10)
  text.titleColor = COLORS.green
  text.subtitleColor = COLORS.secondary

  table.addRow(row)
}

// =====================================================
// ÉCRAN SCORE DE SANTÉ
// =====================================================

async function presentHealthDetail(model) {
  const table = new UITable()
  table.showSeparators = false

  const score = model.healthScore

  addSubHeader(
    table,
    score.value === null ? "Score indisponible" : `Score ${score.value}/100`,
    `${score.measured}/${score.total} composantes mesurées`,
    "heart.text.square.fill",
    scoreColor(score.value)
  )

  addSection(table, "COMPOSITION", COLORS.secondary)

  for (const part of score.parts) {
    const row = new UITableRow()
    row.height = 74

    const text = row.addText(
      part.label,
      `${part.detail}\nPoids ${part.weight} points`
    )

    text.widthWeight = 62
    text.titleFont = Font.semiboldSystemFont(13)
    text.subtitleFont = Font.systemFont(10)
    text.titleColor = COLORS.primary
    text.subtitleColor = COLORS.secondary

    const bar = row.addImage(
      progressImage(
        part.score === null ? 0 : part.score / part.weight,
        part.score === null ? COLORS.gray : scoreColor((part.score / part.weight) * 100)
      )
    )
    bar.widthWeight = 26

    const value = row.addText(
      part.score === null ? "—" : `${Math.round(part.score)}`,
      `/${part.weight}`
    )
    value.widthWeight = 12
    value.titleFont = Font.boldSystemFont(15)
    value.subtitleFont = Font.systemFont(9)
    value.titleColor = part.score === null ? COLORS.gray : COLORS.primary
    value.subtitleColor = COLORS.secondary
    value.rightAligned()

    table.addRow(row)
  }

  addSection(table, "LECTURE", COLORS.secondary)

  addNoteRow(
    table,
    "Une composante que le serveur ne mesure pas est exclue du calcul plutôt que comptée à zéro. Le score reste donc comparable d’un jour à l’autre même quand une donnée manque."
  )

  await table.present(true)
}

// =====================================================
// ÉCRAN COLLÈGUES ET ADOPTION
// =====================================================

async function presentAudience(model) {
  const table = new UITable()
  table.showSeparators = false

  addSubHeader(
    table,
    "Collègues",
    `${formatNumber(model.installations.total)} installation${plural(
      model.installations.total
    )} · ${formatNumber(model.installations.totalLaunches)} lancement${plural(
      model.installations.totalLaunches
    )}`,
    "person.2.fill",
    COLORS.green
  )

  addSection(table, "PRÉSENCE", COLORS.green)

  addMetricGrid(table, [
    { value: model.installations.activeToday, title: "AUJOURD’HUI", color: COLORS.green },
    { value: model.installations.active24h, title: "24 HEURES", color: COLORS.teal },
    { value: model.installations.active7d, title: "7 JOURS", color: COLORS.blue },
    { value: model.installations.active30d, title: "30 JOURS", color: COLORS.purple },
    { value: model.dormant, title: "DORMANTS", color: model.dormant > 0 ? COLORS.orange : COLORS.green },
    {
      value:
        model.launchesPerInstallation === null
          ? "—"
          : formatDecimal(model.launchesPerInstallation),
      title: "LANC. / PERS.",
      color: COLORS.red
    }
  ], 3)

  addSection(table, "FIDÉLITÉ", COLORS.blue)

  addGaugeRow(
    table,
    "Revus sur 7 jours",
    `${formatNumber(model.installations.active7d)} sur ${formatNumber(
      model.installations.total
    )}`,
    model.retention7d
  )

  addGaugeRow(
    table,
    "Revus sur 30 jours",
    `${formatNumber(model.installations.active30d)} sur ${formatNumber(
      model.installations.total
    )}`,
    model.retention30d
  )

  addGaugeRow(
    table,
    `Sur la dernière version${model.latestVersion ? ` (${model.latestVersion})` : ""}`,
    `${formatNumber(model.installationsOnLatest)} sur ${formatNumber(
      model.installations.total
    )}`,
    model.adoption
  )

  addSection(table, "NOUVELLES INSTALLATIONS", COLORS.teal)

  addMetricGrid(table, [
    { value: model.installations.newToday, title: "AUJOURD’HUI", color: COLORS.green },
    { value: model.installations.new7d, title: "7 JOURS", color: COLORS.blue },
    { value: model.installations.new30d, title: "30 JOURS", color: COLORS.purple }
  ], 3)

  addSection(table, "PARC RÉCENT", COLORS.orange)

  const recent = model.recentInstallations.slice(0, MAX_RECENT_INSTALLATIONS)

  if (!recent.length) {
    addEmptyRow(table, "Aucune installation renvoyée par le serveur.")
  } else {
    for (let index = 0; index < recent.length; index++) {
      addInstallationRow(table, recent[index], index + 1, model)
    }
  }

  await table.present(true)
}

function addInstallationRow(table, item, rank, model) {
  const row = new UITableRow()
  row.height = 76

  const freshness = installationFreshness(item.lastActiveAt)

  const number = row.addText(String(rank))
  number.widthWeight = 8
  number.titleFont = Font.boldSystemFont(14)
  number.titleColor = freshness.color

  const text = row.addText(
    `Dashboard ${item.version} · iOS ${item.ios}`,
    [
      `${freshness.label} · ${formatNumber(item.launches)} lancement${plural(item.launches)}`,
      `Installé ${formatDateShort(item.installedAt)} · vu ${relativeDate(item.lastActiveAt)}`
    ].join("\n")
  )

  text.widthWeight = 72
  text.titleFont = Font.semiboldSystemFont(13)
  text.subtitleFont = Font.systemFont(10)
  text.titleColor =
    model.latestVersion && item.version === model.latestVersion
      ? COLORS.green
      : COLORS.orange
  text.subtitleColor = COLORS.secondary

  const badge = row.addText(
    model.latestVersion && item.version === model.latestVersion ? "À JOUR" : "EN RETARD"
  )
  badge.widthWeight = 20
  badge.titleFont = Font.boldSystemFont(9)
  badge.titleColor =
    model.latestVersion && item.version === model.latestVersion
      ? COLORS.green
      : COLORS.orange
  badge.rightAligned()

  table.addRow(row)
}

// =====================================================
// ÉCRAN EXÉCUTIONS
// =====================================================

async function presentRuns(model) {
  const table = new UITable()
  table.showSeparators = false

  addSubHeader(
    table,
    "Exécutions",
    `${formatNumber(model.runs.total)} enregistrée${plural(
      model.runs.total
    )} depuis le début`,
    "speedometer",
    COLORS.blue
  )

  addSection(table, "VOLUME", COLORS.blue)

  addMetricGrid(table, [
    { value: model.runs.today, title: "AUJOURD’HUI", color: COLORS.green },
    { value: model.runs.last24h, title: "24 HEURES", color: COLORS.teal },
    { value: model.runs.last7d, title: "7 JOURS", color: COLORS.blue },
    { value: model.runs.last30d, title: "30 JOURS", color: COLORS.purple }
  ], 4)

  addSection(table, "RÉSULTAT · 7 JOURS", COLORS.green)

  const total = model.runs.successes7d + model.runs.warnings7d + model.runs.errors7d

  if (total > 0) {
    const row = new UITableRow()
    row.height = 58
    row.addImage(
      stackedBarImage([
        { value: model.runs.successes7d, color: COLORS.green },
        { value: model.runs.warnings7d, color: COLORS.orange },
        { value: model.runs.errors7d, color: COLORS.red }
      ])
    ).widthWeight = 100
    table.addRow(row)
  }

  addBreakdownRow(table, "Succès", model.runs.successes7d, total, COLORS.green)
  addBreakdownRow(table, "Avertissements", model.runs.warnings7d, total, COLORS.orange)
  addBreakdownRow(table, "Erreurs", model.runs.errors7d, total, COLORS.red)

  addSection(table, "PERFORMANCE · 7 JOURS", COLORS.purple)

  addSummaryRow(
    table,
    "Durée moyenne",
    model.runs.averageDuration7d === null
      ? "Non mesurée"
      : formatDurationMs(model.runs.averageDuration7d),
    "timer",
    COLORS.blue
  )

  addSummaryRow(
    table,
    "Durée maximale",
    model.runs.maximumDuration7d === null
      ? "Non mesurée"
      : formatDurationMs(model.runs.maximumDuration7d),
    "gauge.high",
    model.runs.maximumDuration7d !== null && model.runs.maximumDuration7d > 10000
      ? COLORS.orange
      : COLORS.teal
  )

  addSummaryRow(
    table,
    "Exécutions par collègue actif",
    model.runsPerActive === null
      ? "Aucun collègue actif"
      : `${formatDecimal(model.runsPerActive)} sur 7 jours`,
    "person.crop.circle.badge.clock",
    COLORS.purple
  )

  addSummaryRow(
    table,
    "Collègues ayant envoyé de la télémétrie",
    `${formatNumber(model.runs.installationsWithRuns)} sur ${formatNumber(
      model.installations.total
    )}`,
    "antenna.radiowaves.left.and.right",
    COLORS.teal
  )

  addSummaryRow(
    table,
    "Dernière exécution reçue",
    relativeDate(model.runs.latestRunAt),
    "clock.arrow.circlepath",
    COLORS.gray
  )

  await table.present(true)
}

// =====================================================
// ÉCRAN PIPELINE
// =====================================================

async function presentPipeline(model) {
  const table = new UITable()
  table.showSeparators = false

  const worst = worstStage(model.stages)

  addSubHeader(
    table,
    "Étapes du pipeline",
    worst
      ? `Point faible : ${worst.name}`
      : "Aucune étape mesurée sur 7 jours",
    "point.3.connected.trianglepath.dotted",
    worst && worst.failureRate > 5 ? COLORS.red : COLORS.teal
  )

  addSection(table, "TAUX D’ÉCHEC PAR ÉTAPE · 7 JOURS", COLORS.teal)

  const measured = model.stages.filter(stage => stage.attempts > 0)

  if (!measured.length) {
    addEmptyRow(table, "Le serveur n’a renvoyé aucun compteur d’étape.")
  } else {
    for (const stage of model.stages) {
      addStageRow(table, stage)
    }
  }

  addSection(table, "LECTURE", COLORS.secondary)

  addNoteRow(
    table,
    "Un PDF absent ou un jour sans service ne sont pas des échecs : ce sont des journées sans carte agent déposée. Seules les erreurs de lecture, d’analyse, de rendu et d’archivage comptent dans le taux d’échec."
  )

  await table.present(true)
}

function addStageRow(table, stage) {
  const row = new UITableRow()
  row.height = 82

  const symbol = SFSymbol.named(stage.symbol)
  symbol.applyFont(Font.systemFont(18))
  row.addImage(symbol.image).widthWeight = 11

  const notes = stage.notes.filter(Boolean)

  const text = row.addText(
    stage.name,
    [
      stage.attempts > 0
        ? `${formatNumber(stage.success)} réussie${plural(
            stage.success
          )} · ${formatNumber(stage.failures)} en échec`
        : "Aucune exécution mesurée",
      notes.join(" · ")
    ]
      .filter(Boolean)
      .join("\n")
  )

  text.widthWeight = 57
  text.titleFont = Font.semiboldSystemFont(13)
  text.subtitleFont = Font.systemFont(10)
  text.titleColor = COLORS.primary
  text.subtitleColor = COLORS.secondary

  const bar = row.addImage(
    progressImage(
      stage.failureRate === null ? 0 : 1 - stage.failureRate / 100,
      stageColor(stage.failureRate)
    )
  )
  bar.widthWeight = 20

  const value = row.addText(
    stage.failureRate === null ? "—" : `${formatPercent(stage.failureRate)} %`,
    "ÉCHEC"
  )
  value.widthWeight = 12
  value.titleFont = Font.boldSystemFont(14)
  value.subtitleFont = Font.boldSystemFont(8)
  value.titleColor = stageColor(stage.failureRate)
  value.subtitleColor = COLORS.secondary
  value.rightAligned()

  table.addRow(row)
}

// =====================================================
// ÉCRAN DIAGNOSTICS
// =====================================================

async function presentDiagnostics(model) {
  const table = new UITable()
  table.showSeparators = false

  renderDiagnostics(table, model)

  await table.present(true)
}

function renderDiagnostics(table, model) {
  table.removeAllRows()

  addSubHeader(
    table,
    "Diagnostics",
    `${formatNumber(model.diagnostics.last7d)} événement${plural(
      model.diagnostics.last7d
    )} sur 7 jours`,
    "exclamationmark.triangle.fill",
    diagnosticsColor(model.diagnostics)
  )

  addSection(table, "VOLUME", COLORS.orange)

  addMetricGrid(table, [
    { value: model.diagnostics.last24h, title: "24 HEURES", color: COLORS.teal },
    { value: model.diagnostics.last7d, title: "7 JOURS", color: COLORS.blue },
    { value: model.diagnostics.last30d, title: "30 JOURS", color: COLORS.purple }
  ], 3)

  addSection(table, "GRAVITÉ · 7 JOURS", COLORS.red)

  addMetricGrid(table, [
    { value: model.diagnostics.warnings7d, title: "AVERTISSEMENTS", color: COLORS.orange },
    { value: model.diagnostics.errors7d, title: "ERREURS", color: COLORS.red },
    { value: model.diagnostics.fatal7d, title: "FATALES", color: COLORS.purple }
  ], 3)

  addSection(table, "IMPACT HUMAIN · 7 JOURS", COLORS.purple)

  addGaugeRow(
    table,
    "Collègues touchés par une erreur",
    `${formatNumber(model.diagnostics.installationsWithErrors7d)} sur ${formatNumber(
      model.installations.total
    )}`,
    ratio(model.diagnostics.installationsWithErrors7d, model.installations.total),
    { invert: true }
  )

  addGaugeRow(
    table,
    "Collègues ayant vu un diagnostic",
    `${formatNumber(model.diagnostics.affected7d)} sur ${formatNumber(
      model.installations.total
    )}`,
    ratio(model.diagnostics.affected7d, model.installations.total),
    { invert: true }
  )

  const filterLabel = {
    all: "toutes gravités",
    error: "erreurs et fatales",
    warning: "avertissements"
  }[state.severityFilter]

  addSection(table, `PRINCIPAUX CODES · 30 JOURS · ${filterLabel.toUpperCase()}`, COLORS.orange, {
    action: "filtrer",
    onSelect: () => {
      state.severityFilter =
        state.severityFilter === "all"
          ? "error"
          : state.severityFilter === "error"
            ? "warning"
            : "all"
      renderDiagnostics(table, model)
    }
  })

  const top = model.topIssues
    .filter(item => matchesFilter(item.severity))
    .slice(0, MAX_TOP_ISSUES)

  if (!top.length) {
    addEmptyRow(table, "Aucun diagnostic pour ce filtre.")
  } else {
    for (let index = 0; index < top.length; index++) {
      addIssueRow(table, top[index], index + 1, model)
    }
  }

  addSection(table, "DERNIERS ÉVÉNEMENTS", COLORS.red)

  const recent = model.recentIssues
    .filter(item => matchesFilter(item.severity))
    .slice(0, MAX_RECENT_ISSUES)

  if (!recent.length) {
    addEmptyRow(table, "Aucun événement pour ce filtre.")
  } else {
    for (const item of recent) {
      addRecentIssueRow(table, item)
    }
  }

  table.reload()
}

function matchesFilter(severity) {
  const value = String(severity || "").toLowerCase()

  if (state.severityFilter === "all") return true
  if (state.severityFilter === "error") return value === "error" || value === "fatal"
  return value === "warning"
}

function addIssueRow(table, item, rank, model) {
  const row = new UITableRow()
  row.height = 84

  const number = row.addText(String(rank))
  number.widthWeight = 7
  number.titleFont = Font.boldSystemFont(14)
  number.titleColor = severityColor(item.severity)

  const share = ratio(item.affected, model.installations.total)

  const text = row.addText(
    item.code,
    [
      [item.module, severityLabel(item.severity)].filter(Boolean).join(" · "),
      `${formatNumber(item.occurrences)} occurrence${plural(
        item.occurrences
      )} · ${formatNumber(item.affected)} collègue${plural(
        item.affected
      )} (${formatPercent(share)} % du parc)`,
      `Dernière fois ${relativeDate(item.latestAt)}`
    ]
      .filter(Boolean)
      .join("\n")
  )

  text.widthWeight = 73
  text.titleFont = Font.semiboldSystemFont(13)
  text.subtitleFont = Font.systemFont(10)
  text.titleColor = severityColor(item.severity)
  text.subtitleColor = COLORS.secondary

  const bar = row.addImage(progressImage(share / 100, severityColor(item.severity)))
  bar.widthWeight = 20

  table.addRow(row)
}

function addRecentIssueRow(table, item) {
  const row = new UITableRow()
  row.height = 70

  const symbol = SFSymbol.named(severitySymbol(item.severity))
  symbol.applyFont(Font.systemFont(16))
  row.addImage(symbol.image).widthWeight = 10

  const text = row.addText(
    item.code,
    [
      [item.module, item.stage].filter(Boolean).join(" · "),
      [
        formatDate(item.occurredAt),
        item.version ? `Dashboard ${item.version}` : "",
        item.ios ? `iOS ${item.ios}` : ""
      ]
        .filter(Boolean)
        .join(" · ")
    ]
      .filter(Boolean)
      .join("\n")
  )

  text.widthWeight = 90
  text.titleFont = Font.semiboldSystemFont(12)
  text.subtitleFont = Font.systemFont(10)
  text.titleColor = severityColor(item.severity)
  text.subtitleColor = COLORS.secondary

  table.addRow(row)
}

// =====================================================
// ÉCRAN VERSIONS
// =====================================================

async function presentVersions(model) {
  const table = new UITable()
  table.showSeparators = false

  addSubHeader(
    table,
    "Versions",
    `${formatNumber(model.installations.total)} installation${plural(
      model.installations.total
    )} · dernière connue ${model.latestVersion || "?"}`,
    "shippingbox.fill",
    COLORS.orange
  )

  addSection(table, "RÉPARTITION DU PARC", COLORS.orange)

  if (!model.versions.length) {
    addEmptyRow(table, "Aucune version enregistrée.")
  } else {
    for (const item of model.versions) {
      addDistributionRow(
        table,
        `Version ${item.version}`,
        item.installations,
        ratio(item.installations, model.installations.total),
        item.version === model.latestVersion ? COLORS.green : COLORS.orange,
        "shippingbox.fill"
      )
    }
  }

  addSection(table, "FIABILITÉ PAR VERSION · 30 JOURS", COLORS.blue)

  if (!model.versionReliability.length) {
    addEmptyRow(table, "Aucune télémétrie par version.")
  } else {
    for (const item of model.versionReliability) {
      addReliabilityRow(table, `Version ${item.version}`, item)
    }
  }

  addSection(table, "iOS", COLORS.purple)

  if (!model.iosVersions.length) {
    addEmptyRow(table, "Aucune version iOS enregistrée.")
  } else {
    for (const item of model.iosVersions) {
      addDistributionRow(
        table,
        `iOS ${item.version}`,
        item.installations,
        ratio(item.installations, model.installations.total),
        COLORS.purple,
        "iphone"
      )
    }
  }

  addSection(table, "FIABILITÉ PAR iOS · 30 JOURS", COLORS.teal)

  if (!model.iosReliability.length) {
    addEmptyRow(table, "Aucune télémétrie par version d’iOS.")
  } else {
    for (const item of model.iosReliability) {
      addReliabilityRow(table, `iOS ${item.version}`, item)
    }
  }

  await table.present(true)
}

function addReliabilityRow(table, title, item) {
  const row = new UITableRow()
  row.height = 80

  const text = row.addText(
    title,
    [
      `${formatNumber(item.runs)} exécution${plural(item.runs)} · ${formatNumber(
        item.installations
      )} collègue${plural(item.installations)}`,
      `${formatNumber(item.errors)} erreur${plural(item.errors)} · ${formatNumber(
        item.affected
      )} touché${plural(item.affected)}${
        item.averageDuration === null
          ? ""
          : ` · ${formatDurationMs(item.averageDuration)}`
      }`
    ].join("\n")
  )

  text.widthWeight = 58
  text.titleFont = Font.semiboldSystemFont(13)
  text.subtitleFont = Font.systemFont(10)
  text.titleColor = COLORS.primary
  text.subtitleColor = COLORS.secondary

  const bar = row.addImage(
    progressImage(
      item.successRate === null ? 0 : item.successRate / 100,
      reliabilityColor(item.successRate)
    )
  )
  bar.widthWeight = 26

  const value = row.addText(
    item.successRate === null ? "—" : `${formatPercent(item.successRate)} %`,
    "SUCCÈS"
  )
  value.widthWeight = 16
  value.titleFont = Font.boldSystemFont(14)
  value.subtitleFont = Font.boldSystemFont(8)
  value.titleColor = reliabilityColor(item.successRate)
  value.subtitleColor = COLORS.secondary
  value.rightAligned()

  table.addRow(row)
}

// =====================================================
// ÉCRAN DONNÉES BRUTES
// =====================================================

async function presentRawPayload() {
  const table = new UITable()
  table.showSeparators = false

  const root = recordOf(state.payload)

  const present = EXPECTED_SECTIONS.filter(key => root[key] !== undefined)
  const missing = EXPECTED_SECTIONS.filter(key => root[key] === undefined)

  addSubHeader(
    table,
    "Données brutes",
    `${present.length}/${EXPECTED_SECTIONS.length} sections attendues reçues`,
    "curlybraces",
    missing.length ? COLORS.orange : COLORS.green
  )

  if (missing.length) {
    addSection(table, "SECTIONS MANQUANTES", COLORS.red)

    for (const key of missing) {
      addSummaryRow(
        table,
        key,
        "Absente de la réponse — les écrans concernés afficheront « — »",
        "questionmark.circle.fill",
        COLORS.red
      )
    }
  }

  addSection(table, "SECTIONS REÇUES", COLORS.green)

  for (const key of Object.keys(root)) {
    const value = root[key]

    addSummaryRow(
      table,
      key,
      describeValue(value),
      Array.isArray(value)
        ? "list.bullet.rectangle"
        : isRecord(value)
          ? "curlybraces"
          : "number",
      EXPECTED_SECTIONS.includes(key) ? COLORS.green : COLORS.blue
    )
  }

  addSection(table, "OUTILS", COLORS.secondary)

  const copy = actionRow(
    "Copier la réponse complète",
    "JSON brut dans le presse-papiers",
    "doc.on.clipboard.fill",
    COLORS.blue
  )

  copy.onSelect = async () => {
    Pasteboard.copyString(JSON.stringify(state.payload, null, 2))
    await showAlert("Copié", "La réponse JSON complète est dans le presse-papiers.")
  }

  table.addRow(copy)

  await table.present(true)
}

function describeValue(value) {
  if (Array.isArray(value)) {
    return `Tableau · ${value.length} entrée${plural(value.length)}`
  }

  if (isRecord(value)) {
    const keys = Object.keys(value)
    return `Objet · ${keys.length} champ${plural(keys.length)} · ${keys
      .slice(0, 4)
      .join(", ")}${keys.length > 4 ? "…" : ""}`
  }

  return `${typeof value} · ${String(value)}`
}

// =====================================================
// SANTÉ DU SERVEUR
// =====================================================

async function runHealthCheck() {
  const startedAt = Date.now()
  const result = await analytics.checkHealth()

  state.healthDurationMs = Date.now() - startedAt
  state.healthCheckedAt = new Date().toISOString()

  if (!result.ok) {
    state.health = null

    await showAlert(
      "Serveur injoignable",
      [
        `Erreur : ${result.error || "inconnue"}`,
        `Code HTTP : ${result.statusCode ?? "inconnu"}`
      ].join("\n")
    )

    return
  }

  const data = recordOf(result.data)

  state.health = {
    database: String(data.database || "inconnue"),
    registration: String(data.registration || "inconnue"),
    telemetry: String(data.telemetry || "inconnue"),
    installations: numberOf(data.installations),
    runs: numberOf(data.telemetryRuns),
    issues: numberOf(data.telemetryIssues)
  }

  await showAlert(
    "Serveur en ligne",
    [
      `Base de données : ${state.health.database}`,
      `Limitation d’inscription : ${state.health.registration}`,
      `Télémétrie : ${state.health.telemetry}`,
      "",
      `Installations : ${formatNumber(state.health.installations)}`,
      `Exécutions : ${formatNumber(state.health.runs)}`,
      `Diagnostics : ${formatNumber(state.health.issues)}`,
      "",
      `Temps de réponse : ${formatDurationMs(state.healthDurationMs)}`
    ].join("\n")
  )
}

// =====================================================
// EXPORT
// =====================================================

async function presentExportMenu() {
  const alert = new Alert()

  alert.title = "Exporter les statistiques"
  alert.message = "Les exports sont anonymisés avant écriture."

  alert.addAction("Fichier JSON complet")
  alert.addAction("Fichier CSV d’activité")
  alert.addAction("Copier le JSON")
  alert.addCancelAction("Annuler")

  const choice = await alert.presentSheet()

  if (choice === 0) await exportJson()
  else if (choice === 1) await exportActivityCsv()
  else if (choice === 2) {
    Pasteboard.copyString(
      JSON.stringify(sanitizeExportPayload(state.payload), null, 2)
    )
    await showAlert("Copié", "Les statistiques anonymisées sont dans le presse-papiers.")
  }
}

async function exportJson() {
  const stamp = fileDateStamp(new Date())
  const name = `CTS-Analytics-${stamp}.json`

  writeExport(
    name,
    JSON.stringify(sanitizeExportPayload(state.payload), null, 2)
  )

  await showAlert(
    "Export terminé",
    [
      "Fichier créé dans :",
      "",
      "iCloud Drive/Scriptable/CTS Dashboard/Analytics",
      "",
      `Nom : ${name}`
    ].join("\n")
  )
}

async function exportActivityCsv() {
  const model = derive(state.payload)

  if (!model.history.length) {
    await showAlert("Export impossible", "Le serveur n’a renvoyé aucun historique.")
    return
  }

  const lines = ["jour;collegues_actifs;nouvelles_installations"]

  for (const item of model.history) {
    lines.push(`${item.key};${item.active};${item.installations}`)
  }

  const stamp = fileDateStamp(new Date())
  const name = `CTS-Activite-${stamp}.csv`

  writeExport(name, lines.join("\n"))

  await showAlert(
    "Export terminé",
    [
      "Fichier CSV créé dans :",
      "",
      "iCloud Drive/Scriptable/CTS Dashboard/Analytics",
      "",
      `Nom : ${name}`,
      "",
      "Séparateur point-virgule, ouvrable dans Numbers."
    ].join("\n")
  )
}

function writeExport(name, content) {
  fm.writeString(fm.joinPath(analyticsDirectory(), name), content)
}

function analyticsDirectory() {
  const root = fm.joinPath(fm.documentsDirectory(), "CTS Dashboard")

  if (!fm.fileExists(root)) fm.createDirectory(root, true)

  const directory = fm.joinPath(root, "Analytics")

  if (!fm.fileExists(directory)) fm.createDirectory(directory, true)

  return directory
}

/*
 * Le Worker ne renvoie déjà aucun identifiant d'installation, mais un
 * export quitte l'iPhone : la liste de clés interdites reste comme
 * seconde barrière si la réponse du serveur venait à s'enrichir.
 */
function sanitizeExportPayload(value) {
  const forbidden = new Set([
    "installation_id",
    "installationid",
    "run_id",
    "runid",
    "issue_id",
    "issueid",
    "client_token",
    "clienttoken",
    "client_token_hash",
    "clienttokenhash",
    "admin_api_key",
    "adminapikey",
    "token",
    "driver",
    "driver_id",
    "driverid",
    "driver_name",
    "drivername",
    "service_number",
    "servicenumber",
    "pdf_file",
    "pdffile",
    "filename",
    "file_name",
    "path",
    "fingerprint"
  ])

  const clean = current => {
    if (current === null || current === undefined) return current
    if (Array.isArray(current)) return current.map(clean)
    if (typeof current !== "object") return current

    const result = {}

    for (const [key, item] of Object.entries(current)) {
      const normalized = String(key).toLowerCase().replace(/[^a-z0-9_]/g, "")
      if (forbidden.has(normalized)) continue
      result[key] = clean(item)
    }

    return result
  }

  return clean(value)
}

// =====================================================
// CACHE
// =====================================================

function cachePath() {
  return fm.joinPath(analyticsDirectory(), "last-statistics.json")
}

function readCache() {
  try {
    const path = cachePath()

    if (!fm.fileExists(path)) return null

    if (!fm.isFileDownloaded(path)) return null

    const parsed = JSON.parse(fm.readString(path))

    if (!isRecord(parsed) || !isRecord(parsed.payload)) return null

    return parsed
  } catch (_) {
    return null
  }
}

function writeCache(payload) {
  try {
    fm.writeString(
      cachePath(),
      JSON.stringify({
        fetchedAt: new Date().toISOString(),
        payload
      })
    )
  } catch (_) {
    /* Un cache absent n'est pas une panne : la console fonctionne sans. */
  }
}

// =====================================================
// GRAPHIQUES
// =====================================================

/*
 * Scriptable ne dessine pas dans une UITable, mais une cellule accepte
 * une image : les graphiques sont donc rendus dans un DrawContext puis
 * insérés comme images. Aucun fond n'est peint, pour rester lisible en
 * mode clair comme en mode sombre.
 */
function newContext(width, height) {
  const context = new DrawContext()
  context.size = new Size(width, height)
  context.opaque = false
  context.respectScreenScale = true
  return context
}

function activityChartImage(history) {
  const width = 360
  const height = 120
  const context = newContext(width, height)

  const values = history.map(item => item.active)
  const peak = Math.max(1, ...values)
  const columns = Math.max(1, history.length)
  const slot = width / columns
  const barWidth = Math.max(2, slot * 0.62)
  const baseline = height - 18

  context.setFont(Font.systemFont(9))
  context.setTextColor(COLORS.gray)

  for (let index = 0; index < history.length; index++) {
    const item = history[index]
    const x = index * slot + (slot - barWidth) / 2
    const barHeight = Math.max(1, (item.active / peak) * (baseline - 8))

    context.setFillColor(COLORS.blue)
    context.fillRect(new Rect(x, baseline - barHeight, barWidth, barHeight))

    if (item.installations > 0) {
      const radius = Math.min(7, 3 + item.installations)
      context.setFillColor(COLORS.green)
      context.fillEllipse(
        new Rect(
          x + barWidth / 2 - radius / 2,
          baseline - barHeight - radius - 2,
          radius,
          radius
        )
      )
    }

    const isEdge = index === 0 || index === history.length - 1
    const isMidpoint = index === Math.floor(history.length / 2)

    if (isEdge || isMidpoint) {
      context.drawTextInRect(
        formatHistoryDay(item.key),
        new Rect(index * slot - slot, baseline + 3, slot * 3, 14)
      )
    }
  }

  context.setFillColor(COLORS.faint)
  context.fillRect(new Rect(0, baseline, width, 1))

  return context.getImage()
}

function progressImage(fraction, color) {
  const width = 120
  const height = 14
  const context = newContext(width, height)

  const filled = Math.max(0, Math.min(1, Number(fraction) || 0)) * width

  context.setFillColor(COLORS.faint)
  context.fillRect(new Rect(0, 4, width, 6))

  context.setFillColor(color)
  context.fillRect(new Rect(0, 4, filled, 6))

  return context.getImage()
}

function gaugeImage(score, color) {
  const width = 260
  const height = 64
  const context = newContext(width, height)

  const filled = score === null ? 0 : Math.max(0, Math.min(100, score)) / 100

  context.setFillColor(COLORS.faint)
  context.fillRect(new Rect(0, 26, width, 10))

  context.setFillColor(color)
  context.fillRect(new Rect(0, 26, width * filled, 10))

  context.setFont(Font.boldSystemFont(9))
  context.setTextColor(COLORS.gray)
  context.drawTextInRect("0", new Rect(0, 40, 40, 14))
  context.drawTextInRect("100", new Rect(width - 40, 40, 40, 14))

  return context.getImage()
}

function stackedBarImage(segments) {
  const width = 360
  const height = 26
  const context = newContext(width, height)

  const total = segments.reduce((sum, item) => sum + Math.max(0, item.value), 0)

  if (total <= 0) {
    context.setFillColor(COLORS.faint)
    context.fillRect(new Rect(0, 8, width, 10))
    return context.getImage()
  }

  let offset = 0

  for (const segment of segments) {
    const portion = (Math.max(0, segment.value) / total) * width

    if (portion <= 0) continue

    context.setFillColor(segment.color)
    context.fillRect(new Rect(offset, 8, portion, 10))

    offset += portion
  }

  return context.getImage()
}

// =====================================================
// COMPOSANTS
// =====================================================

function addSection(table, title, color, options = {}) {
  const row = new UITableRow()
  row.height = 36
  row.isHeader = true
  row.dismissOnSelect = false

  const text = row.addText(title)
  text.widthWeight = options.action ? 70 : 100
  text.titleFont = Font.boldSystemFont(11)
  text.titleColor = color

  if (options.action) {
    const action = row.addText(options.action)
    action.widthWeight = 30
    action.titleFont = Font.semiboldSystemFont(11)
    action.titleColor = COLORS.blue
    action.rightAligned()

    row.onSelect = () => options.onSelect(table)
  }

  table.addRow(row)
}

function addSubHeader(table, title, subtitle, symbolName, color) {
  const row = new UITableRow()
  row.height = 84
  row.isHeader = true

  const symbol = SFSymbol.named(symbolName)
  symbol.applyFont(Font.systemFont(24))
  row.addImage(symbol.image).widthWeight = 14

  const text = row.addText(title, subtitle)
  text.widthWeight = 86
  text.titleFont = Font.boldSystemFont(20)
  text.subtitleFont = Font.systemFont(11)
  text.titleColor = color
  text.subtitleColor = COLORS.secondary

  table.addRow(row)
}

function addMetricGrid(table, metrics, columns = 3) {
  for (let index = 0; index < metrics.length; index += columns) {
    const items = metrics.slice(index, index + columns)
    const row = new UITableRow()
    row.height = 70

    for (const item of items) {
      const cell = row.addText(
        typeof item.value === "number" ? formatNumber(item.value) : String(item.value),
        item.title
      )

      cell.widthWeight = 100 / items.length
      cell.titleFont = Font.boldSystemFont(20)
      cell.subtitleFont = Font.boldSystemFont(8)
      cell.titleColor = item.color
      cell.subtitleColor = COLORS.secondary
    }

    table.addRow(row)
  }
}

function addSummaryRow(table, title, subtitle, symbolName, color) {
  const row = new UITableRow()
  row.height = 64

  const symbol = SFSymbol.named(symbolName)
  symbol.applyFont(Font.systemFont(18))
  row.addImage(symbol.image).widthWeight = 12

  const text = row.addText(title, subtitle)
  text.widthWeight = 88
  text.titleFont = Font.semiboldSystemFont(14)
  text.subtitleFont = Font.systemFont(11)
  text.titleColor = color
  text.subtitleColor = COLORS.secondary

  table.addRow(row)
}

function addGaugeRow(table, title, subtitle, percentValue, options = {}) {
  const row = new UITableRow()
  row.height = 66

  const text = row.addText(title, subtitle)
  text.widthWeight = 54
  text.titleFont = Font.semiboldSystemFont(13)
  text.subtitleFont = Font.systemFont(10)
  text.titleColor = COLORS.primary
  text.subtitleColor = COLORS.secondary

  const color = options.invert
    ? percentValue > 20
      ? COLORS.red
      : percentValue > 5
        ? COLORS.orange
        : COLORS.green
    : reliabilityColor(percentValue)

  const bar = row.addImage(progressImage(percentValue / 100, color))
  bar.widthWeight = 30

  const value = row.addText(`${formatPercent(percentValue)} %`)
  value.widthWeight = 16
  value.titleFont = Font.boldSystemFont(15)
  value.titleColor = color
  value.rightAligned()

  table.addRow(row)
}

function addBreakdownRow(table, title, value, total, color) {
  const row = new UITableRow()
  row.height = 52

  const text = row.addText(title)
  text.widthWeight = 46
  text.titleFont = Font.systemFont(13)
  text.titleColor = COLORS.primary

  const bar = row.addImage(progressImage(total > 0 ? value / total : 0, color))
  bar.widthWeight = 30

  const count = row.addText(
    formatNumber(value),
    total > 0 ? `${formatPercent(ratio(value, total))} %` : "—"
  )
  count.widthWeight = 24
  count.titleFont = Font.boldSystemFont(15)
  count.subtitleFont = Font.systemFont(9)
  count.titleColor = color
  count.subtitleColor = COLORS.secondary
  count.rightAligned()

  table.addRow(row)
}

function addDistributionRow(table, title, count, share, color, symbolName) {
  const row = new UITableRow()
  row.height = 66

  const symbol = SFSymbol.named(symbolName)
  symbol.applyFont(Font.systemFont(16))
  row.addImage(symbol.image).widthWeight = 10

  const text = row.addText(title, `${formatPercent(share)} % du parc`)
  text.widthWeight = 44
  text.titleFont = Font.semiboldSystemFont(14)
  text.subtitleFont = Font.systemFont(10)
  text.titleColor = COLORS.primary
  text.subtitleColor = color

  const bar = row.addImage(progressImage(share / 100, color))
  bar.widthWeight = 28

  const badge = row.addText(formatNumber(count), "INSTALL.")
  badge.widthWeight = 18
  badge.titleFont = Font.boldSystemFont(15)
  badge.subtitleFont = Font.boldSystemFont(8)
  badge.titleColor = color
  badge.subtitleColor = COLORS.secondary
  badge.rightAligned()

  table.addRow(row)
}

function navigationRow(title, subtitle, symbolName, color) {
  const row = new UITableRow()
  row.height = 68
  row.dismissOnSelect = false

  const symbol = SFSymbol.named(symbolName)
  symbol.applyFont(Font.systemFont(18))
  row.addImage(symbol.image).widthWeight = 12

  const text = row.addText(title, subtitle)
  text.widthWeight = 80
  text.titleFont = Font.semiboldSystemFont(14)
  text.subtitleFont = Font.systemFont(10)
  text.titleColor = color
  text.subtitleColor = COLORS.secondary

  const arrow = row.addText("›")
  arrow.widthWeight = 8
  arrow.titleFont = Font.boldSystemFont(22)
  arrow.titleColor = COLORS.secondary
  arrow.rightAligned()

  return row
}

function actionRow(title, subtitle, symbolName, color) {
  const row = new UITableRow()
  row.height = 62
  row.dismissOnSelect = false

  const symbol = SFSymbol.named(symbolName)
  symbol.applyFont(Font.systemFont(18))
  row.addImage(symbol.image).widthWeight = 12

  const text = row.addText(title, subtitle)
  text.widthWeight = 88
  text.titleFont = Font.semiboldSystemFont(14)
  text.subtitleFont = Font.systemFont(10)
  text.titleColor = color
  text.subtitleColor = COLORS.secondary

  return row
}

function addNoticeRow(table, message, symbolName, color) {
  const row = new UITableRow()
  row.height = 44

  const symbol = SFSymbol.named(symbolName)
  symbol.applyFont(Font.systemFont(14))
  row.addImage(symbol.image).widthWeight = 10

  const text = row.addText(message)
  text.widthWeight = 90
  text.titleFont = Font.mediumSystemFont(12)
  text.titleColor = color

  table.addRow(row)
}

function addNoteRow(table, message) {
  const row = new UITableRow()
  row.height = 88

  const text = row.addText("", message)
  text.subtitleFont = Font.systemFont(11)
  text.subtitleColor = COLORS.secondary

  table.addRow(row)
}

function addEmptyRow(table, message) {
  const row = new UITableRow()
  row.height = 50

  const text = row.addText(message)
  text.titleFont = Font.systemFont(12)
  text.titleColor = COLORS.secondary

  table.addRow(row)
}

// =====================================================
// COULEURS ET LIBELLÉS
// =====================================================

function scoreColor(value) {
  if (value === null) return COLORS.gray
  if (value >= 85) return COLORS.green
  if (value >= 65) return COLORS.orange
  return COLORS.red
}

function reliabilityColor(value) {
  if (value === null || value === undefined) return COLORS.gray
  const number = numberOf(value)
  if (number >= 98) return COLORS.green
  if (number >= 90) return COLORS.orange
  return COLORS.red
}

function stageColor(failureRate) {
  if (failureRate === null) return COLORS.gray
  if (failureRate <= 1) return COLORS.green
  if (failureRate <= 5) return COLORS.orange
  return COLORS.red
}

function diagnosticsColor(diagnostics) {
  if (diagnostics.fatal7d > 0 || diagnostics.errors7d > 0) return COLORS.red
  if (diagnostics.warnings7d > 0) return COLORS.orange
  return COLORS.green
}

function severityColor(severity) {
  const value = String(severity || "").trim().toLowerCase()
  if (value === "fatal") return COLORS.purple
  if (value === "error") return COLORS.red
  return COLORS.orange
}

function severitySymbol(severity) {
  const value = String(severity || "").trim().toLowerCase()
  if (value === "fatal") return "xmark.octagon.fill"
  if (value === "error") return "exclamationmark.triangle.fill"
  return "exclamationmark.circle.fill"
}

function severityLabel(severity) {
  const value = String(severity || "").trim().toLowerCase()
  if (value === "fatal") return "fatale"
  if (value === "error") return "erreur"
  return "avertissement"
}

function worstStage(stages) {
  const measured = stages.filter(stage => stage.attempts > 0 && stage.failureRate !== null)

  if (!measured.length) return null

  return measured.reduce((worst, stage) =>
    stage.failureRate > worst.failureRate ? stage : worst
  )
}

function versionsSummary(model) {
  const dashboard = model.versions[0]
  const ios = model.iosVersions[0]

  return [
    dashboard ? `CTS ${dashboard.version} majoritaire` : "CTS ?",
    ios ? `iOS ${ios.version} majoritaire` : "iOS ?"
  ].join(" · ")
}

function latestVersion(versions) {
  const valid = versions.filter(value => /^\d+(\.\d+)*$/.test(String(value)))

  if (!valid.length) return versions[0] || ""

  return valid.reduce((highest, value) =>
    compareVersions(value, highest) > 0 ? value : highest
  )
}

function compareVersions(first, second) {
  const left = String(first).split(".").map(Number)
  const right = String(second).split(".").map(Number)

  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] || 0) - (right[index] || 0)
    if (difference !== 0) return difference
  }

  return 0
}

function installationFreshness(lastActiveAt) {
  const date = lastActiveAt ? new Date(lastActiveAt) : null

  if (!date || Number.isNaN(date.getTime())) {
    return { label: "Jamais revu", color: COLORS.gray }
  }

  const days = (Date.now() - date.getTime()) / 86400000

  if (days <= 1) return { label: "Actif", color: COLORS.green }
  if (days <= 7) return { label: "Silencieux", color: COLORS.orange }
  if (days <= DORMANT_DAYS) return { label: "Peu actif", color: COLORS.orange }

  return { label: "Dormant", color: COLORS.red }
}

// =====================================================
// ERREURS
// =====================================================

async function handleApiError(result) {
  if (result.statusCode === 401) {
    analytics.removeAdminApiKey()

    await showAlert(
      "Accès refusé",
      [
        "La clé administrateur enregistrée est incorrecte ou n’est plus valide.",
        "",
        "Relancez CTS Analytics Admin pour saisir la bonne clé."
      ].join("\n")
    )

    return
  }

  await showAlert(
    "Statistiques indisponibles",
    [
      `Erreur : ${result.error || "inconnue"}`,
      `Code HTTP : ${result.statusCode ?? "inconnu"}`,
      "",
      "Vérifiez votre connexion Internet puis réessayez."
    ].join("\n")
  )
}

async function showAlert(title, message) {
  const alert = new Alert()
  alert.title = title
  alert.message = message
  alert.addAction("OK")
  await alert.presentAlert()
}

function messageOf(error) {
  return error?.message?.trim?.() || String(error || "Erreur inconnue.")
}

// =====================================================
// FORMATAGE
// =====================================================

function ratio(value, total) {
  const denominator = numberOf(total)
  if (denominator <= 0) return 0
  return Math.max(0, Math.min(100, (numberOf(value) / denominator) * 100))
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0))
}

function numberOf(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function formatNumber(value) {
  try {
    return Number(value).toLocaleString("fr-FR")
  } catch (_) {
    return String(value)
  }
}

function formatPercent(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return "0"
  return String(Math.round(number * 10) / 10).replace(".", ",")
}

function formatDecimal(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return "—"
  return String(Math.round(number * 10) / 10).replace(".", ",")
}

function formatDurationMs(value) {
  if (value === null || value === undefined) return "—"

  const milliseconds = Number(value)

  if (!Number.isFinite(milliseconds)) return "—"
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`

  return `${(milliseconds / 1000).toFixed(2).replace(".", ",")} s`
}

function formatDate(value) {
  if (!value) return "Aucune donnée"

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return String(value)

  return DATE_FORMATTER.string(date)
}

function formatDateShort(value) {
  if (!value) return "à une date inconnue"

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return String(value)

  return DAY_FORMATTER.string(date)
}

function formatHistoryDay(value) {
  const date = new Date(`${value}T12:00:00`)

  if (Number.isNaN(date.getTime())) return String(value)

  return DAY_FORMATTER.string(date)
}

function relativeDate(value) {
  if (!value) return "à une date inconnue"

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return formatDate(value)

  const difference = Math.max(0, Date.now() - date.getTime())
  const seconds = Math.floor(difference / 1000)

  if (seconds < 10) return "à l’instant"
  if (seconds < 60) return `il y a ${seconds} s`

  const minutes = Math.floor(seconds / 60)

  if (minutes < 60) return `il y a ${minutes} min`

  const hours = Math.floor(minutes / 60)

  if (hours < 24) return `il y a ${hours} h`

  const days = Math.floor(hours / 24)

  if (days < 30) return `il y a ${days} j`

  return `le ${formatDate(value)}`
}

function fileDateStamp(date) {
  const pad = value => String(value).padStart(2, "0")

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + "_" + [pad(date.getHours()), pad(date.getMinutes())].join("-")
}

function plural(value) {
  return numberOf(value) > 1 ? "s" : ""
}

// =====================================================
// LECTURE SÉCURISÉE
// =====================================================

function raw(object, keys, fallback = null) {
  const source = recordOf(object)

  for (const key of keys) {
    if (
      Object.prototype.hasOwnProperty.call(source, key) &&
      source[key] !== null &&
      source[key] !== undefined &&
      source[key] !== ""
    ) {
      return source[key]
    }
  }

  return fallback
}

function num(object, keys) {
  return numberOf(raw(object, keys, 0))
}

function nullableNum(object, keys) {
  const value = raw(object, keys, null)

  if (value === null || value === undefined || value === "") return null

  const number = Number(value)

  return Number.isFinite(number) ? number : null
}

function text(object, keys, fallback = "") {
  const value = raw(object, keys, fallback)
  return String(value ?? fallback)
}

function recordOf(value) {
  return isRecord(value) ? value : {}
}

function list(value) {
  return Array.isArray(value)
    ? value.filter(item => item && typeof item === "object")
    : []
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}
