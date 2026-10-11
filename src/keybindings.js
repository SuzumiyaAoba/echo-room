export const CONTROL_ACTIONS = Object.freeze(
  [
    { id: "up", name: "上へ移動" },
    { id: "down", name: "下へ移動" },
    { id: "left", name: "左へ移動" },
    { id: "right", name: "右へ移動" },
    { id: "fire", name: "射撃" },
    { id: "dash", name: "回避" },
    { id: "echo", name: "残響" },
    { id: "burst", name: "解放" },
    { id: "interact", name: "次の航路へ" },
  ].map(Object.freeze),
);

export const DEFAULT_BINDINGS = Object.freeze(
  Object.fromEntries(
    [
      ["up", ["KeyW", "ArrowUp"]],
      ["down", ["KeyS", "ArrowDown"]],
      ["left", ["KeyA", "ArrowLeft"]],
      ["right", ["KeyD", "ArrowRight"]],
      ["fire", ["KeyJ", "KeyZ"]],
      ["dash", ["Space", "Shift"]],
      ["echo", ["KeyQ", null]],
      ["burst", ["KeyR", null]],
      ["interact", ["KeyE", null]],
    ].map(([id, codes]) => [id, Object.freeze(codes)]),
  ),
);

const names = Object.freeze({
  Space: "SPACE",
  Shift: "SHIFT",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Minus: "-",
  Equal: "=",
  NumpadAdd: "NUM +",
  NumpadSubtract: "NUM -",
  NumpadMultiply: "NUM ×",
  NumpadDivide: "NUM /",
  NumpadDecimal: "NUM .",
});

export function canonicalKey(code) {
  if (code === "ShiftLeft" || code === "ShiftRight") return "Shift";
  if (typeof code !== "string") return null;
  return Object.hasOwn(names, code) ||
    /^(Key[A-Z]|Digit[0-9]|Numpad[0-9])$/.test(code)
    ? code
    : null;
}

function validatedBindings(raw) {
  if (raw === undefined) return DEFAULT_BINDINGS;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const map = Object.fromEntries(
    CONTROL_ACTIONS.map(({ id }) => [id, [...DEFAULT_BINDINGS[id]]]),
  );
  for (const { id } of CONTROL_ACTIONS) {
    if (!Object.hasOwn(raw, id)) continue;
    if (!Array.isArray(raw[id]) || raw[id].length !== 2) return null;
    const codes = raw[id].map((code) =>
      code === null ? null : canonicalKey(code),
    );
    if (
      !codes.some(Boolean) ||
      raw[id].some((code, i) => code !== null && !codes[i])
    )
      return null;
    map[id] = codes;
  }
  const used = new Set();
  for (const codes of Object.values(map))
    for (const code of codes) {
      if (!code) continue;
      if (used.has(code)) return null;
      used.add(code);
    }
  return map;
}

export function bindingsFor(raw) {
  return validatedBindings(raw) || DEFAULT_BINDINGS;
}

export function normalizeBindings(raw) {
  const map = validatedBindings(raw);
  if (!map) return undefined;
  const changed = Object.fromEntries(
    CONTROL_ACTIONS.filter(({ id }) =>
      map[id].some((code, i) => code !== DEFAULT_BINDINGS[id][i]),
    ).map(({ id }) => [id, [...map[id]]]),
  );
  return Object.keys(changed).length ? changed : undefined;
}

export function assignBinding(raw, action, slot, code) {
  if (!Object.hasOwn(DEFAULT_BINDINGS, action) || ![0, 1].includes(slot))
    return { ok: false, reason: "unknown" };
  const canonical = code === null ? null : canonicalKey(code);
  if (code !== null && !canonical) return { ok: false, reason: "unsupported" };
  const current = bindingsFor(raw);
  for (const { id } of CONTROL_ACTIONS)
    for (let i = 0; i < 2; i++) {
      if (
        canonical &&
        current[id][i] === canonical &&
        (id !== action || i !== slot)
      )
        return { ok: false, reason: "conflict", action: id };
    }
  const next = Object.fromEntries(
    CONTROL_ACTIONS.map(({ id }) => [id, [...current[id]]]),
  );
  next[action][slot] = canonical;
  if (!next[action].some(Boolean)) return { ok: false, reason: "required" };
  return { ok: true, bindings: normalizeBindings(next) };
}

export function keyCodes(code) {
  return code === "Shift" ? ["ShiftLeft", "ShiftRight"] : code ? [code] : [];
}

function canCaption(code) {
  return (
    canonicalKey(code) === code &&
    typeof code === "string" &&
    !["Space", "Shift"].includes(code) &&
    !code.startsWith("Arrow") &&
    !code.startsWith("Numpad")
  );
}

export function keyLabel(code, labels) {
  if (labels && Object.hasOwn(labels, code) && canCaption(code))
    return labels[code];
  return (
    names[code] ||
    (code?.startsWith("Key")
      ? code.slice(3)
      : code?.startsWith("Digit")
        ? code.slice(5)
        : /^Numpad[0-9]$/.test(code || "")
          ? `NUM ${code.at(-1)}`
          : "—")
  );
}

export function normalizeKeyLabels(raw, bindings) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const active = new Set(
    Object.values(bindingsFor(bindings)).flat().filter(Boolean),
  );
  const labels = {};
  for (const code of active) {
    if (!Object.hasOwn(raw, code)) continue;
    const label = raw[code];
    if (
      typeof label !== "string" ||
      !/^[\p{L}\p{N}\p{P}\p{S}]{1,2}$/u.test(label)
    )
      continue;
    if (label !== keyLabel(code) && canCaption(code)) labels[code] = label;
  }
  return Object.keys(labels).length ? labels : undefined;
}

export function capturedKeyLabel(code, key) {
  const caption =
    typeof key === "string" && [...key].length === 1 ? key.toUpperCase() : "";
  return canCaption(code) && /^[\p{L}\p{N}\p{P}\p{S}]{1,2}$/u.test(caption)
    ? caption
    : keyLabel(code);
}

export function bindingHint(action, raw, labels) {
  return keyLabel(bindingsFor(raw)[action]?.find(Boolean), labels);
}

export function movementHint(raw, captions) {
  const map = bindingsFor(raw);
  const labels = ["up", "left", "down", "right"].map((id) =>
    keyLabel(map[id].find(Boolean), captions),
  );
  return labels.every((label) => /^[A-Z0-9]$/.test(label))
    ? labels.join("")
    : labels.join(" ");
}

export function arrowMovement(raw) {
  const map = bindingsFor(raw);
  return ["up", "down", "left", "right"].every((id) =>
    map[id].includes(DEFAULT_BINDINGS[id][1]),
  );
}

export function controlText(text, raw, captions) {
  const labels = {
    Q: bindingHint("echo", raw, captions),
    R: bindingHint("burst", raw, captions),
    E: bindingHint("interact", raw, captions),
    J: bindingHint("fire", raw, captions),
    SPACE: bindingHint("dash", raw, captions),
    WASD: movementHint(raw, captions),
  };
  return String(text).replace(/WASD|SPACE|\b[QREJ]\b/g, (key) => labels[key]);
}
