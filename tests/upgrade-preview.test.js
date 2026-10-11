import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import { UPGRADES, WEAPONS } from "../src/content.js";
import {
  previewUpgrade,
  upgradeEffects,
  effectText,
} from "../src/upgrade-preview.js";
import { releaseStoredLights } from "../src/counter-thread.js";

const row = (preview, key) => preview.rows.find((r) => r.key === key);
const echo = () => ({ x: 120, y: 160, r: 5, angle: 0, returnStock: 1 });
function arena(run) {
  const g = new Game(structuredClone(run));
  g.spawnQueue = [{ time: Infinity }];
  g.enemies = [];
  g.bullets = [];
  g.player.x = 120;
  g.player.y = 160;
  return g;
}
function history(g) {
  g.history = Array.from({ length: 32 }, () => ({
    x: 120,
    y: 160,
    angle: 0,
    fire: false,
  }));
}

test("全織片で実際の取得と比較が対応し、読むだけでは記録を変えない", () => {
  for (const u of UPGRADES)
    for (const weapon of WEAPONS) {
      const run = createRun("PREVIEW-CONTRACT", weapon.id);
      if (u.requires) run.upgrades[u.requires] = 1;
      const before = structuredClone(run);
      Object.freeze(run.upgrades);
      Object.freeze(run);
      const preview = previewUpgrade(run, u.id);
      assert.ok(preview?.rows.length, `${weapon.id}/${u.id}`);
      assert.deepEqual(run, before);
      const actual = arena(before);
      assert.equal(actual.addUpgrade(u.id), true);
      const effects = upgradeEffects(actual.run, u.id);
      assert.deepEqual(
        preview.rows.map((r) => r.after),
        effects.map((r) => r.value),
      );
    }
});

test("充填と寿命は実際に呼んだ残響と一致し、巻糸と重ねた段数を含む", () => {
  for (const relic of ["spool", "bell", "ember"])
    for (const level of [0, 2]) {
      const run = createRun("PREVIEW-ECHO", "needle", relic);
      run.upgrades = { quickecho: level, duration: level, double: 1 };
      const charge = previewUpgrade(run, "quickecho");
      const g = arena(run);
      g.addUpgrade("quickecho");
      history(g);
      g.castEcho();
      assert.equal(g.player.echoCd, row(charge, "echoCooldown").after);
      const life = previewUpgrade(run, "duration");
      const lived = arena(run);
      lived.addUpgrade("duration");
      history(lived);
      lived.castEcho();
      const duration = row(life, "echoDuration").after;
      lived.update(duration - 0.01, {});
      assert.equal(lived.echoes.length, 1);
      lived.update(0.02, {});
      assert.equal(lived.echoes.length, 0);
    }
});

test("射撃と残響の基礎威力は三武器の実弾と一致し、返し針の別の倍率も示す", () => {
  for (const weapon of WEAPONS)
    for (const id of ["damage", "echopower"]) {
      const run = createRun("PREVIEW-LIGHT", weapon.id);
      run.upgrades = { counter: 1, damage: 1, echopower: 1 };
      const preview = previewUpgrade(run, id),
        g = arena(run);
      g.addUpgrade(id);
      g.shoot(g.player, 0, id === "echopower");
      assert.equal(
        g.bullets[0].damage,
        row(preview, id === "damage" ? "damage" : "echoDamage").after,
      );
      g.echoes = [echo()];
      releaseStoredLights(g, g.echoes[0]);
      assert.equal(
        g.bullets.find((b) => b.returnedLight).damage,
        row(preview, "returnedDamage").after,
      );
    }
});

test("体力の見込みは物語などで得た上限を保ち、実際の増加と回復に一致する", () => {
  const run = createRun("PREVIEW-HEALTH");
  run.maxHp = 147;
  run.hp = 102.25;
  run.upgrades.health = 1;
  const preview = previewUpgrade(run, "health"),
    g = arena(run);
  g.addUpgrade("health");
  assert.equal(row(preview, "maxHp").before, 147);
  assert.equal(row(preview, "maxHp").after, g.run.maxHp);
  assert.equal(row(preview, "hp").before, 103);
  assert.equal(row(preview, "hp").after, Math.ceil(g.run.hp));
  assert.equal(g.run.hp, 122.25);
});

test("最大命中数と射撃間隔は武器自身の貫通と速さを含む", () => {
  for (const weapon of WEAPONS) {
    const run = createRun("PREVIEW-SHOT", weapon.id);
    run.upgrades = { pierce: 1, rapid: 1 };
    const pierced = arena(run),
      preview = previewUpgrade(run, "pierce");
    pierced.addUpgrade("pierce");
    pierced.shoot(pierced.player, 0, false);
    assert.equal(row(preview, "pierce").after, 1 + pierced.bullets[0].pierce);
    const fast = arena(run),
      rate = previewUpgrade(run, "rapid");
    fast.addUpgrade("rapid");
    fast.update(1 / 60, { fire: true, autoAim: true });
    assert.equal(row(rate, "fireRate").after, fast.player.fireCd);
  }
});

test("条件付きの回復・短縮・追加光弾・呼ぶ瞬間の威力は実際の能力と一致する", () => {
  const run = createRun("PREVIEW-CONDITIONAL");
  run.hp = 40;
  const suture = arena(run),
    healing = previewUpgrade(run, "suture");
  suture.addUpgrade("suture");
  const enemy = suture.spawn("crawler", 150, 160);
  enemy.hp = 1;
  suture.damageEnemy(enemy, 10, "thread");
  assert.equal(suture.run.hp - run.hp, row(healing, "suture").after);
  const refund = arena(run),
    waiting = previewUpgrade(run, "refund");
  refund.addUpgrade("refund");
  refund.echoes = [echo()];
  refund.player.echoCd = 5;
  refund.spawn("crawler", 125, 160).hp = 1;
  refund.release();
  assert.equal(5 - refund.player.echoCd, row(waiting, "refund").after);
  const dash = arena(run),
    eight = previewUpgrade(run, "dashshot");
  dash.addUpgrade("dashshot");
  dash.dash(1, 0);
  assert.equal(dash.bullets.length, row(eight, "dashshot").after);
  const pulse = arena(run),
    calling = previewUpgrade(run, "resonance");
  pulse.addUpgrade("resonance");
  const near = pulse.spawn("charger", 140, 160),
    hp = near.hp;
  history(pulse);
  pulse.castEcho();
  assert.equal(hp - near.hp, row(calling, "resonance").after);
  const cascade = arena(run),
    rays = previewUpgrade(run, "cascade");
  cascade.addUpgrade("cascade");
  cascade.echoes = [echo()];
  for (let i = 0; i < 40; i++)
    cascade.makeBullet({ x: 120, y: 165 }, 0, 1, 0, false, "#f00");
  cascade.release();
  assert.equal(row(rays, "cascade").after, "1発ごと1本・最大24本");
  assert.equal(cascade.bullets.filter((b) => b.friendly).length, 24);
});

test("上限・前提・旧24種を守り、買った後の値は次の取得を装わない", () => {
  const run = createRun("PREVIEW-LIMITS");
  assert.equal(previewUpgrade(run, "triangle"), null);
  assert.equal(previewUpgrade(run, "missing"), null);
  const old = { ...run, catalogVersion: 1 };
  assert.equal(previewUpgrade(old, "counter"), null);
  for (const u of UPGRADES) {
    const capped = {
      ...run,
      upgrades: { [u.id]: u.max, ...(u.requires ? { [u.requires]: 1 } : {}) },
    };
    assert.equal(previewUpgrade(capped, u.id), null);
    assert.ok(
      upgradeEffects(capped, u.id).every(
        (r) => effectText(r, r.value).length > 0,
      ),
    );
  }
});

test("充填の秒数・小数の威力・会心率を読み分けられる桁で示す", () => {
  const run = createRun("PREVIEW-NUMBERS", "prism");
  const charge = row(previewUpgrade(run, "quickecho"), "echoCooldown");
  assert.equal(effectText(charge, charge.before), "7.0秒");
  assert.equal(effectText(charge, charge.after), "5.6秒");
  const damage = row(previewUpgrade(run, "damage"), "damage");
  assert.equal(effectText(damage, damage.after), "27.6");
  const crit = row(previewUpgrade(run, "crit"), "crit");
  assert.equal(effectText(crit, crit.after), "20%");
});
