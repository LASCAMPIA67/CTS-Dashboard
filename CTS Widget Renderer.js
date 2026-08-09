// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: cyan; icon-glyph: rectangle.3.group;

const UTILS = importModule("CTS Utils")
const WIDGET_ENGINE = importModule("CTS Widget Engine")
const THEME = importModule("CTS Widget Theme")

const VALID_FAMILIES = ["small", "medium", "large"]

function createWidget(family, context) {
  const validation = validateContext(context)

  if (!validation.valid) {
    return createErrorWidget(
      "Service invalide",
      validation.error
    )
  }

  switch (normalizeFamily(family)) {
    case "small":
      return createSmallWidget(context)
    case "medium":
      return createMediumWidget(context)
    default:
      return createLargeWidget(context)
  }
}

function createLargeWidget(context) {
  const {
    service,
    state,
    stats,
    displaySlice: focus
  } = context

  const density = getLargeDensity(service.slices.length)
  const widget = THEME.createBaseWidget(state.type)

  widget.setPadding(
    density.paddingTop,
    density.paddingHorizontal,
    density.paddingBottom,
    density.paddingHorizontal
  )

  addHeader(widget, service, state, density.header)
  widget.addSpacer(density.sectionGap)
  addLargeTimingCard(widget, focus, state, density)
  widget.addSpacer(density.sectionGap)
  addSlicesList(widget, service, state, density)
  widget.addSpacer(density.sectionGap)
  addStatsSummary(widget, stats, density)

  return widget
}

function addLargeTimingCard(widget, focus, state, density) {
  const card = addSurface(widget, {
    padding: [
      density.timingPadding,
      density.surfacePaddingHorizontal,
      density.timingPadding,
      density.surfacePaddingHorizontal
    ],
    radius: density.surfaceRadius,
    backgroundAlpha: 0.055,
    borderAlpha: 0.085,
    vertical: true
  })

  const labels = card.addStack()
  labels.centerAlignContent()

  const startLabel = addText(
    labels,
    getTimingStartLabel(state),
    Font.semiboldSystemFont(density.timingLabelSize),
    secondary(),
    1
  )
  startLabel.leftAlignText()
  labels.addSpacer()

  const endLabel = addText(
    labels,
    "FIN DE TRANCHE",
    Font.semiboldSystemFont(density.timingLabelSize),
    secondary(),
    1
  )
  endLabel.rightAlignText()

  card.addSpacer(density.timingLabelGap)

  const times = card.addStack()
  times.centerAlignContent()

  const startTime = addText(
    times,
    focus.start,
    Font.boldMonospacedSystemFont(density.timeSize),
    THEME.getPrimaryTextColor(),
    1
  )
  startTime.leftAlignText()

  times.addSpacer(density.timingGap)
  addArrowBadge(times, state, density.arrowSize)
  times.addSpacer(density.timingGap)

  const endTime = addText(
    times,
    focus.end,
    Font.boldMonospacedSystemFont(density.timeSize),
    THEME.getPrimaryTextColor(),
    1
  )
  endTime.rightAlignText()

  card.addSpacer(density.placeGap)

  const places = card.addStack()
  places.centerAlignContent()

  const from = addText(
    places,
    focus.from,
    Font.mediumSystemFont(
      fitFont(
        density.placeSize,
        focus.from,
        density.placeSoftLimit,
        density.placeMinimumSize
      )
    ),
    secondary(),
    1
  )
  from.leftAlignText()
  places.addSpacer(density.placePairGap)

  const to = addText(
    places,
    focus.to,
    Font.mediumSystemFont(
      fitFont(
        density.placeSize,
        focus.to,
        density.placeSoftLimit,
        density.placeMinimumSize
      )
    ),
    secondary(),
    1
  )
  to.rightAlignText()

  if (!hasDepartureDetails(focus)) {
    return
  }

  card.addSpacer(density.departureSectionGap)
  addDivider(card)
  card.addSpacer(density.departureSectionGap)
  addDepartureRows(card, focus, state, density)
}

function getTimingStartLabel(state) {
  switch (state?.type) {
    case "WORK":
      return "DÉBUT DE TRANCHE"
    case "DONE":
      return "DERNIÈRE TRANCHE"
    default:
      return "PROCHAINE TRANCHE"
  }
}

function addDepartureRows(parent, slice, state, density) {
  const entries = []

  if (hasDepotTiming(slice)) {
    entries.push({
      label: "PRISE DE SERVICE",
      value: slice.dutyStart,
      time: true
    })
    entries.push({
      label: "SORTIE DÉPÔT",
      value: slice.depotExitAt,
      time: true
    })
  }

  if (slice.lineUpAt) {
    entries.push({
      label: getOperationStartLabel(slice),
      value: slice.lineUpAt,
      time: false
    })
  }

  if (slice.direction) {
    entries.push({
      label: "DIRECTION",
      value: slice.direction,
      time: false
    })
  }

  entries.forEach((entry, index) => {
    const row = parent.addStack()
    row.centerAlignContent()

    const label = addText(
      row,
      entry.label,
      Font.semiboldSystemFont(density.departureLabelSize),
      secondary(),
      1
    )
    label.leftAlignText()

    row.addSpacer()

    const value = addText(
      row,
      entry.value,
      entry.time
        ? Font.boldMonospacedSystemFont(density.departureTimeSize)
        : Font.semiboldSystemFont(
            fitFont(
              density.departureValueSize,
              entry.value,
              density.departureSoftLimit,
              density.departureMinimumSize
            )
          ),
      accent(state),
      1
    )
    value.rightAlignText()

    if (index < entries.length - 1) {
      parent.addSpacer(density.departureRowGap)
    }
  })
}

function addArrowBadge(parent, state, size) {
  const badge = parent.addStack()
  badge.size = new Size(size, size)
  badge.cornerRadius = size / 2
  badge.backgroundColor = accentAlpha(state, 0.11)
  badge.borderWidth = 0.5
  badge.borderColor = accentAlpha(state, 0.24)
  badge.centerAlignContent()
  badge.addSpacer()

  addSymbol(
    badge,
    "arrow.right",
    Math.max(10, size * 0.48),
    accent(state)
  )

  badge.addSpacer()
}

function addSlicesList(widget, service, state, density) {
  const list = addSurface(widget, {
    padding: [
      density.listPadding,
      density.listPadding,
      density.listPadding,
      density.listPadding
    ],
    radius: density.listRadius,
    backgroundAlpha: 0.05,
    borderAlpha: 0.075,
    vertical: true
  })

  addSectionHeader(
    list,
    "PROGRAMME",
    `${service.slices.length} tranche${
      service.slices.length > 1 ? "s" : ""
    }`,
    density.sectionHeaderSize
  )

  list.addSpacer(density.headerGap)

  service.slices.forEach((slice, index) => {
    addSliceRow(list, slice, state, density)

    if (index < service.slices.length - 1) {
      list.addSpacer(density.rowGap)
    }
  })
}

function addSliceRow(parent, slice, state, density) {
  const active = isSliceActive(slice, state)
  const duration = UTILS.durationMinutes(slice.start, slice.end)

  const row = parent.addStack()
  row.centerAlignContent()
  row.setPadding(
    density.rowPaddingVertical,
    density.rowPaddingHorizontal,
    density.rowPaddingVertical,
    density.rowPaddingHorizontal
  )
  row.cornerRadius = density.rowRadius
  row.backgroundColor = active
    ? accentAlpha(state, 0.085)
    : THEME.translucentWhite(0.018)
  row.borderWidth = 0.5
  row.borderColor = active
    ? accentAlpha(state, 0.18)
    : THEME.translucentWhite(0.035)

  addSliceNumber(row, slice, active, state, density)
  row.addSpacer(density.itemGap)

  const body = row.addStack()
  body.layoutVertically()

  const top = body.addStack()
  top.centerAlignContent()

  const titleValue = `Ligne ${slice.line} · Voiture ${slice.vehicle}`
  const title = addText(
    top,
    titleValue,
    Font.boldSystemFont(
      fitFont(
        density.sliceTitleSize,
        titleValue,
        density.titleSoftLimit,
        density.titleMinimumSize
      )
    ),
    active
      ? THEME.getPrimaryTextColor()
      : THEME.getInactiveTextColor(),
    1
  )
  title.leftAlignText()

  top.addSpacer()

  const range = addText(
    top,
    `${slice.start}–${slice.end}`,
    Font.boldMonospacedSystemFont(density.rangeSize),
    active ? accent(state) : THEME.getInactiveTimeColor(),
    1
  )
  range.rightAlignText()

  body.addSpacer(density.detailGap)

  const bottom = body.addStack()
  bottom.centerAlignContent()

  const routeValue = `${slice.from} → ${slice.to}`
  const route = addText(
    bottom,
    routeValue,
    Font.mediumSystemFont(
      fitFont(
        density.sliceDetailSize,
        routeValue,
        density.routeSoftLimit,
        density.routeMinimumSize
      )
    ),
    secondary(),
    1
  )
  route.leftAlignText()

  bottom.addSpacer()

  const durationText = addText(
    bottom,
    UTILS.formatDuration(duration),
    Font.mediumSystemFont(density.durationSize),
    secondary(),
    1
  )
  durationText.rightAlignText()
}

function addSliceNumber(row, slice, active, state, density) {
  const badge = row.addStack()
  badge.size = new Size(density.numberSize, density.numberSize)
  badge.cornerRadius = density.numberSize / 2
  badge.backgroundColor = active
    ? accentAlpha(state, 0.2)
    : THEME.translucentWhite(0.065)
  badge.borderWidth = 0.5
  badge.borderColor = active
    ? accentAlpha(state, 0.28)
    : THEME.translucentWhite(0.06)
  badge.centerAlignContent()
  badge.addSpacer()

  addText(
    badge,
    slice.index,
    Font.boldSystemFont(density.numberFont),
    active ? accent(state) : secondary(),
    1
  )

  badge.addSpacer()
}

function addStatsSummary(widget, stats, density) {
  const summary = widget.addStack()
  summary.centerAlignContent()
  summary.addSpacer()

  addStatCard(
    summary,
    UTILS.formatDuration(stats.work),
    "Travail",
    {
      paddingHorizontal: density.statPaddingHorizontal,
      paddingVertical: density.statPaddingVertical,
      valueSize: density.statValueSize,
      labelSize: density.statLabelSize
    }
  )

  summary.addSpacer(density.statGap)

  addStatCard(
    summary,
    UTILS.formatDuration(stats.amplitude),
    "Amplitude",
    {
      paddingHorizontal: density.statPaddingHorizontal,
      paddingVertical: density.statPaddingVertical,
      valueSize: density.statValueSize,
      labelSize: density.statLabelSize
    }
  )

  summary.addSpacer()
}

function createMediumWidget(context) {
  const {
    service,
    state,
    stats,
    displaySlice: focus
  } = context

  const density = getMediumDensity()
  const widget = THEME.createBaseWidget(state.type)

  widget.setPadding(
    density.paddingTop,
    density.paddingHorizontal,
    density.paddingBottom,
    density.paddingHorizontal
  )

  addHeader(widget, service, state, density.header)
  widget.addSpacer(density.sectionGap)

  const card = addSurface(widget, {
    padding: [
      density.cardPaddingVertical,
      density.cardPaddingHorizontal,
      density.cardPaddingVertical,
      density.cardPaddingHorizontal
    ],
    radius: density.surfaceRadius,
    backgroundAlpha: 0.055,
    borderAlpha: 0.08,
    vertical: true
  })

  const top = card.addStack()
  top.centerAlignContent()

  const titleValue = `Ligne ${focus.line} · Voiture ${focus.vehicle}`
  const title = addText(
    top,
    titleValue,
    Font.boldSystemFont(
      fitFont(
        density.titleSize,
        titleValue,
        density.titleSoftLimit,
        density.titleMinimumSize
      )
    ),
    THEME.getPrimaryTextColor(),
    1
  )
  title.leftAlignText()

  top.addSpacer()

  const range = addText(
    top,
    `${focus.start} → ${focus.end}`,
    Font.boldMonospacedSystemFont(density.rangeSize),
    THEME.getPrimaryTextColor(),
    1
  )
  range.rightAlignText()

  card.addSpacer(density.detailGap)

  const second = card.addStack()
  second.centerAlignContent()

  const route = addText(
    second,
    focus.from,
    Font.mediumSystemFont(
      fitFont(
        density.routeSize,
        focus.from,
        density.routeSoftLimit,
        density.routeMinimumSize
      )
    ),
    secondary(),
    1
  )
  route.leftAlignText()

  second.addSpacer()

  const duration = addText(
    second,
    UTILS.formatDuration(
      UTILS.durationMinutes(focus.start, focus.end)
    ),
    Font.semiboldSystemFont(density.durationSize),
    accent(state),
    1
  )
  duration.rightAlignText()

  if (hasDepartureDetails(focus)) {
    card.addSpacer(density.departureGap)
    addDivider(card)
    card.addSpacer(density.departureGap)
    addDepartureRows(card, focus, state, density)
  }

  widget.addSpacer(density.footerGap)

  const footer = widget.addStack()
  footer.centerAlignContent()

  addText(
    footer,
    `${stats.count} tranches · ${UTILS.formatDuration(stats.work)}`,
    Font.semiboldSystemFont(density.footerSize),
    secondary(),
    1
  )

  footer.addSpacer()

  addText(
    footer,
    `Fin ${stats.end}`,
    Font.boldMonospacedSystemFont(density.footerTimeSize),
    accent(state),
    1
  )

  return widget
}

function createSmallWidget(context) {
  const {
    service,
    state,
    stats,
    displaySlice: focus
  } = context

  const density = getSmallDensity()
  const widget = THEME.createBaseWidget(state.type)

  widget.setPadding(
    density.paddingTop,
    density.paddingHorizontal,
    density.paddingBottom,
    density.paddingHorizontal
  )

  const header = widget.addStack()
  header.centerAlignContent()

  addText(
    header,
    service.number,
    Font.boldSystemFont(density.serviceSize),
    THEME.getPrimaryTextColor(),
    1
  )

  header.addSpacer()
  addStatusPill(
    header,
    state,
    density.badgeSize,
    density.badgePadding
  )

  widget.addSpacer(density.sectionGap)

  addText(
    widget,
    `Ligne ${focus.line}`,
    Font.boldSystemFont(density.lineSize),
    THEME.getPrimaryTextColor(),
    1
  )

  widget.addSpacer(2)

  addText(
    widget,
    `Voiture ${focus.vehicle}`,
    Font.semiboldSystemFont(density.vehicleSize),
    accent(state),
    1
  )

  widget.addSpacer(density.sectionGap)

  const timingCard = addSurface(widget, {
    padding: [
      density.timePaddingVertical,
      density.timePaddingHorizontal,
      density.timePaddingVertical,
      density.timePaddingHorizontal
    ],
    radius: density.surfaceRadius,
    backgroundAlpha: 0.05,
    borderAlpha: 0.075
  })

  addSmallTime(timingCard, "DÉBUT", focus.start, "left", density)
  timingCard.addSpacer()

  addSymbol(
    timingCard,
    "arrow.right",
    density.arrowSize,
    secondary()
  )

  timingCard.addSpacer()
  addSmallTime(timingCard, "FIN", focus.end, "right", density)

  widget.addSpacer(density.sectionGap)

  if (hasDepartureDetails(focus)) {
    addDepartureSummary(widget, focus, state, {
      fontSize: density.departureSize,
      softLimit: density.departureSoftLimit,
      minimumSize: density.departureMinimumSize
    })
    widget.addSpacer(density.departureGap)
  }

  addText(
    widget,
    `${stats.count} tranches · ${UTILS.formatDuration(stats.work)}`,
    Font.mediumSystemFont(density.footerSize),
    secondary(),
    1
  )

  return widget
}

function hasDepotTiming(slice) {
  return Boolean(slice?.dutyStart && slice?.depotExitAt)
}

function hasDepartureDetails(slice) {
  return Boolean(
    slice &&
    (slice.depotExitAt || slice.lineUpAt || slice.direction)
  )
}

function isTramSlice(slice) {
  const lineCode = String(slice?.lineCode || "").trim()
  return ["80", "81", "82", "83", "84", "85"].includes(lineCode)
}

function getOperationStartLabel(slice) {
  return isTramSlice(slice)
    ? "DÉBUT EXPLOITATION"
    : "MISE EN LIGNE"
}

function buildDepartureSummary(slice) {
  const lines = []

  if (hasDepotTiming(slice)) {
    lines.push(
      `Prise ${slice.dutyStart} · Sortie dépôt ${slice.depotExitAt}`
    )
  }

  if (slice?.lineUpAt) {
    lines.push(
      `${isTramSlice(slice) ? "Début exploitation" : "Mise en ligne"} : ${slice.lineUpAt}`
    )
  }

  if (slice?.direction) {
    lines.push(`Direction : ${slice.direction}`)
  }

  return lines
}

function addDepartureSummary(parent, slice, state, options = {}) {
  const lines = buildDepartureSummary(slice)

  if (!lines.length) {
    return null
  }

  const container = parent.addStack()
  container.layoutVertically()
  const baseFontSize = options.fontSize || 9

  lines.forEach((line, index) => {
    addText(
      container,
      line,
      Font.semiboldSystemFont(
        fitFont(
          baseFontSize,
          line,
          options.softLimit || 40,
          options.minimumSize || Math.max(6.5, baseFontSize - 3)
        )
      ),
      accent(state),
      1
    )

    if (index < lines.length - 1) {
      container.addSpacer(1)
    }
  })

  return container
}

function addSmallTime(parent, label, time, align, density) {
  const block = parent.addStack()
  block.layoutVertically()

  const labelText = addText(
    block,
    label,
    Font.semiboldSystemFont(density.timeLabelSize),
    secondary(),
    1
  )

  const timeText = addText(
    block,
    time,
    Font.boldMonospacedSystemFont(density.timeSize),
    THEME.getPrimaryTextColor(),
    1
  )

  alignText(labelText, align)
  alignText(timeText, align)
}

function addHeader(parent, service, state, options) {
  const header = parent.addStack()
  header.centerAlignContent()

  const icon = header.addStack()
  icon.size = new Size(options.iconSize, options.iconSize)
  icon.cornerRadius = options.iconSize / 2
  icon.backgroundColor = THEME.translucentWhite(0.075)
  icon.borderWidth = 0.5
  icon.borderColor = THEME.translucentWhite(0.09)
  icon.centerAlignContent()
  icon.addSpacer()

  addSymbol(
    icon,
    getServiceTransportIcon(service),
    options.symbolSize,
    accent(state)
  )

  icon.addSpacer()
  header.addSpacer(options.iconGap)

  const identity = header.addStack()
  identity.layoutVertically()

  addText(
    identity,
    service.number,
    Font.boldSystemFont(options.titleSize),
    THEME.getPrimaryTextColor(),
    1
  )

  identity.addSpacer(1)

  addText(
    identity,
    WIDGET_ENGINE.formatServiceDate(service),
    Font.mediumSystemFont(options.dateSize),
    secondary(),
    1
  )

  header.addSpacer()
  addStatusPill(
    header,
    state,
    options.badgeSize,
    options.badgePadding
  )
}

function getServiceTransportIcon(service) {
  const slices = Array.isArray(service?.slices)
    ? service.slices
    : []

  return slices.some(slice => isTramSlice(slice))
    ? "tram.fill"
    : "bus.fill"
}

function addStatusPill(parent, state, fontSize, padding = [5, 8, 5, 8]) {
  const pill = parent.addStack()

  pill.setPadding(
    padding[0],
    padding[1],
    padding[2],
    padding[3]
  )
  pill.cornerRadius = 10
  pill.backgroundColor = accentAlpha(state, 0.1)
  pill.borderWidth = 0.5
  pill.borderColor = accentAlpha(state, 0.22)

  addText(
    pill,
    state.label,
    Font.semiboldSystemFont(fontSize),
    accent(state),
    1
  )

  return pill
}

function addSectionHeader(parent, title, detail, fontSize = 8) {
  const row = parent.addStack()
  row.centerAlignContent()

  addText(
    row,
    title,
    Font.semiboldSystemFont(fontSize),
    secondary(),
    1
  )

  row.addSpacer()

  addText(
    row,
    detail,
    Font.mediumSystemFont(fontSize),
    secondary(),
    1
  )
}

function addDivider(parent) {
  const divider = parent.addStack()
  divider.size = new Size(0, 1)
  divider.backgroundColor = THEME.translucentWhite(0.07)
  divider.addSpacer()
  return divider
}

function addSurface(parent, options = {}) {
  const stack = parent.addStack()
  const padding = options.padding || [0, 0, 0, 0]

  if (options.vertical) {
    stack.layoutVertically()
  }

  stack.setPadding(
    padding[0],
    padding[1],
    padding[2],
    padding[3]
  )
  stack.cornerRadius = options.radius ?? 14
  stack.backgroundColor = THEME.translucentWhite(
    options.backgroundAlpha ?? 0.05
  )
  stack.borderWidth = 0.5
  stack.borderColor = THEME.translucentWhite(
    options.borderAlpha ?? 0.07
  )

  return stack
}

function addStatCard(parent, value, label, options = {}) {
  const card = addSurface(parent, {
    padding: [
      options.paddingVertical || 5,
      options.paddingHorizontal || 18,
      options.paddingVertical || 5,
      options.paddingHorizontal || 18
    ],
    radius: 12,
    backgroundAlpha: 0.05,
    borderAlpha: 0.065,
    vertical: true
  })

  card.centerAlignContent()

  addCenteredText(
    card,
    value,
    Font.boldSystemFont(options.valueSize || 14),
    THEME.getPrimaryTextColor()
  )

  card.addSpacer(1)

  addCenteredText(
    card,
    label,
    Font.mediumSystemFont(options.labelSize || 7.5),
    secondary()
  )

  return card
}

function addCenteredText(parent, value, font, color) {
  const row = parent.addStack()
  row.centerAlignContent()
  row.addSpacer()

  const text = addText(row, value, font, color, 1)
  text.centerAlignText()
  row.addSpacer()

  return text
}

function createErrorWidget(title, message) {
  const widget = new ListWidget()
  widget.backgroundColor = THEME.getErrorBackgroundColor()
  widget.setPadding(18, 18, 18, 18)

  const header = widget.addStack()
  header.centerAlignContent()

  const icon = header.addStack()
  icon.size = new Size(34, 34)
  icon.cornerRadius = 17
  icon.backgroundColor = THEME.translucentWhite(0.08)
  icon.centerAlignContent()
  icon.addSpacer()

  addSymbol(
    icon,
    "exclamationmark.triangle.fill",
    15,
    THEME.getPrimaryTextColor()
  )

  icon.addSpacer()
  header.addSpacer(10)

  addText(
    header,
    title,
    Font.boldSystemFont(17),
    THEME.getPrimaryTextColor(),
    1
  )

  widget.addSpacer(10)

  const card = addSurface(widget, {
    padding: [11, 12, 11, 12],
    radius: 14,
    backgroundAlpha: 0.05,
    borderAlpha: 0.07
  })

  addText(
    card,
    message,
    Font.mediumSystemFont(11),
    secondary(),
    4
  )

  return widget
}

function addSymbol(parent, name, size, color) {
  const symbol = SFSymbol.named(name)

  if (!symbol) {
    return null
  }

  symbol.applyFont(Font.systemFont(size))

  const image = parent.addImage(symbol.image)
  image.imageSize = new Size(size, size)
  image.tintColor = color

  return image
}

function addText(parent, value, font, color, lines = 1) {
  const element = parent.addText(String(value ?? ""))
  element.font = font
  element.textColor = color
  element.lineLimit = lines
  return element
}

function alignText(text, alignment) {
  if (alignment === "right") {
    text.rightAlignText()
  } else if (alignment === "center") {
    text.centerAlignText()
  } else {
    text.leftAlignText()
  }
}

function isSliceActive(slice, state) {
  return Boolean(
    state.current?.index === slice.index ||
    (!state.current && state.next?.index === slice.index)
  )
}

function accent(state) {
  return THEME.getAccentColor(state.type)
}

function accentAlpha(state, alpha) {
  return new Color(THEME.getAccentHex(state.type), alpha)
}

function secondary() {
  return THEME.getSecondaryColor()
}

function normalizeFamily(value) {
  const family = String(value || "")
    .trim()
    .toLowerCase()

  return VALID_FAMILIES.includes(family)
    ? family
    : "large"
}

function getLargeDensity(sliceCountValue) {
  const sliceCount = Math.max(1, Number(sliceCountValue) || 1)

  if (sliceCount >= 5) {
    return {
      paddingTop: 13,
      paddingBottom: 11,
      paddingHorizontal: 15,
      sectionGap: 4,
      surfacePaddingHorizontal: 10,
      surfaceRadius: 15,
      timingPadding: 5,
      timingLabelSize: 6.8,
      timingLabelGap: 2,
      timeSize: 21,
      timingGap: 5,
      arrowSize: 22,
      placeGap: 2,
      placePairGap: 8,
      placeSize: 8.5,
      placeSoftLimit: 18,
      placeMinimumSize: 7,
      departureSectionGap: 3,
      departureRowGap: 2,
      departureLabelSize: 6.5,
      departureValueSize: 7.5,
      departureTimeSize: 8.5,
      departureSoftLimit: 22,
      departureMinimumSize: 6.5,
      listPadding: 6,
      listRadius: 14,
      sectionHeaderSize: 7,
      headerGap: 4,
      rowGap: 3,
      rowPaddingVertical: 3,
      rowPaddingHorizontal: 4,
      rowRadius: 10,
      itemGap: 5,
      numberSize: 18,
      numberFont: 8,
      sliceTitleSize: 9,
      sliceDetailSize: 7.2,
      titleSoftLimit: 26,
      titleMinimumSize: 7.5,
      routeSoftLimit: 34,
      routeMinimumSize: 6.5,
      rangeSize: 8.5,
      durationSize: 7,
      detailGap: 1,
      statPaddingHorizontal: 17,
      statPaddingVertical: 4,
      statGap: 6,
      statValueSize: 12.5,
      statLabelSize: 6.8,
      header: {
        iconSize: 31,
        symbolSize: 14,
        titleSize: 17,
        dateSize: 8.5,
        badgeSize: 8.5,
        iconGap: 8,
        badgePadding: [4, 7, 4, 7]
      }
    }
  }

  if (sliceCount >= 3) {
    return {
      paddingTop: 15,
      paddingBottom: 12,
      paddingHorizontal: 16,
      sectionGap: 5,
      surfacePaddingHorizontal: 11,
      surfaceRadius: 16,
      timingPadding: 6,
      timingLabelSize: 7.2,
      timingLabelGap: 3,
      timeSize: 23,
      timingGap: 6,
      arrowSize: 24,
      placeGap: 2,
      placePairGap: 10,
      placeSize: 9,
      placeSoftLimit: 18,
      placeMinimumSize: 7.2,
      departureSectionGap: 3,
      departureRowGap: 3,
      departureLabelSize: 7,
      departureValueSize: 8.5,
      departureTimeSize: 9.5,
      departureSoftLimit: 24,
      departureMinimumSize: 7,
      listPadding: 7,
      listRadius: 15,
      sectionHeaderSize: 7.5,
      headerGap: 5,
      rowGap: 4,
      rowPaddingVertical: 4,
      rowPaddingHorizontal: 5,
      rowRadius: 10,
      itemGap: 6,
      numberSize: 21,
      numberFont: 9,
      sliceTitleSize: 10,
      sliceDetailSize: 8,
      titleSoftLimit: 27,
      titleMinimumSize: 8,
      routeSoftLimit: 35,
      routeMinimumSize: 6.8,
      rangeSize: 9.5,
      durationSize: 7.5,
      detailGap: 2,
      statPaddingHorizontal: 19,
      statPaddingVertical: 4,
      statGap: 7,
      statValueSize: 13,
      statLabelSize: 7,
      header: {
        iconSize: 34,
        symbolSize: 16,
        titleSize: 19,
        dateSize: 9,
        badgeSize: 9,
        iconGap: 9,
        badgePadding: [4, 7, 4, 7]
      }
    }
  }

  return {
    paddingTop: 17,
    paddingBottom: 14,
    paddingHorizontal: 18,
    sectionGap: 7,
    surfacePaddingHorizontal: 12,
    surfaceRadius: 17,
    timingPadding: 7,
    timingLabelSize: 8,
    timingLabelGap: 3,
    timeSize: 27,
    timingGap: 7,
    arrowSize: 28,
    placeGap: 3,
    placePairGap: 12,
    placeSize: 10.5,
    placeSoftLimit: 18,
    placeMinimumSize: 7.5,
    departureSectionGap: 4,
    departureRowGap: 4,
    departureLabelSize: 7.5,
    departureValueSize: 10,
    departureTimeSize: 11,
    departureSoftLimit: 26,
    departureMinimumSize: 7.5,
    listPadding: 9,
    listRadius: 16,
    sectionHeaderSize: 8,
    headerGap: 6,
    rowGap: 6,
    rowPaddingVertical: 5,
    rowPaddingHorizontal: 6,
    rowRadius: 11,
    itemGap: 8,
    numberSize: 25,
    numberFont: 10.5,
    sliceTitleSize: 12,
    sliceDetailSize: 9.5,
    titleSoftLimit: 28,
    titleMinimumSize: 9,
    routeSoftLimit: 36,
    routeMinimumSize: 7.4,
    rangeSize: 11,
    durationSize: 9,
    detailGap: 3,
    statPaddingHorizontal: 24,
    statPaddingVertical: 5,
    statGap: 8,
    statValueSize: 14,
    statLabelSize: 7.5,
    header: {
      iconSize: 38,
      symbolSize: 18,
      titleSize: 21,
      dateSize: 10,
      badgeSize: 10,
      iconGap: 11,
      badgePadding: [5, 8, 5, 8]
    }
  }
}

function getMediumDensity() {
  return {
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 16,
    sectionGap: 9,
    cardPaddingVertical: 10,
    cardPaddingHorizontal: 12,
    surfaceRadius: 15,
    titleSize: 15,
    titleSoftLimit: 28,
    titleMinimumSize: 11,
    rangeSize: 13,
    detailGap: 5,
    routeSize: 10.5,
    routeSoftLimit: 30,
    routeMinimumSize: 8,
    durationSize: 9.5,
    departureGap: 5,
    departureLabelSize: 7,
    departureValueSize: 9,
    departureTimeSize: 9.5,
    departureSoftLimit: 28,
    departureMinimumSize: 7,
    departureRowGap: 3,
    footerGap: 8,
    footerSize: 9,
    footerTimeSize: 10,
    header: {
      iconSize: 31,
      symbolSize: 14,
      titleSize: 18,
      dateSize: 9,
      badgeSize: 9,
      iconGap: 9,
      badgePadding: [5, 8, 5, 8]
    }
  }
}

function getSmallDensity() {
  return {
    paddingTop: 12,
    paddingBottom: 11,
    paddingHorizontal: 13,
    serviceSize: 15,
    badgeSize: 8,
    badgePadding: [3, 6, 3, 6],
    sectionGap: 7,
    lineSize: 21,
    vehicleSize: 10,
    surfaceRadius: 11,
    timePaddingVertical: 6,
    timePaddingHorizontal: 8,
    timeLabelSize: 6.5,
    timeSize: 14,
    arrowSize: 10,
    departureSize: 8.5,
    departureSoftLimit: 30,
    departureMinimumSize: 6.5,
    departureGap: 4,
    footerSize: 9
  }
}

function fitFont(baseSize, value, softLimit, minimumSize) {
  const safeBaseSize = Math.max(1, Number(baseSize) || 1)
  const safeMinimumSize = Math.min(
    safeBaseSize,
    Math.max(1, Number(minimumSize) || safeBaseSize * 0.7)
  )

  const length = String(value ?? "").trim().length
  const limit = Math.max(1, Number(softLimit) || 1)

  if (length <= limit) {
    return safeBaseSize
  }

  const ratio = Math.max(0.7, limit / length)
  return Math.round(
    Math.max(safeMinimumSize, safeBaseSize * ratio) * 2
  ) / 2
}

function validateContext(context) {
  if (!context || typeof context !== "object") {
    return {
      valid: false,
      error: "Le contexte du widget est absent."
    }
  }

  if (
    !context.service ||
    !context.state ||
    !context.stats ||
    !context.displaySlice
  ) {
    return {
      valid: false,
      error: "Les données nécessaires au widget sont incomplètes."
    }
  }

  if (
    !Array.isArray(context.service.slices) ||
    !context.service.slices.length
  ) {
    return {
      valid: false,
      error: "Aucune tranche ne peut être affichée."
    }
  }

  return {
    valid: true,
    error: ""
  }
}

module.exports = {
  createWidget,
  createLargeWidget,
  createMediumWidget,
  createSmallWidget,
  createErrorWidget,
  addText,
  addSymbol,
  addStatCard
}
