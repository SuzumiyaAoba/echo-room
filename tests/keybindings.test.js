import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BINDINGS,
  bindingsFor,
  normalizeBindings,
  assignBinding,
  canonicalKey,
  keyCodes,
  keyLabel,
  bindingHint,
  movementHint,
  arrowMovement,
  controlText,
  capturedKeyLabel,
  normalizeKeyLabels,
} from "../src/keybindings.js";
import {
  freshProfile,
  validateProfile,
  exportProfile,
  prepareImport,
} from "../src/save.js";
import { createRun } from "../src/game.js";
import { UPGRADES } from "../src/content.js";
const entryRun = (seed) => ({
  ...createRun(seed),
  checkpoint: "entry",
  upgrades: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])),
});

test("標準の移動・射撃・左右SHIFTと古い記録を保つ", () => {
  assert.deepEqual(bindingsFor(), {
    up: ["KeyW", "ArrowUp"],
    down: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    fire: ["KeyJ", "KeyZ"],
    dash: ["Space", "Shift"],
    echo: ["KeyQ", null],
    burst: ["KeyR", null],
    interact: ["KeyE", null],
  });
  assert.deepEqual(keyCodes("Shift"), ["ShiftLeft", "ShiftRight"]);
  assert.equal(normalizeBindings(DEFAULT_BINDINGS), undefined);
  const profile = freshProfile();
  profile.run = entryRun("KEYBINDINGS-OLD");
  assert.deepEqual(validateProfile(profile), profile);
  assert.equal(Object.hasOwn(profile.settings, "keybindings"), false);
});

test("変更した二つの枠だけを保存し、元の設定を変更しない", () => {
  const raw = { echo: ["KeyC", null] };
  const before = structuredClone(raw);
  const result = assignBinding(raw, "dash", 0, "KeyV");
  assert.deepEqual(result, {
    ok: true,
    bindings: { dash: ["KeyV", "Shift"], echo: ["KeyC", null] },
  });
  assert.deepEqual(raw, before);
  assert.equal(bindingsFor(result.bindings).up[0], "KeyW");
  assert.equal(bindingHint("echo", result.bindings), "C");
});

test("操作間と同じ操作の重複を拒み、左右SHIFTも同じキーとして扱う", () => {
  assert.deepEqual(assignBinding(undefined, "echo", 0, "KeyJ"), {
    ok: false,
    reason: "conflict",
    action: "fire",
  });
  assert.deepEqual(assignBinding(undefined, "fire", 1, "KeyJ"), {
    ok: false,
    reason: "conflict",
    action: "fire",
  });
  assert.deepEqual(assignBinding(undefined, "echo", 1, "ShiftRight"), {
    ok: false,
    reason: "conflict",
    action: "dash",
  });
  assert.equal(assignBinding(undefined, "dash", 1, "ShiftLeft").ok, true);
  assert.equal(canonicalKey("ShiftRight"), "Shift");
});

test("二つ目を外せるが最後のキーは外せず、代わりのキーを案内する", () => {
  const result = assignBinding(undefined, "up", 0, null);
  assert.deepEqual(result.bindings, { up: [null, "ArrowUp"] });
  assert.equal(bindingHint("up", result.bindings), "↑");
  assert.deepEqual(assignBinding(result.bindings, "up", 1, null), {
    ok: false,
    reason: "required",
  });
  assert.deepEqual(assignBinding(undefined, "echo", 0, null), {
    ok: false,
    reason: "required",
  });
});

test("メニュー専用キー・不正な枠・壊れた設定を受け入れない", () => {
  for (const code of [
    "Escape",
    "Tab",
    "Enter",
    "ControlLeft",
    "AltRight",
    "MetaLeft",
    "F5",
    "Backquote",
    "__proto__",
    "KeyAA",
  ]) {
    assert.equal(canonicalKey(code), null);
    assert.equal(assignBinding(undefined, "echo", 0, code).ok, false);
  }
  for (const raw of [
    null,
    [],
    { echo: [null, null] },
    { echo: ["KeyC"] },
    { echo: ["Escape", null] },
    { echo: ["KeyR", null] },
    { echo: ["KeyC", "KeyC"] },
  ]) {
    assert.equal(normalizeBindings(raw), undefined);
    assert.deepEqual(bindingsFor(raw), DEFAULT_BINDINGS);
  }
  assert.equal(assignBinding(undefined, "missing", 0, "KeyC").ok, false);
  assert.equal(assignBinding(undefined, "echo", 2, "KeyC").ok, false);
});

test("テンキーと記号の入力を読み、短い名前で表示する", () => {
  for (const [code, label] of [
    ["Numpad0", "NUM 0"],
    ["NumpadMultiply", "NUM ×"],
    ["Comma", ","],
    ["BracketRight", "]"],
    ["Digit7", "7"],
  ]) {
    assert.equal(assignBinding(undefined, "echo", 0, code).ok, true);
    assert.equal(keyLabel(code), label);
  }
});

test("移動・練習・解放の案内を変え、ゲームパッドのAとRBは保つ", () => {
  const bindings = {
    up: ["KeyI", null],
    left: ["KeyK", null],
    down: ["KeyO", null],
    right: ["KeyL", null],
    echo: ["KeyC", null],
    burst: ["KeyB", null],
    dash: ["KeyV", null],
    fire: ["KeyF", null],
  };
  assert.equal(movementHint(bindings), "IKOL");
  assert.equal(arrowMovement(bindings), false);
  assert.equal(arrowMovement(), true);
  assert.equal(
    controlText("WASD・SPACE · A · Q · RB · R · LB · J", bindings),
    "IKOL・V · A · C · RB · B · LB · F",
  );
  assert.equal(
    controlText("右まで歩いてQ。Qでもう一度。Rでほどく。", bindings),
    "右まで歩いてC。Cでもう一度。Bでほどく。",
  );
});

test("実際に押した文字を別配列のキー表示へ保存し、未使用と制御文字は除く", () => {
  assert.equal(capturedKeyLabel("KeyW", "z"), "Z");
  assert.equal(capturedKeyLabel("Quote", "Dead"), "'");
  assert.equal(capturedKeyLabel("Shift", "Shift"), "SHIFT");
  assert.deepEqual(
    normalizeKeyLabels({
      KeyW: "Z",
      KeyA: "Q",
      KeyX: "X",
      Space: "x",
      KeyQ: "\n",
      KeyJ: "<script>",
    }),
    { KeyW: "Z", KeyA: "Q" },
  );
  const labels = { KeyW: "Z", KeyA: "Q" };
  assert.equal(movementHint(undefined, labels), "ZQSD");
});

test("変更した割り当てとキーの表示をファイルへ書き出し、進行を保って読み戻す", () => {
  const profile = freshProfile();
  profile.settings.keybindings = {
    echo: ["KeyC", null],
    fire: ["KeyF", "KeyZ"],
  };
  profile.settings.keyLabels = { KeyW: "Z" };
  profile.run = entryRun("KEYBINDINGS-FILE");
  profile.run.kills = 7;
  const imported = prepareImport(
    exportProfile(profile, new Date("2026-10-09T00:00:00Z")),
  );
  assert.deepEqual(imported.profile, profile);
  const broken = structuredClone(profile);
  broken.settings.keybindings = { echo: ["KeyR", null] };
  assert.deepEqual(validateProfile(broken).run, profile.run);
  assert.equal(
    Object.hasOwn(validateProfile(broken).settings, "keybindings"),
    false,
  );
});

test("標準へ戻すと設定の追加フィールドを残さない", () => {
  const remapped = assignBinding(undefined, "echo", 0, "KeyC").bindings;
  const reset = assignBinding(remapped, "echo", 0, "KeyQ");
  assert.deepEqual(reset, { ok: true, bindings: undefined });
  const profile = freshProfile();
  profile.settings.keybindings = DEFAULT_BINDINGS;
  profile.settings.keyLabels = { KeyQ: "Q", KeyC: "C" };
  assert.deepEqual(validateProfile(profile), freshProfile());
});
