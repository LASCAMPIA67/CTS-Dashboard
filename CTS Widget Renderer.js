// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: cyan; icon-glyph: rectangle.3.group;

const UTILS = importModule("CTS Utils")
const THEME = importModule("CTS Widget Theme")
const rendered = new WeakSet()

function markRendered(widget) {
  rendered.add(widget)
  return widget
}

function isRenderedWidget(widget) {
  return rendered.has(widget)
}

function createWidget(family, context) {
  const validation = validateContext(context)

  if (!validation.valid) {
    return createErrorWidget("Service invalide", validation.error, family)
  }

  const sliceCount = context.service.slices.length
  const textScale = context?.preferences?.textScale
  const normalized = normalizeFamily(family)

  if (normalized === "large") return createLargeWidget(context, getDensity(sliceCount, textScale))
  if (normalized === "extralargeportrait") {
    return createLargeWidget(context, getPortraitDensity(sliceCount, textScale))
  }
  if (isAccessoryFamily(family)) return createAccessoryWidget(family, context)

  return createLargeOnlyWidget()
}

const ACCESSORY_FAMILIES = Object.freeze([
  "accessoryrectangular",
  "accessorycircular",
  "accessoryinline"
])

function isAccessoryFamily(family) {
  return ACCESSORY_FAMILIES.includes(normalizeFamily(family))
}

function createAccessoryBase() {
  const widget = new ListWidget()
  widget.setPadding(0, 0, 0, 0)
  return widget
}

function accessoryFocus(context) {
  const state = context.state
  const focus = context.displaySlice
  const type = String(state?.type || "")

  if (type === "DONE") {
    return { label: "TERMINÉ", time: focus?.end || "", place: "" }
  }

  if (type === "WORK") {
    return { label: "FIN", time: focus?.end || "", place: focus?.to || "" }
  }

  if (type === "PAUSE" || type === "CUT") {
    return { label: "REPRISE", time: focus?.start || "", place: focus?.from || "" }
  }

  return accessoryStart(focus)
}

function accessoryStart(focus) {
  if (focus?.dutyStart) {
    return { label: "PRISE", time: focus.dutyStart, place: focus.from || "" }
  }

  return { label: "DÉPART", time: focus?.start || "", place: focus?.from || "" }
}

function createAccessoryWidget(family, context) {
  const normalized = normalizeFamily(family)
  const focus = accessoryFocus(context)

  if (normalized === "accessoryinline") return createInlineAccessory(focus, context.service)
  if (normalized === "accessorycircular") return createCircularAccessory(focus)

  return createRectangularAccessory(focus, context)
}

function createInlineAccessory(focus, service) {
  const widget = createAccessoryBase()
  const label = sentenceCase(focus.label)
  const parts = [service.number, focus.time ? `${label} ${focus.time}` : label]

  if (focus.place) parts.push(focus.place)

  widget.addText(parts.join(" · "))
  return markRendered(widget)
}

function createCircularAccessory(focus) {
  const widget = createAccessoryBase()
  const column = widget.addStack()
  column.layoutVertically()
  column.centerAlignContent()
  column.addSpacer()
  addCenteredLine(column, focus.label, Font.boldSystemFont(9), Color.white(), 0.6)
  column.addSpacer(1)
  addCenteredLine(column, focus.time || "—", Font.boldMonospacedSystemFont(15), Color.white(), 0.5)
  column.addSpacer()
  return markRendered(widget)
}

function createRectangularAccessory(focus, context) {
  const service = context.service
  const widget = createAccessoryBase()
  const column = widget.addStack()
  column.layoutVertically()

  const heading = column.addStack()
  heading.centerAlignContent()
  addSymbol(heading, getTransportIcon(service), 11, Color.white())
  heading.addSpacer(4)
  addText(
    heading,
    `${service.number} · ${accessoryStateLabel(context)}`,
    Font.semiboldSystemFont(11),
    Color.white(),
    1,
    0.6
  )

  column.addSpacer(2)

  const timing = column.addStack()
  timing.centerAlignContent()
  addText(timing, focus.label, Font.boldSystemFont(9), Color.white(), 1, 0.6)
  timing.addSpacer(5)
  addText(
    timing,
    focus.time || "—",
    Font.boldMonospacedSystemFont(17),
    Color.white(),
    1,
    0.6
  )

  if (focus.place) {
    column.addSpacer(1)
    addText(column, focus.place, Font.mediumSystemFont(11), Color.white(), 1, 0.55)
  }

  return markRendered(widget)
}

function sentenceCase(value) {
  const text = String(value || "").toLowerCase()

  return text ? text[0].toUpperCase() + text.slice(1) : text
}

function accessoryStateLabel(context) {
  return String(context.state?.label || "").trim() || "Service"
}

function createAccessoryMessage(family, title, message) {
  const normalized = normalizeFamily(family)
  const shortTitle = String(title || "CTS Dashboard").trim()

  if (normalized === "accessoryinline") {
    const widget = createAccessoryBase()
    widget.addText(shortTitle)
    return markRendered(widget)
  }

  if (normalized === "accessorycircular") {
    const widget = createAccessoryBase()
    const column = widget.addStack()
    column.layoutVertically()
    column.centerAlignContent()
    column.addSpacer()
    const row = column.addStack()
    row.centerAlignContent()
    row.addSpacer()
    addSymbol(row, "exclamationmark.triangle.fill", 18, Color.white())
    row.addSpacer()
    column.addSpacer()
    return markRendered(widget)
  }

  const widget = createAccessoryBase()
  const column = widget.addStack()
  column.layoutVertically()

  const heading = column.addStack()
  heading.centerAlignContent()
  addSymbol(heading, "exclamationmark.triangle.fill", 11, Color.white())
  heading.addSpacer(4)
  addText(heading, shortTitle, Font.semiboldSystemFont(12), Color.white(), 1, 0.6)

  column.addSpacer(2)
  addText(column, firstLine(message), Font.mediumSystemFont(10), Color.white(), 2, 0.55)

  return markRendered(widget)
}

function firstLine(value) {
  return String(value || "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)[0] || ""
}

function createLargeWidget(context, density) {
  const { service, state, stats, displaySlice: focus } = context
  const widget = THEME.createBaseWidget(state.type)

  widget.setPadding(
    density.paddingTop,
    density.paddingHorizontal,
    density.paddingBottom,
    density.paddingHorizontal
  )

  addHeader(widget, service, state, density, context)
  widget.addSpacer(density.sectionGap)
  addTimingCard(widget, focus, state, density)
  widget.addSpacer(density.sectionGap)
  addProgram(widget, service, state, focus, density)
  widget.addSpacer(density.sectionGap)
  addStats(widget, stats, density)

  return markRendered(widget)
}

const REFRESH_ACTION_ID = "refresh"

const MESSAGE_REFRESH = Object.freeze({
  refreshWidth: 86,
  refreshButtonSize: 10,
  refreshPaddingVertical: 4,
  refreshPaddingHorizontal: 8,
  refreshClockSize: 8,
  refreshGap: 3
})

function addRefreshBlock(parent, clock, color, metrics) {
  const block = parent.addStack()
  block.layoutVertically()
  block.size = new Size(metrics.refreshWidth, 0)

  if (typeof block.setAction === "function") {
    const row = block.addStack()
    row.addSpacer()
    addRefreshButton(row, color, metrics)
    row.addSpacer()
    block.addSpacer(metrics.refreshGap)
  }

  addCenteredLine(
    block,
    `Actualisé à ${clock}`,
    Font.mediumSystemFont(metrics.refreshClockSize),
    secondary(),
    0.8
  )
}

function addRefreshButton(parent, color, metrics) {
  const button = parent.addStack()
  button.centerAlignContent()
  button.setPadding(
    metrics.refreshPaddingVertical,
    metrics.refreshPaddingHorizontal,
    metrics.refreshPaddingVertical,
    metrics.refreshPaddingHorizontal
  )
  button.cornerRadius = 10
  button.backgroundColor = THEME.translucentWhite(0.08)
  button.borderWidth = 0.5
  button.borderColor = THEME.translucentWhite(0.14)
  addSymbol(button, "arrow.clockwise", metrics.refreshButtonSize, color)
  button.addSpacer(4)
  addText(button, "Actualiser", Font.semiboldSystemFont(metrics.refreshButtonSize), color, 1, 0.8)
  button.setAction("Actualiser", { id: REFRESH_ACTION_ID })
}

function addPendingBadge(parent, context, state, density) {
  const waiting = Math.max(0, Number(context?.pendingImports) || 0)

  if (!waiting) return

  const badge = parent.addStack()
  badge.centerAlignContent()
  badge.setPadding(
    density.badgePaddingVertical,
    density.pendingPaddingHorizontal,
    density.badgePaddingVertical,
    density.pendingPaddingHorizontal
  )
  badge.cornerRadius = 10
  badge.backgroundColor = accentAlpha(state, 0.1)
  badge.borderWidth = 0.5
  badge.borderColor = accentAlpha(state, 0.22)

  addSymbol(badge, "tray.and.arrow.down.fill", density.pendingSymbolSize, accent(state))

  if (waiting > 1) {
    badge.addSpacer(density.pendingSymbolGap)
    addText(
      badge,
      String(waiting),
      Font.semiboldSystemFont(density.badgeSize),
      accent(state),
      1,
      0.8
    )
  }

  parent.addSpacer(density.pendingSymbolGap)
}

function createLargeOnlyWidget() {
  const widget = new ListWidget()
  widget.backgroundColor = new Color("#0B1726")
  widget.setPadding(16, 16, 16, 16)

  const row = widget.addStack()
  row.centerAlignContent()

  const icon = row.addStack()
  icon.size = new Size(34, 34)
  icon.cornerRadius = 17
  icon.backgroundColor = THEME.translucentWhite(0.07)
  icon.centerAlignContent()
  icon.addSpacer()
  addSymbol(icon, "rectangle.3.group.fill", 15, new Color("#9EC8FF"))
  icon.addSpacer()

  row.addSpacer(10)
  const text = row.addStack()
  text.layoutVertically()
  addText(text, "CTS Dashboard", Font.boldSystemFont(15), Color.white())
  text.addSpacer(2)
  addText(text, "Widget grand requis", Font.semiboldSystemFont(9), new Color("#9EC8FF"))
  return markRendered(widget)
}

function addHeader(parent, service, state, density, context) {
  const row = parent.addStack()
  row.centerAlignContent()

  const icon = row.addStack()
  icon.size = new Size(density.iconSize, density.iconSize)
  icon.cornerRadius = density.iconSize / 2
  icon.backgroundColor = THEME.translucentWhite(0.075)
  icon.borderWidth = 0.5
  icon.borderColor = THEME.translucentWhite(0.09)
  icon.centerAlignContent()
  icon.addSpacer()
  addSymbol(icon, getTransportIcon(service), density.iconSymbolSize, accent(state))
  icon.addSpacer()

  row.addSpacer(density.iconGap)
  const identity = row.addStack()
  identity.layoutVertically()

  addText(
    identity,
    service.number,
    Font.boldSystemFont(density.serviceSize),
    THEME.getPrimaryTextColor(),
    1,
    0.82
  )
  identity.addSpacer(1)
  addText(
    identity,
    UTILS.formatDateLong(service.dateObject),
    Font.mediumSystemFont(density.dateSize),
    secondary(),
    1,
    0.8
  )

  row.addSpacer()

  const clock = formatClock(context?.currentDate)

  if (clock) {
    addRefreshBlock(row, clock, accent(state), density)
    row.addSpacer()
  }

  addPendingBadge(row, context, state, density)
  addStatusPill(row, state, density)
}

function formatClock(date) {
  if (!UTILS.isUsableDate(date)) return ""

  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

function addTimingCard(parent, focus, state, density) {
  const card = addSurface(parent, {
    padding: [
      density.timingPaddingVertical,
      density.cardPaddingHorizontal,
      density.timingPaddingVertical,
      density.cardPaddingHorizontal
    ],
    radius: density.surfaceRadius,
    backgroundAlpha: 0.055,
    borderAlpha: 0.085,
    vertical: true
  })

  const timing = addGridRow(card)

  addTimingSide(timing, getTimingStartLabel(state), focus.start, focus.from, density)
  timing.addSpacer(density.timingArrowGap)
  addArrowBadge(timing, state, density.arrowSize)
  timing.addSpacer(density.timingArrowGap)
  addTimingSide(timing, "FIN DE TRANCHE", focus.end, focus.to, density)

  closeGridRow(timing)

  if (density.hidesOperationalDetails) return
  if (!hasOperationalDetails(focus)) return
  card.addSpacer(density.detailsSectionGap)
  addDivider(card)
  card.addSpacer(density.detailsSectionGap)
  addOperationalDetails(card, focus, state, density)
}

function addGridRow(parent) {
  const row = parent.addStack()
  row.centerAlignContent()
  row.addSpacer()
  return row
}

function closeGridRow(row) {
  row.addSpacer()
}

function gridGutter(density) {
  return density.timingArrowGap * 2 + density.arrowSize
}

function addTimingSide(parent, label, time, place, density) {
  const block = parent.addStack()
  block.layoutVertically()
  block.size = new Size(density.columnWidth, 0)

  addCenteredLine(
    block,
    label,
    Font.semiboldSystemFont(density.timingLabelSize),
    secondary(),
    0.72
  )
  block.addSpacer(density.timingLabelGap)
  addCenteredLine(
    block,
    time,
    Font.boldMonospacedSystemFont(density.timeSize),
    THEME.getPrimaryTextColor(),
    0.78
  )
  block.addSpacer(density.placeGap)
  addCenteredLine(
    block,
    place,
    Font.mediumSystemFont(
      fitFont(density.placeSize, place, density.placeSoftLimit, density.placeMinimumSize)
    ),
    secondary(),
    0.7
  )
}

function depotRowKind(slice, state) {
  const running = state?.type === "DONE" || state?.type === "WORK"

  if (running && slice.depotReturnAt) return "return"
  if (hasDepotTiming(slice)) return "exit"
  return ""
}

function addDepotRow(parent, slice, state, density) {
  const kind = depotRowKind(slice, state)

  if (kind === "return") {
    const row = addGridRow(parent)
    addDetailBlock(row, "RENTRÉE DÉPÔT", slice.depotReturnAt, state, density, { time: true })
    row.addSpacer(gridGutter(density))
    addDetailBlock(row, "FIN DE SERVICE", slice.dutyEnd, state, density, { time: true })
    closeGridRow(row)
    return true
  }

  if (kind !== "exit") return false

  const row = addGridRow(parent)
  addDetailBlock(row, "PRISE DE SERVICE", slice.dutyStart, state, density, { time: true })
  row.addSpacer(gridGutter(density))
  addDetailBlock(row, "SORTIE DÉPÔT", slice.depotExitAt, state, density, { time: true })
  closeGridRow(row)
  return true
}

function addOperationalDetails(parent, slice, state, density) {
  const hasLineUp = Boolean(slice.lineUpAt)
  const hasDirection = Boolean(slice.direction)

  if (addDepotRow(parent, slice, state, density)) {
    if (hasLineUp || hasDirection) parent.addSpacer(density.detailGroupGap)
  }

  if (!hasLineUp && !hasDirection) return

  const row = addGridRow(parent)

  if (hasLineUp) {
    addDetailBlock(row, getOperationStartLabel(slice), slice.lineUpAt, state, density, {
      emphasized: true,
      softLimit: density.detailSoftLimit
    })
  }

  if (hasDirection) {
    if (hasLineUp) row.addSpacer(gridGutter(density))
    addDetailBlock(row, "DIRECTION", slice.direction, state, density, {
      emphasized: !hasLineUp,
      width: hasLineUp ? density.columnWidth : 2 * density.columnWidth + gridGutter(density),
      softLimit: hasLineUp ? density.detailSoftLimit : density.directionSoftLimit
    })
  }

  closeGridRow(row)
}

function addDetailBlock(parent, label, value, state, density, options = {}) {
  const block = parent.addStack()
  block.layoutVertically()
  block.size = new Size(options.width || density.columnWidth, 0)

  addCenteredLine(
    block,
    label,
    Font.semiboldSystemFont(density.detailLabelSize),
    secondary(),
    0.72
  )

  block.addSpacer(density.detailValueGap)
  addCenteredLine(
    block,
    value,
    options.time
      ? Font.boldMonospacedSystemFont(density.detailTimeSize)
      : Font.semiboldSystemFont(
          fitFont(
            options.emphasized ? density.emphasizedValueSize : density.detailValueSize,
            value,
            options.softLimit ?? density.detailSoftLimit,
            density.detailMinimumSize
          )
        ),
    options.emphasized ? accent(state) : THEME.getPrimaryTextColor(),
    0.68
  )
}

function addProgram(parent, service, state, focus, density) {
  const card = addSurface(parent, {
    padding: [
      density.programPaddingVertical,
      density.cardPaddingHorizontal,
      density.programPaddingVertical,
      density.cardPaddingHorizontal
    ],
    radius: density.programRadius,
    backgroundAlpha: 0.05,
    borderAlpha: 0.075,
    vertical: true
  })

  addSectionHeader(
    card,
    "PROGRAMME",
    `${service.slices.length} tranche${service.slices.length > 1 ? "s" : ""}`,
    density.sectionHeaderSize
  )
  card.addSpacer(density.programHeaderGap)

  const interruptions = Array.isArray(service.interruptions)
    ? service.interruptions
    : []

  service.slices.forEach((slice, index) => {
    addSliceRow(card, slice, state, density, programDetails(service, slice, state, focus, density))

    if (index >= service.slices.length - 1) return

    const interruption = interruptions.find(item => item.afterIndex === index)

    if (interruption && !isAnnouncedByPill(interruption, state)) {
      addInterruption(card, interruption, density)
    } else {
      card.addSpacer(density.rowGap)
    }
  })
}

function addInterruption(parent, interruption, density) {
  parent.addSpacer(density.interruptionGap)

  const row = parent.addStack()
  row.centerAlignContent()
  row.addSpacer()

  const parts = [interruption.label]
  if (density.interruptionTimes) parts.push(`${interruption.start} – ${interruption.end}`)
  parts.push(UTILS.formatDuration(interruption.duration))
  const value = parts.join(" · ")

  addText(
    row,
    value,
    Font.mediumSystemFont(density.interruptionSize),
    secondary(),
    1,
    0.7
  )

  row.addSpacer()
  parent.addSpacer(density.interruptionGap)
}

function isAnnouncedByPill(interruption, state) {
  return Boolean(
    state &&
    state.type === interruption.type &&
    state.next &&
    state.next.index === interruption.nextIndex &&
    Number(state.breakDuration) > 0
  )
}

function programDetails(service, slice, state, focus, density) {
  if (!density.sliceDetails) return []

  const shownAbove = slice.index === focus?.index && !density.hidesOperationalDetails
  const first = service.slices[0]
  const last = service.slices[service.slices.length - 1]

  return sliceDetailItems(slice).filter(item => {
    if (shownAbove && (item.group === "line" || item.group === depotRowKind(slice, state))) {
      return false
    }

    if (density.dayBounds && item.key === "dutyStart" && slice.index === first.index) return false
    if (density.dayBounds && item.key === "dutyEnd" && slice.index === last.index) return false

    return true
  })
}

function addSliceRow(parent, slice, state, density, details) {
  const active = isSliceActive(slice, state)
  const row = parent.addStack()
  row.setPadding(
    density.rowPaddingVertical,
    density.rowPaddingHorizontal,
    density.rowPaddingVertical,
    density.rowPaddingHorizontal
  )
  row.cornerRadius = density.rowRadius
  row.backgroundColor = active ? accentAlpha(state, 0.055) : THEME.translucentWhite(0.018)
  row.borderWidth = 0.5
  row.borderColor = active ? accentAlpha(state, 0.34) : THEME.translucentWhite(0.04)

  if (!details.length) {
    row.centerAlignContent()
    addSliceSummary(row, slice, active, state, density)
    return
  }

  row.layoutVertically()
  const summary = row.addStack()
  summary.centerAlignContent()
  addSliceSummary(summary, slice, active, state, density)
  row.addSpacer(density.sliceDetailsGap)
  addSliceDetails(row, details, active, state, density)
}

function sliceDetailItems(slice) {
  const items = []

  if (hasDepotTiming(slice)) {
    items.push({ key: "dutyStart", group: "exit", label: "PRISE DE SERVICE", value: slice.dutyStart, time: true })
    items.push({ key: "depotExit", group: "exit", label: "SORTIE DÉPÔT", value: slice.depotExitAt, time: true })
  }

  if (slice.lineUpAt) {
    items.push({
      key: "lineUp",
      group: "line",
      label: getOperationStartLabel(slice),
      value: slice.lineUpAt,
      emphasized: true
    })
  }

  if (slice.direction) {
    items.push({ key: "direction", group: "line", label: "DIRECTION", value: slice.direction })
  }

  if (slice.depotReturnAt) {
    items.push({ key: "depotReturn", group: "return", label: "RENTRÉE DÉPÔT", value: slice.depotReturnAt, time: true })
    items.push({ key: "dutyEnd", group: "return", label: "FIN DE SERVICE", value: slice.dutyEnd, time: true })
  }

  return items
}

const SLICE_DETAIL_COLUMNS = 3

function addSliceDetails(parent, items, active, state, density) {
  for (let start = 0; start < items.length; start += SLICE_DETAIL_COLUMNS) {
    if (start) parent.addSpacer(density.sliceDetailsGap)

    const line = parent.addStack()

    for (const item of items.slice(start, start + SLICE_DETAIL_COLUMNS)) {
      addSliceDetail(line, item, active, state, density)
    }
  }
}

function addSliceDetail(parent, item, active, state, density) {
  const cell = parent.addStack()
  cell.layoutVertically()
  cell.size = new Size(density.sliceDetailWidth, 0)

  addCenteredLine(
    cell,
    item.label,
    Font.semiboldSystemFont(density.sliceDetailLabelSize),
    secondary(),
    0.7
  )
  cell.addSpacer(1)
  addCenteredLine(
    cell,
    item.value,
    item.time
      ? Font.boldMonospacedSystemFont(density.sliceDetailValueSize)
      : Font.semiboldSystemFont(
          fitFont(density.sliceDetailValueSize, item.value, density.sliceDetailSoftLimit)
        ),
    item.emphasized && active ? accent(state) : THEME.getPrimaryTextColor(),
    0.7
  )
}

function addSliceSummary(row, slice, active, state, density) {
  const duration = UTILS.durationMinutes(slice.start, slice.end)
  const rail = row.addStack()
  rail.size = new Size(density.railWidth, density.railHeight)
  rail.cornerRadius = density.railWidth / 2
  rail.backgroundColor = active ? accentAlpha(state, 0.9) : THEME.translucentWhite(0.09)
  row.addSpacer(density.railGap)

  addSliceNumber(row, slice, active, state, density)
  row.addSpacer(density.itemGap)

  const info = row.addStack()
  info.layoutVertically()

  const titleValue = `Ligne ${slice.line} · Voiture ${slice.vehicle}`
  addText(
    info,
    titleValue,
    Font.boldSystemFont(
      fitFont(
        density.sliceTitleSize,
        titleValue,
        density.titleSoftLimit,
        density.titleMinimumSize
      )
    ),
    active ? THEME.getPrimaryTextColor() : THEME.getInactiveTextColor(),
    1,
    0.68
  ).leftAlignText()

  info.addSpacer(density.sliceDetailGap)
  const routeValue = `${slice.from} → ${slice.to}`
  addText(
    info,
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
    1,
    0.64
  ).leftAlignText()

  row.addSpacer(density.metricsGap)
  row.addSpacer()

  const metrics = row.addStack()
  metrics.layoutVertically()
  metrics.size = new Size(density.sliceMetricsWidth, 0)

  addCenteredLine(
    metrics,
    `${slice.start}–${slice.end}`,
    Font.boldMonospacedSystemFont(density.rangeSize),
    active ? accent(state) : THEME.getInactiveTimeColor(),
    0.7
  )
  metrics.addSpacer(density.sliceDetailGap)
  addCenteredLine(
    metrics,
    UTILS.formatDuration(duration),
    Font.mediumSystemFont(density.durationSize),
    secondary(),
    0.78
  )
}

function addSliceNumber(parent, slice, active, state, density) {
  const badge = parent.addStack()
  badge.size = new Size(density.numberSize, density.numberSize)
  badge.cornerRadius = density.numberSize / 2
  badge.backgroundColor = active ? accentAlpha(state, 0.2) : THEME.translucentWhite(0.065)
  badge.borderWidth = 0.5
  badge.borderColor = active ? accentAlpha(state, 0.3) : THEME.translucentWhite(0.06)
  badge.centerAlignContent()
  badge.addSpacer()
  addText(
    badge,
    slice.index,
    Font.boldSystemFont(density.numberFont),
    active ? accent(state) : secondary()
  )
  badge.addSpacer()
}

function addStats(parent, stats, density) {
  const card = addSurface(parent, {
    padding: [density.statPaddingVertical, 0, density.statPaddingVertical, 0],
    radius: density.statRadius,
    backgroundAlpha: 0.05,
    borderAlpha: 0.07
  })
  card.centerAlignContent()

  card.addSpacer()
  statItems(stats, density).forEach((item, index) => {
    if (index) addStatSeparator(card, density)
    addStatBlock(card, item.value, item.label, density)
  })
  card.addSpacer()
}

function statItems(stats, density) {
  const durations = [
    { value: UTILS.formatDuration(stats.work), label: "Travail" },
    { value: UTILS.formatDuration(stats.amplitude), label: "Amplitude" }
  ]

  if (!density.dayBounds) return durations

  return [
    { value: stats.start, label: "Prise de service" },
    ...durations,
    { value: stats.end, label: "Fin de service" }
  ]
}

// Des ressorts souples, pas centerAlignContent() : sur iPhone, il ne centre pas une pile verticale.
function addStatBlock(parent, value, label, density) {
  const block = parent.addStack()
  block.layoutVertically()
  block.size = new Size(density.statColumnWidth, 0)

  addCenteredLine(
    block,
    value,
    Font.boldSystemFont(density.statValueSize),
    THEME.getPrimaryTextColor(),
    0.75
  )
  block.addSpacer(1)
  addCenteredLine(
    block,
    label,
    Font.mediumSystemFont(density.statLabelSize),
    secondary(),
    0.75
  )
}

const STAT_SEPARATOR_WIDTH = 1

function addStatSeparator(parent, density) {
  const rule = parent.addStack()
  rule.size = new Size(STAT_SEPARATOR_WIDTH, density.statSeparatorHeight)
  rule.backgroundColor = THEME.translucentWhite(0.09)
}

function addStatusPill(parent, state, density) {
  const pill = parent.addStack()
  pill.setPadding(
    density.badgePaddingVertical,
    density.badgePaddingHorizontal,
    density.badgePaddingVertical,
    density.badgePaddingHorizontal
  )
  pill.cornerRadius = 10
  pill.backgroundColor = accentAlpha(state, 0.1)
  pill.borderWidth = 0.5
  pill.borderColor = accentAlpha(state, 0.22)
  addText(
    pill,
    getStatusLabel(state),
    Font.semiboldSystemFont(density.badgeSize),
    accent(state),
    1,
    0.72
  )
}

function getStatusLabel(state) {
  const duration = Number(state?.breakDuration) || 0
  const interruption = state?.type === "PAUSE" || state?.type === "CUT"
  return interruption && duration > 0
    ? `${state.label} ${UTILS.formatDuration(duration)}`
    : state.label
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
  addSymbol(badge, "arrow.right", Math.max(10, size * 0.48), accent(state))
  badge.addSpacer()
}

function addSectionHeader(parent, title, detail, fontSize) {
  const row = parent.addStack()
  row.centerAlignContent()
  addText(row, title, Font.semiboldSystemFont(fontSize), secondary(), 1, 0.75)
  row.addSpacer()
  addText(row, detail, Font.mediumSystemFont(fontSize), secondary(), 1, 0.75)
}

function addSurface(parent, options = {}) {
  const stack = parent.addStack()
  if (options.vertical) stack.layoutVertically()
  const padding = options.padding || [0, 0, 0, 0]
  stack.setPadding(padding[0], padding[1], padding[2], padding[3])
  stack.cornerRadius = options.radius ?? 14
  stack.backgroundColor = THEME.translucentWhite(options.backgroundAlpha ?? 0.05)
  stack.borderWidth = 0.5
  stack.borderColor = THEME.translucentWhite(options.borderAlpha ?? 0.07)
  return stack
}

function addDivider(parent) {
  const divider = parent.addStack()
  divider.size = new Size(0, 1)
  divider.backgroundColor = THEME.translucentWhite(0.07)
  divider.addSpacer()
}

function addCenteredLine(parent, value, font, color, scale = 0.72) {
  const row = parent.addStack()
  row.centerAlignContent()
  row.addSpacer()
  addText(row, value, font, color, 1, scale).centerAlignText()
  row.addSpacer()
}

function addText(parent, value, font, color, lines = 1, scale = 0.72) {
  const text = parent.addText(String(value ?? ""))
  text.font = font
  text.textColor = color
  text.lineLimit = lines
  text.minimumScaleFactor = Math.max(0.5, Math.min(1, Number(scale) || 0.72))
  return text
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

function getTransportIcon(service) {
  const slices = Array.isArray(service?.slices) ? service.slices : []
  return slices.some(isTramSlice) ? "tram.fill" : "bus.fill"
}

function isTramSlice(slice) {
  return UTILS.isTramLineCode(slice?.lineCode)
}

function hasDepotTiming(slice) {
  return Boolean(slice?.dutyStart && slice?.depotExitAt)
}

function hasOperationalDetails(slice) {
  return Boolean(
    slice && (slice.depotExitAt || slice.depotReturnAt || slice.lineUpAt || slice.direction)
  )
}

function getOperationStartLabel(slice) {
  return isTramSlice(slice) ? "DÉBUT EXPLOITATION" : "MISE EN LIGNE"
}

function getTimingStartLabel(state) {
  if (state?.type === "WORK") return "DÉBUT DE TRANCHE"
  if (state?.type === "DONE") return "DERNIÈRE TRANCHE"
  return "PROCHAINE TRANCHE"
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
  return (
    String(value || "")
      .trim()
      .toLowerCase() || "large"
  )
}

function fitFont(baseSize, value, softLimit, minimumSize) {
  const base = Math.max(1, Number(baseSize) || 1)
  const minimum = Math.min(base, Math.max(1, Number(minimumSize) || base * 0.7))
  const length = String(value ?? "").trim().length
  const limit = Math.max(1, Number(softLimit) || 1)
  if (length <= limit) return base
  return Math.round(Math.max(minimum, base * Math.max(0.7, limit / length)) * 2) / 2
}

function getDeviceSize() {
  try {
    const size = Device.screenSize()
    const first = Number(size?.width) || 0
    const second = Number(size?.height) || 0
    if (first > 0 && second > 0) {
      return { width: Math.min(first, second), height: Math.max(first, second) }
    }
  } catch (_) {}
  return { width: 390, height: 844 }
}

const TEXT_KEYS = Object.freeze([
  "badgeSize",
  "dateSize",
  "detailLabelSize",
  "detailMinimumSize",
  "detailTimeSize",
  "detailValueSize",
  "durationSize",
  "emphasizedValueSize",
  "interruptionSize",
  "numberFont",
  "placeMinimumSize",
  "placeSize",
  "rangeSize",
  "refreshButtonSize",
  "refreshClockSize",
  "routeMinimumSize",
  "sectionHeaderSize",
  "serviceSize",
  "sliceDetailLabelSize",
  "sliceDetailSize",
  "sliceDetailValueSize",
  "sliceTitleSize",
  "statLabelSize",
  "statValueSize",
  "timeSize",
  "timingLabelSize",
  "titleMinimumSize"
])

function withTextScale(density, scaleValue) {
  const scale = Number(scaleValue)

  if (!Number.isFinite(scale) || scale <= 1) return density

  const scaled = { ...density, hidesOperationalDetails: true }

  for (const key of TEXT_KEYS) {
    if (typeof scaled[key] === "number") {
      scaled[key] = Math.round(scaled[key] * scale * 10) / 10
    }
  }

  return scaled
}

function getDensity(sliceCountValue, textScale = 1) {
  return fitDensity(isCrowded(sliceCountValue) ? densityStandard() : densityComfortable(), textScale)
}

function getPortraitDensity(sliceCountValue, textScale = 1) {
  const crowded = isCrowded(sliceCountValue)

  // Les tailles du plein écran ne tiennent que sur un grand écran : ailleurs, il n'y garde que ses informations en plus.
  if (getDeviceSize().width < WIDE_SCREEN_WIDTH) {
    return fitDensity(
      { ...(crowded ? densityStandard() : densityComfortable()), ...PORTRAIT_INFORMATION },
      textScale
    )
  }

  return fitDensity(crowded ? densityPortraitStandard() : densityPortraitComfortable(), textScale)
}

function isCrowded(sliceCountValue) {
  return Math.max(1, Number(sliceCountValue) || 1) >= 3
}

function fitDensity(base, textScale) {
  const screen = getDeviceSize()
  return withColumnWidth(withTextScale(adaptDensity(base, screen.width), textScale), screen)
}

const LARGE_WIDGET_WIDTHS = Object.freeze([
  [320, 568, 292],
  [375, 667, 321],
  [375, 812, 329],
  [390, 844, 338],
  [393, 852, 338],
  [414, 736, 348],
  [414, 896, 360],
  [428, 926, 364],
  [430, 932, 364],
  [440, 956, 382]
])

function estimateWidgetWidth(screen) {
  let width = LARGE_WIDGET_WIDTHS[0][2]
  for (const [deviceWidth, deviceHeight, candidate] of LARGE_WIDGET_WIDTHS) {
    if (screen.width >= deviceWidth && screen.height >= deviceHeight) width = candidate
  }
  return width
}

const COLUMN_SAFETY_MARGIN = 18
const AVERAGE_GLYPH_EM = 0.6
const NARROW_SCREEN_WIDTH = 375
const WIDE_SCREEN_WIDTH = 440

const PORTRAIT_INFORMATION = Object.freeze({
  sliceDetails: true,
  interruptionTimes: true,
  dayBounds: true
})

function statColumnWidth(density, screen, columns) {
  const card =
    estimateWidgetWidth(screen) -
    2 * density.paddingHorizontal -
    COLUMN_SAFETY_MARGIN
  const separators = (columns - 1) * STAT_SEPARATOR_WIDTH

  return Math.max(0, Math.floor((card - separators) / columns))
}

function withColumnWidth(density, screen) {
  const inner =
    estimateWidgetWidth(screen) -
    2 * density.paddingHorizontal -
    2 * density.cardPaddingHorizontal -
    COLUMN_SAFETY_MARGIN
  const available = inner - gridGutter(density)
  const rowInner = inner - 2 * density.rowPaddingHorizontal
  const statColumns = density.dayBounds ? 4 : 2
  const sliceDetailWidth = Math.max(0, Math.floor(rowInner / SLICE_DETAIL_COLUMNS))
  return {
    ...density,
    columnWidth: Math.max(density.columnWidth, Math.floor(available / 2)),
    statColumns,
    statColumnWidth: statColumnWidth(density, screen, statColumns),
    sliceDetailWidth,
    sliceDetailSoftLimit: Math.max(
      1,
      Math.floor(sliceDetailWidth / (density.sliceDetailValueSize * AVERAGE_GLYPH_EM))
    )
  }
}

function adaptDensity(base, width) {
  if (width > NARROW_SCREEN_WIDTH) return base
  return {
    ...base,
    paddingHorizontal: Math.max(13, base.paddingHorizontal - 2),
    iconGap: Math.max(7, base.iconGap - 1),
    badgePaddingHorizontal: Math.max(6, base.badgePaddingHorizontal - 1),
    refreshWidth: Math.max(70, base.refreshWidth - 12),
    refreshButtonSize: Math.min(9, base.refreshButtonSize),
    refreshPaddingHorizontal: Math.max(6, base.refreshPaddingHorizontal - 1),
    cardPaddingHorizontal: Math.max(9, base.cardPaddingHorizontal - 1),
    timingArrowGap: Math.max(5, base.timingArrowGap - 1),
    arrowSize: Math.max(20, base.arrowSize - 2),
    columnWidth: Math.max(78, base.columnWidth - 8),
    programPaddingVertical: Math.max(6, base.programPaddingVertical - 1),
    rowPaddingHorizontal: Math.max(4, base.rowPaddingHorizontal - 1),
    itemGap: Math.max(5, base.itemGap - 1),
    railGap: Math.max(3, base.railGap - 1),
    sliceMetricsWidth: Math.max(76, base.sliceMetricsWidth - 8),
    metricsGap: Math.max(4, base.metricsGap - 1),
  }
}

function densityComfortable() {
  return {
    sliceDetails: false,
    interruptionTimes: false,
    dayBounds: false,
    paddingTop: 17,
    paddingBottom: 14,
    paddingHorizontal: 18,
    sectionGap: 7,
    iconSize: 38,
    iconSymbolSize: 18,
    iconGap: 11,
    serviceSize: 21,
    dateSize: 10,
    badgeSize: 10,
    badgePaddingVertical: 5,
    badgePaddingHorizontal: 8,
    refreshWidth: 86,
    refreshButtonSize: 10,
    refreshPaddingVertical: 4,
    refreshPaddingHorizontal: 8,
    refreshClockSize: 7.5,
    refreshGap: 2,
    surfaceRadius: 17,
    timingPaddingVertical: 8,
    cardPaddingHorizontal: 12,
    timingLabelSize: 8,
    timingLabelGap: 3,
    timeSize: 27,
    arrowSize: 28,
    timingArrowGap: 8,
    columnWidth: 92,
    placeGap: 3,
    placeSize: 10.5,
    placeSoftLimit: 18,
    placeMinimumSize: 7.5,
    detailsSectionGap: 4,
    detailGroupGap: 4,
    detailValueGap: 1,
    detailLabelSize: 7.5,
    detailValueSize: 10,
    emphasizedValueSize: 10.5,
    detailTimeSize: 11,
    detailSoftLimit: 26,
    directionSoftLimit: 34,
    detailMinimumSize: 7.5,
    programPaddingVertical: 9,
    programRadius: 16,
    sectionHeaderSize: 8,
    programHeaderGap: 6,
    rowGap: 6,
    interruptionGap: 2,
    interruptionSize: 8,
    rowPaddingVertical: 5,
    rowPaddingHorizontal: 6,
    rowRadius: 11,
    railWidth: 2,
    railHeight: 24,
    railGap: 5,
    itemGap: 8,
    numberSize: 25,
    numberFont: 10.5,
    sliceTitleSize: 12,
    sliceDetailSize: 9.5,
    titleSoftLimit: 28,
    titleMinimumSize: 9,
    routeSoftLimit: 36,
    routeMinimumSize: 7.4,
    rangeSize: 10.5,
    durationSize: 9,
    sliceMetricsWidth: 96,
    metricsGap: 6,
    sliceDetailGap: 3,
    statPaddingVertical: 5,
    pendingSymbolSize: 11,
    pendingSymbolGap: 5,
    pendingPaddingHorizontal: 7,
    statRadius: 12,
    statValueSize: 14,
    statLabelSize: 7.5,
    statSeparatorHeight: 26,
    sliceDetailsGap: 4,
    sliceDetailLabelSize: 7,
    sliceDetailValueSize: 9.5
  }
}

function densityStandard() {
  return {
    ...densityComfortable(),
    paddingTop: 15,
    paddingBottom: 12,
    paddingHorizontal: 16,
    sectionGap: 4,
    iconSize: 34,
    iconSymbolSize: 16,
    iconGap: 9,
    serviceSize: 19,
    dateSize: 9,
    badgeSize: 10,
    badgePaddingVertical: 4,
    badgePaddingHorizontal: 7,
    refreshWidth: 80,
    refreshButtonSize: 9.5,
    refreshPaddingVertical: 3,
    refreshPaddingHorizontal: 7,
    surfaceRadius: 16,
    timingPaddingVertical: 6,
    cardPaddingHorizontal: 11,
    timingLabelSize: 7.8,
    timeSize: 23,
    arrowSize: 24,
    timingArrowGap: 7,
    columnWidth: 84,
    placeSize: 9,
    placeMinimumSize: 8,
    detailsSectionGap: 2,
    detailGroupGap: 3,
    detailLabelSize: 7.8,
    detailValueSize: 8.5,
    emphasizedValueSize: 9,
    detailTimeSize: 9.5,
    detailSoftLimit: 24,
    directionSoftLimit: 30,
    detailMinimumSize: 8,
    programPaddingVertical: 7,
    programRadius: 15,
    sectionHeaderSize: 8,
    programHeaderGap: 5,
    rowGap: 4,
    interruptionGap: 1,
    interruptionSize: 7.2,
    rowPaddingVertical: 4,
    rowPaddingHorizontal: 5,
    rowRadius: 10,
    railHeight: 20,
    railGap: 4,
    itemGap: 6,
    numberSize: 21,
    numberFont: 9,
    sliceTitleSize: 10,
    sliceDetailSize: 8,
    titleSoftLimit: 27,
    titleMinimumSize: 8.5,
    routeSoftLimit: 35,
    routeMinimumSize: 7.6,
    rangeSize: 9.5,
    durationSize: 8.5,
    sliceMetricsWidth: 86,
    metricsGap: 5,
    sliceDetailGap: 2,
    statPaddingVertical: 4,
    pendingSymbolSize: 10,
    pendingSymbolGap: 4,
    pendingPaddingHorizontal: 6,
    statValueSize: 13,
    statLabelSize: 7.8,
    statSeparatorHeight: 24
  }
}

function densityPortraitComfortable() {
  return {
    ...densityComfortable(),
    ...PORTRAIT_INFORMATION,
    paddingTop: 20,
    paddingBottom: 18,
    sectionGap: 10,
    iconSize: 44,
    iconSymbolSize: 20,
    iconGap: 12,
    serviceSize: 25,
    dateSize: 11.5,
    badgeSize: 11.5,
    badgePaddingVertical: 6,
    badgePaddingHorizontal: 10,
    refreshWidth: 98,
    refreshButtonSize: 11.5,
    refreshPaddingVertical: 5,
    refreshPaddingHorizontal: 10,
    refreshClockSize: 8.5,
    refreshGap: 3,
    timingPaddingVertical: 11,
    timingLabelSize: 9,
    timingLabelGap: 4,
    timeSize: 32,
    arrowSize: 32,
    placeGap: 4,
    placeSize: 12,
    placeMinimumSize: 8.5,
    detailsSectionGap: 6,
    detailGroupGap: 6,
    detailValueGap: 2,
    detailLabelSize: 8.5,
    detailValueSize: 11.5,
    emphasizedValueSize: 12,
    detailTimeSize: 12.5,
    detailMinimumSize: 8.5,
    programPaddingVertical: 11,
    sectionHeaderSize: 9,
    programHeaderGap: 8,
    rowGap: 7,
    interruptionGap: 3,
    interruptionSize: 9,
    rowPaddingVertical: 7,
    railHeight: 28,
    numberSize: 28,
    numberFont: 12,
    sliceTitleSize: 13.5,
    sliceDetailSize: 10.5,
    rangeSize: 12,
    durationSize: 10,
    sliceMetricsWidth: 104,
    statPaddingVertical: 8,
    statValueSize: 15,
    statLabelSize: 8,
    statSeparatorHeight: 30,
    sliceDetailsGap: 6,
    sliceDetailLabelSize: 7.5,
    sliceDetailValueSize: 10.5
  }
}

function densityPortraitStandard() {
  return {
    ...densityPortraitComfortable(),
    paddingTop: 17,
    paddingBottom: 15,
    sectionGap: 7,
    iconSize: 40,
    iconSymbolSize: 18,
    serviceSize: 23,
    dateSize: 10.5,
    timingPaddingVertical: 8,
    timeSize: 28,
    arrowSize: 28,
    detailsSectionGap: 4,
    detailGroupGap: 4,
    programPaddingVertical: 8,
    programHeaderGap: 6,
    rowGap: 5,
    interruptionGap: 2,
    rowPaddingVertical: 5,
    railHeight: 24,
    numberSize: 25,
    numberFont: 11,
    sliceTitleSize: 12.5,
    sliceDetailSize: 9.5,
    rangeSize: 11,
    durationSize: 9.5,
    statPaddingVertical: 6,
    statValueSize: 14,
    statSeparatorHeight: 26,
    sliceDetailsGap: 4,
    sliceDetailValueSize: 10
  }
}

function validateContext(context) {
  if (!context || typeof context !== "object") {
    return { valid: false, error: "Le contexte du widget est absent." }
  }
  if (!context.service || !context.state || !context.stats || !context.displaySlice) {
    return { valid: false, error: "Les données nécessaires au widget sont incomplètes." }
  }
  if (!Array.isArray(context.service.slices) || !context.service.slices.length) {
    return { valid: false, error: "Aucune tranche ne peut être affichée." }
  }
  return { valid: true, error: "" }
}

function createErrorWidget(title, message, family, updatedAt) {
  if (isAccessoryFamily(family)) return createAccessoryMessage(family, title, message)

  const widget = new ListWidget()
  widget.backgroundColor = THEME.getErrorBackgroundColor()

  return fillMessageWidget(widget, {
    title,
    message,
    symbol: "exclamationmark.triangle.fill",
    symbolColor: THEME.getPrimaryTextColor(),
    messageLines: 4,
    updatedAt
  })
}

function createInfoWidget(title, message, family, updatedAt) {
  if (isAccessoryFamily(family)) return createAccessoryMessage(family, title, message)

  return fillMessageWidget(THEME.createBaseWidget("NEXT"), {
    title,
    message,
    symbol: "tray.and.arrow.down.fill",
    symbolColor: THEME.getAccentColor("NEXT"),
    messageLines: 6,
    updatedAt
  })
}

function fillMessageWidget(
  widget,
  { title, message, symbol, symbolColor, messageLines, updatedAt }
) {
  const clock = formatClock(updatedAt)

  widget.setPadding(18, 18, 18, 18)

  const header = widget.addStack()
  header.centerAlignContent()
  const icon = header.addStack()
  icon.size = new Size(34, 34)
  icon.cornerRadius = 17
  icon.backgroundColor = THEME.translucentWhite(0.08)
  icon.centerAlignContent()
  icon.addSpacer()
  addSymbol(icon, symbol, 15, symbolColor)
  icon.addSpacer()
  header.addSpacer(10)
  addText(header, title, Font.boldSystemFont(17), THEME.getPrimaryTextColor(), 1, 0.72)

  if (clock) {
    header.addSpacer()
    addRefreshBlock(header, clock, symbolColor, MESSAGE_REFRESH)
  }

  widget.addSpacer(10)
  const card = addSurface(widget, {
    padding: [11, 12, 11, 12],
    radius: 14,
    backgroundAlpha: 0.05,
    borderAlpha: 0.07
  })
  addText(card, message, Font.mediumSystemFont(11), secondary(), messageLines, 0.72)

  return markRendered(widget)
}

module.exports = {
  isRenderedWidget,
  getDensity,
  getPortraitDensity,
  estimateWidgetWidth,
  gridGutter,
  statSeparatorWidth: () => STAT_SEPARATOR_WIDTH,
  createWidget,
  createErrorWidget,
  createInfoWidget
}
