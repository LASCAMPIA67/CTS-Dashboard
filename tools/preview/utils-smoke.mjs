import { importFrom, isolatedModule, timerDouble } from "./sandbox.mjs"

function loadUtils(runsInWidget = true) {
  return isolatedModule("CTS Utils", {
    globals: {
      config: { runsInWidget },
      Timer: timerDouble({ delay: milliseconds => milliseconds })
    }
  })
}

const failures = []
const UTILS = loadUtils()

{
  const value = await UTILS.withTimeout(Promise.resolve("réponse"), 1000, "REPLI")

  if (value !== "réponse") {
    failures.push(`withTimeout altère une réponse rapide : ${JSON.stringify(value)}`)
  }
}

{
  const startedAt = Date.now()
  const value = await UTILS.withTimeout(new Promise(() => {}), 120, "REPLI")
  const elapsed = Date.now() - startedAt

  if (value !== "REPLI") {
    failures.push(`withTimeout ne rend pas le repli : ${JSON.stringify(value)}`)
  }

  if (elapsed > 1500) {
    failures.push(`withTimeout a mis ${elapsed} ms à renoncer`)
  }
}

{
  const slow = new Promise(resolve => setTimeout(() => resolve("tardif"), 400))
  const value = await UTILS.withTimeout(slow, 80, "REPLI")

  if (value !== "REPLI") {
    failures.push(`withTimeout attend une promesse trop lente : ${JSON.stringify(value)}`)
  }
}

{
  let rejected = false

  try {
    await UTILS.withTimeout(Promise.reject(new Error("panne")), 1000, "REPLI")
  } catch (error) {
    rejected = error?.message === "panne"
  }

  if (!rejected) failures.push("withTimeout avale un rejet au lieu de le propager")
}

{
  if (loadUtils(true).runsInApplication() !== false) {
    failures.push("runsInApplication répond « oui » dans un widget")
  }

  if (loadUtils(false).runsInApplication() !== true) {
    failures.push("runsInApplication répond « non » dans l'application")
  }
}

{
  const foreign = {
    getTime: () => 1_770_000_000_000,
    getFullYear: () => 2026,
    getMonth: () => 7,
    getDate: () => 19,
    getHours: () => 6,
    getMinutes: () => 30
  }

  if (!UTILS.isUsableDate(foreign)) {
    failures.push("isUsableDate rejette une date venue d'un autre module")
  }

  if (UTILS.isValidDate(foreign)) {
    failures.push("isValidDate accepte une date étrangère : le piège aurait disparu")
  }

  for (const value of [null, undefined, "2026-08-19", {}, new Date("nope")]) {
    if (UTILS.isUsableDate(value)) {
      failures.push(`isUsableDate accepte ${JSON.stringify(String(value))}`)
    }
  }
}

{
  const WIDGET_CEILING_MS = 15000
  const APPLICATION_FLOOR_MS = 40000

  const load = runsInWidget => {
    const loaded = {}
    const modules = ["CTS Config", "CTS Utils", "CTS Storage", "CTS PDF Engine"]

    for (const name of modules) {
      loaded[name] = isolatedModule(name, {
        importModule: importFrom(loaded),
        globals: {
          config: { runsInWidget },
          FileManager: {
            iCloud: () => ({
              joinPath: (a, b) => `${a}/${b}`,
              documentsDirectory: () => "/documents",
              fileExists: () => false,
              createDirectory: () => {}
            })
          }
        }
      })
    }

    return loaded["CTS PDF Engine"].budgets()
  }

  const widget = load(true)
  const application = load(false)

  if (widget.total > WIDGET_CEILING_MS) {
    failures.push(
      `budget PDF du widget : ${widget.total} ms, au-delà du plafond de ${WIDGET_CEILING_MS} ms`
    )
  }

  if (application.total < APPLICATION_FLOOR_MS) {
    failures.push(
      `budget PDF de l'application : ${application.total} ms, en deçà du plancher de ` +
      `${APPLICATION_FLOOR_MS} ms — une lecture lente serait abandonnée à tort`
    )
  }

  for (const phase of ["load", "engine", "extraction"]) {
    if (widget[phase] >= application[phase]) {
      failures.push(
        `budget PDF · ${phase} : le widget attend ${widget[phase]} ms, ` +
        `autant que l'application`
      )
    }
  }
}

if (failures.length) {
  console.log("ÉCHEC  primitives partagées")
  for (const failure of failures) console.log(`         ${failure}`)
  process.exit(1)
}

console.log(
  "ok     primitives partagées (bornes, contexte d'exécution, dates inter-modules, " +
  "budget PDF par contexte)"
)
