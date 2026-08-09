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
      return createCanvasWidget("medium", context)
    default:
      return createCanvasWidget("large", context)
  }
}

function createMediumWidget(context) {
  return createCanvasWidget("medium", context)
}

function createLargeWidget(context) {
  return createCanvasWidget("large", context)
}

function createCanvasWidget(family, context) {
  const widget = new ListWidget()
  widget.setPadding(0, 0, 0, 0)

  const image = family === "medium"
    ? renderMediumCanvas(context)
    : renderLargeCanvas(context)

  widget.backgroundImage = image
  return widget
}

function renderMediumCanvas(context) {
  const {
    service,
    state,
    stats,
    displaySlice: focus
  } = context

  const size = getCanvasSize("medium")
  const ctx = createCanvas(size)
  const accentHex = THEME.getAccentHex(state.type)

  drawGradientBackground(
    ctx,
    size,
    THEME.getGradientColors(state.type)
  )

  const sx = size.width / 338
  const sy = size.height / 158
  const s = Math.min(sx, sy)
  const x = value => value * sx
  const y = value => value * sy
  const u = value => value * s

  const primary = THEME.getPrimaryTextColor()
  const secondaryColor = THEME.getSecondaryColor()
  const accentColor = new Color(accentHex)

  const iconRect = new Rect(x(16), y(12), u(31), u(31))
  fillRoundedRect(
    ctx,
    iconRect,
    u(15.5),
    new Color("#FFFFFF", 0.075),
    new Color("#FFFFFF", 0.09),
    u(0.5)
  )

  drawText(
    ctx,
    getTransportLetter(service),
    iconRect,
    Font.boldSystemFont(u(12)),
    accentColor,
    "center"
  )

  drawText(
    ctx,
    service.number,
    new Rect(x(56), y(11), x(154), y(21)),
    Font.boldSystemFont(u(18)),
    primary,
    "left"
  )

  drawText(
    ctx,
    WIDGET_ENGINE.formatServiceDate(service),
    new Rect(x(56), y(31), x(158), y(12)),
    Font.mediumSystemFont(u(9)),
    secondaryColor,
    "left"
  )

  const statusWidth = Math.min(
    x(104),
    Math.max(x(64), x(12 + String(state.label || "").length * 5.4))
  )

  const statusRect = new Rect(
    size.width - x(16) - statusWidth,
    y(16),
    statusWidth,
    y(24)
  )

  fillRoundedRect(
    ctx,
    statusRect,
    u(10),
    new Color(accentHex, 0.1),
    new Color(accentHex, 0.22),
    u(0.5)
  )

  drawText(
    ctx,
    state.label,
    statusRect,
    Font.semiboldSystemFont(u(9)),
    accentColor,
    "center"
  )

  const cardRect = new Rect(x(16), y(51), x(306), y(79))
  fillRoundedRect(
    ctx,
    cardRect,
    u(15),
    new Color("#FFFFFF", 0.055),
    new Color("#FFFFFF", 0.08),
    u(0.5)
  )

  drawText(
    ctx,
    `Ligne ${focus.line}`,
    new Rect(x(29), y(58), x(132), y(22)),
    Font.boldSystemFont(
      fitFontSize(24 * s, `Ligne ${focus.line}`, 14, 9 * s)
    ),
    primary,
    "left"
  )

  drawText(
    ctx,
    `Voiture ${focus.vehicle}`,
    new Rect(x(29), y(80), x(132), y(15)),
    Font.semiboldSystemFont(u(13)),
    accentColor,
    "left"
  )

  drawText(
    ctx,
    `${focus.start} → ${focus.end}`,
    new Rect(x(168), y(58), x(140), y(20)),
    Font.boldMonospacedSystemFont(u(15)),
    primary,
    "right"
  )

  drawText(
    ctx,
    UTILS.formatDuration(
      UTILS.durationMinutes(focus.start, focus.end)
    ),
    new Rect(x(168), y(80), x(140), y(14)),
    Font.semiboldSystemFont(u(10)),
    accentColor,
    "right"
  )

  ctx.setFillColor(new Color("#FFFFFF", 0.07))
  ctx.fillRect(new Rect(x(29), y(98), x(279), Math.max(1, y(0.7))))

  drawText(
    ctx,
    focus.from,
    new Rect(x(29), y(103), x(279), y(14)),
    Font.mediumSystemFont(
      fitFontSize(11 * s, focus.from, 31, 7.5 * s)
    ),
    secondaryColor,
    "left"
  )

  const summary = buildDepartureSummary(focus)
  if (summary.length) {
    const summaryLine = summary.join(" · ")
    drawText(
      ctx,
      summaryLine,
      new Rect(x(29), y(116), x(279), y(11)),
      Font.semiboldSystemFont(
        fitFontSize(8.5 * s, summaryLine, 52, 6.2 * s)
      ),
      accentColor,
      "left"
    )
  }

  drawText(
    ctx,
    `${stats.count} tranches · ${UTILS.formatDuration(stats.work)}`,
    new Rect(x(17), y(137), x(185), y(13)),
    Font.semiboldSystemFont(u(9)),
    secondaryColor,
    "left"
  )

  drawText(
    ctx,
    `Fin ${stats.end}`,
    new Rect(x(208), y(137), x(113), y(13)),
    Font.boldMonospacedSystemFont(u(10)),
    accentColor,
    "right"
  )

  return ctx.getImage()
}

function renderLargeCanvas(context) {
  const {
    service,
    state,
    stats,
    displaySlice: focus
  } = context

  const size = getCanvasSize("large")
  const ctx = createCanvas(size)
  const accentHex = THEME.getAccentHex(state.type)

  drawGradientBackground(
    ctx,
    size,
    THEME.getGradientColors(state.type)
  )

  const sx = size.width / 338
  const sy = size.height / 354
  const s = Math.min(sx, sy)
  const x = value => value * sx
  const y = value => value * sy
  const u = value => value * s

  const primary = THEME.getPrimaryTextColor()
  const secondaryColor = THEME.getSecondaryColor()
  const inactiveText = THEME.getInactiveTextColor()
  const inactiveTime = THEME.getInactiveTimeColor()
  const accentColor = new Color(accentHex)

  const iconRect = new Rect(x(17), y(15), u(38), u(38))
  fillRoundedRect(
    ctx,
    iconRect,
    u(19),
    new Color("#FFFFFF", 0.075),
    new Color("#FFFFFF", 0.09),
    u(0.5)
  )

  drawText(
    ctx,
    getTransportLetter(service),
    iconRect,
    Font.boldSystemFont(u(14)),
    accentColor,
    "center"
  )

  drawText(
    ctx,
    service.number,
    new Rect(x(67), y(14), x(150), y(24)),
    Font.boldSystemFont(u(21)),
    primary,
    "left"
  )

  drawText(
    ctx,
    WIDGET_ENGINE.formatServiceDate(service),
    new Rect(x(67), y(38), x(160), y(13)),
    Font.mediumSystemFont(u(10)),
    secondaryColor,
    "left"
  )

  const statusWidth = Math.min(
    x(110),
    Math.max(x(70), x(12 + String(state.label || "").length * 5.7))
  )
  const statusRect = new Rect(
    size.width - x(17) - statusWidth,
    y(21),
    statusWidth,
    y(25)
  )

  fillRoundedRect(
    ctx,
    statusRect,
    u(10),
    new Color(accentHex, 0.1),
    new Color(accentHex, 0.22),
    u(0.5)
  )

  drawText(
    ctx,
    state.label,
    statusRect,
    Font.semiboldSystemFont(u(10)),
    accentColor,
    "center"
  )

  const departureLines = buildCanvasDepartureLines(focus)
  const extraRows = Math.min(2, departureLines.length)
  const timingHeightBase = 92
  const timingHeight = timingHeightBase + extraRows * 10
  const timingTop = 61

  const timingRect = new Rect(
    x(17),
    y(timingTop),
    x(304),
    y(timingHeight)
  )

  fillRoundedRect(
    ctx,
    timingRect,
    u(17),
    new Color("#FFFFFF", 0.055),
    new Color("#FFFFFF", 0.085),
    u(0.5)
  )

  const leftX = 29
  const rightX = 177
  const columnW = 132

  drawText(
    ctx,
    getTimingStartLabel(state),
    new Rect(x(leftX), y(timingTop + 8), x(columnW), y(12)),
    Font.semiboldSystemFont(u(8)),
    secondaryColor,
    "left"
  )

  drawText(
    ctx,
    "FIN DE TRANCHE",
    new Rect(x(rightX), y(timingTop + 8), x(columnW), y(12)),
    Font.semiboldSystemFont(u(8)),
    secondaryColor,
    "left"
  )

  drawText(
    ctx,
    focus.start,
    new Rect(x(leftX), y(timingTop + 22), x(columnW), y(30)),
    Font.boldMonospacedSystemFont(u(27)),
    primary,
    "left"
  )

  drawText(
    ctx,
    focus.end,
    new Rect(x(rightX), y(timingTop + 22), x(columnW), y(30)),
    Font.boldMonospacedSystemFont(u(27)),
    primary,
    "left"
  )

  const arrowRect = new Rect(x(151), y(timingTop + 25), u(28), u(28))
  fillRoundedRect(
    ctx,
    arrowRect,
    u(14),
    new Color(accentHex, 0.11),
    new Color(accentHex, 0.24),
    u(0.5)
  )
  drawText(
    ctx,
    "→",
    arrowRect,
    Font.mediumSystemFont(u(18)),
    accentColor,
    "center"
  )

  drawText(
    ctx,
    focus.from,
    new Rect(x(leftX), y(timingTop + 56), x(columnW), y(15)),
    Font.mediumSystemFont(
      fitFontSize(10.5 * s, focus.from, 18, 7.5 * s)
    ),
    secondaryColor,
    "left"
  )

  drawText(
    ctx,
    focus.to,
    new Rect(x(rightX), y(timingTop + 56), x(columnW), y(15)),
    Font.mediumSystemFont(
      fitFontSize(10.5 * s, focus.to, 18, 7.5 * s)
    ),
    secondaryColor,
    "left"
  )

  if (extraRows) {
    ctx.setFillColor(new Color("#FFFFFF", 0.07))
    ctx.fillRect(
      new Rect(
        x(29),
        y(timingTop + 75),
        x(280),
        Math.max(1, y(0.7))
      )
    )

    departureLines
      .slice(0, extraRows)
      .forEach((line, index) => {
        drawText(
          ctx,
          line,
          new Rect(
            x(29),
            y(timingTop + 80 + index * 10),
            x(280),
            y(10)
          ),
          Font.semiboldSystemFont(
            fitFontSize(8.5 * s, line, 48, 6.5 * s)
          ),
          accentColor,
          "left"
        )
      })
  }

  const programTop = timingTop + timingHeight + 7
  const statsTop = 309
  const programHeight = Math.max(92, statsTop - programTop - 7)
  const programRect = new Rect(
    x(17),
    y(programTop),
    x(304),
    y(programHeight)
  )

  fillRoundedRect(
    ctx,
    programRect,
    u(16),
    new Color("#FFFFFF", 0.05),
    new Color("#FFFFFF", 0.075),
    u(0.5)
  )

  drawText(
    ctx,
    "PROGRAMME",
    new Rect(x(27), y(programTop + 8), x(125), y(12)),
    Font.semiboldSystemFont(u(8)),
    secondaryColor,
    "left"
  )

  const countLabel = `${service.slices.length} tranche${service.slices.length > 1 ? "s" : ""}`
  drawText(
    ctx,
    countLabel,
    new Rect(x(196), y(programTop + 8), x(112), y(12)),
    Font.mediumSystemFont(u(8)),
    secondaryColor,
    "right"
  )

  const slices = service.slices
  const rowGap = 5
  const rowsTop = programTop + 25
  const rowsBottom = programTop + programHeight - 8
  const availableRows = Math.max(30, rowsBottom - rowsTop)
  const rowH = Math.max(
    17,
    (availableRows - rowGap * Math.max(0, slices.length - 1)) /
      Math.max(1, slices.length)
  )

  slices.forEach((slice, index) => {
    const active = isSliceActive(slice, state)
    const top = rowsTop + index * (rowH + rowGap)

    const rowRect = new Rect(
      x(26),
      y(top),
      x(286),
      y(rowH)
    )

    fillRoundedRect(
      ctx,
      rowRect,
      u(Math.min(11, rowH / 3)),
      active
        ? new Color(accentHex, 0.085)
        : new Color("#FFFFFF", 0.018),
      active
        ? new Color(accentHex, 0.18)
        : new Color("#FFFFFF", 0.035),
      u(0.5)
    )

    const numberSize = Math.min(25, Math.max(16, rowH - 8))
    const numberRect = new Rect(
      x(31),
      y(top + (rowH - numberSize) / 2),
      u(numberSize),
      u(numberSize)
    )

    fillRoundedRect(
      ctx,
      numberRect,
      u(numberSize / 2),
      active
        ? new Color(accentHex, 0.2)
        : new Color("#FFFFFF", 0.065),
      active
        ? new Color(accentHex, 0.28)
        : new Color("#FFFFFF", 0.06),
      u(0.5)
    )

    drawText(
      ctx,
      String(slice.index),
      numberRect,
      Font.boldSystemFont(u(Math.min(10.5, numberSize * 0.4))),
      active ? accentColor : secondaryColor,
      "center"
    )

    const bodyX = 65
    const timeW = 85
    const bodyW = 236
    const titleSize = Math.max(7, Math.min(12, rowH * 0.31))
    const detailSize = Math.max(6, Math.min(9.8, rowH * 0.25))

    drawText(
      ctx,
      `Ligne ${slice.line} · Voiture ${slice.vehicle}`,
      new Rect(
        x(bodyX),
        y(top + 4),
        x(bodyW - timeW),
        y(Math.max(8, rowH * 0.43))
      ),
      Font.boldSystemFont(
        fitFontSize(
          titleSize * s,
          `Ligne ${slice.line} · Voiture ${slice.vehicle}`,
          27,
          7 * s
        )
      ),
      active ? primary : inactiveText,
      "left"
    )

    drawText(
      ctx,
      `${slice.start}–${slice.end}`,
      new Rect(
        x(222),
        y(top + 4),
        x(82),
        y(Math.max(8, rowH * 0.43))
      ),
      Font.boldMonospacedSystemFont(u(Math.max(7, Math.min(11, rowH * 0.28)))),
      active ? accentColor : inactiveTime,
      "right"
    )

    drawText(
      ctx,
      `${slice.from} → ${slice.to}`,
      new Rect(
        x(bodyX),
        y(top + rowH * 0.52),
        x(bodyW - 52),
        y(Math.max(8, rowH * 0.35))
      ),
      Font.mediumSystemFont(
        fitFontSize(
          detailSize * s,
          `${slice.from} → ${slice.to}`,
          36,
          6 * s
        )
      ),
      secondaryColor,
      "left"
    )

    drawText(
      ctx,
      UTILS.formatDuration(
        UTILS.durationMinutes(slice.start, slice.end)
      ),
      new Rect(
        x(248),
        y(top + rowH * 0.52),
        x(56),
        y(Math.max(8, rowH * 0.35))
      ),
      Font.mediumSystemFont(u(Math.max(6, Math.min(9, rowH * 0.24)))),
      secondaryColor,
      "right"
    )
  })

  const statY = 316
  const statH = 28
  const statGap = 8
  const statW = (304 - statGap) / 2

  drawStatCanvas(
    ctx,
    new Rect(x(17), y(statY), x(statW), y(statH)),
    UTILS.formatDuration(stats.work),
    "Travail",
    s
  )

  drawStatCanvas(
    ctx,
    new Rect(x(17 + statW + statGap), y(statY), x(statW), y(statH)),
    UTILS.formatDuration(stats.amplitude),
    "Amplitude",
    s
  )

  return ctx.getImage()
}

function createCanvas(size) {
  const ctx = new DrawContext()
  ctx.size = size
  ctx.opaque = true
  ctx.respectScreenScale = true
  return ctx
}

function getCanvasSize(family) {
  let screen

  try {
    screen = Device.screenSize()
  } catch (_) {
    screen = new Size(390, 844)
  }

  const width = Math.min(
    Number(screen?.width) || 390,
    Number(screen?.height) || 844
  )

  if (width <= 375) {
    return family === "medium"
      ? new Size(329, 155)
      : new Size(329, 345)
  }

  if (width <= 393) {
    return family === "medium"
      ? new Size(338, 158)
      : new Size(338, 354)
  }

  if (width <= 414) {
    return family === "medium"
      ? new Size(360, 169)
      : new Size(360, 379)
  }

  return family === "medium"
    ? new Size(364, 170)
    : new Size(364, 382)
}

function drawGradientBackground(ctx, size, colors) {
  const parsed = colors.map(parseHexColor)
  const stops = [0, 0.32, 0.68, 1]
  const bands = Math.max(80, Math.round(size.height))

  for (let index = 0; index < bands; index++) {
    const t = index / Math.max(1, bands - 1)
    const color = sampleGradient(parsed, stops, t)
    ctx.setFillColor(
      new Color(rgbToHex(color.r, color.g, color.b))
    )

    const top = size.height * index / bands
    const bottom = size.height * (index + 1) / bands
    ctx.fillRect(
      new Rect(
        0,
        top,
        size.width,
        Math.max(1, bottom - top + 0.5)
      )
    )
  }
}

function sampleGradient(colors, stops, t) {
  let rightIndex = 1

  while (
    rightIndex < stops.length - 1 &&
    t > stops[rightIndex]
  ) {
    rightIndex++
  }

  const leftIndex = Math.max(0, rightIndex - 1)
  const leftStop = stops[leftIndex]
  const rightStop = stops[rightIndex]
  const range = Math.max(0.0001, rightStop - leftStop)
  const local = clamp((t - leftStop) / range, 0, 1)
  const left = colors[leftIndex]
  const right = colors[rightIndex]

  return {
    r: Math.round(left.r + (right.r - left.r) * local),
    g: Math.round(left.g + (right.g - left.g) * local),
    b: Math.round(left.b + (right.b - left.b) * local)
  }
}

function parseHexColor(hex) {
  const value = String(hex || "#000000")
    .replace("#", "")
    .padEnd(6, "0")
    .slice(0, 6)

  return {
    r: parseInt(value.slice(0, 2), 16) || 0,
    g: parseInt(value.slice(2, 4), 16) || 0,
    b: parseInt(value.slice(4, 6), 16) || 0
  }
}

function rgbToHex(r, g, b) {
  const part = value =>
    Math.max(0, Math.min(255, value))
      .toString(16)
      .padStart(2, "0")

  return `#${part(r)}${part(g)}${part(b)}`
}

function fillRoundedRect(
  ctx,
  rect,
  radius,
  fillColor,
  strokeColor = null,
  strokeWidth = 0
) {
  const path = new Path()
  path.addRoundedRect(
    rect,
    radius,
    radius
  )

  ctx.addPath(path)
  ctx.setFillColor(fillColor)
  ctx.fillPath()

  if (strokeColor && strokeWidth > 0) {
    const strokePath = new Path()
    strokePath.addRoundedRect(
      rect,
      radius,
      radius
    )
    ctx.addPath(strokePath)
    ctx.setStrokeColor(strokeColor)
    ctx.setLineWidth(strokeWidth)
    ctx.strokePath()
  }
}

function drawText(
  ctx,
  value,
  rect,
  font,
  color,
  alignment = "left"
) {
  ctx.setFont(font)
  ctx.setTextColor(color)

  if (alignment === "right") {
    ctx.setTextAlignedRight()
  } else if (alignment === "center") {
    ctx.setTextAlignedCenter()
  } else {
    ctx.setTextAlignedLeft()
  }

  ctx.drawTextInRect(
    String(value ?? ""),
    rect
  )
}

function drawStatCanvas(ctx, rect, value, label, scale) {
  fillRoundedRect(
    ctx,
    rect,
    Math.max(8, 12 * scale),
    new Color("#FFFFFF", 0.05),
    new Color("#FFFFFF", 0.065),
    Math.max(0.5, 0.5 * scale)
  )

  drawText(
    ctx,
    value,
    new Rect(
      rect.x,
      rect.y + rect.height * 0.18,
      rect.width,
      rect.height * 0.46
    ),
    Font.boldSystemFont(Math.max(10, 14 * scale)),
    THEME.getPrimaryTextColor(),
    "center"
  )

  drawText(
    ctx,
    label,
    new Rect(
      rect.x,
      rect.y + rect.height * 0.62,
      rect.width,
      rect.height * 0.28
    ),
    Font.mediumSystemFont(Math.max(6.5, 7.5 * scale)),
    THEME.getSecondaryColor(),
    "center"
  )
}

function fitFontSize(baseSize, value, softLimit, minimumSize) {
  const safeBase = Math.max(1, Number(baseSize) || 1)
  const safeMinimum = Math.max(
    1,
    Math.min(safeBase, Number(minimumSize) || safeBase * 0.7)
  )
  const length = String(value ?? "").trim().length
  const limit = Math.max(1, Number(softLimit) || 1)

  if (length <= limit) {
    return safeBase
  }

  return Math.max(
    safeMinimum,
    safeBase * Math.max(0.64, limit / length)
  )
}

function getTransportLetter(service) {
  return service?.slices?.some(slice => isTramSlice(slice))
    ? "T"
    : "B"
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
    1
  )

  header.addSpacer()
  addStatusPill(header, state, 8, [3, 6, 3, 6])

  widget.addSpacer(7)

  addText(
    widget,
    `Ligne ${focus.line}`,
    Font.boldSystemFont(21),
    THEME.getPrimaryTextColor(),
    1
  )

  widget.addSpacer(2)

  addText(
    widget,
    `Voiture ${focus.vehicle}`,
    Font.semiboldSystemFont(10),
    accent(state),
    1
  )

  widget.addSpacer(7)

  const timingCard = addSurface(
    widget,
    {
      padding: [6, 8, 6, 8],
      radius: 11,
      backgroundAlpha: 0.05,
      borderAlpha: 0.075
    }
  )

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
    THEME.getSecondaryColor()
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
        softLimit: 30,
        minimumSize: 6.5
      }
    )
    widget.addSpacer(4)
  }

  addText(
    widget,
    `${stats.count} tranches · ${UTILS.formatDuration(stats.work)}`,
    Font.mediumSystemFont(9),
    THEME.getSecondaryColor(),
    1
  )

  return widget
}

function addSmallTime(parent, label, time, align) {
  const block = parent.addStack()
  block.layoutVertically()

  const labelText = addText(
    block,
    label,
    Font.semiboldSystemFont(6.5),
    THEME.getSecondaryColor(),
    1
  )

  const timeText = addText(
    block,
    time,
    Font.boldMonospacedSystemFont(14),
    THEME.getPrimaryTextColor(),
    1
  )

  alignText(labelText, align)
  alignText(timeText, align)
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

  return ["80", "81", "82", "83", "84", "85"]
    .includes(lineCode)
}

function buildCanvasDepartureLines(slice) {
  const lines = []

  if (hasDepotTiming(slice)) {
    lines.push(
      `Prise ${slice.dutyStart} · Sortie dépôt ${slice.depotExitAt}`
    )
  }

  const operation = []

  if (slice?.lineUpAt) {
    operation.push(
      `${isTramSlice(slice) ? "Début exploitation" : "Mise en ligne"} : ${slice.lineUpAt}`
    )
  }

  if (slice?.direction) {
    operation.push(`Direction : ${slice.direction}`)
  }

  if (operation.length) {
    lines.push(operation.join(" · "))
  }

  return lines
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
        fitFontSize(
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

function addStatusPill(parent, state, fontSize, padding) {
  const pill = parent.addStack()
  pill.setPadding(
    padding[0],
    padding[1],
    padding[2],
    padding[3]
  )
  pill.cornerRadius = 10
  pill.backgroundColor = new Color(
    THEME.getAccentHex(state.type),
    0.1
  )
  pill.borderWidth = 0.5
  pill.borderColor = new Color(
    THEME.getAccentHex(state.type),
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
  stack.backgroundColor = new Color(
    "#FFFFFF",
    options.backgroundAlpha ?? 0.05
  )
  stack.borderWidth = 0.5
  stack.borderColor = new Color(
    "#FFFFFF",
    options.borderAlpha ?? 0.07
  )

  return stack
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
  icon.backgroundColor = new Color("#FFFFFF", 0.08)
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

  const card = addSurface(
    widget,
    {
      padding: [11, 12, 11, 12],
      radius: 14,
      backgroundAlpha: 0.05,
      borderAlpha: 0.07
    }
  )

  addText(
    card,
    message,
    Font.mediumSystemFont(11),
    THEME.getSecondaryColor(),
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

function addStatCard(parent, value, label, options = {}) {
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
  addText(
    card,
    value,
    Font.boldSystemFont(options.valueSize || 14),
    THEME.getPrimaryTextColor(),
    1
  ).centerAlignText()
  card.addSpacer(1)
  addText(
    card,
    label,
    Font.mediumSystemFont(options.labelSize || 7.5),
    THEME.getSecondaryColor(),
    1
  ).centerAlignText()

  return card
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

function normalizeFamily(value) {
  const family = String(value || "")
    .trim()
    .toLowerCase()

  return VALID_FAMILIES.includes(family)
    ? family
    : "large"
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
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
