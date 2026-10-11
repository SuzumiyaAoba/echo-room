import {
  Random,
  clamp,
  distance,
  angleTo,
  segmentDistance,
  pointInTriangle,
  TAU,
} from "../../../src/math.js";
import {
  BIOMES,
  ENEMIES,
  WEAPONS,
  UPGRADES,
  CATALOG_VERSION,
  catalogUpgrades,
  ROOM_LAYOUTS,
  stats,
  rank,
  actIndex,
  roomIndex,
  isBoss,
  isCamp,
  isElite,
} from "../../../src/content.js";
import {
  createApparatus,
  updateApparatus,
  ventApparatus,
} from "../../../src/apparatus.js";
import { updateBoss } from "../../../src/bosses.js";
import { openMemoryWard, weaveMemoryWard } from "../../../src/memory-ward.js";
import { advanceImpact, recordImpact } from "../../../src/combat-feedback.js";
import { advanceDefeats, recordDefeat } from "../../../src/defeat-weave.js";
import { selectStory } from "../../../src/story.js";
import { rewardPlan, rewardRerollState } from "../../../src/rewards.js";
import {
  traderStock,
  traderPrice,
  TRADER_HEAL_PRICE,
  TRADER_HEAL_AMOUNT,
} from "../../../src/trader.js";
import {
  updateStolenEcho,
  releaseStolenEchoes,
} from "../../../src/stolen-echo.js";
import { shotEvents, refractShot } from "../../../src/shot-path.js";
import {
  threadGuardSegments,
  unravelThreadBullet,
} from "../../../src/thread-guard.js";
import { releaseStoredLights } from "../../../src/counter-thread.js";
import { takeNeedleMark, recordNeedleHit } from "../../../src/needle-stitch.js";
import {
  enemyCord,
  cordProtects,
  updateShooter,
  updateShield,
  updateWeaver,
  updateCord,
  releaseCords,
} from "./enemy-patterns.js";

export const WIDTH = 480,
  HEIGHT = 300,
  TILE = 16,
  COLS = 28,
  ROWS = 17;
export function createRun(
  seed,
  weapon = "needle",
  relic = "spool",
  difficulty = 0,
) {
  return {
    seed,
    catalogVersion: CATALOG_VERSION,
    weapon,
    relic,
    difficulty,
    stage: 0,
    route: "loom",
    hp: 100,
    maxHp: 100,
    scrap: 0,
    memory: 0,
    kills: 0,
    time: 0,
    upgrades: {},
    rewardRoll: 0,
    bosses: [],
    beacons: [],
    repairs: [],
    journal: [],
    startingFragment: null,
    damageTaken: 0,
    echoesCast: 0,
    threadKills: 0,
    threadCuts: 0,
    threadReturns: 0,
    cordCuts: 0,
    memoryCuts: 0,
    prismSplits: 0,
    needleStitches: 0,
  };
}
export class Game {
  constructor(run, onEvent = () => {}) {
    this.run = run;
    this.onEvent = onEvent;
    this.rng = new Random(`${run.seed}:${run.stage}`);
    this.mode = "combat";
    this.t = 0;
    this.roomTime = 0;
    this.roomKills = 0;
    this.player = {
      x: 240,
      y: 235,
      r: 5,
      angle: -Math.PI / 2,
      invulnerable: 0,
      dash: 0,
      dashCd: 0,
      dashSerial: 0,
      echoCd: 0,
      fireCd: 0,
      dx: 0,
      dy: -1,
      walk: 0,
      moving: false,
      shield: !!rank(run, "shield"),
      revived: false,
    };
    this.enemies = [];
    this.bullets = [];
    this.echoes = [];
    this.history = [];
    this.particles = [];
    this.labels = [];
    this.hazards = [];
    this.pickups = [];
    this.shake = 0;
    this.flash = 0;
    this.flashColor = "#d5ebd2";
    this.hitCue = null;
    this.defeats = [];
    this.clearTimer = 0;
    this.spawnQueue = [];
    this.boss = null;
    this.stats = stats(run);
    this.player.echoCharges = this.stats.echoes;
    this.tiles = this.makeRoom();
    this.apparatus = createApparatus(this);
    this.beacon = [3, 4].includes(roomIndex(run.stage))
      ? {
          x: 240,
          y: 156,
          charge: 0,
          max: 2.2,
          lit: run.beacons?.includes(run.stage) || false,
        }
      : null;
    this.event = selectStory(run, this.rng.next());
    if (isCamp(run.stage)) {
      this.mode = "event";
    } else this.populate();
  }
  get biome() {
    return BIOMES[actIndex(this.run.stage)];
  }
  makeRoom() {
    const map = Array.from({ length: ROWS }, (_, y) =>
      Array.from({ length: COLS }, (_, x) =>
        x === 0 || x === COLS - 1 || y === 0 || y === ROWS - 1 ? 1 : 0,
      ),
    );
    this.layout =
      this.run.stage === 0 ? ROOM_LAYOUTS[0] : this.rng.pick(ROOM_LAYOUTS);
    if (!isBoss(this.run.stage) && !isCamp(this.run.stage)) {
      for (const [x, y] of this.layout.blocks) {
        map[y][x] = 2;
        map[y][x + 1] = 2;
        map[y + 1][x] = 2;
        map[y + 1][x + 1] = 2;
      }
    }
    map[0][13] = 3;
    map[0][14] = 3;
    return map;
  }
  solid(x, y, r = 0) {
    const gx = Math.floor((x - 16) / 16),
      gy = Math.floor((y - 16) / 16);
    for (
      let cy = Math.floor((y - r - 16) / 16);
      cy <= Math.floor((y + r - 16) / 16);
      cy++
    )
      for (
        let cx = Math.floor((x - r - 16) / 16);
        cx <= Math.floor((x + r - 16) / 16);
        cx++
      ) {
        const v = this.tiles[cy]?.[cx];
        if (v === undefined || v === 1 || v === 2 || v === 3) {
          const px = clamp(x, 16 + cx * 16, 32 + cx * 16),
            py = clamp(y, 16 + cy * 16, 32 + cy * 16);
          if (
            Math.hypot(x - px, y - py) < r ||
            (r === 0 && cx === gx && cy === gy)
          )
            return true;
        }
      }
    return false;
  }
  move(body, dx, dy) {
    if (!this.solid(body.x + dx, body.y, body.r)) body.x += dx;
    if (!this.solid(body.x, body.y + dy, body.r)) body.y += dy;
  }
  populate() {
    const act = actIndex(this.run.stage),
      boss = isBoss(this.run.stage);
    if (boss) {
      this.spawnQueue.push({
        kind: this.biome.boss,
        x: 240,
        y: 100,
        time: 1.6,
      });
    } else {
      const pool =
        act === 0
          ? ["crawler", "crawler", "shooter", "charger"]
          : act === 1
            ? ["moth", "shooter", "shield", "crawler", "weaver"]
            : ["charger", "shield", "weaver", "moth", "shooter"];
      const room = roomIndex(this.run.stage);
      const total =
        7 +
        act * 3 +
        Math.floor(room / 2) +
        this.run.difficulty * 2 +
        (isElite(this.run.stage) ? 4 : 0) +
        (this.run.route === "salvage" ? 3 : 0) -
        (this.run.route === "rest" ? 3 : 0);
      const positions = this.rng.shuffle([
        { x: 70, y: 65 },
        { x: 410, y: 65 },
        { x: 240, y: 65 },
        { x: 75, y: 160 },
        { x: 405, y: 160 },
        { x: 150, y: 85 },
        { x: 330, y: 85 },
        { x: 110, y: 195 },
        { x: 370, y: 195 },
      ]);
      const formation = act > 0 && [1, 4, 6].includes(room);
      const right = positions[0].x > 240;
      for (let i = 0; i < total; i++) {
        let pos = positions[i % positions.length];
        let kind = i === 0 && act === 0 ? "crawler" : this.rng.pick(pool);
        if (formation && i < 3) {
          kind = ["weaver", "shooter", "shield"][i];
          pos = { x: (right ? [370, 230, 300] : [110, 250, 180])[i], y: 65 };
        }
        if (this.solid(pos.x, pos.y, 10)) pos = { x: 240, y: 90 };
        this.spawnQueue.push({
          kind,
          ...pos,
          time: 1.1 + Math.floor(i / 4) * 4.5 + (i % 4) * 0.28,
          elite: isElite(this.run.stage) && i === 0,
        });
      }
    }
  }
  spawn(kind, x, y, elite = false) {
    const data = ENEMIES[kind],
      act = actIndex(this.run.stage);
    const hp =
      data.hp *
      (1 + this.run.difficulty * 0.3) *
      (data.boss ? 1 : 1 + act * 0.2) *
      (elite ? 2.5 : 1);
    const e = {
      id: `e${this.t}:${this.rng.next()}`,
      kind,
      x,
      y,
      r: data.radius + (elite ? 2 : 0),
      hp,
      maxHp: hp,
      angle: 0,
      timer: this.rng.next() * 1.4 + 0.8,
      state: "move",
      flash: 0,
      slow: 0,
      threadCd: 0,
      contactCd: 0,
      age: 0,
      phase: 0,
      elite,
    };
    this.enemies.push(e);
    this.effect(x, y, "spawn", data.color, 12);
    this.sound("spawn");
    if (data.boss) {
      this.boss = e;
      e.timer = 2.4;
      this.onEvent("boss", data.name);
    }
    return e;
  }
  update(dt, input = {}) {
    this.t += dt;
    advanceImpact(this, dt);
    advanceDefeats(this, dt);
    this.shake = Math.max(0, this.shake - dt * 18);
    this.flash = Math.max(0, this.flash - dt * 3);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.vx *= 0.97;
      p.vy *= 0.97;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const l of this.labels) {
      l.y -= dt * 9;
      l.life -= dt;
    }
    this.labels = this.labels.filter((l) => l.life > 0);
    if (!["combat", "cleared"].includes(this.mode)) return;
    this.roomTime += dt;
    this.run.time += dt;
    const p = this.player,
      s = this.stats;
    for (const key of ["invulnerable", "dashCd", "echoCd", "fireCd", "dash"])
      p[key] = Math.max(0, p[key] - dt);
    if (p.echoCharges < s.echoes && p.echoCd === 0) {
      p.echoCharges++;
      if (p.echoCharges < s.echoes) p.echoCd = s.echoCooldown;
    }
    let mx = input.mx || 0,
      my = input.my || 0;
    const length = Math.hypot(mx, my);
    if (length > 1) {
      mx /= length;
      my /= length;
    }
    if (length > 0.1) {
      p.dx = mx / (length || 1);
      p.dy = my / (length || 1);
    }
    if (Number.isFinite(input.angle)) p.angle = input.angle;
    if (input.autoAim && this.enemies.length) {
      const closest = this.enemies.reduce((a, b) =>
        distance(a, p) < distance(b, p) ? a : b,
      );
      p.angle = angleTo(p, closest);
    }
    if (input.dash && p.dashCd === 0) this.dash(mx, my);
    const beforeMove = { x: p.x, y: p.y };
    this.dashThreadOrigin = p.dash > 0 ? beforeMove : null;
    if (p.dash > 0) {
      this.move(p, p.dashX * 290 * dt, p.dashY * 290 * dt);
      if (Math.floor(this.t * 60) % 3 === 0)
        this.effect(p.x, p.y, "dash", "#9ce8d3", 2);
    } else this.move(p, mx * s.speed * dt, my * s.speed * dt);
    const travelled = distance(beforeMove, p);
    p.moving = travelled > 0.1;
    p.walk += travelled / 6;
    let fired = false;
    if (input.fire && p.fireCd === 0 && this.mode === "combat") {
      this.shoot(p, p.angle, false);
      p.fireCd = this.weapon.rate / s.fireRate;
      fired = true;
    }
    this.history.push({
      x: p.x,
      y: p.y,
      angle: p.angle,
      fire: fired,
      walk: p.walk,
      moving: p.moving,
    });
    if (this.history.length > 216) this.history.shift();
    if (input.echo && p.echoCharges > 0 && this.history.length >= 24)
      this.castEcho();
    if (input.burst && this.echoes.length) this.release();
    for (const e of this.echoes) {
      e.elapsed += dt;
      const idx = Math.min(
        e.frames.length - 1,
        Math.max(0, Math.floor(e.elapsed * 60 + 1e-6) - 1),
      );
      const f = e.frames[idx];
      e.x = f.x;
      e.y = f.y;
      e.angle = f.angle;
      e.walk = f.walk;
      e.moving = e.elapsed < e.frames.length / 60 && f.moving;
      for (let i = e.frame + 1; i <= idx; i++)
        if (e.frames[i].fire) this.shoot(e, e.frames[i].angle, true);
      e.frame = idx;
    }
    const expired = this.echoes.filter((e) => e.elapsed >= s.echoDuration);
    for (const e of expired) this.effect(e.x, e.y, "echo", "#71decd", 10);
    this.echoes = this.echoes.filter((e) => e.elapsed < s.echoDuration);
    while (this.spawnQueue[0]?.time <= this.roomTime) {
      const next = this.spawnQueue.shift();
      this.spawn(next.kind, next.x, next.y, next.elite);
    }
    if (this.mode === "combat") {
      for (const enemy of this.enemies) {
        this.updateEnemy(enemy, dt);
        if (this.mode === "dead") return;
      }
      this.updateThreads(dt);
      updateApparatus(this, dt);
      if (this.mode === "dead") return;
      this.updateBullets(dt);
      if (this.mode === "dead") return;
      this.updateHazards(dt);
      if (this.mode === "dead") return;
      if (
        this.mode === "combat" &&
        this.enemies.length === 0 &&
        this.spawnQueue.length === 0
      ) {
        this.clearTimer += dt;
        if (this.clearTimer > 0.8) {
          this.mode = "reward";
          this.bullets = [];
          this.hazards = [];
          this.echoes = [];
          this.sound("clear");
          this.onEvent("clear", this.run.route);
        }
      }
    } else if (this.mode === "cleared") {
      this.updateThreads(dt);
      updateApparatus(this, dt);
      this.updateBullets(dt);
      this.updateHazards(dt);
    }
    for (const item of this.pickups) {
      item.age += dt;
      if (distance(item, p) < (item.kind === "scrap" ? 45 : 13)) {
        if (item.kind === "scrap") {
          const a = angleTo(item, p);
          item.x += Math.cos(a) * 160 * dt;
          item.y += Math.sin(a) * 160 * dt;
        }
        if (distance(item, p) < 13) {
          item.collected = true;
          if (item.kind === "scrap") {
            this.run.scrap += item.amount;
            this.sound("coin");
          } else {
            this.heal(item.amount);
            this.sound("heal");
          }
        }
      }
    }
    this.pickups = this.pickups.filter((i) => !i.collected);
    if (
      input.interact &&
      this.mode === "cleared" &&
      distance(p, { x: 240, y: 43 }) < 32
    )
      this.onEvent("exit");
  }
  get weapon() {
    return WEAPONS.find((w) => w.id === this.run.weapon) || WEAPONS[0];
  }
  dash(mx, my) {
    const p = this.player,
      l = Math.hypot(mx, my);
    p.dashX = l > 0.1 ? mx / l : Math.cos(p.angle);
    p.dashY = l > 0.1 ? my / l : Math.sin(p.angle);
    p.dash = 0.19;
    p.dashSerial++;
    p.invulnerable = Math.max(p.invulnerable, 0.27);
    p.dashCd = this.stats.dashCooldown;
    this.effect(p.x, p.y, "dash", "#dceee4", 10);
    this.sound("dash");
    if (this.run.relic === "bell")
      this.bullets = this.bullets.filter(
        (b) => b.friendly || distance(b, p) > 38,
      );
    if (rank(this.run, "dashshot"))
      for (let i = 0; i < 8; i++)
        this.makeBullet(p, (i * TAU) / 8, 10, 180, true, "#a9e6cc", 0, false);
  }
  shoot(source, angle, echo) {
    const w = this.weapon,
      s = this.stats;
    for (let i = 0; i < w.shots; i++) {
      const critical = this.rng.next() < rank(this.run, "crit") * 0.2;
      const bullet = this.makeBullet(
        source,
        angle + (i - (w.shots - 1) / 2) * w.spread,
        w.damage * s.damage * (echo ? s.echoDamage : 1) * (critical ? 2 : 1),
        w.speed,
        true,
        echo ? "#75dcca" : critical ? "#fff1b9" : w.color,
        w.pierce + s.pierce,
        echo,
        critical,
      );
      bullet.life = w.life;
      bullet.prismatic = w.id === "prism";
      bullet.shortRange = w.id === "scatter";
      if (w.id === "needle") bullet.needle = true;
    }
    if (!echo) {
      if (this.apparatus?.kind === "furnace")
        this.apparatus.heat = Math.min(1, this.apparatus.heat + 0.05);
      this.effect(
        source.x + Math.cos(angle) * 8,
        source.y + Math.sin(angle) * 8,
        "muzzle",
        w.color,
        3,
      );
      this.sound(
        w.id === "prism" ? "prism" : w.shots > 1 ? "scatter" : "shoot",
      );
    }
  }
  makeBullet(
    source,
    angle,
    damage,
    speed,
    friendly,
    color,
    pierce = 0,
    echo = false,
    critical = false,
  ) {
    if (!friendly) speed *= 1 + this.run.difficulty * 0.13;
    const bullet = {
      x: source.x + Math.cos(angle) * (source.r || 4),
      y: source.y + Math.sin(angle) * (source.r || 4),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      angle,
      damage,
      friendly,
      color,
      pierce,
      echo,
      critical,
      r: friendly ? 2 : 3,
      life: friendly ? 1.8 : 4,
      hit: [],
      trail: friendly && this.run.weapon === "prism" ? 0.04 : 0.02,
      origin: { x: source.x, y: source.y },
    };
    this.bullets.push(bullet);
    return bullet;
  }
  castEcho() {
    const p = this.player;
    if (this.echoes.length >= this.stats.echoes) {
      const oldest = this.echoes.shift();
      this.effect(oldest.x, oldest.y, "echo", "#75dfca", 10);
    }
    const frames = this.history.map((f) => ({ ...f })),
      first = frames[0];
    this.echoes.push({
      x: first.x,
      y: first.y,
      r: 5,
      angle: first.angle,
      frames,
      frame: -1,
      elapsed: 0,
      returnStock: 0,
    });
    p.echoCharges--;
    if (p.echoCd === 0) p.echoCd = this.stats.echoCooldown;
    this.run.echoesCast++;
    this.effect(first.x, first.y, "echo", "#7dffe1", 24);
    this.shake = 2;
    this.sound("echo");
    if (rank(this.run, "resonance")) {
      this.bullets = this.bullets.filter(
        (b) => b.friendly || distance(b, p) > 80,
      );
      for (const e of [...this.enemies])
        if (distance(e, p) < 80) this.damageEnemy(e, 30, "echo");
      this.effect(p.x, p.y, "burst", "#9ff5e3", 30);
    }
  }
  threads() {
    const result = this.echoes.map((e) => [this.player, e]);
    if (rank(this.run, "triangle"))
      for (let a = 0; a < this.echoes.length; a++)
        for (let b = a + 1; b < this.echoes.length; b++)
          result.push([this.echoes[a], this.echoes[b]]);
    return result;
  }
  triangles() {
    if (!rank(this.run, "triangle")) return [];
    const result = [],
      p = this.player;
    for (let i = 0; i < this.echoes.length; i++)
      for (let j = i + 1; j < this.echoes.length; j++) {
        const a = this.echoes[i],
          b = this.echoes[j];
        if (
          Math.abs((a.x - p.x) * (b.y - p.y) - (a.y - p.y) * (b.x - p.x)) > 120
        )
          result.push([p, a, b]);
      }
    return result;
  }
  threadGuards() {
    return threadGuardSegments(this);
  }
  guardBullet(bullet, guard) {
    return unravelThreadBullet(this, bullet, guard);
  }
  updateThreads(dt) {
    if (this.mode === "dead") return;
    const segments = this.threads(),
      triangles = this.triangles(),
      s = this.stats;
    if (this.beacon && !this.beacon.lit) {
      const beacon = this.beacon;
      const weaving = segments.some(
        ([a, b]) => distance(a, b) > 20 && segmentDistance(beacon, a, b) < 12,
      );
      beacon.charge = clamp(
        beacon.charge + (weaving ? dt : -dt * 0.15),
        0,
        beacon.max,
      );
      if (beacon.charge >= beacon.max) {
        beacon.lit = true;
        this.run.memory += 4;
        (this.run.beacons ||= []).push(this.run.stage);
        this.heal(12);
        this.effect(beacon.x, beacon.y, "burst", "#e9d79d", 30);
        this.sound("heal");
        this.onEvent("beacon");
      }
    }
    for (const e of [...this.enemies]) {
      if (e.kind === "heart")
        weaveMemoryWard(
          this,
          e,
          dt,
          segments.some(
            ([a, b]) =>
              distance(a, b) > 20 &&
              segmentDistance(e, a, b) < e.r + s.threadWidth,
          ) || triangles.some(([a, b, c]) => pointInTriangle(e, a, b, c)),
        );
      e.threadCd = Math.max(0, e.threadCd - dt);
      const touching =
        !e.threadCd &&
        segments.some(
          ([a, b]) =>
            distance(a, b) > 10 &&
            segmentDistance(e, a, b) < e.r + s.threadWidth,
        );
      const sweep = this.dashThreadOrigin;
      const dashHit =
        rank(this.run, "dashthread") &&
        this.player.dash > 0 &&
        e.dashThreadHit !== this.player.dashSerial &&
        this.echoes.some((echo) => {
          const current =
            distance(this.player, echo) > 10 &&
            segmentDistance(e, this.player, echo) < e.r + s.threadWidth;
          const swept =
            sweep &&
            distance(sweep, echo) > 10 &&
            (segmentDistance(e, sweep, echo) < e.r + s.threadWidth ||
              pointInTriangle(e, sweep, this.player, echo));
          return current || swept;
        });
      if (dashHit || touching) {
        const boost = dashHit ? 3 : 1;
        if (dashHit) e.dashThreadHit = this.player.dashSerial;
        this.damageEnemy(e, s.thread * 0.22 * boost, "thread");
        e.threadCd = 0.22;
        if (rank(this.run, "thread")) e.slow = 0.5;
        this.effect(e.x, e.y, "spark", "#a8f2dd", dashHit ? 8 : 2);
        if (dashHit) {
          this.label(e.x, e.y - e.r - 5, "織り撃ち", "#f4e4aa");
          this.sound("unweave");
        }
      }
      if (
        e.threadCd === 0 &&
        triangles.some(([a, b, c]) => pointInTriangle(e, a, b, c))
      ) {
        this.damageEnemy(e, s.thread * 0.15, "thread");
        e.threadCd = 0.22;
      }
    }
  }
  release() {
    const s = this.stats;
    const killsBefore = this.run.kills;
    let erased = 0;
    for (const echo of this.echoes) {
      ventApparatus(this, echo, s.burstRadius);
      this.effect(echo.x, echo.y, "burst", "#c5fff0", 35);
      this.hazards.push({
        kind: "pulse",
        x: echo.x,
        y: echo.y,
        r: s.burstRadius,
        age: 0,
        duration: 0.4,
        friendly: true,
      });
      for (const e of [...this.enemies])
        if (distance(e, echo) < s.burstRadius + e.r) {
          this.damageEnemy(e, s.burst, "burst");
          openMemoryWard(this, e);
        }
      for (const b of this.bullets)
        if (!b.friendly && b.life > 0 && distance(b, echo) < s.burstRadius) {
          b.life = 0;
          erased++;
        }
      for (const h of this.hazards)
        if (h.weavable && distance(h, echo) < s.burstRadius + h.r)
          h.cancelled = true;
      releaseCords(this, echo, s.burstRadius);
      releaseStolenEchoes(this, echo, s.burstRadius);
      releaseStoredLights(this, echo);
    }
    if (rank(this.run, "cascade"))
      for (let i = 0; i < Math.min(erased, 24); i++)
        this.makeBullet(
          this.player,
          (i * TAU) / Math.max(1, erased),
          14,
          210,
          true,
          "#a1e8cb",
          1,
          true,
        );
    if (rank(this.run, "refund"))
      this.player.echoCd = Math.max(
        0,
        this.player.echoCd - (this.run.kills - killsBefore),
      );
    this.echoes = [];
    this.shake = 5;
    this.flash = 0.25;
    this.flashColor = "#c5fff0";
    this.sound("burst");
  }
  updateEnemy(e, dt) {
    if (this.mode === "dead" || e.hp <= 0) return;
    const data = ENEMIES[e.kind],
      p = this.player,
      d = distance(e, p),
      a = angleTo(e, p);
    e.age += dt;
    e.timer -= dt;
    e.flash = Math.max(0, e.flash - dt);
    e.slow = Math.max(0, e.slow - dt);
    e.contactCd = Math.max(0, e.contactCd - dt);
    const bound = !!enemyCord(this, e);
    const speed =
      data.speed *
      (bound ? 0 : 1) *
      (e.slow > 0 ? 0.45 : 1) *
      (1 + this.run.difficulty * 0.12) *
      (e.elite ? 1.2 : 1);
    if (data.boss) {
      this.updateBoss(e, dt);
      return;
    }
    if (e.kind === "charger") {
      if (e.state === "charge") {
        const old = { x: e.x, y: e.y };
        this.move(
          e,
          Math.cos(e.angle) * 215 * dt,
          Math.sin(e.angle) * 215 * dt,
        );
        if (e.timer <= 0 || distance(old, e) < 0.5) {
          e.state = "recover";
          e.timer = 0.85;
          this.shake = 2;
        }
      } else if (e.state === "windup") {
        if (e.timer <= 0) {
          e.state = "charge";
          e.timer = 0.7;
          this.sound("charge");
        }
      } else if (e.state === "recover") {
        if (e.timer <= 0) {
          e.state = "move";
          e.timer = 1.1;
        }
      } else {
        this.move(e, Math.cos(a) * speed * dt, Math.sin(a) * speed * dt);
        e.angle = a;
        if (e.timer <= 0 && d < 220) {
          e.state = "windup";
          e.timer = 0.8;
          this.sound("warning");
        }
      }
    } else if (e.kind === "shooter") {
      updateShooter(this, e, dt, speed);
    } else if (e.kind === "shield") {
      updateShield(this, e, dt, speed);
    } else if (e.kind === "weaver") {
      updateWeaver(this, e, dt, speed);
    } else {
      const turn = e.kind === "moth" ? Math.sin(e.age * 4) * 0.85 : 0;
      e.angle = a;
      this.move(
        e,
        Math.cos(a + turn) * speed * dt,
        Math.sin(a + turn) * speed * dt,
      );
    }
    // Separation keeps a readable silhouette instead of a single stacked swarm.
    if (!bound)
      for (const other of this.enemies)
        if (
          other !== e &&
          !ENEMIES[other.kind].boss &&
          distance(e, other) < e.r + other.r - 1
        ) {
          const oa = angleTo(other, e);
          this.move(e, Math.cos(oa) * 14 * dt, Math.sin(oa) * 14 * dt);
        }
    if (d < e.r + p.r + 1 && e.contactCd === 0) {
      this.hurt(data.damage, e);
      e.contactCd = 0.8;
    }
  }
  updateBoss(e, dt) {
    updateBoss(this, e, dt);
  }
  updateBullets(dt) {
    const guards = this.threadGuards();
    // Rays born at a lens enter the next fixed frame; they cannot recursively
    // extend this iteration or receive a second full tick at birth.
    for (const b of [...this.bullets]) {
      if (this.mode === "dead") break;
      if (b.life <= 0) continue;
      const lifeBefore = b.life,
        travelledTime = Math.min(dt, lifeBefore),
        from = { x: b.x, y: b.y };
      b.life -= travelledTime;
      if (b.echo && rank(this.run, "homing") && this.enemies.length) {
        const nearest = this.enemies.reduce((a, c) =>
          distance(a, b) < distance(c, b) ? a : c,
        );
        const a = angleTo(b, nearest),
          speed = Math.hypot(b.vx, b.vy);
        b.vx += (Math.cos(a) * speed - b.vx) * dt * 3;
        b.vy += (Math.sin(a) * speed - b.vy) * dt * 3;
        b.angle = Math.atan2(b.vy, b.vx);
      }
      const to = {
        x: b.x + b.vx * travelledTime,
        y: b.y + b.vy * travelledTime,
      };
      let stopped = false;
      for (const event of shotEvents(this, b, from, to, guards)) {
        if (this.mode === "dead") break;
        b.x = from.x + (to.x - from.x) * event.time;
        b.y = from.y + (to.y - from.y) * event.time;
        if (event.kind === "wall") {
          b.life = 0;
          stopped = true;
          this.effect(b.x, b.y, "spark", b.color, 2);
          break;
        }
        if (event.kind === "lens") {
          refractShot(this, b, lifeBefore - travelledTime * event.time);
        } else if (event.kind === "enemy") {
          const e = event.enemy;
          if (e.hp <= 0) continue;
          const stitch = takeNeedleMark(e, b, this.t);
          let damage = b.damage + stitch;
          if (e.ward) {
            damage *= b.echo ? 0.5 : 0.2;
            this.effect(b.x, b.y, "spark", "#b9d4cc", 3);
          }
          if (cordProtects(this, e)) {
            damage *= 0.65;
            this.effect(b.x, b.y, "spark", "#db9a9e", 2);
          }
          if (e.kind === "shield") {
            const dot = Math.cos(angleTo(e, b) - e.angle);
            if (dot > 0.3) {
              damage *= 0.25;
              this.label(e.x, e.y - 15, "GUARD", "#90bcb5");
            }
          }
          this.damageEnemy(
            e,
            damage,
            b.returnedLight ? "counter" : b.echo ? "echo" : "shot",
            b.critical,
          );
          recordNeedleHit(this, e, b, damage, stitch);
          b.hit.push(e.id);
          if (b.pierce <= 0) {
            b.life = 0;
            stopped = true;
            break;
          }
          b.pierce--;
        } else if (event.kind === "thread") {
          this.guardBullet(b, event.guard);
          stopped = true;
          break;
        } else if (event.kind === "player") {
          this.hurt(b.damage, b);
          b.life = 0;
          stopped = true;
          break;
        }
      }
      if (!stopped) Object.assign(b, to);
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }
  updateHazards(dt) {
    const segments = this.threads();
    for (const h of this.hazards) {
      if (this.mode === "dead") break;
      h.age += dt;
      if (h.kind === "cord") {
        updateCord(this, h, dt, segments);
        continue;
      }
      if (h.kind === "stolenEcho") {
        updateStolenEcho(this, h, dt, segments);
        continue;
      }
      if (h.friendly) continue;
      if (h.weavable && h.age < h.duration - 0.35) {
        const woven = segments.some(
          ([a, b]) => distance(a, b) > 20 && segmentDistance(h, a, b) < h.r,
        );
        h.charge = Math.max(0, h.charge + (woven ? dt : -dt * 0.2));
        if (h.charge >= 0.5) h.cancelled = true;
      }
      if (h.cancelled) {
        this.effect(h.x, h.y, "echo", "#c6edc6", 10);
        continue;
      }
      if (h.age > h.duration - 0.35 && !h.triggered) {
        h.triggered = true;
        this.effect(h.x, h.y, "burst", "#ef997f", 18);
        this.sound("impact");
        if (
          h.kind === "line"
            ? Math.abs(
                h.axis === "v" ? this.player.x - h.x : this.player.y - h.y,
              ) <
              h.r + this.player.r
            : distance(h, this.player) < h.r + this.player.r
        )
          this.hurt(h.damage, h);
      }
    }
    this.hazards = this.hazards.filter(
      (h) => !h.cancelled && h.age < h.duration,
    );
  }
  damageEnemy(e, damage, source, critical = false) {
    if (this.mode === "dead" || e.hp <= 0) return;
    e.hp -= damage;
    e.flash = 0.1;
    if (source !== "thread")
      this.label(
        e.x + (this.rng.next() - 0.5) * 8,
        e.y - e.r - 4,
        String(Math.ceil(damage)),
        critical ? "#f5e6a9" : source === "burst" ? "#8cf1d7" : "#e5ded0",
      );
    if (e.hp <= 0) {
      this.run.kills++;
      this.roomKills++;
      if (source === "thread") {
        this.run.threadKills++;
        if (rank(this.run, "suture")) this.heal(2);
      }
      recordDefeat(this, e, source);
      this.effect(e.x, e.y, "death", ENEMIES[e.kind].color, 20);
      this.sound(ENEMIES[e.kind].boss ? "bossdeath" : "kill");
      this.pickups.push({
        x: e.x,
        y: e.y,
        kind: "scrap",
        amount: Math.round(
          ENEMIES[e.kind].reward *
            (1 + rank(this.run, "salvage") * 0.4) *
            (e.elite ? 3 : 1),
        ),
        age: 0,
      });
      if (!ENEMIES[e.kind].boss && this.rng.next() < 0.12)
        this.pickups.push({
          x: e.x + 7,
          y: e.y,
          kind: "heal",
          amount: 10,
          age: 0,
        });
      if (ENEMIES[e.kind].boss) {
        this.shake = 8;
        this.flash = 0.5;
        this.flashColor = "#f6d59a";
        this.run.bosses.push(e.kind);
        this.bullets = this.bullets.filter((b) => b.friendly);
        this.hazards = [];
        this.onEvent("keeper", e.kind);
      }
      this.enemies = this.enemies.filter((c) => c !== e);
    }
  }
  hurt(amount, source) {
    const p = this.player;
    if (p.invulnerable > 0 || this.mode !== "combat") return;
    if (p.shield) {
      recordImpact(this, source, this.run.hp, "shield");
      p.shield = false;
      p.invulnerable = 0.6;
      this.effect(p.x, p.y, "burst", "#b8d8e3", 16);
      this.sound("shield");
      return;
    }
    const damage = amount * (1 + this.run.difficulty * 0.15);
    recordImpact(this, source, this.run.hp);
    this.run.hp = Math.max(0, this.run.hp - damage);
    this.run.damageTaken += damage;
    p.invulnerable = 1.1;
    this.shake = 5;
    this.flash = 0.2;
    this.flashColor = "#f0a18a";
    this.effect(p.x, p.y, "death", "#ef9c87", 14);
    this.label(p.x, p.y - 18, `−${Math.ceil(damage)}`, "#fbac9b");
    this.sound("hurt");
    const a = angleTo(source, p);
    this.move(p, Math.cos(a) * 7, Math.sin(a) * 7);
    if (this.run.hp <= 0) {
      if (this.run.relic === "ember" && !p.revived) {
        p.revived = true;
        this.run.hp = 25;
        p.invulnerable = 2;
        this.label(p.x, p.y - 24, "もう一度、灯る", "#f4dba6");
        this.sound("heal");
      } else {
        this.mode = "dead";
        this.onEvent("death");
      }
    }
  }
  heal(amount) {
    const old = this.run.hp;
    this.run.hp = Math.min(this.run.maxHp, this.run.hp + amount);
    if (this.run.hp > old)
      this.label(
        this.player.x,
        this.player.y - 15,
        `+${Math.ceil(this.run.hp - old)}`,
        "#8de4bd",
      );
  }
  offer(count = 3) {
    return rewardPlan(this.run, count).offers;
  }
  rerollReward() {
    const state = rewardRerollState(this.run);
    if (this.mode !== "reward" || !state.available) return false;
    this.run.scrap -= state.cost;
    this.run.rewardRoll = state.used + 1;
    this.sound("upgrade");
    return true;
  }
  buyUpgrade(id) {
    if (this.mode !== "event") return false;
    const fragment = traderStock(this.run).find((u) => u.id === id);
    if (
      !fragment ||
      this.run.scrap < traderPrice(fragment) ||
      this.run.shopBought?.includes(id) ||
      !this.addUpgrade(id)
    )
      return false;
    this.run.scrap -= traderPrice(fragment);
    (this.run.shopBought ||= []).push(id);
    return true;
  }
  buyHeal() {
    if (
      this.mode !== "event" ||
      !isCamp(this.run.stage) ||
      this.run.route !== "salvage" ||
      this.run.scrap < TRADER_HEAL_PRICE ||
      this.run.hp >= this.run.maxHp
    )
      return false;
    this.run.scrap -= TRADER_HEAL_PRICE;
    this.heal(TRADER_HEAL_AMOUNT);
    this.sound("heal");
    return true;
  }
  addUpgrade(id) {
    const u = catalogUpgrades(this.run).find((x) => x.id === id);
    if (
      !u ||
      rank(this.run, id) >= u.max ||
      (u.requires && !rank(this.run, u.requires))
    )
      return false;
    this.run.upgrades[id] = rank(this.run, id) + 1;
    if (id === "health") {
      this.run.maxHp += 20;
      this.heal(20);
    }
    if (id === "salvage")
      this.pickups.push({ x: 240, y: 180, kind: "heal", amount: 15, age: 0 });
    if (id === "shield") this.player.shield = true;
    if (id === "double") this.player.echoCharges++;
    this.stats = stats(this.run);
    this.sound("upgrade");
    return true;
  }
  collectAllScrap() {
    for (const p of this.pickups)
      if (p.kind === "scrap")
        ((p.collected = true), (this.run.scrap += p.amount));
    this.pickups = this.pickups.filter((p) => !p.collected);
  }
  effect(x, y, kind, color, count = 8) {
    // Cosmetic randomness never changes encounter generation or reward rolls.
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU,
        s =
          (kind === "burst" ? 90 : kind === "muzzle" ? 30 : 45) *
          (Math.random() * 0.75 + 0.25);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.2 + Math.random() * 0.4,
        maxLife: 0.6,
        color,
        size: kind === "burst" ? 2 : 1,
      });
    }
    if (this.particles.length > 500)
      this.particles.splice(0, this.particles.length - 500);
  }
  label(x, y, text, color) {
    this.labels.push({ x, y, text, color, life: 0.8 });
  }
  sound(id) {
    this.onEvent("sound", id);
  }
}

// Preview the actual encounter model without advancing or mutating the expedition.
export function forecastRoom(run, stage, route) {
  const plannedRun = { ...structuredClone(run), stage, route, rewardRoll: 0 };
  const planned = new Game(plannedRun);
  const enemies = {};
  for (const enemy of planned.spawnQueue)
    enemies[enemy.kind] = (enemies[enemy.kind] || 0) + 1;
  return {
    total: planned.spawnQueue.length,
    enemies,
    elite: isElite(stage),
    ...rewardPlan(plannedRun),
  };
}
