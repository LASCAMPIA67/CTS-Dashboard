/*
 * Les intervalles entre tranches : pause ou coupure.
 *
 * Le widget nomme désormais ce qui sépare deux tranches. La règle qui
 * décide entre « Pause » et « Coupure » n'est pas nouvelle : c'est celle
 * de computeState, qui produit la pastille quand l'heure courante tombe
 * dans l'intervalle. Elle sert maintenant à deux endroits, et c'est
 * précisément le risque : si le programme et la pastille se mettaient à
 * répondre différemment sur le même service, le conducteur verrait le
 * widget se contredire lui-même.
 *
 * Ce banc fixe donc les deux ensemble. Pour chaque service, il compare ce
 * que getInterruptions annonce d'un intervalle avec ce que computeState
 * en dit lorsqu'on s'y place à l'intérieur.
 *
 *   node tools/preview/interruption-smoke.mjs
 */

import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"
import * as shim from "./scriptable-shim.mjs"
import { widgetBody } from "./html.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(here, "..", "..")

function loadModules() {
  const modules = new Map()

  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Date, Math, JSON, Number, String, Boolean, Array, Object, Set, Map,
    Promise, RegExp, Error, isNaN, parseInt, parseFloat, Intl,

    Device: { screenSize: () => new shim.Size(428, 926) },

    /*
     * CTS Config touche iCloud dès son chargement. Rien ici n'en a besoin :
     * seules les tables de lieux comptent, et elles sont facultatives.
     */
    FileManager: {
      iCloud: () => fileManagerDouble(),
      local: () => fileManagerDouble()
    },

    importModule: name => loadModule(name)
  }

  shim.installGlobals(sandbox)
  vm.createContext(sandbox)

  function loadModule(name) {
    if (modules.has(name)) return modules.get(name)

    const source = fs.readFileSync(path.join(repository, `${name}.js`), "utf8")
    const module = { exports: {} }

    modules.set(name, module.exports)
    vm.runInContext(
      `(function (module, exports) {\n${source}\n})`,
      sandbox,
      { filename: `${name}.js` }
    )(module, module.exports)
    modules.set(name, module.exports)

    return module.exports
  }

  return {
    SERVICE: loadModule("CTS Service"),
    RENDERER: loadModule("CTS Widget Renderer")
  }
}

function fileManagerDouble() {
  return {
    joinPath: (parent, child) => `${parent}/${child}`,
    documentsDirectory: () => "/documents",
    libraryDirectory: () => "/library",
    bookmarkedPath: () => "/documents",
    fileExists: () => false,
    isDirectory: () => false,
    isFileDownloaded: () => true,
    createDirectory: () => {},
    listContents: () => [],
    readString: () => "",
    writeString: () => {},
    remove: () => {},
    downloadFileFromiCloud: async () => {}
  }
}

const { SERVICE, RENDERER } = loadModules()
const failures = []

const check = (condition, message) => {
  if (!condition) failures.push(message)
}

function slice(index, dutyStart, start, end) {
  return {
    index,
    lineCode: "04",
    line: "C4",
    vehicle: String(10 + index),
    dutyStart,
    operationStart: start,
    end,
    dutyEnd: end,
    startPlaceCode: "CRB",
    startPlace: "UPE",
    endPlaceCode: "ELS",
    endPlace: "Elmerforst",
    depotExitAt: "",
    depotReturnAt: "",
    lineUpAt: "",
    direction: "Schiltigheim Campus"
  }
}

function build(slices, breaks = []) {
  const result = SERVICE.normalizeService({
    service: "EM76",
    date: "2026-08-27",
    driver: { name: "IPPOLITO", id: "6124" },
    slices,
    breaks,
    validation: { valid: true, errors: [], warnings: [] }
  })

  if (!result.valid) throw new Error(`service refusé : ${result.error}`)

  return result.service
}

/* Le service réel du 27 août : deux tranches, une heure entre les deux. */
{
  const service = build([
    slice(1, "04:56", "04:56", "07:39"),
    slice(2, "08:39", "08:39", "12:50")
  ])

  check(
    service.interruptions.length === 1,
    `deux tranches donnent ${service.interruptions.length} intervalle(s)`
  )

  const [interruption] = service.interruptions

  check(interruption.duration === 60, `durée ${interruption.duration} au lieu de 60`)
  check(interruption.label === "Pause", `libellé « ${interruption.label} »`)
  check(interruption.type === "PAUSE", `type ${interruption.type}`)
  check(interruption.start === "07:39", `début ${interruption.start}`)
  check(interruption.end === "08:39", `fin ${interruption.end}`)
  check(interruption.afterIndex === 0, `afterIndex ${interruption.afterIndex}`)
  check(interruption.nextIndex === 2, `nextIndex ${interruption.nextIndex}`)
}

/*
 * Une coupure déclarée par le parseur doit être nommée coupure. C'est la
 * distinction que le conducteur attend : une pause se passe sur place,
 * une coupure le renvoie chez lui.
 */
{
  const service = build(
    [slice(1, "05:30", "05:48", "09:03"), slice(2, "12:31", "12:31", "16:55")],
    [{ type: "cut", start: "09:03", end: "12:31" }]
  )

  const [interruption] = service.interruptions

  check(interruption.label === "Coupure", `libellé « ${interruption.label} »`)
  check(interruption.type === "CUT", `type ${interruption.type}`)
  check(interruption.duration === 208, `durée ${interruption.duration} au lieu de 208`)
}

/*
 * Une coupure dont la fin coïncide avec la prise de service et non avec
 * le début d'exploitation : le parseur produit les deux formes, et
 * isCutBetween les accepte toutes les deux. L'intervalle affiché reste
 * celui qui sépare les deux tranches à l'écran.
 */
{
  const service = build(
    [slice(1, "05:30", "05:48", "09:03"), slice(2, "12:20", "12:31", "16:55")],
    [{ type: "cut", start: "09:03", end: "12:20" }]
  )

  const [interruption] = service.interruptions

  check(interruption.label === "Coupure", `fin sur la prise de service : « ${interruption.label} »`)

  /*
   * L'intervalle se mesure d'un bout de ligne affichée à l'autre, donc
   * jusqu'à 12:31 et non jusqu'à la prise de service de 12:20. Le
   * mesurer sur dutyStart ferait dire au programme autre chose que ce
   * que les deux lignes qui l'encadrent montrent.
   */
  check(interruption.end === "12:31", `intervalle affiché jusqu'à ${interruption.end}`)
  check(interruption.start === "09:03", `intervalle affiché depuis ${interruption.start}`)
  check(interruption.duration === 208, `durée ${interruption.duration} au lieu de 208`)
}

/* Le programme et la pastille doivent dire la même chose du même moment. */
{
  const cases = [
    {
      label: "pause",
      slices: [slice(1, "04:56", "04:56", "07:39"), slice(2, "08:39", "08:39", "12:50")],
      breaks: [],
      at: [8, 0]
    },
    {
      label: "coupure",
      slices: [slice(1, "05:30", "05:48", "09:03"), slice(2, "12:31", "12:31", "16:55")],
      breaks: [{ type: "cut", start: "09:03", end: "12:31" }],
      at: [10, 30]
    }
  ]

  for (const item of cases) {
    const service = build(item.slices, item.breaks)
    const [interruption] = service.interruptions
    const state = SERVICE.computeState(service, new Date(2026, 7, 27, item.at[0], item.at[1]))

    check(
      state.type === interruption.type,
      `${item.label} : la pastille dit ${state.type}, le programme ${interruption.type}`
    )

    check(
      state.breakDuration === interruption.duration,
      `${item.label} : pastille ${state.breakDuration} min, programme ${interruption.duration} min`
    )

    check(
      state.next && state.next.index === interruption.nextIndex,
      `${item.label} : la pastille vise une autre tranche que le programme`
    )
  }
}

/* Une tranche unique n'a pas d'intervalle : il n'y a rien à afficher. */
{
  const service = build([slice(1, "04:56", "04:56", "12:50")])

  check(
    service.interruptions.length === 0,
    `une tranche produit ${service.interruptions.length} intervalle(s)`
  )
}

/*
 * Deux tranches qui s'enchaînent sans battement ne produisent rien non
 * plus. Sans ce filtre, le widget afficherait « Pause · 0 min ».
 */
{
  const service = build([
    slice(1, "04:56", "04:56", "07:39"),
    slice(2, "07:39", "07:39", "12:50")
  ])

  check(
    service.interruptions.length === 0,
    `un enchaînement immédiat produit ${service.interruptions.length} intervalle(s)`
  )
}

/* Trois tranches donnent deux intervalles, dans l'ordre de la journée. */
{
  const service = build([
    slice(1, "05:30", "05:48", "09:03"),
    slice(2, "12:31", "12:31", "16:55"),
    slice(3, "18:07", "18:07", "20:58")
  ])

  check(
    service.interruptions.length === 2,
    `trois tranches donnent ${service.interruptions.length} intervalle(s)`
  )

  check(
    service.interruptions[0].afterIndex === 0 && service.interruptions[1].afterIndex === 1,
    "les intervalles ne sont pas dans l'ordre des tranches"
  )

  check(
    service.interruptions[1].duration === 72,
    `deuxième intervalle ${service.interruptions[1].duration} au lieu de 72`
  )
}

/*
 * Un service à cheval sur minuit. Le parseur écrit les horaires au-delà
 * de 24:00 ; l'intervalle doit se mesurer sur cette échelle, sans quoi il
 * ressortirait négatif et disparaîtrait de l'affichage.
 */
{
  const service = build([
    slice(1, "20:10", "20:10", "23:40"),
    slice(2, "24:35", "24:35", "26:20")
  ])

  check(
    service.interruptions.length === 1,
    `passage de minuit : ${service.interruptions.length} intervalle(s)`
  )

  check(
    service.interruptions[0]?.duration === 55,
    `passage de minuit : durée ${service.interruptions[0]?.duration} au lieu de 55`
  )
}

/* Un service sans liste de coupures ne doit pas faire échouer le calcul. */
{
  const service = build([
    slice(1, "04:56", "04:56", "07:39"),
    slice(2, "08:39", "08:39", "12:50")
  ])

  delete service.breaks

  const interruptions = SERVICE.getInterruptions(service)

  check(interruptions.length === 1, "sans liste de coupures, l'intervalle disparaît")
  check(interruptions[0]?.label === "Pause", "sans liste de coupures, le libellé change")
}

/* Un service vide ne produit rien plutôt que de lever. */
{
  check(SERVICE.getInterruptions(null).length === 0, "un service absent lève ou produit un intervalle")
  check(SERVICE.getInterruptions({}).length === 0, "un service sans tranche produit un intervalle")
}

/*
 * Ce que le widget écrit vraiment.
 *
 * Le programme nomme l'intervalle, sauf pendant l'intervalle lui-même :
 * la pastille l'annonce alors déjà, durée comprise, et la répéter
 * coûterait une ligne au moment précis où le widget en a le moins.
 *
 * Les deux moitiés de la règle comptent autant l'une que l'autre. Ne
 * jamais afficher la ligne serait un widget muet ; l'afficher pendant la
 * pause serait un widget qui se répète. Le banc rend donc le même service
 * à deux moments et vérifie les deux.
 */
function renderProgram(service, state) {
  const widget = RENDERER.createWidget("large", {
    valid: true,
    service,
    state,
    stats: SERVICE.computeStats(service),
    displaySlice: SERVICE.getDisplaySlice(service, state),
    pendingImports: 0,
    preferences: { textScale: 1 }
  })

  return widgetBody(widget)
}

function programText(service, at) {
  const state = SERVICE.computeState(service, at)

  return { html: renderProgram(service, state), state }
}

{
  const service = build([
    slice(1, "04:56", "04:56", "07:39"),
    slice(2, "08:39", "08:39", "12:50")
  ])

  /* 09:30 : en pleine tranche 2, la pastille parle d'autre chose. */
  const working = programText(service, new Date(2026, 7, 27, 9, 30))

  check(
    working.html.includes("Pause · 1 h"),
    "en service, le programme ne nomme pas la pause"
  )

  /* 08:00 : dans la pause, la pastille dit déjà « Pause 1 h ». */
  const pausing = programText(service, new Date(2026, 7, 27, 8, 0))

  check(
    pausing.state.type === "PAUSE",
    `08:00 devrait être une pause, pas ${pausing.state.type}`
  )

  check(
    pausing.html.includes("Pause 1 h"),
    "pendant la pause, la pastille n'annonce plus la durée"
  )

  check(
    !pausing.html.includes("Pause · 1 h"),
    "pendant la pause, le programme répète ce que la pastille dit déjà"
  )

  /*
   * Trois tranches, une seule pause en cours : celle qu'on ne vit pas
   * doit rester écrite, sans quoi une pause en masquerait une autre.
   */
  const long = build([
    slice(1, "05:30", "05:48", "09:03"),
    slice(2, "12:31", "12:31", "16:55"),
    slice(3, "18:07", "18:07", "20:58")
  ])

  const between = programText(long, new Date(2026, 7, 27, 10, 30))

  check(
    between.state.type === "PAUSE",
    `10:30 devrait être une pause, pas ${between.state.type}`
  )

  check(
    !between.html.includes("Pause · 3 h 28"),
    "la pause en cours reste écrite dans le programme"
  )

  check(
    between.html.includes("Pause · 1 h 12"),
    "la pause suivante a disparu du programme"
  )
}

/*
 * Le programme ne se tait que si la pastille prend réellement la parole.
 *
 * Les deux conditions qui le garantissent — même intervalle, et durée
 * connue — ne peuvent pas se prendre en défaut aujourd'hui : computeState
 * et getInterruptions suivent la même règle et le banc l'a vérifié plus
 * haut. Ce sont donc des garde-fous, et un garde-fou que rien n'éprouve
 * finit par être supprimé comme inutile par quelqu'un qui a raison de le
 * croire. Ces deux cas décrivent ce qui doit se produire si les deux
 * moitiés du widget se mettaient un jour à diverger : le programme
 * reprend la parole plutôt que de laisser disparaître le chiffre.
 */
{
  const service = build([
    slice(1, "04:56", "04:56", "07:39"),
    slice(2, "08:39", "08:39", "12:50")
  ])

  const pause = SERVICE.computeState(service, new Date(2026, 7, 27, 8, 0))

  /* Une pastille qui ne connaît pas la durée ne l'annonce pas. */
  const silent = renderProgram(service, { ...pause, breakDuration: 0 })

  check(
    silent.includes("Pause · 1 h"),
    "pastille sans durée : le programme se tait aussi, le chiffre disparaît"
  )

  /* Une pastille qui parle d'une coupure ne dit pas la pause du programme. */
  const disagreeing = renderProgram(service, {
    ...pause,
    type: "CUT",
    label: "Coupure"
  })

  check(
    disagreeing.includes("Pause · 1 h"),
    "pastille et programme en désaccord : la pause n'est plus écrite nulle part"
  )
}

if (failures.length) {
  for (const failure of failures) console.error(`  ✗ ${failure}`)
  console.error(`\n${failures.length} contrôle(s) en échec.`)
  process.exit(1)
}

console.log(
  "Intervalles entre tranches : pause et coupure nommées, accordées avec la " +
    "pastille, et jamais répétées pendant qu'elle les annonce."
)
