// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: light-gray; icon-glyph: magic;
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
    return createErrorWidget("Service invalide", validation.error)
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

  const widget = THEME.createBaseWidget(state.type)
  const density = getLargeDensity(service.slices)

  widget.setPadding(17, 18, 14, 18)

  addHeader(widget, service, state, {
    iconSize: 38,
    symbolSize: 18,
    titleSize: 21,
    dateSize: 10,
    badgeSize: 10,
    iconGap: 11
  })

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
      12,
      density.timingPadding,
      12
    ],
    radius: 17,
    backgroundAlpha: 0.055,
    borderAlpha: 0.085,
    vertical: true
  })

  const row = card.addStack()
  row.centerAlignContent()

  addTimeColumn(row, {
    label: getTimingStartLabel(state),
    time: focus.start,
    place: focus.from,
    width: density.timeColumnWidth,
    timeSize: density.timeSize,
    placeSize: density.placeSize,
    align: "left"
  })

  row.addSpacer(7)
  addArrowBadge(row, state, density.arrowSize)
  row.addSpacer(7)

  addTimeColumn(row, {
    label: "FIN DE TRANCHE",
    time: focus.end,
    place: focus.to,
    width: density.timeColumnWidth,
    timeSize: density.timeSize,
    placeSize: density.placeSize,
    align: "right"
  })

  if (!hasDepartureDetails(focus)) return

  card.addSpacer(density.departureSectionGap)
  addDivider(card)
  card.addSpacer(density.departureSectionGap)
  addLargeDeparturePanel(card, focus, state, density)
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

function addTimeColumn(parent, options) {
  const {
    label,
    time,
    place,
    width,
    timeSize,
    placeSize,
    align
  } = options

  const column = parent.addStack()
  column.layoutVertically()
  column.size = new Size(width, 0)

  const labelText = addText(
    column,
    label,
    Font.semiboldSystemFont(8),
    secondary(),
    1,
    0.72
  )

  column.addSpacer(3)

  const timeText = addText(
    column,
    time,
    Font.boldMonospacedSystemFont(timeSize),
    THEME.getPrimaryTextColor(),
    1,
    0.85
  )

  column.addSpacer(3)

  const placeText = addText(
    column,
    place,
    Font.mediumSystemFont(
      adaptiveFontSize(
        placeSize,
        place,
        18,
        Math.max(7, placeSize - 3)
      )
    ),
    secondary(),
    1,
    0.55
  )

  alignText(labelText, align)
  alignText(timeText, align)
  alignText(placeText, align)
}

function addLargeDeparturePanel(parent, slice, state, density) {
  if (hasDepotTiming(slice)) {
    addDepotTimingRow(parent, slice, state, density)

    if (slice.lineUpAt || slice.direction) {
      parent.addSpacer(density.departureRowGap)
    }
  }

  if (slice.lineUpAt || slice.direction) {
    addRouteDetailsRow(parent, slice, state, density)
  }
}

function addDepotTimingRow(parent, slice, state, density) {
  addAlignedInformationRow(
    parent,
    {
      label: "PRISE DE SERVICE",
      value: slice.dutyStart,
      monospaced: true
    },
    {
      label: "SORTIE DÉPÔT",
      value: slice.depotExitAt,
      monospaced: true
    },
    state,
    density,
    density.depotTimeSize
  )
}

function addRouteDetailsRow(parent, slice, state, density) {
  const lineUp = slice.lineUpAt
    ? {
        label: "MISE EN LIGNE",
        value: slice.lineUpAt,
        monospaced: false
      }
    : null

  const direction = slice.direction
    ? {
        label: "DIRECTION",
        value: slice.direction,
        monospaced: false
      }
    : null

  addAlignedInformationRow(
    parent,
    lineUp || direction,
    lineUp ? direction : null,
    state,
    density,
    density.departureSize
  )
}

function addAlignedInformationRow(
  parent,
  left,
  right,
  state,
  density,
  valueSize
) {
  const row = parent.addStack()
  row.centerAlignContent()

  if (left) {
    addDepartureBlock(
      row,
      left.label,
      left.value,
      state,
      {
        width: density.timeColumnWidth,
        valueSize,
        monospaced: left.monospaced,
        align: "left"
      }
    )
  } else {
    addEmptyColumn(row, density.timeColumnWidth)
  }

  row.addSpacer(density.timingCenterWidth)

  if (right) {
    addDepartureBlock(
      row,
      right.label,
      right.value,
      state,
      {
        width: density.timeColumnWidth,
        valueSize,
        monospaced: right.monospaced,
        align: "right"
      }
    )
  } else {
    addEmptyColumn(row, density.timeColumnWidth)
  }
}

function addEmptyColumn(parent, width) {
  const empty = parent.addStack()
  empty.size = new Size(width, 0)
  return empty
}

function addDepartureBlock(
  parent,
  label,
  value,
  state,
  options = {}
) {
  const block = parent.addStack()
  block.layoutVertically()

  if (options.width) {
    block.size = new Size(options.width, 0)
  }

  const labelText = addText(
    block,
    label,
    Font.semiboldSystemFont(7.5),
    secondary(),
    1,
    0.72
  )

  block.addSpacer(2)

  const baseValueSize = options.valueSize || 10

  const fontSize = adaptiveFontSize(
    baseValueSize,
    value,
    options.width
      ? Math.max(17, Math.floor(options.width / 6))
      : 28,
    Math.max(7, baseValueSize - 3)
  )

  const font = options.monospaced
    ? Font.boldMonospacedSystemFont(fontSize)
    : Font.semiboldSystemFont(fontSize)

  const valueText = addText(
    block,
    value,
    font,
    accent(state),
    1,
    0.45
  )

  alignText(labelText, options.align || "left")
  alignText(valueText, options.align || "left")
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
    Math.max(12, size - 14),
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
    radius: 16,
    backgroundAlpha: 0.05,
    borderAlpha: 0.075,
    vertical: true
  })

  addSectionHeader(
    list,
    "PROGRAMME",
    `${service.slices.length} tranche${
      service.slices.length > 1 ? "s" : ""
    }`
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
  const duration = UTILS.durationMinutes(
    slice.start,
    slice.end
  )

  const row = parent.addStack()
  row.centerAlignContent()

  row.setPadding(
    density.rowPadding,
    density.rowPadding,
    density.rowPadding,
    density.rowPadding
  )

  row.cornerRadius = 11
  row.backgroundColor = active
    ? accentAlpha(state, 0.085)
    : THEME.translucentWhite(0.018)

  row.borderWidth = 0.5
  row.borderColor = active
    ? accentAlpha(state, 0.18)
    : THEME.translucentWhite(0.035)

  addSliceNumber(row, slice, active, state, density)

  row.addSpacer(density.itemGap)

  addSliceDetails(row, slice, active, density)

  row.addSpacer()

  addSliceTiming(
    row,
    slice,
    duration,
    active,
    state,
    density
  )
}

function addSliceNumber(row, slice, active, state, density) {
  const badge = row.addStack()

  badge.size = new Size(
    density.numberSize,
    density.numberSize
  )

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
    1,
    1
  )

  badge.addSpacer()
}

function addSliceDetails(row, slice, active, density) {
  const details = row.addStack()

  details.layoutVertically()
  details.size = new Size(density.detailsWidth, 0)

  const title =
    `Ligne ${slice.line} · Voiture ${slice.vehicle}`

  addText(
    details,
    title,
    Font.boldSystemFont(
      density.sliceTitleResolvedSize
    ),
    active
      ? THEME.getPrimaryTextColor()
      : THEME.getInactiveTextColor(),
    1,
    1
  )

  details.addSpacer(density.detailGap)

  const route = `${slice.from} → ${slice.to}`

  addText(
    details,
    route,
    Font.mediumSystemFont(
      density.sliceDetailResolvedSize
    ),
    secondary(),
    1,
    1
  )
}

function addSliceTiming(
  row,
  slice,
  duration,
  active,
  state,
  density
) {
  const timing = row.addStack()

  timing.layoutVertically()
  timing.size = new Size(density.timingWidth, 0)

  const range = addText(
    timing,
    `${slice.start}–${slice.end}`,
    Font.boldMonospacedSystemFont(
      density.rangeSize
    ),
    active
      ? accent(state)
      : THEME.getInactiveTimeColor(),
    1,
    1
  )

  range.rightAlignText()

  timing.addSpacer(density.detailGap)

  const durationText = addText(
    timing,
    UTILS.formatDuration(duration),
    Font.mediumSystemFont(
      density.durationSize
    ),
    secondary(),
    1,
    1
  )

  durationText.rightAlignText()
}

function addStatsSummary(widget, stats, density) {
  const summary = widget.addStack()
  summary.centerAlignContent()

  summary.addSpacer()

  addStatCard(
    summary,
    UTILS.formatDuration(stats.work),
    "Temps de conduite",
    {
      width: density.statWidth,
      height: density.statHeight
    }
  )

  summary.addSpacer(density.statGap)

  addStatCard(
    summary,
    UTILS.formatDuration(stats.amplitude),
    "Amplitude",
    {
      width: density.statWidth,
      height: density.statHeight
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

  const widget = THEME.createBaseWidget(state.type)

  widget.setPadding(14, 16, 12, 16)

  addHeader(widget, service, state, {
    iconSize: 31,
    symbolSize: 14,
    titleSize: 18,
    dateSize: 9,
    badgeSize: 9,
    iconGap: 9
  })

  widget.addSpacer(9)

  const card = addSurface(widget, {
    padding: [10, 12, 10, 12],
    radius: 15,
    backgroundAlpha: 0.055,
    borderAlpha: 0.08,
    vertical: true
  })

  const identity = card.addStack()
  identity.centerAlignContent()

  const serviceInfo = identity.addStack()
  serviceInfo.layoutVertically()

  addText(
    serviceInfo,
    `Ligne ${focus.line}`,
    Font.boldSystemFont(24),
    THEME.getPrimaryTextColor(),
    1,
    0.7
  )

  serviceInfo.addSpacer(2)

  addText(
    serviceInfo,
    `Voiture ${focus.vehicle}`,
    Font.semiboldSystemFont(13),
    accent(state),
    1,
    0.8
  )

  identity.addSpacer()

  const timeInfo = identity.addStack()
  timeInfo.layoutVertically()

  const range = addText(
    timeInfo,
    `${focus.start} → ${focus.end}`,
    Font.boldMonospacedSystemFont(15),
    THEME.getPrimaryTextColor(),
    1,
    0.8
  )

  range.rightAlignText()
  timeInfo.addSpacer(3)

  const duration = addText(
    timeInfo,
    UTILS.formatDuration(
      UTILS.durationMinutes(
        focus.start,
        focus.end
      )
    ),
    Font.semiboldSystemFont(10),
    accent(state),
    1,
    0.8
  )

  duration.rightAlignText()

  card.addSpacer(7)
  addDivider(card)
  card.addSpacer(6)

  addText(
    card,
    focus.from,
    Font.mediumSystemFont(
      adaptiveFontSize(
        11,
        focus.from,
        30,
        8
      )
    ),
    secondary(),
    1,
    0.55
  )

  if (hasDepartureDetails(focus)) {
    card.addSpacer(3)

    addDepartureSummary(
      card,
      focus,
      state,
      {
        fontSize: 10,
        scale: 0.48,
        softLimit: 48,
        minimumSize: 7.5
      }
    )
  }

  widget.addSpacer(8)

  const footer = widget.addStack()
  footer.centerAlignContent()

  addText(
    footer,
    `${stats.count} tranches · ${UTILS.formatDuration(
      stats.work
    )}`,
    Font.semiboldSystemFont(9),
    secondary(),
    1,
    0.75
  )

  footer.addSpacer()

  addText(
    footer,
    `Fin ${stats.end}`,
    Font.boldMonospacedSystemFont(10),
    accent(state),
    1,
    0.8
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

  const widget = THEME.createBaseWidget(state.type)

  widget.setPadding(12, 13, 11, 13)

  const header = widget.addStack()
  header.centerAlignContent()

  addText(
    header,
    service.number,
    Font.boldSystemFont(15),
    THEME.getPrimaryTextColor(),
    1,
    0.8
  )

  header.addSpacer()

  addStatusPill(
    header,
    state,
    8,
    [3, 6, 3, 6]
  )

  widget.addSpacer(8)

  addText(
    widget,
    `Ligne ${focus.line}`,
    Font.boldSystemFont(21),
    THEME.getPrimaryTextColor(),
    1,
    0.7
  )

  widget.addSpacer(2)

  addText(
    widget,
    `Voiture ${focus.vehicle}`,
    Font.semiboldSystemFont(10),
    accent(state),
    1,
    0.8
  )

  widget.addSpacer(7)

  const timingCard = addSurface(widget, {
    padding: [6, 8, 6, 8],
    radius: 11,
    backgroundAlpha: 0.05,
    borderAlpha: 0.075
  })

  addSmallTime(
    timingCard,
    "DÉBUT",
    focus.start,
    "left"
  )

  timingCard.addSpacer()

  addSymbol(
    timingCard,
    "arrow.right",
    10,
    secondary()
  )

  timingCard.addSpacer()

  addSmallTime(
    timingCard,
    "FIN",
    focus.end,
    "right"
  )

  widget.addSpacer(7)

  if (hasDepartureDetails(focus)) {
    addDepartureSummary(
      widget,
      focus,
      state,
      {
        fontSize: 8.5,
        scale: 0.42,
        softLimit: 30,
        minimumSize: 6.5
      }
    )

    widget.addSpacer(4)
  }

  addText(
    widget,
    `${stats.count} tranches · ${UTILS.formatDuration(
      stats.work
    )}`,
    Font.mediumSystemFont(9),
    secondary(),
    1,
    0.7
  )

  return widget
}

function hasDepotTiming(slice) {
  return Boolean(
    slice?.dutyStart &&
    slice?.depotExitAt
  )
}

function hasDepartureDetails(slice) {
  return Boolean(
    slice &&
    (
      slice.depotExitAt ||
      slice.lineUpAt ||
      slice.direction
    )
  )
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
      `Mise en ligne : ${slice.lineUpAt}`
    )
  }

  if (slice?.direction) {
    lines.push(
      `Direction : ${slice.direction}`
    )
  }

  return lines
}

function addDepartureSummary(
  parent,
  slice,
  state,
  options = {}
) {
  const lines = buildDepartureSummary(slice)

  if (!lines.length) return null

  const container = parent.addStack()
  container.layoutVertically()

  const baseFontSize = options.fontSize || 9

  lines.forEach((line, index) => {
    addText(
      container,
      line,
      Font.semiboldSystemFont(
        adaptiveFontSize(
          baseFontSize,
          line,
          options.softLimit || 40,
          options.minimumSize ||
            Math.max(
              6.5,
              baseFontSize - 3
            )
        )
      ),
      accent(state),
      1,
      options.scale || 0.48
    )

    if (index < lines.length - 1) {
      container.addSpacer(1)
    }
  })

  return container
}

function addSmallTime(parent, label, time, align) {
  const block = parent.addStack()
  block.layoutVertically()

  const labelText = addText(
    block,
    label,
    Font.semiboldSystemFont(6.5),
    secondary(),
    1,
    0.85
  )

  const timeText = addText(
    block,
    time,
    Font.boldMonospacedSystemFont(14),
    THEME.getPrimaryTextColor(),
    1,
    0.82
  )

  alignText(labelText, align)
  alignText(timeText, align)
}

function addHeader(parent, service, state, options) {
  const header = parent.addStack()
  header.centerAlignContent()

  const icon = header.addStack()

  icon.size = new Size(
    options.iconSize,
    options.iconSize
  )

  icon.cornerRadius = options.iconSize / 2
  icon.backgroundColor =
    THEME.translucentWhite(0.075)

  icon.borderWidth = 0.5
  icon.borderColor =
    THEME.translucentWhite(0.09)

  icon.centerAlignContent()
  icon.addSpacer()

  addSymbol(
    icon,
    "bus.fill",
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
    1,
    0.8
  )

  identity.addSpacer(1)

  addText(
    identity,
    WIDGET_ENGINE.formatServiceDate(service),
    Font.mediumSystemFont(options.dateSize),
    secondary(),
    1,
    0.75
  )

  header.addSpacer()

  addStatusPill(
    header,
    state,
    options.badgeSize
  )
}

function addStatusPill(
  parent,
  state,
  fontSize,
  padding = [5, 8, 5, 8]
) {
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
    1,
    0.7
  )

  return pill
}

function addSectionHeader(parent, title, detail) {
  const row = parent.addStack()
  row.centerAlignContent()

  addText(
    row,
    title,
    Font.semiboldSystemFont(8),
    secondary(),
    1,
    0.85
  )

  row.addSpacer()

  addText(
    row,
    detail,
    Font.mediumSystemFont(8),
    secondary(),
    1,
    0.85
  )
}

function addDivider(parent) {
  const divider = parent.addStack()

  divider.size = new Size(0, 1)
  divider.backgroundColor =
    THEME.translucentWhite(0.07)

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

  stack.backgroundColor =
    THEME.translucentWhite(
      options.backgroundAlpha ?? 0.05
    )

  stack.borderWidth = 0.5

  stack.borderColor =
    THEME.translucentWhite(
      options.borderAlpha ?? 0.07
    )

  return stack
}

function addStatCard(
  parent,
  value,
  label,
  options = {}
) {
  const card = addSurface(parent, {
    padding: [0, 7, 0, 7],
    radius: 12,
    backgroundAlpha: 0.05,
    borderAlpha: 0.065,
    vertical: true
  })

  if (options.width || options.height) {
    card.size = new Size(
      options.width || 0,
      options.height || 0
    )
  }

  card.centerAlignContent()
  card.addSpacer()

  const valueText = addCenteredText(
    card,
    value,
    Font.boldSystemFont(14),
    THEME.getPrimaryTextColor(),
    0.7
  )

  valueText.lineLimit = 1

  card.addSpacer(1)

  const labelText = addCenteredText(
    card,
    label,
    Font.mediumSystemFont(7.5),
    secondary(),
    0.75
  )

  labelText.lineLimit = 1
  card.addSpacer()

  return card
}

function addCenteredText(
  parent,
  value,
  font,
  color,
  scale
) {
  const row = parent.addStack()

  row.centerAlignContent()
  row.addSpacer()

  const text = addText(
    row,
    value,
    font,
    color,
    1,
    scale
  )

  text.centerAlignText()
  row.addSpacer()

  return text
}

function createErrorWidget(title, message) {
  const widget = new ListWidget()

  widget.backgroundColor =
    THEME.getErrorBackgroundColor()

  widget.setPadding(18, 18, 18, 18)

  const header = widget.addStack()
  header.centerAlignContent()

  const icon = header.addStack()

  icon.size = new Size(34, 34)
  icon.cornerRadius = 17
  icon.backgroundColor =
    THEME.translucentWhite(0.08)

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
    1,
    0.75
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
    4,
    0.65
  )

  return widget
}

function addSymbol(parent, name, size, color) {
  const symbol = SFSymbol.named(name)

  if (!symbol) return null

  symbol.applyFont(Font.systemFont(size))

  const image = parent.addImage(symbol.image)

  image.imageSize = new Size(size, size)
  image.tintColor = color

  return image
}

function addText(
  parent,
  value,
  font,
  color,
  lines = 1,
  scale = 0.5
) {
  const element = parent.addText(
    String(value ?? "")
  )

  element.font = font
  element.textColor = color
  element.lineLimit = lines
  element.minimumScaleFactor = scale

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
    (
      !state.current &&
      state.next?.index === slice.index
    )
  )
}

function accent(state) {
  return THEME.getAccentColor(state.type)
}

function accentAlpha(state, alpha) {
  return new Color(
    THEME.getAccentHex(state.type),
    alpha
  )
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

function getLargeDensity(slices) {
  const list = Array.isArray(slices)
    ? slices
    : []

  const sliceCount = Math.max(1, list.length)

  const longestTitle = list.reduce(
    (length, slice) =>
      Math.max(
        length,
        `Ligne ${slice?.line || "?"} · Voiture ${
          slice?.vehicle || ""
        }`.length
      ),
    0
  )

  const longestRoute = list.reduce(
    (length, slice) =>
      Math.max(
        length,
        `${slice?.from || ""} → ${
          slice?.to || ""
        }`.length
      ),
    0
  )

  let density

  if (sliceCount >= 5) {
    density = {
      sectionGap: 5,
      timingPadding: 6,
      timeColumnWidth: 110,
      timeSize: 23,
      placeSize: 9,
      arrowSize: 24,
      timingCenterWidth: 38,
      departureSectionGap: 3,
      departureRowGap: 3,
      depotTimeSize: 10,
      departureSize: 8.5,
      listPadding: 7,
      headerGap: 5,
      rowGap: 3,
      rowPadding: 3,
      itemGap: 6,
      numberSize: 20,
      numberFont: 8.5,
      detailsWidth: 144,
      timingWidth: 70,
      sliceTitleSize: 10,
      sliceDetailSize: 8,
      titleSoftLimit: 25,
      titleMinimumSize: 8,
      routeSoftLimit: 30,
      routeMinimumSize: 6.8,
      rangeSize: 9.5,
      durationSize: 7.5,
      detailGap: 1,
      statWidth: 143,
      statHeight: 38,
      statGap: 8
    }
  } else if (sliceCount >= 3) {
    density = {
      sectionGap: 6,
      timingPadding: 7,
      timeColumnWidth: 116,
      timeSize: 25,
      placeSize: 9.5,
      arrowSize: 26,
      timingCenterWidth: 40,
      departureSectionGap: 4,
      departureRowGap: 4,
      depotTimeSize: 10.5,
      departureSize: 9,
      listPadding: 8,
      headerGap: 6,
      rowGap: 5,
      rowPadding: 4,
      itemGap: 7,
      numberSize: 23,
      numberFont: 9.5,
      detailsWidth: 156,
      timingWidth: 74,
      sliceTitleSize: 11,
      sliceDetailSize: 8.8,
      titleSoftLimit: 26,
      titleMinimumSize: 8.5,
      routeSoftLimit: 32,
      routeMinimumSize: 7,
      rangeSize: 10.5,
      durationSize: 8,
      detailGap: 2,
      statWidth: 143,
      statHeight: 40,
      statGap: 8
    }
  } else {
    density = {
      sectionGap: 7,
      timingPadding: 7,
      timeColumnWidth: 121,
      timeSize: 27,
      placeSize: 10.5,
      arrowSize: 28,
      timingCenterWidth: 42,
      departureSectionGap: 4,
      departureRowGap: 5,
      depotTimeSize: 11.5,
      departureSize: 10.5,
      listPadding: 9,
      headerGap: 6,
      rowGap: 6,
      rowPadding: 5,
      itemGap: 8,
      numberSize: 25,
      numberFont: 10.5,
      detailsWidth: 170,
      timingWidth: 78,
      sliceTitleSize: 12,
      sliceDetailSize: 9.8,
      titleSoftLimit: 27,
      titleMinimumSize: 9,
      routeSoftLimit: 34,
      routeMinimumSize: 7.4,
      rangeSize: 11,
      durationSize: 9,
      detailGap: 3,
      statWidth: 143,
      statHeight: 42,
      statGap: 8
    }
  }

  density.sliceTitleResolvedSize =
    adaptiveFontSize(
      density.sliceTitleSize,
      "X".repeat(longestTitle),
      Math.min(
        density.titleSoftLimit,
        20
      ),
      density.titleMinimumSize
    )

  density.sliceDetailResolvedSize =
    adaptiveFontSize(
      density.sliceDetailSize,
      "X".repeat(longestRoute),
      Math.min(
        density.routeSoftLimit,
        28
      ),
      density.routeMinimumSize
    )

  return density
}

function adaptiveFontSize(
  baseSize,
  value,
  softLimit,
  minimumSize
) {
  const safeBaseSize = Math.max(
    1,
    Number(baseSize) || 1
  )

  const safeMinimumSize = Math.min(
    safeBaseSize,
    Math.max(
      1,
      Number(minimumSize) ||
        safeBaseSize * 0.7
    )
  )

  const length = String(
    value ?? ""
  ).trim().length

  const limit = Math.max(
    1,
    Number(softLimit) || 1
  )

  if (length <= limit) {
    return safeBaseSize
  }

  const ratio = Math.max(
    0.68,
    limit / length
  )

  const resolved = Math.max(
    safeMinimumSize,
    safeBaseSize * ratio
  )

  return Math.round(resolved * 2) / 2
}

function validateContext(context) {
  if (
    !context ||
    typeof context !== "object"
  ) {
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
      error:
        "Les données nécessaires au widget sont incomplètes."
    }
  }

  if (
    !Array.isArray(context.service.slices) ||
    !context.service.slices.length
  ) {
    return {
      valid: false,
      error:
        "Aucune tranche ne peut être affichée."
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