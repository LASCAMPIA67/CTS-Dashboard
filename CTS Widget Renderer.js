// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: cyan; icon-glyph: rectangle.3.group;

const UTILS = importModule("CTS Utils")
const THEME = importModule("CTS Widget Theme")
const rendered = new WeakSet()

function markRendered(widget) {
  try {
    rendered.add(widget)
  } catch (_) {}

  return widget
}

function isRenderedWidget(widget) {
  try {
    return rendered.has(widget)
  } catch (_) {
    return false
  }
}

function createWidget(family, context) {
  const validation = validateContext(context)

  if (!validation.valid) {
    return createErrorWidget("Service invalide", validation.error, family)
  }

  if (normalizeFamily(family) === "large") return createLargeWidget(context)
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

  if (type === "NEXT") {
    return { label: "PROCHAIN", time: focus?.dutyStart || focus?.start || "", place: focus?.from || "" }
  }

  return { label: "PRISE", time: focus?.dutyStart || focus?.start || "", place: focus?.from || "" }
}

function createAccessoryWidget(family, context) {
  const normalized = normalizeFamily(family)
  const focus = accessoryFocus(context)
  const service = context.service

  if (normalized === "accessoryinline") {
    const widget = createAccessoryBase()
    const label = sentenceCase(focus.label)
    const parts = [service.number, focus.time ? `${label} ${focus.time}` : label]

    if (focus.place) parts.push(focus.place)

    widget.addText(parts.join(" · "))
    return markRendered(widget)
  }

  if (normalized === "accessorycircular") {
    const widget = createAccessoryBase()
    const column = widget.addStack()
    column.layoutVertically()
    column.centerAlignContent()
    column.addSpacer()
    addCenteredLine(column, focus.label, Font.boldSystemFont(9), Color.white(), 0.6)
    column.addSpacer(1)
    addCenteredLine(
      column,
      focus.time || "—",
      Font.boldMonospacedSystemFont(15),
      Color.white(),
      0.5
    )
    column.addSpacer()
    return markRendered(widget)
  }

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


function createLargeWidget(context) {
  const { service, state, stats, displaySlice: focus } = context
  const density = getDensity(service.slices.length, context?.preferences?.textScale)
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
  addProgram(widget, service, state, density)
  widget.addSpacer(density.sectionGap)
  addStats(widget, stats, density)
  return markRendered(widget)
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
  addPendingBadge(row, context, state, density)
  addStatusPill(row, state, density)
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

function addDepotRow(parent, slice, state, density) {
  const running = state?.type === "DONE" || state?.type === "WORK"

  if (running && slice.depotReturnAt) {
    const row = addGridRow(parent)
    addDetailBlock(row, "RENTRÉE DÉPÔT", slice.depotReturnAt, state, density, { time: true })
    row.addSpacer(gridGutter(density))
    addDetailBlock(row, "FIN DE SERVICE", slice.dutyEnd, state, density, { time: true })
    closeGridRow(row)
    return true
  }

  if (!hasDepotTiming(slice)) return false

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
    addDetailBlock(row, getOperationStartLabel(slice), slice.lineUpAt, state, density)
  }

  if (hasDirection) {
    if (hasLineUp) row.addSpacer(gridGutter(density))
    addDetailBlock(row, "DIRECTION", slice.direction, state, density, {
      emphasized: true,
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
            options.emphasized ? density.directionSize : density.detailValueSize,
            value,
            options.softLimit ??
              (options.emphasized ? density.directionSoftLimit : density.detailSoftLimit),
            density.detailMinimumSize
          )
        ),
    options.emphasized ? accent(state) : THEME.getPrimaryTextColor(),
    0.68
  )
}

function addProgram(parent, service, state, density) {
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

  service.slices.forEach((slice, index) => {
    addSliceRow(card, slice, state, density)
    if (index < service.slices.length - 1) card.addSpacer(density.rowGap)
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
  row.backgroundColor = active ? accentAlpha(state, 0.055) : THEME.translucentWhite(0.018)
  row.borderWidth = 0.5
  row.borderColor = active ? accentAlpha(state, 0.34) : THEME.translucentWhite(0.04)

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
    padding: [
      density.statPaddingVertical,
      density.statPaddingHorizontal,
      density.statPaddingVertical,
      density.statPaddingHorizontal
    ],
    radius: density.statRadius,
    backgroundAlpha: 0.05,
    borderAlpha: 0.07
  })
  card.centerAlignContent()

  addStatBlock(card, UTILS.formatDuration(stats.work), "Travail", density)
  addStatSeparator(card, density)
  addStatBlock(card, UTILS.formatDuration(stats.amplitude), "Amplitude", density)
}

function addStatBlock(parent, value, label, density) {
  parent.addSpacer()

  const block = parent.addStack()
  block.layoutVertically()
  block.centerAlignContent()
  addText(
    block,
    value,
    Font.boldSystemFont(density.statValueSize),
    THEME.getPrimaryTextColor(),
    1,
    0.75
  ).centerAlignText()
  block.addSpacer(1)
  addText(
    block,
    label,
    Font.mediumSystemFont(density.statLabelSize),
    secondary(),
    1,
    0.75
  ).centerAlignText()

  parent.addSpacer()
}

function addStatSeparator(parent, density) {
  const rule = parent.addStack()
  rule.size = new Size(1, density.statSeparatorHeight)
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
  return ["80", "81", "82", "83", "84", "85"].includes(String(slice?.lineCode || "").trim())
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
  "directionSize",
  "durationSize",
  "numberFont",
  "placeMinimumSize",
  "placeSize",
  "rangeSize",
  "routeMinimumSize",
  "sectionHeaderSize",
  "serviceSize",
  "sliceDetailSize",
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
  const count = Math.max(1, Number(sliceCountValue) || 1)
  const base =
    count >= 4 ? densityCompact() : count >= 3 ? densityStandard() : densityComfortable()
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

function withColumnWidth(density, screen) {
  const inner =
    estimateWidgetWidth(screen) -
    2 * density.paddingHorizontal -
    2 * density.cardPaddingHorizontal -
    COLUMN_SAFETY_MARGIN
  const available = inner - gridGutter(density)
  return {
    ...density,
    columnWidth: Math.max(density.columnWidth, Math.floor(available / 2))
  }
}

function adaptDensity(base, width) {
  if (width > 375) return base
  return {
    ...base,
    paddingHorizontal: Math.max(13, base.paddingHorizontal - 2),
    iconGap: Math.max(7, base.iconGap - 1),
    badgePaddingHorizontal: Math.max(6, base.badgePaddingHorizontal - 1),
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
    statPaddingHorizontal: Math.max(16, base.statPaddingHorizontal - 3)
  }
}

function densityComfortable() {
  return {
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
    directionSize: 10.5,
    detailTimeSize: 11,
    detailSoftLimit: 26,
    directionSoftLimit: 34,
    detailMinimumSize: 7.5,
    programPaddingVertical: 9,
    programRadius: 16,
    sectionHeaderSize: 8,
    programHeaderGap: 6,
    rowGap: 6,
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
    statPaddingHorizontal: 24,
    statPaddingVertical: 5,
    pendingSymbolSize: 11,
    pendingSymbolGap: 5,
    pendingPaddingHorizontal: 7,
    statRadius: 12,
    statValueSize: 14,
    statLabelSize: 7.5,
    statSeparatorHeight: 26
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
    directionSize: 9,
    detailTimeSize: 9.5,
    detailSoftLimit: 24,
    directionSoftLimit: 30,
    detailMinimumSize: 8,
    programPaddingVertical: 7,
    programRadius: 15,
    sectionHeaderSize: 8,
    programHeaderGap: 5,
    rowGap: 4,
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
    statPaddingHorizontal: 19,
    statPaddingVertical: 4,
    pendingSymbolSize: 10,
    pendingSymbolGap: 4,
    pendingPaddingHorizontal: 6,
    statValueSize: 13,
    statLabelSize: 7.8,
    statSeparatorHeight: 24
  }
}

function densityCompact() {
  return {
    ...densityStandard(),
    paddingTop: 13,
    paddingBottom: 11,
    paddingHorizontal: 15,
    sectionGap: 4,
    iconSize: 31,
    iconSymbolSize: 14,
    iconGap: 8,
    serviceSize: 17,
    dateSize: 8.5,
    badgeSize: 8.5,
    surfaceRadius: 15,
    timingPaddingVertical: 5,
    cardPaddingHorizontal: 10,
    timingLabelSize: 6.8,
    timeSize: 21,
    arrowSize: 22,
    timingArrowGap: 6,
    columnWidth: 78,
    placeSize: 8.5,
    placeMinimumSize: 7,
    detailsSectionGap: 3,
    detailLabelSize: 6.5,
    detailValueSize: 7.5,
    directionSize: 8,
    detailTimeSize: 8.5,
    detailSoftLimit: 22,
    directionSoftLimit: 28,
    detailMinimumSize: 6.5,
    programPaddingVertical: 6,
    programRadius: 14,
    sectionHeaderSize: 7,
    programHeaderGap: 4,
    rowGap: 3,
    rowPaddingVertical: 3,
    rowPaddingHorizontal: 4,
    railHeight: 17,
    railGap: 3,
    itemGap: 5,
    numberSize: 18,
    numberFont: 8,
    sliceTitleSize: 9,
    sliceDetailSize: 7.2,
    titleSoftLimit: 26,
    titleMinimumSize: 7.5,
    routeSoftLimit: 34,
    routeMinimumSize: 6.5,
    rangeSize: 8,
    durationSize: 7,
    sliceMetricsWidth: 78,
    metricsGap: 4,
    sliceDetailGap: 1,
    statPaddingHorizontal: 17,
    statValueSize: 12.5,
    statLabelSize: 6.8,
    statSeparatorHeight: 21
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

function createErrorWidget(title, message, family) {
  if (isAccessoryFamily(family)) return createAccessoryMessage(family, title, message)

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
  addSymbol(icon, "exclamationmark.triangle.fill", 15, THEME.getPrimaryTextColor())
  icon.addSpacer()
  header.addSpacer(10)
  addText(header, title, Font.boldSystemFont(17), THEME.getPrimaryTextColor(), 1, 0.72)

  widget.addSpacer(10)
  const card = addSurface(widget, {
    padding: [11, 12, 11, 12],
    radius: 14,
    backgroundAlpha: 0.05,
    borderAlpha: 0.07
  })
  addText(card, message, Font.mediumSystemFont(11), secondary(), 4, 0.72)
  return markRendered(widget)
}

function createInfoWidget(title, message, family) {
  if (isAccessoryFamily(family)) return createAccessoryMessage(family, title, message)

  const widget = THEME.createBaseWidget("NEXT")
  widget.setPadding(18, 18, 18, 18)

  const header = widget.addStack()
  header.centerAlignContent()
  const icon = header.addStack()
  icon.size = new Size(34, 34)
  icon.cornerRadius = 17
  icon.backgroundColor = THEME.translucentWhite(0.08)
  icon.centerAlignContent()
  icon.addSpacer()
  addSymbol(icon, "tray.and.arrow.down.fill", 15, THEME.getAccentColor("NEXT"))
  icon.addSpacer()
  header.addSpacer(10)
  addText(header, title, Font.boldSystemFont(17), THEME.getPrimaryTextColor(), 1, 0.72)

  widget.addSpacer(10)
  const card = addSurface(widget, {
    padding: [11, 12, 11, 12],
    radius: 14,
    backgroundAlpha: 0.05,
    borderAlpha: 0.07
  })
  addText(card, message, Font.mediumSystemFont(11), secondary(), 6, 0.72)
  return markRendered(widget)
}

module.exports = {
  isRenderedWidget,
  isAccessoryFamily,
  getDensity,
  estimateWidgetWidth,
  gridGutter,
  createWidget,
  createLargeWidget,
  createErrorWidget,
  createInfoWidget
}
