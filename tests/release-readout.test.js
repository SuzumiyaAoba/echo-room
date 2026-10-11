import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import { releaseReadout } from "../src/release-readout.js";

function arena(rank = 0, count = 1) {
  const run = createRun("RELEASE-REACH");
  if (rank) run.upgrades.burst = rank;
  if (count > 1) run.upgrades.double = count - 1;
  const game = new Game(run);
  game.enemies = [];
  game.bullets = [];
  game.hazards = [];
  game.echoes = Array.from({ length: count }, (_, i) => ({
    x: 160 + i * 7,
    y: 130 + i * 11,
    r: 5,
    angle: 0,
    frames: [],
    frame: -1,
    elapsed: 0,
    returnStock: 0,
  }));
  return game;
}

test("384の実際の解放で四段の半径・重なり・16方向・新旧航路の受け手と消えた弾を照合", () => {
  let cases = 0;
  for (let rank = 0; rank <= 3; rank++)
    for (let count = 1; count <= 3; count++)
      for (let direction = 0; direction < 16; direction++)
        for (const version of [undefined, 1]) {
          const g = arena(rank, count);
          if (version === undefined) delete g.run.chargeVersion;
          const echo = g.echoes[0],
            angle = (direction * Math.PI) / 8;
          const enemies = [],
            bullets = [];
          for (const offset of [-2, -1e-6, 0, 1e-6, 2]) {
            const e = g.spawn("shield", 240, 150);
            e.hp = e.maxHp = 2000;
            const d = g.stats.burstRadius + e.r + offset;
            e.x = echo.x + Math.cos(angle) * d;
            e.y = echo.y + Math.sin(angle) * d;
            enemies.push({ e, hp: e.hp });
            const r = g.stats.burstRadius + offset;
            bullets.push(
              g.makeBullet(
                {
                  x: echo.x + Math.cos(angle) * r,
                  y: echo.y + Math.sin(angle) * r,
                },
                angle,
                10,
                0,
                false,
                "#fff",
                0,
              ),
            );
            // The real emitter offsets from the source; place the returned
            // prepared bullet's actual centre on the intended boundary.
            bullets.at(-1).x = echo.x + Math.cos(angle) * r;
            bullets.at(-1).y = echo.y + Math.sin(angle) * r;
          }
          const before = JSON.stringify(g),
            rng = g.rng.state;
          const readout = releaseReadout(g);
          assert.equal(JSON.stringify(g), before);
          assert.equal(g.rng.state, rng);
          assert.deepEqual(releaseReadout(g), readout);
          g.release();
          assert.equal(
            readout.enemies,
            enemies.filter(({ e, hp }) => e.hp < hp).length,
          );
          assert.equal(
            readout.bullets,
            bullets.filter((b) => b.life === 0).length,
          );
          assert.equal(releaseReadout(g).active, false);
          cases++;
        }
  assert.equal(cases, 384);
});

test("軸上の厳密な境界と敵の体・弾の中心、重複した爆発を読み分ける", () => {
  const g = arena(0, 3),
    c = g.echoes[0];
  for (const e of g.echoes) {
    e.x = c.x;
    e.y = c.y;
  }
  const edge = g.spawn("crawler", c.x + g.stats.burstRadius + 7, c.y);
  edge.r = 7;
  edge.hp = 1000;
  const inside = g.spawn("crawler", edge.x - 1e-6, c.y);
  inside.r = 7;
  inside.hp = 1000;
  const bullet = g.makeBullet(
    { x: c.x + g.stats.burstRadius, y: c.y },
    0,
    10,
    0,
    false,
    "#fff",
  );
  const inner = g.makeBullet(
    { x: bullet.x - 1e-6, y: c.y },
    0,
    10,
    0,
    false,
    "#fff",
  );
  bullet.x = c.x + g.stats.burstRadius;
  inner.x = bullet.x - 1e-6;
  bullet.r = 30;
  inner.r = 1;
  assert.deepEqual(releaseReadout(g), { active: true, enemies: 1, bullets: 1 });
  g.release();
  assert.equal(edge.hp, 1000);
  assert.ok(inside.hp < 1000);
  assert.ok(bullet.life > 0);
  assert.equal(inner.life, 0);
});

test("倒れた影・味方の針・消えた敵弾を除き、表示は時計と全状態を変えない", () => {
  const g = arena(),
    p = g.echoes[0],
    live = g.spawn("crawler", p.x, p.y),
    dead = g.spawn("crawler", p.x, p.y);
  dead.hp = 0;
  g.makeBullet(p, 0, 10, 0, true, "#fff");
  g.makeBullet(p, 0, 10, 0, false, "#fff").life = 0;
  g.makeBullet(p, 0, 10, 0, false, "#fff");
  const before = JSON.stringify(g),
    rng = g.rng.state;
  for (let i = 0; i < 1000; i++)
    assert.deepEqual(releaseReadout(g), {
      active: true,
      enemies: 1,
      bullets: 1,
    });
  assert.equal(JSON.stringify(g), before);
  assert.equal(g.rng.state, rng);
  assert.ok(live.hp > 0);
});

test("生存中の爆発の強化は現在の半径からすぐに読む", () => {
  const g = arena(),
    p = g.echoes[0];
  g.spawn("crawler", p.x + 65, p.y);
  assert.equal(releaseReadout(g).enemies, 0);
  g.addUpgrade("burst");
  assert.equal(g.stats.burstRadius, 68);
  assert.equal(releaseReadout(g).enemies, 1);
});

test("解放可能な現在の残響配列を使い、空・非戦闘・不正な位置は表示しない", () => {
  const empty = { active: false, enemies: 0, bullets: 0 };
  assert.deepEqual(releaseReadout(null), empty);
  const g = arena();
  g.echoes[0].elapsed = 999;
  g.spawn("crawler", 160, 130);
  assert.equal(releaseReadout(g).enemies, 1);
  g.mode = "cleared";
  assert.equal(releaseReadout(g).active, true);
  g.mode = "dead";
  assert.deepEqual(releaseReadout(g), empty);
  g.mode = "combat";
  g.echoes[0].x = NaN;
  assert.deepEqual(releaseReadout(g), empty);
  g.echoes = [];
  assert.deepEqual(releaseReadout(g), empty);
});
