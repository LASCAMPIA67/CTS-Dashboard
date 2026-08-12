/*
 * Rendu HTML d'une UITable émulée, dans les deux schémas de couleurs.
 * L'objectif est de juger deux choses que le code seul ne montre pas :
 * l'équilibre visuel des lignes, et si la page tient sur un écran.
 */

const SYMBOL_PATHS = {
  "arrow.down.circle.fill": "M12 3v12M7 11l5 5 5-5M4 20h16",
  "checkmark.seal.fill": "M12 3l2 2 3-1 1 3 3 1-1 3 1 3-3 1-1 3-3-1-2 2-2-2-3 1-1-3-3-1 1-3-1-3 3-1 1-3 3 1zM9 12l2 2 4-4",
  "checkmark.shield.fill": "M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6zM8 12l3 3 5-5",
  "exclamationmark.triangle.fill": "M12 3l9 17H3zM12 9v5M12 17v.5",
  "shippingbox.fill": "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
  "trash.fill": "M4 6h16M9 6V4h6v2M6 6l1 14h10l1-14",
  "stethoscope": "M6 3v6a4 4 0 0 0 8 0V3M10 13v3a5 5 0 0 0 10 0v-2M20 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4",
  "doc.on.doc.fill": "M8 3h8l4 4v10H8zM4 7v14h10",
  "arrow.triangle.2.circlepath": "M4 9a8 8 0 0 1 14-3l2 2M20 15a8 8 0 0 1-14 3l-2-2M18 4v4h-4M6 20v-4h4",
  "lock.fill": "M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3",
  "list.bullet.rectangle.fill": "M3 5h18v14H3zM7 9h10M7 12h10M7 15h6",
  "gear": "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3",
  circle: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16"
}

const SCHEMES = {
  light: { page: "#F2F2F7", card: "#FFFFFF", separator: "rgba(60,60,67,0.18)" },
  dark: { page: "#000000", card: "#1C1C1E", separator: "rgba(84,84,88,0.5)" }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c])
}

function fontCss(font, fallbackSize) {
  const size = font?.size ?? fallbackSize
  const weight = font?.weight ?? 400
  const family = font?.monospaced ? "'Liberation Mono', monospace" : "'Liberation Sans', sans-serif"
  return `font-size:${size}px;font-weight:${weight};font-family:${family}`
}

function renderCell(cell, scheme, defaultColor) {
  const weight = cell.widthWeight || 1
  const base = `flex:${weight} 1 0;min-width:0;overflow:hidden;padding:0 6px;box-sizing:border-box`

  if (cell.kind === "image") {
    const path = SYMBOL_PATHS[cell.symbol] || SYMBOL_PATHS.circle
    return (
      `<div style="${base};display:flex;align-items:center;justify-content:center">` +
      `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${defaultColor}" ` +
      `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg></div>`
    )
  }

  const align = cell.centered ? "center" : cell.right ? "flex-end" : "flex-start"
  const textAlign = cell.centered ? "center" : cell.right ? "right" : "left"
  const titleColor = cell.titleColor ? cell.titleColor.css(scheme) : defaultColor
  const subtitleColor = cell.subtitleColor ? cell.subtitleColor.css(scheme) : defaultColor

  const title = cell.title
    ? `<div style="${fontCss(cell.titleFont, 15)};color:${titleColor};text-align:${textAlign};` +
      `white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.25">${escapeHtml(cell.title)}</div>`
    : ""

  const subtitle = cell.subtitle
    ? `<div style="${fontCss(cell.subtitleFont, 11)};color:${subtitleColor};text-align:${textAlign};` +
      `white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3;margin-top:2px">${escapeHtml(cell.subtitle)}</div>`
    : ""

  return (
    `<div style="${base};display:flex;flex-direction:column;justify-content:center;align-items:${align}">` +
    title + subtitle + "</div>"
  )
}

export function renderTable(table, { scheme = "dark", width = 390, label = "" } = {}) {
  const palette = SCHEMES[scheme]
  const defaultColor = scheme === "dark" ? "#F5F5F7" : "#111111"

  const rows = table.rows
    .map(row => {
      const cells = row.cells.map(cell => renderCell(cell, scheme, defaultColor)).join("")
      const border = table.showSeparators ? `border-bottom:0.5px solid ${palette.separator};` : ""
      return (
        `<div style="height:${row.height}px;display:flex;align-items:center;${border}` +
        `background:${palette.card};box-sizing:border-box;padding:0 10px">${cells}</div>`
      )
    })
    .join("")

  const height = table.rows.reduce((sum, row) => sum + row.height, 0)

  return { html: `<div class="table" style="width:${width}px">${rows}</div>`, height, label }
}

/*
 * Hauteur utile d'un écran iPhone pour une UITable présentée en plein
 * écran : hauteur du device moins la barre d'état, la barre de navigation
 * du présentateur Scriptable et l'indicateur d'accueil.
 */
export const USABLE_HEIGHT = {
  "SE (375×667)": 667 - 20 - 56,
  "standard (390×844)": 844 - 59 - 56 - 34,
  "Pro Max (430×932)": 932 - 59 - 56 - 34
}

export function renderSheet(panels) {
  const cards = panels
    .map(panel => {
      const limits = Object.entries(USABLE_HEIGHT)
        .map(([name, usable]) => {
          const fits = panel.height <= usable
          return `<span style="color:${fits ? "#30D158" : "#FF453A"}">${name} ${fits ? "✓" : "✗"}</span>`
        })
        .join(" · ")
      return (
        `<div class="panel">${panel.html}` +
        `<div class="caption">${escapeHtml(panel.label)} — ${panel.height} pt<br>${limits}</div></div>`
      )
    })
    .join("")

  return `<!doctype html><meta charset="utf-8"><style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#0A0A0B; padding:14px; font-family:'Liberation Sans',sans-serif; }
    .panel { display:inline-block; vertical-align:top; margin:10px; }
    .table { border-radius:12px; overflow:hidden; }
    .caption { color:#8A8F98; font-size:11px; padding:8px 2px 0; line-height:1.5; }
  </style>${cards}`
}
