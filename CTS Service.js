// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: clock;

const CONFIG = importModule("CTS Config")
const UTILS = importModule("CTS Utils")
const isUsableDate = UTILS.isUsableDate
const DAY_MS = 24 * 60 * 60 * 1000
const MINUTES_PER_DAY = 24 * 60
let placeLookupCache = null

const STATE = {
  NEXT: { type: "NEXT", label: "Service demain" },
  BEFORE: { type: "BEFORE", label: "Avant le service" },
  WORK: { type: "WORK", label: "En service" },
  PAUSE: { type: "PAUSE", label: "Pause" },
  CUT: { type: "CUT", label: "Coupure" },
  DONE: { type: "DONE", label: "Service terminé" },
  UNKNOWN: { type: "UNKNOWN", label: "État inconnu" }
}

function normalizeService(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return invalidResult("Le service est absent ou invalide.")
  }

  if (!source.validation?.valid) {
    return invalidResult("Le service n’a pas été validé par l’importeur.")
  }

  if (!Array.isArray(source.slices) || !source.slices.length) {
    return invalidResult("Aucune tranche exploitable n’a été trouvée.")
  }

  const dateObject = UTILS.parseDate(source.date)

  if (!dateObject) {
    return invalidResult("La date du service est invalide.")
  }

  const slices = source.slices.map(normalizeSlice)
  const invalidSlice = slices.find(slice => !slice.valid)

  if (invalidSlice) {
    return invalidResult(`La tranche ${invalidSlice.index} contient des données invalides.`)
  }

  slices.sort((first, second) => UTILS.toMinutes(first.start) - UTILS.toMinutes(second.start))

  const service = {
    number: String(source.service || "CTS"),
    date: source.date,
    dateObject,
    driver: normalizeDriver(source.driver),
    slices,
    breaks: normalizeBreaks(source.breaks)
  }

  /*
   * Attachées ici plutôt que calculées à l'affichage : tout ce qui lit un
   * service passe par cette fonction — le widget, l'application, le
   * simulateur du mainteneur — et hérite donc de la même liste, sans que
   * chacun ait à refaire le calcul ni à connaître la règle.
   */
  service.interruptions = getInterruptions(service)

  return {
    valid: true,
    error: "",
    service
  }
}

function normalizeSlice(slice, index) {
  const source = slice && typeof slice === "object" ? slice : {}
  const dutyStart = UTILS.normalizeTime(source.dutyStart)
  const start = UTILS.normalizeTime(source.operationStart)
  const end = UTILS.normalizeTime(source.end)
  const dutyEnd = UTILS.normalizeTime(source.dutyEnd || source.end)

  const rawDepotExitAt =
    source.depotExitAt === null || source.depotExitAt === undefined
      ? ""
      : UTILS.normalizeTime(source.depotExitAt)

  const depotExitAt = UTILS.isValidTime(rawDepotExitAt) ? rawDepotExitAt : ""

  const rawDepotReturnAt =
    source.depotReturnAt === null || source.depotReturnAt === undefined
      ? ""
      : UTILS.normalizeTime(source.depotReturnAt)

  const depotReturnAt = UTILS.isValidTime(rawDepotReturnAt) ? rawDepotReturnAt : ""
  const vehicle = normalizeOptionalString(source.vehicle)
  const fromCode = String(source.startPlaceCode || "")
  const toCode = String(source.endPlaceCode || "")

  const valid = Boolean(
    UTILS.isValidTime(dutyStart) &&
    UTILS.isValidTime(start) &&
    UTILS.isValidTime(end) &&
    UTILS.isValidTime(dutyEnd) &&
    UTILS.toMinutes(end) > UTILS.toMinutes(start) &&
    vehicle
  )

  return {
    valid,
    index: Number(source.index) || index + 1,
    lineCode: String(source.lineCode || ""),
    line: String(source.line || "?"),
    vehicle,
    dutyStart,
    start,
    end,
    dutyEnd,
    depotExitAt,
    depotReturnAt,
    fromCode,
    from: resolvePlaceLabel(fromCode, source.startPlace),
    toCode,
    to: resolvePlaceLabel(toCode, source.endPlace),
    lineUpAt: String(source.lineUpAt || ""),
    direction: String(source.direction || "")
  }
}

function resolvePlaceLabel(code, fallback) {
  const name = getPlaceName(code)

  if (name) {
    return name
  }

  return String(fallback || "Lieu inconnu")
}

function getPlaceName(code) {
  const key = UTILS.normalizeKey(code)

  if (!key) {
    return ""
  }

  const lookup = getPlaceLookup()
  return lookup[key] || ""
}

function getPlaceLookup() {
  if (placeLookupCache) {
    return placeLookupCache
  }

  const lookup = Object.create(null)

  try {
    const fm = CONFIG.fm
    const path = CONFIG.files.places

    if (!fm.fileExists(path) || !fm.isFileDownloaded(path)) {
      placeLookupCache = lookup
      return lookup
    }

    const text = fm.readString(path).trim()

    if (!text) {
      placeLookupCache = lookup
      return lookup
    }

    const database = JSON.parse(text)

    if (!database || typeof database !== "object" || Array.isArray(database)) {
      placeLookupCache = lookup
      return lookup
    }

    for (const [code, rawEntry] of Object.entries(database)) {
      const entry = typeof rawEntry === "string" ? { name: rawEntry } : rawEntry

      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue
      }

      const name = String(entry.name || "").trim()

      if (!name) {
        continue
      }

      addPlaceLookupEntry(lookup, code, name)

      const aliases = Array.isArray(entry.aliases)
        ? entry.aliases
        : typeof entry.aliases === "string"
          ? [entry.aliases]
          : []

      aliases.forEach(alias => addPlaceLookupEntry(lookup, alias, name))
    }
  } catch (_) {}

  placeLookupCache = lookup
  return lookup
}

function addPlaceLookupEntry(lookup, code, name) {
  const key = UTILS.normalizeKey(code)

  if (key && !Object.prototype.hasOwnProperty.call(lookup, key)) {
    lookup[key] = name
  }
}

function normalizeBreaks(sourceBreaks) {
  if (!Array.isArray(sourceBreaks)) return []

  return sourceBreaks
    .map(interruption => ({
      type: interruption?.type === "cut" ? "cut" : "pause",
      start: UTILS.normalizeTime(interruption?.start),
      end: UTILS.normalizeTime(interruption?.end)
    }))
    .filter(isValidInterruption)
}

function isValidInterruption(interruption) {
  return Boolean(
    UTILS.isValidTime(interruption.start) &&
    UTILS.isValidTime(interruption.end) &&
    UTILS.toMinutes(interruption.end) > UTILS.toMinutes(interruption.start)
  )
}

function normalizeDriver(driver) {
  return {
    name: String(driver?.name || ""),
    id: String(driver?.id || "")
  }
}

function normalizeOptionalString(value) {
  return value === null || value === undefined ? "" : String(value)
}

function computeState(service, currentDate = new Date()) {
  if (!hasSlices(service)) return unknownState()

  const serviceDate = UTILS.parseDate(service.date)

  if (!serviceDate || !isUsableDate(currentDate)) {
    return unknownState()
  }

  const slices = service.slices
  const firstSlice = slices[0]
  const lastSlice = slices[slices.length - 1]
  const dayDifference = calculateDayDifference(serviceDate, currentDate)

  if (dayDifference > 0) {
    return createState(STATE.NEXT, {
      label: dayDifference === 1 ? STATE.NEXT.label : `Service dans ${dayDifference} jours`,
      next: firstSlice,
      remaining: null,
      dayDifference
    })
  }

  const lastEndMinute = UTILS.toMinutes(lastSlice.end)
  const currentMinute = resolveOperationalMinute(currentDate, dayDifference, lastEndMinute)

  if (currentMinute === null) {
    return createState(STATE.DONE, {
      remaining: 0,
      progress: 1,
      dayDifference
    })
  }

  const firstDutyStart = UTILS.toMinutes(firstSlice.dutyStart)
  const firstOperationStart = UTILS.toMinutes(firstSlice.start)

  if (currentMinute < firstOperationStart) {
    const nextTransition = currentMinute < firstDutyStart ? firstDutyStart : firstOperationStart

    return createState(STATE.BEFORE, {
      next: firstSlice,
      remaining: nextTransition - currentMinute,
      dayDifference
    })
  }

  for (let index = 0; index < slices.length; index++) {
    const slice = slices[index]
    const startMinute = UTILS.toMinutes(slice.start)
    const endMinute = UTILS.toMinutes(slice.end)

    if (currentMinute >= startMinute && currentMinute < endMinute) {
      return createState(STATE.WORK, {
        current: slice,
        next: slices[index + 1] || null,
        remaining: endMinute - currentMinute,
        progress: (currentMinute - startMinute) / (endMinute - startMinute),
        dayDifference
      })
    }

    if (index >= slices.length - 1) continue

    const nextSlice = slices[index + 1]
    const pauseEndMinute = UTILS.toMinutes(nextSlice.start)

    if (currentMinute >= endMinute && currentMinute < pauseEndMinute) {
      const isCut = isCutBetween(service.breaks, slice, nextSlice)

      return createState(isCut ? STATE.CUT : STATE.PAUSE, {
        next: nextSlice,
        remaining: pauseEndMinute - currentMinute,
        breakDuration: pauseEndMinute - endMinute,
        dayDifference
      })
    }
  }

  if (currentMinute >= lastEndMinute) {
    return createState(STATE.DONE, {
      remaining: 0,
      progress: 1,
      dayDifference
    })
  }

  return unknownState(dayDifference)
}

function resolveOperationalMinute(currentDate, dayDifference, lastEndMinute) {
  const clockMinute = currentDate.getHours() * 60 + currentDate.getMinutes()

  if (dayDifference === 0) {
    return clockMinute
  }

  if (dayDifference === -1 && lastEndMinute > MINUTES_PER_DAY) {
    return MINUTES_PER_DAY + clockMinute
  }

  return null
}

function computeStats(service) {
  if (!hasSlices(service)) return emptyStats()

  const slices = service.slices
  const firstSlice = slices[0]
  const lastSlice = slices[slices.length - 1]

  const work = slices.reduce(
    (total, slice) => total + UTILS.durationMinutes(slice.start, slice.end),
    0
  )

  return {
    count: slices.length,
    work,
    amplitude: UTILS.durationMinutes(firstSlice.dutyStart, lastSlice.end),
    start: firstSlice.dutyStart,
    end: lastSlice.end
  }
}

/*
 * Les intervalles entre deux tranches, nommés et mesurés.
 *
 * computeState sait déjà reconnaître cet intervalle : quand l'heure
 * courante y tombe, il produit l'état PAUSE ou COUPURE et sa pastille.
 * Mais cette connaissance n'existait qu'à l'instant où le conducteur s'y
 * trouve. Un service se lit aussi le matin, ou la veille, et la question
 * « combien de temps de battement entre mes deux tranches » n'avait alors
 * aucune réponse.
 *
 * La règle est donc reprise telle quelle, isCutBetween compris : une
 * seule définition de ce qu'est une coupure, sans quoi la pastille et le
 * programme finiraient par se contredire sur le même service.
 */
function getInterruptions(service) {
  if (!hasSlices(service)) return []

  const slices = service.slices
  const interruptions = []

  for (let index = 0; index < slices.length - 1; index++) {
    const current = slices[index]
    const next = slices[index + 1]

    const duration =
      UTILS.toMinutes(next.start) - UTILS.toMinutes(current.end)

    if (!Number.isFinite(duration) || duration <= 0) continue

    const cut = isCutBetween(service.breaks, current, next)
    const state = cut ? STATE.CUT : STATE.PAUSE

    interruptions.push({
      afterIndex: index,
      nextIndex: next.index,
      type: state.type,
      label: state.label,
      start: current.end,
      end: next.start,
      duration
    })
  }

  return interruptions
}

function isCutBetween(breaks, currentSlice, nextSlice) {
  if (!Array.isArray(breaks)) return false

  const currentEnd = UTILS.toMinutes(currentSlice.end)
  const nextStart = UTILS.toMinutes(nextSlice.start)
  const nextDutyStart = UTILS.toMinutes(nextSlice.dutyStart)

  return breaks.some(interruption => {
    if (interruption.type !== "cut") {
      return false
    }

    const interruptionStart = UTILS.toMinutes(interruption.start)
    const interruptionEnd = UTILS.toMinutes(interruption.end)

    return (
      interruptionStart === currentEnd &&
      (interruptionEnd === nextStart || interruptionEnd === nextDutyStart)
    )
  })
}

function getDisplaySlice(service, state) {
  if (state?.current) return state.current
  if (state?.next) return state.next

  return hasSlices(service) ? service.slices[service.slices.length - 1] : null
}

function calculateDayDifference(serviceDate, currentDate) {
  const serviceDay = Date.UTC(
    serviceDate.getFullYear(),
    serviceDate.getMonth(),
    serviceDate.getDate()
  )

  const currentDay = Date.UTC(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    currentDate.getDate()
  )

  return Math.round((serviceDay - currentDay) / DAY_MS)
}

function hasSlices(service) {
  return Boolean(service && Array.isArray(service.slices) && service.slices.length > 0)
}

function emptyStats() {
  return {
    count: 0,
    work: 0,
    amplitude: 0,
    start: "",
    end: ""
  }
}

function createState(definition, overrides = {}) {
  return Object.assign(
    {
      type: definition.type,
      label: definition.label,
      current: null,
      next: null,
      remaining: null,
      breakDuration: 0,
      progress: 0,
      dayDifference: 0
    },
    overrides
  )
}

function invalidResult(message) {
  return {
    valid: false,
    error: String(message || "Service invalide."),
    service: null
  }
}

function unknownState(dayDifference = 0) {
  return createState(STATE.UNKNOWN, {
    dayDifference
  })
}

module.exports = {
  normalizeService,
  computeState,
  computeStats,
  getDisplaySlice,
  getInterruptions,
  isCutBetween
}
