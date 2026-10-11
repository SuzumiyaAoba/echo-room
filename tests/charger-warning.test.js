import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import { chargerWarning, chargerHoldsLane } from "../src/charger-warning.js";
import { REGIONAL_LAYOUTS, layoutWalls } from "../src/room-layouts.js";
import {
  freshProfile,
  validateProfile,
  prepareImport,
  exportProfile,
} from "../src/save.js";
import {
  Game as Before,
  createRun as beforeRun,
} from "./fixtures/rush-before/game.js";
import { Random } from "../src/math.js";

function arena(run = createRun("RUSH-RULES")) {
  const g = new Game(run);
  g.spawnQueue = [];
  g.enemies = [];
  return g;
}
function winding(g, x = 180, y = 150, angle = 0, elite = false) {
  const e = g.spawn("charger", x, y, elite);
  Object.assign(e, { state: "windup", timer: 0.8, angle });
  return e;
}
function attack(g, e) {
  let ticks = 0;
  while (e.state === "windup") {
    g.updateEnemy(e, 1 / 60);
    assert.ok(++ticks < 60);
  }
  assert.equal(e.state, "charge");
  const points = [{ x: e.x, y: e.y }];
  while (e.state === "charge") {
    g.updateEnemy(e, 1 / 60);
    points.push({ x: e.x, y: e.y });
    assert.ok(points.length < 50);
  }
  assert.equal(e.state, "recover");
  return points;
}

test("18配置・通常と強敵・八方向・五地点1440条件の予測を実際の全突進フレームへ一致させる", () => {
  let cases = 0,
    stopped = 0,
    full = 0;
  for (const [act, layouts] of REGIONAL_LAYOUTS.entries())
    for (const layout of layouts)
      for (const elite of [false, true])
        for (let direction = 0; direction < 8; direction++)
          for (const desired of [
            [60, 60],
            [420, 60],
            [60, 250],
            [420, 250],
            [240, 160],
          ]) {
            const run = createRun("RUSH-MATRIX");
            run.stage = act * 8 + 1;
            const g = arena(run);
            for (const row of g.tiles)
              for (let x = 0; x < row.length; x++) if (row[x] === 2) row[x] = 0;
            for (const [x, y, w, h] of layoutWalls(layout))
              for (let dy = 0; dy < h; dy++)
                for (let dx = 0; dx < w; dx++) g.tiles[y + dy][x + dx] = 2;
            const candidates = [];
            for (let y = 50; y <= 250; y += 10)
              for (let x = 50; x <= 430; x += 10)
                if (!g.solid(x, y, elite ? 12 : 10)) candidates.push({ x, y });
            candidates.sort(
              (a, b) =>
                Math.hypot(a.x - desired[0], a.y - desired[1]) -
                Math.hypot(b.x - desired[0], b.y - desired[1]),
            );
            const e = winding(
              g,
              candidates[0].x,
              candidates[0].y,
              (direction * Math.PI) / 4,
              elite,
            );
            const before = JSON.stringify(g),
              warning = chargerWarning(g, e);
            assert.ok(warning);
            assert.equal(JSON.stringify(g), before);
            const predicted = warning.path;
            assert.deepEqual(
              attack(g, e),
              predicted,
              `${layout.id}/${elite}/${direction}/${desired}`,
            );
            assert.ok(predicted.every((p) => !g.solid(p.x, p.y, e.r)));
            if (predicted.length < 43) stopped++;
            else full++;
            cases++;
          }
  assert.equal(cases, 1440);
  assert.ok(stopped > 0 && full > 0);
});

test("四つの目盛りの時計は自然な0.8秒の準備を読み、停止した全状態と乱数を変えない", () => {
  const g = arena(),
    e = winding(g),
    before = JSON.stringify(g),
    rng = g.rng.state;
  const path = chargerWarning(g, e).path;
  for (let i = 0; i < 30; i++)
    assert.deepEqual(chargerWarning(g, e).path, path);
  assert.equal(JSON.stringify(g), before);
  assert.equal(g.rng.state, rng);
  assert.equal(chargerWarning(g, e).progress, 0);
  let previous = 0,
    ticks = 0;
  while (e.state === "windup") {
    const warning = chargerWarning(g, e);
    assert.ok(warning.progress >= previous && warning.progress <= 1);
    previous = warning.progress;
    g.updateEnemy(e, 1 / 60);
    ticks++;
  }
  assert.ok(ticks >= 48 && ticks <= 49);
  assert.ok(previous > 0.97);
  assert.equal(chargerWarning(g, e), null);
});

test("主人公の横移動と重なる仲間は固定した狙いと突進の道を押し曲げない", () => {
  const g = arena(),
    e = winding(g, 150, 150, 0);
  g.spawn("crawler", e.x + 3, e.y + 3);
  const warning = chargerWarning(g, e);
  Object.assign(g.player, { x: 400, y: 245 });
  assert.equal(chargerHoldsLane(g, e), true);
  assert.deepEqual(attack(g, e), warning.path);
  assert.equal(e.angle, 0);
  assert.equal(chargerHoldsLane(g, e), false);
});

test("壁で止まる最後のフレームも仲間の押し合いで終点をずらさない", () => {
  const g = arena(),
    e = winding(g, 435, 160, 0);
  g.spawn("crawler", 432, 160);
  const warning = chargerWarning(g, e);
  assert.equal(warning.path.length, 2);
  assert.deepEqual(attack(g, e), warning.path);
});

test("危険帯の幅は身体と主人公の接触を含み、帯の外は無傷、内側は実際に被弾する", () => {
  for (const [y, injured] of [
    [143, false],
    [145, true],
  ]) {
    const g = arena();
    for (const row of g.tiles)
      for (let x = 0; x < row.length; x++) if (row[x] === 2) row[x] = 0;
    Object.assign(g.player, { x: 240, y });
    const e = winding(g, 150, 160, 0),
      warning = chargerWarning(g, e);
    assert.equal(warning.radius, 16);
    attack(g, e);
    assert.equal(g.run.hp < 100, injured);
  }
});

test("版なし・未知の版の旧旅は元の全戦闘・乱数・効果を保持する", () => {
  let cases = 0;
  for (const version of [undefined, 0, 2, "1"])
    for (const stage of [0, 8, 16]) {
      const run = beforeRun(`RUSH-OLD-${version}-${stage}`);
      run.stage = stage;
      if (version !== undefined) run.chargeVersion = version;
      const old = new Before(structuredClone(run)),
        current = new Game(structuredClone(run));
      const a = new Random(123),
        b = new Random(123),
        original = Math.random;
      try {
        for (let tick = 0; tick < 480; tick++) {
          const input = {
            mx: Math.cos(tick / 60),
            my: Math.sin(tick / 60),
            fire: true,
            autoAim: true,
            dash: tick % 120 === 0,
            echo: tick % 180 === 60,
            burst: tick % 180 === 160,
          };
          Math.random = () => a.next();
          old.update(1 / 60, input);
          Math.random = () => b.next();
          current.update(1 / 60, input);
          assert.equal(
            JSON.stringify(current),
            JSON.stringify(old),
            `${version}/${stage}/${tick}`,
          );
          assert.equal(a.state, b.state);
        }
      } finally {
        Math.random = original;
      }
      cases++;
    }
  assert.equal(cases, 12);
});

test("突進の版は部屋の保存・実ファイルの移行・予告の再開で保持し、未知の版を昇格させない", () => {
  for (const version of [undefined, 0, 1, 2, "1"])
    for (const stage of [0, 6, 8, 14, 16, 22]) {
      const p = freshProfile();
      p.run = beforeRun("RUSH-SAVE");
      p.run.stage = stage;
      if (version !== undefined) p.run.chargeVersion = version;
      const saved = validateProfile(p),
        imported = prepareImport(exportProfile(saved)).profile;
      assert.deepEqual(imported, saved);
      assert.equal(saved.run.chargeVersion, version === 1 ? 1 : undefined);
      const g = arena(imported.run),
        e = winding(g);
      assert.equal(!!chargerWarning(g, e), version === 1);
      assert.equal(chargerHoldsLane(g, e), version === 1);
    }
  assert.equal(createRun("NEW-RUSH").chargeVersion, 1);
});

test("別の敵・死亡・別の状態・不正な数値・戦闘終了は新しい予告を作らない", () => {
  const g = arena(),
    e = winding(g);
  for (const change of [
    { kind: "shooter" },
    { hp: 0 },
    { hp: NaN },
    { state: "move" },
    { state: "recover" },
    { state: "charge" },
    { x: Infinity },
    { angle: NaN },
    { r: 0 },
    { timer: Infinity },
  ])
    assert.equal(chargerWarning(g, { ...e, ...change }), null);
  for (const mode of ["reward", "event", "cleared", "dead"])
    assert.equal(chargerWarning({ ...g, mode }, e), null);
  assert.equal(chargerWarning(null, e), null);
});
