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

  const profile = getScreenProfile()
  const density = getLargeDensity(
    service.slices,
    profile
  )

  const widget = THEME.createBaseWidget(
    state.type
  )

  widget.setPadding(
    density.paddingTop,
    density.paddingHorizontal,
    density.paddingBottom,
    density.paddingHorizontal
  )

  addHeader(
    widget,
    service,
    state,
    density.header
  )

  widget.addSpacer(density.sectionGap)
  addLargeTimingCard(
    widget,
    focus,
    state,
    density
  )

  widget.addSpacer(density.sectionGap)
  addSlicesList(
    widget,
    service,
    state,
    density
  )

  widget.addSpacer(density.sectionGap)
  addStatsSummary(
    widget,
    stats,
    density
  )

  return widget
}

function addLargeTimingCard(
  widget,
  focus,
  state,
  density
) {
  const card = addSurface(
    widget,
    {
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
    }
  )

  const row = card.addStack()
  row.centerAlignContent()

  addTimeColumn(
    row,
    {
      label: getTimingStartLabel(state),
      time: focus.start,
      place: focus.from,
      timeSize: density.timeSize,
      placeSize: density.placeSize,
      align: "left",
      fontLimit: density.placeSoftLimit
    }
  )

  row.addSpacer(density.timingGap)
  addArrowBadge(
    row,
    state,
    density.arrowSize
  )
  row.addSpacer(density.timingGap)

  addTimeColumn(
    row,
    {
      label: "FIN DE TRANCHE",
      time: focus.end,
      place: focus.to,
      timeSize: density.timeSize,
      placeSize: density.placeSize,
      align: "right",
      fontLimit: density.placeSoftLimit
    }
  )

  if (!hasDepartureDetails(focus)) {
    return
  }

  card.addSpacer(density.departureSectionGap)
  addDivider(card)
  card.addSpacer(density.departureSectionGap)

  addLargeDeparturePanel(
    card,
    focus,
    state,
    density
  )
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
  const column = parent.addStack()
  column.layoutVertically()

  const labelText = addText(
    column,
    options.label,
    Font.semiboldSystemFont(
      options.labelSize || 8
    ),
    secondary(),
    1
  )

  column.addSpacer(3)

  const timeText = addText(
    column,
    options.time,
    Font.boldMonospacedSystemFont(
      options.timeSize
    ),
    THEME.getPrimaryTextColor(),
    1
  )

  column.addSpacer(3)

  const placeText = addText(
    column,
    options.place,
    Font.mediumSystemFont(
      adaptiveFontSize(
        options.placeSize,
        options.place,
        options.fontLimit || 18,
        Math.max(
          7,
          options.placeSize - 3
        )
      )
    ),
    secondary(),
    1
  )

  alignText(labelText, options.align)
  alignText(timeText, options.align)
  alignText(placeText, options.align)
}

function addLargeDeparturePanel(
  parent,
  slice,
  state,
  density
) {
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

  if (!entries.length) {
    return
  }

  if (density.departureVertical) {
    entries.forEach((entry, index) => {
      addDepartureLine(
        parent,
        entry,
        state,
        density
      )

      if (index < entries.length - 1) {
        parent.addSpacer(
          density.departureRowGap
        )
      }
    })

    return
  }

  for (
    let index = 0;
    index < entries.length;
    index += 2
  ) {
    const row = parent.addStack()
    row.centerAlignContent()

    addDepartureBlock(
      row,
      entries[index],
      state,
      density,
      "left"
    )

    row.addSpacer(
      density.departurePairGap
    )

    if (entries[index + 1]) {
      addDepartureBlock(
        row,
        entries[index + 1],
        state,
        density,
        "right"
      )
    }

    if (index + 2 < entries.length) {
      parent.addSpacer(
        density.departureRowGap
      )
    }
  }
}

function addDepartureLine(
  parent,
  entry,
  state,
  density
) {
  const row = parent.addStack()
  row.centerAlignContent()

  const label = addText(
    row,
    entry.label,
    Font.semiboldSystemFont(
      density.departureLabelSize
    ),
    secondary(),
    1
  )

  label.leftAlignText()
  row.addSpacer()

  const value = addText(
    row,
    entry.value,
    entry.time
      ? Font.boldMonospacedSystemFont(
          density.departureValueSize
        )
      : Font.semiboldSystemFont(
          adaptiveFontSize(
            density.departureValueSize,
            entry.value,
            density.departureSoftLimit,
            Math.max(
              7,
              density.departureValueSize - 2.5
            )
          )
        ),
    accent(state),
    1
  )

  value.rightAlignText()
}

function addDepartureBlock(
  parent,
  entry,
  state,
  density,
  align
) {
  const block = parent.addStack()
  block.layoutVertically()

  const label = addText(
    block,
    entry.label,
    Font.semiboldSystemFont(
      density.departureLabelSize
    ),
    secondary(),
    1
  )

  block.addSpacer(2)

  const valueSize = entry.time
    ? density.departureTimeSize
    : adaptiveFontSize(
        density.departureValueSize,
        entry.value,
        density.departureSoftLimit,
        Math.max(
          7,
          density.departureValueSize - 2.5
        )
      )

  const value = addText(
    block,
    entry.value,
    entry.time
      ? Font.boldMonospacedSystemFont(valueSize)
      : Font.semiboldSystemFont(valueSize),
    accent(state),
    1
  )

  alignText(label, align)
  alignText(value, align)
}

function addArrowBadge(parent, state, size) {
  const badge = parent.addStack()

  badge.size = new Size(size, size)
  badge.cornerRadius = size / 2
  badge.backgroundColor = accentAlpha(
    state,
    0.11
  )
  badge.borderWidth = 0.5
  badge.borderColor = accentAlpha(
    state,
    0.24
  )
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

function addSlicesList(
  widget,
  service,
  state,
  density
) {
  const list = addSurface(
    widget,
    {
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
    }
  )

  addSectionHeader(
    list,
    "PROGRAMME",
    `${service.slices.length} tranche${
      service.slices.length > 1
        ? "s"
        : ""
    }`,
    density.sectionHeaderSize
  )

  list.addSpacer(density.headerGap)

  service.slices.forEach(
    (slice, index) => {
      addSliceRow(
        list,
        slice,
        state,
        density
      )

      if (
        index <
        service.slices.length - 1
      ) {
        list.addSpacer(
          density.rowGap
        )
      }
    }
  )
}

function addSliceRow(
  parent,
  slice,
  state,
  density
) {
  const active = isSliceActive(
    slice,
    state
  )

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

  row.cornerRadius = density.rowRadius
  row.backgroundColor = active
    ? accentAlpha(state, 0.085)
    : THEME.translucentWhite(0.018)
  row.borderWidth = 0.5
  row.borderColor = active
    ? accentAlpha(state, 0.18)
    : THEME.translucentWhite(0.035)

  addSliceNumber(
    row,
    slice,
    active,
    state,
    density
  )

  row.addSpacer(density.itemGap)

  const body = row.addStack()
  body.layoutVertically()

  const top = body.addStack()
  top.centerAlignContent()

  const title = addText(
    top,
    `Ligne ${slice.line} · Voiture ${slice.vehicle}`,
    Font.boldSystemFont(
      adaptiveFontSize(
        density.sliceTitleSize,
        `Ligne ${slice.line} · Voiture ${slice.vehicle}`,
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
    Font.boldMonospacedSystemFont(
      density.rangeSize
    ),
    active
      ? accent(state)
      : THEME.getInactiveTimeColor(),
    1
  )

  range.rightAlignText()

  body.addSpacer(density.detailGap)

  const bottom = body.addStack()
  bottom.centerAlignContent()

  const route = addText(
    bottom,
    `${slice.from} → ${slice.to}`,
    Font.mediumSystemFont(
      adaptiveFontSize(
        density.sliceDetailSize,
        `${slice.from} → ${slice.to}`,
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
    Font.mediumSystemFont(
      density.durationSize
    ),
    secondary(),
    1
  )

  durationText.rightAlignText()
}

function addSliceNumber(
  row,
  slice,
  active,
  state,
  density
) {
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
    Font.boldSystemFont(
      density.numberFont
    ),
    active
      ? accent(state)
      : secondary(),
    1
  )

  badge.addSpacer()
}

function addStatsSummary(
  widget,
  stats,
  density
) {
  const summary = widget.addStack()
  summary.centerAlignContent()
  summary.addSpacer()

  addStatCard(
    summary,
    UTILS.formatDuration(stats.work),
    "Travail",
    {
      paddingHorizontal:
        density.statPaddingHorizontal,
      paddingVertical:
        density.statPaddingVertical,
      valueSize:
        density.statValueSize,
      labelSize:
        density.statLabelSize
    }
  )

  summary.addSpacer(density.statGap)

  addStatCard(
    summary,
    UTILS.formatDuration(stats.amplitude),
    "Amplitude",
    {
      paddingHorizontal:
        density.statPaddingHorizontal,
      paddingVertical:
        density.statPaddingVertical,
      valueSize:
        density.statValueSize,
      labelSize:
        density.statLabelSize
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

  const profile = getScreenProfile()
  const density = getMediumDensity(profile)

  const widget = THEME.createBaseWidget(
    state.type
  )

  widget.setPadding(
    density.paddingTop,
    density.paddingHorizontal,
    density.paddingBottom,
    density.paddingHorizontal
  )

  addHeader(
    widget,
    service,
    state,
    density.header
  )

  widget.addSpacer(density.sectionGap)

  const card = addSurface(
    widget,
    {
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
    }
  )

  const identity = card.addStack()
  identity.centerAlignContent()

  const serviceInfo = identity.addStack()
  serviceInfo.layoutVertically()

  addText(
    serviceInfo,
    `Ligne ${focus.line}`,
    Font.boldSystemFont(
      density.lineSize
    ),
    THEME.getPrimaryTextColor(),
    1
  )

  serviceInfo.addSpacer(2)

  addText(
    serviceInfo,
    `Voiture ${focus.vehicle}`,
    Font.semiboldSystemFont(
      density.vehicleSize
    ),
    accent(state),
    1
  )

  identity.addSpacer()

  const timeInfo = identity.addStack()
  timeInfo.layoutVertically()

  const range = addText(
    timeInfo,
    `${focus.start} → ${focus.end}`,
    Font.boldMonospacedSystemFont(
      density.rangeSize
    ),
    THEME.getPrimaryTextColor(),
    1
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
    Font.semiboldSystemFont(
      density.durationSize
    ),
    accent(state),
    1
  )
  duration.rightAlignText()

  card.addSpacer(density.cardGap)
  addDivider(card)
  card.addSpacer(density.routeGap)

  addText(
    card,
    focus.from,
    Font.mediumSystemFont(
      adaptiveFontSize(
        density.routeSize,
        focus.from,
        density.routeSoftLimit,
        density.routeMinimumSize
      )
    ),
    secondary(),
    1
  )

  if (hasDepartureDetails(focus)) {
    card.addSpacer(density.departureGap)

    addDepartureSummary(
      card,
      focus,
      state,
      {
        fontSize:
          density.departureSize,
        softLimit:
          density.departureSoftLimit,
        minimumSize:
          density.departureMinimumSize
      }
    )
  }

  widget.addSpacer(density.footerGap)

  const footer = widget.addStack()
  footer.centerAlignContent()

  addText(
    footer,
    `${stats.count} tranches · ${UTILS.formatDuration(
      stats.work
    )}`,
    Font.semiboldSystemFont(
      density.footerSize
    ),
    secondary(),
    1
  )

  footer.addSpacer()

  addText(
    footer,
    `Fin ${stats.end}`,
    Font.boldMonospacedSystemFont(
      density.footerTimeSize
    ),
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

  const profile = getScreenProfile()
  const density = getSmallDensity(profile)

  const widget = THEME.createBaseWidget(
    state.type
  )

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
    Font.boldSystemFont(
      density.serviceSize
    ),
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
    Font.boldSystemFont(
      density.lineSize
    ),
    THEME.getPrimaryTextColor(),
    1
  )

  widget.addSpacer(2)

  addText(
    widget,
    `Voiture ${focus.vehicle}`,
    Font.semiboldSystemFont(
      density.vehicleSize
    ),
    accent(state),
    1
  )

  widget.addSpacer(density.sectionGap)

  const timingCard = addSurface(
    widget,
    {
      padding: [
        density.timePaddingVertical,
        density.timePaddingHorizontal,
        density.timePaddingVertical,
        density.timePaddingHorizontal
      ],
      radius: density.surfaceRadius,
      backgroundAlpha: 0.05,
      borderAlpha: 0.075
    }
  )

  addSmallTime(
    timingCard,
    "DÉBUT",
    focus.start,
    "left",
    density
  )

  timingCard.addSpacer()

  addSymbol(
    timingCard,
    "arrow.right",
    density.arrowSize,
    secondary()
  )

  timingCard.addSpacer()

  addSmallTime(
    timingCard,
    "FIN",
    focus.end,
    "right",
    density
  )

  widget.addSpacer(density.sectionGap)

  if (hasDepartureDetails(focus)) {
    addDepartureSummary(
      widget,
      focus,
      state,
      {
        fontSize:
          density.departureSize,
        softLimit:
          density.departureSoftLimit,
        minimumSize:
          density.departureMinimumSize
      }
    )

    widget.addSpacer(density.departureGap)
  }

  addText(
    widget,
    `${stats.count} tranches · ${UTILS.formatDuration(
      stats.work
    )}`,
    Font.mediumSystemFont(
      density.footerSize
    ),
    secondary(),
    1
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

function isTramSlice(slice) {
  const lineCode = String(
    slice?.lineCode || ""
  ).trim()

  return [
    "80",
    "81",
    "82",
    "83",
    "84",
    "85"
  ].includes(lineCode)
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
      `${
        isTramSlice(slice)
          ? "Début exploitation"
          : "Mise en ligne"
      } : ${slice.lineUpAt}`
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
      1
    )

    if (index < lines.length - 1) {
      container.addSpacer(1)
    }
  })

  return container
}

function addSmallTime(
  parent,
  label,
  time,
  align,
  density
) {
  const block = parent.addStack()
  block.layoutVertically()

  const labelText = addText(
    block,
    label,
    Font.semiboldSystemFont(
      density.timeLabelSize
    ),
    secondary(),
    1
  )

  const timeText = addText(
    block,
    time,
    Font.boldMonospacedSystemFont(
      density.timeSize
    ),
    THEME.getPrimaryTextColor(),
    1
  )

  alignText(labelText, align)
  alignText(timeText, align)
}

function addHeader(
  parent,
  service,
  state,
  options
) {
  const header = parent.addStack()
  header.centerAlignContent()

  const icon = header.addStack()
  icon.size = new Size(
    options.iconSize,
    options.iconSize
  )
  icon.cornerRadius = options.iconSize / 2
  icon.backgroundColor = THEME.translucentWhite(
    0.075
  )
  icon.borderWidth = 0.5
  icon.borderColor = THEME.translucentWhite(
    0.09
  )
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
    Font.boldSystemFont(
      options.titleSize
    ),
    THEME.getPrimaryTextColor(),
    1
  )

  identity.addSpacer(1)

  addText(
    identity,
    WIDGET_ENGINE.formatServiceDate(
      service
    ),
    Font.mediumSystemFont(
      options.dateSize
    ),
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
  const slices = Array.isArray(
    service?.slices
  )
    ? service.slices
    : []

  return slices.some(
    slice => isTramSlice(slice)
  )
    ? "tram.fill"
    : "bus.fill"
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
  pill.backgroundColor = accentAlpha(
    state,
    0.1
  )
  pill.borderWidth = 0.5
  pill.borderColor = accentAlpha(
    state,
    0.22
  )

  addText(
    pill,
    state.label,
    Font.semiboldSystemFont(fontSize),
    accent(state),
    1
  )

  return pill
}

function addSectionHeader(
  parent,
  title,
  detail,
  fontSize = 8
) {
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
  divider.backgroundColor =
    THEME.translucentWhite(0.07)
  divider.addSpacer()
  return divider
}

function addSurface(
  parent,
  options = {}
) {
  const stack = parent.addStack()
  const padding = options.padding ||
    [0, 0, 0, 0]

  if (options.vertical) {
    stack.layoutVertically()
  }

  stack.setPadding(
    padding[0],
    padding[1],
    padding[2],
    padding[3]
  )
  stack.cornerRadius =
    options.radius ?? 14
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
  const card = addSurface(
    parent,
    {
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
    }
  )

  card.centerAlignContent()

  addCenteredText(
    card,
    value,
    Font.boldSystemFont(
      options.valueSize || 14
    ),
    THEME.getPrimaryTextColor()
  )

  card.addSpacer(1)

  addCenteredText(
    card,
    label,
    Font.mediumSystemFont(
      options.labelSize || 7.5
    ),
    secondary()
  )

  return card
}

function addCenteredText(
  parent,
  value,
  font,
  color
) {
  const row = parent.addStack()
  row.centerAlignContent()
  row.addSpacer()

  const text = addText(
    row,
    value,
    font,
    color,
    1
  )

  text.centerAlignText()
  row.addSpacer()

  return text
}

function createErrorWidget(title, message) {
  const widget = new ListWidget()
  const profile = getScreenProfile()
  const scale = profile.uiScale

  widget.backgroundColor =
    THEME.getErrorBackgroundColor()
  widget.setPadding(
    scaled(18, scale),
    scaled(18, scale),
    scaled(18, scale),
    scaled(18, scale)
  )

  const header = widget.addStack()
  header.centerAlignContent()

  const iconSize = scaled(34, scale)
  const icon = header.addStack()
  icon.size = new Size(
    iconSize,
    iconSize
  )
  icon.cornerRadius = iconSize / 2
  icon.backgroundColor =
    THEME.translucentWhite(0.08)
  icon.centerAlignContent()
  icon.addSpacer()

  addSymbol(
    icon,
    "exclamationmark.triangle.fill",
    scaled(15, scale),
    THEME.getPrimaryTextColor()
  )

  icon.addSpacer()
  header.addSpacer(
    scaled(10, scale)
  )

  addText(
    header,
    title,
    Font.boldSystemFont(
      scaled(17, scale)
    ),
    THEME.getPrimaryTextColor(),
    1
  )

  widget.addSpacer(
    scaled(10, scale)
  )

  const card = addSurface(
    widget,
    {
      padding: [
        scaled(11, scale),
        scaled(12, scale),
        scaled(11, scale),
        scaled(12, scale)
      ],
      radius: scaled(14, scale),
      backgroundAlpha: 0.05,
      borderAlpha: 0.07
    }
  )

  addText(
    card,
    message,
    Font.mediumSystemFont(
      scaled(11, scale)
    ),
    secondary(),
    4
  )

  return widget
}

function addSymbol(
  parent,
  name,
  size,
  color
) {
  const symbol = SFSymbol.named(name)

  if (!symbol) {
    return null
  }

  symbol.applyFont(
    Font.systemFont(size)
  )

  const image = parent.addImage(
    symbol.image
  )
  image.imageSize = new Size(
    size,
    size
  )
  image.tintColor = color

  return image
}

function addText(
  parent,
  value,
  font,
  color,
  lines = 1
) {
  const element = parent.addText(
    String(value ?? "")
  )

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
    (
      !state.current &&
      state.next?.index === slice.index
    )
  )
}

function accent(state) {
  return THEME.getAccentColor(
    state.type
  )
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
  const family = String(
    value || ""
  )
    .trim()
    .toLowerCase()

  return VALID_FAMILIES.includes(family)
    ? family
    : "large"
}

function getScreenProfile() {
  let size

  try {
    size = Device.screenSize()
  } catch (_) {
    size = new Size(390, 844)
  }

  const rawWidth = Number(size?.width) || 390
  const rawHeight = Number(size?.height) || 844
  const width = Math.min(rawWidth, rawHeight)
  const height = Math.max(rawWidth, rawHeight)

  const widthScale = clamp(
    width / 390,
    0.82,
    1
  )

  const heightScale = clamp(
    height / 844,
    0.82,
    1
  )

  const uiScale = clamp(
    Math.min(widthScale, heightScale),
    0.82,
    1
  )

  return {
    width,
    height,
    widthScale,
    heightScale,
    uiScale,
    compact:
      width <= 375 || height <= 736,
    narrow:
      width < 390,
    spacious:
      width >= 428 && height >= 900
  }
}

function getLargeDensity(slices, profile) {
  const list = Array.isArray(slices)
    ? slices
    : []

  const sliceCount = Math.max(
    1,
    list.length
  )

  const scale = profile.uiScale
  const horizontalScale = profile.widthScale

  let base

  if (sliceCount >= 5) {
    base = {
      sectionGap: 5,
      timingPadding: 6,
      timeSize: 23,
      placeSize: 9,
      arrowSize: 24,
      departureSectionGap: 3,
      departureRowGap: 3,
      departureLabelSize: 7,
      departureValueSize: 8.5,
      departureTimeSize: 10,
      listPadding: 7,
      headerGap: 5,
      rowGap: 3,
      rowPadding: 3,
      itemGap: 6,
      numberSize: 20,
      numberFont: 8.5,
      sliceTitleSize: 10,
      sliceDetailSize: 8,
      titleSoftLimit: 25,
      titleMinimumSize: 8,
      routeSoftLimit: 30,
      routeMinimumSize: 6.8,
      rangeSize: 9.5,
      durationSize: 7.5,
      detailGap: 1,
      statValueSize: 14,
      statLabelSize: 7.5,
      statPaddingVertical: 4,
      statPaddingHorizontal: 20
    }
  } else if (sliceCount >= 3) {
    base = {
      sectionGap: 6,
      timingPadding: 7,
      timeSize: 25,
      placeSize: 9.5,
      arrowSize: 26,
      departureSectionGap: 4,
      departureRowGap: 4,
      departureLabelSize: 7.5,
      departureValueSize: 9,
      departureTimeSize: 10.5,
      listPadding: 8,
      headerGap: 6,
      rowGap: 5,
      rowPadding: 4,
      itemGap: 7,
      numberSize: 23,
      numberFont: 9.5,
      sliceTitleSize: 11,
      sliceDetailSize: 8.8,
      titleSoftLimit: 26,
      titleMinimumSize: 8.5,
      routeSoftLimit: 32,
      routeMinimumSize: 7,
      rangeSize: 10.5,
      durationSize: 8,
      detailGap: 2,
      statValueSize: 14,
      statLabelSize: 7.5,
      statPaddingVertical: 5,
      statPaddingHorizontal: 22
    }
  } else {
    base = {
      sectionGap: 7,
      timingPadding: 7,
      timeSize: 27,
      placeSize: 10.5,
      arrowSize: 28,
      departureSectionGap: 4,
      departureRowGap: 5,
      departureLabelSize: 7.5,
      departureValueSize: 10.5,
      departureTimeSize: 11.5,
      listPadding: 9,
      headerGap: 6,
      rowGap: 6,
      rowPadding: 5,
      itemGap: 8,
      numberSize: 25,
      numberFont: 10.5,
      sliceTitleSize: 12,
      sliceDetailSize: 9.8,
      titleSoftLimit: 27,
      titleMinimumSize: 9,
      routeSoftLimit: 34,
      routeMinimumSize: 7.4,
      rangeSize: 11,
      durationSize: 9,
      detailGap: 3,
      statValueSize: 14,
      statLabelSize: 7.5,
      statPaddingVertical: 5,
      statPaddingHorizontal: 24
    }
  }

  return {
    paddingTop: scaled(17, scale),
    paddingBottom: scaled(14, scale),
    paddingHorizontal: scaled(18, horizontalScale),
    sectionGap: scaled(base.sectionGap, scale),
    surfacePaddingHorizontal: scaled(12, horizontalScale),
    surfaceRadius: scaled(17, scale),
    timingPadding: scaled(base.timingPadding, scale),
    timingGap: scaled(7, horizontalScale),
    timeSize: scaled(base.timeSize, scale),
    placeSize: scaled(base.placeSize, scale),
    placeSoftLimit: profile.narrow ? 15 : 18,
    arrowSize: scaled(base.arrowSize, scale),
    departureSectionGap:
      scaled(base.departureSectionGap, scale),
    departureRowGap:
      scaled(base.departureRowGap, scale),
    departurePairGap: scaled(22, horizontalScale),
    departureLabelSize:
      scaled(base.departureLabelSize, scale),
    departureValueSize:
      scaled(base.departureValueSize, scale),
    departureTimeSize:
      scaled(base.departureTimeSize, scale),
    departureSoftLimit: profile.narrow ? 18 : 24,
    departureVertical: profile.width < 375,
    listPadding: scaled(base.listPadding, scale),
    listRadius: scaled(16, scale),
    sectionHeaderSize: scaled(8, scale),
    headerGap: scaled(base.headerGap, scale),
    rowGap: scaled(base.rowGap, scale),
    rowPadding: scaled(base.rowPadding, scale),
    rowRadius: scaled(11, scale),
    itemGap: scaled(base.itemGap, horizontalScale),
    numberSize: scaled(base.numberSize, scale),
    numberFont: scaled(base.numberFont, scale),
    sliceTitleSize: scaled(base.sliceTitleSize, scale),
    sliceDetailSize: scaled(base.sliceDetailSize, scale),
    titleSoftLimit: base.titleSoftLimit,
    titleMinimumSize: scaled(base.titleMinimumSize, scale),
    routeSoftLimit: base.routeSoftLimit,
    routeMinimumSize: scaled(base.routeMinimumSize, scale),
    rangeSize: scaled(base.rangeSize, scale),
    durationSize: scaled(base.durationSize, scale),
    detailGap: scaled(base.detailGap, scale),
    statPaddingHorizontal:
      scaled(base.statPaddingHorizontal, horizontalScale),
    statPaddingVertical:
      scaled(base.statPaddingVertical, scale),
    statGap: scaled(8, horizontalScale),
    statValueSize: scaled(base.statValueSize, scale),
    statLabelSize: scaled(base.statLabelSize, scale),
    header: {
      iconSize: scaled(38, scale),
      symbolSize: scaled(18, scale),
      titleSize: scaled(21, scale),
      dateSize: scaled(10, scale),
      badgeSize: scaled(10, scale),
      iconGap: scaled(11, horizontalScale),
      badgePadding: [
        scaled(5, scale),
        scaled(8, horizontalScale),
        scaled(5, scale),
        scaled(8, horizontalScale)
      ]
    }
  }
}

function getMediumDensity(profile) {
  const scale = profile.uiScale
  const horizontalScale = profile.widthScale

  return {
    paddingTop: scaled(14, scale),
    paddingBottom: scaled(12, scale),
    paddingHorizontal: scaled(16, horizontalScale),
    sectionGap: scaled(9, scale),
    cardPaddingVertical: scaled(10, scale),
    cardPaddingHorizontal: scaled(12, horizontalScale),
    surfaceRadius: scaled(15, scale),
    lineSize: scaled(24, scale),
    vehicleSize: scaled(13, scale),
    rangeSize: scaled(15, scale),
    durationSize: scaled(10, scale),
    cardGap: scaled(7, scale),
    routeGap: scaled(6, scale),
    routeSize: scaled(11, scale),
    routeSoftLimit: profile.narrow ? 26 : 30,
    routeMinimumSize: scaled(8, scale),
    departureGap: scaled(3, scale),
    departureSize: scaled(10, scale),
    departureSoftLimit: profile.narrow ? 38 : 48,
    departureMinimumSize: scaled(7.5, scale),
    footerGap: scaled(8, scale),
    footerSize: scaled(9, scale),
    footerTimeSize: scaled(10, scale),
    header: {
      iconSize: scaled(31, scale),
      symbolSize: scaled(14, scale),
      titleSize: scaled(18, scale),
      dateSize: scaled(9, scale),
      badgeSize: scaled(9, scale),
      iconGap: scaled(9, horizontalScale),
      badgePadding: [
        scaled(5, scale),
        scaled(8, horizontalScale),
        scaled(5, scale),
        scaled(8, horizontalScale)
      ]
    }
  }
}

function getSmallDensity(profile) {
  const scale = profile.uiScale
  const horizontalScale = profile.widthScale

  return {
    paddingTop: scaled(12, scale),
    paddingBottom: scaled(11, scale),
    paddingHorizontal: scaled(13, horizontalScale),
    serviceSize: scaled(15, scale),
    badgeSize: scaled(8, scale),
    badgePadding: [
      scaled(3, scale),
      scaled(6, horizontalScale),
      scaled(3, scale),
      scaled(6, horizontalScale)
    ],
    sectionGap: scaled(7, scale),
    lineSize: scaled(21, scale),
    vehicleSize: scaled(10, scale),
    surfaceRadius: scaled(11, scale),
    timePaddingVertical: scaled(6, scale),
    timePaddingHorizontal: scaled(8, horizontalScale),
    timeLabelSize: scaled(6.5, scale),
    timeSize: scaled(14, scale),
    arrowSize: scaled(10, scale),
    departureSize: scaled(8.5, scale),
    departureSoftLimit: profile.narrow ? 26 : 30,
    departureMinimumSize: scaled(6.5, scale),
    departureGap: scaled(4, scale),
    footerSize: scaled(9, scale)
  }
}

function scaled(value, scale) {
  return Math.max(
    1,
    Math.round(value * scale * 2) / 2
  )
}

function clamp(value, minimum, maximum) {
  return Math.min(
    maximum,
    Math.max(minimum, value)
  )
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
    0.66,
    limit / length
  )

  return Math.round(
    Math.max(
      safeMinimumSize,
      safeBaseSize * ratio
    ) * 2
  ) / 2
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
      error: "Les données nécessaires au widget sont incomplètes."
    }
  }

  if (
    !Array.isArray(
      context.service.slices
    ) ||
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
