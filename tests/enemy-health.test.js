import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import { ENEMIES } from "../src/content.js";
import { EnemyHealthFeedback } from "../src/enemy-health.js";
import {
  drawEnemyHealth,
  enemyHealthBounds,
} from "../src/enemy-health-render.js";

function arena() {
  const game = new Game(createRun("ENEMY-HEALTH-CONTRACT"));
  game.enemies = [];
  game.spawnQueue = [{ time: Infinity }];
  return game;
}
function observe(feedback, game) {
  const before = JSON.stringify(game);
  feedback.observe(game);
  assert.equal(JSON.stringify(game), before);
}
function sample(hp = 100, maxHp = 100) {
  const enemy = { id: "sample", kind: "crawler", hp, maxHp };
  const game = { t: 0, enemies: [enemy] };
  const feedback = new EnemyHealthFeedback();
  observe(feedback, game);
  return { game, enemy, feedback };
}

test("実際の九種・通常と強敵・三つの攻撃で残り体力だけを読む", () => {
  let scenes = 0;
  for (const [kind, data] of Object.entries(ENEMIES))
    for (const elite of data.boss ? [false] : [false, true])
      for (const source of ["shot", "thread", "burst"]) {
        const game = arena();
        game.spawn(kind, 240, 65, elite);
        const enemy = game.enemies[0];
        const feedback = new EnemyHealthFeedback();
        observe(feedback, game);
        assert.equal(feedback.read(enemy), null);
        game.damageEnemy(enemy, enemy.maxHp * 0.4, source);
        observe(feedback, game);
        const before = JSON.stringify(game);
        const health = feedback.read(enemy);
        if (data.boss) assert.equal(health, null);
        else {
          assert.ok(Math.abs(health.fraction - 0.6) < 1e-12);
          assert.equal(health.trailFraction, 1);
          assert.equal(health.low, false);
        }
        assert.equal(JSON.stringify(game), before);
        scenes++;
      }
  assert.equal(scenes, 45);
});

test("削れた部分は0.18秒残り、0.35秒で実際の体力へ戻る", () => {
  const { game, enemy, feedback } = sample();
  enemy.hp = 60;
  observe(feedback, game);
  for (const [time, expected] of [
    [0, 1],
    [0.18, 1],
    [0.355, 0.8],
    [0.53, 0.6],
    [8, 0.6],
  ]) {
    game.t = time;
    observe(feedback, game);
    assert.ok(Math.abs(feedback.read(enemy).trailFraction - expected) < 1e-12);
  }
});

test("停止中の繰り返し描画は全Gameと表示を保ち、実時計で収束する", () => {
  const game = arena();
  game.spawn("crawler", 240, 65);
  const enemy = game.enemies[0],
    feedback = new EnemyHealthFeedback();
  observe(feedback, game);
  game.damageEnemy(enemy, 12, "shot");
  observe(feedback, game);
  const before = JSON.stringify(game),
    health = feedback.read(enemy);
  for (let i = 0; i < 200; i++) {
    observe(feedback, game);
    assert.deepEqual(feedback.read({ ...enemy }), health);
  }
  assert.equal(JSON.stringify(game), before);
  for (let i = 0; i < 33; i++) {
    game.update(1 / 60, {});
    observe(feedback, game);
  }
  assert.equal(feedback.read(enemy).fraction, 0.6);
  assert.equal(feedback.read(enemy).trailFraction, 0.6);
});

test("続けて削れた量を引き継ぎ、収束した古い体力は再び現れない", () => {
  const { game, enemy, feedback } = sample();
  enemy.hp = 80;
  observe(feedback, game);
  game.t = 0.355;
  enemy.hp = 50;
  observe(feedback, game);
  assert.ok(Math.abs(feedback.read(enemy).trailFraction - 0.9) < 1e-12);
  game.t = 1;
  observe(feedback, game);
  assert.equal(feedback.read(enemy).trailFraction, 0.5);
  enemy.hp = 40;
  observe(feedback, game);
  assert.equal(feedback.read(enemy).trailFraction, 0.5);
});

test("回復・最大体力の変更・敵と部屋の入れ替え・死亡で記録を持ち越さない", () => {
  const { game, enemy, feedback } = sample();
  enemy.hp = 40;
  observe(feedback, game);
  enemy.hp = 70;
  observe(feedback, game);
  assert.equal(feedback.read(enemy).trailFraction, 0.7);
  enemy.maxHp = 200;
  observe(feedback, game);
  assert.equal(feedback.read(enemy).trailFraction, 0.35);
  const replacement = { ...enemy, hp: 50 };
  game.enemies = [replacement];
  observe(feedback, game);
  assert.equal(feedback.read(replacement).trailFraction, 0.25);
  replacement.hp = 0;
  observe(feedback, game);
  assert.equal(feedback.records.size, 0);
  assert.equal(feedback.read(replacement), null);
  const next = { t: 1, enemies: [{ ...enemy, hp: 60 }] };
  observe(feedback, next);
  assert.equal(feedback.read(next.enemies[0]).trailFraction, 0.3);
  observe(feedback, null);
  assert.equal(feedback.records.size, 0);
});

test("描画回数に依存せず、少量の正の体力と最後の四分の一を示す", () => {
  for (const cadence of [30, 60, 144]) {
    const { game, enemy, feedback } = sample();
    enemy.hp = 25;
    observe(feedback, game);
    assert.equal(feedback.read(enemy).low, true);
    for (let i = 1; i < cadence; i++) {
      game.t = i / cadence;
      observe(feedback, game);
    }
    game.t = 1;
    observe(feedback, game);
    assert.deepEqual(feedback.read(enemy), {
      fraction: 0.25,
      trailFraction: 0.25,
      low: true,
      elite: false,
    });
    enemy.hp = 0.00001;
    observe(feedback, game);
    assert.ok(feedback.read(enemy).fraction > 0);
    enemy.hp = NaN;
    observe(feedback, game);
    assert.equal(feedback.read(enemy), null);
    assert.equal(feedback.records.size, 0);
  }
});

test("表示は整数のドットで枠内に収まり、描画状態を元へ戻す", () => {
  const rectangles = [];
  const context = {
    globalAlpha: 0.4,
    fillStyle: "original",
    save() {
      this.saved = [this.globalAlpha, this.fillStyle];
    },
    restore() {
      [this.globalAlpha, this.fillStyle] = this.saved;
    },
    fillRect(x, y, width, height) {
      rectangles.push({ x, y, width, height, color: this.fillStyle });
    },
  };
  for (const position of [
    { x: 240.3, y: 150.7, r: 7 },
    { x: -9.5, y: -8, r: 9 },
    { x: 481, y: 330, r: 8 },
  ]) {
    drawEnemyHealth(context, position, {
      fraction: 0.00001,
      trailFraction: 0.2,
      low: true,
    });
    const bounds = enemyHealthBounds(position);
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 480);
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 300);
  }
  assert.ok(
    rectangles.every((r) =>
      [r.x, r.y, r.width, r.height].every(Number.isInteger),
    ),
  );
  assert.equal(context.globalAlpha, 0.4);
  assert.equal(context.fillStyle, "original");
  assert.ok(rectangles.some((r) => r.width === 1 && r.height === 3));
  const count = rectangles.length;
  drawEnemyHealth(context, {}, null);
  assert.equal(rectangles.length, count);
});
