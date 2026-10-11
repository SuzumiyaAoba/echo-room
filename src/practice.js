import { Game, createRun } from "./game.js";
import { clamp, distance, TAU } from "./math.js";

export const PRACTICE_STEPS = [
  {
    title: "灯りまで歩く",
    hint: "左の光る輪へ歩いてみましょう。",
    keys: "WASD / 矢印 · 左スティック",
  },
  {
    title: "影を撃つ",
    hint: "上の練習用の影に、針を一度当てましょう。",
    keys: "クリック / J · RT · 右スティック",
  },
  {
    title: "一歩をすり抜ける",
    hint: "右の輪へ向かい、途中で回避を使いましょう。",
    keys: "SPACE · A · 回避ボタン",
  },
  {
    title: "昨日と糸を張る",
    hint: "左の輪へ。そこから右へ歩いて、残響を織りましょう。",
    keys: "Q · RB · 残響ボタン",
  },
  {
    title: "光をほどく",
    hint: "残響のそばに現れた影と弾を、一緒にほどきましょう。",
    keys: "R · LB · 解放ボタン",
  },
];

// The practice room uses the expedition's movement, recordings, collision,
// damage and release. Only its props and harmless target behaviour differ.
export class PracticeGame extends Game {
  constructor(onEvent) {
    super(createRun("LIGHT-KEEPER-PRACTICE"), onEvent);
    this.practice = {
      step: 0,
      phase: "approach",
      dashed: false,
      threadHit: false,
      threadGuard: false,
      burstHit: false,
      released: false,
    };
    this.setStep(0);
  }
  populate() {
    // Keep the normal clear detector dormant while each exercise has no target.
    this.spawnQueue = [{ time: Infinity }];
  }
  makeRoom() {
    const map = super.makeRoom();
    for (const row of map)
      for (let x = 0; x < row.length; x++) if (row[x] === 2) row[x] = 0;
    return map;
  }
  target(x, y, hp = 120) {
    const e = this.spawn("crawler", x, y);
    e.practiceTarget = true;
    e.hp = e.maxHp = hp;
    return e;
  }
  setStep(step) {
    Object.assign(this.practice, {
      step,
      phase: "approach",
      dashed: false,
      shotHit: false,
      threadHit: false,
      threadGuard: false,
      burstHit: false,
      released: false,
    });
    if (step === PRACTICE_STEPS.length) {
      this.onEvent("practice-step", step);
      return;
    }
    this.enemies = [];
    this.bullets = [];
    this.pickups = [];
    if (step !== 4) {
      this.echoes = [];
      this.history = [];
      this.player.echoCharges = this.stats.echoes;
      this.player.echoCd = 0;
    }
    this.player.dashCd = 0;
    if (step === 1) this.target(90, 130);
    if (step === 4) this.burstScene(this.echoes[0] || this.player);
    this.onEvent("practice-step", step);
  }
  retry() {
    const step = this.practice.step;
    if (step >= PRACTICE_STEPS.length) return;
    this.echoes = [];
    this.history = [];
    Object.assign(this.player, {
      x: step === 3 ? 90 : 240,
      y: step === 3 ? 160 : 230,
      dash: 0,
      fireCd: 0,
      echoCd: 0,
      echoCharges: this.stats.echoes,
    });
    this.setStep(step);
  }
  updateEnemy(e, dt) {
    e.age += dt;
    e.flash = Math.max(0, e.flash - dt);
  }
  hurt() {}
  damageEnemy(e, amount, source, critical) {
    const before = e.hp;
    super.damageEnemy(e, amount, source, critical);
    if (!this.practice || e.hp >= before) return;
    if (this.practice.step === 1 && source === "shot")
      this.practice.shotHit = true;
    if (this.practice.step === 3 && source === "thread")
      this.practice.threadHit = true;
    if (this.practice.step === 4 && source === "burst")
      this.practice.burstHit = true;
  }
  dash(mx, my) {
    super.dash(mx, my);
    if (this.practice?.step === 2) this.practice.dashed = true;
  }
  castEcho() {
    super.castEcho();
    if (this.practice?.step === 4) this.burstScene(this.echoes[0]);
  }
  guardBullet(bullet, guard) {
    const guarded = super.guardBullet(bullet, guard);
    if (guarded && this.practice?.step === 3 && this.practice.phase === "guard")
      this.practice.threadGuard = true;
    return guarded;
  }
  guardScene() {
    const segment = this.threadGuards().sort(
      (a, b) => distance(b.a, b.b) - distance(a.a, a.b),
    )[0];
    if (!segment) return;
    const { a, b } = segment,
      length = distance(a, b);
    const nx = -(b.y - a.y) / length,
      ny = (b.x - a.x) / length;
    const point = {
      x: (a.x + b.x) / 2 - nx * 34,
      y: (a.y + b.y) / 2 - ny * 34,
    };
    this.makeBullet(point, Math.atan2(ny, nx), 0, 90, false, "#efa88c").life =
      2;
  }
  burstScene(echo) {
    this.enemies = [];
    this.bullets = [];
    this.pickups = [];
    const end = echo.frames?.at(-1) || echo;
    const point = {
      x: clamp(end.x - 18, 60, 420),
      y: clamp(end.y + 24, 60, 250),
    };
    this.target(point.x, point.y);
    for (let i = 0; i < 6; i++) {
      const angle = (i * TAU) / 6;
      this.makeBullet(
        {
          x: point.x + Math.cos(angle) * 4,
          y: point.y + Math.sin(angle) * 4,
        },
        angle,
        0,
        0,
        false,
        "#efa88c",
      );
      this.bullets.at(-1).life = 60;
    }
  }
  release() {
    if (this.practice?.step === 4) this.practice.burstHit = false;
    const before = this.bullets.filter((b) => !b.friendly && b.life > 0).length;
    super.release();
    const after = this.bullets.filter((b) => !b.friendly && b.life > 0).length;
    if (
      this.practice?.step === 4 &&
      this.practice.burstHit &&
      before > 0 &&
      after === 0
    )
      this.practice.released = true;
  }
  update(dt, controls = {}) {
    if (this.practice.step >= PRACTICE_STEPS.length) return;
    if (this.practice.step === 3 && this.practice.phase === "guard") {
      this.practice.guardCd -= dt;
      if (this.practice.guardCd <= 0) {
        this.guardScene();
        this.practice.guardCd = 0.8;
      }
    }
    super.update(dt, controls);
    const p = this.practice;
    if (p.step === 0 && distance(this.player, { x: 90, y: 230 }) < 18)
      this.setStep(1);
    else if (p.step === 1 && p.shotHit) this.setStep(2);
    else if (
      p.step === 2 &&
      p.dashed &&
      distance(this.player, { x: 300, y: 230 }) < 22
    )
      this.setStep(3);
    else if (p.step === 3) {
      if (
        p.phase === "approach" &&
        distance(this.player, { x: 90, y: 160 }) < 18
      ) {
        p.phase = "cross";
        p.origin = { x: this.player.x, y: this.player.y };
        this.history = [];
        this.echoes = [];
        this.target(200, p.origin.y);
        this.onEvent("practice-step", 3);
      }
      if (p.phase === "cross" && this.enemies.length === 0)
        this.target(200, p.origin.y);
      if (p.threadHit && p.phase === "cross") {
        p.phase = "guard";
        p.guardCd = 0.8;
        this.enemies = [];
        this.bullets = [];
        this.pickups = [];
        this.onEvent("practice-step", 3);
      }
      if (p.threadGuard) this.setStep(4);
    } else if (p.step === 4 && p.released) {
      this.sound("clear");
      this.setStep(5);
    }
  }
  get practiceHint() {
    if (this.practice.step === 3 && this.practice.phase === "guard")
      return this.echoes.length
        ? "残響から離れたまま、糸の中ほどへ来る弾を一つほどきましょう。足元は守れません。"
        : "残響が消えたら、右の輪へ歩いてQでもう一度。糸の中ほどで弾をほどきます。";
    if (this.practice.step === 3 && this.practice.phase === "cross")
      return "右の輪まで歩いてQ。昨日のあなたと今のあなたの間に、影を挟みましょう。";
    if (this.practice.step === 4 && this.echoes.length === 0)
      return "残響が消えたら、Qでもう一度。残響のそばに現れる影と弾をRでほどきます。";
    if (this.practice.step === 4)
      return this.practiceReleaseReady
        ? "今の残響なら、影と弾に届きます。Rでほどきましょう。"
        : "残響が影と弾の近くを通るときにR。光は、今のあなたではなく残響の位置で広がります。";
    return (
      PRACTICE_STEPS[this.practice.step]?.hint || "灯りの織り方を覚えました。"
    );
  }
  get practiceReleaseReady() {
    const bullets = this.bullets.filter((b) => !b.friendly && b.life > 0);
    return this.echoes.some(
      (echo) =>
        this.enemies.some(
          (e) => distance(e, echo) < this.stats.burstRadius + e.r,
        ) &&
        bullets.length > 0 &&
        bullets.every((b) => distance(b, echo) < this.stats.burstRadius),
    );
  }
  get practiceMarkers() {
    const { step, phase } = this.practice;
    if (step === 3 && phase === "guard") {
      const segment = this.threadGuards()[0];
      return segment
        ? [
            {
              x: (segment.a.x + segment.b.x) / 2,
              y: (segment.a.y + segment.b.y) / 2,
              label: "中ほどで弾をほどく",
            },
          ]
        : [{ x: 320, y: this.practice.origin.y, label: "離れて糸を張る" }];
    }
    if (step === 0) return [{ x: 90, y: 230, label: "ここまで歩く" }];
    if (step === 2)
      return [
        {
          x: 300,
          y: 230,
          label: this.practice.dashed ? "輪まで歩く" : "途中で回避",
        },
      ];
    if (step === 3)
      return [
        { x: 90, y: 160, label: "昨日のはじまり", dim: phase === "cross" },
        {
          x: 320,
          y: phase === "cross" ? this.practice.origin.y : 160,
          label: "ここから残響",
          dim: phase === "approach",
        },
      ];
    return [];
  }
}
