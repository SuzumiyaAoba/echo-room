import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import { ENEMIES, WEAPONS, RELICS } from "../src/content.js";
import { updateApparatus } from "../src/apparatus.js";
import { Random } from "../src/math.js";
import {
  impactSource,
  bulletImpactSource,
  normalizeLastHit,
  lastHitAtReturn,
  lastHitReadout,
} from "../src/last-impact.js";
import {
  makeReturnRecord,
  normalizeReturnRecord,
} from "../src/return-record.js";
import { freshProfile, prepareImport, exportProfile } from "../src/save.js";
import {
  Game as BeforeGame,
  createRun as beforeRun,
} from "./fixtures/last-impact-before/game.js";
import { makeReturnRecord as beforeRecord } from "./fixtures/last-impact-before/return-record.js";

const scene = (relic = "spool", difficulty = 0) =>
  new Game(createRun("LAST-IMPACT", "needle", relic, difficulty));
const hit = (type = "contact", enemy = "crawler", elite = false) => ({
  version: 1,
  type,
  enemy,
  elite,
  damage: 9,
  hpBefore: 1,
});

test("九種類の接触・強敵・本物の突進を区別し、読むだけで戦闘を変えない", () => {
  const g = scene();
  for (const kind of Object.keys(ENEMIES))
    for (const elite of [false, true]) {
      const e = g.spawn(kind, 240, 140, elite),
        before = JSON.stringify(g);
      assert.deepEqual(impactSource(g, e), {
        type: "contact",
        enemy: kind,
        elite: elite && !ENEMIES[kind].boss,
      });
      e.state = "charge";
      assert.equal(
        impactSource(g, e).type,
        ["charger", "ferryman"].includes(kind) ? "charge" : "contact",
      );
      e.state = JSON.parse(before).enemies.at(-1).state;
      assert.equal(JSON.stringify(g), before);
    }
  assert.equal(
    impactSource(g, { kind: "crawler", x: 240, y: 140 }).type,
    "unknown",
  );
});

test("敵が倒れたあとも弾の発射元を保持し、味方の弾は記録を増やさない", () => {
  const g = scene(),
    e = g.spawn("shooter", 240, 100, true),
    b = g.makeBullet(e, 0, 10, 100, false, "#fff");
  g.enemies = [];
  assert.deepEqual(impactSource(g, b), {
    type: "projectile",
    enemy: "shooter",
    elite: true,
  });
  e.kind = "crawler";
  assert.equal(impactSource(g, b).enemy, "shooter");
  const own = g.makeBullet(g.player, 0, 10, 100, true, "#fff");
  assert.equal(own.impactSource, undefined);
  assert.equal(impactSource(g, own).type, "unknown");
});

test("地域装置の発射元と不明な弾を、座標から推測せず区別する", () => {
  const g = scene();
  for (const kind of ["garden", "furnace"]) {
    const node = { x: 120, y: 104 };
    g.apparatus = { kind, objects: [node] };
    const b = g.makeBullet(node, 0, 7, 52, false, "#fff");
    assert.equal(
      impactSource(g, b).type,
      kind === "garden" ? "gardenShot" : "furnaceShot",
    );
  }
  assert.deepEqual(bulletImpactSource(g, { x: 120, y: 104 }), {
    type: "projectile",
    enemy: null,
    elite: false,
  });
});

test("芽・断層・赤い結び・逆走と、実際に届いた横波の一撃を読む", () => {
  const g = scene();
  for (const [kind, type, enemy] of [
    ["bloom", "bloom", "gardener"],
    ["line", "line", "heart"],
    ["cord", "cord", "weaver"],
    ["stolenEcho", "stolen", "weaver"],
  ]) {
    const h = { kind };
    g.hazards.push(h);
    assert.deepEqual(impactSource(g, h), { type, enemy, elite: false });
  }
  g.run.hp = 1;
  g.apparatus = {
    kind: "tide",
    objects: [],
    restored: false,
    charge: 1,
    cycle: 0,
    warning: 0,
    wave: { age: 0.95, y: 235, hit: false },
  };
  // Advance the real apparatus into the stationary player's row, without changing hurt.
  g.player.y = 44 + 0.97 * 68;
  updateApparatus(g, 0.02);
  assert.equal(g.mode, "dead");
  assert.equal(lastHitAtReturn(g).type, "tide");
  assert.equal(lastHitAtReturn(g).damage, 8);
});

test("最後に受けた一撃の実際の倍率と直前HPを、残りHPへの切り詰めと分ける", () => {
  const g = scene("spool", 1),
    e = g.spawn("crawler", 240, 230);
  g.run.hp = 1;
  g.hurt(9, e);
  const record = lastHitAtReturn(g);
  assert.deepEqual(record, {
    version: 1,
    type: "contact",
    enemy: "crawler",
    elite: false,
    damage: 9 * 1.15,
    hpBefore: 1,
  });
  e.kind = "shooter";
  assert.equal(lastHitAtReturn(g).enemy, "crawler");
  const state = JSON.stringify(g);
  for (let i = 0; i < 100; i++) lastHitReadout(lastHitAtReturn(g));
  assert.equal(JSON.stringify(g), state);
});

test("盾と無敵は最後の被害を上書きせず、敗因を作らない", () => {
  const g = scene(),
    e = g.spawn("crawler", 240, 230);
  g.addUpgrade("shield");
  g.hurt(9, e);
  assert.equal(lastHitAtReturn(g), null);
  assert.equal(g.run.hp, 100);
  g.player.invulnerable = 0;
  g.hurt(9, e);
  const cue = g.hitCue;
  g.hurt(1000, e);
  assert.equal(g.hitCue, cue);
  assert.equal(g.run.hp, 91);
  assert.equal(lastHitAtReturn(g), null);
});

test("燠火で耐えた攻撃を敗因にせず、次の実際の致命傷だけを保存する", () => {
  const g = scene("ember"),
    e = g.spawn("crawler", 240, 230);
  g.run.hp = 1;
  g.hurt(9, e);
  assert.equal(g.run.hp, 25);
  assert.equal(lastHitAtReturn(g), null);
  g.player.invulnerable = 0;
  g.hurt(30, e);
  assert.equal(g.mode, "dead");
  assert.equal(lastHitAtReturn(g).damage, 30);
  assert.equal(lastHitAtReturn(g).hpBefore, 25);
});

test("不正な一撃と識別子を拒否し、保存から文章・参照・履歴を受け取らない", () => {
  const valid = hit();
  for (const patch of [
    { version: 2 },
    { type: "constructor" },
    { enemy: "toString" },
    { enemy: "<img>" },
    { elite: "true" },
    { damage: NaN },
    { damage: Infinity },
    { damage: -1 },
    { hpBefore: 0 },
    { hpBefore: 241 },
    { type: "bloom" },
    { type: "tide" },
    { type: "charge", enemy: "shooter" },
    { enemy: "heart", elite: true },
  ])
    assert.equal(normalizeLastHit({ ...valid, ...patch }), null);
  assert.deepEqual(
    normalizeLastHit({
      ...valid,
      title: "<script>",
      hint: "fake",
      history: [1],
      x: 900,
    }),
    valid,
  );
});

test("全プロフィールの公開保存・取り込みで一撃を保ち、不正な一撃だけを落とす", () => {
  const p = freshProfile();
  p.lastReturn = makeReturnRecord(createRun("LAST-SAVE"), false, 5, hit());
  assert.deepEqual(
    prepareImport(exportProfile(p)).profile.lastReturn.lastHit,
    hit(),
  );
  const raw = { ...p.lastReturn, lastHit: { ...hit(), damage: "9" } };
  const normalized = normalizeReturnRecord(raw);
  assert.equal(normalized.lastHit, undefined);
  assert.deepEqual(normalized, beforeRecord(createRun("LAST-SAVE"), false, 5));
  const victory = createRun("LAST-WIN");
  victory.stage = 23;
  assert.equal(makeReturnRecord(victory, true, 35, hit()).lastHit, undefined);
});

test("旧旅162条件の帰還を変更直前の関数と照合し、情報がない敗因を作らない", () => {
  let count = 0;
  for (const version of [1, 2, 3])
    for (const w of WEAPONS)
      for (const r of RELICS)
        for (const difficulty of [0, 1, 2])
          for (const victory of [false, true]) {
            const run = createRun("OLD-LAST", w.id, r.id, difficulty);
            run.catalogVersion = version;
            if (victory) run.stage = 23;
            assert.deepEqual(
              makeReturnRecord(run, victory, 35),
              beforeRecord(run, victory, 35),
            );
            count++;
          }
  assert.equal(count, 162);
});

test("十一種類へ具体的な対処を生成し、持ち込まれた名前や助言を表示しない", () => {
  const cases = [
    hit(),
    hit("charge", "charger"),
    hit("projectile", "shooter"),
    hit("bloom", "gardener"),
    hit("line", "heart"),
    hit("cord", "weaver"),
    hit("stolen", "weaver"),
    hit("tide", null),
    hit("gardenShot", null),
    hit("furnaceShot", null),
    hit("unknown", null),
  ];
  for (const r of cases) {
    const before = JSON.stringify(r),
      view = lastHitReadout({ ...r, title: "fake", hint: "fake" });
    assert.ok(view.title && view.hint.length > 10);
    assert.ok(!view.title.includes("fake") && !view.hint.includes("fake"));
    assert.equal(JSON.stringify(r), before);
  }
});

test("九部屋・三難度・三武器・三お守り243条件で、全戦闘・保存・乱数・イベントを保つ", () => {
  const physical = (g) =>
    JSON.stringify(g, (k, v) =>
      k === "impactSource"
        ? undefined
        : k === "hitCue" && v
          ? { ...v, source: undefined, damageTakenBefore: undefined }
          : v,
    );
  let count = 0;
  for (const stage of [0, 5, 7, 8, 13, 15, 16, 21, 23])
    for (const difficulty of [0, 1, 2])
      for (const w of WEAPONS)
        for (const r of RELICS) {
          const run = beforeRun(
            `LAST-PARITY-${stage}-${difficulty}-${w.id}-${r.id}`,
            w.id,
            r.id,
            difficulty,
          );
          run.stage = stage;
          const aEvents = [],
            bEvents = [],
            a = new Game(structuredClone(run), (type, data) =>
              aEvents.push({ type, data }),
            ),
            b = new BeforeGame(structuredClone(run), (type, data) =>
              bEvents.push({ type, data }),
            );
          const visualA = new Random(12345),
            visualB = new Random(12345);
          for (let frame = 0; frame < 960; frame++) {
            const controls = {
              mx: Math.cos(frame / 100),
              my: Math.sin(frame / 100),
              autoAim: true,
              fire: true,
              echo: frame % 240 === 60,
              burst: frame % 240 === 210,
              dash: frame % 180 === 0,
            };
            const nativeRandom = Math.random;
            try {
              Math.random = () => visualA.next();
              a.update(1 / 60, controls);
              Math.random = () => visualB.next();
              b.update(1 / 60, controls);
            } finally {
              Math.random = nativeRandom;
            }
            assert.equal(visualA.state, visualB.state);
            assert.equal(a.rng.state, b.rng.state);
            if (frame % 60 === 0 || frame === 959)
              assert.equal(
                physical(a),
                physical(b),
                `${stage}/${difficulty}/${w.id}/${r.id}/${frame}`,
              );
          }
          assert.deepEqual(a.run, b.run);
          assert.deepEqual(aEvents, bEvents);
          count++;
        }
  assert.equal(count, 243);
});
