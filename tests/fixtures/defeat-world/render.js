import { drawPlayerPresence } from "../../../src/player-presence-render.js";
import { drawBullets } from "../../../src/bullet-render.js";
import { drawMemoryWard } from "../../../src/memory-ward-render.js";
import { sprite, pixelLine, bitmap, ICONS } from "../../../src/art.js";
import { ENEMIES } from "../../../src/content.js";
import { cordProtects } from "../../../src/enemy-patterns.js";
import { TAU, pointInTriangle } from "../../../src/math.js";
import { drawApparatus } from "../../../src/apparatus-render.js";
import { drawArena } from "../../../src/arena-render.js";
import { drawStolenEcho } from "../../../src/stolen-echo-render.js";
import {
  paintScenery,
  drawSceneryAmbient,
  sceneryRing,
} from "../../../src/scenery-render.js";
import { CITY_PROJECTS, cityProgress } from "../../../src/story.js";
import { drawImpactCue } from "../../../src/impact-render.js";
import { drawEchoLifetime } from "../../../src/echo-feedback-render.js";
import {
  drawAreaWarning,
  drawBossWarning,
} from "../../../src/boss-warning-render.js";
import { drawNeedleMarks } from "../../../src/needle-stitch-render.js";
import { weaponPose } from "../../../src/weapon-pose.js";
import { drawWeapon } from "../../../src/weapon-render.js";
import {
  drawThreadGuards,
  drawThreadCut,
  drawStoredLights,
} from "../../../src/thread-guard-render.js";

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.buffer = document.createElement("canvas");
    this.buffer.width = 480;
    this.buffer.height = 300;
    this.g = this.buffer.getContext("2d", { alpha: false });
    this.floorLayer = document.createElement("canvas");
    this.floorLayer.width = 480;
    this.floorLayer.height = 300;
    this.floor = this.floorLayer.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
    this.g.imageSmoothingEnabled = false;
  }
  draw(game, time, settings, profile = {}) {
    const ctx = this.g;
    ctx.fillStyle = "#0b141b";
    ctx.fillRect(0, 0, 480, 300);
    if (game) this.room(game, settings);
    else this.title(time, profile);
    this.ctx.drawImage(this.buffer, 0, 0, 960, 600);
  }
  title(t, profile) {
    const c = this.g,
      dawn = profile.victories > 0;
    const restored = new Set(
      CITY_PROJECTS.filter((p) => cityProgress(profile, p).restored).map(
        (p) => p.id,
      ),
    );
    // All illustration is original pixel geometry. No network assets are required.
    c.fillStyle = dawn ? "#a18b79" : "#101f29";
    c.fillRect(0, 0, 480, 181);
    for (let y = 0; y < 140; y += 16) {
      c.fillStyle = dawn
        ? y < 48
          ? "#30485e"
          : y < 96
            ? "#596278"
            : "#887e7b"
        : y < 60
          ? "#111e28"
          : y < 105
            ? "#142530"
            : "#19333a";
      c.fillRect(0, y, 480, 16);
    }
    for (let i = 0; i < 65; i++) {
      const x = (i * 97 + 23) % 480,
        y = (i * 31 + 9) % 112;
      c.fillStyle = i % 4 === 0 ? "#738a89" : "#39505b";
      c.globalAlpha = (0.5 + Math.sin(t * 0.7 + i) * 0.25) * (dawn ? 0.2 : 1);
      c.fillRect(x, y, i % 7 === 0 ? 2 : 1, 1);
    }
    c.globalAlpha = 1;
    for (let k = 0; k < 4; k++) {
      const x = ((t * (k + 1) * 0.45 + k * 127) % 650) - 100,
        y = 28 + k * 24;
      c.fillStyle = dawn ? "#a18d8b" : "#1c303a";
      c.fillRect(x, y, 63, 3);
      c.fillRect(x + 12, y - 3, 33, 4);
      c.fillRect(x + 34, y + 3, 59, 2);
    }
    if (dawn) {
      c.fillStyle = "#edcda0";
      c.fillRect(300, 123, 34, 18);
      c.fillRect(306, 118, 22, 27);
      c.fillRect(310, 115, 14, 30);
      c.fillStyle = "#b19b89";
      c.fillRect(287, 135, 63, 3);
      c.fillRect(306, 142, 39, 2);
    }
    // The silent city beyond the water.
    for (let i = 0; i < 22; i++) {
      const x = i * 25 - 5,
        h = 13 + ((i * 37) % 35);
      c.fillStyle = dawn
        ? i % 2
          ? "#3c5358"
          : "#49605e"
        : i % 2
          ? "#20353b"
          : "#253c40";
      c.fillRect(x, 178 - h, 18, h);
      c.fillRect(x + 3, 173 - h, 12, 5);
      if (i % 3 === 0 || (restored.has("tower") && i % 2 === 0)) {
        c.fillStyle = restored.has("tower") ? "#d0bd87" : "#54645a";
        c.fillRect(x + 5, 167 - h, 2, 3);
      }
    }
    c.fillStyle = dawn ? "#2d4d57" : "#17353d";
    c.fillRect(0, 181, 480, 119);
    for (let i = 0; i < 83; i++) {
      const y = 183 + ((i * 13) % 117),
        x = (i * 59 + Math.floor(Math.sin(t * 0.45 + i) * 5)) % 480;
      c.fillStyle = (
        dawn
          ? ["#49676d", "#6d7d79", "#405f67", "#848979"]
          : ["#22434a", "#285058", "#1b3b44", "#315356"]
      )[i % 4];
      c.fillRect(x, y, 4 + (i % 15), 1);
    }
    // Drowned arches and a wooden landing.
    c.fillStyle = "#172a31";
    c.fillRect(240, 240, 240, 60);
    c.fillStyle = "#304743";
    for (let i = 0; i < 7; i++) {
      c.fillRect(252 + i * 35, 239 + (i % 2) * 4, 31, 4);
      c.fillRect(256 + i * 35, 247, 3, 32);
    }
    c.fillStyle = restored.has("dock") ? "#88937c" : "#5d6051";
    for (let i = 0; i < 9; i++) c.fillRect(256 + i * 22, 249, 18, 2);
    this.lighthouse(358, 81, t);
    if (restored.has("dock")) {
      c.fillStyle = "#9c9a74";
      c.fillRect(259, 228, 45, 4);
      c.fillStyle = "#4b6458";
      c.fillRect(263, 232, 37, 5);
      c.fillRect(269, 237, 25, 3);
      pixelLine(c, 277, 213, 277, 229, "#87947a", 2);
      pixelLine(c, 277, 213, 294, 226, "#c5c59a", 2);
      sprite(c, "ferryman", 283, 249, { walk: t * 0.6 });
    }
    // Tree leaning over the abandoned pier.
    pixelLine(c, 440, 252, 445, 190, "#425044", 4);
    pixelLine(c, 443, 214, 430, 201, "#425044", 2);
    c.fillStyle = "#344d48";
    c.fillRect(430, 185, 21, 7);
    c.fillRect(420, 193, 35, 7);
    c.fillRect(434, 179, 11, 6);
    c.fillStyle = "#456252";
    c.fillRect(423, 191, 15, 3);
    if (restored.has("garden")) {
      for (const [x, y] of [
        [427, 192],
        [444, 187],
        [437, 179],
        [453, 198],
      ]) {
        c.fillStyle = "#c9a2c0";
        c.fillRect(x - 2, y, 5, 2);
        c.fillRect(x, y - 2, 2, 5);
        c.fillStyle = "#f1d0a5";
        c.fillRect(x, y, 1, 1);
      }
      for (let i = 0; i < 4; i++) {
        c.fillStyle = "#799677";
        c.fillRect(415 + i * 8, 248, 2, 8);
        c.fillStyle = "#c3abc9";
        c.fillRect(413 + i * 8, 247, 6, 3);
      }
    }
    if (restored.has("tower")) {
      this.ring(375, 201, 7, "#bcbd93");
      pixelLine(c, 375, 201, 375, 196, "#e1d0a1");
      pixelLine(
        c,
        375,
        201,
        375 + Math.cos(t * 0.4) * 4,
        201 + Math.sin(t * 0.4) * 4,
        "#e1d0a1",
      );
    }
    sprite(c, "player", 312, 249, { walk: t * 0.3 });
    c.fillStyle = "#86d7ba";
    c.fillRect(305, 238, 2, 3);
    c.fillStyle = "#36594f";
    c.fillRect(302, 241, 8, 1);
    // A reflected lighthouse: broken bands instead of a smooth gradient.
    for (let i = 0; i < 12; i++) {
      const w = 20 + Math.sin(i * 1.7 + t) * 12;
      c.fillStyle = i % 2 ? "#385c56" : "#284b4c";
      c.fillRect(350 - w / 2 + Math.sin(t + i) * 4, 259 + i * 3, w, 1);
    }
    // Foreground reeds and drifting lights.
    c.fillStyle = "#0b191e";
    for (let i = 0; i < 24; i++) {
      const x = 230 + i * 11,
        h = 10 + ((i * 7) % 18);
      c.fillRect(x, 300 - h, 2, h);
      pixelLine(c, x, 300 - h, x - 4, 294 - h, "#0b191e", 1);
    }
    for (let i = 0; i < 9; i++) {
      const x = 267 + i * 21 + Math.sin(t * 0.6 + i) * 4,
        y = 135 + ((i * 23) % 102) + Math.sin(t + i) * 3;
      c.fillStyle = "#a2c797";
      c.globalAlpha = 0.25 + (0.5 + Math.sin(t + i) * 0.5) * 0.6;
      c.fillRect(x, y, 1, 2);
    }
    c.globalAlpha = 1;
  }
  lighthouse(x, y, t) {
    const c = this.g;
    // Light is a stepped cone, deliberately kept pixel crisp.
    const sweep = Math.sin(t * 0.14) * 0.35;
    c.globalAlpha = 0.09;
    c.fillStyle = "#d7d6a0";
    c.beginPath();
    c.moveTo(x + 17, y + 12);
    c.lineTo(480, 44 + sweep * 70);
    c.lineTo(480, 91 + sweep * 70);
    c.closePath();
    c.fill();
    c.globalAlpha = 1;
    c.fillStyle = "#11232a";
    c.fillRect(x - 12, y + 132, 63, 25);
    c.fillStyle = "#536357";
    c.fillRect(x - 8, y + 131, 55, 5);
    c.fillStyle = "#6f8070";
    c.fillRect(x + 4, y + 29, 29, 104);
    c.fillStyle = "#8d9a7e";
    c.fillRect(x + 4, y + 29, 7, 102);
    c.fillStyle = "#3a504b";
    c.fillRect(x + 28, y + 29, 5, 102);
    c.fillStyle = "#3e5650";
    c.fillRect(x + 2, y + 63, 33, 9);
    c.fillRect(x + 2, y + 98, 33, 9);
    c.fillStyle = "#bbbc90";
    c.fillRect(x + 4, y + 60, 29, 3);
    c.fillRect(x + 4, y + 95, 29, 3);
    c.fillStyle = "#192d32";
    c.fillRect(x + 14, y + 43, 8, 14);
    c.fillRect(x + 14, y + 78, 8, 14);
    c.fillRect(x + 13, y + 118, 10, 15);
    c.fillStyle = "#d9b775";
    c.fillRect(x + 16, y + 45, 3, 9);
    c.fillRect(x + 16, y + 80, 3, 8);
    c.fillStyle = "#334d48";
    c.fillRect(x - 2, y + 22, 41, 8);
    c.fillStyle = "#9fa786";
    c.fillRect(x - 2, y + 22, 41, 2);
    c.fillStyle = "#10252c";
    c.fillRect(x + 2, y + 3, 32, 19);
    c.fillStyle = "#edd69a";
    c.fillRect(x + 5, y + 6, 26, 14);
    c.fillStyle = "#a6bc96";
    c.fillRect(x + 9, y + 5, 2, 17);
    c.fillRect(x + 25, y + 5, 2, 17);
    c.fillStyle = "#527168";
    c.fillRect(x + 1, y, 34, 4);
    c.fillRect(x + 4, y - 4, 28, 4);
    c.fillRect(x + 9, y - 8, 18, 4);
    c.fillRect(x + 14, y - 13, 8, 5);
    c.fillStyle = "#b6c09a";
    c.fillRect(x + 17, y - 21, 2, 8);
    c.fillRect(x + 14, y - 17, 8, 1);
    for (let i = 0; i < 9; i++) {
      c.fillStyle = i % 2 ? "#344c47" : "#5a6d5b";
      c.fillRect(x + 4, y + 33 + i * 11, 3, 1);
      c.fillRect(x + 23, y + 37 + i * 10, 4, 1);
    }
    pixelLine(c, x - 6, y + 25, x - 6, y + 31, "#71806c");
    pixelLine(c, x + 41, y + 25, x + 41, y + 31, "#71806c");
    pixelLine(c, x - 6, y + 25, x + 41, y + 25, "#71806c");
  }
  tileLayer(game) {
    const b = game.biome;
    if (this.floorTiles === game.tiles && this.floorBiome === b)
      return this.floorLayer;
    this.floorTiles = game.tiles;
    this.floorBiome = b;
    this.doors = [];
    const c = this.floor;
    paintScenery(c, game, this.doors);
    drawArena(c, game, (...args) => sceneryRing(c, ...args));
    return this.floorLayer;
  }
  room(game, settings) {
    const c = this.g,
      b = game.biome,
      t = game.t;
    c.save();
    if (settings.shake && game.shake > 0)
      c.translate(
        Math.round(Math.sin(t * 137) * game.shake * 0.35),
        Math.round(Math.cos(t * 173) * game.shake * 0.25),
      );
    // The sea under the suspended causeway.
    c.fillStyle = b.dark;
    c.fillRect(0, 0, 480, 300);
    for (let i = 0; i < 35; i++) {
      c.fillStyle = "#24414a";
      c.fillRect(
        (i * 43 + Math.floor(t * 3)) % 480,
        18 + ((i * 17) % 280),
        7 + (i % 8),
        1,
      );
    }
    c.drawImage(this.tileLayer(game), 0, 0);
    c.fillStyle = game.mode === "cleared" ? b.color : "#89665c";
    for (const door of this.doors) {
      c.fillRect(door.x + 2, door.y + 4, 12, 3);
      c.fillRect(door.x + 6, door.y + 8, 4, 7);
    }
    drawSceneryAmbient(c, game, settings);
    const regions = game.triangles();
    if (regions.length) {
      const vertices = regions.flat();
      const left = Math.max(
        32,
        Math.ceil(Math.min(...vertices.map((p) => p.x)) / 8) * 8,
      );
      const right = Math.min(448, Math.max(...vertices.map((p) => p.x)));
      const top = Math.max(
        32,
        Math.ceil(Math.min(...vertices.map((p) => p.y)) / 8) * 8,
      );
      const bottom = Math.min(272, Math.max(...vertices.map((p) => p.y)));
      c.fillStyle = b.color;
      c.globalAlpha = 0.18;
      for (let y = top; y <= bottom; y += 8)
        for (let x = left; x <= right; x += 8)
          if (regions.some(([a, b, d]) => pointInTriangle({ x, y }, a, b, d)))
            c.fillRect(x, y - 3, 2, 2);
      c.globalAlpha = 1;
    }
    if (game.practice) {
      for (const marker of game.practiceMarkers) {
        c.globalAlpha = marker.dim ? 0.3 : 0.85;
        this.ring(marker.x, marker.y, 18, "#a5ead1");
        this.ring(marker.x, marker.y, 22 + Math.sin(t * 3) * 2, "#5f9e90");
        c.fillStyle = "#c8f7dc";
        c.fillRect(Math.round(marker.x) - 2, Math.round(marker.y) - 2, 4, 4);
        c.font = "7px monospace";
        c.textAlign = "center";
        c.fillText(marker.label, marker.x, marker.y + 34);
      }
      if (game.practice.step === 3) {
        c.globalAlpha = 0.3;
        c.fillStyle = "#9ac6ab";
        for (let x = 116; x < 301; x += 12)
          c.fillRect(
            x,
            Math.round(
              game.practice.phase === "cross" ? game.practice.origin.y : 160,
            ) - 1,
            4,
            2,
          );
      }
      if (game.practice.step === 4) {
        for (const echo of game.echoes) {
          c.globalAlpha = game.practiceReleaseReady ? 0.65 : 0.2;
          this.ring(echo.x, echo.y, game.stats.burstRadius, "#a5ead1");
        }
      }
      c.globalAlpha = 1;
    }
    drawApparatus(c, game, (...args) => this.ring(...args));
    if (game.beacon) {
      const bcn = game.beacon,
        x = bcn.x,
        y = bcn.y;
      c.globalAlpha = 0.35;
      this.ring(x, y, 18, bcn.lit ? "#a1e7c0" : "#e3c08c");
      c.globalAlpha = 1;
      c.fillStyle = "#11272b";
      c.fillRect(x - 6, y - 6, 12, 12);
      c.fillStyle = bcn.lit ? "#80d9b2" : "#a68e6b";
      c.fillRect(x - 4, y - 5, 8, 7);
      c.fillStyle = bcn.lit ? "#dcf5cb" : "#3e5050";
      c.fillRect(x - 2, y - 4, 4, 4);
      c.fillStyle = "#7b8d7e";
      c.fillRect(x - 5, y + 2, 10, 2);
      c.fillStyle = "#263d3c";
      c.fillRect(x - 13, y + 10, 26, 3);
      c.fillStyle = bcn.lit ? "#9bdcb8" : "#e2bc83";
      c.fillRect(x - 12, y + 11, 24 * (bcn.lit ? 1 : bcn.charge / bcn.max), 1);
      if (!bcn.lit) {
        c.font = "6px monospace";
        c.textAlign = "center";
        c.fillStyle = "#bbaa88";
        c.fillText("光糸で灯す", x, y + 23);
      }
    }
    for (const n of game.spawnQueue)
      if (n.time - game.roomTime < 0.85) {
        const q = 1 - (n.time - game.roomTime) / 0.85;
        c.globalAlpha = 0.2 + q * 0.3;
        this.ring(n.x, n.y, 9, ENEMIES[n.kind].color);
        pixelLine(c, n.x - 5, n.y, n.x + 5, n.y, ENEMIES[n.kind].color);
        c.globalAlpha = 1;
      }
    for (const h of game.hazards) {
      if (h.cancelled) continue;
      if (h.kind === "threadGuard") {
        drawThreadCut(c, h, settings);
        continue;
      }
      if (h.kind === "stolenEcho") {
        drawStolenEcho(c, h, (...args) => this.ring(...args));
        continue;
      }
      if (h.kind === "refraction") {
        c.globalAlpha = 1 - h.age / h.duration;
        this.ring(h.x, h.y, 5 + h.age * 35, "#d9d7ff");
        for (const side of [-1, 1])
          pixelLine(c, h.x, h.y, h.x + side * 12, h.y - 8, "#d9d7ff");
        c.globalAlpha = 1;
        continue;
      }
      if (h.kind === "cord") {
        const active = h.age >= h.warning;
        const color = active ? "#f6ac94" : "#d48b94";
        c.globalAlpha = active ? 0.18 : 0.08;
        pixelLine(c, h.a.x, h.a.y - 3, h.b.x, h.b.y - 3, color, 7);
        c.globalAlpha = active ? 0.8 : 0.4;
        pixelLine(c, h.a.x, h.a.y - 3, h.b.x, h.b.y - 3, color, active ? 2 : 1);
        const length = Math.hypot(h.b.x - h.a.x, h.b.y - h.a.y);
        c.globalAlpha = 1;
        for (let n = 0; n <= length; n += 14) {
          const f = n / length;
          c.fillStyle = active ? "#ffe0ad" : "#e3a4af";
          c.fillRect(
            Math.round(h.a.x + (h.b.x - h.a.x) * f) - 1,
            Math.round(h.a.y + (h.b.y - h.a.y) * f) - 5,
            2,
            4,
          );
        }
        for (const node of [h.a, h.b])
          this.ring(node.x, node.y - 3, node.r + 3, color);
        const progress = Math.min(1, h.age / h.warning);
        this.ring(h.x, h.y - 3, active ? 5 : 4 + (1 - progress) * 5, color);
        if (h.charge > 0) {
          c.fillStyle = "#b8f2d7";
          c.fillRect(
            Math.round(h.x) - 9,
            Math.round(h.y) + 8,
            Math.round((h.charge / 0.2) * 18),
            2,
          );
        }
        continue;
      }
      if (h.kind === "bloom" || h.kind === "line") {
        drawAreaWarning(c, h, (...args) => this.ring(...args));
        continue;
      }
      const active = h.age > h.duration - 0.35;
      c.globalAlpha = active ? 0.6 : 0.18 + Math.sin(h.age * 18) * 0.06;
      c.fillStyle = h.friendly ? "#82e4cc" : "#ec8a7c";
      if (active)
        c.fillRect(h.x - h.r * 0.7, h.y - h.r * 0.7, h.r * 1.4, h.r * 1.4);
      this.ring(h.x, h.y, h.r, c.fillStyle);
      this.ring(
        h.x,
        h.y,
        Math.min(h.r, (h.age / h.duration) * h.r),
        c.fillStyle,
      );
      c.globalAlpha = 1;
      if (h.weavable && !active) {
        c.fillStyle = "#d9c1e5";
        c.fillRect(Math.round(h.x) - 2, Math.round(h.y) - 3, 4, 6);
        if (h.charge > 0) {
          c.fillStyle = "#b6eac4";
          c.fillRect(
            Math.round(h.x) - 9,
            Math.round(h.y) + h.r + 3,
            Math.round((18 * h.charge) / 0.5),
            2,
          );
        }
      }
    }
    drawBossWarning(c, game, (...args) => this.ring(...args));
    for (const [a, e] of game.threads()) {
      const slash =
        a === game.player &&
        game.player.dash > 0 &&
        game.run.upgrades.dashthread &&
        settings.flashes > 0;
      c.globalAlpha = slash ? 0.24 : 0.12;
      pixelLine(c, a.x, a.y - 3, e.x, e.y - 3, b.color, slash ? 9 : 7);
      c.globalAlpha = 0.6;
      pixelLine(
        c,
        a.x,
        a.y - 3,
        e.x,
        e.y - 3,
        slash ? "#f4e4aa" : b.color,
        slash ? 3 : 2,
      );
      c.globalAlpha = 1;
      pixelLine(c, a.x, a.y - 3, e.x, e.y - 3, "#c1f8db", 1);
      const progress = (t * 1.7) % 1;
      c.fillStyle = "#e3fff0";
      c.fillRect(
        a.x + (e.x - a.x) * progress - 1,
        a.y + (e.y - a.y) * progress - 4,
        2,
        2,
      );
    }
    drawThreadGuards(c, game);
    for (const item of game.pickups) {
      const bob = Math.sin(item.age * 4) * 1.5;
      c.fillStyle = "#0a171d";
      c.fillRect(item.x - 4, item.y + 2, 8, 2);
      const rows = ICONS[item.kind === "scrap" ? "scrap" : "heart"];
      bitmap(c, rows, item.x - 6, item.y - 8 + bob, undefined, 1);
    }
    const actors = [
      ...game.enemies.map((e) => ({ ...e, type: "enemy" })),
      ...game.echoes.map((e) => ({ ...e, type: "echo" })),
      ...game.hazards
        .filter(
          (h) => h.kind === "stolenEcho" && !h.cancelled && h.owner.hp > 0,
        )
        .map((h) => ({ ...h, type: "stolen" })),
      { ...game.player, type: "player" },
    ].sort((a, b) => a.y - b.y);
    for (const a of actors) {
      const boss = a.type === "enemy" && ENEMIES[a.kind].boss;
      c.fillStyle = "#09151b90";
      c.fillRect(a.x - (boss ? 14 : 6), a.y + 3, boss ? 28 : 12, 3);
      if (a.type === "enemy") {
        if (a.practiceTarget)
          bitmap(
            c,
            [
              "...ooooo...",
              "...ottto...",
              "...ottto...",
              "...ooooo...",
              ".wwwwwwwww.",
              "....www....",
              "....www....",
              "....www....",
              "...ww.ww...",
              "..ww...ww..",
            ],
            a.x - 5,
            a.y - 13,
            {
              o: a.flash > 0 && settings.flashes ? "#c6f5da" : "#729885",
              t: "#b9dfb3",
              w: "#89745d",
            },
          );
        else
          sprite(c, a.kind, a.x, a.y, {
            scale: boss ? 1.7 : a.elite ? 1.25 : 1,
            flash: settings.flashes && a.flash > 0,
            walk: t * 5,
          });
        if (a.elite) this.ring(a.x, a.y - 5, a.r + 6, "#e8c284");
        if (cordProtects(game, a)) this.ring(a.x, a.y - 5, a.r + 5, "#e8a6a3");
        if (a.kind === "shield") {
          const points = [-0.85, 0, 0.85].map((offset) => ({
            x: a.x + Math.cos(a.angle + offset) * (a.r + 4),
            y: a.y - 4 + Math.sin(a.angle + offset) * (a.r + 4),
          }));
          c.globalAlpha = a.state === "recover" ? 0.35 : 0.8;
          for (let i = 0; i < 2; i++)
            pixelLine(
              c,
              points[i].x,
              points[i].y,
              points[i + 1].x,
              points[i + 1].y,
              "#a2cfcc",
              2,
            );
          c.globalAlpha = 1;
        }
        if (a.ward) {
          c.globalAlpha = 0.7;
          this.ring(a.x, a.y - 6, a.r + 7, "#9fe2c8");
          c.globalAlpha = 1;
          for (let i = 0; i < 4; i++) {
            const angle = t + (i * TAU) / 4;
            c.fillStyle = "#ccf2d5";
            c.fillRect(
              a.x + Math.cos(angle) * (a.r + 7) - 1,
              a.y - 7 + Math.sin(angle) * (a.r + 7),
              2,
              2,
            );
          }
        }
        drawMemoryWard(c, a);
        drawNeedleMarks(c, a, game.t);
        if (!boss && a.hp < a.maxHp) {
          c.fillStyle = "#101c24";
          c.fillRect(a.x - 10, a.y - a.r - 16, 20, 3);
          c.fillStyle = b.color;
          c.fillRect(a.x - 9, a.y - a.r - 15, (18 * a.hp) / a.maxHp, 1);
        }
        if (a.state === "windup") {
          c.globalAlpha = 0.3 + Math.sin(t * 18) * 0.1;
          if (a.kind === "shooter") {
            for (const angle of a.shotAngles || [])
              pixelLine(
                c,
                a.x,
                a.y - 3,
                a.x + Math.cos(angle) * 140,
                a.y - 3 + Math.sin(angle) * 140,
                "#edb184",
                1,
              );
          } else if (!boss)
            pixelLine(
              c,
              a.x,
              a.y,
              a.x + Math.cos(a.angle) * 110,
              a.y + Math.sin(a.angle) * 110,
              "#ed987e",
              boss ? 7 : 2,
            );
          c.globalAlpha = 1;
          this.ring(a.x, a.y, a.r + 4, "#f2b493");
        }
        if (a.kind === "shooter" && a.state === "windup") {
          c.fillStyle = "#ffd6a0";
          c.fillRect(a.x - 2, a.y - 12, 4, 3);
        }
      } else {
        const pose = weaponPose(game, a);
        if (a.type === "stolen") c.globalAlpha = a.age < a.warning ? 0.4 : 1;
        if (a.type === "player" && a.invulnerable > 0 && Math.floor(t * 18) % 2)
          c.globalAlpha = 0.45;
        sprite(c, "player", pose.x, pose.y, {
          echo: a.type === "echo",
          stolen: a.type === "stolen",
          walk: a.walk || 0,
          moving: a.moving,
          idle: t,
          flip: Math.cos(a.angle) < 0,
        });
        c.globalAlpha = 1;
        if (a.type === "stolen") {
          pixelLine(c, a.x - 3, a.y + 6, a.x + 3, a.y + 10, "#ffbcad", 2);
          pixelLine(c, a.x + 3, a.y + 6, a.x - 3, a.y + 10, "#ffbcad", 2);
          continue;
        }
        drawWeapon(c, pose, game.weapon, a.type === "echo", settings);
        if (a.shield) this.ring(a.x, a.y - 4, 12, "#b3d9d7");
        if (a.type === "echo") {
          drawEchoLifetime(c, a, game.stats.echoDuration);
          if (game.run.upgrades.counter) drawStoredLights(c, a);
          c.globalAlpha = 0.5;
          this.ring(a.x, a.y + 6, 8, b.color);
          c.globalAlpha = 1;
          if (game.weapon.id === "prism") {
            const lens = [
              [a.x, a.y - 11],
              [a.x + 11, a.y],
              [a.x, a.y + 11],
              [a.x - 11, a.y],
            ];
            for (let i = 0; i < lens.length; i++)
              pixelLine(
                c,
                ...lens[i],
                ...lens[(i + 1) % lens.length],
                "#d9d7ff",
              );
          }
        }
      }
    }
    drawPlayerPresence(c, game.player);
    drawBullets(c, game.bullets);
    for (const p of game.particles) {
      c.globalAlpha = Math.min(1, p.life * 3);
      c.fillStyle = p.color;
      c.fillRect(Math.floor(p.x), Math.floor(p.y), p.size, p.size);
    }
    c.globalAlpha = 1;
    drawImpactCue(c, game, settings);
    c.font = "bold 6px monospace";
    c.textAlign = "center";
    for (const l of game.labels) {
      c.globalAlpha = Math.min(1, l.life * 3);
      c.fillStyle = "#102027";
      c.fillText(l.text, l.x + 1, l.y + 1);
      c.fillStyle = l.color;
      c.fillText(l.text, l.x, l.y);
    }
    c.globalAlpha = 1;
    if (game.mode === "cleared") {
      c.fillStyle = b.color;
      c.font = "7px monospace";
      c.fillText("E  次の航路へ", 240, 53);
      this.ring(240, 42, 12 + Math.sin(t * 3) * 2, b.color);
    }
    // Stepped vignette does not obscure bullets or attack warnings.
    c.fillStyle = "#040d1240";
    c.fillRect(0, 0, 16, 300);
    c.fillRect(464, 0, 16, 300);
    c.fillRect(0, 288, 480, 12);
    if (settings.flashes && game.flash > 0) {
      c.globalAlpha = game.flash * 0.18;
      c.fillStyle =
        game.mode === "dead" ? "#d47968" : game.flashColor || "#d5ebd2";
      c.fillRect(0, 0, 480, 300);
      c.globalAlpha = 1;
    }
    c.restore();
  }
  ring(x, y, r, color) {
    const c = this.g;
    for (let i = 0; i < 64; i++) {
      const a = (i * TAU) / 64;
      c.fillStyle = color;
      c.fillRect(
        Math.floor(x + Math.cos(a) * r),
        Math.floor(y + Math.sin(a) * r),
        1,
        1,
      );
    }
  }
}
