import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun, forecastRoom } from "../src/game.js";
import {
  Game as Before,
  createRun as beforeRun,
} from "./fixtures/layouts-v1/game.js";
import {
  REGIONAL_LAYOUTS,
  ROOM_LAYOUT_VERSION,
  roomLayoutPreview,
} from "../src/room-layouts.js";
import { isBoss, isCamp, ENEMIES } from "../src/content.js";
import {
  freshProfile,
  validateProfile,
  exportProfile,
  prepareImport,
} from "../src/save.js";
import { distance } from "../src/math.js";
import { enemyWaypoint } from "../src/enemy-navigation.js";
import { traderStock, traderPrice } from "../src/trader.js";

test("壁際のプレイヤーへ最後の格子から近づき、身体を壁へ通さず接触できる", () => {
  const g = new Game({ ...createRun("EDGE-0"), stage: 3 });
  assert.equal(g.layout.id, "wharf-islands");
  Object.assign(g.player, { x: 141, y: 152 });
  const e = g.spawn("shield", 93, 152, true);
  assert.equal(e.r, 12);
  assert.equal(g.solid(g.player.x, g.player.y, g.player.r), false);
  assert.equal(g.solid(g.player.x, g.player.y, e.r), true);
  const rng = g.rng.state;
  let contact = null;
  for (let i = 0; i < 300; i++) {
    const before = { x: g.player.x, y: g.player.y };
    g.updateEnemy(e, 1 / 60);
    assert.equal(g.solid(e.x, e.y, e.r), false);
    // hurt() moves the player through the real knockback after contact.
    if (!contact && g.run.damageTaken > 0)
      contact = Math.hypot(e.x - before.x, e.y - before.y);
  }
  assert.ok(contact !== null && contact < e.r + g.player.r + 1);
  assert.ok(g.run.damageTaken > 0);
  assert.equal(g.rng.state, rng);
});

function reachable(game, radius = 5) {
  const free = new Map();
  for (let y = 40; y <= 264; y += 16)
    for (let x = 40; x <= 440; x += 16)
      if (!game.solid(x, y, radius)) free.set(`${x},${y}`, { x, y });
  const start = [...free.values()].sort(
    (a, b) => distance(a, game.player) - distance(b, game.player),
  )[0];
  const seen = new Set([`${start.x},${start.y}`]),
    queue = [start];
  for (let i = 0; i < queue.length; i++)
    for (const [dx, dy] of [
      [16, 0],
      [-16, 0],
      [0, 16],
      [0, -16],
    ]) {
      const key = `${queue[i].x + dx},${queue[i].y + dy}`,
        node = free.get(key);
      if (node && !seen.has(key)) {
        seen.add(key);
        queue.push(node);
      }
    }
  return { free, seen };
}

test("新しい航路の18配置は地域ごとに分かれ、同じ番号から入口と編成を再現する", () => {
  assert.equal(createRun("NEW").layoutVersion, ROOM_LAYOUT_VERSION);
  assert.equal(new Set(REGIONAL_LAYOUTS.flat().map((l) => l.id)).size, 18);
  const seen = [new Set(), new Set(), new Set()];
  for (let seed = 0; seed < 60; seed++)
    for (let stage = 0; stage < 24; stage++) {
      const run = { ...createRun(`REGION-${seed}`), stage };
      const a = new Game(run),
        b = new Game(structuredClone(run));
      assert.deepEqual(a.tiles, b.tiles);
      assert.deepEqual(a.spawnQueue, b.spawnQueue);
      if (stage && !isBoss(stage) && !isCamp(stage)) {
        const act = Math.floor(stage / 8);
        seen[act].add(a.layout.id);
        assert.ok(REGIONAL_LAYOUTS[act].includes(a.layout));
      }
    }
  assert.deepEqual(
    seen.map((s) => s.size),
    [6, 6, 6],
  );
});

test("新しい全配置は入口・出口・装置・灯器へつながり、実際の敵の半径で出現できる", () => {
  const shapes = new Set();
  for (let seed = 0; seed < 40; seed++)
    for (let stage = 0; stage < 24; stage++) {
      const g = new Game({ ...createRun(`SAFE-${seed}`), stage });
      assert.equal(g.solid(g.player.x, g.player.y, g.player.r), false);
      assert.equal(g.solid(240, 43, 5), false);
      const { free, seen } = reachable(g);
      assert.equal(seen.size, free.size, `${g.layout.name} disconnected`);
      for (const n of g.spawnQueue)
        assert.equal(
          g.solid(n.x, n.y, ENEMIES[n.kind].radius + (n.elite ? 2 : 0)),
          false,
        );
      for (const n of [
        ...(g.apparatus?.objects || []),
        ...(g.beacon ? [g.beacon] : []),
      ]) {
        assert.equal(g.solid(n.x, n.y, 18), false);
        const nearest = [...free.values()].sort(
          (a, b) => distance(a, n) - distance(b, n),
        )[0];
        assert.ok(seen.has(`${nearest.x},${nearest.y}`));
      }
      shapes.add(JSON.stringify(g.tiles));
    }
  assert.ok(shapes.size >= 19);
});

test("旧航路は元の八配置・編成・乱数と120コマの戦闘状態を保持する", () => {
  for (let seed = 0; seed < 10; seed++)
    for (let stage = 0; stage < 24; stage++)
      for (const version of [undefined, 1]) {
        const run = { ...beforeRun(`LEGACY-${seed}`), stage };
        if (version) run.layoutVersion = version;
        const a = new Before(structuredClone(run)),
          b = new Game(structuredClone(run));
        assert.equal(JSON.stringify(a), JSON.stringify(b));
        for (let i = 0; i < 120; i++) {
          const input = {
            mx: i < 60 ? 1 : -1,
            my: i < 30 ? -1 : 0,
            fire: true,
            autoAim: true,
            echo: i === 45,
            dash: i === 80,
          };
          // Reproduce only the cosmetic Math.random draws. Both original
          // simulations still update normally and must consume the same count.
          const original = Math.random,
            stream = [];
          let index = 0;
          try {
            Math.random = () => {
              const value = original();
              stream.push(value);
              return value;
            };
            a.update(1 / 60, input);
            Math.random = () => {
              assert.ok(index < stream.length);
              return stream[index++];
            };
            b.update(1 / 60, input);
            assert.equal(index, stream.length);
          } finally {
            Math.random = original;
          }
        }
        assert.equal(
          JSON.stringify(a),
          JSON.stringify(b),
          `${seed}/${stage}/${version}`,
        );
      }
});

test("旧出現の配置変更は同じ乱数の消費・敵数・種類・時刻・織片と価格を保持する", () => {
  for (let seed = 0; seed < 40; seed++)
    for (let stage = 0; stage < 24; stage++) {
      const run = { ...createRun(`ECONOMY-${seed}`), stage };
      delete run.encounterVersion;
      const old = new Before({ ...structuredClone(run), layoutVersion: 1 }),
        now = new Game(run);
      assert.equal(old.rng.state, now.rng.state);
      const queue = (g) =>
        g.spawnQueue.map(({ kind, time, elite }) => ({ kind, time, elite }));
      assert.deepEqual(queue(old), queue(now));
      assert.deepEqual(old.offer(), now.offer());
      const stock = (run) =>
        traderStock(run).map((u) => ({ id: u.id, price: traderPrice(u) }));
      assert.deepEqual(stock(old.run), stock(now.run));
    }
});

test("保存と実ファイルは新配置を保持し、版のない旧記録は元の配置で再開する", () => {
  const p = freshProfile();
  p.run = { ...createRun("LAYOUT-SAVE"), stage: 12 };
  const g = new Game(structuredClone(p.run));
  const imported = prepareImport(exportProfile(p)).profile;
  assert.equal(imported.run.layoutVersion, 2);
  assert.deepEqual(new Game(imported.run).tiles, g.tiles);
  delete p.run.layoutVersion;
  const old = validateProfile(p);
  assert.equal(old.run.layoutVersion, 1);
  assert.deepEqual(new Game(old.run).tiles, new Before(old.run).tiles);
  for (const invalid of [0, 3, "2", null]) {
    p.run.layoutVersion = invalid;
    assert.equal(validateProfile(p).run.layoutVersion, 1);
  }
});

test("航路の見取図は装置用の空き地を含む実際の床に一致し、現在の航路を変えない", () => {
  for (let seed = 0; seed < 20; seed++)
    for (let stage = 1; stage < 24; stage++)
      for (const route of ["loom", "salvage", "rest"]) {
        const run = createRun(`MAP-${seed}`),
          snapshot = JSON.stringify(run);
        const forecast = forecastRoom(run, stage, route),
          actual = new Game({ ...structuredClone(run), stage, route });
        assert.deepEqual(forecast.layout, roomLayoutPreview(actual));
        forecast.layout.tiles[1][1] = 99;
        assert.notEqual(actual.tiles[1][1], 99);
        assert.equal(JSON.stringify(run), snapshot);
      }
});

function spiral() {
  for (let i = 0; i < 100; i++) {
    const g = new Game({ ...createRun(`DETOUR-${i}`), stage: 8 });
    if (g.layout.id === "garden-spiral") {
      g.spawnQueue = [];
      g.player.x = 240;
      g.player.y = 180;
      return g;
    }
  }
  throw new Error("No spiral sample");
}

test("新しい敵は長い苗床の角を回り、壁を越えずに現在の相手へ近づく", () => {
  for (const elite of [false, true]) {
    const g = spiral(),
      e = g.spawn("crawler", 240, 64, elite),
      rng = g.rng.state;
    assert.notEqual(enemyWaypoint(g, e, g.player), g.player);
    const points = [];
    for (let i = 0; i < 1200 && distance(e, g.player) > e.r + g.player.r; i++) {
      g.updateEnemy(e, 1 / 60);
      assert.equal(g.solid(e.x, e.y, e.r), false);
      points.push({ x: e.x, y: e.y });
    }
    assert.ok(distance(e, g.player) <= e.r + g.player.r);
    assert.ok(points.some((p) => p.x < 176 - e.r || p.x > 304 + e.r));
    assert.equal(g.rng.state, rng);
    g.player.y = 64;
    for (let i = 0; i < 1200 && distance(e, g.player) > e.r + g.player.r; i++)
      g.updateEnemy(e, 1 / 60);
    assert.ok(distance(e, g.player) <= e.r + g.player.r);
  }
});

test("旧航路は回り込みを足さず、新配置でも突進は固定した方向で壁に止まる", () => {
  const g = spiral(),
    e = g.spawn("crawler", 240, 64);
  g.run.layoutVersion = 1;
  assert.equal(enemyWaypoint(g, e, g.player), g.player);
  for (let i = 0; i < 600; i++) g.updateEnemy(e, 1 / 60);
  assert.ok(distance(e, g.player) > 80);
  g.run.layoutVersion = 2;
  const c = g.spawn("charger", 240, 64);
  c.state = "charge";
  c.angle = Math.PI / 2;
  c.timer = 0.7;
  for (let i = 0; i < 60 && c.state === "charge"; i++) g.updateEnemy(c, 1 / 60);
  assert.equal(c.state, "recover");
  assert.equal(c.angle, Math.PI / 2);
  assert.ok(c.y < 80);
});
