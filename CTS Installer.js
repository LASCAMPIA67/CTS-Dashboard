// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: arrow.down.circle.fill;

const INSTALLER_VERSION = "1.0.28"

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
const SCRIPT_RESIDUE = /^(CTS .+\.js)\.(download|rollback)$/

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

    /*
     * Navigation.
     *
     * Il n'y a pas de pile à tenir : Scriptable en a déjà une. Chaque
     * écran est présenté par `present(true)`, dont la promesse se résout
     * quand l'utilisateur le ferme, et une ligne qui ne se referme pas à
     * la sélection peut en présenter un autre par-dessus. « Retour »
     * existe donc déjà partout, sous le nom de « Close », posé par le
     * système sur tous les écrans — y compris ceux d'un niveau profond,
     * comme les détails du diagnostic.
     *
     * Ce qui manquait n'était pas le retour mais le retour AU MENU :
     * l'action choisie était exécutée, puis l'installateur s'arrêtait.
     * Cette boucle le rend, et rien d'autre n'a besoin de changer. Ajouter
     * un bouton dessiné aurait doublé un geste que le système fournit, et
     * une pile maison aurait doublé la sienne.
     *
     * Le manifeste est lu une fois pour toute la session ; seul l'état du
     * disque est relu à chaque retour, parce qu'une action vient peut-être
     * de le changer.
     */
    for (;;) {
      const state = await inspect(manifest)

      /*
       * Le verrou reste au-dessus de la boucle : fermer cette porte
       * arrête l'installateur au lieu de rendre la main, sans quoi
       * « Close » deviendrait le contournement qu'on vient de retirer.
       */
      if (await handleDashboardUpdate(manifest, state)) {
        return
      }

      const action = await menu(manifest, state)

      /* Fermer le menu principal, c'est fermer l'installateur. */
      if (!action) {
        return
      }

      /*
       * Une mise à jour qui a écrit rouvre l'installateur. La nouvelle
       * exécution reprend tout depuis le début : celle-ci doit donc
       * s'arrêter, sans quoi deux instances vivraient en même temps et le
       * menu de l'ancienne reviendrait par-dessus la nouvelle.
       */
      if (action === "install") {
        if (await installOrUpdate(manifest, state)) {
          return
        }
      } else if (action === "diagnostic") {
        await runDiagnostic(manifest, state)
      } else if (action === "preferences") {
        await editPreferences()
      } else if (action === "remove-service") {
        await removeServiceFlow()
      } else if (action === "uninstall") {
        await uninstall(manifest)
      }
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
    symbol: "calendar.badge.minus",
    label: "Retirer un service",
    detail: "Le retirer du widget et supprimer son PDF",
    onSelect: select("remove-service")
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

/*
 * Rend `true` quand une nouvelle exécution a été lancée : l'appelant doit
 * alors s'arrêter.
 */
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

  /*
   * Le résultat est retenu, non plus seulement affiché : c'est lui qui dit
   * si l'opération mérite une relance. Les trois sorties le renseignent.
   */
  let outcome = null

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

    for (const name of sweepScriptResidue().restored) {
      summary.repaired.push(name)
    }

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

      outcome = {
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
      }

      await progress.finish(outcome)

      return false
    }

    await writeMetadata(manifest, summary)

    await preserveInstaller()

    await registerAnalyticsInstallation(manifest.version)

    await progress.system(
      "verification",
      "success",
      `${verification.valid}/${verification.total} fichiers valides`
    )

    outcome = {
      success: true,
      title: operationResultTitle(operation),
      message: `CTS Dashboard ${manifest.version} est prêt.`,
      summary,
      duration: Date.now() - startedAt,
      valid: verification.valid,
      total: verification.total
    }

    await progress.finish(outcome)
  } catch (error) {
    await progress.system("verification", "error", "Opération interrompue")

    outcome = {
      success: false,
      title: "Opération interrompue",
      message: messageOf(error),
      summary,
      duration: Date.now() - startedAt,
      valid: null,
      total: entries.length
    }

    await progress.finish(outcome)
  } finally {
    /*
     * La page de résultat se lit. Rendre la main sans attendre sa
     * fermeture ferait revenir le menu par-dessus, et le compte des
     * fichiers modifiés ne serait jamais vu. Les trois sorties passent
     * ici, y compris celle qui abandonne en cours de validation.
     */
    await progress.closed()
  }

  /*
   * La relance part du geste qui referme la page de résultat, jamais de
   * l'écriture elle-même : partir plus tôt ferait passer la nouvelle
   * exécution sous un écran encore ouvert, et le compte des fichiers
   * modifiés ne serait jamais lu.
   *
   * Si le système refuse d'ouvrir l'URL, la ligne « Fermez cet écran pour
   * continuer » a promis quelque chose qui n'arrivera pas : le message
   * prend alors le relais plutôt que de laisser un écran muet.
   */
  if (!shouldReopen(outcome)) {
    return false
  }

  if (relaunch()) {
    return true
  }

  await noticeAlert(
    "Ouverture impossible",
    `CTS Dashboard ${manifest.version} est bien en place.\n\n` +
      "Relancez CTS Installer depuis la liste des scripts."
  )

  return false
}

/*
 * Décider de la relance.
 *
 * Elle ne suit pas l'opération mais son résultat. Une vérification qui
 * n'a rien écrit n'a rien à rouvrir, et une opération qui laisse un
 * fichier en erreur ne doit surtout pas repartir comme si de rien
 * n'était : l'ouverture est la façon dont l'outil dit « c'est fait »,
 * elle ne doit donc le dire que quand ça l'est.
 *
 * L'écran de résultat pose exactement la même question avant d'annoncer
 * la réouverture. Une seule fonction pour les deux : annoncer ce qu'on ne
 * fera pas serait pire que ne rien annoncer.
 */
function shouldReopen(result) {
  if (!result || result.success !== true) {
    return false
  }

  const summary = result.summary || {}

  if ((summary.failed || []).length) {
    return false
  }

  const written = [
    ...(summary.installed || []),
    ...(summary.updated || []),
    ...(summary.repaired || [])
  ]

  return written.length > 0
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
      /*
       * Le contenu reçu n'est retenu qu'une fois validé.
       *
       * L'affecter avant le contrôle laissait sortir de la boucle avec
       * une page d'erreur GitHub en main : `remote` n'étant plus
       * indéfini, la reprise ne levait pas, et l'écriture atomique
       * remplaçait le bon fichier par la page avant que la relecture ne
       * s'en aperçoive. La copie de secours étant déjà effacée à ce
       * moment-là, le fichier d'origine était perdu.
       */
      const candidate = await downloadText(
        `${rawUrl(entry.name)}?t=${Date.now()}-${attempt}`,
        entry.name
      )

      const validation = validateText(candidate, entry.name)

      if (!validation.valid) {
        throw new Error(`Version GitHub invalide : ${validation.reason}`)
      }

      remote = candidate

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

/*
 * Retrait d'un service.
 *
 * L'Installer ne supprime rien lui-même : il présente les services
 * connus, demande confirmation, puis délègue à CTS Services Cleaner,
 * qui détient l'unique chemin de suppression du projet. Écrire ici une
 * seconde suppression donnerait deux codes capables de se tromper.
 *
 * Si le Dashboard est absent, ou trop ancien pour exposer la fonction,
 * l'action le dit et s'arrête sans rien toucher.
 */
async function removeServiceFlow() {
  const cleaner = loadDashboardFunction("CTS Services Cleaner", "removeService")

  if (!cleaner.ready) {
    await noticeAlert("Retirer un service", cleaner.reason)
    return
  }

  let entries

  try {
    entries = await loadIndexedServices()
  } catch (error) {
    await errorAlert(error)
    return
  }

  if (!entries.length) {
    await noticeAlert(
      "Retirer un service",
      "Aucun service n’est enregistré. Il n’y a rien à retirer."
    )
    return
  }

  const displayedId = await resolveDisplayedServiceId()
  const chosen = await pickServiceToRemove(entries, displayedId)

  if (!chosen) return

  const label = serviceLabel(chosen)
  const confirmed = await confirm(
    "Retirer ce service ?",
    [
      label,
      "",
      "Son PDF et ses données seront supprimés définitivement.",
      "Il disparaîtra du widget au prochain rafraîchissement.",
      "",
      "Les autres services et vos archives ne sont pas touchés."
    ].join("\n"),
    "Retirer",
    true
  )

  if (!confirmed) return

  let result

  try {
    result = await cleaner.value(chosen.id)
  } catch (error) {
    await errorAlert(error)
    return
  }

  await presentRemovalResult(result, label)
}

function loadDashboardFunction(moduleName, functionName) {
  let module

  try {
    module = importModule(moduleName)
  } catch (_) {
    return {
      ready: false,
      value: null,
      reason: `${moduleName} est absent. Installez CTS Dashboard, puis réessayez.`
    }
  }

  if (!module || typeof module[functionName] !== "function") {
    return {
      ready: false,
      value: null,
      reason: `${moduleName} ne fournit pas ${functionName}(). Mettez CTS Dashboard à jour, puis réessayez.`
    }
  }

  return { ready: true, value: module[functionName].bind(module), reason: "" }
}

async function loadIndexedServices() {
  const importer = loadDashboardFunction("CTS Importer", "readCurrentIndex")

  if (!importer.ready) {
    throw new Error(importer.reason)
  }

  const index = await importer.value()
  const services = Array.isArray(index?.services) ? index.services : []

  return services
    .filter(entry => entry && typeof entry === "object" && String(entry.id || "").trim())
    .map(entry => ({
      id: String(entry.id).trim(),
      date: String(entry.date || ""),
      service: String(entry.service || ""),
      archived: Boolean(entry.archive?.fileName || entry.archive?.deletedAt)
    }))
    .sort((first, second) => first.date.localeCompare(second.date) || first.service.localeCompare(second.service))
}

/*
 * Le service affiché n'est qu'un repère : le signaler évite de retirer
 * la mauvaise ligne. Son absence n'empêche jamais l'opération.
 */
async function resolveDisplayedServiceId() {
  try {
    const manager = loadDashboardFunction("CTS Services Manager", "resolveServiceForDate")

    if (!manager.ready) return ""

    const selection = await manager.value(new Date())

    return selection?.found ? String(selection.entry?.id || "") : ""
  } catch (_) {
    return ""
  }
}

async function pickServiceToRemove(entries, displayedId) {
  const table = screenTable()
  let chosen = null

  addHeroRow(table, {
    symbol: "calendar.badge.minus",
    title: "Retirer un service",
    subtitle: plural(entries.length, "service enregistré", "services enregistrés"),
    tone: COLORS.blue
  })

  addSectionRow(table, "SERVICES")

  for (const entry of entries) {
    const displayed = displayedId && entry.id === displayedId

    addActionRow(table, {
      symbol: displayed ? "dot.radiowaves.left.and.right" : "doc.text",
      label: serviceLabel(entry),
      detail: displayed
        ? "Affiché en ce moment dans le widget"
        : entry.archived
          ? "PDF déjà archivé"
          : "Enregistré",
      tone: displayed ? COLORS.blue : undefined,
      onSelect: () => {
        chosen = entry
      }
    })
  }

  addCreditRow(table)

  await table.present(true)

  return chosen
}

function serviceLabel(entry) {
  const parts = String(entry?.date || "").split("-")
  const date =
    parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(entry?.date || "")
  const service = String(entry?.service || "").trim()

  return service ? `${date} · service ${service}` : date
}

async function presentRemovalResult(result, label) {
  if (result?.status === "unknown") {
    await noticeAlert("Déjà retiré", `${label}\n\nCe service n’était plus enregistré.`)
    return
  }

  if (result?.status === "pdf-still-present") {
    await noticeAlert(
      "Retrait incomplet",
      [
        label,
        "",
        "Le PDF n’a pas pu être supprimé, et le service a donc été conservé pour éviter qu’il ne revienne à moitié.",
        "Réessayez, ou supprimez le PDF depuis l’app Fichiers."
      ].join("\n")
    )
    return
  }

  if (!result?.success) {
    const detail = Array.isArray(result?.failed)
      ? result.failed.map(item => String(item?.error || "").trim()).filter(Boolean).join("\n")
      : ""

    await noticeAlert(
      "Retrait partiel",
      [label, "", detail || "Certains fichiers n’ont pas pu être supprimés."].join("\n")
    )
    return
  }

  const removed = Array.isArray(result?.removed) ? result.removed.length : 0

  await noticeAlert(
    "Service retiré",
    [
      label,
      "",
      `${plural(removed, "fichier supprimé", "fichiers supprimés")}.`,
      "Le widget cessera de l’afficher au prochain rafraîchissement.",
      ...(result?.archivePreserved
        ? ["", "Son PDF archivé est conservé, et sera supprimé à l’échéance habituelle."]
        : [])
    ].join("\n")
  )
}

async function noticeAlert(title, message) {
  const alert = new Alert()
  alert.title = String(title || "")
  alert.message = String(message || "")
  alert.addAction("Fermer")
  await alert.present()
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
  const scripts = countScriptResidue()

  if (scripts) {
    return {
      status: "warning",
      detail: `${plural(scripts, "reste de script", "restes de script")} à la racine Scriptable`
    }
  }

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
  const restored = Number(residue.restored) || 0
  const removed = Number(residue.removed) || 0
  const errors = Number(residue.errors) || 0

  if (errors) {
    return {
      status: "error",
      detail: `${plural(errors, "reste non supprimé", "restes non supprimés")}`
    }
  }

  if (restored) {
    return {
      status: "warning",
      detail: `${plural(restored, "fichier remis en place", "fichiers remis en place")}`
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

  await progress.closed()
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

  /*
   * La présentation est retenue, non plus jetée : c'est elle qui dit
   * quand l'utilisateur a fermé la page de résultat. Sans cela, le menu
   * reviendrait par-dessus avant qu'elle ait été lue.
   */
  let presentation = null

  return {
    present() {
      presentation = table.present(true)
    },

    async closed() {
      await presentation
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

  addReopenRow(table, result, uninstalling)

  addProtectionRow(table, uninstalling)

  addCreditRow(table)
}

/*
 * Ce qui va se passer est dit avant de se passer.
 *
 * La réouverture part du geste qui referme cet écran. Sans cette ligne,
 * l'installateur semblerait redémarrer tout seul — et si l'ouverture
 * échouait, personne ne saurait qu'il manque quelque chose.
 */
function addReopenRow(table, result, uninstalling) {
  if (uninstalling || !shouldReopen(result)) {
    return
  }

  const row = new UITableRow()
  row.height = 55
  row.dismissOnSelect = false

  const symbol = SFSymbol.named("arrow.clockwise.circle.fill")
  symbol.applyFont(Font.systemFont(17))

  const image = row.addImage(symbol.image)
  image.widthWeight = 11

  const text = row.addText(
    "Fermez cet écran pour continuer",
    "CTS Installer s’ouvrira à nouveau sur l’état mis à jour."
  )

  text.widthWeight = 89
  text.titleFont = Font.semiboldSystemFont(13)
  text.subtitleFont = Font.systemFont(9)
  text.titleColor = COLORS.blue
  text.subtitleColor = COLORS.secondary

  table.addRow(row)
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

/*
 * Mise à jour obligatoire de l'installateur.
 *
 * Toute version publiée plus récente est imposée, et non plus proposée.
 * L'ancien écran offrait « Continuer avec X » : c'était le seul chemin
 * qui rendait la main sans mettre à jour, et il suffisait d'un geste pour
 * rester indéfiniment en arrière — la mise à jour revenait à chaque
 * lancement et se refusait aussi facilement.
 *
 * Le contournement n'est pas retiré de l'écran, il est retiré du code :
 * cette fonction ne rend `true` — le seul retour qui laisse atteindre le
 * menu — que si aucune mise à jour n'est disponible. Tous les autres
 * chemins, y compris fermer l'écran, arrêtent l'installateur. Cacher le
 * bouton en laissant le retour permissif aurait laissé le contournement
 * en place derrière un écran.
 *
 * Le plancher `minimumInstaller` reste lu : une version publiée en retard
 * ne doit pas désarmer un plancher relevé volontairement. Il ne distingue
 * plus deux comportements, puisqu'il n'y en a plus qu'un.
 *
 * Le Diagnostic reste joignable sans mettre à jour, comme sur la porte du
 * Dashboard. Il n'ouvre aucune fonction — ni installation, ni réparation,
 * ni désinstallation — et n'existe que pour signaler une panne. Si la
 * mise à jour devenait la seule porte et que c'est précisément elle qui
 * échoue, la ligne de secours serait coupée au moment où elle sert.
 */
async function handleInstallerUpdate(manifest) {
  const available = String(manifest.installerVersion || INSTALLER_VERSION)
  const minimum = String(manifest.minimumInstaller || "0.0.0")

  if (
    compareVersions(available, INSTALLER_VERSION) <= 0 &&
    compareVersions(minimum, INSTALLER_VERSION) <= 0
  ) {
    return true
  }

  for (;;) {
    const choice = await presentInstallerUpdateGate(available)

    if (choice === "install") {
      await updateInstaller(available)
      await presentInstallerReady(available)

      return false
    }

    if (choice === "diagnostic") {
      await runDiagnostic(manifest, await inspect(manifest))
      continue
    }

    return false
  }
}

/*
 * Écran de passage à la nouvelle version.
 *
 * L'ouverture ne suit pas le remplacement, et c'est le résultat d'une
 * mesure : l'écriture atomique fait disparaître le fichier du script
 * l'espace d'un instant, et Scriptable cesse alors de le trouver par son
 * nom. Ouvrir dans la foulée ne fait rien, et sans rien dire. Il lui faut
 * le temps de reprendre ses repères.
 *
 * Attendre en aveugle aurait figé l'écran sur une course qu'on peut
 * perdre. Cette page fournit le délai sans le faire attendre : le temps
 * de la lire et de la refermer dépasse largement ce qu'il faut, et
 * l'ouverture part de ce geste-là.
 *
 * Elle annonce donc ce qu'elle va faire. Si la course était malgré tout
 * perdue, rien ne s'ouvrirait — et il faut alors que la personne sache
 * quoi faire sans avoir à le deviner.
 */
async function presentInstallerReady(version) {
  const table = screenTable()

  addHeroRow(table, {
    symbol: "checkmark.seal.fill",
    title: "Mise à jour installée",
    subtitle: `CTS Installer ${version}`,
    tone: COLORS.green
  })

  addVersionBand(table, [
    { value: INSTALLER_VERSION, label: "Remplacée" },
    { arrow: true },
    { value: version, label: "En place", strong: true, tone: COLORS.green }
  ])

  addStatusRow(table, {
    symbol: "arrow.clockwise",
    title: "Fermez cet écran pour continuer",
    detail: `CTS Installer ${version} s’ouvrira à sa place.`,
    tone: COLORS.blue
  })

  addStatusRow(table, {
    symbol: "hand.tap.fill",
    title: "S’il ne s’ouvre pas",
    detail: "Relancez CTS Installer depuis la liste des scripts.",
    tone: COLORS.secondary
  })

  addCreditRow(table)

  await table.present(true)

  if (!relaunch()) {
    await noticeAlert(
      "Ouverture impossible",
      `CTS Installer ${version} est bien en place.\n\nRelancez-le depuis la liste des scripts.`
    )
  }
}

/*
 * Relance.
 *
 * Un script ne peut pas recharger son propre code en cours d'exécution :
 * Scriptable a lu le fichier au lancement, et le remplacer ne change rien
 * à ce qui tourne. La seule façon d'exécuter la nouvelle version est d'en
 * démarrer une nouvelle exécution, qui relira le fichier sur le disque.
 *
 * C'est ce que fait l'URL rendue par URLScheme.forRunningScript(). Elle
 * désigne le script, pas son contenu : ce qui repart est donc bien le
 * fichier qui vient d'être écrit, et l'ancienne instance s'achève.
 *
 * Importer le fichier remplacé aurait exécuté le nouveau code imbriqué
 * dans l'ancienne exécution — deux instances vivantes, dont l'une périmée.
 *
 * Un refus n'est jamais une panne : l'appelant retombe sur le message qui
 * demande de relancer à la main, exactement comme avant.
 */
function relaunch() {
  try {
    if (typeof Safari === "undefined" || typeof URLScheme === "undefined") return false

    const url = String(URLScheme.forRunningScript() || "")

    if (!/^scriptable:/i.test(url)) return false

    Safari.open(url)

    return true
  } catch (_) {
    return false
  }
}

async function presentInstallerUpdateGate(available) {
  const table = screenTable()
  let choice = null

  addHeroRow(table, {
    symbol: "exclamationmark.triangle.fill",
    title: "Mise à jour requise",
    subtitle: "CTS Installer",
    tone: COLORS.orange
  })

  addVersionBand(table, [
    { value: INSTALLER_VERSION, label: "Installée" },
    { arrow: true },
    { value: available, label: "Requise", strong: true, tone: COLORS.orange }
  ])

  addStatusRow(table, {
    symbol: "exclamationmark.circle.fill",
    title: "Version obligatoire",
    detail: "CTS Installer ne peut pas continuer sans cette mise à jour.",
    tone: COLORS.orange
  })

  addStatusRow(table, {
    symbol: "arrow.clockwise",
    title: "Relance nécessaire",
    detail: "Après l’installation, relancez CTS Installer.",
    tone: COLORS.primary
  })

  addStatusRow(table, {
    symbol: "lock.shield.fill",
    title: "Données protégées",
    detail: "Vos PDF, vos archives et vos réglages sont conservés.",
    tone: COLORS.green
  })

  addSectionRow(table, "Actions")

  addActionRow(table, {
    symbol: "arrow.down.circle.fill",
    label: `Installer ${available}`,
    detail: "Remplace CTS Installer sur cet iPhone",
    tone: COLORS.orange,
    primary: true,
    onSelect: () => {
      choice = "install"
    }
  })

  addActionRow(table, {
    symbol: "stethoscope",
    label: "Diagnostic",
    detail: "Rapport complet, sans mettre à jour",
    onSelect: () => {
      choice = "diagnostic"
    }
  })

  addCreditRow(table)

  await table.present(true)

  return choice
}

/*
 * Mise à jour obligatoire du Dashboard.
 *
 * Le widget, lui, ne s'arrête que sous le plancher : couper un
 * conducteur en service parce qu'une correction vient de paraître serait
 * absurde. Ici c'est l'inverse — la personne a déjà l'outil ouvert et
 * deux minutes devant elle, il n'y a aucune raison de la laisser
 * repartir en retard. C'est le seul verrou qui atteigne aussi les
 * versions trop anciennes pour se contrôler elles-mêmes, puisque ce
 * n'est plus leur code qui décide.
 *
 * Le Diagnostic reste joignable sans mettre à jour. Le README en fait la
 * procédure d'assistance, et c'est lui qui identifie une installation
 * cassée : si la mise à jour devenait la seule porte et que c'est
 * précisément elle qui échoue, la ligne de secours serait coupée au
 * moment où elle sert.
 *
 * Renoncer ne piège personne : l'écran se referme et l'installateur
 * s'arrête, exactement comme il le fait déjà pour son propre plancher.
 */
function dashboardUpdateRequired(manifest, state) {
  return (
    Boolean(state.installedVersion) &&
    compareVersions(manifest.version, state.installedVersion) > 0
  )
}

async function handleDashboardUpdate(manifest, state) {
  if (!dashboardUpdateRequired(manifest, state)) {
    return false
  }

  for (;;) {
    const choice = await presentDashboardUpdateGate(manifest, state)

    if (choice === "install") {
      await installOrUpdate(manifest, state)
      return true
    }

    if (choice === "diagnostic") {
      await runDiagnostic(manifest, state)
      continue
    }

    return true
  }
}

async function presentDashboardUpdateGate(manifest, state) {
  const table = screenTable()
  let choice = null

  addHeroRow(table, {
    symbol: "exclamationmark.triangle.fill",
    title: "Mise à jour requise",
    subtitle: "CTS Dashboard",
    tone: COLORS.orange
  })

  addVersionBand(table, [
    { value: state.installedVersion, label: "Installée" },
    { arrow: true },
    { value: manifest.version, label: "Requise", strong: true, tone: COLORS.orange }
  ])

  addStatusRow(table, {
    symbol: "exclamationmark.circle.fill",
    title: "Version trop ancienne",
    detail: "Cette mise à jour est nécessaire pour continuer.",
    tone: COLORS.orange
  })

  addStatusRow(table, {
    symbol: "lock.shield.fill",
    title: "Données protégées",
    detail: "Vos PDF, vos archives et vos réglages sont conservés.",
    tone: COLORS.green
  })

  addSectionRow(table, "Actions")

  addActionRow(table, {
    symbol: "arrow.down.circle.fill",
    label: `Mettre à jour vers ${manifest.version}`,
    detail: `${manifestEntries(manifest).length} fichiers seront réinstallés`,
    tone: COLORS.orange,
    primary: true,
    onSelect: () => {
      choice = "install"
    }
  })

  addActionRow(table, {
    symbol: "stethoscope",
    label: "Diagnostic",
    detail: "Rapport complet, sans mettre à jour",
    onSelect: () => {
      choice = "diagnostic"
    }
  })

  addCreditRow(table)

  await table.present(true)

  return choice
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

  /*
   * Relu sur le disque, non supposé écrit. C'est cette relecture qui
   * autorise la relance : démarrer une exécution sur un fichier
   * incomplet ferait ouvrir une version qui n'existe pas. L'écriture
   * vérifie déjà la présence du fichier ; ici on vérifie son contenu.
   */
  const written = await readText(canonicalInstaller)

  if (!isInstallerSource(written) || installerVersion(written) !== version) {
    throw new Error(
      `CTS Installer ${version} n’a pas été correctement mis en place. Rien n’a été lancé.`
    )
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

/*
 * Restes d'écriture à la racine de Scriptable.
 *
 * writeText passe par « .download » puis met l'ancien fichier de côté
 * en « .rollback ». iOS peut arrêter l'installateur entre les deux : le
 * script disparaît alors de Scriptable et n'existe plus que sous son
 * nom de secours. Le widget ne balaie pas cet endroit — il n'a rien à y
 * faire, et là un fichier manquant ne se répare pas tout seul.
 *
 * Ce balayage passe APRÈS la synchronisation, donc après que GitHub a
 * eu sa chance de réécrire les fichiers. Ce qui manque encore à ce
 * stade manque vraiment : une copie de secours relisible reprend alors
 * sa place, ce qui sauve l'installation quand le réseau a lâché en
 * cours de route. Rien qui ne commence pas par « CTS » n'est touché.
 */
function sweepScriptResidue() {
  const removed = []
  const restored = []
  const preserved = []

  let names

  try {
    names = fm.listContents(docs)
  } catch (_) {
    return { removed, restored, preserved }
  }

  for (const name of Array.isArray(names) ? names : []) {
    const found = SCRIPT_RESIDUE.exec(String(name || ""))

    if (!found) continue

    const path = join(docs, name)
    const destination = join(docs, found[1])

    if (found[2] === "download" || fm.fileExists(destination)) {
      removeQuietly(path)
      removed.push(name)
      continue
    }

    let content

    try {
      content = fm.readString(path)
    } catch (_) {
      preserved.push(name)
      continue
    }

    if (!validateText(content, found[1]).valid) {
      preserved.push(name)
      continue
    }

    try {
      fm.move(path, destination)
      restored.push(found[1])
    } catch (_) {
      preserved.push(name)
    }
  }

  return { removed, restored, preserved }
}

function countScriptResidue() {
  let names

  try {
    names = fm.listContents(docs)
  } catch (_) {
    return 0
  }

  return (Array.isArray(names) ? names : []).filter(name =>
    SCRIPT_RESIDUE.test(String(name || ""))
  ).length
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
