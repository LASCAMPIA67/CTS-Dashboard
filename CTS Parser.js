// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: indigo; icon-glyph: doc.text.magnifyingglass;

const DB = importModule("CTS Database")
const UTILS = importModule("CTS Utils")

const PAGE_FOOTER =
  /(?:Page\s*:\s*\d+\s+)?HASTUS\s+\d{4}\b[^\n]*?\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}(?:\s+Page\s*:\s*\d+)?/gi

const {
  normalizeText,
  normalizeTime,
  isValidTime,
  toMinutes,
  normalizeCode,
  isTramLineCode
} = UTILS

async function parseService(rawText) {
  const text = normalizeText(String(rawText || "").replace(PAGE_FOOTER, ""))
  const errors = []
  const warnings = []
  const service = extractServiceNumber(text)
  const date = extractServiceDate(text)
  const driver = extractDriver(text)

  if (!service) errors.push("Numéro de service introuvable")
  if (!date) errors.push("Date du service introuvable ou invalide")
  if (!driver.name) warnings.push("Nom du conducteur introuvable")

  let slices = await extractSlices(text)
  const { sections, unclaimed } = matchVehicleSections(text, slices)
  const contexts = await enrichSlices(slices, sections)

  slices = contexts.map(({ slice }) => slice)

  if (!slices.length) errors.push("Aucune tranche détectée")

  unclaimed.forEach(vehicle => errors.push(`Tranche introuvable pour la voiture ${vehicle}`))
  validateSlices(slices, errors, warnings)
  addPlaceWarnings(contexts, warnings)
  addDepartureWarnings(contexts, warnings)

  const breaks = extractBreaks(text, slices)
  warnings.push(...(await DB.getWarnings()))

  return {
    version: 7,
    source: "HASTUS",
    importedAt: new Date().toISOString(),
    service: service || "",
    date: date || "",
    driver,
    slices,
    breaks,
    validation: {
      valid: errors.length === 0,
      errors: uniqueValues(errors),
      warnings: uniqueValues(warnings),
      slicesWithUnknownPlace: await countSlicesWithUnknownPlace(contexts)
    }
  }
}

async function countSlicesWithUnknownPlace(contexts) {
  if (!(await DB.hasPlaces())) return 0

  return contexts.filter(({ unknownPlace }) => unknownPlace).length
}

async function enrichSlices(slices, sections) {
  return Promise.all(
    slices.map(async slice => {
      const section = sections.get(slice) || ""
      const lines = rebuildSectionLines(section)
      const startsAtDepot = await DB.isDepot(slice.startPlaceCode)
      const endsAtDepot = await DB.isDepot(slice.endPlaceCode)
      const details = await extractDepartureDetails(
        section,
        lines,
        slice,
        startsAtDepot,
        endsAtDepot
      )
      const startPlace = await namePlace(
        slice.startPlaceCode,
        findPrintedStop(lines, slice.operationStart, { last: false })
      )
      const endPlace = await namePlace(
        slice.endPlaceCode,
        findPrintedStop(lines, slice.end, { last: true })
      )

      return {
        startsAtDepot,
        endsAtDepot,
        unknownPlace: !startPlace.known || !endPlace.known,
        slice: {
          ...slice,
          startPlace: startPlace.name,
          endPlace: endPlace.name,
          depotExitAt: startsAtDepot ? details.depotExitAt : "",
          depotReturnAt: endsAtDepot ? details.depotReturnAt : "",
          lineUpAt: startsAtDepot ? details.lineUpAt : "",
          direction: details.direction
        }
      }
    })
  )
}

async function namePlace(code, printedStop) {
  const name = await DB.findPlaceName(code)
  if (name) return { name, known: true }

  return {
    name: printedStop ? await DB.formatStop(printedStop) : await DB.formatPlace(code),
    known: false
  }
}

function findPrintedStop(lines, time, { last }) {
  const names = lines
    .filter(line => !isDutyLine(line))
    .map(line => extractActivityStop(line) || extractTimedStop(line))
    .filter(stop => stop && stop.time === time)
    .map(stop => stop.name)

  return (last ? names[names.length - 1] : names[0]) || ""
}

function addPlaceWarnings(contexts, warnings) {
  contexts.forEach(({ unknownPlace }, index) => {
    if (unknownPlace) warnings.push(`Lieu inconnu dans la tranche ${index + 1}`)
  })
}

function addDepartureWarnings(contexts, warnings) {
  contexts.forEach(({ slice, startsAtDepot, endsAtDepot }, index) => {
    const number = index + 1

    if (startsAtDepot && !slice.depotExitAt) {
      warnings.push(`Heure de sortie dépôt introuvable pour la tranche ${number}`)
    }

    if (endsAtDepot && !slice.depotReturnAt) {
      warnings.push(`Heure de rentrée dépôt introuvable pour la tranche ${number}`)
    }

    if (startsAtDepot && !slice.lineUpAt) {
      warnings.push(
        isTramLineCode(slice.lineCode)
          ? `Début d'exploitation introuvable pour la tranche ${number}`
          : `Mise en ligne introuvable pour la tranche ${number}`
      )
    }

    if (startsAtDepot && !slice.direction) {
      warnings.push(
        isTramLineCode(slice.lineCode)
          ? `Direction de début d'exploitation introuvable pour la tranche ${number}`
          : `Direction de mise en ligne introuvable pour la tranche ${number}`
      )
    }

    if (!startsAtDepot && !slice.direction) {
      warnings.push(`Direction introuvable pour la tranche ${number}`)
    }
  })
}

function extractServiceNumber(text) {
  return text.match(/\b([A-Z][A-Z]\d{1,3}(?:[A-Z][A-Z0-9]*)?)\b/)?.[1] || null
}

function extractServiceDate(text) {
  const match = text.match(/\b([0-3]?\d)[\/.-]([01]?\d)[\/.-](20\d{2})\b/)

  if (!match) return null

  const day = String(Number(match[1])).padStart(2, "0")
  const month = String(Number(match[2])).padStart(2, "0")

  const date = `${match[3]}-${month}-${day}`

  return UTILS.parseDate(date) ? date : null
}

function extractDriver(text) {
  const match = text.match(/\b([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý' -]{3,})\s*\((\d{4,10})\)/)

  if (!match) {
    return {
      name: "",
      id: ""
    }
  }

  return {
    name: match[1].replace(/\s+/g, " ").trim(),
    id: match[2]
  }
}

async function extractSlices(text) {
  const flatText = text.replace(/\n/g, " ")

  const regex =
    /\b(\d{2})\s*-\s*(\d{1,3})\s+(\d{1,2}:\d{2})\s+([A-Z][A-Z0-9_]*)\s+(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})\s+([A-Z][A-Z0-9_]*)\s+(\d{1,2}:\d{2})\b/g

  const slices = []
  let match

  while ((match = regex.exec(flatText)) !== null) {
    const lineCode = normalizeCode(match[1])
    const vehicle = Number(match[2])
    const dutyStart = normalizeTime(match[3])
    const startPlaceCode = normalizeCode(match[4])
    const operationStart = normalizeTime(match[5])
    const end = normalizeTime(match[6])
    const endPlaceCode = normalizeCode(match[7])
    const dutyEnd = normalizeTime(match[8])

    slices.push({
      index: slices.length + 1,
      lineCode,
      line: await DB.formatLine(lineCode),
      vehicle,
      dutyStart,
      operationStart,
      end,
      dutyEnd,
      startPlaceCode,
      endPlaceCode
    })
  }

  return removeDuplicateSlices(slices)
}

async function extractDepartureDetails(section, lines, slice, startsAtDepot, endsAtDepot) {
  if (!section) {
    return {
      depotExitAt: "",
      depotReturnAt: "",
      lineUpAt: "",
      direction: ""
    }
  }

  return {
    depotExitAt: startsAtDepot ? extractDepotExitTime(section, lines) : "",
    depotReturnAt: endsAtDepot ? extractDepotReturnTime(lines, slice) : "",
    lineUpAt: startsAtDepot ? await extractLineUpPlace(section, lines, slice) : "",
    direction: await resolveDirection(slice.lineCode, extractFirstTrip(section, lines))
  }
}

function extractDepotReturnTime(lines, slice) {
  const returnIndex = lines.findIndex(line => /^Entrée\s*\/\s*\S+/i.test(line))
  if (returnIndex === -1) return ""

  let candidate = ""

  for (let index = returnIndex; index < lines.length; index++) {
    const stop =
      index === returnIndex ? extractActivityStop(lines[index]) : extractTimedStop(lines[index])

    if (index > returnIndex && isActivityLine(lines[index])) break
    if (stop && isValidTime(stop.time)) candidate = stop.time
  }

  if (!candidate) return ""

  const returnMinute = toMinutes(candidate)
  const endMinute = toMinutes(slice.end)
  const dutyEndMinute = toMinutes(slice.dutyEnd)

  const withinService =
    Number.isFinite(returnMinute) &&
    Number.isFinite(endMinute) &&
    returnMinute >= endMinute &&
    (!Number.isFinite(dutyEndMinute) || returnMinute <= dutyEndMinute)

  return withinService ? candidate : ""
}

function extractDepotExitTime(section, lines) {
  const exitLine = lines.find(line => /^Sortie\s*\/\s*\S+/i.test(line))

  if (exitLine) {
    const match = exitLine.match(/^Sortie\s*\/\s*\S+\s+.+?\s+(\d{1,2}:\d{2})$/i)

    if (match && isValidTime(match[1])) {
      return normalizeTime(match[1])
    }
  }

  const flatSection = section.replace(/\n/g, " ").replace(/\s+/g, " ").trim()

  const match = flatSection.match(
    /\bSortie\s*\/\s*\S+\s+DEPOT\s+.+?\s+(\d{1,2}:\d{2})(?=\s|$)/i
  )

  return match && isValidTime(match[1]) ? normalizeTime(match[1]) : ""
}

function matchVehicleSections(text, slices) {
  const headers = [...text.matchAll(/\bVoiture\s+(\d{1,3})\s*-\s*(\d{1,3})\b/gi)]
  const sections = new Map()
  const unclaimed = []

  headers.forEach((header, position) => {
    const [label, line, vehicle] = header
    const slice = slices.find(
      candidate =>
        !sections.has(candidate) &&
        Number(candidate.lineCode) === Number(line) &&
        candidate.vehicle === Number(vehicle)
    )

    if (!slice) {
      unclaimed.push(`${line} - ${vehicle}`)
      return
    }

    const end = headers[position + 1]?.index ?? text.length

    sections.set(slice, text.slice(header.index + label.length, end).trim())
  })

  return { sections, unclaimed }
}

// L'heure collée ne se sépare qu'après deux lettres : « V16:05 » peut être V1 à 6:05 comme V à 16:05.
function rebuildSectionLines(section) {
  return section
    .replace(/([A-Za-zÀ-ÖØ-öø-ÿ]{2})(\d{1,2}:\d{2})/g, "$1 $2")
    .replace(
      /\s+(?=(?:Prép\.\s*sortie|Sortie\s*\/|Régulier\s*\/|Haut-le-pied\s*\/|Entrée\s*\/|Déplacement\b|Pause-café\b|Coupure\b))/gi,
      "\n"
    )
    .replace(/\s+(?=-\s*\/\s*-)/g, "\n")
    .replace(/(\d{1,2}:\d{2})\s+(?=[A-ZÀ-ÖØ-Ý])/g, "$1\n")
    .split("\n")
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
}

async function extractLineUpPlace(section, lines, slice) {
  if (isTramLineCode(slice?.lineCode)) {
    return await extractTramOperationStart(lines, slice)
  }

  const exitIndex = lines.findIndex(line => /^Sortie\s*\/\s*\S+/i.test(line))

  if (exitIndex !== -1) {
    for (let index = exitIndex + 1; index < lines.length; index++) {
      const line = lines[index]

      if (isActivityLine(line)) {
        break
      }

      const stop = extractTimedStop(line)

      if (stop) {
        return DB.formatStop(stop.name)
      }
    }
  }

  const flatSection = section.replace(/\n/g, " ").replace(/\s+/g, " ")

  const exitMatch = flatSection.match(
    /Sortie\s*\/\s*\S+\s+DEPOT\s+.+?\s+\d{1,2}:\d{2}\s+-\s*\/\s*-\s+(.+?)\s+\d{1,2}:\d{2}\s+Régulier\s*\//i
  )

  if (exitMatch) {
    return DB.formatStop(exitMatch[1])
  }

  const firstRegular = flatSection.match(/Régulier\s*\/\s*\S+\s+(.+?)\s+\d{1,2}:\d{2}/i)

  return firstRegular ? DB.formatStop(firstRegular[1]) : ""
}

async function extractTramOperationStart(lines, slice) {
  const exitIndex = lines.findIndex(line => /^Sortie\s*\/\s*\S+/i.test(line))
  const expectedLine = String(slice?.line || "")
    .trim()
    .toUpperCase()

  const startIndex = exitIndex === -1 ? 0 : exitIndex + 1

  for (let index = startIndex; index < lines.length; index++) {
    const line = lines[index]
    const match = line.match(/^Régulier\s*\/\s*(\S+)\s+(.+?)\s+(\d{1,2}:\d{2})$/i)

    if (!match) {
      continue
    }

    const activityLine = String(match[1] || "")
      .trim()
      .toUpperCase()

    if (expectedLine && activityLine !== expectedLine) {
      continue
    }

    return DB.formatStop(match[2])
  }

  return ""
}

// La girouette ne se déduit que sur une ligne à deux terminus ; ailleurs, le dernier arrêt desservi.
async function resolveDirection(lineCode, trip) {
  if (!trip) {
    return ""
  }

  const arrival = await DB.formatStop(trip.arrival)
  const termini = await Promise.all(
    (await DB.getLineTermini(lineCode)).map(terminus => DB.formatStop(terminus))
  )

  if (termini.length !== 2 || termini.includes(arrival)) {
    return arrival
  }

  const origin = termini.indexOf(await DB.formatStop(trip.departure))

  return origin === -1 ? arrival : termini[1 - origin]
}

function extractFirstTrip(section, lines) {
  const regularIndex = lines.findIndex(line => /^Régulier\s*\/\s*\S+/i.test(line))

  if (regularIndex !== -1) {
    const departure = extractActivityStop(lines[regularIndex])
    let arrival = departure

    for (let index = regularIndex + 1; index < lines.length; index++) {
      const line = lines[index]

      if (isDirectionBoundary(line)) {
        break
      }

      arrival = extractTimedStop(line) || arrival
    }

    if (arrival) {
      return {
        departure: departure?.name || "",
        arrival: arrival.name
      }
    }
  }

  return extractFirstTripFromFlatText(section)
}

function extractFirstTripFromFlatText(section) {
  const flatText = section.replace(/\n/g, " ").replace(/\s+/g, " ").trim()
  const start = flatText.search(/\bRégulier\s*\/\s*\S+/i)

  if (start === -1) {
    return null
  }

  const afterStart = flatText.slice(start)
  const nextBlock = afterStart
    .slice(1)
    .search(
      /\b(?:Régulier|Haut-le-pied|Entrée|Sortie)\s*\/|\b(?:Déplacement|Coupure|Pause-café|Prép\.\s*sortie)\b/i
    )

  const block = nextBlock === -1 ? afterStart : afterStart.slice(0, nextBlock + 1)

  const matches = [
    ...block.matchAll(/(?:^|\s)([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý0-9' ().-]*?)\s+(\d{1,2}:\d{2})(?=\s|$)/g)
  ]

  if (!matches.length) {
    return null
  }

  const stopName = match =>
    match[1].replace(/^Régulier\s*\/\s*\S+\s+/i, "").replace(/^-\s*\/\s*-\s+/i, "")

  return {
    departure: stopName(matches[0]),
    arrival: stopName(matches[matches.length - 1])
  }
}

function extractActivityStop(line) {
  const match = line.match(
    /^(?:Régulier|Haut-le-pied|Entrée|Sortie)\s*\/\s*\S+\s+(.+?)\s+(\d{1,2}:\d{2})$/i
  )

  return match
    ? {
        name: match[1],
        time: normalizeTime(match[2])
      }
    : null
}

function extractTimedStop(line) {
  const match = line.match(/^(?:-\s*\/\s*-\s+)?(.+?)\s+(\d{1,2}:\d{2})$/)

  if (!match) {
    return null
  }

  const name = match[1].replace(/\s+/g, " ").trim()

  if (/^(Prép\.\s*sortie|Déplacement|Pause-café|Coupure)$/i.test(name)) {
    return null
  }

  return {
    name,
    time: normalizeTime(match[2])
  }
}

function isActivityLine(line) {
  return /^(Régulier|Haut-le-pied|Entrée|Sortie)\s*\//i.test(line)
}

function isDutyLine(line) {
  return /^(Déplacement|Coupure|Pause-café|Prép\.\s*sortie)\b/i.test(line)
}

function isDirectionBoundary(line) {
  return isActivityLine(line) || isDutyLine(line)
}

function extractBreaks(text, slices) {
  const breaks = []
  const regex = /\bCoupure\s+(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})\b/gi
  let match

  while ((match = regex.exec(text)) !== null) {
    breaks.push({
      type: "cut",
      start: normalizeTime(match[1]),
      end: normalizeTime(match[2])
    })
  }

  for (let index = 0; index < slices.length - 1; index++) {
    const current = slices[index]
    const next = slices[index + 1]
    const start = current.end
    const end = next.operationStart

    if (toMinutes(end) <= toMinutes(start)) {
      continue
    }

    const alreadyCut = breaks.some(
      interruption =>
        interruption.start === start &&
        (interruption.end === end || interruption.end === next.dutyStart)
    )

    if (!alreadyCut) {
      breaks.push({
        type: "pause",
        start,
        end
      })
    }
  }

  return breaks.sort((first, second) => toMinutes(first.start) - toMinutes(second.start))
}

function validateSlices(slices, errors, warnings) {
  slices.forEach((slice, index) => {
    const number = index + 1

    if (!slice.line) {
      errors.push(`Ligne absente pour la tranche ${number}`)
    }

    if (!slice.vehicle) {
      errors.push(`Voiture absente pour la tranche ${number}`)
    }

    if (
      !isValidTime(slice.dutyStart) ||
      !isValidTime(slice.operationStart) ||
      !isValidTime(slice.end)
    ) {
      errors.push(`Horaires invalides pour la tranche ${number}`)
    }

    if (
      isValidTime(slice.operationStart) &&
      isValidTime(slice.end) &&
      toMinutes(slice.end) <= toMinutes(slice.operationStart)
    ) {
      errors.push(`Fin antérieure au début pour la tranche ${number}`)
    }
  })

  for (let index = 1; index < slices.length; index++) {
    if (toMinutes(slices[index].operationStart) < toMinutes(slices[index - 1].end)) {
      warnings.push(`Chevauchement entre les tranches ${index} et ${index + 1}`)
    }
  }
}

function removeDuplicateSlices(slices) {
  const seen = new Set()

  return slices
    .filter(slice => {
      const key = [
        slice.lineCode,
        slice.vehicle,
        slice.dutyStart,
        slice.operationStart,
        slice.end
      ].join("|")

      if (seen.has(key)) {
        return false
      }

      seen.add(key)

      return true
    })
    .map((slice, index) => ({
      ...slice,
      index: index + 1
    }))
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))]
}

module.exports = {
  parseService
}
