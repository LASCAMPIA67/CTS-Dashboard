import * as shim from "./scriptable-shim.mjs"
import { widgetBody } from "./html.mjs"
import { moduleSpace } from "./sandbox.mjs"

function loadModules() {
  const globals = {
    Intl,
    Device: { screenSize: () => new shim.Size(428, 926) },

    FileManager: {
      iCloud: () => fileManagerDouble(),
      local: () => fileManagerDouble()
    }
  }

  shim.installGlobals(globals)

  const { load } = moduleSpace(globals)

  return {
    SERVICE: load("CTS Service"),
    RENDERER: load("CTS Widget Renderer")
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

{
  const service = build(
    [slice(1, "05:30", "05:48", "09:03"), slice(2, "12:20", "12:31", "16:55")],
    [{ type: "cut", start: "09:03", end: "12:20" }]
  )

  const [interruption] = service.interruptions

  check(interruption.label === "Coupure", `fin sur la prise de service : « ${interruption.label} »`)

  check(interruption.end === "12:31", `intervalle affiché jusqu'à ${interruption.end}`)
  check(interruption.start === "09:03", `intervalle affiché depuis ${interruption.start}`)
  check(interruption.duration === 208, `durée ${interruption.duration} au lieu de 208`)
}

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

{
  const service = build([slice(1, "04:56", "04:56", "12:50")])

  check(
    service.interruptions.length === 0,
    `une tranche produit ${service.interruptions.length} intervalle(s)`
  )
}

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

{
  check(SERVICE.getInterruptions(null).length === 0, "un service absent lève ou produit un intervalle")
  check(SERVICE.getInterruptions({}).length === 0, "un service sans tranche produit un intervalle")
}

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

  const working = programText(service, new Date(2026, 7, 27, 9, 30))

  check(
    working.html.includes("Pause · 1 h"),
    "en service, le programme ne nomme pas la pause"
  )

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

{
  const service = build([
    slice(1, "04:56", "04:56", "07:39"),
    slice(2, "08:39", "08:39", "12:50")
  ])

  const pause = SERVICE.computeState(service, new Date(2026, 7, 27, 8, 0))

  const silent = renderProgram(service, { ...pause, breakDuration: 0 })

  check(
    silent.includes("Pause · 1 h"),
    "pastille sans durée : le programme se tait aussi, le chiffre disparaît"
  )

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

{
  const service = build([slice(1, "21:00", "21:10", "25:30")])
  const state = SERVICE.computeState(service, new Date(2026, 7, 28, 0, 45))

  check(state.type === "WORK", `0 h 45 le lendemain devrait être en service, pas ${state.type}`)
  check(state.remaining === 45, `0 h 45 le lendemain : ${state.remaining} min restantes au lieu de 45`)
}

function symbolsOf(node, found = new Set()) {
  if (node?.kind === "image") found.add(node.symbol)
  for (const child of node?.children || []) symbolsOf(child, found)
  return found
}

for (const [lineCode, line, symbol, other, label] of [
  ["80", "A", "tram.fill", "bus.fill", "DÉBUT EXPLOITATION"],
  ["04", "C4", "bus.fill", "tram.fill", "MISE EN LIGNE"]
]) {
  const service = build([
    { ...slice(1, "05:00", "05:12", "09:30"), lineCode, line, lineUpAt: "05:10" }
  ])
  const state = SERVICE.computeState(service, new Date(2026, 7, 27, 4, 0))
  const widget = RENDERER.createWidget("large", {
    valid: true,
    service,
    state,
    stats: SERVICE.computeStats(service),
    displaySlice: SERVICE.getDisplaySlice(service, state),
    pendingImports: 0,
    preferences: { textScale: 1 }
  })
  const symbols = symbolsOf(widget)

  check(symbols.has(symbol), `ligne ${line} : l'icône ${symbol} manque`)
  check(!symbols.has(other), `ligne ${line} : l'icône ${other} s'affiche à tort`)
  check(widgetBody(widget).includes(label), `ligne ${line} : le libellé « ${label} » manque`)
}

if (failures.length) {
  for (const failure of failures) console.error(`  ✗ ${failure}`)
  console.error(`\n${failures.length} contrôle(s) en échec.`)
  process.exit(1)
}

console.log(
  "Intervalles entre tranches : pause et coupure nommées, accordées avec la " +
    "pastille, et jamais répétées pendant qu'elle les annonce ; service après minuit ; tram et bus distingués."
)
