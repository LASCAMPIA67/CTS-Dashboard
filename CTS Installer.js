// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: arrow.down.circle.fill;

const INSTALLER_VERSION = "1.0.1"

const REPO = {
  owner: "LASCAMPIA67",
  name: "CTS-Dashboard",
  branch: "main"
}

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

    const manifest = await loadManifest()

    validateManifest(manifest)

    if (!await handleInstallerUpdate(manifest)) {
      return
    }

    const state = await inspect(manifest)
    const action = await menu(manifest, state)

    if (action === "install") {
      await installOrUpdate(manifest, state)
    }

    if (action === "uninstall") {
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
      "CTS Dashboard n’est pas installé sur cet iPhone.",
      "",
      `Version disponible : ${manifest.version}`,
      `Installateur : ${INSTALLER_VERSION}`,
      "",
      "Les scripts, ressources et dossiers nécessaires seront installés automatiquement.",
      "",
      "Développé par Emilio IPPOLITO",
      "Matricule 6124"
    ].join("\n")

    alert.addAction(
      `Installer la version ${manifest.version}`
    )

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
    ? `${state.valid}/${state.total} fichiers valides`
    : `${state.valid}/${state.total} fichiers valides — réparation nécessaire`

  alert.message = [
    updateAvailable
      ? `Mise à jour disponible : ${installedVersion} → ${manifest.version}`
      : `Version installée : ${installedVersion}`,
    "",
    stateLabel,
    issues.length
      ? `\nFichiers concernés : ${issues.join(", ")}`
      : "",
    "",
    updateAvailable
      ? "Une nouvelle version est disponible."
      : state.complete
        ? "CTS Dashboard est entièrement à jour."
        : "Les fichiers absents ou invalides seront réparés.",
    "",
    "CTS Installer, vos PDF et leurs archives seront conservés."
  ].join("\n")

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
        "Tous les scripts, ressources et dossiers seront créés automatiquement.",
        "",
        "Une connexion Internet est nécessaire."
      ].join("\n")
    : [
        `CTS Dashboard ${manifest.version} va être contrôlé.`,
        "",
        "Chaque fichier sera comparé à la version officielle publiée sur GitHub.",
        "",
        "Les fichiers différents, absents ou invalides seront remplacés.",
        "",
        "CTS Installer, vos PDF et leurs archives seront conservés."
      ].join("\n")

  if (!await confirm(
    title,
    message,
    "Continuer"
  )) {
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
      "Connexion au dépôt GitHub…"
    )

    await verifyRepository()

    await progress.system(
      "github",
      "success",
      "Connexion établie"
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
        `Nouvelle tentative sur ${failures.length} fichier(s)…`
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
          : "Toutes les erreurs ont été corrigées"
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
      "Contrôle final de l’installation…"
    )

    const verification = await inspect(manifest)

    if (!verification.complete) {
      const issues = [
        ...verification.missing.map(
          name => `${name} — absent`
        ),
        ...verification.invalid.map(
          name =>
            `${name} — ${verification.reasons[name] || "invalide"}`
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
          "",
          issues.length
            ? `Fichiers concernés :\n${issues.join("\n")}`
            : "Une erreur inconnue empêche la validation."
        ].join("\n"),
        summary,
        duration: Date.now() - startedAt
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
      message: [
        `CTS Dashboard ${manifest.version} est prêt.`,
        "",
        "Tous les fichiers ont été contrôlés avec succès.",
        "",
        "CTS Installer a été conservé."
      ].join("\n"),
      summary,
      duration: Date.now() - startedAt
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
      duration: Date.now() - startedAt
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
  if (
    !path ||
    !fm.fileExists(path)
  ) {
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
      "Cette opération supprimera les scripts et les données techniques du Dashboard.",
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

  const entries = [
    ...manifestEntries(manifest)
      .filter(
        entry =>
          entry.destination !== canonicalInstaller &&
          entry.destination !== currentInstaller
      ),
    ...fm.fileExists(root)
      ? fm.listContents(root)
          .filter(
            name => name !== "Services"
          )
          .map(name => ({
            name,
            type: "Dossier",
            destination: join(root, name)
          }))
      : []
  ]

  const progress = progressTable({
    title: "Désinstallation de CTS Dashboard",
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
    message: [
      `${summary.unchanged.length} élément(s) supprimé(s).`,
      `${summary.failed.length} erreur(s).`,
      "",
      "CTS Installer, le dossier Services et vos PDF ont été conservés."
    ].join("\n"),
    summary,
    duration: Date.now() - startedAt
  })
}

function progressTable({
  title,
  version,
  entries,
  operation
}) {
  const table = new UITable()

  table.showSeparators = true

  const uninstalling =
    operation === "uninstall"

  const state = {
    completed: 0,
    total: entries.length,
    current: "Initialisation…",
    operation,
    systems: {
      installer: {
        title: "Protection de l’installateur",
        status: uninstalling
          ? "hidden"
          : "pending",
        detail: "En attente"
      },
      github: {
        title: "Connexion à GitHub",
        status: uninstalling
          ? "hidden"
          : "pending",
        detail: "En attente"
      },
      directories: {
        title: "Préparation des dossiers",
        status: uninstalling
          ? "hidden"
          : "pending",
        detail: "En attente"
      },
      retry: {
        title: "Contrôle des erreurs",
        status: uninstalling
          ? "hidden"
          : "pending",
        detail: "En attente"
      },
      verification: {
        title: "Vérification finale",
        status: uninstalling
          ? "hidden"
          : "pending",
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

    addHeader(
      table,
      title,
      version,
      operation
    )

    addProgress(table, state)

    const systems = Object.values(
      state.systems
    ).filter(
      item => item.status !== "hidden"
    )

    if (systems.length) {
      addSection(
        table,
        "ÉTAPES SYSTÈME",
        COLORS.secondary
      )

      for (const item of systems) {
        addStatusRow(
          table,
          item.title,
          item.detail,
          item.status
        )
      }
    }

    addSection(
      table,
      uninstalling
        ? "ÉLÉMENTS À SUPPRIMER"
        : "FICHIERS DU PROJET",
      COLORS.secondary
    )

    for (const entry of state.entries) {
      addStatusRow(
        table,
        entry.name,
        entry.detail,
        entry.status
      )
    }

    if (state.result) {
      addFinalResult(
        table,
        state.result,
        uninstalling
      )
    }

    table.reload()

    await sleep(30)
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
        {
          status,
          detail
        }
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
        {
          status,
          detail
        }
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

function addHeader(
  table,
  title,
  version,
  operation
) {
  const row = new UITableRow()

  row.height = 92
  row.isHeader = true

  const icon = SFSymbol.named(
    operationSymbol(operation)
  )

  icon.applyFont(
    Font.systemFont(28)
  )

  const image = row.addImage(icon.image)

  image.widthWeight = 16

  const text = row.addText(
    title,
    [
      `Dashboard ${version}`,
      `Installer ${INSTALLER_VERSION}`
    ].join("  ·  ")
  )

  text.widthWeight = 84
  text.titleFont = Font.boldSystemFont(21)
  text.subtitleFont = Font.systemFont(12)
  text.titleColor = operationColor(operation)
  text.subtitleColor = COLORS.secondary

  table.addRow(row)
}

function addProgress(table, state) {
  const percentage = state.total
    ? Math.round(
        state.completed /
        state.total *
        100
      )
    : 100

  const row = new UITableRow()

  row.height = 88

  const progress = row.addText(
    `${progressBar(percentage)}  ${percentage} %`,
    `${state.completed}/${state.total} fichiers · ${state.current}`
  )

  progress.titleFont =
    Font.boldMonospacedSystemFont(15)

  progress.subtitleFont =
    Font.systemFont(12)

  progress.titleColor =
    percentage === 100
      ? COLORS.green
      : COLORS.blue

  progress.subtitleColor =
    COLORS.secondary

  table.addRow(row)
}

function addSection(table, title, color) {
  const row = new UITableRow()

  row.height = 34
  row.isHeader = true

  const text = row.addText(title)

  text.titleFont = Font.boldSystemFont(11)
  text.titleColor = color

  table.addRow(row)
}

function addStatusRow(
  table,
  title,
  detail,
  status
) {
  const visual = statusVisual(status)
  const row = new UITableRow()

  row.height =
    detail.length > 68
      ? 72
      : 58

  const marker = row.addText(
    visual.marker
  )

  marker.widthWeight = 10
  marker.titleFont =
    Font.boldSystemFont(19)

  marker.titleColor = visual.color

  const content = row.addText(
    title,
    detail
  )

  content.widthWeight = 72
  content.titleFont =
    Font.semiboldSystemFont(14)

  content.subtitleFont =
    Font.systemFont(11)

  content.titleColor = COLORS.primary
  content.subtitleColor = visual.color

  const badge = row.addText(
    visual.label
  )

  badge.widthWeight = 18
  badge.titleFont =
    Font.semiboldSystemFont(10)

  badge.titleColor = visual.color

  table.addRow(row)
}

function addFinalResult(
  table,
  result,
  uninstalling
) {
  const success = result.success

  addSection(
    table,
    success
      ? "OPÉRATION TERMINÉE"
      : "ERREUR",
    success
      ? COLORS.green
      : COLORS.red
  )

  const resultRow = new UITableRow()

  const lines = result.message
    .split("\n")
    .length

  resultRow.height = Math.max(
    110,
    72 + lines * 17
  )

  const symbol = SFSymbol.named(
    success
      ? "checkmark.seal.fill"
      : "exclamationmark.triangle.fill"
  )

  symbol.applyFont(
    Font.systemFont(27)
  )

  const image = resultRow.addImage(
    symbol.image
  )

  image.widthWeight = 15

  const resultText = resultRow.addText(
    result.title,
    result.message
  )

  resultText.widthWeight = 85
  resultText.titleFont =
    Font.boldSystemFont(19)

  resultText.subtitleFont =
    Font.systemFont(12)

  resultText.titleColor =
    success
      ? COLORS.green
      : COLORS.red

  resultText.subtitleColor =
    COLORS.secondary

  table.addRow(resultRow)

  addSummaryCards(
    table,
    result,
    uninstalling
  )
}

function addSummaryCards(
  table,
  result,
  uninstalling
) {
  const summary = result.summary

  const elapsed = result.duration
    ? formatDuration(result.duration)
    : "—"

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
          title: summary.installed.length,
          subtitle: "INSTALLÉS",
          color: COLORS.green
        },
        {
          title: summary.updated.length,
          subtitle: "MIS À JOUR",
          color: COLORS.orange
        },
        {
          title: summary.repaired.length,
          subtitle: "RÉPARÉS",
          color: COLORS.green
        },
        {
          title: summary.unchanged.length,
          subtitle: "DÉJÀ À JOUR",
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

  for (
    let index = 0;
    index < values.length;
    index += 3
  ) {
    const row = new UITableRow()

    row.height = 72

    for (
      const item of values.slice(
        index,
        index + 3
      )
    ) {
      const cell = row.addText(
        String(item.title),
        item.subtitle
      )

      cell.titleFont =
        Font.boldSystemFont(18)

      cell.subtitleFont =
        Font.boldSystemFont(9)

      cell.titleColor = item.color
      cell.subtitleColor =
        COLORS.secondary

      cell.widthWeight =
        100 / Math.min(
          3,
          values.length - index
        )
    }

    table.addRow(row)
  }

  const protectionRow =
    new UITableRow()

  protectionRow.height = 55

  const protection =
    protectionRow.addText(
      "Données personnelles protégées",
      "CTS Installer, les services PDF et leurs archives ont été conservés."
    )

  protection.titleFont =
    Font.semiboldSystemFont(13)

  protection.subtitleFont =
    Font.systemFont(11)

  protection.titleColor =
    COLORS.green

  protection.subtitleColor =
    COLORS.secondary

  table.addRow(protectionRow)
}

function progressBar(percentage) {
  const length = 14

  const completed = Math.max(
    0,
    Math.min(
      length,
      Math.round(
        percentage /
        100 *
        length
      )
    )
  )

  return (
    "●".repeat(completed) +
    "○".repeat(
      length - completed
    )
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

  return values[status] ||
    values.pending
}

function operationTitle(operation) {
  return {
    installation:
      "Installer CTS Dashboard",
    update:
      "Mettre à jour CTS Dashboard",
    verification:
      "Vérifier CTS Dashboard",
    repair:
      "Réparer CTS Dashboard",
    uninstall:
      "Désinstaller CTS Dashboard"
  }[operation] ||
    "CTS Dashboard"
}

function operationResultTitle(operation) {
  return {
    installation:
      "Installation terminée",
    update:
      "Mise à jour terminée",
    verification:
      "Vérification terminée",
    repair:
      "Réparation terminée"
  }[operation] ||
    "Opération terminée"
}

function operationSymbol(operation) {
  return {
    installation:
      "arrow.down.circle.fill",
    update:
      "arrow.triangle.2.circlepath.circle.fill",
    verification:
      "checkmark.shield.fill",
    repair:
      "wrench.and.screwdriver.fill",
    uninstall:
      "trash.circle.fill"
  }[operation] ||
    "gearshape.fill"
}

function operationColor(operation) {
  return {
    installation: COLORS.green,
    update: COLORS.orange,
    verification: COLORS.blue,
    repair: COLORS.orange,
    uninstall: COLORS.red
  }[operation] ||
    COLORS.blue
}

function manifestEntries(manifest) {
  return [
    ...manifest.scripts
      .filter(
        name => name !== INSTALLER_FILE
      )
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

  return (
    !required &&
    choice === 1
  )
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

  if (
    currentInstaller !== canonicalInstaller
  ) {
    await writeText(
      currentInstaller,
      content
    )
  }

  const alert = new Alert()

  alert.title =
    "CTS Installer mis à jour"

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
      reason:
        "GitHub a renvoyé une page d’erreur"
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
        reason:
          `JSON invalide : ${messageOf(error)}`
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
      reason:
        "fichier anormalement court"
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

    return validateText(
      content,
      name
    )
  } catch (error) {
    return {
      valid: false,
      reason: messageOf(error)
    }
  }
}

async function textMatches(path, remote) {
  const local = await readText(path)

  return (
    normalize(local) ===
    normalize(remote)
  )
}

async function readText(path) {
  await ensureDownloaded(path)

  return fm.readString(path)
}

async function writeText(
  destination,
  content
) {
  ensureParent(destination)

  const temporary =
    `${destination}.download`

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

async function writeMetadata(
  manifest,
  summary
) {
  ensureDirectories()

  const previous = await readMetadata()
  const now = new Date().toISOString()

  await writeText(
    paths.metadata,
    JSON.stringify(
      {
        dashboardVersion:
          manifest.version,
        installerVersion:
          INSTALLER_VERSION,
        installedAt:
          previous?.installedAt ||
          now,
        updatedAt: now,
        repository: REPO,
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
    (path, part) =>
      join(path, part),
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

async function downloadText(url, label) {
  const request = new Request(url)

  request.timeoutInterval = TIMEOUT

  request.headers = {
    "Cache-Control": "no-cache",
    Pragma: "no-cache"
  }

  try {
    const content =
      await request.loadString()

    const status = Number(
      request.response?.statusCode
    )

    if (
      Number.isFinite(status) &&
      (
        status < 200 ||
        status >= 300
      )
    ) {
      throw new Error(
        `Réponse HTTP ${status}`
      )
    }

    if (
      typeof content !== "string" ||
      !content.trim()
    ) {
      throw new Error(
        "Réponse vide"
      )
    }

    return content
  } catch (error) {
    throw new Error(
      `${label} impossible à télécharger : ${messageOf(error)}`
    )
  }
}

function rawUrl(name) {
  return [
    "https://raw.githubusercontent.com",
    encodeURIComponent(REPO.owner),
    encodeURIComponent(REPO.name),
    encodeURIComponent(REPO.branch),
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

  return (
    await alert.present()
  ) === 0
}

async function errorAlert(error) {
  const alert = new Alert()

  alert.title =
    "Opération impossible"

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
        Number.parseInt(
          part,
          10
        ) || 0
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
    Math.round(
      milliseconds / 1000
    )
  )

  return seconds < 60
    ? `${seconds} s`
    : `${Math.floor(seconds / 60)} min ${seconds % 60} s`
}

function messageOf(error) {
  return (
    error?.message?.trim?.() ||
    String(
      error ||
      "Erreur inconnue."
    )
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
          String(
            dashboardVersion || ""
          ).trim()
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