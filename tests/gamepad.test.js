import test from "node:test";
import assert from "node:assert/strict";
import { GamepadInput, PAD_HINTS, padControlText } from "../src/gamepad.js";

const controller = (overrides = {}) => ({
  id: "Test controller",
  index: 0,
  connected: true,
  mapping: "standard",
  axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  ...overrides,
});
const button = (pad, i, down) => {
  pad.buttons[i] = { pressed: down, value: Number(down) };
};

test("a first gesture is consumed once across multiple simulation reads", () => {
  const input = new GamepadInput(),
    pad = controller();
  button(pad, 0, true);
  assert.equal(input.sample([null, pad]).activity, true);
  input.sample([null, pad]);
  assert.equal(input.take(0), true);
  for (let i = 0; i < 6; i++) {
    input.sample([null, pad]);
    assert.equal(input.take(0), false);
  }
  button(pad, 0, false);
  input.sample([pad]);
  button(pad, 0, true);
  input.sample([pad]);
  assert.equal(input.take(0), true);
});
test("unmapped and disconnected devices cannot activate standard actions", () => {
  const input = new GamepadInput(),
    raw = controller({ mapping: "" }),
    dead = controller({ connected: false });
  button(raw, 0, true);
  button(dead, 0, true);
  assert.equal(input.sample([raw, dead]).connected, false);
  assert.equal(input.take(0), false);
  assert.deepEqual(input.movement(), { x: 0, y: 0 });
});
test("the selected controller survives null slots and another pad's gestures", () => {
  const input = new GamepadInput(),
    first = controller(),
    second = controller({ index: 2, id: "Other" });
  input.sample([first, null, second]);
  button(second, 0, true);
  assert.equal(input.sample([second, first]).disconnected, false);
  assert.equal(input.id, "0:Test controller");
  assert.equal(input.take(0), false);
});
test("disconnect is reported once and a replacement's held buttons are blocked", () => {
  const input = new GamepadInput(),
    first = controller(),
    second = controller({ index: 2, id: "Other" });
  input.sample([first]);
  button(second, 0, true);
  assert.equal(input.sample([second]).disconnected, true);
  assert.equal(input.sample([second]).disconnected, false);
  assert.equal(input.down(0), false);
  assert.equal(input.take(0), false);
  button(second, 0, false);
  input.sample([second]);
  button(second, 0, true);
  input.sample([second]);
  assert.equal(input.take(0), true);
});
test("reconnection requires separate releases of held buttons and sticks", () => {
  const input = new GamepadInput(),
    pad = controller();
  input.sample([pad]);
  input.sample([]);
  button(pad, 9, true);
  button(pad, 7, true);
  pad.axes = [0.8, 0, 1, 0];
  input.sample([pad]);
  assert.equal(input.take(9), false);
  assert.equal(input.down(7), false);
  assert.deepEqual(input.movement(), { x: 0, y: 0 });
  assert.deepEqual(input.stick(1), [0, 0]);
  button(pad, 9, false);
  pad.axes[0] = 0;
  input.sample([pad]);
  button(pad, 9, true);
  pad.axes[0] = -0.8;
  input.sample([pad]);
  assert.equal(input.take(9), true);
  assert.equal(input.movement().x, -0.8);
  assert.equal(input.down(7), false);
  assert.deepEqual(input.stick(1), [0, 0]);
});
test("a screen change clears queued edges and suppresses all held controls", () => {
  const input = new GamepadInput(),
    pad = controller();
  input.sample([pad]);
  for (const i of [0, 1, 4, 5, 6, 7, 9, 15]) button(pad, i, true);
  pad.axes = [1, 0, 0, -1];
  input.sample([pad]);
  input.suppress();
  for (let frame = 0; frame < 20; frame++) {
    input.sample([pad]);
    assert.equal(input.take(0, 1, 4, 5, 6, 9), false);
    assert.equal(input.down(7), false);
    assert.deepEqual(input.movement(), { x: 0, y: 0 });
    assert.equal(input.menuStep(frame * 100), null);
  }
  for (const i of [0, 1, 4, 5, 6, 7, 9, 15]) button(pad, i, false);
  pad.axes = [0, 0, 0, 0];
  input.sample([pad]);
  button(pad, 5, true);
  input.sample([pad]);
  assert.equal(input.take(5), true);
});
test("two alternative release buttons produce a single action without a stale edge", () => {
  const input = new GamepadInput(),
    pad = controller();
  input.sample([pad]);
  button(pad, 4, true);
  button(pad, 6, true);
  input.sample([pad]);
  assert.equal(input.take(4, 6), true);
  assert.equal(input.take(4, 6), false);
});
test("menu repeat has an initial delay and never bursts after a stalled frame", () => {
  const input = new GamepadInput(),
    pad = controller();
  button(pad, 13, true);
  input.sample([pad]);
  assert.equal(input.menuStep(0), "down");
  assert.equal(input.menuStep(379), null);
  assert.equal(input.menuStep(380), "down");
  assert.equal(input.menuStep(489), null);
  assert.equal(input.menuStep(490), "down");
  assert.equal(input.menuStep(20000), "down");
  assert.equal(input.menuStep(20000), null);
  assert.equal(input.menuStep(20109), null);
  assert.equal(input.menuStep(20110), "down");
});
test("stick hysteresis avoids flickering selection around a threshold", () => {
  const input = new GamepadInput(),
    pad = controller();
  input.sample([pad]);
  pad.axes[1] = 0.54;
  input.sample([pad]);
  assert.equal(input.menuStep(0), null);
  pad.axes[1] = 0.56;
  input.sample([pad]);
  assert.equal(input.menuStep(10), "down");
  pad.axes[1] = 0.4;
  input.sample([pad]);
  assert.equal(input.menuStep(390), "down");
  pad.axes[1] = 0.34;
  input.sample([pad]);
  assert.equal(input.menuStep(400), null);
  pad.axes[1] = 0.5;
  input.sample([pad]);
  assert.equal(input.menuStep(500), null);
  pad.axes[1] = -0.8;
  input.sample([pad]);
  assert.equal(input.menuStep(510), "up");
});
test("opposite direction buttons cancel and direction changes respond immediately", () => {
  const input = new GamepadInput(),
    pad = controller();
  button(pad, 12, true);
  button(pad, 13, true);
  input.sample([pad]);
  assert.equal(input.menuStep(0), null);
  button(pad, 12, false);
  input.sample([pad]);
  assert.equal(input.menuStep(1), "down");
  button(pad, 13, false);
  button(pad, 14, true);
  input.sample([pad]);
  assert.equal(input.menuStep(2), "left");
});
test("finite movement retains the old dead zone and accepts the direction pad", () => {
  const input = new GamepadInput(),
    pad = controller();
  for (let x = -10; x <= 10; x++)
    for (let y = -10; y <= 10; y++) {
      pad.axes = [x / 10, y / 10, 0, 0];
      input.sample([pad]);
      assert.deepEqual(input.movement(), {
        x: Math.abs(x / 10) > 0.15 ? x / 10 : 0,
        y: Math.abs(y / 10) > 0.15 ? y / 10 : 0,
      });
    }
  pad.axes = [NaN, Infinity, undefined, -Infinity];
  input.sample([pad]);
  assert.deepEqual(input.movement(), { x: 0, y: 0 });
  assert.deepEqual(input.stick(1), [0, 0]);
  button(pad, 14, true);
  button(pad, 13, true);
  input.sample([pad]);
  assert.deepEqual(input.movement(), { x: -1, y: 1 });
});
test("an idle or held pad does not repeatedly seize input prompts", () => {
  const input = new GamepadInput(),
    pad = controller();
  assert.equal(input.sample([pad]).activity, false);
  pad.axes[0] = 0.8;
  assert.equal(input.sample([pad]).activity, true);
  assert.equal(input.sample([pad]).activity, false);
  pad.axes[0] = 0.81;
  assert.equal(input.sample([pad]).activity, false);
  button(pad, 7, true);
  assert.equal(input.sample([pad]).activity, true);
  assert.equal(input.sample([pad]).activity, false);
});
test("controller hints name standard positions without changing unrelated words", () => {
  assert.equal(
    padControlText("WASD · J · SPACE · Q · R · E"),
    Object.values({
      move: PAD_HINTS.move,
      fire: PAD_HINTS.fire,
      dash: PAD_HINTS.dash,
      echo: PAD_HINTS.echo,
      burst: PAD_HINTS.burst,
      interact: PAD_HINTS.interact,
    }).join(" · "),
  );
  assert.equal(padControlText("ECHO LOOM · 残響"), "ECHO LOOM · 残響");
});
