import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import { UPGRADES, stats } from "../src/content.js";
import {
  freshProfile,
  validateProfile,
  loadProfile,
  saveProfile,
  SAVE_KEY,
} from "../src/save.js";
import { Random, segmentDistance } from "../src/math.js";

const quietGame = (seed = "TEST") => {
  const g = new Game(createRun(seed));
  g.spawnQueue = [{ time: 1000, kind: "crawler", x: 240, y: 70 }];
  return g;
};
test("同じ航路番号は部屋・敵編成・織片候補を再現する", () => {
  const a = new Game(createRun("LIGHT-001")),
    b = new Game(createRun("LIGHT-001"));
  assert.deepEqual(a.tiles, b.tiles);
  assert.deepEqual(a.spawnQueue, b.spawnQueue);
  assert.deepEqual(a.offer(), b.offer());
  const layouts = new Set(
    Array.from({ length: 20 }, (_, i) => {
      const run = createRun(`VARIATION-${i}`);
      run.stage = 1;
      return JSON.stringify(new Game(run).tiles);
    }),
  );
  assert.ok(layouts.size >= 4);
});
test("残響が実際の移動と射撃を再生し、再充填中の連打では増えない", () => {
  const g = quietGame();
  for (let i = 0; i < 90; i++)
    g.update(1 / 60, { mx: 1, angle: 0, fire: i % 30 < 15 });
  const first = { ...g.history[0] };
  g.update(1 / 60, { echo: true });
  assert.equal(g.echoes.length, 1);
  assert.equal(g.echoes[0].x, first.x);
  assert.ok(g.bullets.some((b) => b.echo));
  g.update(1 / 60, { echo: true });
  assert.equal(g.echoes.length, 1);
  assert.equal(g.run.echoesCast, 1);
  for (let i = 0; i < 60; i++) g.update(1 / 60, {});
  assert.ok(g.echoes[0].x > first.x + 60);
});
test("光糸は装甲を通し、糸による撃破回復のビルドが成立する", () => {
  const g = quietGame();
  g.addUpgrade("suture");
  g.run.hp = 50;
  g.player.x = 100;
  g.player.y = 160;
  g.echoes = [{ x: 300, y: 160 }];
  const e = g.spawn("shield", 200, 160);
  e.hp = 3;
  g.updateThreads(1 / 60);
  assert.equal(g.enemies.length, 0);
  assert.equal(g.run.threadKills, 1);
  assert.equal(g.run.hp, 52);
});
test("解放は残響の位置で攻撃し、範囲内の敵弾だけを消す", () => {
  const g = quietGame();
  g.echoes = [{ x: 240, y: 120 }];
  g.spawn("crawler", 240, 120);
  g.spawn("crawler", 400, 120);
  g.makeBullet({ x: 240, y: 120 }, 0, 5, 30, false, "#fff");
  g.makeBullet({ x: 400, y: 120 }, 0, 5, 30, false, "#fff");
  g.release();
  assert.equal(g.echoes.length, 0);
  assert.equal(g.enemies.length, 1);
  assert.equal(g.bullets.filter((b) => b.life > 0).length, 1);
});
test("回避は壁を越えず、無敵時間が被弾を防ぐ", () => {
  const g = quietGame();
  g.player.x = 40;
  g.player.y = 160;
  const hp = g.run.hp;
  g.update(1 / 60, { mx: -1, dash: true });
  g.hurt(20, { x: 50, y: 160 });
  assert.equal(g.run.hp, hp);
  for (let i = 0; i < 30; i++) g.update(1 / 60, { mx: -1 });
  assert.ok(g.player.x >= 37);
});
test("貝殻は最初の一撃のみを防ぎ、燠火は部屋ごとに一度だけ蘇生する", () => {
  const g = quietGame();
  g.addUpgrade("shield");
  g.hurt(10, { x: 220, y: 200 });
  assert.equal(g.run.hp, 100);
  g.player.invulnerable = 0;
  g.hurt(10, { x: 220, y: 200 });
  assert.equal(g.run.hp, 90);
  g.run.relic = "ember";
  g.player.invulnerable = 0;
  g.hurt(500, { x: 220, y: 200 });
  assert.equal(g.run.hp, 25);
  assert.equal(g.mode, "combat");
  g.player.invulnerable = 0;
  g.hurt(500, { x: 220, y: 200 });
  assert.equal(g.mode, "dead");
});
test("織片は上限を守り、ボス報酬にレア以上が含まれる", () => {
  const g = quietGame();
  for (let i = 0; i < 10; i++) g.addUpgrade("double");
  assert.equal(stats(g.run).echoes, 3);
  g.run.stage = 7;
  assert.ok(g.offer().some((u) => u.rarity !== "common"));
  for (const u of UPGRADES) for (let i = 0; i < u.max; i++) g.addUpgrade(u.id);
  assert.equal(g.offer().length, 0);
});
test("複数残響を使える旅だけに三角の海を提案し、三角形の内側へ攻撃できる", () => {
  const g = quietGame();
  assert.equal(
    g.offer(UPGRADES.length).some((u) => u.id === "triangle"),
    false,
  );
  assert.equal(g.addUpgrade("triangle"), false);
  assert.equal(g.run.upgrades.triangle, undefined);
  g.addUpgrade("double");
  assert.equal(
    g.offer(UPGRADES.length).some((u) => u.id === "triangle"),
    true,
  );
  assert.equal(g.addUpgrade("triangle"), true);
  g.player.x = 100;
  g.player.y = 100;
  g.echoes = [
    { x: 300, y: 100 },
    { x: 200, y: 220 },
  ];
  const e = g.spawn("crawler", 200, 145),
    hp = e.hp;
  g.updateThreads(1 / 60);
  assert.equal(g.threads().length, 3);
  assert.equal(e.hp, hp - g.stats.thread * 0.15);
});
test("ステージ完了は一度だけ発火し、死亡後に戦闘が進まない", () => {
  let clears = 0;
  const g = new Game(createRun("CLEAR"), (type) => {
    if (type === "clear") clears++;
  });
  g.spawnQueue = [];
  for (let i = 0; i < 200; i++) g.update(1 / 60, {});
  assert.equal(clears, 1);
  assert.equal(g.mode, "reward");
  g.mode = "dead";
  const t = g.run.time;
  g.update(1, {});
  assert.equal(g.run.time, t);
});
test("保存の破損や書き込み失敗に耐え、未知の織片を読み込まない", () => {
  const mem = new Map(),
    storage = { getItem: (k) => mem.get(k), setItem: (k, v) => mem.set(k, v) };
  const p = freshProfile();
  p.memory = 37;
  p.run = createRun("SAVE");
  p.run.stage = 7;
  p.run.upgrades = { double: 100, unknown: 10 };
  assert.equal(saveProfile(p, storage), true);
  const restored = loadProfile(storage);
  assert.equal(restored.memory, 37);
  assert.equal(restored.run.upgrades.double, 2);
  assert.equal(restored.run.upgrades.unknown, undefined);
  mem.set(SAVE_KEY, "broken");
  assert.equal(loadProfile(storage).memory, 37);
  assert.equal(loadProfile(storage).run.seed, "SAVE");
  assert.equal(
    saveProfile(p, {
      setItem: () => {
        throw Error("QuotaExceeded");
      },
    }),
    false,
  );
  assert.equal(
    validateProfile({ ...p, run: { ...p.run, stage: 99 } }).run,
    null,
  );
});
test("乱数と光糸の距離は境界で破綻しない", () => {
  const rng = new Random("BOUNDARY");
  for (let i = 0; i < 1000; i++) assert.ok(rng.next() >= 0 && rng.next() < 1);
  assert.equal(
    segmentDistance({ x: 0, y: 10 }, { x: 0, y: 0 }, { x: 0, y: 0 }),
    10,
  );
});
test("複数残響の充填は連続使用でき、使い切ると一回ずつ戻る", () => {
  const g = quietGame();
  g.addUpgrade("double");
  g.addUpgrade("double");
  assert.equal(g.player.echoCharges, 3);
  for (let i = 0; i < 60; i++) g.update(1 / 60, { mx: 1 });
  for (let i = 0; i < 3; i++) g.update(1 / 60, { echo: true });
  assert.equal(g.echoes.length, 3);
  assert.equal(g.player.echoCharges, 0);
  for (let i = 0; i < 430; i++) g.update(1 / 60, {});
  assert.equal(g.player.echoCharges, 1);
  assert.equal(g.run.echoesCast, 3);
});
test("灯器は光糸を保持すると一度だけ灯り、記憶と回復を得る", () => {
  const run = createRun("BEACON");
  run.stage = 3;
  const g = new Game(run);
  g.run.hp = 50;
  g.player.x = 150;
  g.player.y = 156;
  g.echoes = [{ x: 330, y: 156 }];
  for (let i = 0; i < 240; i++) g.updateThreads(1 / 60);
  assert.equal(g.beacon.lit, true);
  assert.equal(g.run.memory, 4);
  assert.equal(g.run.hp, 62);
  const restored = new Game(structuredClone(g.run));
  assert.equal(restored.beacon.lit, true);
});
test("炉心の記憶の盾は射撃を防ぎ、光糸は通す", () => {
  const run = createRun("WARD");
  run.stage = 23;
  const g = new Game(run);
  g.spawnQueue = [];
  const e = g.spawn("heart", 240, 150);
  g.updateEnemy(e, 1 / 60);
  assert.equal(e.ward, true);
  const before = e.hp;
  g.makeBullet({ x: 240, y: 150 }, 0, 20, 0, true, "#fff");
  g.updateBullets(1 / 60);
  assert.equal(before - e.hp, 4);
  g.player.x = 180;
  g.player.y = 150;
  g.echoes = [{ x: 300, y: 150 }];
  const second = e.hp;
  g.updateThreads(1 / 60);
  assert.ok(second - e.hp > 4);
});
test("戦闘後も残響で灯器を灯せ、部屋の完了が再発火しない", () => {
  const run = createRun("AFTER-BATTLE");
  run.stage = 3;
  let clears = 0;
  const g = new Game(run, (type) => {
    if (type === "clear") clears++;
  });
  g.mode = "cleared";
  g.enemies = [];
  g.spawnQueue = [];
  g.player.x = 330;
  g.player.y = 156;
  g.history = Array.from({ length: 180 }, () => ({
    x: 150,
    y: 156,
    angle: 0,
    fire: false,
  }));
  g.update(1 / 60, { echo: true });
  for (let i = 0; i < 145; i++) g.update(1 / 60, {});
  assert.equal(g.beacon.lit, true);
  assert.equal(g.run.memory, 4);
  assert.equal(g.mode, "cleared");
  assert.equal(clears, 0);
});
