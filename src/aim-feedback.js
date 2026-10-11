const SOURCES = new Set(["mouse", "pad", "touch"]);
const LABELS = {
  assist: "自動照準",
  mouse: "マウス照準",
  pad: "スティック照準",
  touch: "タッチ照準",
};

export function aimSource(intent, settings = {}) {
  return !settings.autoAim && SOURCES.has(intent?.source)
    ? intent.source
    : "assist";
}

export function aimLabel(intent, settings) {
  return LABELS[aimSource(intent, settings)];
}

// Read the angle already used by the simulation. Never pick another target or
// change the shot to make the presentation agree with the cursor.
export function aimCue(game, intent, settings = {}) {
  if (game?.mode !== "combat") return null;
  const p = game.player;
  if (![p?.x, p?.y, p?.angle].every(Number.isFinite)) return null;
  const source = aimSource(intent, settings);
  if (source === "assist" && !game.enemies?.length) return null;
  const point =
    source === "mouse" &&
    Number.isFinite(intent.x) &&
    Number.isFinite(intent.y) &&
    intent.x >= 0 &&
    intent.x < 480 &&
    intent.y >= 0 &&
    intent.y < 300
      ? { x: intent.x, y: intent.y }
      : null;
  return { source, x: p.x, y: p.y, angle: p.angle, point };
}
