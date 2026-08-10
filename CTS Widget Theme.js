// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: teal; icon-glyph: paintpalette;

const GRADIENT_LOCATIONS = Object.freeze([0, 0.32, 0.68, 1])
const PALETTES = Object.freeze({
  NEXT: Object.freeze({ gradient: ["#294366", "#1A2E4A", "#101D31", "#080E18"], accent: "#A9C9F4" }),
  BEFORE: Object.freeze({ gradient: ["#294366", "#1A2E4A", "#101D31", "#080E18"], accent: "#A9C9F4" }),
  WORK: Object.freeze({ gradient: ["#225044", "#17392F", "#0D251F", "#06130F"], accent: "#9DDBBC" }),
  PAUSE: Object.freeze({ gradient: ["#4B371F", "#342615", "#21170C", "#100A05"], accent: "#EFC889" }),
  CUT: Object.freeze({ gradient: ["#3B2B56", "#291D40", "#190F2A", "#0C0714"], accent: "#D8B9F7" }),
  DONE: Object.freeze({ gradient: ["#373A42", "#272A31", "#181A1F", "#0B0C0F"], accent: "#D0D4DA" }),
  UNKNOWN: Object.freeze({ gradient: ["#29313D", "#1B222C", "#11171E", "#080B0F"], accent: "#B6C0CD" })
})

const COLORS = Object.freeze({
  primaryText: "#F7F8FA",
  secondaryText: "#B8C0CB",
  inactiveText: "#E2E6EB",
  inactiveTime: "#D7DCE2",
  errorBackground: "#151317"
})

function createBaseWidget(stateType) {
  const widget = new ListWidget()
  widget.backgroundGradient = createGradient(getGradientColors(stateType))
  return widget
}

function createGradient(colors) {
  const gradient = new LinearGradient()
  gradient.locations = [...GRADIENT_LOCATIONS]
  gradient.colors = colors.map(hex => new Color(hex))
  gradient.startPoint = new Point(0, 0)
  gradient.endPoint = new Point(1, 1)
  return gradient
}

function getPalette(stateType) {
  return PALETTES[normalizeStateType(stateType)] || PALETTES.UNKNOWN
}

function normalizeStateType(value) {
  const normalized = String(value || "").trim().toUpperCase()
  return Object.prototype.hasOwnProperty.call(PALETTES, normalized)
    ? normalized
    : "UNKNOWN"
}

function clampOpacity(value) {
  const opacity = Number(value)
  return Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 0
}

function getGradientColors(stateType) { return [...getPalette(stateType).gradient] }
function getAccentHex(stateType) { return getPalette(stateType).accent }
function getAccentColor(stateType) { return new Color(getAccentHex(stateType)) }
function getSecondaryColor() { return new Color(COLORS.secondaryText) }
function getPrimaryTextColor() { return new Color(COLORS.primaryText) }
function getInactiveTextColor() { return new Color(COLORS.inactiveText) }
function getInactiveTimeColor() { return new Color(COLORS.inactiveTime) }
function getErrorBackgroundColor() { return new Color(COLORS.errorBackground) }
function translucentWhite(opacity) { return new Color("#FFFFFF", clampOpacity(opacity)) }

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
