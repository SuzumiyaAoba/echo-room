import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import {
  ActionFeedback,
  captureActions,
  ACTION_NOTICE_SECONDS,
} from "../src/action-feedback.js";

const game = () => {
  const g = new Game(createRun("ACTION-FEEDBACK"));
  g.spawnQueue = [{ time: Infinity }];
  return g;
};
const record = (g, count = 24) => {
  g.history = Array.from({ length: count }, () => ({
    x: g.player.x,
    y: g.player.y,
    angle: g.player.angle,
    fire: false,
    walk: 0,
    moving: false,
  }));
};
const step = (g, f, controls = {}, dt = 1 / 60) => {
  const request = captureActions(g, controls);
  g.update(dt, controls);
  const actual = JSON.stringify(g);
  f.observe(g, request);
  const notice = f.read(g);
  assert.equal(
    JSON.stringify(g),
    actual,
    "observer and read leave full Game exact",
  );
  return notice;
};

test("残響のない解放は、実際の不発だけを知らせて戦闘・保存・乱数を変えない", () => {
  const g = game(),
    f = new ActionFeedback();
  const n = step(g, f, { burst: true });
  assert.equal(n.action, "burst");
  assert.equal(n.reason, "empty");
  assert.equal(n.detail, "先に残響を作る");
  assert.equal(g.echoes.length, 0);
  assert.equal(g.hazards.length, 0);
  const original = JSON.stringify(g);
  for (let i = 0; i < 200; i++) {
    assert.equal(captureActions(g, {}), null);
    assert.deepEqual(f.read(g), n);
  }
  assert.equal(JSON.stringify(g), original);
});

test("実際の回避のあと再入力したときだけ、実際の充填時間を切り上げて示す", () => {
  const g = game(),
    f = new ActionFeedback();
  assert.equal(step(g, f, { dash: true }), null);
  const serial = g.player.dashSerial;
  const n = step(g, f, { dash: true });
  assert.equal(n.reason, "cooldown");
  assert.equal(g.player.dashSerial, serial);
  assert.ok(
    n.remaining >= g.player.dashCd && n.remaining - g.player.dashCd < 0.1,
  );
});

test("手持ちの残響を実際に使い切った再入力は充填待ちを示し、充填で消える", () => {
  const g = game(),
    f = new ActionFeedback();
  record(g);
  for (let i = 0; i < g.stats.echoes; i++)
    assert.equal(step(g, f, { echo: true }), null);
  const n = step(g, f, { echo: true });
  assert.equal(n.reason, "charging");
  assert.equal(g.player.echoCharges, 0);
  g.player.echoCd = 1 / 120;
  assert.equal(step(g, f), null);
  assert.equal(g.player.echoCharges, 1);
  g.player.echoCharges = 0;
  g.player.echoCd = 5;
  assert.equal(f.read(g), null, "resolved requests never reappear");
});

test("24フレームの録画の境界では、同じ更新で発動できたQに理由を出さない", () => {
  const g = game(),
    f = new ActionFeedback();
  record(g, 21);
  const n = step(g, f, { echo: true });
  assert.equal(n.reason, "recording");
  assert.equal(g.run.echoesCast, 0);
  assert.equal(n.remaining, 0.1);
  assert.equal(step(g, f, { echo: true })?.reason, "recording");
  assert.equal(step(g, f, { echo: true }), null);
  assert.equal(g.history.length, 24);
  assert.equal(g.run.echoesCast, 1);
});

test("同じ更新で回避や残響の充填が終わる入力は実際に発動して知らせない", () => {
  const g = game(),
    f = new ActionFeedback();
  record(g);
  g.player.dashCd = 1 / 120;
  g.player.echoCharges = 0;
  g.player.echoCd = 1 / 120;
  assert.equal(step(g, f, { dash: true, echo: true }), null);
  assert.equal(g.player.dashSerial, 1);
  assert.equal(g.run.echoesCast, 1);
});

test("残響の出現と解放を同時に押して実際に両方できた場合は、不足と誤認しない", () => {
  const g = game(),
    f = new ActionFeedback();
  record(g);
  step(g, f, { burst: true });
  assert.equal(step(g, f, { echo: true, burst: true }), null);
  assert.equal(g.run.echoesCast, 1);
  assert.equal(g.echoes.length, 0);
  assert.ok(g.hazards.some((h) => h.kind === "pulse" && h.friendly));
});

test("短い表示はゲーム時計で止まり、期限と部屋の交換・死亡・報酬で消える", () => {
  const g = game(),
    f = new ActionFeedback();
  const n = step(g, f, { burst: true });
  assert.deepEqual(f.read(g), n);
  for (let i = 0; i < Math.ceil(ACTION_NOTICE_SECONDS * 60) + 1; i++)
    step(g, f);
  assert.equal(f.read(g), null);
  step(g, f, { burst: true });
  assert.equal(f.read(game()), null);
  for (const mode of ["reward", "event", "dead"]) {
    g.mode = mode;
    assert.equal(captureActions(g, { burst: true }), null);
    f.observe(g, null);
    assert.equal(f.read(g), null);
  }
  f.observe(null, null);
  assert.equal(f.game, null);
  assert.equal(f.notices.size, 0);
});

test("複数の不発では残響の必要条件を示し、実際に使えた後は古い理由を戻さない", () => {
  const g = game(),
    f = new ActionFeedback();
  g.player.dashCd = 2;
  g.player.echoCharges = 0;
  g.player.echoCd = 4;
  const n = step(g, f, { dash: true, echo: true, burst: true });
  assert.equal(n.action, "echo");
  assert.equal(n.reason, "recording");
  record(g);
  assert.equal(step(g, f)?.reason, "charging");
  g.player.echoCd = 1 / 120;
  step(g, f, { echo: true });
  assert.equal(f.notices.has("echo"), false);
  assert.equal(f.notices.has("burst"), false);
});
