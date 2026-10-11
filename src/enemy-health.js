import { ENEMIES } from "./content.js";
import { clamp } from "./math.js";

export const HEALTH_HOLD_SECONDS = 0.18;
export const HEALTH_SETTLE_SECONDS = 0.35;

const eligible = (enemy) =>
  enemy &&
  !ENEMIES[enemy.kind]?.boss &&
  Number.isFinite(enemy.hp) &&
  Number.isFinite(enemy.maxHp) &&
  enemy.hp > 0 &&
  enemy.maxHp > 0;

function trailHp(record, time) {
  const progress = clamp(
    (time - record.changedAt - HEALTH_HOLD_SECONDS) / HEALTH_SETTLE_SECONDS,
    0,
    1,
  );
  return record.hp + (record.from - record.hp) * (1 - progress);
}

// Rendering owns these short-lived observations. Enemy health, the combat
// clock, the saved run and the random generator are never changed here.
export class EnemyHealthFeedback {
  constructor() {
    this.game = null;
    this.time = 0;
    this.records = new Map();
  }
  observe(game) {
    if (game !== this.game || !game || game.t < this.time) {
      this.records.clear();
      this.game = game;
    }
    if (!game || !Number.isFinite(game.t)) {
      this.records.clear();
      return;
    }
    this.time = game.t;
    const alive = new Set();
    for (const enemy of game.enemies) {
      if (!eligible(enemy)) continue;
      alive.add(enemy.id);
      const previous = this.records.get(enemy.id);
      if (
        !previous ||
        previous.enemy !== enemy ||
        previous.maxHp !== enemy.maxHp ||
        enemy.hp > previous.hp
      ) {
        this.records.set(enemy.id, {
          enemy,
          hp: enemy.hp,
          maxHp: enemy.maxHp,
          from: enemy.hp,
          changedAt: game.t,
        });
      } else if (enemy.hp < previous.hp) {
        this.records.set(enemy.id, {
          enemy,
          hp: enemy.hp,
          maxHp: enemy.maxHp,
          from: Math.max(previous.hp, trailHp(previous, game.t)),
          changedAt: game.t,
        });
      }
    }
    for (const id of this.records.keys())
      if (!alive.has(id)) this.records.delete(id);
  }
  read(enemy) {
    if (!eligible(enemy) || enemy.hp >= enemy.maxHp) return null;
    const record = this.records.get(enemy.id);
    const fraction = clamp(enemy.hp / enemy.maxHp, 0, 1);
    const trail =
      record?.hp === enemy.hp && record.maxHp === enemy.maxHp
        ? trailHp(record, this.time)
        : enemy.hp;
    return {
      fraction,
      trailFraction: clamp(trail / enemy.maxHp, fraction, 1),
      low: fraction <= 0.25,
      elite: !!enemy.elite,
    };
  }
}
