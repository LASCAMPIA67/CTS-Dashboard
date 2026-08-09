// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: arrow.down.circle.fill;

const INSTALLER_VERSION = "1.0.3"

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
const ANALYTICS_MODULE = "CTS Analytics Client"

const COLORS = {
  blue: new Color("#0A84FF"),
  green: new Color("#30D158"),
  orange: new Color("#FF9F0A"),
  red: new Color("#FF453A"),
  gray: new Color("#8E8E93"),
  secondary: Color.dynamic(
    new Color("#6D6D72"),
    new Color("#98989D")
  ),
  primary: Color.dynamic(
    new Color("#111111"),
    new Color("#F5F5F7")
  )
}

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

    repositoryRevision =
      await resolveRepositoryRevision()

    const manifest = await loadManifest()
    validateManifest(manifest)

    if (!await handleInstallerUpdate(manifest)) {
      return
    }

    const state = await inspect(manifest)
    const action = await menu(manifest, state)

    if (action === "install") {
      await installOrUpdate(manifest, state)
    } else if (action === "uninstall") {
      await uninstall(manifest)
    }
  } catch (error) {
    await errorAlert(error)
  }
}

async function menu(manifest, state) {
  const alert = new Alert()
  alert.title = "CTS Dashboard"

  if (!state.present) {
    alert.message = [
      `Version disponible : ${manifest.version}`,
      `CTS Installer : ${INSTALLER_VERSION}`,
      "",
      "Installation automatique des scripts, ressources et dossiers nécessaires.",
      "",
      "Vos services PDF resteront protégés."
    ].join("\n")

    alert.addAction(`Installer la version ${manifest.version}`)
    alert.addCancelAction("Fermer")

    return await alert.presentSheet() === 0
      ? "install"
      : null
  }

  const installedVersion =
    state.installedVersion || "Non identifiée"

  const updateAvailable =
    Boolean(state.installedVersion) &&
    compareVersions(
      manifest.version,
      state.installedVersion
    ) > 0

  const issues = [
    ...state.missing,
    ...state.invalid
  ]

  const stateLabel = state.complete
    ? `${state.valid}/${state.total} fichiers locaux valides`
    : `${state.valid}/${state.total} fichiers valides — réparation nécessaire`

  alert.message = [
    updateAvailable
      ? `Mise à jour : ${installedVersion} → ${manifest.version}`
      : `Dashboard ${installedVersion} · Installer ${INSTALLER_VERSION}`,
    "",
    stateLabel,
    issues.length
      ? `Fichiers concernés : ${issues.join(", ")}`
      : "",
    "",
    updateAvailable
      ? "La nouvelle version est prête à être installée."
      : state.complete
        ? "L’installation locale est valide. Lancez une vérification pour la comparer au snapshot GitHub actuel."
        : "Les fichiers absents ou invalides seront réparés.",
    "",
    "CTS Installer, vos PDF et leurs archives seront conservés."
  ].filter(Boolean).join("\n")

  alert.addAction(
    updateAvailable
      ? `Mettre à jour vers ${manifest.version}`
      : state.complete
        ? "Vérifier les fichiers"
        : "Réparer l’installation"
  )

  alert.addDestructiveAction("Désinstaller")
  alert.addCancelAction("Fermer")

  const choice = await alert.presentSheet()

  return choice === 0
    ? "install"
    : choice === 1
      ? "uninstall"
      : null
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

    const result = await validateLocal(
      entry.destination,
      entry.name
    )

    if (result.valid) {
      valid++
    } else {
      invalid.push(entry.name)
      reasons[entry.name] = result.reason
    }
  }

  const total = entries.length

  const present = Boolean(
    metadata ||
    existing ||
    fm.fileExists(root)
  )

  const complete =
    present &&
    valid === total

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
    compareVersions(
      manifest.version,
      previous.installedVersion
    ) > 0

  const operation = fresh
    ? "installation"
    : versionUpdate
      ? "update"
      : previous.complete
        ? "verification"
        : "repair"

  const title = operationTitle(operation)

  const message = fresh
    ? [
        `CTS Dashboard ${manifest.version} va être installé.`,
        "",
        "Tous les éléments nécessaires seront créés automatiquement.",
        "",
        "Une connexion Internet est nécessaire."
      ].join("\n")
    : [
        `CTS Dashboard ${manifest.version} va être contrôlé.`,
        "",
        "Chaque fichier sera comparé au snapshot GitHub actuel. Les fichiers différents, absents ou invalides seront remplacés.",
        "",
        "CTS Installer, vos PDF et leurs archives seront conservés."
      ].join("\n")

  if (!await confirm(title, message, "Continuer")) {
    return
  }

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

  try {
    await progress.system(
      "installer",
      "running",
      "Protection de CTS Installer…"
    )

    await preserveInstaller()

    await progress.system(
      "installer",
      "success",
      "Installateur protégé"
    )

    await progress.system(
      "github",
      "running",
      "Validation du snapshot GitHub…"
    )

    await verifyRepository()

    await progress.system(
      "github",
      "success",
      `Snapshot ${repositoryRevision.slice(0, 7)} validé`
    )

    await progress.system(
      "directories",
      "running",
      "Préparation de l’arborescence…"
    )

    ensureDirectories()

    await progress.system(
      "directories",
      "success",
      "Arborescence prête"
    )

    for (
      let index = 0;
      index < entries.length;
      index++
    ) {
      const entry = entries[index]

      await progress.entry(
        index,
        "running",
        `Contrôle de ${entry.name}`
      )

      try {
        const status = await syncFile(entry)
        summary[status].push(entry.name)

        await progress.entry(
          index,
          status,
          statusLabel(status)
        )
      } catch (error) {
        failures.push({
          index,
          entry,
          reason: messageOf(error)
        })

        await progress.entry(
          index,
          "retry",
          "Nouvelle tentative programmée"
        )
      }

      await progress.advance(
        index + 1,
        entries.length
      )
    }

    if (failures.length) {
      await progress.system(
        "retry",
        "running",
        `${failures.length} nouvelle(s) tentative(s)…`
      )

      for (const failure of failures) {
        await progress.entry(
          failure.index,
          "running",
          `Nouvelle tentative : ${failure.entry.name}`
        )

        try {
          const status = await syncFile(
            failure.entry,
            true
          )

          summary[status].push(
            failure.entry.name
          )

          failure.resolved = true

          await progress.entry(
            failure.index,
            status,
            statusLabel(status)
          )
        } catch (error) {
          failure.reason = messageOf(error)
          summary.failed.push(
            failure.entry.name
          )

          await progress.entry(
            failure.index,
            "error",
            failure.reason
          )
        }
      }

      const unresolved = failures.filter(
        item => !item.resolved
      )

      await progress.system(
        "retry",
        unresolved.length
          ? "error"
          : "success",
        unresolved.length
          ? `${unresolved.length} fichier(s) encore en erreur`
          : "Toutes les nouvelles tentatives ont réussi"
      )
    } else {
      await progress.system(
        "retry",
        "success",
        "Aucune nouvelle tentative nécessaire"
      )
    }

    await progress.system(
      "verification",
      "running",
      "Validation finale…"
    )

    const verification = await inspect(manifest)

    if (!verification.complete) {
      const issues = [
        ...verification.missing.map(
          name => `${name} — absent`
        ),
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
          issues.length
            ? issues.join("\n")
            : "Une erreur inconnue empêche la validation."
        ].join("\n"),
        summary,
        duration: Date.now() - startedAt,
        valid: verification.valid,
        total: verification.total
      })

      return
    }

    await writeMetadata(
      manifest,
      summary
    )

    await preserveInstaller()

    await registerAnalyticsInstallation(
      manifest.version
    )

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
    await progress.system(
      "verification",
      "error",
      "Opération interrompue"
    )

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

async function syncFile(entry, force = false) {
  let remote
  let lastError

  for (
    let attempt = 1;
    attempt <= RETRIES;
    attempt++
  ) {
    try {
      remote = await downloadText(
        `${rawUrl(entry.name)}?t=${Date.now()}-${attempt}`,
        entry.name
      )

      const validation = validateText(
        remote,
        entry.name
      )

      if (!validation.valid) {
        throw new Error(
          `Version GitHub invalide : ${validation.reason}`
        )
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
    throw lastError ||
      new Error(
        `${entry.name} impossible à télécharger.`
      )
  }

  const existed = fm.fileExists(
    entry.destination
  )

  let localValid = false

  if (existed) {
    const check = await validateLocal(
      entry.destination,
      entry.name
    )

    localValid = check.valid

    if (
      !force &&
      localValid &&
      await textMatches(
        entry.destination,
        remote
      )
    ) {
      return "unchanged"
    }
  }

  await writeText(
    entry.destination,
    remote
  )

  const result = await validateLocal(
    entry.destination,
    entry.name
  )

  if (!result.valid) {
    throw new Error(
      `${entry.name} invalide après écriture : ${result.reason}`
    )
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
  const canonical =
    await readInstallerCandidate(
      canonicalInstaller
    )

  const current =
    currentInstaller === canonicalInstaller
      ? canonical
      : await readInstallerCandidate(
          currentInstaller
        )

  let selected = selectInstallerCandidate(
    canonical,
    current
  )

  if (!selected) {
    const content = await downloadText(
      `${rawUrl(INSTALLER_FILE)}?self=${Date.now()}`,
      INSTALLER_FILE
    )

    selected = createInstallerCandidate(
      content
    )
  }

  if (!selected) {
    throw new Error(
      "La copie de CTS Installer est invalide."
    )
  }

  if (
    !canonical ||
    normalize(canonical.content) !==
      normalize(selected.content)
  ) {
    await writeText(
      canonicalInstaller,
      selected.content
    )
  }

  if (
    !await readInstallerCandidate(
      canonicalInstaller
    )
  ) {
    throw new Error(
      "CTS Installer.js n’a pas pu être conservé."
    )
  }
}

async function readInstallerCandidate(path) {
  if (!path || !fm.fileExists(path)) {
    return null
  }

  try {
    return createInstallerCandidate(
      await readText(path)
    )
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

function selectInstallerCandidate(
  canonical,
  current
) {
  if (!canonical) {
    return current
  }

  if (!current) {
    return canonical
  }

  return compareVersions(
    current.version,
    canonical.version
  ) >= 0
    ? current
    : canonical
}

function installerVersion(content) {
  const match = String(content || "")
    .match(
      /const\s+INSTALLER_VERSION\s*=\s*"([^"]+)"/
    )

  return match?.[1]?.trim?.() || ""
}

function isInstallerSource(content) {
  return Boolean(
    installerVersion(content) &&
    content.includes(
      `const INSTALLER_FILE = "${INSTALLER_FILE}"`
    ) &&
    content.includes(
      "async function main()"
    )
  )
}

async function uninstall(manifest) {
  if (!await confirm(
    "Désinstaller CTS Dashboard",
    [
      "Les scripts et données techniques du Dashboard seront supprimés.",
      "",
      "CTS Installer, le dossier Services, vos PDF et leurs archives seront conservés."
    ].join("\n"),
    "Continuer",
    true
  )) {
    return
  }

  if (!await confirm(
    "Confirmation définitive",
    "Confirmez-vous la désinstallation de CTS Dashboard ?",
    "Désinstaller",
    true
  )) {
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
    ? fm.listContents(root)
        .filter(name => name !== "Services")
        .map(name => ({
          name,
          type: "Dossier",
          destination: join(root, name)
        }))
    : []

  const entries = [
    ...scriptEntries,
    ...projectEntries
  ]

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

  for (
    let index = 0;
    index < entries.length;
    index++
  ) {
    const item = entries[index]

    await progress.entry(
      index,
      "running",
      `Suppression de ${item.name}`
    )

    try {
      if (fm.fileExists(item.destination)) {
        fm.remove(item.destination)
      }

      summary.unchanged.push(item.name)

      await progress.entry(
        index,
        "success",
        "Supprimé"
      )
    } catch (error) {
      summary.failed.push(item.name)

      await progress.entry(
        index,
        "error",
        messageOf(error)
      )
    }

    await progress.advance(
      index + 1,
      entries.length
    )
  }

  await preserveInstaller()

  await progress.finish({
    success: summary.failed.length === 0,
    title: summary.failed.length
      ? "Désinstallation partielle"
      : "Désinstallation terminée",
    message: summary.failed.length
      ? `${summary.failed.length} élément(s) n’ont pas pu être supprimés.`
      : "CTS Dashboard a été supprimé.",
    summary,
    duration: Date.now() - startedAt,
    valid: null,
    total: entries.length
  })
}

// =====================================================
// INTERFACE PREMIUM COMPACTE
// =====================================================

function progressTable({
  title,
  version,
  entries,
  operation
}) {
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
        short: "Erreurs",
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

  const render = async () => {
    table.removeAllRows()

    if (state.result) {
      renderFinalPage(
        table,
        state,
        uninstalling
      )
    } else {
      renderProgressPage(
        table,
        state,
        uninstalling
      )
    }

    table.reload()
    await sleep(25)
  }

  return {
    present() {
      table.present(true)
    },

    async system(key, status, detail) {
      if (!state.systems[key]) {
        return
      }

      Object.assign(
        state.systems[key],
        { status, detail }
      )

      state.current = detail
      await render()
    },

    async entry(index, status, detail) {
      if (!state.entries[index]) {
        return
      }

      Object.assign(
        state.entries[index],
        { status, detail }
      )

      state.current = detail
      await render()
    },

    async advance(completed, total) {
      state.completed = completed
      state.total = total
      await render()
    },

    async finish(result) {
      state.result = result

      state.current = result.success
        ? "Opération terminée"
        : "Une erreur est survenue"

      if (result.success) {
        state.completed = state.total
      }

      await render()
    }
  }
}

function renderProgressPage(
  table,
  state,
  uninstalling
) {
  addCompactHeader(
    table,
    state.title,
    state.version,
    state.operation
  )

  addCompactProgress(
    table,
    state
  )

  if (!uninstalling) {
    addSystemStrip(
      table,
      state.systems
    )
  }

  addProjectSummaryRow(
    table,
    state,
    uninstalling
  )

  addProtectionRow(
    table,
    uninstalling
  )
}

function renderFinalPage(
  table,
  state,
  uninstalling
) {
  const result = state.result

  addResultHero(
    table,
    result,
    state.version,
    state.operation
  )

  addResultMetrics(
    table,
    result,
    uninstalling
  )

  if (!uninstalling) {
    addFinalValidationRow(
      table,
      state,
      result
    )
  }

  addChangesRow(
    table,
    result,
    uninstalling
  )

  addProtectionRow(
    table,
    uninstalling
  )
}

function addCompactHeader(
  table,
  title,
  version,
  operation
) {
  const row = new UITableRow()
  row.height = 76
  row.isHeader = true

  const symbol = SFSymbol.named(
    operationSymbol(operation)
  )

  symbol.applyFont(
    Font.systemFont(24)
  )

  const image = row.addImage(
    symbol.image
  )

  image.widthWeight = 14

  const text = row.addText(
    title,
    `Dashboard ${version}  ·  Installer ${INSTALLER_VERSION}`
  )

  text.widthWeight = 86
  text.titleFont = Font.boldSystemFont(19)
  text.subtitleFont = Font.systemFont(10)
  text.titleColor = operationColor(operation)
  text.subtitleColor = COLORS.secondary

  table.addRow(row)
}

function addCompactProgress(table, state) {
  const percentage = state.total
    ? Math.round(
        state.completed /
        state.total *
        100
      )
    : 100

  const row = new UITableRow()
  row.height = 68

  const progress = row.addText(
    `${progressBar(percentage)}  ${percentage} %`,
    `${state.completed}/${state.total} · ${compactCurrent(state.current)}`
  )

  progress.titleFont =
    Font.boldMonospacedSystemFont(14)

  progress.subtitleFont =
    Font.systemFont(10)

  progress.titleColor =
    percentage === 100
      ? COLORS.green
      : COLORS.blue

  progress.subtitleColor = COLORS.secondary

  table.addRow(row)
}

function addSystemStrip(table, systems) {
  const visible = Object.values(systems)
    .filter(item => item.status !== "hidden")

  if (!visible.length) {
    return
  }

  const row = new UITableRow()
  row.height = 60

  const overall = visible.some(
    item => item.status === "error"
  )
    ? COLORS.red
    : visible.some(
        item => item.status === "running" ||
          item.status === "retry"
      )
      ? COLORS.orange
      : visible.every(
          item => item.status === "success"
        )
        ? COLORS.green
        : COLORS.blue

  const line = visible
    .map(item =>
      `${miniStatusMarker(item.status)} ${item.short}`
    )
    .join("   ")

  const active = visible.find(
    item =>
      item.status === "running" ||
      item.status === "retry" ||
      item.status === "error"
  )

  const text = row.addText(
    "Système",
    active?.detail || line
  )

  text.widthWeight = 100
  text.titleFont = Font.semiboldSystemFont(13)
  text.subtitleFont = Font.systemFont(10)
  text.titleColor = overall
  text.subtitleColor = active
    ? overall
    : COLORS.secondary

  table.addRow(row)

  const strip = new UITableRow()
  strip.height = 34

  for (const item of visible) {
    const cell = strip.addText(
      miniStatusMarker(item.status),
      item.short.toUpperCase()
    )

    cell.widthWeight = 100 / visible.length
    cell.titleFont = Font.boldSystemFont(13)
    cell.subtitleFont = Font.boldSystemFont(7)
    cell.titleColor = statusVisual(item.status).color
    cell.subtitleColor = COLORS.secondary
  }

  table.addRow(strip)
}

function addProjectSummaryRow(
  table,
  state,
  uninstalling
) {
  const counts = entryCounts(
    state.entries
  )

  const scripts = state.entries.filter(
    item => item.type === "Script"
  ).length

  const resources = state.entries.filter(
    item => item.type === "Ressource"
  ).length

  const row = new UITableRow()
  row.height = 62
  row.dismissOnSelect = false

  const symbol = SFSymbol.named(
    uninstalling
      ? "trash.fill"
      : "shippingbox.fill"
  )

  symbol.applyFont(
    Font.systemFont(19)
  )

  const image = row.addImage(
    symbol.image
  )

  image.widthWeight = 12

  const changed =
    counts.installed +
    counts.updated +
    counts.repaired

  const subtitle = uninstalling
    ? `${counts.success}/${state.total} supprimés · ${counts.error} erreur(s)`
    : `${scripts} scripts · ${resources} ressources · ${counts.unchanged} à jour · ${changed} modifié(s) · ${counts.error} erreur(s)`

  const text = row.addText(
    uninstalling
      ? "Éléments du projet"
      : "Fichiers du projet",
    subtitle
  )

  text.widthWeight = 88
  text.titleFont = Font.semiboldSystemFont(13)
  text.subtitleFont = Font.systemFont(9)
  text.titleColor = counts.error
    ? COLORS.red
    : COLORS.primary
  text.subtitleColor = COLORS.secondary

  row.onSelect = async () => {
    await presentEntryDetails(
      state.entries,
      uninstalling
    )
  }

  table.addRow(row)
}

function addResultHero(
  table,
  result,
  version,
  operation
) {
  const row = new UITableRow()
  row.height = 88
  row.isHeader = true

  const symbol = SFSymbol.named(
    result.success
      ? "checkmark.seal.fill"
      : "exclamationmark.triangle.fill"
  )

  symbol.applyFont(
    Font.systemFont(27)
  )

  const image = row.addImage(
    symbol.image
  )

  image.widthWeight = 15

  const subtitle = result.success
    ? `CTS Dashboard ${version} est prêt.  ·  Installer ${INSTALLER_VERSION}`
    : firstMessageLine(result.message)

  const text = row.addText(
    result.title,
    subtitle
  )

  text.widthWeight = 85
  text.titleFont = Font.boldSystemFont(20)
  text.subtitleFont = Font.systemFont(11)
  text.titleColor = result.success
    ? COLORS.green
    : COLORS.red
  text.subtitleColor = COLORS.secondary

  table.addRow(row)
}

function addResultMetrics(
  table,
  result,
  uninstalling
) {
  const summary = result.summary
  const elapsed = result.duration
    ? formatDuration(result.duration)
    : "—"

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
          color: summary.failed.length
            ? COLORS.red
            : COLORS.green
        },
        {
          title: elapsed,
          subtitle: "DURÉE",
          color: COLORS.blue
        }
      ]
    : [
        {
          title:
            summary.installed.length +
            summary.updated.length +
            summary.repaired.length,
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
          color: summary.failed.length
            ? COLORS.red
            : COLORS.green
        },
        {
          title: elapsed,
          subtitle: "DURÉE",
          color: COLORS.blue
        }
      ]

  for (const item of values) {
    const cell = row.addText(
      String(item.title),
      item.subtitle
    )

    cell.widthWeight = 100 / values.length
    cell.titleFont = Font.boldSystemFont(17)
    cell.subtitleFont = Font.boldSystemFont(8)
    cell.titleColor = item.color
    cell.subtitleColor = COLORS.secondary
  }

  table.addRow(row)
}

function addFinalValidationRow(
  table,
  state,
  result
) {
  const row = new UITableRow()
  row.height = 58

  const symbol = SFSymbol.named(
    result.success
      ? "checkmark.shield.fill"
      : "xmark.shield.fill"
  )

  symbol.applyFont(
    Font.systemFont(18)
  )

  const image = row.addImage(
    symbol.image
  )

  image.widthWeight = 11

  const valid = Number.isFinite(result.valid)
    ? result.valid
    : state.completed

  const total = Number.isFinite(result.total)
    ? result.total
    : state.total

  const text = row.addText(
    result.success
      ? "Installation validée"
      : "Validation incomplète",
    `${valid}/${total} fichiers valides · Snapshot ${String(repositoryRevision).slice(0, 7)}`
  )

  text.widthWeight = 89
  text.titleFont = Font.semiboldSystemFont(13)
  text.subtitleFont = Font.systemFont(10)
  text.titleColor = result.success
    ? COLORS.green
    : COLORS.red
  text.subtitleColor = COLORS.secondary

  table.addRow(row)
}

function addChangesRow(
  table,
  result,
  uninstalling
) {
  const summary = result.summary

  const changed = uninstalling
    ? summary.unchanged
    : [
        ...summary.installed,
        ...summary.updated,
        ...summary.repaired
      ]

  const failed = summary.failed

  const row = new UITableRow()
  row.height = 58
  row.dismissOnSelect = false

  const title = failed.length
    ? `${failed.length} erreur(s)`
    : changed.length
      ? uninstalling
        ? `${changed.length} élément(s) supprimé(s)`
        : `${changed.length} fichier(s) modifié(s)`
      : "Aucune modification nécessaire"

  const subtitle = failed.length
    ? compactNames(failed)
    : changed.length
      ? compactNames(changed)
      : "Tous les fichiers correspondaient déjà à la version GitHub."

  const text = row.addText(
    title,
    subtitle
  )

  text.widthWeight = 100
  text.titleFont = Font.semiboldSystemFont(13)
  text.subtitleFont = Font.systemFont(9)
  text.titleColor = failed.length
    ? COLORS.red
    : changed.length
      ? COLORS.orange
      : COLORS.green
  text.subtitleColor = COLORS.secondary

  if (failed.length || changed.length) {
    row.onSelect = async () => {
      await presentResultDetails(
        result,
        uninstalling
      )
    }
  }

  table.addRow(row)
}

function addProtectionRow(table, uninstalling) {
  const row = new UITableRow()
  row.height = 50

  const symbol = SFSymbol.named(
    "lock.shield.fill"
  )

  symbol.applyFont(
    Font.systemFont(16)
  )

  const image = row.addImage(
    symbol.image
  )

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

async function presentEntryDetails(
  entries,
  uninstalling
) {
  const table = new UITable()
  table.showSeparators = true

  const header = new UITableRow()
  header.height = 70
  header.isHeader = true

  const text = header.addText(
    uninstalling
      ? "Détail de la désinstallation"
      : "Détail des fichiers",
    `${entries.length} élément(s)`
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

    const marker = row.addText(
      visual.marker
    )

    marker.widthWeight = 8
    marker.titleFont = Font.boldSystemFont(16)
    marker.titleColor = visual.color

    const content = row.addText(
      entry.name,
      entry.detail
    )

    content.widthWeight = 92
    content.titleFont = Font.semiboldSystemFont(12)
    content.subtitleFont = Font.systemFont(9)
    content.titleColor = COLORS.primary
    content.subtitleColor = visual.color

    table.addRow(row)
  }

  await table.present(true)
}

async function presentResultDetails(
  result,
  uninstalling
) {
  const summary = result.summary

  const lines = []

  if (uninstalling) {
    if (summary.unchanged.length) {
      lines.push(
        `Supprimés (${summary.unchanged.length})`,
        ...summary.unchanged,
        ""
      )
    }
  } else {
    if (summary.installed.length) {
      lines.push(
        `Installés (${summary.installed.length})`,
        ...summary.installed,
        ""
      )
    }

    if (summary.updated.length) {
      lines.push(
        `Mis à jour (${summary.updated.length})`,
        ...summary.updated,
        ""
      )
    }

    if (summary.repaired.length) {
      lines.push(
        `Réparés (${summary.repaired.length})`,
        ...summary.repaired,
        ""
      )
    }
  }

  if (summary.failed.length) {
    lines.push(
      `Erreurs (${summary.failed.length})`,
      ...summary.failed
    )
  }

  const alert = new Alert()
  alert.title = result.title
  alert.message = lines.join("\n").trim() || result.message
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
    const key = Object.prototype.hasOwnProperty.call(
      counts,
      entry.status
    )
      ? entry.status
      : "pending"

    counts[key]++
  }

  return counts
}

function miniStatusMarker(status) {
  return {
    pending: "○",
    running: "●",
    retry: "↻",
    success: "✓",
    error: "!"
  }[status] || "○"
}

function compactCurrent(value) {
  const text = String(value || "")
    .replace(/^Contrôle de\s+/i, "")
    .replace(/^Nouvelle tentative\s*:\s*/i, "Nouvel essai · ")

  return text.length > 52
    ? `${text.slice(0, 49)}…`
    : text
}

function compactNames(names) {
  const list = Array.isArray(names)
    ? names
    : []

  if (!list.length) {
    return ""
  }

  const visible = list.slice(0, 2)
  const remaining = list.length - visible.length

  return remaining > 0
    ? `${visible.join(" · ")} · +${remaining}`
    : visible.join(" · ")
}

function firstMessageLine(message) {
  return String(message || "Erreur inconnue.")
    .split("\n")
    .map(line => line.trim())
    .find(Boolean) || "Erreur inconnue."
}

function progressBar(percentage) {
  const length = 12

  const completed = Math.max(
    0,
    Math.min(
      length,
      Math.round(
        percentage / 100 * length
      )
    )
  )

  return (
    "●".repeat(completed) +
    "○".repeat(length - completed)
  )
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
  return {
    installation: "Installer CTS Dashboard",
    update: "Mettre à jour CTS Dashboard",
    verification: "Vérifier CTS Dashboard",
    repair: "Réparer CTS Dashboard",
    uninstall: "Désinstaller CTS Dashboard"
  }[operation] || "CTS Dashboard"
}

function operationResultTitle(operation) {
  return {
    installation: "Installation terminée",
    update: "Mise à jour terminée",
    verification: "Vérification terminée",
    repair: "Réparation terminée"
  }[operation] || "Opération terminée"
}

function operationSymbol(operation) {
  return {
    installation: "arrow.down.circle.fill",
    update: "arrow.triangle.2.circlepath.circle.fill",
    verification: "checkmark.shield.fill",
    repair: "wrench.and.screwdriver.fill",
    uninstall: "trash.circle.fill"
  }[operation] || "gearshape.fill"
}

function operationColor(operation) {
  return {
    installation: COLORS.green,
    update: COLORS.orange,
    verification: COLORS.blue,
    repair: COLORS.orange,
    uninstall: COLORS.red
  }[operation] || COLORS.blue
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
    ...manifest.resources
      .map(resource => ({
        name: resource.name,
        type: "Ressource",
        destination: projectPath(
          resource.destination
        )
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
    throw new Error(
      "Le manifeste GitHub de CTS Dashboard est invalide."
    )
  }

  const names = new Set()

  for (const name of manifest.scripts) {
    if (
      typeof name !== "string" ||
      !name.endsWith(".js") ||
      name === INSTALLER_FILE ||
      names.has(name)
    ) {
      throw new Error(
        `Script invalide dans version.json : ${name}`
      )
    }

    names.add(name)
  }

  for (const resource of manifest.resources) {
    if (
      !isRecord(resource) ||
      typeof resource.name !== "string" ||
      typeof resource.destination !== "string"
    ) {
      throw new Error(
        "Une ressource de version.json est invalide."
      )
    }

    projectPath(resource.destination)
  }
}

async function handleInstallerUpdate(manifest) {
  const available = String(
    manifest.installerVersion ||
    INSTALLER_VERSION
  )

  const minimum = String(
    manifest.minimumInstaller ||
    "0.0.0"
  )

  const update =
    compareVersions(
      available,
      INSTALLER_VERSION
    ) > 0

  const required =
    compareVersions(
      minimum,
      INSTALLER_VERSION
    ) > 0

  if (!update && !required) {
    return true
  }

  const alert = new Alert()

  alert.title = required
    ? "Mise à jour obligatoire"
    : "Nouvel installateur disponible"

  alert.message = [
    `Version actuelle : ${INSTALLER_VERSION}`,
    `Version disponible : ${available}`,
    "",
    required
      ? "Cette mise à jour est nécessaire pour continuer."
      : "Une nouvelle version de CTS Installer est disponible.",
    "",
    "Après la mise à jour, relancez CTS Installer."
  ].join("\n")

  alert.addAction(
    `Installer la version ${available}`
  )

  if (!required) {
    alert.addAction(
      "Continuer avec cette version"
    )
  }

  alert.addCancelAction("Annuler")

  const choice = await alert.presentSheet()

  if (choice === 0) {
    await updateInstaller(available)
    return false
  }

  return !required && choice === 1
}

async function updateInstaller(version) {
  const content = await downloadText(
    `${rawUrl(INSTALLER_FILE)}?t=${Date.now()}`,
    INSTALLER_FILE
  )

  if (!content.includes(
    `INSTALLER_VERSION = "${version}"`
  )) {
    throw new Error(
      "La version publiée de CTS Installer ne correspond pas au manifeste GitHub."
    )
  }

  await writeText(
    canonicalInstaller,
    content
  )

  if (currentInstaller !== canonicalInstaller) {
    await writeText(
      currentInstaller,
      content
    )
  }

  const alert = new Alert()

  alert.title = "CTS Installer mis à jour"
  alert.message = [
    `La version ${version} a été installée.`,
    "",
    "Relancez CTS Installer pour continuer."
  ].join("\n")

  alert.addAction("Terminer")
  await alert.present()
}

async function loadManifest() {
  const content = await downloadText(
    `${rawUrl("version.json")}?t=${Date.now()}`,
    "version.json"
  )

  try {
    return JSON.parse(content)
  } catch (error) {
    throw new Error(
      `version.json invalide : ${messageOf(error)}`
    )
  }
}

async function verifyRepository() {
  const content = await downloadText(
    `${rawUrl("version.json")}?ping=${Date.now()}`,
    "GitHub"
  )

  const result = validateText(
    content,
    "version.json"
  )

  if (!result.valid) {
    throw new Error(
      `Connexion GitHub invalide : ${result.reason}`
    )
  }
}

function validateText(content, name) {
  if (
    typeof content !== "string" ||
    !content.trim()
  ) {
    return {
      valid: false,
      reason: "contenu vide"
    }
  }

  const trimmed = content.trim()
  const start = trimmed
    .slice(0, 160)
    .toLowerCase()

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

      if (
        value === null ||
        typeof value !== "object"
      ) {
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

  if (
    (
      name.endsWith(".js") ||
      name.endsWith(".mjs")
    ) &&
    trimmed.length < 80
  ) {
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

async function validateLocal(path, name) {
  if (!fm.fileExists(path)) {
    return {
      valid: false,
      reason: "fichier absent"
    }
  }

  try {
    const content = await readText(path)
    return validateText(content, name)
  } catch (error) {
    return {
      valid: false,
      reason: messageOf(error)
    }
  }
}

async function textMatches(path, remote) {
  const local = await readText(path)

  return normalize(local) === normalize(remote)
}

async function readText(path) {
  await ensureDownloaded(path)
  return fm.readString(path)
}

async function writeText(destination, content) {
  ensureParent(destination)

  const temporary = `${destination}.download`
  removeQuietly(temporary)

  try {
    fm.writeString(
      temporary,
      content
    )

    if (!fm.fileExists(temporary)) {
      throw new Error(
        "Le fichier temporaire n’a pas été créé."
      )
    }

    await sleep(80)
    removeQuietly(destination)

    fm.move(
      temporary,
      destination
    )

    await sleep(100)

    if (!fm.fileExists(destination)) {
      throw new Error(
        "Le fichier final n’a pas été créé."
      )
    }

    await ensureDownloaded(destination)
  } catch (error) {
    removeQuietly(temporary)
    throw error
  }
}

async function readMetadata() {
  if (!fm.fileExists(paths.metadata)) {
    return null
  }

  try {
    const value = JSON.parse(
      await readText(paths.metadata)
    )

    return isRecord(value)
      ? value
      : null
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
      fm.createDirectory(
        path,
        true
      )
    }
  }
}

function projectPath(relative) {
  const parts = String(relative || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)

  if (
    !parts.length ||
    parts.includes("..") ||
    parts.includes(".")
  ) {
    throw new Error(
      "Un chemin déclaré dans version.json est invalide."
    )
  }

  return parts.reduce(
    (path, part) => join(path, part),
    root
  )
}

function ensureParent(path) {
  const index = path.lastIndexOf("/")

  if (index <= 0) {
    return
  }

  const parent = path.slice(0, index)

  if (!fm.fileExists(parent)) {
    fm.createDirectory(
      parent,
      true
    )
  }
}

async function resolveRepositoryRevision() {
  const url = [
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
    throw new Error(
      `Impossible de déterminer la version GitHub actuelle : ${messageOf(error)}`
    )
  }

  const status = Number(
    request.response?.statusCode
  )

  if (
    Number.isFinite(status) &&
    (status < 200 || status >= 300)
  ) {
    throw new Error(
      `Impossible de déterminer la version GitHub actuelle : réponse HTTP ${status}`
    )
  }

  let payload

  try {
    payload = JSON.parse(content)
  } catch (error) {
    throw new Error(
      `Réponse GitHub invalide : ${messageOf(error)}`
    )
  }

  const sha = String(payload?.sha || "")
    .trim()
    .toLowerCase()

  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(
      "GitHub n’a pas renvoyé un identifiant de commit valide."
    )
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
    const status = Number(
      request.response?.statusCode
    )

    if (
      Number.isFinite(status) &&
      (status < 200 || status >= 300)
    ) {
      throw new Error(
        `Réponse HTTP ${status}`
      )
    }

    if (
      typeof content !== "string" ||
      !content.trim()
    ) {
      throw new Error("Réponse vide")
    }

    return content
  } catch (error) {
    throw new Error(
      `${label} impossible à télécharger : ${messageOf(error)}`
    )
  }
}

function rawUrl(
  name,
  reference = repositoryRevision || REPO.branch
) {
  return [
    "https://raw.githubusercontent.com",
    encodeURIComponent(REPO.owner),
    encodeURIComponent(REPO.name),
    encodeURIComponent(reference),
    String(name)
      .split("/")
      .map(encodeURIComponent)
      .join("/")
  ].join("/")
}

async function confirm(
  title,
  message,
  action,
  destructive = false
) {
  const alert = new Alert()
  alert.title = title
  alert.message = message

  destructive
    ? alert.addDestructiveAction(action)
    : alert.addAction(action)

  alert.addCancelAction("Annuler")

  return await alert.present() === 0
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
  if (
    fm.fileExists(path) &&
    !fm.isFileDownloaded(path)
  ) {
    await fm.downloadFileFromiCloud(path)
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
  return {
    installed: "Installé",
    updated: "Mis à jour",
    repaired: "Réparé",
    unchanged: "Déjà à jour",
    success: "Validé"
  }[status] || status
}

function normalize(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
}

function compareVersions(first, second) {
  const a = versionParts(first)
  const b = versionParts(second)
  const length = Math.max(
    a.length,
    b.length
  )

  for (
    let index = 0;
    index < length;
    index++
  ) {
    const difference =
      (a[index] || 0) -
      (b[index] || 0)

    if (difference) {
      return difference > 0
        ? 1
        : -1
    }
  }

  return 0
}

function versionParts(value) {
  return String(value || "")
    .split(".")
    .map(
      part =>
        Number.parseInt(part, 10) || 0
    )
}

function isRecord(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
}

function formatDuration(milliseconds) {
  const seconds = Math.max(
    0,
    Math.round(milliseconds / 1000)
  )

  return seconds < 60
    ? `${seconds} s`
    : `${Math.floor(seconds / 60)} min ${seconds % 60} s`
}

function messageOf(error) {
  return (
    error?.message?.trim?.() ||
    String(error || "Erreur inconnue.")
  )
}

async function registerAnalyticsInstallation(
  dashboardVersion
) {
  let analytics

  try {
    analytics = importModule(
      ANALYTICS_MODULE
    )
  } catch (_) {
    return
  }

  try {
    if (analytics.hasClientToken?.()) {
      return
    }

    const result =
      await analytics.registerInstallation({
        dashboardVersion:
          String(dashboardVersion || "").trim()
      })

    if (!result?.ok) {
      console.warn(
        "[Analytics]",
        result?.error ||
          "Installation non enregistrée."
      )
    }
  } catch (error) {
    console.warn(
      "[Analytics]",
      messageOf(error)
    )
  }
}

function sleep(milliseconds) {
  return new Promise(resolve => {
    Timer.schedule(
      milliseconds / 1000,
      false,
      resolve
    )
  })
}
