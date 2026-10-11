import { iconUrl } from "../art.js";

export const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const icon = (name, cls = "icon") =>
  `<img class="${cls}" src="${iconUrl(name)}" alt="" draggable="false">`;
export const button = (action, text, cls = "", attributes = "") =>
  `<button class="pixel-button ${cls}" data-action="${action}" ${attributes}>${text}</button>`;
export const timeText = (n) =>
  `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(n % 60)
    .toString()
    .padStart(2, "0")}`;

export function panel(
  body,
  { title = "", eyebrow = "", compact = false, close = null, footer = "" } = {},
) {
  return `<div class="overlay"><section class="panel ${compact ? "compact" : ""}" role="dialog" aria-modal="true" aria-label="${escape(title)}"><div class="panel-head"><div><div class="eyebrow" data-pad-menu data-original="${escape(eyebrow)}">${eyebrow}</div><h2>${title}</h2></div>${close ? `<button class="close" data-action="${close}" aria-label="閉じる">×</button>` : ""}</div><div class="panel-content">${body}</div>${footer ? `<div class="panel-footer">${footer}</div>` : ""}</section></div>`;
}
