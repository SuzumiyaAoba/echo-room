import { ENEMIES } from "./content.js";
import { angleTo, clamp, distance, TAU } from "./math.js";
import { advanceMemoryWard } from "./memory-ward.js";

export const FERRYMAN_CHARGE = Object.freeze({ speed: 180, seconds: 0.75 });

function prepare(game, e) {
  const p = game.player,
    phase = e.phase;
  e.attack = (e.attack || 0) + 1;
  const beat = (e.attack - 1) % 3;
  e.angle = angleTo(e, p);
  const plan = { angles: [], windup: 0.85, speed: 70, kind: "shots" };
  if (e.kind === "ferryman") {
    if (beat === 2) {
      Object.assign(plan, {
        name: "渡し守の一歩",
        hint: "線の外へ · 突進のあとに隙",
        kind: "charge",
        windup: 1,
      });
    } else if (beat === 0) {
      Object.assign(plan, {
        name: "船灯の輪",
        hint: "灯りの隙間を抜ける",
        speed: phase ? 82 : 65,
      });
      const count = 12 + phase * 4;
      plan.angles = Array.from(
        { length: count },
        (_, i) => (i * TAU) / count + e.attack * 0.2,
      );
    } else {
      Object.assign(plan, {
        name: "潮の扇",
        hint: "狙われた場所から離れる",
        speed: 95,
      });
      plan.angles = Array.from(
        { length: 5 + phase * 2 },
        (_, i) => e.angle + (i - (4 + phase * 2) / 2) * 0.2,
      );
    }
  } else if (e.kind === "gardener") {
    if (beat === 0) {
      Object.assign(plan, {
        name: "帰れない春",
        hint: "芽から離れる · 光糸と解放で摘める",
        windup: 1.25,
      });
      const count = 4 + phase * 2;
      for (let i = 0; i < count; i++) {
        const a = (i * TAU) / count + e.attack,
          radius = i === 0 ? 0 : 36;
        game.hazards.push({
          kind: "bloom",
          x: clamp(p.x + Math.cos(a) * radius, 44, 436),
          y: clamp(p.y + Math.sin(a) * radius, 46, 260),
          r: 20,
          age: 0,
          duration: plan.windup + 0.35,
          damage: ENEMIES[e.kind].damage,
          weavable: true,
          charge: 0,
        });
      }
    } else if (beat === 1) {
      Object.assign(plan, {
        name: "硝子の花冠",
        hint: "花弁の間に立つ",
        speed: 65 + phase * 12,
      });
      const count = 8 + phase * 4;
      plan.angles = Array.from(
        { length: count },
        (_, i) => (i * TAU) / count + e.attack * 0.25,
      );
    } else {
      Object.assign(plan, {
        name: "種の子守歌",
        hint: "扇の外へ · 小さな蛾を優先",
        speed: 76,
        summon: "moth",
      });
      plan.angles = Array.from(
        { length: 6 },
        (_, i) => e.angle + (i - 2.5) * 0.24,
      );
    }
  } else if (beat === 2) {
    Object.assign(plan, {
      name: "昨日の断層",
      hint: phase ? "交差する線の外へ" : "線の外へ · 回避で越える",
      windup: 1.2,
    });
    game.hazards.push({
      kind: "line",
      axis: "h",
      x: p.x,
      y: clamp(p.y, 50, 258),
      r: 7,
      age: 0,
      duration: plan.windup + 0.35,
      damage: 18,
    });
    if (phase)
      game.hazards.push({
        kind: "line",
        axis: "v",
        x: clamp(p.x, 52, 428),
        y: p.y,
        r: 7,
        age: 0,
        duration: plan.windup + 0.35,
        damage: 18,
      });
  } else if (beat === 0) {
    Object.assign(plan, {
      name: "戻らない時計",
      hint: "輪の隙間へ · 盾には光糸",
      speed: 62 + phase * 18,
    });
    const count = 10 + phase * 4;
    plan.angles = Array.from(
      { length: count },
      (_, i) => (i * TAU) / count + e.attack * 0.4,
    );
  } else {
    Object.assign(plan, {
      name: "忘却の針",
      hint: "狙いが定まったら横へ",
      speed: 100,
      summon: game.run.difficulty > 0 ? "weaver" : null,
    });
    plan.angles = Array.from(
      { length: 5 + phase * 2 },
      (_, i) => e.angle + (i - (4 + phase * 2) / 2) * 0.17,
    );
  }
  e.plan = plan;
  e.state = "windup";
  e.timer = plan.windup;
  game.sound("warning");
}

function execute(game, e) {
  const plan = e.plan,
    data = ENEMIES[e.kind];
  if (plan.kind === "charge") {
    e.state = "charge";
    e.timer = FERRYMAN_CHARGE.seconds;
    game.sound("charge");
    return;
  }
  for (const angle of plan.angles)
    game.makeBullet(e, angle, data.damage, plan.speed, false, data.color);
  if (plan.summon && game.enemies.length < (e.kind === "gardener" ? 5 : 4)) {
    game.spawn(
      plan.summon,
      clamp(e.x + (e.x < 240 ? 38 : -38), 48, 430),
      clamp(e.y + 32, 48, 252),
    );
  }
  if (plan.angles.length) game.sound("enemyshoot");
  e.state = "recover";
  e.timer = (e.kind === "gardener" ? 1.6 : 1.25) - e.phase * 0.2;
}

export function updateBoss(game, e, dt) {
  const p = game.player,
    data = ENEMIES[e.kind];
  const phase = e.hp < e.maxHp * 0.5 ? 1 : 0;
  if (e.kind === "heart") advanceMemoryWard(e, dt);
  else e.ward = false;
  if (phase > e.phase) {
    e.phase = phase;
    game.label(e.x, e.y - 28, "第二楽章", "#efd395");
    game.sound("warning");
    game.shake = 4;
  }
  if (e.state === "windup") {
    if (e.timer <= 0) execute(game, e);
  } else if (e.state === "charge") {
    const old = { x: e.x, y: e.y };
    game.move(
      e,
      Math.cos(e.angle) * FERRYMAN_CHARGE.speed * dt,
      Math.sin(e.angle) * FERRYMAN_CHARGE.speed * dt,
    );
    if (e.timer <= 0 || distance(old, e) < 0.2) {
      e.state = "recover";
      e.timer = 1.35;
      game.shake = 3;
      game.effect(e.x, e.y, "burst", data.color, 12);
    }
  } else {
    e.angle = angleTo(e, p);
    if (e.state === "recover") {
      if (e.timer <= 0) {
        e.state = "move";
        e.timer = 0.35;
      }
    } else {
      const preferred = e.kind === "heart" ? 115 : 80;
      if (distance(e, p) > preferred)
        game.move(
          e,
          Math.cos(e.angle) * data.speed * dt,
          Math.sin(e.angle) * data.speed * dt,
        );
      if (e.timer <= 0) prepare(game, e);
    }
  }
  if (distance(e, p) < e.r + p.r && e.contactCd === 0) {
    game.hurt(data.damage, e);
    e.contactCd = 0.8;
  }
}
