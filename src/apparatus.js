import { roomFeature } from "./content.js";
import { clamp, distance, angleTo, segmentDistance, TAU } from "./math.js";

// The same light thread repairs all three machines, with different combat uses.
export function createApparatus(game) {
  const feature = roomFeature(game.run.stage);
  if (!feature) return null;
  const restored = game.run.repairs?.includes(game.run.stage) || false;
  const objects = [
    { x: 120, y: 104 },
    { x: 360, y: 184 },
  ].map((pos, index) => {
    // Reserve a walkable patch so every seeded layout can be woven through.
    for (let y = 1; y < game.tiles.length - 1; y++)
      for (let x = 1; x < game.tiles[y].length - 1; x++)
        if (Math.hypot(24 + x * 16 - pos.x, 24 + y * 16 - pos.y) < 32)
          game.tiles[y][x] = 0;
    return {
      ...pos,
      charge: restored ? feature.charge : 0,
      lit: restored,
      timer: 2.5 + index * 1.8,
    };
  });
  return {
    ...feature,
    objects,
    restored,
    heat: 0.15,
    cycle: 0,
    warning: 0,
    wave: null,
  };
}

export function updateApparatus(game, dt) {
  const machine = game.apparatus;
  if (!machine) return;
  const segments = game.threads();
  let cooling = 0;
  for (const node of machine.objects) {
    node.woven = segments.some(
      ([a, b]) => distance(a, b) > 20 && segmentDistance(node, a, b) < 14,
    );
    if (node.woven) cooling += 0.45;
    node.charge = clamp(
      node.charge + (node.woven ? dt : -dt * 0.12),
      0,
      machine.charge,
    );
    if (!node.lit && node.charge >= machine.charge) {
      node.lit = true;
      game.effect(node.x, node.y, "burst", "#b5f4d6", 22);
      game.sound("heal");
      game.label(
        node.x,
        node.y - 18,
        machine.kind === "garden" ? "開花" : "点灯",
        "#b5f4d6",
      );
    }
    if (node.lit) node.charge = machine.charge;
  }
  if (!machine.restored && machine.objects.every((node) => node.lit)) {
    machine.restored = true;
    (game.run.repairs ||= []).push(game.run.stage);
    game.run.memory += 3;
    game.run.scrap += 8;
    game.onEvent("apparatus", machine.name);
  }
  if (game.mode !== "combat") {
    machine.wave = null;
    machine.warning = 0;
    return;
  }
  if (machine.kind === "tide") {
    machine.cycle += dt;
    if (machine.wave) {
      const wave = machine.wave;
      wave.age += dt;
      wave.y = 44 + (wave.age / 3.2) * 220;
      const safe = machine.objects.some(
        (node) => node.lit && Math.abs(game.player.x - node.x) < 32,
      );
      if (
        !wave.hit &&
        !safe &&
        Math.abs(game.player.y - wave.y) < game.player.r + 7
      ) {
        const hp = game.run.hp;
        game.hurt(8, { x: game.player.x, y: wave.y - 20, kind: "tide" });
        // Passing through during invulnerability is a successful dodge too.
        wave.hit = game.run.hp !== hp || game.player.invulnerable > 0;
      }
      if (wave.age >= 3.2) machine.wave = null;
    } else if (machine.cycle >= 6.5) {
      machine.cycle = 0;
      machine.warning = 1.4;
      game.sound("warning");
    }
    if (machine.warning > 0) {
      machine.warning -= dt;
      if (machine.warning <= 0) machine.wave = { age: 0, y: 44, hit: false };
    }
  } else if (machine.kind === "garden") {
    for (const node of machine.objects) {
      node.timer -= dt;
      if (node.timer > 0) continue;
      if (node.lit) {
        const target = game.enemies.reduce(
          (best, e) =>
            !best || distance(node, e) < distance(node, best) ? e : best,
          null,
        );
        if (target) {
          game.makeBullet(
            node,
            angleTo(node, target),
            14,
            180,
            true,
            "#c5efc7",
            0,
            true,
          );
          game.effect(node.x, node.y, "muzzle", "#c5efc7", 3);
        }
        node.timer = 1.35;
      } else {
        for (let i = 0; i < 5; i++)
          game.makeBullet(
            node,
            (i * TAU) / 5 + game.roomTime * 0.2,
            7,
            52,
            false,
            "#cea4d7",
          );
        node.timer = 4.6;
        game.sound("enemyshoot");
      }
    }
  } else {
    const passive =
      0.05 + machine.objects.filter((node) => node.lit).length * 0.065;
    machine.heat = clamp(machine.heat - (passive + cooling) * dt, 0, 1);
    if (machine.warning > 0) {
      machine.warning -= dt;
      // Weaving or releasing can interrupt an imminent pressure burst.
      if (machine.heat < 0.72) machine.warning = 0;
      else if (machine.warning <= 0) {
        for (const node of machine.objects)
          for (let i = 0; i < 8; i++)
            game.makeBullet(
              node,
              (i * TAU) / 8 + 0.2,
              10,
              75,
              false,
              "#f4b07d",
            );
        machine.heat = 0.3;
        game.effect(240, 150, "burst", "#f4b07d", 20);
        game.sound("impact");
        game.shake = 3;
      }
    } else if (machine.heat >= 0.98) {
      machine.warning = 1.25;
      game.sound("warning");
    }
  }
}

export function ventApparatus(game, echo, radius) {
  const machine = game.apparatus;
  if (
    machine?.kind === "furnace" &&
    machine.objects.some((node) => distance(node, echo) < radius + 12)
  )
    machine.heat = Math.max(0, machine.heat - 0.45);
}
