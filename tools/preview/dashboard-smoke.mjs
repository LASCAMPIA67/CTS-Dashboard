/*
 * Exécution réelle de CTS Dashboard.js, le point d'entrée du widget.
 *
 * Ce banc existe parce qu'il manquait. La 1.0.22 a été publiée avec une
 * variable déclarée après `await main()` : inaccessible pendant toute
 * l'exécution, elle faisait échouer le widget entier sur « Cannot access
 * 'runTrace' before initialization ». La syntaxe était valable, les
 * modules se chargeaient, la CI était verte — parce que rien n'exécutait
 * jamais le point d'entrée.
 *
 * C'est exactement le défaut qui avait tué l'installateur 1.0.7, et il
 * avait alors reçu son banc. Le widget, lui, n'en avait pas.
 *
 * On rejoue donc le fichier tel quel, `await main()` compris, dans les
 * deux contextes où il tourne : le widget et l'application.
 */

import * as shim from "./scriptable-shim.mjs"
import { moduleSpace, runScript, timerDouble } from "./sandbox.mjs"
const failures = []

function createFileManager(disk) {
  return {
    joinPath: (parent, child) => `${parent}/${child}`,
    documentsDirectory: () => "/documents",
    fileExists: target => disk.has(target) || target.endsWith("/"),
    isFileDownloaded: () => true,
    downloadFileFromiCloud: async () => {},
    readString: target => {
      if (!disk.has(target)) throw new Error(`fichier absent : ${target}`)
      return disk.get(target)
    },
    writeString: (target, value) => disk.set(target, String(value)),
    remove: target => disk.delete(target),
    move: () => {},
    createDirectory: () => {},
    listContents: () => [],
    isDirectory: () => false,
    fileSize: () => 1,
    modificationDate: () => new Date()
  }
}

/*
 * L'heure est figée.
 *
 * Le service semé va de 05:30 à 12:55. Tant que le banc lisait l'horloge
 * réelle, il éprouvait un service en cours le matin et un service terminé
 * l'après-midi — deux contextes différents, donc deux rendus différents,
 * pour le même code. Le banc passait ou échouait selon l'heure du commit,
 * ce qui est la pire forme d'échec : celle qu'on met sur le compte du
 * hasard.
 *
 * 09:00 heure locale place le service en pleine exploitation, le cas
 * nominal que ce banc doit couvrir. Les cas de bord horaires relèvent de
 * CTS Simulator, sur l'iPhone, pas d'ici.
 */
const ACCESSORY = ["accessoryRectangular", "accessoryCircular", "accessoryInline"]

const FROZEN_NOW = new Date(2026, 7, 19, 9, 0, 0)

class FrozenDate extends Date {
  constructor(...args) {
    if (args.length === 0) {
      super(FROZEN_NOW.getTime())
      return
    }

    super(...args)
  }

  static now() {
    return FROZEN_NOW.getTime()
  }
}

function collectText(node) {
  if (!node || typeof node !== "object") return ""

  const own = node.kind === "text" ? `${node.value} ` : ""
  const children = Array.isArray(node.children) ? node.children : []

  return own + children.map(collectText).join("")
}

/*
 * Un service réel, déposé là où le moteur va réellement le chercher :
 * une entrée dans Data/services-index.json et son cache dans
 * Cache/Services. C'est le seul chemin depuis que Data/service.json a
 * disparu — il n'était plus écrit par personne.
 *
 * Il permet d'éprouver le fonctionnement nominal — contexte valide,
 * grande carte — et donc le routage par famille, que la carte d'erreur
 * court-circuite.
 */
function seedService(disk, today) {
  const iso = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0")
  ].join("-")

  const stem = `Service_${iso}_EA05`

  disk.set("/documents/CTS Dashboard/Data/services-index.json", JSON.stringify({
    version: 2,
    updatedAt: new Date().toISOString(),
    services: [{
      id: stem,
      date: iso,
      service: "EA05",
      pdfFile: `${stem}.pdf`,
      cacheFile: `${stem}.json`,
      textFile: `${stem}.txt`,
      importedAt: new Date().toISOString(),
      indexedAt: new Date().toISOString(),
      warnings: 0,
      slices: 1
    }]
  }))

  disk.set(`/documents/CTS Dashboard/Cache/Services/${stem}.json`, JSON.stringify({
    service: "EA05",
    date: iso,
    driver: { name: "", id: "" },
    slices: [{
      index: 1,
      lineCode: "10",
      line: "10",
      vehicle: "5",
      dutyStart: "05:30",
      operationStart: "05:48",
      end: "12:40",
      dutyEnd: "12:55",
      startPlaceCode: "CRB",
      startPlace: "Cronenbourg",
      endPlaceCode: "ELS",
      endPlace: "Elsau",
      depotExitAt: "05:40",
      depotReturnAt: "12:50",
      lineUpAt: "",
      direction: "Elsau"
    }],
    breaks: [],
    validation: { valid: true, errors: [], warnings: [] }
  }))
}

async function run(surface, { family = "large", label = surface, service = false } = {}) {
  const disk = new Map()
  const fileManager = createFileManager(disk)
  const widgetsSet = []
  const presented = []
  const runsInWidget = surface === "widget"

  if (service) seedService(disk, FROZEN_NOW)

  const globals = {
    FileManager: { iCloud: () => fileManager, local: () => fileManager },
    Date: FrozenDate,
    Intl,
    config: { runsInWidget, widgetFamily: runsInWidget ? family : null },
    args: { plainTexts: [], shortcutParameter: null },
    Device: { screenSize: () => new shim.Size(430, 932), systemVersion: () => "27.0" },
    Keychain: {
      contains: () => false,
      get: () => "",
      set: () => {},
      remove: () => {}
    },
    Request: class {
      constructor(url) { this.url = String(url); this.headers = {} }
      async loadString() { throw new Error("réseau indisponible") }
      async loadJSON() { throw new Error("réseau indisponible") }
      async load() { throw new Error("réseau indisponible") }
    },
    Timer: timerDouble({ delay: milliseconds => Math.min(milliseconds, 5) }),
    Script: {
      name: () => "CTS Dashboard",
      setWidget: widget => widgetsSet.push(widget),
      complete: () => {}
    }
  }

  shim.installGlobals(globals)

  const { sandbox } = moduleSpace(globals)

  /* Les présentations ne doivent pas ouvrir d'interface hors widget. */
  for (const family of ["presentSmall", "presentMedium", "presentLarge"]) {
    sandbox.ListWidget.prototype[family] = function () {
      presented.push(family)
      return Promise.resolve()
    }
  }

  /*
   * Le fichier est exécuté tel quel, `await main()` compris : c'est
   * précisément ce que ce banc doit éprouver.
   */
  try {
    await runScript("CTS Dashboard", sandbox)
  } catch (error) {
    failures.push(`${surface} : exception non rattrapée — ${error.message}`)
    return
  }

  if (runsInWidget && !widgetsSet.length) {
    failures.push(`${label} : Script.setWidget n'a jamais été appelé, rien ne serait affiché`)
  }

  /*
   * Une vignette validée mais vide est ce qu'un conducteur voit comme un
   * écran noir : le fond du widget, et rien dessus.
   *
   * Le fond n'est exigé que sur l'écran d'accueil. Les tuiles d'écran
   * verrouillé sont dessinées par iOS sur son propre fond : leur en
   * imposer un les rendrait opaques au milieu du fond d'écran.
   */
  for (const widget of widgetsSet) {
    if (!widget?.children?.length) {
      failures.push(`${label} : la vignette validée ne contient aucun élément`)
    }
    if (!ACCESSORY.includes(family) && !widget?.backgroundGradient && !widget?.backgroundColor) {
      failures.push(`${label} : la vignette validée n'a aucun fond`)
    }

    const words = collectText(widget)

    if (!words.trim()) {
      failures.push(`${label} : la vignette validée ne porte aucun texte`)
    }

    /*
     * Le crédit d'auteur vit dans CTS Installer. Rien de ce que dessine le
     * widget ne doit le mentionner.
     */
    if (/IPPOLITO|Cré[ée] et développé par/i.test(words)) {
      failures.push(`${label} : la vignette porte un crédit d'auteur`)
    }

    /*
     * Les tailles d'écran d'accueil autres que « large » reçoivent la
     * carte qui le dit : la grande carte comprimée y serait illisible.
     * C'est ce que la coercition de getWidgetFamily rendait impossible à
     * distinguer.
     */
    if (
      runsInWidget &&
      family !== "large" &&
      !ACCESSORY.includes(family) &&
      !/Widget grand requis/.test(words)
    ) {
      failures.push(
        `${label} : la grande carte est livrée à une tuile ${family} ` +
        `au lieu de « Widget grand requis »`
      )
    }

    /*
     * Une tuile d'écran verrouillé reçoit au contraire un rendu qui lui
     * est propre : l'heure du prochain événement et son lieu. Elle ne
     * doit ni réclamer un grand widget, ni recevoir le programme complet
     * de la journée, qui n'y tiendrait pas.
     */
    if (runsInWidget && ACCESSORY.includes(family)) {
      if (/Widget grand requis/.test(words)) {
        failures.push(`${label} : une tuile d'écran verrouillé réclame un grand widget`)
      }

      if (/PROGRAMME|Amplitude/.test(words)) {
        failures.push(`${label} : la grande carte est livrée à une tuile ${family}`)
      }

      if (service && !/\d{1,2}:\d{2}/.test(words)) {
        failures.push(`${label} : aucune heure affichée sur la tuile ${family}`)
      }
    }
  }

  if (!runsInWidget && !presented.length) {
    failures.push("application : aucun widget présenté")
  }

  /*
   * Le rythme de réveil demandé à iOS.
   *
   * Le widget réclamait un réveil par minute pendant tout le service. Or
   * rien à l'écran ne change entre deux transitions : le temps restant et
   * la progression sont calculés puis jamais dessinés. Soixante réveils
   * par heure redessinaient donc la même image, en dépensant le budget
   * qu'iOS accorde — et le seul réveil qui compte, celui du changement de
   * tranche, risquait d'être celui qu'iOS refuse.
   *
   * Le service semé est en pleine exploitation à 09:00, donc en service :
   * le rattrapage y vaut cinq minutes, choisi pour qu'une entrée en pause
   * ne traîne pas sur l'écran d'accueil. Hors service il vaut un quart
   * d'heure. Ce contrôle vérifie qu'on ne redescend pas sous ces cinq
   * minutes — c'est la cadence à la minute qu'il empêche de revenir, pas
   * le rattrapage lui-même.
   *
   * Il ne vaut que lorsqu'un service est semé : sans service, un réveil
   * rapproché est le bon comportement.
   */
  for (const widget of service ? widgetsSet : []) {
    const refreshAt = widget?.refreshAfterDate

    if (!(refreshAt instanceof Date)) continue

    const minutes = (refreshAt.getTime() - FROZEN_NOW.getTime()) / 60000

    if (minutes < 4.9) {
      failures.push(
        `${label} : réveil demandé dans ${minutes.toFixed(1)} min — ` +
        `sous le rattrapage de cinq minutes en service`
      )
    }
  }

  /*
   * La trace de la dernière exécution doit exister et porter committed,
   * sans quoi le Diagnostic ne peut rien dire d'un widget qui n'affiche
   * pas ce qu'on attend.
   */
  const trace = disk.get("/documents/CTS Dashboard/Data/last-run.json")

  if (!trace) {
    failures.push(`${surface} : aucune trace d'exécution écrite`)
    return
  }

  let parsed

  try {
    parsed = JSON.parse(trace)
  } catch (_) {
    failures.push(`${surface} : trace d'exécution illisible`)
    return
  }

  if (parsed.surface !== surface) {
    failures.push(`${surface} : la trace annonce « ${parsed.surface} »`)
  }

  if (parsed.committed !== true) {
    failures.push(`${surface} : le rendu n'est pas marqué comme validé`)
  }
}

await run("widget")
await run("application")

/*
 * Familles autres que « large ».
 *
 * getWidgetFamily ramenait toute valeur inconnue à « large », si bien que
 * la grande carte était construite pour un widget d'écran verrouillé de
 * quelques millimètres — illisible, voire vide. Ces familles doivent
 * recevoir la carte « grand format uniquement », qui a un fond et du
 * texte.
 */
for (const family of ["accessoryRectangular", "accessoryCircular", "accessoryInline", "extraLarge", "medium", "small"]) {
  await run("widget", { family, label: `widget ${family}`, service: true })
}

/* Fonctionnement nominal : un service réel doit produire la grande carte. */
await run("widget", { label: "widget service", service: true })
await run("application", { label: "application service", service: true })

if (failures.length) {
  console.log("ÉCHEC  exécution de CTS Dashboard")
  for (const failure of failures) console.log(`         ${failure}`)
  process.exit(1)
}

console.log(
  "ok     exécution de CTS Dashboard " +
  "(widget, application, 6 familles, rendu validé, jamais vide)"
)
