// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: yellow; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: teal; icon-glyph: paintpalette;

// CTS Widget Theme.js
// Gestion centralisée du thème visuel du widget CTS.

const GRADIENT_LOCATIONS = [
  0,
  0.32,
  0.68,
  1
]

const VALID_STATE_TYPES = [
  "NEXT",
  "BEFORE",
  "WORK",
  "PAUSE",
  "CUT",
  "DONE",
  "UNKNOWN"
]

const PALETTES = {
  NEXT: {
    gradient: [
      "#294366",
      "#1A2E4A",
      "#101D31",
      "#080E18"
    ],
    accent: "#A9C9F4"
  },

  BEFORE: {
    gradient: [
      "#294366",
      "#1A2E4A",
      "#101D31",
      "#080E18"
    ],
    accent: "#A9C9F4"
  },

  WORK: {
    gradient: [
      "#225044",
      "#17392F",
      "#0D251F",
      "#06130F"
    ],
    accent: "#9DDBBC"
  },

  PAUSE: {
    gradient: [
      "#4B371F",
      "#342615",
      "#21170C",
      "#100A05"
    ],
    accent: "#EFC889"
  },

  CUT: {
    gradient: [
      "#3B2B56",
      "#291D40",
      "#190F2A",
      "#0C0714"
    ],
    accent: "#D8B9F7"
  },

  DONE: {
    gradient: [
      "#373A42",
      "#272A31",
      "#181A1F",
      "#0B0C0F"
    ],
    accent: "#D0D4DA"
  },

  UNKNOWN: {
    gradient: [
      "#29313D",
      "#1B222C",
      "#11171E",
      "#080B0F"
    ],
    accent: "#B6C0CD"
  }
}

const COLORS = {
  primaryText: "#F7F8FA",
  secondaryText: "#B8C0CB",
  inactiveText: "#E2E6EB",
  inactiveTime: "#D7DCE2",
  errorBackground: "#151317"
}

function createBaseWidget(stateType) {
  const widget = new ListWidget()

  widget.backgroundGradient =
    createGradient(
      getGradientColors(stateType)
    )

  return widget
}

function createGradient(colors) {
  const gradient = new LinearGradient()

  gradient.locations =
    GRADIENT_LOCATIONS

  gradient.colors =
    colors.map(
      hex => new Color(hex)
    )

  gradient.startPoint =
    new Point(0, 0)

  gradient.endPoint =
    new Point(1, 1)

  return gradient
}

function getGradientColors(stateType) {
  return getPalette(stateType)
    .gradient
    .slice()
}

function getAccentHex(stateType) {
  return getPalette(stateType).accent
}

function getAccentColor(stateType) {
  return new Color(
    getAccentHex(stateType)
  )
}

function getSecondaryColor() {
  return new Color(
    COLORS.secondaryText
  )
}

function getPrimaryTextColor() {
  return new Color(
    COLORS.primaryText
  )
}

function getInactiveTextColor() {
  return new Color(
    COLORS.inactiveText
  )
}

function getInactiveTimeColor() {
  return new Color(
    COLORS.inactiveTime
  )
}

function getErrorBackgroundColor() {
  return new Color(
    COLORS.errorBackground
  )
}

function translucentWhite(opacity) {
  return new Color(
    "#FFFFFF",
    clampOpacity(opacity)
  )
}

function getPalette(stateType) {
  const normalizedType =
    normalizeStateType(stateType)

  return (
    PALETTES[normalizedType] ||
    PALETTES.UNKNOWN
  )
}

function clampOpacity(value) {
  const opacity = Number(value)

  if (!Number.isFinite(opacity)) {
    return 0
  }

  return Math.max(
    0,
    Math.min(1, opacity)
  )
}

function normalizeStateType(value) {
  const normalized = String(
    value || ""
  )
    .trim()
    .toUpperCase()

  return VALID_STATE_TYPES.includes(
    normalized
  )
    ? normalized
    : "UNKNOWN"
}

module.exports = {
  createBaseWidget,
  getGradientColors,
  getAccentHex,
  getAccentColor,
  getSecondaryColor,
  getPrimaryTextColor,
  getInactiveTextColor,
  getInactiveTimeColor,
  getErrorBackgroundColor,
  translucentWhite,
  normalizeStateType
}