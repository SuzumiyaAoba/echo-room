import { ENEMIES } from "../../../src/content.js";
import { stealEcho } from "../../../src/stolen-echo.js";
import {
  angleTo,
  distance,
  segmentDistance,
  segmentPairDistance,
} from "../../../src/math.js";

const alive = (h) =>
  !h.cancelled && h.age < h.duration && h.a.hp > 0 && h.b.hp > 0;
export function enemyCord(game, enemy) {
  return game.hazards.find(
    (h) =>
      h.kind === "cord" &&
      alive(h) &&
      (h.a.id === enemy.id || h.b.id === enemy.id),
  );
}
export function cordProtects(game, enemy) {
  const h = enemyCord(game, enemy);
  return !!h && h.b.id === enemy.id && h.age >= h.warning;
}
export function lineClear(game, a, b) {
  const steps = Math.ceil(distance(a, b) / 8);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (game.solid(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 2))
      return false;
  }
  return true;
}
export function updateShooter(game, e, dt, speed) {
  if (e.state === "recover") {
    if (e.timer <= 0) {
      e.state = "move";
      e.timer = 0.85;
    }
    return;
  }
  if (e.state === "windup") {
    if (e.timer <= 0) {
      for (const angle of e.shotAngles)
        game.makeBullet(
          e,
          angle,
          ENEMIES.shooter.damage,
          100,
          false,
          "#f3a985",
        );
      e.state = "move";
      e.timer = 1.98 - game.run.difficulty * 0.2;
      e.shotAngles = null;
      game.sound("enemyshoot");
    }
    return;
  }
  const d = distance(e, game.player);
  e.angle = angleTo(e, game.player);
  if (d < 90)
    game.move(
      e,
      -Math.cos(e.angle) * speed * dt,
      -Math.sin(e.angle) * speed * dt,
    );
  else if (d > 155)
    game.move(
      e,
      Math.cos(e.angle) * speed * dt,
      Math.sin(e.angle) * speed * dt,
    );
  if (e.timer <= 0) {
    e.state = "windup";
    e.timer = 0.62;
    e.shotAngles = [-0.2, 0, 0.2].map((spread) => e.angle + spread);
    game.sound("warning");
  }
}
export function updateShield(game, e, dt, speed) {
  if (e.state === "recover") {
    if (e.timer <= 0) e.state = "move";
    else return;
  }
  const allies = game.enemies.filter(
    (n) =>
      n !== e &&
      n.hp > 0 &&
      ["shooter", "weaver"].includes(n.kind) &&
      distance(n, e) < 170,
  );
  const ally = allies.sort((a, b) => distance(a, e) - distance(b, e))[0];
  let target = game.player;
  if (ally) {
    const toward = angleTo(ally, game.player);
    target = {
      x: ally.x + Math.cos(toward) * 30,
      y: ally.y + Math.sin(toward) * 30,
    };
    e.protecting = ally.id;
  } else e.protecting = null;
  e.angle = angleTo(e, game.player);
  if (distance(e, target) > 5) {
    const a = angleTo(e, target);
    game.move(e, Math.cos(a) * speed * dt, Math.sin(a) * speed * dt);
  }
}
export function updateWeaver(game, e, dt, speed) {
  if (enemyCord(game, e)) return;
  if (
    game.hazards.some(
      (h) =>
        h.kind === "stolenEcho" &&
        h.owner === e &&
        !h.cancelled &&
        h.age < h.duration,
    )
  )
    return;
  if (e.state === "weave" || e.state === "steal") {
    e.state = "recover";
    e.timer = 0.55;
  }
  if (e.state === "recover") {
    if (e.timer <= 0) {
      e.state = "move";
      e.timer = 1.6;
    }
    return;
  }
  e.angle = angleTo(e, game.player);
  game.move(
    e,
    Math.cos(e.angle + Math.PI / 2) * speed * dt,
    Math.sin(e.angle + Math.PI / 2) * speed * dt,
  );
  if (e.timer > 0) return;
  const partner = game.enemies
    .filter(
      (n) =>
        n !== e &&
        n.hp > 0 &&
        ["shooter", "shield"].includes(n.kind) &&
        !enemyCord(game, n) &&
        distance(e, n) >= 55 &&
        distance(e, n) <= 210 &&
        lineClear(game, e, n),
    )
    .sort(
      (a, b) =>
        Number(a.kind !== "shooter") - Number(b.kind !== "shooter") ||
        distance(a, e) - distance(b, e),
    )[0];
  if (partner) {
    game.hazards.push({
      kind: "cord",
      a: e,
      b: partner,
      x: (e.x + partner.x) / 2,
      y: (e.y + partner.y) / 2,
      r: 3,
      age: 0,
      warning: 0.85,
      duration: 2.05,
      damage: ENEMIES.weaver.damage,
      charge: 0,
    });
    e.state = "weave";
    e.timer = 2.05;
    if (!game.run.cordCuts && !game.cordAnnounced) {
      game.cordAnnounced = true;
      game.onEvent("cord");
    }
  } else {
    if (!stealEcho(game, e)) e.timer = 0.5;
    return;
  }
  game.sound("warning");
}
export function cutCord(game, h, source = "thread") {
  if (h.cancelled) return false;
  h.cancelled = true;
  game.run.cordCuts = (game.run.cordCuts || 0) + 1;
  for (const enemy of [h.a, h.b]) {
    enemy.slow = 0.8;
    game.damageEnemy(enemy, enemy === h.a ? 16 : 12, source);
    if (enemy.hp > 0) {
      enemy.state = "recover";
      enemy.timer = 0.65;
      enemy.shotAngles = null;
    }
  }
  game.effect(h.x, h.y, "burst", "#b8f2d7", 18);
  game.label(h.x, h.y - 7, "ほどいた", "#b8f2d7");
  game.sound("unweave");
  if (game.run.cordCuts === 1) game.onEvent("cordcut");
  return true;
}
export function updateCord(game, h, dt, threads) {
  if (h.cancelled || h.age >= h.duration) return;
  h.x = (h.a.x + h.b.x) / 2;
  h.y = (h.a.y + h.b.y) / 2;
  if (h.a.hp <= 0 || h.b.hp <= 0) {
    h.cancelled = true;
    game.effect(h.x, h.y, "echo", "#be9fba", 8);
    return;
  }
  const crossed = threads.some(
    ([a, b]) =>
      distance(a, b) > 20 &&
      segmentPairDistance(a, b, h.a, h.b) < game.stats.threadWidth + h.r,
  );
  h.charge = Math.max(0, h.charge + (crossed ? dt : -dt * 0.7));
  if (h.charge >= 0.2 - 1e-8) {
    cutCord(game, h);
    return;
  }
  if (
    h.age >= h.warning &&
    h.age < h.duration &&
    segmentDistance(game.player, h.a, h.b) < game.player.r + h.r
  )
    game.hurt(h.damage, h);
}
export function releaseCords(game, echo, radius) {
  for (const h of game.hazards)
    if (
      h.kind === "cord" &&
      alive(h) &&
      segmentDistance(echo, h.a, h.b) < radius
    )
      cutCord(game, h, "burst");
}
