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
 * Les trois actions du menu sont jouées : vérification, diagnostic,
 * désinstallation.
 */

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"
import * as ui from "./uitable-shim.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(here, "..", "..")
const installerPath = process.argv[2] || path.join(repository, "CTS Installer.js")

const SNAPSHOT = "6a3937ee112251d6093f6678710b6d80187f1085"
const manifest = JSON.parse(fs.readFileSync(path.join(repository, "version.json"), "utf8"))

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
    silent = false,
    preferences = false
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
  fs.mkdirSync(docs, { recursive: true })
  fs.writeFileSync(path.join(docs, "CTS Installer.js"), fs.readFileSync(installerPath))

  if (seed) {
    const root = path.join(docs, "CTS Dashboard")
    for (const name of manifest.scripts) {
      if (name === "CTS Installer.js") continue
      fs.writeFileSync(path.join(docs, name), repositoryFile(name))
    }
    for (const item of manifest.resources) {
      const target = path.join(root, item.destination)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, repositoryFile(item.name))
    }
    fs.mkdirSync(path.join(root, "Data"), { recursive: true })
    fs.writeFileSync(
      path.join(root, "Data", "installation.json"),
      JSON.stringify({
        dashboardVersion: manifest.version,
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
  }

  const failures = []
  const shown = []

  /*
   * L'erreur ne remonte pas à la console : main() la rattrape et l'affiche.
   * On observe donc ce que le conducteur verrait — le texte des alertes et
   * celui des lignes de table — puis on y cherche les signatures d'une
   * erreur d'exécution ou d'une opération avortée.
   */
  const RUNTIME_ERROR = /before initialization|is not defined|is not a function|undefined is not|Cannot read|null is not/i
  const ABORTED = /Opération impossible|Opération interrompue|Installation non validée/i

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
    present() {
      if (selections.length) {
        const actions = this.rows.filter(row => typeof row.onSelect === "function")
        const target = actions[selections.shift()]

        if (target) target.onSelect()
      }

      return Promise.resolve()
    }
  }

  const fileManager = {
    documentsDirectory: () => docs,
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
      fs.renameSync(from, to)
    },
    copy: (from, to) => fs.copyFileSync(from, to),
    downloadFileFromiCloud: async () => {},
    fileSize: target => Math.round(fs.statSync(target).size / 1024),
    modificationDate: target => fs.statSync(target).mtime,
    listContents: target => (fs.existsSync(target) ? fs.readdirSync(target) : [])
  }

  const sandbox = {
    console: {
      log: () => {},
      warn: () => {},
      error: message => failures.push(String(message))
    },
    Date,
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    Promise,
    RegExp,
    Error,
    isNaN,
    parseInt,
    parseFloat,
    encodeURIComponent,
    decodeURIComponent,
    setTimeout,
    /*
     * Scriptable planifie ses attentes avec Timer, pas avec setTimeout,
     * et son intervalle est exprimé en millisecondes.
     */
    Timer: class {
      static schedule(milliseconds, repeats, callback) {
        setTimeout(callback, milliseconds)
        return new this()
      }
      invalidate() {}
    },
    Color: ui.Color,
    Font: ui.Font,
    SFSymbol: ui.SFSymbol,
    UITable: RecordingTable,
    UITableRow: ui.UITableRow,
    Script: { name: () => "CTS Installer", complete: () => {} },
    Device: { systemVersion: () => "26.6" },
    Pasteboard: { copyString: value => shown.push(String(value)) },
    FileManager: { iCloud: () => fileManager, local: () => fileManager },
    /*
     * L'installateur importe CTS Storage à la demande, et uniquement
     * pour deux choses : relire le journal d'import, et lire ou écrire
     * les préférences d'affichage. Le doublon ne fournit ce module que
     * dans le scénario qui l'exige, pour que les autres continuent
     * d'éprouver le chemin où il manque.
     */
    importModule: name => {
      if (name === "CTS Storage" && preferencesStore) {
        return {
          loadPreferences: async () => ({ ...preferencesStore.value }),
          savePreferences: async value => {
            preferencesStore.value = { textScale: Number(value?.textScale) || 1 }
          }
        }
      }

      throw new Error("module absent")
    },
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
   * Le fichier est exécuté tel quel. `await main()` est conservé : c'est
   * précisément ce que ce test doit éprouver.
   */
  const source = fs.readFileSync(installerPath, "utf8")

  vm.createContext(sandbox)

  try {
    await vm.runInContext(
      `(async () => {\n${source.replace(/^await main\(\)$/m, "await main()")}\n})()`,
      sandbox,
      { filename: installerPath }
    )
  } catch (error) {
    failures.push(`exception non rattrapée : ${error.message}`)
  }

  for (const text of shown) {
    if (RUNTIME_ERROR.test(text)) failures.push(`erreur d'exécution affichée : ${text}`)
    else if (ABORTED.test(text)) failures.push(`opération avortée : ${text}`)
    else if (forbidden && forbidden.test(text)) {
      failures.push(`verdict injustifié sur une installation saine : ${text}`)
    }
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

  if (expected && !shown.some(text => expected.test(text))) {
    failures.push(`section attendue absente du rapport : ${expected}`)
  }

  if (throttle && networkAttempts <= throttle) {
    failures.push(
      `aucune reprise après ${throttle} réponse(s) 429 : ${networkAttempts} tentative(s)`
    )
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
  {
    label: "diagnostic",
    choice: 1,
    forbidden: /illisible|invalide|inaccessible|non résolu/i,
    expected: /DERNIÈRE EXÉCUTION DU DASHBOARD/
  },
  /*
   * L'écran de réglage vit entre le diagnostic et la désinstallation :
   * un ajout au menu déplace les suivants, et ce banc le voit.
   */
  { label: "taille du texte", choice: [2, 1], preferences: true, silent: true, expected: /Grandes polices/ },
  { label: "désinstallation", choice: 3 },
  { label: "installation neuve", choice: 0, seed: false, silent: true },
  /*
   * Une seule réponse 429 suffisait à rendre CTS Installer inutilisable,
   * alors que GitHub répond souvent correctement à la tentative
   * suivante. L'outil de réparation ne doit jamais être la panne.
   */
  { label: "reprise après un refus temporaire de GitHub", choice: 0, throttle: 1 }
]

let broken = false

for (const scenario of scenarios) {
  const failures = await runAction(scenario.label, scenario.choice, {
    seed: scenario.seed !== false,
    forbidden: scenario.forbidden || null,
    throttle: scenario.throttle || 0,
    expected: scenario.expected || null,
    silent: scenario.silent === true,
    preferences: scenario.preferences === true
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
