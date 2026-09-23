// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: indigo; icon-glyph: doc.text.magnifyingglass;

const DB = importModule("CTS Database")
const UTILS = importModule("CTS Utils")
const TRAM_LINE_CODES = new Set(["80", "81", "82", "83", "84", "85"])

/*
 * HASTUS imprime au bas de chaque page « Page: 1 HASTUS 2025 - poste
 * 22/09/2026 15:44 ». Terminée par une heure, la ligne se lit comme un
 * arrêt, et la section de la dernière voiture court jusqu'à la fin du
 * texte : elle est devenue la direction affichée sur un widget du parc,
 * « Page: 1 Hast. 2025 - Dtc_. 22/09/2026 ». Rien ne garantit l'ordre dans
 * lequel la lecture du PDF rend les deux morceaux, d'où les deux
 * emplacements de « Page ».
 */
const PAGE_FOOTER =
  /(?:Page\s*:\s*\d+\s+)?HASTUS\s+\d{4}\b[^\n]*?\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}(?:\s+Page\s*:\s*\d+)?/gi

const { normalizeText, normalizeTime, isValidTime, toMinutes, escapeRegex, normalizeCode } =
  UTILS

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
  const contexts = await enrichSlices(text, slices)

  slices = contexts.map(({ slice }) => slice)

  if (!slices.length) errors.push("Aucune tranche détectée")

  validateSlices(slices, errors, warnings)
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
      warnings: uniqueValues(warnings)
    }
  }
}

async function enrichSlices(text, slices) {
  return Promise.all(
    slices.map(async slice => {
      const startsAtDepot = await DB.isDepot(slice.startPlaceCode)
      const endsAtDepot = await DB.isDepot(slice.endPlaceCode)
      const details = await extractDepartureDetails(text, slice, startsAtDepot, endsAtDepot)

      return {
        startsAtDepot,
        endsAtDepot,
        slice: {
          ...slice,
          depotExitAt: startsAtDepot ? details.depotExitAt : "",
          depotReturnAt: endsAtDepot ? details.depotReturnAt : "",
          lineUpAt: startsAtDepot ? details.lineUpAt : "",
          direction: details.direction
        }
      }
    })
  )
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
  return text.match(/\b([A-Z][A-Z]\d{1,3})\b/)?.[1] || null
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
    /\b(\d{2})\s*-\s*(\d{1,3})\s+(\d{1,2}:\d{2})\s+([A-Z]{3,8}(?:_[A-Z0-9]+)?)\s+(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})\s+([A-Z]{3,8}(?:_[A-Z0-9]+)?)\s+(\d{1,2}:\d{2})\b/g

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
      startPlace: await DB.formatPlace(startPlaceCode),
      endPlaceCode,
      endPlace: await DB.formatPlace(endPlaceCode)
    })
  }

  return removeDuplicateSlices(slices)
}

async function extractDepartureDetails(text, slice, startsAtDepot, endsAtDepot) {
  const section = extractVehicleSection(text, slice)

  if (!section) {
    return {
      depotExitAt: "",
      depotReturnAt: "",
      lineUpAt: "",
      direction: ""
    }
  }

  const lines = rebuildSectionLines(section)

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

function extractVehicleSection(text, slice) {
  const header = new RegExp(
    `\\bVoiture\\s+${escapeRegex(slice.lineCode)}\\s*-\\s*${escapeRegex(
      String(slice.vehicle)
    )}\\b`,
    "i"
  )

  const match = header.exec(text)

  if (!match) {
    return ""
  }

  const start = match.index + match[0].length
  const rest = text.slice(start)
  const nextHeader = /\bVoiture\s+\d{1,3}\s*-\s*\d{1,3}\b/i.exec(rest)
  const end = nextHeader ? start + nextHeader.index : text.length

  return text.slice(start, end).trim()
}

function rebuildSectionLines(section) {
  return section
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

function isTramLineCode(value) {
  return TRAM_LINE_CODES.has(normalizeCode(value))
}

/*
 * La direction est ce qu'affiche la girouette, et non le dernier arrêt que
 * le conducteur dessert : une tranche peut finir sur une relève en cours
 * de ligne. Sur la ligne 2, un trajet parti de Jardin des Deux Rives et
 * relevé à Montagne Verte va à Lingolsheim Gare. Rien sur la carte ne le
 * dit ; seuls les terminus de lines.json permettent de le déduire, et
 * seulement sur une ligne à deux terminus dont chaque trajet part de l'un
 * pour finir à l'autre. Partout ailleurs, branches ou trajets partiels
 * rendent la déduction fausse, et le dernier arrêt desservi reste la
 * meilleure réponse.
 */
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

function isDirectionBoundary(line) {
  return (
    isActivityLine(line) || /^(Déplacement|Coupure|Pause-café|Prép\.\s*sortie)\b/i.test(line)
  )
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

    if (
      String(slice.startPlace).startsWith("Code ") ||
      String(slice.endPlace).startsWith("Code ")
    ) {
      warnings.push(`Lieu inconnu dans la tranche ${number}`)
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
