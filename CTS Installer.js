// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: arrow.down.circle.fill;

const INSTALLER_VERSION = "1.0.18"

const REPO = {
  owner: "LASCAMPIA67",
  name: "CTS-Dashboard",
  branch: "main"
}

let repositoryRevision = REPO.branch
const INSTALLER_FILE = "CTS Installer.js"
const META_FILE = "installation.json"
const TIMEOUT = 60
const RETRIES = 2
const THROTTLE_RETRY_DELAYS = [1500, 4000, 9000]
const ICLOUD_DOWNLOAD_TIMEOUT = 15000
const DEFAULT_AUTHOR = "Emilio IPPOLITO"
let projectAuthor = DEFAULT_AUTHOR

function rememberAuthor(manifest) {
  const author = String(manifest?.author || "").trim()
  if (author) projectAuthor = author
}

function credit() {
  return `Créé et développé par ${projectAuthor}`
}
const RENDER_INTERVAL = 120
const CONCURRENCY = 4
const PINNED_LIBRARIES = new Set(["pdf.min.mjs", "pdf.worker.min.mjs"])
const MINIMUM_LIBRARY_KILOBYTES = 100
const DIAGNOSTIC_GRID_COLUMNS = 5
const FILE_WAIT_STEP = 20
const FILE_WAIT_TIMEOUT = 300
const ANALYTICS_MODULE = "CTS Analytics Client"

const COLORS = {
  blue: Color.dynamic(new Color("#0062CC"), new Color("#0A84FF")),
  green: Color.dynamic(new Color("#1F7A34"), new Color("#30D158")),
  orange: Color.dynamic(new Color("#9A4E00"), new Color("#FF9F0A")),
  red: Color.dynamic(new Color("#C00011"), new Color("#FF453A")),
  gray: Color.dynamic(new Color("#6D6D72"), new Color("#8E8E93")),
  secondary: Color.dynamic(new Color("#6D6D72"), new Color("#98989D")),
  primary: Color.dynamic(new Color("#111111"), new Color("#F5F5F7"))
}

const TEXT_SIZE_MODES = [
  {
    scale: 1,
    label: "Standard",
    detail: "Toutes les informations, texte de taille habituelle"
  },
  {
    scale: 1.25,
    label: "Grandes polices",
    detail: "Texte 25 % plus grand, détails du dépôt et de la direction masqués"
  }
]

const fm = FileManager.iCloud()
const docs = fm.documentsDirectory()
const join = (a, b) => fm.joinPath(a, b)
const root = join(docs, "CTS Dashboard")
const currentInstaller = join(docs, `${Script.name()}.js`)
const canonicalInstaller = join(docs, INSTALLER_FILE)

const paths = {
  root,
  data: join(root, "Data"),
  database: join(root, "Database"),
  cache: join(root, "Cache"),
  services: join(root, "Services"),
  archive: join(root, "Services/Archive"),
  rejected: join(root, "Services/Rejected"),
  serviceCache: join(root, "Cache/Services"),
  textCache: join(root, "Cache/Services/Text"),
  libraries: join(root, "Libraries"),
  pdf: join(root, "Libraries/PDF"),
  metadata: join(root, `Data/${META_FILE}`)
}

await main()
Script.complete()

async function main() {
  try {
    await preserveInstaller()

    repositoryRevision = await resolveRepositoryRevision()

    const manifest = await loadManifest()
    validateManifest(manifest)
    rememberAuthor(manifest)

    if (!(await handleInstallerUpdate(manifest))) {
      return
    }

    const state = await inspect(manifest)
    const action = await menu(manifest, state)

    if (action === "install") {
      await installOrUpdate(manifest, state)
    } else if (action === "diagnostic") {
      await runDiagnostic(manifest, state)
    } else if (action === "preferences") {
      await editPreferences()
    } else if (action === "uninstall") {
      await uninstall(manifest)
    }
  } catch (error) {
    await errorAlert(error)
  }
}

function screenTable() {
  const table = new UITable()
  table.showSeparators = true
  return table
}

function addHeroRow(table, { symbol, title, subtitle, tone }) {
  const row = new UITableRow()
  row.height = 92
  row.isHeader = true
  row.dismissOnSelect = false

  const glyph = SFSymbol.named(symbol)
  glyph.applyFont(Font.systemFont(30))

  const image = row.addImage(glyph.image)
  image.widthWeight = 16

  const text = row.addText(title, subtitle)
  text.widthWeight = 84
  text.titleFont = Font.boldSystemFont(22)
  text.subtitleFont = Font.systemFont(12)
  text.titleColor = tone
  text.subtitleColor = COLORS.secondary

  table.addRow(row)
}

function addVersionBand(table, cells) {
  const row = new UITableRow()
  row.height = 72
  row.dismissOnSelect = false

  const weight = 100 / cells.reduce((total, cell) => total + (cell.arrow ? 0.5 : 1), 0)

  for (const cell of cells) {
    const text = row.addText(
      cell.arrow ? "→" : cell.value,
      cell.arrow ? "" : cell.label.toUpperCase()
    )

    text.widthWeight = weight * (cell.arrow ? 0.5 : 1)
    text.titleFont = cell.arrow
      ? Font.systemFont(17)
      : Font.boldMonospacedSystemFont(cell.strong ? 21 : 18)
    text.subtitleFont = Font.boldSystemFont(9)
    text.titleColor = cell.arrow
      ? COLORS.gray
      : cell.strong
        ? cell.tone || COLORS.primary
        : COLORS.primary
    text.subtitleColor = COLORS.secondary
    text.centerAligned()
  }

  table.addRow(row)
}

function addStatusRow(table, { symbol, title, detail, tone }) {
  const row = new UITableRow()
  row.height = 48
  row.dismissOnSelect = false

  const glyph = SFSymbol.named(symbol)
  glyph.applyFont(Font.systemFont(15))

  const image = row.addImage(glyph.image)
  image.widthWeight = 12

  const text = row.addText(title, detail)
  text.widthWeight = 88
  text.titleFont = Font.semiboldSystemFont(13)
  text.subtitleFont = Font.systemFont(10)
  text.titleColor = tone || COLORS.primary
  text.subtitleColor = COLORS.secondary

  table.addRow(row)
}

function addSectionRow(table, label) {
  const row = new UITableRow()
  row.height = 34
  row.dismissOnSelect = false

  const text = row.addText(label.toUpperCase())
  text.titleFont = Font.boldSystemFont(10)
  text.titleColor = COLORS.secondary

  table.addRow(row)
}

function addActionRow(table, { symbol, label, detail, tone, primary, onSelect }) {
  const row = new UITableRow()
  row.height = primary ? 62 : 50
  row.onSelect = onSelect

  const glyph = SFSymbol.named(symbol)
  glyph.applyFont(Font.systemFont(primary ? 19 : 15))

  const image = row.addImage(glyph.image)
  image.widthWeight = 12

  const text = row.addText(label, detail || "")
  text.widthWeight = 82
  text.titleFont = primary ? Font.boldSystemFont(17) : Font.systemFont(15)
  text.subtitleFont = Font.systemFont(10)
  text.titleColor = tone || (primary ? COLORS.blue : COLORS.primary)
  text.subtitleColor = COLORS.secondary

  const chevron = SFSymbol.named("chevron.right")
  chevron.applyFont(Font.systemFont(11))

  const arrow = row.addImage(chevron.image)
  arrow.widthWeight = 6

  table.addRow(row)
}

async function menu(manifest, state) {
  const table = screenTable()
  let choice = null

  const select = value => () => {
    choice = value
  }

  if (!state.present) {
    addHeroRow(table, {
      symbol: "square.and.arrow.down.fill",
      title: "Installation",
      subtitle: "CTS Dashboard",
      tone: COLORS.blue
    })

    addVersionBand(table, [
      { value: manifest.version, label: "À installer", strong: true, tone: COLORS.blue },
      { value: INSTALLER_VERSION, label: "Installer" }
    ])

    addStatusRow(table, {
      symbol: "shippingbox.fill",
      title: `${manifestEntries(manifest).length} fichiers à installer`,
      detail: "Scripts, ressources et dossiers nécessaires"
    })

    addStatusRow(table, {
      symbol: "lock.shield.fill",
      title: "Données protégées",
      detail: "Vos services PDF resteront conservés.",
      tone: COLORS.green
    })

    addSectionRow(table, "Action")

    addActionRow(table, {
      symbol: "arrow.down.circle.fill",
      label: `Installer ${manifest.version}`,
      detail: "Installation complète et automatique",
      primary: true,
      onSelect: select("install")
    })

    addCreditRow(table)

    await table.present(true)

    return choice
  }

  const installedVersion = state.installedVersion || "Non identifiée"

  const updateAvailable =
    Boolean(state.installedVersion) &&
    compareVersions(manifest.version, state.installedVersion) > 0

  const issues = [...state.missing, ...state.invalid]

  if (updateAvailable) {
    addHeroRow(table, {
      symbol: "arrow.down.circle.fill",
      title: "Mise à jour disponible",
      subtitle: "CTS Dashboard",
      tone: COLORS.blue
    })

    addVersionBand(table, [
      { value: installedVersion, label: "Installée" },
      { arrow: true },
      { value: manifest.version, label: "Nouvelle", strong: true, tone: COLORS.blue }
    ])
  } else if (state.complete) {
    addHeroRow(table, {
      symbol: "checkmark.seal.fill",
      title: "Tout est à jour",
      subtitle: "Installation vérifiée",
      tone: COLORS.green
    })

    addVersionBand(table, [
      { value: installedVersion, label: "Dashboard", strong: true, tone: COLORS.green },
      { value: INSTALLER_VERSION, label: "Installer" }
    ])
  } else {
    addHeroRow(table, {
      symbol: "exclamationmark.triangle.fill",
      title: "Réparation nécessaire",
      subtitle: "CTS Dashboard",
      tone: COLORS.orange
    })

    addVersionBand(table, [
      { value: installedVersion, label: "Installée" },
      { value: INSTALLER_VERSION, label: "Installer" }
    ])
  }

  addStatusRow(table, {
    symbol: state.complete ? "checkmark.circle.fill" : "xmark.circle.fill",
    title: `${state.valid}/${state.total} fichiers valides`,
    detail: issues.length ? compactNames(issues) : "Aucun fichier manquant ni altéré",
    tone: state.complete ? COLORS.green : COLORS.orange
  })

  addStatusRow(table, {
    symbol: "lock.shield.fill",
    title: "Données protégées",
    detail: "CTS Installer, services PDF et archives sont conservés.",
    tone: COLORS.green
  })

  addSectionRow(table, "Actions")

  addActionRow(table, {
    symbol: updateAvailable
      ? "arrow.down.circle.fill"
      : state.complete
        ? "arrow.triangle.2.circlepath"
        : "wrench.and.screwdriver.fill",
    label: updateAvailable
      ? `Mettre à jour vers ${manifest.version}`
      : state.complete
        ? "Vérifier les fichiers"
        : "Réparer l’installation",
    detail: updateAvailable
      ? "Prête à être installée"
      : state.complete
        ? "Comparer avec la version publiée"
        : "Les fichiers absents ou invalides seront rétablis",
    tone: state.complete && !updateAvailable ? COLORS.blue : undefined,
    primary: true,
    onSelect: select("install")
  })

  addActionRow(table, {
    symbol: "stethoscope",
    label: "Diagnostic",
    detail: "Rapport complet de l’installation",
    onSelect: select("diagnostic")
  })

  addActionRow(table, {
    symbol: "textformat.size",
    label: "Taille du texte",
    detail: preferencesLabel(),
    onSelect: select("preferences")
  })

  addActionRow(table, {
    symbol: "trash",
    label: "Désinstaller",
    detail: "Vos PDF et leurs archives sont conservés",
    tone: COLORS.red,
    onSelect: select("uninstall")
  })

  addCreditRow(table)

  await table.present(true)

  return choice
}

function preferencesModule() {
  const storage = importModule("CTS Storage")

  if (
    !storage ||
    typeof storage.loadPreferences !== "function" ||
    typeof storage.savePreferences !== "function"
  ) {
    throw new Error("CTS Storage ne gère pas encore les préférences d’affichage.")
  }

  return storage
}

function preferencesLabel() {
  try {
    const path = join(paths.data, "preferences.json")

    if (!fm.fileExists(path)) return TEXT_SIZE_MODES[0].label

    const scale = Number(JSON.parse(fm.readString(path))?.textScale)
    const mode = TEXT_SIZE_MODES.find(item => Math.abs(item.scale - scale) < 0.01)

    return (mode || TEXT_SIZE_MODES[0]).label
  } catch (_) {
    return TEXT_SIZE_MODES[0].label
  }
}

/*
 * Le widget lit ce réglage, il ne l'écrit jamais : un widget peut être
 * tué en pleine écriture, et c'est l'installateur qui a le temps.
 */
async function editPreferences() {
  const storage = preferencesModule()
  const current = await storage.loadPreferences()
  const table = screenTable()
  let chosen = null

  addHeroRow(table, {
    symbol: "textformat.size",
    title: "Taille du texte",
    subtitle: "Widget CTS Dashboard",
    tone: COLORS.blue
  })

  addStatusRow(table, {
    symbol: "eye",
    title: "Réglage actuel",
    detail: preferencesLabel(),
    tone: COLORS.primary
  })

  addSectionRow(table, "Choisir")

  for (const mode of TEXT_SIZE_MODES) {
    const active = Math.abs(current.textScale - mode.scale) < 0.01

    addActionRow(table, {
      symbol: active ? "checkmark.circle.fill" : "circle",
      label: mode.label,
      detail: mode.detail,
      tone: active ? COLORS.green : undefined,
      primary: active,
      onSelect: () => {
        chosen = mode.scale
      }
    })
  }

  addCreditRow(table)

  await table.present(true)

  if (chosen === null || Math.abs(chosen - current.textScale) < 0.01) return

  await storage.savePreferences({ textScale: chosen })
}

async function inspect(manifest) {
  const metadata = await readMetadata()
  const entries = manifestEntries(manifest)
  const missing = []
  const invalid = []
  const reasons = {}
  let existing = 0
  let valid = 0

  for (const entry of entries) {
    if (!fm.fileExists(entry.destination)) {
      missing.push(entry.name)
      reasons[entry.name] = "Absent"
      continue
    }

    existing++

    const result = await validateLocal(entry.destination, entry.name)

    if (result.valid) {
      valid++
    } else {
      invalid.push(entry.name)
      reasons[entry.name] = result.reason
    }
  }

  const total = entries.length
  const present = Boolean(metadata || existing || fm.fileExists(root))
  const complete = present && valid === total

  const installedVersion =
    typeof metadata?.dashboardVersion === "string"
      ? metadata.dashboardVersion
      : complete
        ? manifest.version
        : null

  return {
    present,
    complete,
    existing,
    valid,
    total,
    installedVersion,
    missing,
    invalid,
    reasons
  }
}

async function installOrUpdate(manifest, previous) {
  const fresh = !previous.present

  const versionUpdate =
    Boolean(previous.installedVersion) &&
    compareVersions(manifest.version, previous.installedVersion) > 0

  const operation = fresh
    ? "installation"
    : versionUpdate
      ? "update"
      : previous.complete
        ? "verification"
        : "repair"

  const title = operationTitle(operation)

  const entries = manifestEntries(manifest)

  const progress = progressTable({
    title,
    version: manifest.version,
    entries,
    operation
  })

  progress.present()

  const summary = {
    installed: [],
    updated: [],
    repaired: [],
    unchanged: [],
    failed: []
  }

  const failures = []
  const startedAt = Date.now()
  const metadata = await readMetadata()
  const snapshotUnchanged =
    Boolean(metadata?.repositoryRevision) && metadata.repositoryRevision === repositoryRevision

  try {
    await progress.system("installer", "running", "Protection de CTS Installer…")

    await preserveInstaller()

    await progress.system("installer", "success", "Installateur protégé")

    await progress.system("github", "running", "Validation du snapshot GitHub…")

    verifyRepository(manifest)

    await progress.system(
      "github",
      "success",
      `Snapshot ${repositoryRevision.slice(0, 7)} validé`
    )

    await progress.system("directories", "running", "Préparation de l’arborescence…")

    ensureDirectories()

    await progress.system("directories", "success", "Arborescence prête")

    let completed = 0

    for (let start = 0; start < entries.length; start += CONCURRENCY) {
      const wave = entries.slice(start, start + CONCURRENCY).map((entry, offset) => ({
        entry,
        index: start + offset
      }))

      for (const item of wave) {
        await progress.entry(item.index, "running", `Contrôle de ${item.entry.name}`)
      }

      const results = await Promise.all(
        wave.map(async item => {
          try {
            return {
              ...item,
              status: await syncFile(item.entry, {
                snapshotUnchanged
              })
            }
          } catch (error) {
            return {
              ...item,
              reason: messageOf(error)
            }
          }
        })
      )

      for (const result of results) {
        if (result.status) {
          summary[result.status].push(result.entry.name)

          await progress.entry(result.index, result.status, statusLabel(result.status))
        } else {
          failures.push({
            index: result.index,
            entry: result.entry,
            reason: result.reason
          })

          await progress.entry(result.index, "retry", "Nouvelle tentative programmée")
        }

        completed++
      }

      await progress.advance(completed, entries.length)
    }

    if (failures.length) {
      await progress.system(
        "retry",
        "running",
        `${plural(failures.length, "nouvelle tentative", "nouvelles tentatives")}…`
      )

      for (const failure of failures) {
        await progress.entry(
          failure.index,
          "running",
          `Nouvelle tentative : ${failure.entry.name}`
        )

        try {
          const status = await syncFile(failure.entry, { force: true })

          summary[status].push(failure.entry.name)

          failure.resolved = true

          await progress.entry(failure.index, status, statusLabel(status))
        } catch (error) {
          failure.reason = messageOf(error)
          summary.failed.push(failure.entry.name)

          await progress.entry(failure.index, "error", failure.reason)
        }
      }

      const unresolved = failures.filter(item => !item.resolved)

      await progress.system(
        "retry",
        unresolved.length ? "error" : "success",
        unresolved.length
          ? `${plural(unresolved.length, "fichier")} encore en erreur`
          : "Toutes les nouvelles tentatives ont réussi"
      )
    } else {
      await progress.system("retry", "success", "Aucune nouvelle tentative nécessaire")
    }

    await progress.system("verification", "running", "Validation finale…")

    const verification = await inspect(manifest)

    if (!verification.complete) {
      const issues = [
        ...verification.missing.map(name => `${name} — absent`),
        ...verification.invalid.map(
          name => `${name} — ${verification.reasons[name] || "invalide"}`
        )
      ]

      await progress.system(
        "verification",
        "error",
        `${verification.valid}/${verification.total} fichiers valides`
      )

      await progress.finish({
        success: false,
        title: "Installation non validée",
        message: [
          `${verification.valid}/${verification.total} fichiers sont valides.`,
          issues.length ? issues.join("\n") : "Une erreur inconnue empêche la validation."
        ].join("\n"),
        summary,
        duration: Date.now() - startedAt,
        valid: verification.valid,
        total: verification.total
      })

      return
    }

    await writeMetadata(manifest, summary)

    await preserveInstaller()

    await registerAnalyticsInstallation(manifest.version)

    await progress.system(
      "verification",
      "success",
      `${verification.valid}/${verification.total} fichiers valides`
    )

    await progress.finish({
      success: true,
      title: operationResultTitle(operation),
      message: `CTS Dashboard ${manifest.version} est prêt.`,
      summary,
      duration: Date.now() - startedAt,
      valid: verification.valid,
      total: verification.total
    })
  } catch (error) {
    await progress.system("verification", "error", "Opération interrompue")

    await progress.finish({
      success: false,
      title: "Opération interrompue",
      message: messageOf(error),
      summary,
      duration: Date.now() - startedAt,
      valid: null,
      total: entries.length
    })
  }
}

async function canSkipPinnedLibrary(entry) {
  if (!PINNED_LIBRARIES.has(entry.name)) {
    return false
  }

  if (!fm.fileExists(entry.destination)) {
    return false
  }

  let kilobytes = 0

  try {
    kilobytes = Number(fm.fileSize(entry.destination)) || 0
  } catch (_) {
    return false
  }

  if (kilobytes < MINIMUM_LIBRARY_KILOBYTES) {
    return false
  }

  const check = await validateLocal(entry.destination, entry.name)

  return check.valid
}

async function syncFile(entry, options = {}) {
  const force = Boolean(options.force)

  if (!force && options.snapshotUnchanged && (await canSkipPinnedLibrary(entry))) {
    return "unchanged"
  }

  let remote
  let lastError

  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      remote = await downloadText(
        `${rawUrl(entry.name)}?t=${Date.now()}-${attempt}`,
        entry.name
      )

      const validation = validateText(remote, entry.name)

      if (!validation.valid) {
        throw new Error(`Version GitHub invalide : ${validation.reason}`)
      }

      break
    } catch (error) {
      lastError = error

      if (attempt < RETRIES) {
        await sleep(400)
      }
    }
  }

  if (remote === undefined) {
    throw lastError || new Error(`${entry.name} impossible à télécharger.`)
  }

  const existed = fm.fileExists(entry.destination)
  let localValid = false

  if (existed) {
    const check = await inspectLocal(entry.destination, entry.name)

    localValid = check.valid

    if (
      !force &&
      localValid &&
      normalize(check.content, entry.name) === normalize(remote, entry.name)
    ) {
      return "unchanged"
    }
  }

  await writeText(entry.destination, remote)

  const result = await inspectLocal(entry.destination, entry.name)

  if (!result.valid) {
    throw new Error(`${entry.name} invalide après écriture : ${result.reason}`)
  }

  if (normalize(result.content, entry.name) !== normalize(remote, entry.name)) {
    throw new Error(`${entry.name} ne correspond pas au snapshot GitHub après écriture.`)
  }

  if (!existed) {
    return "installed"
  }

  if (!localValid) {
    return "repaired"
  }

  return "updated"
}

async function preserveInstaller() {
  const canonical = await readInstallerCandidate(canonicalInstaller)

  const current =
    currentInstaller === canonicalInstaller
      ? canonical
      : await readInstallerCandidate(currentInstaller)

  let selected = selectInstallerCandidate(canonical, current)

  if (!selected) {
    const content = await downloadText(
      `${rawUrl(INSTALLER_FILE)}?self=${Date.now()}`,
      INSTALLER_FILE
    )

    selected = createInstallerCandidate(content)
  }

  if (!selected) {
    throw new Error("La copie de CTS Installer est invalide.")
  }

  if (
    !canonical ||
    normalize(canonical.content, INSTALLER_FILE) !== normalize(selected.content, INSTALLER_FILE)
  ) {
    await writeText(canonicalInstaller, selected.content)
  }

  if (!(await readInstallerCandidate(canonicalInstaller))) {
    throw new Error("CTS Installer.js n’a pas pu être conservé.")
  }
}

async function readInstallerCandidate(path) {
  if (!path || !fm.fileExists(path)) {
    return null
  }

  try {
    return createInstallerCandidate(await readText(path))
  } catch (_) {
    return null
  }
}

function createInstallerCandidate(content) {
  if (!isInstallerSource(content)) {
    return null
  }

  return {
    content,
    version: installerVersion(content)
  }
}

function selectInstallerCandidate(canonical, current) {
  if (!canonical) {
    return current
  }

  if (!current) {
    return canonical
  }

  return compareVersions(current.version, canonical.version) >= 0 ? current : canonical
}

function installerVersion(content) {
  const match = String(content || "").match(/const\s+INSTALLER_VERSION\s*=\s*"([^"]+)"/)

  return match?.[1]?.trim?.() || ""
}

function isInstallerSource(content) {
  return Boolean(
    installerVersion(content) &&
    content.includes(`const INSTALLER_FILE = "${INSTALLER_FILE}"`) &&
    content.includes("async function main()")
  )
}

async function runDiagnostic(manifest, state) {
  const diagnostic = {
    generatedAt: new Date().toISOString(),
    dashboardVersion: state.installedVersion || manifest.version || "?",
    installerVersion: INSTALLER_VERSION,
    iosVersion: Device.systemVersion(),
    snapshot: String(repositoryRevision || "").slice(0, 7),
    installedSnapshot: "",
    checks: [],
    lastImport: null,
    lastFailure: null
  }

  try {
    const metadata = await readMetadata()
    diagnostic.installedSnapshot = String(metadata?.repositoryRevision || "").slice(0, 7)
  } catch (_) {}

  addDiagnosticCheck(
    diagnostic,
    "Installation",
    state.complete ? "success" : "error",
    `${state.valid}/${state.total} fichiers locaux valides`
  )

  const current =
    diagnostic.installedSnapshot && diagnostic.installedSnapshot === diagnostic.snapshot

  addDiagnosticCheck(
    diagnostic,
    "Version installée",
    current ? "success" : "warning",
    diagnostic.installedSnapshot
      ? current
        ? `Snapshot ${diagnostic.installedSnapshot} — à jour`
        : `Snapshot ${diagnostic.installedSnapshot} — GitHub publie ${diagnostic.snapshot}`
      : "Révision installée inconnue — relancez une vérification des fichiers"
  )

  try {
    verifyRepository(manifest)

    addDiagnosticCheck(
      diagnostic,
      "GitHub",
      "success",
      `Snapshot ${diagnostic.snapshot} accessible`
    )
  } catch (error) {
    addDiagnosticCheck(diagnostic, "GitHub", "error", sanitizeDiagnosticText(messageOf(error)))
  }

  const directoryCheck = inspectDiagnosticDirectories()

  addDiagnosticCheck(
    diagnostic,
    "Dossiers iCloud",
    directoryCheck.status,
    directoryCheck.detail
  )

  const writeCheck = await diagnosticWriteTest()

  addDiagnosticCheck(diagnostic, "Écriture iCloud", writeCheck.status, writeCheck.detail)

  const resourcesCheck = await inspectDiagnosticResources()

  addDiagnosticCheck(diagnostic, "Ressources", resourcesCheck.status, resourcesCheck.detail)

  const servicesCheck = inspectDiagnosticServicesFolder()

  addDiagnosticCheck(diagnostic, "Dossier Services", servicesCheck.status, servicesCheck.detail)

  const indexCheck = await inspectDiagnosticIndex()

  addDiagnosticCheck(diagnostic, "Index des services", indexCheck.status, indexCheck.detail)

  const residueCheck = inspectDiagnosticResidue()

  addDiagnosticCheck(diagnostic, "Restes d’écriture", residueCheck.status, residueCheck.detail)

  const logCheck = await inspectDiagnosticLog()

  diagnostic.lastImport = logCheck.lastImport
  diagnostic.lastFailure = logCheck.lastFailure

  addDiagnosticCheck(diagnostic, "Journal d’import", logCheck.status, logCheck.detail)

  await presentDiagnostic(diagnostic)
}

function addDiagnosticCheck(diagnostic, title, status, detail) {
  diagnostic.checks.push({
    title: String(title || "Diagnostic"),
    status: diagnosticStatus(status),
    detail: sanitizeDiagnosticText(detail)
  })
}

function inspectDiagnosticDirectories() {
  const required = [
    paths.root,
    paths.data,
    paths.database,
    paths.cache,
    paths.services,
    paths.archive,
    paths.rejected,
    paths.serviceCache,
    paths.textCache,
    paths.libraries,
    paths.pdf
  ]

  const missing = required.filter(path => !fm.fileExists(path))

  return missing.length
    ? {
        status: "error",
        detail: `${plural(missing.length, "dossier requis absent", "dossiers requis absents")}`
      }
    : {
        status: "success",
        detail: `${required.length}/${required.length} dossiers accessibles`
      }
}

async function diagnosticWriteTest() {
  if (!fm.fileExists(paths.data)) {
    return {
      status: "error",
      detail: "Le dossier Data est inaccessible"
    }
  }

  const testPath = join(paths.data, `.cts-diagnostic-${Date.now()}.tmp`)

  try {
    const token = `CTS-${Date.now()}`

    fm.writeString(testPath, token)

    const saved = fm.readString(testPath)

    if (saved !== token) {
      throw new Error("Le contenu relu ne correspond pas au test écrit.")
    }

    removeQuietly(testPath)

    return {
      status: "success",
      detail: "Lecture et écriture iCloud fonctionnelles"
    }
  } catch (error) {
    removeQuietly(testPath)

    return {
      status: "error",
      detail: sanitizeDiagnosticText(messageOf(error))
    }
  }
}

/*
 * L'entretien du widget balaie les restes d'écriture et consigne son
 * passage. On relit sa trace plutôt que de reparcourir les dossiers :
 * ce qui compte ici est de savoir qu'il tourne, et si des fichiers ont
 * été conservés faute de pouvoir prouver qu'ils étaient inutiles.
 */
function inspectDiagnosticResidue() {
  const statePath = join(paths.data, "services-cleanup-state.json")

  if (!fm.fileExists(statePath)) {
    return { status: "warning", detail: "Aucun entretien enregistré pour le moment" }
  }

  let state

  try {
    state = JSON.parse(fm.readString(statePath))
  } catch (error) {
    return { status: "warning", detail: sanitizeDiagnosticText(messageOf(error)) }
  }

  const residue = isRecord(state?.lastResidue) ? state.lastResidue : null

  if (!residue) {
    return { status: "success", detail: "Aucun balayage nécessaire jusqu’ici" }
  }

  const preserved = Number(residue.preserved) || 0
  const removed = Number(residue.removed) || 0
  const errors = Number(residue.errors) || 0

  if (errors) {
    return {
      status: "error",
      detail: `${plural(errors, "reste non supprimé", "restes non supprimés")}`
    }
  }

  if (preserved) {
    return {
      status: "warning",
      detail: `${plural(preserved, "fichier conservé", "fichiers conservés")} par précaution`
    }
  }

  return {
    status: "success",
    detail: removed
      ? `${plural(removed, "reste effacé", "restes effacés")}`
      : "Aucun reste d’écriture"
  }
}

async function inspectDiagnosticResources() {
  const resources = [
    {
      path: join(paths.database, "lines.json"),
      name: "lines.json"
    },
    {
      path: join(paths.database, "stops.json"),
      name: "stops.json"
    },
    {
      path: join(paths.database, "places.json"),
      name: "places.json"
    },
    {
      path: join(paths.pdf, "pdf.min.mjs"),
      name: "pdf.min.mjs"
    },
    {
      path: join(paths.pdf, "pdf.worker.min.mjs"),
      name: "pdf.worker.min.mjs"
    }
  ]

  let valid = 0
  const failures = []

  for (const resource of resources) {
    const result = await validateLocal(resource.path, resource.name)

    if (result.valid) {
      valid++
    } else {
      failures.push(resource.name)
    }
  }

  return failures.length
    ? {
        status: "error",
        detail: `${valid}/${resources.length} ressources valides · ${compactNames(failures)}`
      }
    : {
        status: "success",
        detail: `${valid}/${resources.length} ressources techniques valides`
      }
}

function inspectDiagnosticServicesFolder() {
  if (!fm.fileExists(paths.services)) {
    return {
      status: "error",
      detail: "Le dossier Services est introuvable"
    }
  }

  let contents

  try {
    contents = fm.listContents(paths.services)
  } catch (error) {
    return {
      status: "error",
      detail: sanitizeDiagnosticText(messageOf(error))
    }
  }

  let pdfCount = 0
  let pendingCloud = 0
  let inaccessible = 0

  for (const name of contents) {
    if (!/\.pdf$/i.test(name)) {
      continue
    }

    const path = join(paths.services, name)

    try {
      if (fm.isDirectory(path)) {
        continue
      }

      pdfCount++

      if (!fm.isFileDownloaded(path)) {
        pendingCloud++
      }
    } catch (_) {
      inaccessible++
    }
  }

  if (inaccessible > 0) {
    return {
      status: "error",
      detail: `${plural(pdfCount, "PDF détecté", "PDF détectés")} · ${plural(inaccessible, "inaccessible")}`
    }
  }

  if (pendingCloud > 0) {
    return {
      status: "warning",
      detail: `${plural(pdfCount, "PDF détecté", "PDF détectés")} · ${pendingCloud} en attente iCloud`
    }
  }

  if (pdfCount === 0) {
    return {
      status: "info",
      detail: "Aucun PDF actuellement présent dans Services"
    }
  }

  return {
    status: "success",
    detail: `${plural(pdfCount, "PDF détecté et accessible", "PDF détectés et accessibles")}`
  }
}

async function inspectDiagnosticIndex() {
  try {
    const importer = importModule("CTS Importer")

    if (!importer || typeof importer.readCurrentIndex !== "function") {
      return {
        status: "error",
        detail: "CTS Importer ne fournit pas readCurrentIndex()"
      }
    }

    const index = await importer.readCurrentIndex()
    const count = Array.isArray(index?.services) ? index.services.length : 0

    return count > 0
      ? {
          status: "success",
          detail: `${plural(count, "service indexé", "services indexés")}`
        }
      : {
          status: "info",
          detail: "Index valide, aucun service enregistré"
        }
  } catch (error) {
    return {
      status: "error",
      detail: sanitizeDiagnosticText(messageOf(error))
    }
  }
}

async function inspectDiagnosticLog() {
  try {
    const storage = importModule("CTS Storage")

    if (!storage || typeof storage.loadLog !== "function") {
      return {
        status: "error",
        detail: "CTS Storage ne fournit pas loadLog()",
        lastImport: null,
        lastFailure: null
      }
    }

    const logs = await storage.loadLog()
    const entries = Array.isArray(logs)
      ? logs.filter(item => item && typeof item === "object")
      : []

    if (!entries.length) {
      return {
        status: "info",
        detail: "Aucun import encore enregistré",
        lastImport: null,
        lastFailure: null
      }
    }

    const lastImport = normalizeDiagnosticLogEntry(entries[entries.length - 1])
    const lastFailureSource = [...entries]
      .reverse()
      .find(item => item?.type === "exception" || item?.type === "validation-error")

    const lastFailure = lastFailureSource
      ? normalizeDiagnosticLogEntry(lastFailureSource)
      : null

    if (lastImport.type === "exception") {
      return {
        status: "error",
        detail: `${lastImport.code || "SERVICE_IMPORT_FAILED"} · ${lastImport.stage || "import"}`,
        lastImport,
        lastFailure
      }
    }

    if (lastImport.type === "validation-error") {
      return {
        status: "warning",
        detail: `${lastImport.code || "HASTUS_VALIDATION_FAILED"} · ${lastImport.stage || "validation"}`,
        lastImport,
        lastFailure
      }
    }

    return {
      status: "success",
      detail: `Dernier import : ${diagnosticLogTypeLabel(lastImport.type)}`,
      lastImport,
      lastFailure
    }
  } catch (error) {
    return {
      status: "error",
      detail: sanitizeDiagnosticText(messageOf(error)),
      lastImport: null,
      lastFailure: null
    }
  }
}

function normalizeDiagnosticLogEntry(entry) {
  const details = isRecord(entry?.details) ? entry.details : {}
  const technical = isRecord(details.details) ? details.details : {}

  return {
    timestamp: String(entry?.timestamp || ""),
    type: String(entry?.type || "info"),
    code: String(details.telemetryCode || ""),
    stage: String(details.telemetryStage || ""),
    error: sanitizeDiagnosticText(details.error || technical.message || ""),
    name: sanitizeDiagnosticText(technical.name || ""),
    stack: sanitizeDiagnosticText(technical.stack || ""),
    timings: normalizeDiagnosticTimings(details.timings)
  }
}

function normalizeDiagnosticTimings(value) {
  const timings = isRecord(value) ? value : {}

  const fields = [
    "sourceInspectionMs",
    "pdfExtractionMs",
    "databaseReloadMs",
    "parserMs",
    "registrationMs",
    "totalMs"
  ]

  const result = {}

  for (const field of fields) {
    const number = Number(timings[field])
    result[field] = Number.isFinite(number) ? number : null
  }

  return result
}

function diagnosticLogTypeLabel(type) {
  return (
    {
      success: "réussi",
      exception: "erreur technique",
      "validation-error": "validation refusée"
    }[type] || String(type || "inconnu")
  )
}

async function presentDiagnostic(diagnostic) {
  const table = new UITable()
  table.showSeparators = true

  const counts = diagnosticCounts(diagnostic.checks)
  const header = new UITableRow()
  header.height = 82
  header.isHeader = true

  const symbol = SFSymbol.named("stethoscope")
  symbol.applyFont(Font.systemFont(25))

  const image = header.addImage(symbol.image)
  image.widthWeight = 14

  const headerText = header.addText(
    "Diagnostic CTS Dashboard",
    `Dashboard ${diagnostic.dashboardVersion} · Installer ${diagnostic.installerVersion} · iOS ${diagnostic.iosVersion}`
  )

  headerText.widthWeight = 86
  headerText.titleFont = Font.boldSystemFont(19)
  headerText.subtitleFont = Font.systemFont(10)
  headerText.titleColor = diagnosticOverallColor(counts)
  headerText.subtitleColor = COLORS.secondary

  table.addRow(header)

  addDiagnosticSummaryRow(table, counts)
  addDiagnosticGrid(table, diagnostic.checks)
  addDiagnosticFocusRow(table, diagnostic.checks)
  addDiagnosticDetailsRow(table, diagnostic.checks)

  const reportRow = new UITableRow()
  reportRow.height = 56
  reportRow.dismissOnSelect = false

  const reportSymbol = SFSymbol.named("doc.on.doc.fill")
  reportSymbol.applyFont(Font.systemFont(18))

  const reportImage = reportRow.addImage(reportSymbol.image)
  reportImage.widthWeight = 11

  const reportText = reportRow.addText(
    "Copier le rapport technique",
    "Rapport anonymisé prêt à envoyer dans WhatsApp"
  )

  reportText.widthWeight = 89
  reportText.titleFont = Font.semiboldSystemFont(13)
  reportText.subtitleFont = Font.systemFont(9)
  reportText.titleColor = COLORS.blue
  reportText.subtitleColor = COLORS.secondary

  reportRow.onSelect = async () => {
    Pasteboard.copyString(buildDiagnosticReport(diagnostic))

    const alert = new Alert()
    alert.title = "Rapport copié"
    alert.message = [
      "Le rapport technique anonymisé a été copié dans le presse-papiers.",
      "",
      "Collez-le dans WhatsApp pour l’envoyer."
    ].join("\n")
    alert.addAction("OK")
    await alert.present()
  }

  table.addRow(reportRow)

  const privacyRow = new UITableRow()
  privacyRow.height = 50

  const privacyText = privacyRow.addText(
    "Données protégées",
    "Aucun nom, matricule, horaire, contenu PDF ou numéro de service n’est inclus."
  )

  privacyText.titleFont = Font.semiboldSystemFont(12)
  privacyText.subtitleFont = Font.systemFont(9)
  privacyText.titleColor = COLORS.green
  privacyText.subtitleColor = COLORS.secondary

  table.addRow(privacyRow)

  addCreditRow(table)

  await table.present(true)
}

function addDiagnosticGrid(table, checks) {
  for (let start = 0; start < checks.length; start += DIAGNOSTIC_GRID_COLUMNS) {
    const slice = checks.slice(start, start + DIAGNOSTIC_GRID_COLUMNS)
    const row = new UITableRow()
    row.height = 48

    for (const check of slice) {
      const visual = diagnosticVisual(check.status)
      const cell = row.addText(visual.marker, diagnosticShortTitle(check.title))

      cell.widthWeight = 100 / DIAGNOSTIC_GRID_COLUMNS
      cell.titleFont = Font.boldSystemFont(16)
      cell.subtitleFont = Font.semiboldSystemFont(8)
      cell.titleColor = visual.color
      cell.subtitleColor = COLORS.secondary
      cell.centerAligned()
    }

    for (let filler = slice.length; filler < DIAGNOSTIC_GRID_COLUMNS; filler++) {
      const cell = row.addText("", "")
      cell.widthWeight = 100 / DIAGNOSTIC_GRID_COLUMNS
    }

    table.addRow(row)
  }
}

function addDiagnosticFocusRow(table, checks) {
  const focus =
    checks.find(check => check.status === "error") ||
    checks.find(check => check.status === "warning")

  const row = new UITableRow()
  row.height = 52

  const text = row.addText(
    focus ? focus.title : "Aucune anomalie",
    focus ? focus.detail : `${plural(checks.length, "contrôle")} passés avec succès`
  )

  text.widthWeight = 100
  text.titleFont = Font.semiboldSystemFont(14)
  text.subtitleFont = Font.systemFont(10)
  text.titleColor = focus ? diagnosticVisual(focus.status).color : COLORS.green
  text.subtitleColor = COLORS.secondary

  table.addRow(row)
}

function addDiagnosticDetailsRow(table, checks) {
  const row = new UITableRow()
  row.height = 52
  row.dismissOnSelect = false

  const symbol = SFSymbol.named("list.bullet.rectangle.fill")
  symbol.applyFont(Font.systemFont(17))

  const image = row.addImage(symbol.image)
  image.widthWeight = 11

  const text = row.addText(
    "Détails du diagnostic",
    `${plural(checks.length, "contrôle")} · toucher pour afficher`
  )

  text.widthWeight = 89
  text.titleFont = Font.semiboldSystemFont(13)
  text.subtitleFont = Font.systemFont(9)
  text.titleColor = COLORS.blue
  text.subtitleColor = COLORS.secondary

  row.onSelect = async () => {
    const details = new UITable()
    details.showSeparators = true

    for (const check of checks) {
      addDiagnosticRow(details, check)
    }

    await details.present(true)
  }

  table.addRow(row)
}

function diagnosticShortTitle(title) {
  const short = {
    "Dossiers iCloud": "DOSSIERS",
    "Écriture iCloud": "ÉCRITURE",
    "Dossier Services": "SERVICES",
    "Index des services": "INDEX",
    "Journal d’import": "JOURNAL",
    "Restes d’écriture": "RESTES",
    "Espace disque": "DISQUE"
  }[title]

  return short || String(title || "").toUpperCase()
}

function addDiagnosticSummaryRow(table, counts) {
  const row = new UITableRow()
  row.height = 68

  const values = [
    {
      title: counts.success,
      subtitle: "VALIDÉS",
      color: COLORS.green
    },
    {
      title: counts.warning,
      subtitle: "À CONTRÔLER",
      color: counts.warning ? COLORS.orange : COLORS.green
    },
    {
      title: counts.error,
      subtitle: "ERREURS",
      color: counts.error ? COLORS.red : COLORS.green
    }
  ]

  for (const item of values) {
    const cell = row.addText(String(item.title), item.subtitle)

    cell.widthWeight = 100 / values.length
    cell.titleFont = Font.boldSystemFont(17)
    cell.subtitleFont = Font.boldSystemFont(8)
    cell.titleColor = item.color
    cell.subtitleColor = COLORS.secondary
  }

  table.addRow(row)
}

function addDiagnosticRow(table, check) {
  const visual = diagnosticVisual(check.status)
  const row = new UITableRow()
  row.height = 55

  const marker = row.addText(visual.marker)
  marker.widthWeight = 8
  marker.titleFont = Font.boldSystemFont(16)
  marker.titleColor = visual.color

  const content = row.addText(check.title, check.detail)

  content.widthWeight = 92
  content.titleFont = Font.semiboldSystemFont(12)
  content.subtitleFont = Font.systemFont(9)
  content.titleColor = COLORS.primary
  content.subtitleColor = visual.color

  table.addRow(row)
}

function diagnosticCounts(checks) {
  const result = {
    success: 0,
    warning: 0,
    error: 0,
    info: 0
  }

  for (const check of checks) {
    const status = diagnosticStatus(check.status)
    result[status]++
  }

  return result
}

function diagnosticOverallColor(counts) {
  return counts.error > 0 ? COLORS.red : counts.warning > 0 ? COLORS.orange : COLORS.green
}

function diagnosticStatus(value) {
  return ["success", "warning", "error", "info"].includes(value) ? value : "info"
}

function diagnosticVisual(status) {
  return {
    success: {
      marker: "✓",
      color: COLORS.green
    },
    warning: {
      marker: "!",
      color: COLORS.orange
    },
    error: {
      marker: "×",
      color: COLORS.red
    },
    info: {
      marker: "i",
      color: COLORS.blue
    }
  }[diagnosticStatus(status)]
}

function readLastRunTrace() {
  try {
    const target = join(paths.data, "last-run.json")

    if (!fm.fileExists(target)) return null

    const value = JSON.parse(fm.readString(target))

    return isRecord(value) ? value : null
  } catch (_) {
    return null
  }
}

function buildDiagnosticReport(diagnostic) {
  const counts = diagnosticCounts(diagnostic.checks)
  const lines = [
    "CTS DIAGNOSTIC",
    "==============",
    "",
    `Généré : ${diagnostic.generatedAt}`,
    `Dashboard : ${diagnostic.dashboardVersion}`,
    `Installer : ${diagnostic.installerVersion}`,
    `iOS : ${diagnostic.iosVersion}`,
    `Snapshot installé : ${diagnostic.installedSnapshot || "?"}`,
    `Snapshot GitHub : ${diagnostic.snapshot || "?"}`,
    "",
    "RÉSUMÉ",
    "------",
    `Validés : ${counts.success}`,
    `À contrôler : ${counts.warning}`,
    `Erreurs : ${counts.error}`,
    `Informations : ${counts.info}`,
    "",
    "CONTRÔLES",
    "---------"
  ]

  for (const check of diagnostic.checks) {
    lines.push(`[${diagnosticReportStatus(check.status)}] ${check.title} — ${check.detail}`)
  }

  if (diagnostic.lastFailure) {
    const failure = diagnostic.lastFailure

    lines.push(
      "",
      "DERNIÈRE ERREUR D’IMPORT",
      "------------------------",
      `Date : ${failure.timestamp || "?"}`,
      `Type : ${failure.type || "?"}`,
      `Code : ${failure.code || "?"}`,
      `Étape : ${failure.stage || "?"}`
    )

    if (failure.error) lines.push(`Erreur : ${failure.error}`)
    if (failure.name) lines.push(`Type JS : ${failure.name}`)

    lines.push(
      "",
      "TEMPS DES ÉTAPES",
      "----------------",
      `Inspection PDF : ${formatDiagnosticMs(failure.timings.sourceInspectionMs)}`,
      `Extraction PDF : ${formatDiagnosticMs(failure.timings.pdfExtractionMs)}`,
      `Base CTS : ${formatDiagnosticMs(failure.timings.databaseReloadMs)}`,
      `Parser : ${formatDiagnosticMs(failure.timings.parserMs)}`,
      `Enregistrement : ${formatDiagnosticMs(failure.timings.registrationMs)}`,
      `Total : ${formatDiagnosticMs(failure.timings.totalMs)}`
    )

    if (failure.stack) {
      lines.push("", "STACK JAVASCRIPT", "----------------", failure.stack)
    }
  }

  const run = readLastRunTrace()

  if (run) {
    lines.push(
      "",
      "DERNIÈRE EXÉCUTION DU DASHBOARD",
      "-------------------------------",
      `Date : ${run.at || "?"}`,
      `Version : ${run.version || "?"}`,
      `Lancé depuis : ${run.surface || "?"}`,
      `Format : ${run.family || "?"}`,
      `Durée : ${formatDiagnosticMs(run.elapsedMs)}`,
      `Affiché : ${run.displayed || "?"}`,
      `Source du service : ${run.source || "?"}`,
      `Analyse : ${run.scan || "?"}`,
      `Rendu validé : ${run.committed ? "oui" : "non"}`,
      `PDF détectés : ${Number.isFinite(Number(run.detected)) ? run.detected : "?"}`
    )

    if (run.committed && run.surface === "widget") {
      lines.push(
        "",
        "Affichage livré. Une tuile vide, blanche ou noire et sans texte,",
        "n’exécute pas CTS Dashboard : vérifier le champ Script du widget."
      )
    }
  }

  lines.push(
    "",
    credit(),
    "",
    "CONFIDENTIALITÉ",
    "---------------",
    "Aucun nom, matricule, horaire, contenu PDF ou numéro de service n’est inclus dans ce rapport."
  )

  return lines.join("\n")
}

function diagnosticReportStatus(status) {
  return {
    success: "OK",
    warning: "ATTENTION",
    error: "ERREUR",
    info: "INFO"
  }[diagnosticStatus(status)]
}

function formatDiagnosticMs(value) {
  const number = Number(value)

  return Number.isFinite(number) ? `${number} ms` : "non terminée"
}

function sanitizeDiagnosticText(value) {
  return String(value || "")
    .replace(/(?:\/private|\/var|\/mobile|\/Users)[^\n]*/gi, "[chemin local masqué]")
    .replace(/[^\s\/\\]+\.pdf\b/gi, "[PDF]")
    .replace(/Service_[^\s\/\\]+\.(?:json|txt)\b/gi, "[cache service]")
    .trim()
}

async function uninstall(manifest) {
  if (
    !(await confirm(
      "Désinstaller CTS Dashboard",
      [
        "Les scripts et données techniques du Dashboard seront supprimés.",
        "",
        "CTS Installer, le dossier Services, vos PDF et leurs archives seront conservés."
      ].join("\n"),
      "Continuer",
      true
    ))
  ) {
    return
  }

  if (
    !(await confirm(
      "Confirmation définitive",
      "Confirmez-vous la désinstallation de CTS Dashboard ?",
      "Désinstaller",
      true
    ))
  ) {
    return
  }

  await preserveInstaller()

  const scriptEntries = manifest.scripts
    .filter(
      name =>
        name !== INSTALLER_FILE &&
        join(docs, name) !== canonicalInstaller &&
        join(docs, name) !== currentInstaller
    )
    .map(name => ({
      name,
      type: "Script",
      destination: join(docs, name)
    }))

  const projectEntries = fm.fileExists(root)
    ? fm
        .listContents(root)
        .filter(name => name !== "Services")
        .map(name => ({
          name,
          type: "Dossier",
          destination: join(root, name)
        }))
    : []

  const entries = [...scriptEntries, ...projectEntries]

  const progress = progressTable({
    title: "Désinstaller CTS Dashboard",
    version: manifest.version,
    entries,
    operation: "uninstall"
  })

  progress.present()

  const summary = {
    installed: [],
    updated: [],
    repaired: [],
    unchanged: [],
    failed: []
  }

  const startedAt = Date.now()

  for (let index = 0; index < entries.length; index++) {
    const item = entries[index]

    await progress.entry(index, "running", `Suppression de ${item.name}`)

    try {
      if (fm.fileExists(item.destination)) {
        fm.remove(item.destination)
      }

      summary.unchanged.push(item.name)

      await progress.entry(index, "success", "Supprimé")
    } catch (error) {
      summary.failed.push(item.name)

      await progress.entry(index, "error", messageOf(error))
    }

    await progress.advance(index + 1, entries.length)
  }

  await preserveInstaller()

  await progress.finish({
    success: summary.failed.length === 0,
    title: summary.failed.length ? "Désinstallation partielle" : "Désinstallation terminée",
    message: summary.failed.length
      ? `${plural(summary.failed.length, "élément n’a pas pu être supprimé", "éléments n’ont pas pu être supprimés")}.`
      : "CTS Dashboard a été supprimé.",
    summary,
    duration: Date.now() - startedAt,
    valid: null,
    total: entries.length
  })
}

function progressTable({ title, version, entries, operation }) {
  const table = new UITable()
  table.showSeparators = true

  const uninstalling = operation === "uninstall"

  const state = {
    completed: 0,
    total: entries.length,
    current: "Initialisation…",
    title,
    version,
    operation,
    systems: {
      installer: {
        short: "Installer",
        status: uninstalling ? "hidden" : "pending",
        detail: "En attente"
      },
      github: {
        short: "GitHub",
        status: uninstalling ? "hidden" : "pending",
        detail: "En attente"
      },
      directories: {
        short: "Dossiers",
        status: uninstalling ? "hidden" : "pending",
        detail: "En attente"
      },
      retry: {
        short: "Reprises",
        status: uninstalling ? "hidden" : "pending",
        detail: "En attente"
      },
      verification: {
        short: "Final",
        status: uninstalling ? "hidden" : "pending",
        detail: "En attente"
      }
    },
    entries: entries.map(entry => ({
      ...entry,
      status: "pending",
      detail: `${entry.type} — En attente`
    })),
    result: null
  }

  let lastRenderAt = 0

  const render = async (immediate = false) => {
    const now = Date.now()

    if (!immediate && now - lastRenderAt < RENDER_INTERVAL) {
      return
    }

    lastRenderAt = now
    table.removeAllRows()

    if (state.result) {
      renderFinalPage(table, state, uninstalling)
    } else {
      renderProgressPage(table, state, uninstalling)
    }

    table.reload()
    await sleep(10)
  }

  return {
    present() {
      table.present(true)
    },

    async system(key, status, detail) {
      if (!state.systems[key]) {
        return
      }

      Object.assign(state.systems[key], { status, detail })

      state.current = detail
      await render(true)
    },

    async entry(index, status, detail) {
      if (!state.entries[index]) {
        return
      }

      Object.assign(state.entries[index], { status, detail })

      state.current = `${state.entries[index].name} · ${detail}`
      await render()
    },

    async advance(completed, total) {
      state.completed = completed
      state.total = total
      await render()
    },

    async finish(result) {
      state.result = result

      state.current = result.success ? "Opération terminée" : "Une erreur est survenue"

      if (result.success) {
        state.completed = state.total
      }

      await render(true)
    }
  }
}

function renderProgressPage(table, state, uninstalling) {
  addCompactHeader(table, state.title, state.version, state.operation)

  addCompactProgress(table, state)

  if (!uninstalling) {
    addSystemStrip(table, state.systems)
  }

  addProjectSummaryRow(table, state, uninstalling)

  addProtectionRow(table, uninstalling)

  addCreditRow(table)
}

function renderFinalPage(table, state, uninstalling) {
  const result = state.result

  addResultHero(table, result, state.version, state.operation)

  addResultMetrics(table, result, uninstalling)

  if (!uninstalling) {
    addFinalValidationRow(table, state, result)

    addVerificationDetailsRow(table, state.entries)
  }

  addChangesRow(table, result, uninstalling)

  addProtectionRow(table, uninstalling)

  addCreditRow(table)
}

function addCompactHeader(table, title, version, operation) {
  const row = new UITableRow()
  row.height = 76
  row.isHeader = true

  const symbol = SFSymbol.named(operationSymbol(operation))

  symbol.applyFont(Font.systemFont(24))

  const image = row.addImage(symbol.image)

  image.widthWeight = 14

  const text = row.addText(title, `Dashboard ${version}  ·  Installer ${INSTALLER_VERSION}`)

  text.widthWeight = 86
  text.titleFont = Font.boldSystemFont(19)
  text.subtitleFont = Font.systemFont(10)
  text.titleColor = operationColor(operation)
  text.subtitleColor = COLORS.secondary

  table.addRow(row)
}

function addCompactProgress(table, state) {
  const percentage = state.total ? Math.round((state.completed / state.total) * 100) : 100
  const row = new UITableRow()
  row.height = 68

  const progress = row.addText(
    `${progressBar(percentage)}  ${percentage} %`,
    `${state.completed}/${state.total} · ${compactCurrent(state.current)}`
  )

  progress.titleFont = Font.boldMonospacedSystemFont(14)

  progress.subtitleFont = Font.systemFont(10)

  progress.titleColor = percentage === 100 ? COLORS.green : COLORS.blue

  progress.subtitleColor = COLORS.secondary

  table.addRow(row)
}

function addSystemStrip(table, systems) {
  const visible = Object.values(systems).filter(item => item.status !== "hidden")

  if (!visible.length) {
    return
  }

  const strip = new UITableRow()
  strip.height = 42

  for (const item of visible) {
    const cell = strip.addText(miniStatusMarker(item.status), item.short.toUpperCase())

    cell.widthWeight = 100 / visible.length
    cell.titleFont = Font.boldSystemFont(15)
    cell.subtitleFont = Font.boldSystemFont(8)
    cell.titleColor = statusVisual(item.status).color
    cell.subtitleColor =
      item.status === "pending" ? COLORS.secondary : statusVisual(item.status).color
    cell.centerAligned()
  }

  table.addRow(strip)
}

function addProjectSummaryRow(table, state, uninstalling) {
  const counts = entryCounts(state.entries)
  const scripts = state.entries.filter(item => item.type === "Script").length
  const resources = state.entries.filter(item => item.type === "Ressource").length
  const row = new UITableRow()
  row.height = 62
  row.dismissOnSelect = false

  const symbol = SFSymbol.named(uninstalling ? "trash.fill" : "shippingbox.fill")

  symbol.applyFont(Font.systemFont(19))

  const image = row.addImage(symbol.image)

  image.widthWeight = 12

  const changed = counts.installed + counts.updated + counts.repaired
  const subtitle = uninstalling
    ? `${counts.success}/${state.total} supprimés · ${plural(counts.error, "erreur")}`
    : `${scripts} scripts · ${resources} ressources · ${counts.unchanged} à jour · ${plural(changed, "modifié", "modifiés")} · ${plural(counts.error, "erreur")}`

  const text = row.addText(uninstalling ? "Éléments du projet" : "Fichiers du projet", subtitle)

  text.widthWeight = 88
  text.titleFont = Font.semiboldSystemFont(13)
  text.subtitleFont = Font.systemFont(9)
  text.titleColor = counts.error ? COLORS.red : COLORS.primary
  text.subtitleColor = COLORS.secondary

  row.onSelect = async () => {
    await presentEntryDetails(state.entries, uninstalling)
  }

  table.addRow(row)
}

function addResultHero(table, result, version, operation) {
  const row = new UITableRow()
  row.height = 88
  row.isHeader = true

  const symbol = SFSymbol.named(
    result.success ? "checkmark.seal.fill" : "exclamationmark.triangle.fill"
  )

  symbol.applyFont(Font.systemFont(27))

  const image = row.addImage(symbol.image)

  image.widthWeight = 15

  const subtitle = result.success
    ? `CTS Dashboard ${version} est prêt · Installer ${INSTALLER_VERSION}`
    : firstMessageLine(result.message)

  const text = row.addText(result.title, subtitle)

  text.widthWeight = 85
  text.titleFont = Font.boldSystemFont(20)
  text.subtitleFont = Font.systemFont(11)
  text.titleColor = result.success ? COLORS.green : COLORS.red
  text.subtitleColor = COLORS.secondary

  table.addRow(row)
}

function addResultMetrics(table, result, uninstalling) {
  const summary = result.summary
  const elapsed = result.duration ? formatDuration(result.duration) : "—"
  const row = new UITableRow()
  row.height = 70

  const values = uninstalling
    ? [
        {
          title: summary.unchanged.length,
          subtitle: "SUPPRIMÉS",
          color: COLORS.green
        },
        {
          title: summary.failed.length,
          subtitle: "ERREURS",
          color: summary.failed.length ? COLORS.red : COLORS.green
        },
        {
          title: elapsed,
          subtitle: "DURÉE",
          color: COLORS.blue
        }
      ]
    : [
        {
          title: summary.installed.length + summary.updated.length + summary.repaired.length,
          subtitle: "MODIFIÉS",
          color: COLORS.orange
        },
        {
          title: summary.unchanged.length,
          subtitle: "À JOUR",
          color: COLORS.blue
        },
        {
          title: summary.failed.length,
          subtitle: "ERREURS",
          color: summary.failed.length ? COLORS.red : COLORS.green
        },
        {
          title: elapsed,
          subtitle: "DURÉE",
          color: COLORS.blue
        }
      ]

  for (const item of values) {
    const cell = row.addText(String(item.title), item.subtitle)

    cell.widthWeight = 100 / values.length
    cell.titleFont = Font.boldSystemFont(17)
    cell.subtitleFont = Font.boldSystemFont(8)
    cell.titleColor = item.color
    cell.subtitleColor = COLORS.secondary
  }

  table.addRow(row)
}

function addFinalValidationRow(table, state, result) {
  const row = new UITableRow()
  row.height = 58

  const symbol = SFSymbol.named(result.success ? "checkmark.shield.fill" : "xmark.shield.fill")

  symbol.applyFont(Font.systemFont(18))

  const image = row.addImage(symbol.image)

  image.widthWeight = 11

  const valid = Number.isFinite(result.valid) ? result.valid : state.completed
  const total = Number.isFinite(result.total) ? result.total : state.total

  const text = row.addText(
    result.success ? "Installation validée" : "Validation incomplète",
    `${valid}/${total} fichiers valides · Snapshot ${String(repositoryRevision).slice(0, 7)}`
  )

  text.widthWeight = 89
  text.titleFont = Font.semiboldSystemFont(13)
  text.subtitleFont = Font.systemFont(10)
  text.titleColor = result.success ? COLORS.green : COLORS.red
  text.subtitleColor = COLORS.secondary

  table.addRow(row)
}

function addVerificationDetailsRow(table, entries) {
  const row = new UITableRow()
  row.height = 55
  row.dismissOnSelect = false

  const symbol = SFSymbol.named("list.bullet.rectangle.fill")
  symbol.applyFont(Font.systemFont(17))

  const image = row.addImage(symbol.image)
  image.widthWeight = 10

  const text = row.addText(
    "Détails de la vérification",
    `${entries.length} fichiers contrôlés · toucher pour afficher`
  )

  text.widthWeight = 90
  text.titleFont = Font.semiboldSystemFont(12)
  text.subtitleFont = Font.systemFont(9)
  text.titleColor = COLORS.blue
  text.subtitleColor = COLORS.secondary

  row.onSelect = async () => {
    await presentEntryDetails(entries, false)
  }

  table.addRow(row)
}

function addChangesRow(table, result, uninstalling) {
  const summary = result.summary
  const changed = uninstalling
    ? summary.unchanged
    : [...summary.installed, ...summary.updated, ...summary.repaired]

  const failed = summary.failed
  const row = new UITableRow()
  row.height = 58
  row.dismissOnSelect = false

  const title = failed.length
    ? `${plural(failed.length, "erreur")}`
    : changed.length
      ? uninstalling
        ? `${plural(changed.length, "élément supprimé", "éléments supprimés")}`
        : `${plural(changed.length, "fichier modifié", "fichiers modifiés")}`
      : "Aucune modification nécessaire"

  const subtitle = failed.length
    ? compactNames(failed)
    : changed.length
      ? compactNames(changed)
      : "Tous les fichiers correspondaient déjà à la version GitHub."

  const text = row.addText(title, subtitle)

  text.widthWeight = 100
  text.titleFont = Font.semiboldSystemFont(13)
  text.subtitleFont = Font.systemFont(9)
  text.titleColor = failed.length ? COLORS.red : changed.length ? COLORS.orange : COLORS.green
  text.subtitleColor = COLORS.secondary

  if (failed.length || changed.length) {
    row.onSelect = async () => {
      await presentResultDetails(result, uninstalling)
    }
  }

  table.addRow(row)
}

function addCreditRow(table) {
  const row = new UITableRow()
  row.height = 38

  const text = row.addText(credit())
  text.titleFont = Font.systemFont(10)
  text.titleColor = COLORS.secondary
  text.centerAligned()

  table.addRow(row)
}

function addProtectionRow(table, uninstalling) {
  const row = new UITableRow()
  row.height = 50

  const symbol = SFSymbol.named("lock.shield.fill")

  symbol.applyFont(Font.systemFont(16))

  const image = row.addImage(symbol.image)

  image.widthWeight = 10

  const text = row.addText(
    "Données protégées",
    uninstalling
      ? "CTS Installer, Services, PDF et archives sont conservés."
      : "CTS Installer, services PDF et archives sont conservés."
  )

  text.widthWeight = 90
  text.titleFont = Font.semiboldSystemFont(12)
  text.subtitleFont = Font.systemFont(9)
  text.titleColor = COLORS.green
  text.subtitleColor = COLORS.secondary

  table.addRow(row)
}

async function presentEntryDetails(entries, uninstalling) {
  const table = new UITable()
  table.showSeparators = true

  const header = new UITableRow()
  header.height = 70
  header.isHeader = true

  const text = header.addText(
    uninstalling ? "Détail de la désinstallation" : "Détail des fichiers",
    `${plural(entries.length, "élément")}`
  )

  text.titleFont = Font.boldSystemFont(18)
  text.subtitleFont = Font.systemFont(10)
  text.titleColor = COLORS.blue
  text.subtitleColor = COLORS.secondary

  table.addRow(header)

  for (const entry of entries) {
    const visual = statusVisual(entry.status)
    const row = new UITableRow()
    row.height = 50

    const marker = row.addText(visual.marker)

    marker.widthWeight = 8
    marker.titleFont = Font.boldSystemFont(16)
    marker.titleColor = visual.color

    const content = row.addText(entry.name, entry.detail)

    content.widthWeight = 92
    content.titleFont = Font.semiboldSystemFont(12)
    content.subtitleFont = Font.systemFont(9)
    content.titleColor = COLORS.primary
    content.subtitleColor = visual.color

    table.addRow(row)
  }

  await table.present(true)
}

async function presentResultDetails(result, uninstalling) {
  const summary = result.summary
  const lines = []

  if (uninstalling) {
    if (summary.unchanged.length) {
      lines.push(`Supprimés (${summary.unchanged.length})`, ...summary.unchanged, "")
    }
  } else {
    if (summary.installed.length) {
      lines.push(`Installés (${summary.installed.length})`, ...summary.installed, "")
    }

    if (summary.updated.length) {
      lines.push(`Mis à jour (${summary.updated.length})`, ...summary.updated, "")
    }

    if (summary.repaired.length) {
      lines.push(`Réparés (${summary.repaired.length})`, ...summary.repaired, "")
    }
  }

  if (summary.failed.length) {
    lines.push(`Erreurs (${summary.failed.length})`, ...summary.failed)
  }

  const alert = new Alert()
  alert.title = result.title
  alert.message = [lines.join("\n").trim() || result.message, "", credit()].join("\n")
  alert.addAction("Fermer")
  await alert.present()
}

function entryCounts(entries) {
  const counts = {
    pending: 0,
    running: 0,
    installed: 0,
    updated: 0,
    repaired: 0,
    unchanged: 0,
    success: 0,
    retry: 0,
    error: 0
  }

  for (const entry of entries) {
    const key = Object.prototype.hasOwnProperty.call(counts, entry.status)
      ? entry.status
      : "pending"

    counts[key]++
  }

  return counts
}

function miniStatusMarker(status) {
  return (
    {
      pending: "○",
      running: "●",
      retry: "↻",
      success: "✓",
      error: "!"
    }[status] || "○"
  )
}

function compactCurrent(value) {
  const text = String(value || "")
    .replace(/^Contrôle de\s+/i, "")
    .replace(/^Nouvelle tentative\s*:\s*/i, "Nouvel essai · ")

  return text.length > 52 ? `${text.slice(0, 49)}…` : text
}

function compactNames(names) {
  const list = Array.isArray(names) ? names : []

  if (!list.length) {
    return ""
  }

  const visible = list.slice(0, 2)
  const remaining = list.length - visible.length

  return remaining > 0 ? `${visible.join(" · ")} · +${remaining}` : visible.join(" · ")
}

function firstMessageLine(message) {
  return (
    String(message || "Erreur inconnue.")
      .split("\n")
      .map(line => line.trim())
      .find(Boolean) || "Erreur inconnue."
  )
}

function progressBar(percentage) {
  const length = 12
  const filled = Math.max(0, Math.min(length * 2, Math.round((percentage / 100) * length * 2)))
  const full = Math.floor(filled / 2)
  const half = filled % 2

  return "█".repeat(full) + "▌".repeat(half) + "░".repeat(length - full - half)
}

function plural(count, singular, many = `${singular}s`) {
  return `${count} ${count > 1 ? many : singular}`
}

function statusVisual(status) {
  const values = {
    pending: {
      marker: "○",
      label: "ATTENTE",
      color: COLORS.gray
    },
    running: {
      marker: "◉",
      label: "EN COURS",
      color: COLORS.orange
    },
    installed: {
      marker: "✓",
      label: "INSTALLÉ",
      color: COLORS.green
    },
    updated: {
      marker: "↑",
      label: "MIS À JOUR",
      color: COLORS.orange
    },
    repaired: {
      marker: "✚",
      label: "RÉPARÉ",
      color: COLORS.green
    },
    unchanged: {
      marker: "✓",
      label: "À JOUR",
      color: COLORS.blue
    },
    success: {
      marker: "✓",
      label: "VALIDÉ",
      color: COLORS.green
    },
    retry: {
      marker: "↻",
      label: "NOUVEL ESSAI",
      color: COLORS.orange
    },
    error: {
      marker: "!",
      label: "ERREUR",
      color: COLORS.red
    }
  }

  return values[status] || values.pending
}

function operationTitle(operation) {
  return (
    {
      installation: "Installer CTS Dashboard",
      update: "Mettre à jour CTS Dashboard",
      verification: "Vérifier CTS Dashboard",
      repair: "Réparer CTS Dashboard",
      uninstall: "Désinstaller CTS Dashboard"
    }[operation] || "CTS Dashboard"
  )
}

function operationResultTitle(operation) {
  return (
    {
      installation: "Installation terminée",
      update: "Mise à jour terminée",
      verification: "Vérification terminée",
      repair: "Réparation terminée"
    }[operation] || "Opération terminée"
  )
}

function operationSymbol(operation) {
  return (
    {
      installation: "arrow.down.circle.fill",
      update: "arrow.triangle.2.circlepath.circle.fill",
      verification: "checkmark.shield.fill",
      repair: "wrench.and.screwdriver.fill",
      uninstall: "trash.circle.fill"
    }[operation] || "gearshape.fill"
  )
}

function operationColor(operation) {
  return (
    {
      installation: COLORS.green,
      update: COLORS.orange,
      verification: COLORS.blue,
      repair: COLORS.orange,
      uninstall: COLORS.red
    }[operation] || COLORS.blue
  )
}

function manifestEntries(manifest) {
  return [
    ...manifest.scripts
      .filter(name => name !== INSTALLER_FILE)
      .map(name => ({
        name,
        type: "Script",
        destination: join(docs, name)
      })),
    ...manifest.resources.map(resource => ({
      name: resource.name,
      type: "Ressource",
      destination: projectPath(resource.destination)
    }))
  ]
}

function validateManifest(manifest) {
  if (
    !isRecord(manifest) ||
    typeof manifest.version !== "string" ||
    !Array.isArray(manifest.scripts) ||
    !manifest.scripts.length ||
    !Array.isArray(manifest.resources)
  ) {
    throw new Error("Le manifeste GitHub de CTS Dashboard est invalide.")
  }

  const names = new Set()

  for (const name of manifest.scripts) {
    if (
      typeof name !== "string" ||
      !name.endsWith(".js") ||
      name === INSTALLER_FILE ||
      names.has(name)
    ) {
      throw new Error(`Script invalide dans version.json : ${name}`)
    }

    names.add(name)
  }

  for (const resource of manifest.resources) {
    if (
      !isRecord(resource) ||
      typeof resource.name !== "string" ||
      typeof resource.destination !== "string"
    ) {
      throw new Error("Une ressource de version.json est invalide.")
    }

    projectPath(resource.destination)
  }
}

async function handleInstallerUpdate(manifest) {
  const available = String(manifest.installerVersion || INSTALLER_VERSION)
  const minimum = String(manifest.minimumInstaller || "0.0.0")
  const update = compareVersions(available, INSTALLER_VERSION) > 0
  const required = compareVersions(minimum, INSTALLER_VERSION) > 0

  if (!update && !required) {
    return true
  }

  const table = screenTable()
  let choice = null

  addHeroRow(table, {
    symbol: required ? "exclamationmark.triangle.fill" : "arrow.down.circle.fill",
    title: required ? "Mise à jour requise" : "Nouvel installateur",
    subtitle: "CTS Installer",
    tone: required ? COLORS.orange : COLORS.blue
  })

  addVersionBand(table, [
    { value: INSTALLER_VERSION, label: "Installée" },
    { arrow: true },
    {
      value: available,
      label: "Disponible",
      strong: true,
      tone: required ? COLORS.orange : COLORS.blue
    }
  ])

  addStatusRow(table, {
    symbol: "arrow.clockwise",
    title: "Relance nécessaire",
    detail: "Après l’installation, relancez CTS Installer.",
    tone: COLORS.primary
  })

  if (required) {
    addStatusRow(table, {
      symbol: "exclamationmark.circle.fill",
      title: "Version trop ancienne",
      detail: "Cette mise à jour est nécessaire pour continuer.",
      tone: COLORS.orange
    })
  }

  addSectionRow(table, required ? "Action" : "Actions")

  addActionRow(table, {
    symbol: "arrow.down.circle.fill",
    label: `Installer ${available}`,
    detail: "Remplace CTS Installer sur cet iPhone",
    tone: required ? COLORS.orange : COLORS.blue,
    primary: true,
    onSelect: () => {
      choice = "install"
    }
  })

  if (!required) {
    addActionRow(table, {
      symbol: "arrow.right.circle",
      label: `Continuer avec ${INSTALLER_VERSION}`,
      detail: "La mise à jour restera proposée",
      onSelect: () => {
        choice = "continue"
      }
    })
  }

  addCreditRow(table)

  await table.present(true)

  if (choice === "install") {
    await updateInstaller(available)
    return false
  }

  return !required && choice === "continue"
}

async function updateInstaller(version) {
  const content = await downloadText(
    `${rawUrl(INSTALLER_FILE)}?t=${Date.now()}`,
    INSTALLER_FILE
  )

  if (!content.includes(`INSTALLER_VERSION = "${version}"`)) {
    throw new Error(
      "La version publiée de CTS Installer ne correspond pas au manifeste GitHub."
    )
  }

  await writeText(canonicalInstaller, content)

  if (currentInstaller !== canonicalInstaller) {
    await writeText(currentInstaller, content)
  }
}

async function withThrottleRetry(operation) {
  let lastError

  for (let attempt = 0; attempt <= THROTTLE_RETRY_DELAYS.length; attempt++) {
    try {
      return await operation(attempt)
    } catch (error) {
      lastError = error

      if (!isThrottled(error) || attempt === THROTTLE_RETRY_DELAYS.length) {
        break
      }

      await sleep(THROTTLE_RETRY_DELAYS[attempt])
    }
  }

  throw isThrottled(lastError)
    ? new Error(
        [
          "GitHub a temporairement mis votre connexion de côté.",
          "",
          "Votre installation n’est pas en cause et rien n’est perdu.",
          "Patientez quelques minutes, ou passez du Wi-Fi aux données",
          "mobiles, puis relancez CTS Installer."
        ].join("\n")
      )
    : lastError
}

function isThrottled(error) {
  return /HTTP (429|503)/i.test(messageOf(error))
}

function loadManifest() {
  return withThrottleRetry(async attempt => {
    const content = await downloadText(
      `${rawUrl("version.json")}?t=${Date.now()}-${attempt}`,
      "version.json"
    )

    try {
      return JSON.parse(content)
    } catch (error) {
      throw new Error(`version.json invalide : ${messageOf(error)}`)
    }
  })
}

function verifyRepository(manifest) {
  if (!isRecord(manifest) || !manifest.version) {
    throw new Error("Connexion GitHub invalide : manifeste illisible")
  }

  if (!/^[0-9a-f]{40}$/.test(String(repositoryRevision))) {
    throw new Error("Connexion GitHub invalide : snapshot non résolu")
  }
}

function validateText(content, name) {
  if (typeof content !== "string" || !content.trim()) {
    return {
      valid: false,
      reason: "contenu vide"
    }
  }

  const trimmed = content.trim()
  const start = trimmed.slice(0, 160).toLowerCase()

  if (
    trimmed === "404: Not Found" ||
    start.startsWith("<!doctype html") ||
    start.startsWith("<html")
  ) {
    return {
      valid: false,
      reason: "GitHub a renvoyé une page d’erreur"
    }
  }

  if (name.endsWith(".json")) {
    try {
      const value = JSON.parse(content)

      if (value === null || typeof value !== "object") {
        return {
          valid: false,
          reason: "racine JSON invalide"
        }
      }
    } catch (error) {
      return {
        valid: false,
        reason: `JSON invalide : ${messageOf(error)}`
      }
    }
  }

  if ((name.endsWith(".js") || name.endsWith(".mjs")) && trimmed.length < 80) {
    return {
      valid: false,
      reason: "fichier anormalement court"
    }
  }

  return {
    valid: true,
    reason: ""
  }
}

async function inspectLocal(path, name) {
  if (!fm.fileExists(path)) {
    return {
      valid: false,
      reason: "fichier absent",
      content: ""
    }
  }

  try {
    const content = await readText(path)
    return {
      ...validateText(content, name),
      content
    }
  } catch (error) {
    return {
      valid: false,
      reason: messageOf(error),
      content: ""
    }
  }
}

async function validateLocal(path, name) {
  const { valid, reason } = await inspectLocal(path, name)
  return { valid, reason }
}

async function readText(path) {
  await ensureDownloaded(path)
  return fm.readString(path)
}

async function waitForFile(path) {
  const deadline = Date.now() + FILE_WAIT_TIMEOUT

  while (true) {
    if (fm.fileExists(path)) {
      return true
    }

    if (Date.now() >= deadline) {
      return false
    }

    await sleep(FILE_WAIT_STEP)
  }
}

async function writeText(destination, content) {
  ensureParent(destination)

  const temporary = `${destination}.download`
  const rollback = `${destination}.rollback`

  removeQuietly(temporary)
  removeQuietly(rollback)

  let movedAside = false

  try {
    fm.writeString(temporary, content)

    if (!(await waitForFile(temporary))) {
      throw new Error("Le fichier temporaire n’a pas été créé.")
    }

    if (fm.fileExists(destination)) {
      fm.move(destination, rollback)

      movedAside = true
    }

    fm.move(temporary, destination)

    if (!(await waitForFile(destination))) {
      throw new Error("Le fichier final n’a pas été créé.")
    }

    await ensureDownloaded(destination)
    removeQuietly(rollback)
  } catch (error) {
    removeQuietly(temporary)

    if (movedAside && fm.fileExists(rollback) && !fm.fileExists(destination)) {
      try {
        fm.move(rollback, destination)
      } catch (_) {}
    }

    if (fm.fileExists(destination)) {
      removeQuietly(rollback)
    }

    throw error
  }
}

async function readMetadata() {
  if (!fm.fileExists(paths.metadata)) {
    return null
  }

  try {
    const value = JSON.parse(await readText(paths.metadata))

    return isRecord(value) ? value : null
  } catch (_) {
    return null
  }
}

async function writeMetadata(manifest, summary) {
  ensureDirectories()

  const previous = await readMetadata()
  const now = new Date().toISOString()

  await writeText(
    paths.metadata,
    JSON.stringify(
      {
        dashboardVersion: manifest.version,
        installerVersion: INSTALLER_VERSION,
        installedAt: previous?.installedAt || now,
        updatedAt: now,
        repository: REPO,
        repositoryRevision,
        files: summary
      },
      null,
      2
    )
  )
}

function ensureDirectories() {
  for (const path of Object.values(paths)) {
    if (path === paths.metadata) {
      continue
    }

    if (!fm.fileExists(path)) {
      fm.createDirectory(path, true)
    }
  }
}

function projectPath(relative) {
  const parts = String(relative || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)

  if (!parts.length || parts.includes("..") || parts.includes(".")) {
    throw new Error("Un chemin déclaré dans version.json est invalide.")
  }

  return parts.reduce((path, part) => join(path, part), root)
}

function ensureParent(path) {
  const index = path.lastIndexOf("/")

  if (index <= 0) {
    return
  }

  const parent = path.slice(0, index)

  if (!fm.fileExists(parent)) {
    fm.createDirectory(parent, true)
  }
}

function resolveRepositoryRevision() {
  return withThrottleRetry(fetchRepositoryRevision)
}

async function fetchRepositoryRevision() {
  const url =
    [
      "https://api.github.com/repos",
      encodeURIComponent(REPO.owner),
      encodeURIComponent(REPO.name),
      "commits",
      encodeURIComponent(REPO.branch)
    ].join("/") + `?t=${Date.now()}`

  const request = new Request(url)
  request.timeoutInterval = TIMEOUT
  request.headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "CTS-Dashboard-Installer",
    "Cache-Control": "no-cache",
    Pragma: "no-cache"
  }

  let content

  try {
    content = await request.loadString()
  } catch (error) {
    throw new Error(`Impossible de déterminer la version GitHub actuelle : ${messageOf(error)}`)
  }

  const status = Number(request.response?.statusCode)

  if (Number.isFinite(status) && (status < 200 || status >= 300)) {
    throw new Error(
      `Impossible de déterminer la version GitHub actuelle : réponse HTTP ${status}`
    )
  }

  let payload

  try {
    payload = JSON.parse(content)
  } catch (error) {
    throw new Error(`Réponse GitHub invalide : ${messageOf(error)}`)
  }

  const sha = String(payload?.sha || "")
    .trim()
    .toLowerCase()

  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error("GitHub n’a pas renvoyé un identifiant de commit valide.")
  }

  return sha
}

async function downloadText(url, label) {
  const request = new Request(url)
  request.timeoutInterval = TIMEOUT
  request.headers = {
    "Cache-Control": "no-cache",
    Pragma: "no-cache"
  }

  try {
    const content = await request.loadString()
    const status = Number(request.response?.statusCode)

    if (Number.isFinite(status) && (status < 200 || status >= 300)) {
      throw new Error(`Réponse HTTP ${status}`)
    }

    if (typeof content !== "string" || !content.trim()) {
      throw new Error("Réponse vide")
    }

    return content
  } catch (error) {
    throw new Error(`${label} impossible à télécharger : ${messageOf(error)}`)
  }
}

function rawUrl(name, reference = repositoryRevision || REPO.branch) {
  return [
    "https://raw.githubusercontent.com",
    encodeURIComponent(REPO.owner),
    encodeURIComponent(REPO.name),
    encodeURIComponent(reference),
    String(name).split("/").map(encodeURIComponent).join("/")
  ].join("/")
}

async function confirm(title, message, action, destructive = false) {
  const alert = new Alert()
  alert.title = title
  alert.message = message

  destructive ? alert.addDestructiveAction(action) : alert.addAction(action)

  alert.addCancelAction("Annuler")

  return (await alert.present()) === 0
}

async function errorAlert(error) {
  const alert = new Alert()
  alert.title = "Opération impossible"
  alert.message = [
    messageOf(error),
    "",
    "Vérifiez votre connexion Internet puis relancez CTS Installer."
  ].join("\n")
  alert.addAction("OK")
  await alert.present()
}

async function ensureDownloaded(path) {
  if (fm.fileExists(path) && !fm.isFileDownloaded(path)) {
    await Promise.race([fm.downloadFileFromiCloud(path), sleep(ICLOUD_DOWNLOAD_TIMEOUT)])
  }
}

function removeQuietly(path) {
  try {
    if (fm.fileExists(path)) {
      fm.remove(path)
    }
  } catch (_) {}
}

function statusLabel(status) {
  return (
    {
      installed: "Installé",
      updated: "Mis à jour",
      repaired: "Réparé",
      unchanged: "Déjà à jour",
      success: "Validé"
    }[status] || status
  )
}

function normalize(value, name = "") {
  let text = String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")

  if (/\.js$/i.test(String(name || ""))) {
    text = stripScriptableMetadata(text)
  }

  return text
    .split("\n")
    .map(line => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n+$/g, "")
}

function stripScriptableMetadata(value) {
  const lines = String(value ?? "").split("\n")
  let index = 0

  while (index < lines.length) {
    while (index < lines.length && !lines[index].trim()) {
      index++
    }

    const first = lines[index]?.trim?.() || ""
    const second = lines[index + 1]?.trim?.() || ""
    const third = lines[index + 2]?.trim?.() || ""

    const metadataBlock =
      first === "// Variables used by Scriptable." &&
      second === "// These must be at the very top of the file. Do not edit." &&
      /^\/\/ icon-color:\s*[^;]+;\s*icon-glyph:\s*[^;]+;\s*$/.test(third)

    if (!metadataBlock) {
      break
    }

    index += 3
  }

  while (index < lines.length && !lines[index].trim()) {
    index++
  }

  return lines.slice(index).join("\n")
}

function compareVersions(first, second) {
  const a = versionParts(first)
  const b = versionParts(second)
  const length = Math.max(a.length, b.length)

  for (let index = 0; index < length; index++) {
    const difference = (a[index] || 0) - (b[index] || 0)

    if (difference) {
      return difference > 0 ? 1 : -1
    }
  }

  return 0
}

function versionParts(value) {
  return String(value || "")
    .split(".")
    .map(part => Number.parseInt(part, 10) || 0)
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000))

  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`
}

function messageOf(error) {
  return error?.message?.trim?.() || String(error || "Erreur inconnue.")
}

async function registerAnalyticsInstallation(dashboardVersion) {
  let analytics

  try {
    analytics = importModule(ANALYTICS_MODULE)
  } catch (_) {
    return
  }

  try {
    if (analytics.hasClientToken?.()) {
      return
    }

    const result = await analytics.registerInstallation({
      dashboardVersion: String(dashboardVersion || "").trim()
    })

    if (!result?.ok) {
      console.warn("[Analytics]", result?.error || "Installation non enregistrée.")
    }
  } catch (error) {
    console.warn("[Analytics]", messageOf(error))
  }
}

function sleep(milliseconds) {
  return new Promise(resolve => {
    Timer.schedule(Math.max(0, Number(milliseconds) || 0), false, resolve)
  })
}
