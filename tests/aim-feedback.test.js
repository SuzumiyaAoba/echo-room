import test from "node:test";
import assert from "node:assert/strict";
import { aimSource, aimLabel, aimCue } from "../src/aim-feedback.js";
import { drawAim } from "../src/aim-render.js";

const game = () => ({
  mode: "combat",
  player: { x: 240.25, y: 235.75, angle: -1.1 },
  enemies: [{ x: 320, y: 90 }],
});

test("手動入力の種類を示し、照準補助の設定を最優先する", () => {
  for (const [source, label] of [
    ["mouse", "マウス照準"],
    ["pad", "スティック照準"],
    ["touch", "タッチ照準"],
  ]) {
    assert.equal(aimSource({ source }), source);
    assert.equal(aimLabel({ source }), label);
    assert.equal(aimSource({ source }, { autoAim: true }), "assist");
    assert.equal(aimLabel({ source }, { autoAim: true }), "自動照準");
  }
  for (const intent of [undefined, {}, { source: "unknown" }])
    assert.equal(aimLabel(intent), "自動照準");
});

test("照準表示は既に発射に使われた角度を読み、敵やプレイヤーを変更しない", () => {
  const scene = game(),
    intent = { source: "mouse", x: 80.5, y: 260.25 };
  const before = structuredClone({ scene, intent });
  const cue = aimCue(scene, intent);
  assert.deepEqual(cue, {
    source: "mouse",
    x: 240.25,
    y: 235.75,
    angle: -1.1,
    point: { x: 80.5, y: 260.25 },
  });
  assert.deepEqual({ scene, intent }, before);
  assert.deepEqual(aimCue(scene, intent, { autoAim: true }), {
    ...cue,
    source: "assist",
    point: null,
  });
});

test("戦闘以外と敵待ちの自動照準には射撃方向の印を出さない", () => {
  for (const mode of ["reward", "cleared", "dead", "event"])
    assert.equal(
      aimCue({ ...game(), mode }, { source: "mouse", x: 80, y: 90 }),
      null,
    );
  assert.equal(aimCue(null), null);
  const scene = game();
  scene.enemies = [];
  assert.equal(aimCue(scene, { source: "assist" }), null);
  assert.ok(aimCue(scene, { source: "pad" }));
  assert.equal(aimCue(scene, { source: "pad" }, { autoAim: true }), null);
});

test("画面外へのドラッグは方向を保ち、画面内だけにマウスの印を描く", () => {
  for (const [x, y] of [
    [-1, 150],
    [480, 150],
    [240, -1],
    [240, 300],
    [NaN, 50],
    [50, Infinity],
  ]) {
    const cue = aimCue(game(), { source: "mouse", x, y });
    assert.equal(cue.point, null);
    assert.equal(cue.angle, -1.1);
  }
  for (const [x, y] of [
    [0, 0],
    [479.9, 299.9],
  ])
    assert.deepEqual(aimCue(game(), { source: "mouse", x, y }).point, { x, y });
  for (const field of ["x", "y", "angle"]) {
    const scene = game();
    scene.player[field] = NaN;
    assert.equal(aimCue(scene, { source: "mouse", x: 50, y: 50 }), null);
  }
});

test("ドットの照準は整数の小さな線だけを描き、コンテキスト状態を戻す", () => {
  for (const source of ["assist", "mouse", "pad", "touch"])
    for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const calls = [],
        saved = [];
      const c = {
        globalAlpha: 0.37,
        fillStyle: "original",
        save() {
          saved.push({
            globalAlpha: this.globalAlpha,
            fillStyle: this.fillStyle,
          });
        },
        restore() {
          Object.assign(this, saved.pop());
        },
        fillRect(x, y, w, h) {
          calls.push({
            x,
            y,
            w,
            h,
            color: this.fillStyle,
            alpha: this.globalAlpha,
          });
        },
      };
      const scene = game();
      scene.player.angle = angle;
      const cue = aimCue(scene, { source, x: 80, y: 260 });
      const before = structuredClone(cue);
      drawAim(c, cue);
      assert.ok(calls.length > 0 && calls.length <= 64);
      for (const { x, y, w, h, color, alpha } of calls) {
        assert.ok([x, y, w, h].every(Number.isInteger));
        assert.ok(w >= 1 && w <= 3 && h >= 1 && h <= 3);
        assert.ok(
          ["#08171b", source === "assist" ? "#8be7ce" : "#fff0cf"].includes(
            color,
          ),
        );
        assert.equal(alpha, 1);
      }
      assert.equal(c.globalAlpha, 0.37);
      assert.equal(c.fillStyle, "original");
      assert.equal(saved.length, 0);
      assert.deepEqual(cue, before);
    }
  drawAim(
    {
      save() {
        throw Error("Unexpected drawing");
      },
    },
    null,
  );
});
