/*
 * Test de fumée de CTS Installer : exécute le fichier ENTIER, `await main()`
 * compris, sur des doublures, et refuse toute erreur d'exécution.
 *
 * Ce test existe à cause d'un bug réel. Une constante de premier niveau
 * déclarée sous `await main()` reste dans sa zone morte temporelle pendant
 * toute l'exécution ; la fonction qui l'utilise lève « Cannot access … before
 * initialization ». Ni la vérification syntaxique ni le banc de mesure ne
 * pouvaient le voir : le banc neutralise `await main()` et évalue donc le
 * fichier de bout en bout avant d'appeler quoi que ce soit, ce qui initialise
 * tout. Il fallait exécuter le fichier comme l'iPhone l'exécute.
 *
 * Chaque action du menu est jouée. Le Diagnostic et le retrait d'un
 * service le sont aussi contre les vrais modules du Dashboard, auxquels
 * l'installateur emprunte des fonctions : sur l'iPhone, les modules changent
 * à chaque révision du dépôt et l'installateur seulement quand son numéro
 * monte.
 */

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import * as ui from "./uitable-shim.mjs"
import { moduleSpace, repository, runScript, scriptableGlobals, timerDouble } from "./sandbox.mjs"

const installerPath = process.argv[2] || path.join(repository, "CTS Installer.js")

const SNAPSHOT = "6a3937ee112251d6093f6678710b6d80187f1085"

/*
 * Version d'installateur volontairement hors d'atteinte : les scénarios
 * de mise à jour imposée doivent rester valides quand la version réelle
 * avance, sans quoi ils cesseraient silencieusement de rien éprouver le
 * jour où elle les rattrape.
 */
const FUTURE = "1.9.9"
const manifest = JSON.parse(fs.readFileSync(path.join(repository, "version.json"), "utf8"))

/*
 * Le service enregistré des scénarios joués contre les vrais modules.
 * L'installateur leur passe l'horloge réelle : une date lointaine garde ce
 * service à venir, quel que soit le jour où le banc tourne.
 */
const INDEXED_SERVICE = { date: "2099-06-15", number: "EA06", end: "13:30" }

function repositoryFile(name) {
  const file = path.join(repository, name)
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null
}

/*
 * Chaque action du menu est jouée dans son propre système de fichiers, et
 * l'alerte répond toujours le même index — celui de l'action visée.
 */
async function runAction(
  label,
  choice,
  {
    seed = true,
    forbidden = null,
    throttle = 0,
    expected = null,
    absent = null,
    installedVersion = null,
    silent = false,
    preferences = false,
    residue = false,
    stale = null,
    corrupt = null,
    unreachable = null,
    truncated = null,
    log = null,
    installerAvailable = null,
    installerUpdated = false,
    installerOpened = false,
    installerMismatched = false,
    installerWriteBroken = false,
    relaunchUnavailable = false,
    reopens = false,
    closeDuringWrite = false,
    scriptName = "CTS Installer",
    runningWriteBroken = false,
    aborts = false,
    migration = false,
    dashboard = false
  } = {}
) {
  /*
   * Nombre de réponses 429 servies avant la première réponse utile, pour
   * rejouer une adresse mise de côté par GitHub.
   */
  let remainingThrottled = throttle
  let networkAttempts = 0
  const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cts-smoke-"))
  const docs = path.join(sandboxRoot, "Documents")
  /* La bibliothèque locale de Scriptable, où vivent les deux PDF.js. */
  const library = path.join(sandboxRoot, "Library")
  const PINNED = new Set(["pdf.min.mjs", "pdf.worker.min.mjs"])
  const pinnedTarget = item => path.join(library, "CTS Dashboard", item.destination)
  const legacyLibraries = path.join(docs, "CTS Dashboard", "Libraries")
  fs.mkdirSync(docs, { recursive: true })
  fs.writeFileSync(path.join(docs, "CTS Installer.js"), fs.readFileSync(installerPath))

  /*
   * Scriptable exécute le fichier qui porte le nom du script. Renommé, ce
   * n'est plus celui du manifeste — et c'est pourtant lui qui repartira à
   * la relance.
   */
  const runningInstaller = path.join(docs, `${scriptName}.js`)

  if (runningInstaller !== path.join(docs, "CTS Installer.js")) {
    fs.writeFileSync(runningInstaller, fs.readFileSync(installerPath))
  }

  if (seed) {
    const root = path.join(docs, "CTS Dashboard")
    for (const name of manifest.scripts) {
      if (name === "CTS Installer.js") continue
      fs.writeFileSync(path.join(docs, name), repositoryFile(name))
    }
    for (const item of manifest.resources) {
      /*
       * Une installation d'avant la 1.0.32 : les bibliothèques sont encore
       * dans iCloud, et rien n'est encore posé sur l'appareil.
       */
      const target = PINNED.has(item.name) && !migration
        ? pinnedTarget(item)
        : path.join(root, item.destination)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, repositoryFile(item.name))
    }
    fs.mkdirSync(path.join(root, "Data"), { recursive: true })
    fs.writeFileSync(
      path.join(root, "Data", "installation.json"),
      JSON.stringify({
        dashboardVersion: installedVersion || manifest.version,
        installerVersion: manifest.installerVersion,
        repositoryRevision: SNAPSHOT,
        files: { installed: [], updated: [], repaired: [], unchanged: [], failed: [] }
      })
    )
    /*
     * Trace laissée par le Dashboard à son dernier réveil. Le Diagnostic
     * doit savoir la relire : c'est la seule fenêtre dont on dispose sur
     * un widget qui ne s'affiche pas comme prévu.
     */
    fs.writeFileSync(
      path.join(root, "Data", "last-run.json"),
      JSON.stringify({
        at: "2026-08-18T15:12:00.000Z",
        version: manifest.version,
        surface: "widget",
        family: "large",
        elapsedMs: 1840,
        displayed: "Analyse en cours",
        source: "none",
        scan: "locked",
        detected: 0
      })
    )

    if (dashboard) {
      const stem = `Service_${INDEXED_SERVICE.date}_${INDEXED_SERVICE.number}`
      const cache = path.join(root, "Cache", "Services")

      fs.mkdirSync(path.join(root, "Services"), { recursive: true })
      fs.mkdirSync(path.join(cache, "Text"), { recursive: true })
      fs.writeFileSync(path.join(root, "Services", `${stem}.pdf`), "%PDF-1.7")
      fs.writeFileSync(
        path.join(cache, `${stem}.json`),
        JSON.stringify({
          date: INDEXED_SERVICE.date,
          service: INDEXED_SERVICE.number,
          validation: { valid: true, warnings: [] },
          slices: [{ dutyStart: "05:30", end: INDEXED_SERVICE.end }]
        })
      )
      fs.writeFileSync(path.join(cache, "Text", `${stem}.txt`), "texte extrait")
      fs.writeFileSync(
        path.join(root, "Data", "services-index.json"),
        JSON.stringify({
          version: 2,
          updatedAt: "",
          services: [
            {
              id: `${INDEXED_SERVICE.date}_${INDEXED_SERVICE.number}`,
              date: INDEXED_SERVICE.date,
              service: INDEXED_SERVICE.number,
              pdfFile: `${stem}.pdf`,
              cacheFile: `${stem}.json`,
              textFile: `${stem}.txt`,
              lastEnd: INDEXED_SERVICE.end,
              firstDutyStart: "05:30",
              indexedAt: "2099-06-14T18:00:00.000Z"
            }
          ]
        })
      )
    }
  }

  /*
   * Restes d'écriture à la racine de Scriptable.
   *
   * writeText passe par « .download » puis met l'ancien fichier de côté
   * en « .rollback ». Coupé entre les deux, le script disparaît de
   * Scriptable et n'existe plus que sous son nom de secours. Les deux
   * cas orphelins portent sur des scripts hors manifeste : la
   * synchronisation ne les recrée pas, donc c'est bien le balayage qui
   * décide de leur sort — remettre en place ce qui se relit, garder ce
   * qui ne se relit pas.
   */
  const legitimate = repositoryFile("CTS Utils.js")

  /*
   * Un fichier en retard sur GitHub. Il donne à l'opération une écriture
   * réelle, ce qu'une installation déjà saine ne fournit pas : sans elle,
   * un rapport ne peut pas porter à la fois une écriture et une erreur.
   */
  if (stale) {
    fs.writeFileSync(
      path.join(docs, stale),
      `${repositoryFile(stale)}\n// version en retard\n`
    )
  }

  /*
   * Bibliothèque PDF.js posée incomplète : un iCloud coupé en pleine copie
   * laisse un fichier lisible mais amputé. Aucun contrôle de forme ne le
   * voit — ni le vide, ni la page d'erreur, ni la longueur minimale d'un
   * script. Seul le plancher de taille le voit.
   */
  if (truncated) {
    const resource = manifest.resources.find(item => item.name === truncated)
    const target = pinnedTarget(resource)

    fs.writeFileSync(target, fs.readFileSync(target, "utf8").slice(0, 40 * 1024))
  }

  if (residue) {
    fs.writeFileSync(path.join(docs, "CTS Utils.js.download"), "moitié téléchargé")
    fs.writeFileSync(path.join(docs, "CTS Parser.js.rollback"), "ancienne version")
    fs.writeFileSync(path.join(docs, "CTS Simulator.js.rollback"), legitimate)
    fs.writeFileSync(path.join(docs, "CTS Cassé.js.rollback"), "x")
    fs.writeFileSync(path.join(docs, "Mes Notes.js.rollback"), "à moi")
  }

  /*
   * Journal d'import. Le Diagnostic le relit par CTS Storage, et c'est de
   * lui que sort le bloc des durées : sans entrée, ce bloc n'est jamais
   * construit et rien ne l'éprouve.
   */
  const logEntries = log
    ? [
        {
          timestamp: "2026-09-15T19:00:45.746Z",
          type: "exception",
          message: "Erreur pendant l’importation locale d’un PDF",
          details: log
        }
      ]
    : null

  const failures = []
  const shown = []
  const relaunched = []

  /*
   * L'erreur ne remonte pas à la console : main() la rattrape et l'affiche.
   * On observe donc ce que le conducteur verrait — le texte des alertes et
   * celui des lignes de table — puis on y cherche les signatures d'une
   * erreur d'exécution ou d'une opération avortée.
   */
  const RUNTIME_ERROR = /before initialization|is not defined|is not a function|undefined is not|Cannot read|null is not/i
  const ABORTED = /Opération impossible|Opération interrompue|Installation non validée|Mise à jour impossible/i

  /*
   * Le rapport technique n'est construit qu'au moment où le conducteur
   * touche « Copier le rapport ». On retient donc ces lignes pour les
   * déclencher après coup, sinon le rapport ne serait jamais éprouvé.
   */
  const selectable = []

  /*
   * Chaque tableau retient son propre texte. Le crédit doit accompagner
   * chaque écran de gestion, pas seulement apparaître une fois dans la
   * course : c'est la différence entre « présent quelque part » et
   * « présent partout où il doit l'être ».
   */
  const tables = []

  const alerted = []
  const preferencesStore = preferences ? { value: { textScale: 1 } } : null
  const selections = Array.isArray(choice) ? [...choice] : [choice]

  class RecordingTable extends ui.UITable {
    constructor() {
      super()
      this.recorded = []
      tables.push(this)
    }
    addRow(row) {
      for (const cell of row.cells || []) {
        if (cell.title) {
          shown.push(String(cell.title))
          this.recorded.push(String(cell.title))
        }
        if (cell.subtitle) {
          shown.push(String(cell.subtitle))
          this.recorded.push(String(cell.subtitle))
        }
      }
      if (typeof row.onSelect === "function") selectable.push(row)
      super.addRow(row)
    }

    /*
     * Le menu n'est plus une alerte système mais une UITable : on ne
     * répond plus un index, on désigne une ligne. La sélection est
     * consommée par la première table présentée — le menu — de sorte que
     * les pages suivantes, progression et diagnostic, restent intactes.
     */
    async present() {
      if (selections.length) {
        const actions = this.rows.filter(row => typeof row.onSelect === "function")
        const target = actions[selections[0]]

        /*
         * Le geste n'est consommé que s'il trouve une ligne. Un écran
         * intermédiaire — le diagnostic ouvert depuis le menu, par
         * exemple — n'a pas à avaler celui destiné à l'écran suivant,
         * sans quoi aucun scénario ne pourrait enchaîner deux actions et
         * le retour au menu resterait invérifiable.
         */
        /*
         * L'action est attendue avant que l'écran soit rendu fermé. Une
         * ligne qui redessine sa propre table travaille pendant que la
         * personne la regarde ; résoudre la présentation avant elle
         * simulerait un écran refermé au milieu de l'écriture, ce qu'aucun
         * geste réel ne fait ici.
         */
        /*
         * Une ligne qui referme l'écran le referme vraiment : sa
         * présentation se résout aussitôt, et ce que le gestionnaire
         * dessine ensuite ne s'affiche plus. Sans cela, le banc ne
         * distinguerait pas un écran redessiné sous les yeux de la
         * personne d'un écran disparu au moment de parler.
         *
         * Une ligne qui le garde ouvert travaille pendant qu'on la
         * regarde : la fermeture vient après, et c'est elle qu'on attend.
         */
        if (target) {
          selections.shift()

          const running = target.onSelect()
          const keepsOpen = target.dismissOnSelect === false

          if (keepsOpen && !closeDuringWrite) await running
        }
      }

      return Promise.resolve()
    }
  }

  const fileManager = {
    documentsDirectory: () => docs,
    libraryDirectory: () => library,
    joinPath: (a, b) => path.join(a, b),
    fileExists: target => fs.existsSync(target),
    isFileDownloaded: () => true,
    readString: target => fs.readFileSync(target, "utf8"),
    writeString: (target, content) => {
      fs.mkdirSync(path.dirname(target), { recursive: true })

      fs.writeFileSync(target, content)
    },
    createDirectory: target => fs.mkdirSync(target, { recursive: true }),
    remove: target => fs.rmSync(target, { recursive: true, force: true }),
    move: (from, to) => {
      fs.mkdirSync(path.dirname(to), { recursive: true })

      /*
       * L'écriture est atomique : temporaire, puis bascule. C'est donc la
       * bascule qu'il faut abîmer pour rejouer un fichier posé incomplet —
       * iCloud interrompu, écriture tronquée. Le contrôle de présence n'y
       * voit rien ; seule une relecture du contenu le voit.
       */
      if (runningWriteBroken && to === runningInstaller) {
        fs.writeFileSync(
          to,
          fs.readFileSync(from, "utf8").replace(/const INSTALLER_VERSION = "[^"]+"\n/, "")
        )
        fs.rmSync(from, { force: true })
        return
      }

      if (installerWriteBroken && to.endsWith("CTS Installer.js")) {
        fs.writeFileSync(
          to,
          fs.readFileSync(from, "utf8").replace(/const INSTALLER_VERSION = "[^"]+"\n/, "")
        )
        fs.rmSync(from, { force: true })
        return
      }

      fs.renameSync(from, to)
    },
    copy: (from, to) => fs.copyFileSync(from, to),
    downloadFileFromiCloud: async () => {},
    fileSize: target => Math.round(fs.statSync(target).size / 1024),
    modificationDate: target => fs.statSync(target).mtime,
    listContents: target => (fs.existsSync(target) ? fs.readdirSync(target) : [])
  }

  const globals = {
    console: {
      log: () => {},
      warn: () => {},
      error: message => failures.push(String(message))
    },
    setTimeout,
    /* Les délais entre deux tentatives réseau sont réellement attendus. */
    Timer: timerDouble({ delay: milliseconds => milliseconds }),
    Color: ui.Color,
    Font: ui.Font,
    SFSymbol: ui.SFSymbol,
    UITable: RecordingTable,
    UITableRow: ui.UITableRow,
    Script: { name: () => scriptName, complete: () => {} },
    Device: { systemVersion: () => "26.6" },
    Pasteboard: { copyString: value => shown.push(String(value)) },
    /*
     * La relance ouvre une URL Scriptable. La doublure ne relance rien —
     * elle enregistre l'intention, ce qui suffit à prouver qu'elle n'a
     * lieu qu'après un remplacement réellement abouti.
     */
    config: { runsInWidget: false },
    URLScheme: {
      forRunningScript: () =>
        relaunchUnavailable ? "about:blank" : "scriptable:///run/CTS%20Installer"
    },
    Safari: { open: url => relaunched.push(String(url)) },
    FileManager: { iCloud: () => fileManager, local: () => fileManager },
    Alert: class {
      constructor() {
        this.actions = []
      }
      addAction(t) {
        this.actions.push(t)
      }
      addCancelAction() {}
      addDestructiveAction(t) {
        this.actions.push(t)
      }
      set title(value) {
        shown.push(String(value))
        alerted.push(String(value))
        this._title = value
      }
      get title() {
        return this._title
      }
      set message(value) {
        shown.push(String(value))
        this._message = value
      }
      get message() {
        return this._message
      }
      /*
       * L'alerte d'erreur du script n'a qu'une action ; y répondre 0 est
       * sans effet. Les menus, eux, reçoivent l'index visé.
       */
      present() {
        return Promise.resolve(0)
      }
      presentSheet() {
        return Promise.resolve(choice)
      }
    },
    Request: class {
      constructor(url) {
        this.url = String(url)
        this.headers = {}
        this.response = { statusCode: 200 }
      }
      async loadString() {
        networkAttempts++

        if (remainingThrottled > 0) {
          remainingThrottled--
          this.response = { statusCode: 429 }
          return "429: Too Many Requests"
        }

        if (this.url.includes("api.github.com")) {
          return JSON.stringify({ sha: SNAPSHOT })
        }
        const match = this.url.match(/\/([^/?]+)(?:\?|$)/)
        const name = match ? decodeURIComponent(match[1]) : ""
        /*
         * GitHub sert parfois une page d'erreur avec un code 200 : une
         * panne de son côté, une redirection, un dépôt momentanément
         * indisponible. C'est le cas qui compte, parce qu'il ne se
         * signale par aucun code d'erreur.
         */
        if (corrupt && name === corrupt) {
          return "<!doctype html><html><body>GitHub is having a bad day</body></html>"
        }

        /*
         * Le dépôt ne répond pas pour ce fichier. « Je n'ai pas pu
         * vérifier » n'est pas « ce fichier diffère » : une panne de
         * réseau ne doit pas envoyer réparer ce qui n'est pas cassé.
         */
        if (unreachable && name === unreachable) {
          this.response = { statusCode: 500 }
          return "500: Internal Server Error"
        }

        /*
         * Le dépôt publie un installateur plus récent que celui posé sur
         * l'appareil. Les deux doivent concorder : updateInstaller
         * refuse un fichier dont la constante ne correspond pas au
         * manifeste, et c'est ce refus qui empêche une version bancale
         * de remplacer celle qui tourne.
         */
        if (installerAvailable && name === "version.json") {
          return JSON.stringify({ ...manifest, installerVersion: installerAvailable })
        }

        if (installerAvailable && name === "CTS Installer.js") {
          const source = fs.readFileSync(installerPath, "utf8")

          /*
           * Le dépôt annonce une version que le fichier servi ne porte
           * pas : une publication à moitié faite. Rien ne doit être posé,
           * et surtout rien ne doit être lancé.
           */
          if (installerMismatched) return source

          return source.replace(
            /const INSTALLER_VERSION = "[^"]+"/,
            `const INSTALLER_VERSION = "${installerAvailable}"`
          )
        }

        const content =
          name === "CTS Installer.js"
            ? fs.readFileSync(installerPath, "utf8")
            : repositoryFile(name)
        if (content === null) {
          this.response = { statusCode: 404 }
          return "404: Not Found"
        }
        return content
      }
    }
  }

  /*
   * Le code des modules vient du dépôt et non des copies posées dans le bac
   * à sable : c'est la version publiée que l'installateur doit trouver. Les
   * fichiers qu'ils lisent et écrivent sont, eux, ceux du bac à sable.
   */
  const dashboardModules = dashboard ? moduleSpace(globals) : null

  const sandbox = scriptableGlobals({
    ...globals,
    /*
     * L'installateur importe CTS Storage à la demande : pour relire le
     * journal d'import et l'index des services, et pour lire ou écrire les
     * préférences d'affichage. Le doublon ne fournit ce module que dans le
     * scénario qui l'exige, pour que les autres continuent d'éprouver le
     * chemin où il manque — sauf là où les vrais modules répondent.
     */
    importModule: name => {
      if (dashboardModules) return dashboardModules.load(name)

      if (name === "CTS Storage" && (preferencesStore || logEntries)) {
        const storage = {}

        if (preferencesStore) {
          storage.loadPreferences = async () => ({ ...preferencesStore.value })
          storage.savePreferences = async value => {
            preferencesStore.value = { textScale: Number(value?.textScale) || 1 }
          }
        }

        if (logEntries) {
          storage.loadLog = async () => logEntries
        }

        return storage
      }

      throw new Error("module absent")
    }
  })

  /*
   * Le fichier est exécuté tel quel. `await main()` est conservé : c'est
   * précisément ce que ce test doit éprouver.
   */
  try {
    await runScript("CTS Installer", sandbox, { source: fs.readFileSync(installerPath, "utf8") })
  } catch (error) {
    failures.push(`exception non rattrapée : ${error.message}`)
  }

  /*
   * Un abandon est normalement un échec du banc. Un scénario peut
   * déclarer qu'il en attend un — c'est alors son absence qui devient le
   * défaut, sans quoi un garde-fou retiré passerait pour un succès.
   */
  let aborted = false

  for (const text of shown) {
    if (RUNTIME_ERROR.test(text)) failures.push(`erreur d'exécution affichée : ${text}`)
    else if (ABORTED.test(text)) {
      aborted = true
      if (!aborts) failures.push(`opération avortée : ${text}`)
    } else if (forbidden && forbidden.test(text)) {
      failures.push(`verdict injustifié sur une installation saine : ${text}`)
    }
  }

  if (aborts && !aborted) {
    failures.push("l’opération aurait dû être refusée, elle est allée au bout")
  }

  if (expected) {
    for (const row of selectable) {
      const label = (row.cells || []).map(cell => cell.title || "").join(" ")
      if (!/Copier le rapport/i.test(label)) continue
      try {
        await row.onSelect()
      } catch (error) {
        failures.push(`rapport technique en erreur : ${error.message}`)
      }
    }
  }

  /*
   * Le crédit doit être identifiable sur les écrans de gestion : menu,
   * vérification, mise à jour, installation, diagnostic.
   */
  if (!shown.some(text => /Créé et développé par Emilio IPPOLITO/.test(text))) {
    failures.push("aucun crédit d'auteur affiché sur cet écran de gestion")
  }

  /*
   * « Données protégées » ferme chaque page de gestion : progression,
   * résultat, diagnostic. Le crédit doit la suivre partout.
   */
  for (const table of tables) {
    const text = table.recorded.join(" ")

    if (!/Données protégées/.test(text)) continue

    if (!/Créé et développé par Emilio IPPOLITO/.test(text)) {
      failures.push("une page de gestion ne porte pas le crédit d'auteur")
    }
  }

  /*
   * Une opération qui aboutit se raconte dans la nouvelle interface, et
   * nulle part ailleurs. Les alertes qui doublaient l'écran — la
   * confirmation avant contrôle, l'avis après remplacement de
   * l'installateur — ont été retirées ; ce garde empêche qu'une
   * équivalente revienne. Seules les erreurs et la désinstallation, qui
   * exige un accord explicite, ont encore le droit d'interrompre.
   */
  if (preferencesStore && Math.abs(preferencesStore.value.textScale - 1.25) > 0.01) {
    failures.push(
      `réglage non enregistré : textScale ${preferencesStore.value.textScale} au lieu de 1,25`
    )
  }

  if (silent && alerted.length) {
    failures.push(`alerte superflue après l’opération : ${alerted.join(" · ")}`)
  }

  for (const pattern of expected ? [].concat(expected) : []) {
    if (!shown.some(text => pattern.test(text))) {
      failures.push(`section attendue absente du rapport : ${pattern}`)
    }
  }

  if (absent && shown.some(text => absent.test(text))) {
    failures.push(`écran qui n’aurait pas dû être atteint : ${absent}`)
  }

  if (throttle && networkAttempts <= throttle) {
    failures.push(
      `aucune reprise après ${throttle} réponse(s) 429 : ${networkAttempts} tentative(s)`
    )
  }

  if (residue) {
    const here = name => fs.existsSync(path.join(docs, name))

    if (here("CTS Utils.js.download")) {
      failures.push("un téléchargement inachevé survit au balayage")
    }

    if (here("CTS Parser.js.rollback")) {
      failures.push("une copie de secours survit alors que son script est en place")
    }

    if (!here("CTS Utils.js") || !here("CTS Parser.js")) {
      failures.push("le balayage a emporté un script réel")
    }

    if (here("CTS Simulator.js.rollback") || !here("CTS Simulator.js")) {
      failures.push("un script absent n’a pas été remis en place depuis sa copie de secours")
    } else if (fs.readFileSync(path.join(docs, "CTS Simulator.js"), "utf8") !== legitimate) {
      failures.push("le script remis en place ne porte pas le contenu de la copie de secours")
    }

    if (!here("CTS Cassé.js.rollback") || here("CTS Cassé.js")) {
      failures.push("une copie de secours illisible a été remise en place ou supprimée")
    }

    if (!here("Mes Notes.js.rollback")) {
      failures.push("le balayage a touché un fichier qui n’appartient pas au projet")
    }
  }

  /*
   * Le fichier en place valait mieux que ce que GitHub vient de servir :
   * il doit être encore là, intact. Le refus doit par ailleurs être dit,
   * sans quoi l'échec passerait pour une réussite.
   */
  if (corrupt) {
    const target = path.join(docs, corrupt)
    const onDisk = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null

    if (onDisk !== repositoryFile(corrupt)) {
      failures.push(`une page d’erreur GitHub a remplacé ${corrupt}`)
    }

    if (!shown.some(text => /1 erreur/i.test(text))) {
      failures.push("le fichier refusé n’a pas été signalé comme une erreur")
    }
  }

  /*
   * La mise à jour de l'installateur est imposée. Ce qui compte n'est pas
   * l'absence du bouton mais l'impossibilité de rendre la main sans
   * mettre à jour : le menu ne doit être atteint par aucun chemin, et le
   * fichier sur le disque doit refléter exactement ce qui a été choisi.
   */
  /*
   * La relance se compte, partout et pour tous les scénarios. Un scénario
   * qui ne l'attend pas doit en observer zéro : c'est la seule façon de
   * voir une réouverture qui déborde sur une opération à laquelle elle
   * n'appartient pas — une vérification sans écriture, une désinstallation.
   */
  const expectedRelaunches = (reopens || installerOpened) && !relaunchUnavailable ? 1 : 0

  if (relaunched.length !== expectedRelaunches) {
    failures.push(
      `${expectedRelaunches} relance(s) attendue(s), ${relaunched.length} observée(s)`
    )
  }

  /*
   * Une réouverture qui n'a pas été annoncée surprend : l'installateur
   * semblerait redémarrer tout seul. Les deux chemins l'annoncent, chacun
   * avec sa raison — le remplacement de l'installateur lui-même, ou la
   * mise à jour des fichiers du Dashboard.
   */
  if (reopens && !shown.some(text => /s’ouvrira à nouveau sur l’état mis à jour/.test(text))) {
    failures.push("la réouverture après mise à jour n’a pas été annoncée avant d’être faite")
  }

  if (!reopens && shown.some(text => /s’ouvrira à nouveau sur l’état mis à jour/.test(text))) {
    failures.push("une réouverture a été annoncée alors qu’elle n’aura pas lieu")
  }

  /*
   * Refusée, la relance ne laisse personne coincé : le message dit ce
   * qu'il reste à faire, exactement comme avant qu'elle existe.
   */
  if (
    reopens &&
    relaunchUnavailable &&
    !shown.some(text => /Relancez CTS Installer depuis la liste des scripts/.test(text))
  ) {
    failures.push("relance impossible après mise à jour sans que l’utilisateur soit prévenu")
  }

  if (installerAvailable) {
    if (installerUpdated && !shown.some(text => /Fermez cet écran pour continuer/.test(text))) {
      failures.push("la réouverture n’a pas été annoncée avant d’être faite")
    }

    /*
     * Un seul écran pour toute la mise à jour. Il ne se referme pas pour
     * laisser la place à une page de résultat : il se redessine. Deux
     * tables présentées signifieraient le retour de l'écran surgi de
     * nulle part.
     */
    if (installerUpdated) {
      if (tables.length !== 1) {
        failures.push(
          `${tables.length} écrans pour une mise à jour de l’installateur, un seul attendu`
        )
      }

      const first = tables[0]?.recorded || []

      if (!first.some(text => /Mise à jour requise/.test(text))) {
        failures.push("l’écran de mise à jour n’a jamais posé sa question")
      }

      if (!first.some(text => /Mise à jour installée/.test(text))) {
        failures.push("le résultat s’affiche ailleurs que sur l’écran déjà ouvert")
      }
    }

    /*
     * L'écran refermé pendant l'écriture. Elle va au bout — la couper
     * laisserait un fichier à moitié posé — mais le délai que la page
     * fabrique n'a pas eu lieu : rien n'est lancé, et c'est dit.
     */
    if (closeDuringWrite) {
      const onDisk = fs.readFileSync(path.join(docs, "CTS Installer.js"), "utf8")

      if (!onDisk.includes(`const INSTALLER_VERSION = "${installerAvailable}"`)) {
        failures.push("l’écriture a été coupée par la fermeture de l’écran")
      }

      if (!alerted.some(text => /Mise à jour installée/.test(text))) {
        failures.push("le remplacement fait sans témoin n’a pas été signalé")
      }
    }

    if (
      relaunchUnavailable &&
      installerUpdated &&
      !shown.some(text => /Relancez-le depuis la liste des scripts/.test(text))
    ) {
      failures.push("relance impossible sans que l’utilisateur soit prévenu")
    }

    if (shown.some(text => /Continuer avec/.test(text))) {
      failures.push("le contournement « Continuer avec » est encore proposé")
    }

    const onDisk = fs.readFileSync(path.join(docs, "CTS Installer.js"), "utf8")
    const replaced = onDisk.includes(`const INSTALLER_VERSION = "${installerAvailable}"`)

    /*
     * Le script renommé est celui que Scriptable exécute, donc celui qui
     * repartira. Le laisser en arrière rouvrirait l'ancienne version en
     * annonçant la nouvelle ; ne vérifier que celui du manifeste ne
     * prouvait rien là où ça compte.
     */
    if (installerUpdated && runningInstaller !== path.join(docs, "CTS Installer.js")) {
      const running = fs.readFileSync(runningInstaller, "utf8")

      if (!running.includes(`const INSTALLER_VERSION = "${installerAvailable}"`)) {
        failures.push("le fichier réellement exécuté est resté en arrière")
      }
    }

    if (installerUpdated && !replaced) {
      failures.push("l’installateur n’a pas été remplacé alors que la mise à jour a été acceptée")
    }

    /*
     * Une mise à jour refusée ne doit rien avoir écrit. Une mise à jour
     * acceptée mais avortée, si : le fichier du manifeste part le premier,
     * et c'est le second qui fait échouer la vérification. Ce qui compte
     * alors n'est pas ce qui est sur le disque mais que rien ne parte.
     */
    if (!installerUpdated && !aborts && replaced) {
      failures.push("l’installateur a été remplacé sans que la mise à jour ait été demandée")
    }
  }

  /*
   * Les bibliothèques quittent iCloud pour l'appareil. Les nouvelles
   * copies doivent être en place, et les anciennes parties : garder les
   * deux, c'est payer deux fois 1,8 Mo et laisser croire qu'iCloud sert
   * encore.
   */
  if (migration) {
    for (const item of manifest.resources.filter(entry => PINNED.has(entry.name))) {
      if (!fs.existsSync(pinnedTarget(item))) {
        failures.push(`${item.name} n'a pas été posé sur l'appareil`)
      }
    }

    if (fs.existsSync(legacyLibraries)) {
      failures.push("les anciennes bibliothèques restent dans iCloud après la migration")
    }
  }

  fs.rmSync(sandboxRoot, { recursive: true, force: true })
  return [...new Set(failures)]
}

/*
 * Le diagnostic d'une installation saine ne doit accuser personne. Un
 * contrôle qui se déclare en erreur ne plante pas, ne s'affiche pas
 * comme une panne, et passait donc inaperçu : c'est ainsi qu'un appel à
 * verifyRepository() sans son argument a pu annoncer « manifeste
 * illisible » à un conducteur dont tout allait bien.
 */
const scenarios = [
  { label: "vérification", choice: 0, silent: true },
  /*
   * Le balayage remet en place un script retrouvé sous son nom de
   * secours : c'est une écriture réelle, portée au rapport comme une
   * réparation. Elle rouvre donc, au même titre qu'une mise à jour.
   */
  {
    label: "restes d’écriture à la racine",
    choice: 0,
    silent: true,
    residue: true,
    reopens: true
  },
  {
    label: "diagnostic",
    choice: 1,
    forbidden: /illisible|invalide|inaccessible|non résolu/i,
    expected: [/DERNIÈRE EXÉCUTION DU DASHBOARD/, /17\/17 scripts conformes au dépôt/]
  },
  /*
   * Un script resté en arrière passe tous les contrôles locaux : présent,
   * non vide, pas une page d'erreur GitHub. C'est ainsi qu'une
   * installation périmée a pu se déclarer « à jour » pendant des semaines
   * pendant que le widget exécutait du code d'un autre mois. Le nom du
   * fichier fautif est ce qui manquait pour savoir quoi réparer.
   */
  {
    label: "script en retard nommé par le diagnostic",
    choice: 1,
    stale: "CTS Parser.js",
    expected: [
      /1 script ne correspond pas au dépôt/,
      /CTS Parser\.js — diffère de la version publiée/
    ]
  },
  /*
   * Le dépôt injoignable pour un fichier rend la conformité inconnue, pas
   * fausse. Confondre les deux ferait réinstaller sur une coupure réseau.
   */
  {
    label: "dépôt injoignable : conformité inconnue, pas divergente",
    choice: 1,
    unreachable: "CTS Parser.js",
    expected: [/conformité non vérifiée sur 1 script/, /CTS Parser\.js — non vérifié/],
    absent: /ne correspond pas au dépôt/
  },
  /*
   * Les deux bibliothèques PDF.js sont les seuls fichiers que la
   * synchronisation ne recompare pas au dépôt : leur taille est tout ce
   * qui les sépare d'un fichier tronqué. Le Diagnostic doit appliquer le
   * même plancher, et dire qu'il ne juge que celui-là.
   */
  {
    label: "bibliothèque PDF.js tronquée refusée par le diagnostic",
    choice: 1,
    truncated: "pdf.min.mjs",
    expected: [/4\/5 ressources valides/, /pdf\.min\.mjs/]
  },
  /*
   * Une étape qui n'a pas tourné n'a pas de durée. `Number(null)` valant
   * zéro, les six étapes d'un import qui n'en avait commencé aucune se
   * rapportaient « 0 ms » — six mesures instantanées là où il n'y en avait
   * aucune.
   */
  {
    label: "durée absente dite absente",
    choice: 1,
    log: {
      error: "Le moteur PDF ne s’est pas initialisé.",
      details: { name: "Error", message: "Le moteur PDF ne s’est pas initialisé.", stack: "" }
    },
    expected: [/Inspection PDF : non terminée/, /Total : non terminée/]
  },
  /*
   * Et une étape qui a tourné garde sa mesure, dans le même rapport : ce
   * qui s'était perdu n'est pas le zéro, c'est la distinction entre les
   * deux.
   */
  {
    label: "durée mesurée et durée absente distinguées",
    choice: 1,
    log: {
      telemetryCode: "PDF_EXTRACTION_FAILED",
      telemetryStage: "extraction",
      error: "L’extraction du texte du PDF a échoué.",
      details: {
        name: "TypeError",
        message: "L’extraction du texte du PDF a échoué.",
        stack: "extract@blob"
      },
      timings: {
        sourceInspectionMs: 12,
        pdfExtractionMs: 2100,
        databaseReloadMs: null,
        parserMs: null,
        registrationMs: null,
        totalMs: 2140
      }
    },
    expected: [
      /Inspection PDF : 12 ms/,
      /Extraction PDF : 2100 ms/,
      /Base CTS : non terminée/,
      /Total : 2140 ms/
    ]
  },
  /*
   * L'écran de réglage vit entre le diagnostic et la désinstallation :
   * un ajout au menu déplace les suivants, et ce banc le voit.
   */
  { label: "taille du texte", choice: [2, 1], preferences: true, silent: true, expected: /Grandes polices/ },
  /*
   * Les lignes du menu se désignent par leur rang : tout ajout décale
   * les suivantes. « Retirer un service » s'est inséré en quatrième
   * position, et la désinstallation a glissé d'un cran — un scénario qui
   * garde l'ancien rang teste silencieusement la mauvaise action. Les
   * deux portent donc désormais un motif qui prouve ce qu'elles ont
   * réellement exécuté.
   */
  /*
   * Ici les modules du Dashboard sont absents du bac à sable, et c'est
   * l'intérêt : le retrait doit le dire et s'arrêter, jamais planter. La
   * suppression elle-même est éprouvée par removal-smoke, qui monte le
   * vrai nettoyeur.
   */
  {
    label: "retrait d’un service sans le Dashboard installé",
    choice: 3,
    expected: /CTS Services Cleaner est absent/
  },
  /*
   * Les deux chemins qu'un relais retiré de CTS Importer a coupés le
   * 23 septembre, sans qu'aucun banc ne le voie : celui-ci remplaçait
   * chaque module par une absence. Joués ici contre les vrais modules, ils
   * échouent dès qu'une fonction empruntée disparaît.
   */
  {
    label: "index des services lu par le diagnostic",
    choice: 1,
    dashboard: true,
    expected: /\[OK\] Index des services — 1 service indexé/
  },
  {
    label: "retrait d’un service par les vrais modules",
    choice: [3, 0],
    dashboard: true,
    expected: [/Service retiré/, /3 fichiers supprimés/]
  },
  { label: "désinstallation", choice: 4, expected: /Désinstallation (terminée|partielle)/ },
  /*
   * Une installation neuve écrit tout : elle rouvre donc. La réouverture
   * ne suit plus le seul remplacement de l'installateur par lui-même —
   * toute mise à jour qui a réellement écrit repart sur l'état obtenu.
   */
  { label: "installation neuve", choice: 0, seed: false, silent: true, reopens: true },
  /*
   * Une installation d'avant la 1.0.32 garde ses bibliothèques dans iCloud.
   * La vérification suivante les pose sur l'appareil, puis retire les
   * anciennes : c'est une écriture réelle, qui rouvre.
   */
  {
    label: "bibliothèques PDF.js déplacées d'iCloud vers l'appareil",
    choice: 0,
    silent: true,
    reopens: true,
    migration: true
  },
  /*
   * Rien n'a été écrit : rien à rouvrir. Sans cette borne, ouvrir
   * l'installateur pour vérifier ses fichiers le relancerait à chaque
   * passage, sans qu'aucune raison ne le justifie.
   */
  { label: "aucune réouverture sans écriture", choice: 0, silent: true, reopens: false },
  /*
   * Un fichier en erreur interdit la réouverture. Repartir comme si de
   * rien n'était ferait passer une installation incomplète pour une
   * réussite : l'ouverture est la façon dont l'outil dit « c'est fait ».
   */
  {
    label: "aucune réouverture si un fichier a échoué",
    choice: 0,
    stale: "CTS Parser.js",
    corrupt: "CTS Utils.js",
    reopens: false,
    expected: /1 erreur/
  },
  /*
   * Le système refuse d'ouvrir l'URL. L'écran a promis une réouverture :
   * la consigne doit prendre le relais, sans quoi la promesse reste en
   * l'air.
   */
  {
    label: "réouverture impossible : la consigne prend le relais",
    choice: 0,
    seed: false,
    reopens: true,
    relaunchUnavailable: true
  },
  /*
   * La nouvelle exécution reprend tout : l'ancienne doit s'arrêter là.
   * Sans cela, deux instances vivraient en même temps et le menu de
   * l'ancienne reviendrait par-dessus la nouvelle — ici, la seconde
   * sélection ne doit jamais être atteinte.
   */
  {
    label: "l’ancienne exécution s’arrête après la réouverture",
    choice: [0, 4],
    seed: false,
    silent: true,
    reopens: true,
    absent: /Désinstallation/
  },
  /*
   * Une page d'erreur servie en 200 ne doit jamais atteindre le disque.
   * Le contenu reçu n'est retenu qu'une fois validé : l'affecter avant le
   * contrôle faisait sortir la boucle de reprise avec la page en main, et
   * le bon fichier était écrasé par elle.
   */
  {
    label: "page d’erreur GitHub refusée avant écriture",
    choice: 0,
    corrupt: "CTS Utils.js",
    expected: /Vérification terminée/
  },
  /*
   * Une seule réponse 429 suffisait à rendre CTS Installer inutilisable,
   * alors que GitHub répond souvent correctement à la tentative
   * suivante. L'outil de réparation ne doit jamais être la panne.
   */
  { label: "reprise après un refus temporaire de GitHub", choice: 0, throttle: 1 },
  /*
   * Second verrou : une installation en retard ne doit pas pouvoir
   * atteindre le menu. C'est le seul contrôle qui rattrape les versions
   * trop anciennes pour se surveiller elles-mêmes, puisque ce n'est plus
   * leur code qui décide.
   *
   * Le Diagnostic reste joignable sans mettre à jour : il est la
   * procédure d'assistance du projet, et l'exiger après la mise à jour
   * couperait la ligne de secours au moment où elle sert.
   */
  {
    label: "mise à jour imposée sur une version en retard",
    choice: 1,
    installedVersion: "1.0.4",
    expected: [/Version trop ancienne/, /DERNIÈRE EXÉCUTION DU DASHBOARD/],
    absent: /Désinstaller/
  },
  /*
   * Premier verrou, et le seul qui protège les versions trop anciennes
   * pour se surveiller elles-mêmes : une fois l'installateur dépassé,
   * aucun chemin ne rend la main. « Désinstaller » n'appartient qu'au
   * menu ; l'y voir signifierait que le fonctionnement normal a été
   * atteint sans mettre à jour.
   */
  {
    label: "mise à jour de l’installateur acceptée",
    choice: 0,
    installerAvailable: FUTURE,
    installerUpdated: true,
    installerOpened: true,
    expected: [/Mise à jour requise/, /Installer 1\.9\.9/],
    absent: /Désinstaller|Continuer avec/
  },
  /*
   * Publication à moitié faite : le manifeste annonce une version que le
   * fichier servi ne porte pas. Le remplacement est refusé, et rien n'est
   * lancé — ouvrir une version qui n'existe pas serait pire que ne rien
   * faire.
   */
  {
    label: "aucune relance si le remplacement échoue",
    choice: 0,
    installerAvailable: FUTURE,
    installerMismatched: true,
    aborts: true,
    absent: /Désinstaller|Continuer avec/
  },
  /*
   * Le fichier reçu était bon, celui posé ne l'est pas. L'écriture dit
   * avoir réussi, la relecture dit le contraire : c'est elle qui décide,
   * et rien n'est lancé.
   */
  {
    label: "aucune relance si le fichier posé est incomplet",
    choice: 0,
    installerAvailable: FUTURE,
    installerWriteBroken: true,
    aborts: true,
    absent: /Désinstaller|Continuer avec/
  },
  /*
   * Le système refuse d'ouvrir l'URL. Le remplacement a bien eu lieu :
   * l'utilisateur doit repartir avec la consigne, pas avec un écran muet.
   */
  {
    label: "relance impossible : la consigne prend le relais",
    choice: 0,
    installerAvailable: FUTURE,
    installerUpdated: true,
    installerOpened: true,
    relaunchUnavailable: true,
    absent: /Désinstaller|Continuer avec/
  },
  /*
   * L'écran est refermé pendant que le fichier s'écrit. Le remplacement
   * va au bout, mais rien n'est lancé : le délai que la page fabrique n'a
   * pas eu lieu, et Scriptable ne retrouverait pas encore le script par
   * son nom. Ouvrir alors ne ferait rien, et sans rien dire.
   */
  {
    label: "écran refermé pendant l’écriture",
    choice: 0,
    installerAvailable: FUTURE,
    installerUpdated: true,
    closeDuringWrite: true,
    absent: /Désinstaller|Continuer avec/
  },
  /*
   * Le script a été renommé dans Scriptable : le fichier exécuté n'est
   * plus celui du manifeste. Les deux doivent être remplacés, sans quoi la
   * relance rouvrirait l'ancienne version en annonçant la nouvelle.
   */
  {
    label: "script renommé : le fichier exécuté est remplacé aussi",
    choice: 0,
    scriptName: "CTS Installeur",
    installerAvailable: FUTURE,
    installerUpdated: true,
    installerOpened: true,
    absent: /Désinstaller|Continuer avec/
  },
  /*
   * Et s'il est posé incomplet, rien ne part : vérifier le fichier du
   * manifeste puis lancer l'autre ne prouvait rien.
   */
  {
    label: "script renommé : le fichier exécuté posé incomplet arrête tout",
    choice: 0,
    scriptName: "CTS Installeur",
    installerAvailable: FUTURE,
    runningWriteBroken: true,
    aborts: true,
    absent: /Désinstaller|Continuer avec/
  },
  {
    label: "aucun contournement en fermant l’écran",
    choice: 9,
    installerAvailable: FUTURE,
    absent: /Désinstaller|Continuer avec/
  },
  /*
   * Le Diagnostic n'ouvre aucune fonction et ramène à la porte : c'est la
   * seule façon de signaler une panne quand c'est la mise à jour
   * elle-même qui échoue.
   */
  {
    label: "diagnostic joignable sans mettre à jour",
    choice: [1, 9, 9],
    installerAvailable: FUTURE,
    expected: [/Mise à jour requise/, /DERNIÈRE EXÉCUTION DU DASHBOARD/],
    absent: /Désinstaller|Continuer avec/
  },
  /*
   * Retour au menu. Deux actions différentes dans une seule exécution :
   * la seconde n'est atteignable que si le menu est revenu après la
   * première. Sans la boucle, seule la première s'exécuterait, et rien
   * dans le rapport ne porterait la trace de la seconde.
   */
  {
    label: "retour au menu après une action",
    choice: [1, 3],
    expected: [/DERNIÈRE EXÉCUTION DU DASHBOARD/, /CTS Services Cleaner est absent/]
  },
  /*
   * Fermer le menu principal ferme l'installateur : la boucle doit
   * s'arrêter là, sans quoi elle tournerait sans fin.
   */
  {
    label: "fermer le menu arrête l’installateur",
    choice: 9,
    absent: /DERNIÈRE EXÉCUTION DU DASHBOARD|Désinstallation/
  },
  {
    label: "menu accessible sur une installation à jour",
    choice: 1,
    expected: /DERNIÈRE EXÉCUTION DU DASHBOARD/,
    absent: /Version trop ancienne/
  }
]

let broken = false

for (const scenario of scenarios) {
  const failures = await runAction(scenario.label, scenario.choice, {
    seed: scenario.seed !== false,
    forbidden: scenario.forbidden || null,
    throttle: scenario.throttle || 0,
    expected: scenario.expected || null,
    absent: scenario.absent || null,
    installedVersion: scenario.installedVersion || null,
    silent: scenario.silent === true,
    preferences: scenario.preferences === true,
    residue: scenario.residue === true,
    stale: scenario.stale || null,
    corrupt: scenario.corrupt || null,
    unreachable: scenario.unreachable || null,
    truncated: scenario.truncated || null,
    log: scenario.log || null,
    installerAvailable: scenario.installerAvailable || null,
    installerUpdated: scenario.installerUpdated === true,
    installerOpened: scenario.installerOpened === true,
    installerMismatched: scenario.installerMismatched === true,
    installerWriteBroken: scenario.installerWriteBroken === true,
    relaunchUnavailable: scenario.relaunchUnavailable === true,
    reopens: scenario.reopens === true,
    closeDuringWrite: scenario.closeDuringWrite === true,
    scriptName: scenario.scriptName || "CTS Installer",
    runningWriteBroken: scenario.runningWriteBroken === true,
    aborts: scenario.aborts === true,
    migration: scenario.migration === true,
    dashboard: scenario.dashboard === true
  })

  if (failures.length) {
    broken = true
    console.log(`ÉCHEC  ${scenario.label}`)
    for (const failure of failures) console.log(`         ${failure}`)
  } else {
    console.log(`ok     ${scenario.label}`)
  }
}

process.exit(broken ? 1 : 0)
