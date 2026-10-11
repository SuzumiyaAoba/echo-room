import { ENEMIES, actIndex, roomIndex } from "../content.js";
import { memoryWardReadout } from "../memory-ward.js";
import { bossTelegraph, healthTrailPercent } from "../combat-feedback.js";
import { echoReadout } from "../echo-feedback.js";
import {
  releaseReadout,
  releaseLabel,
  releaseDescription,
} from "../release-readout.js";
import { echoRecording, recordingLabel } from "../recording-preview.js";
import { aimLabel } from "../aim-feedback.js";
import { PRACTICE_STEPS } from "../practice.js";
import { PAD_HINTS } from "../gamepad.js";
import { arrowMovement } from "../keybindings.js";
import { storedLightCount } from "../counter-thread.js";
import { escape, icon, timeText } from "./markup.js";

function chargeSlots(capacity) {
  return Array.from(
    { length: capacity },
    () => '<i class="charge-slot"><b></b></i>',
  ).join("");
}
export function hudMarkup(
  game,
  { controlKey, movementKeys, device, aim, settings },
) {
  if (!game) return "";
  return `<div class="hud"><div class="health-hud">${icon("heart")}<div class="health-wrap"><div class="health-bar"><div class="health-track"><div class="health-trail" id="health-trail" aria-hidden="true"></div><div class="health-fill" id="health-fill"></div></div></div><div class="health-number number" id="health-number"></div></div></div><div class="hud-location">${game.practice ? "灯守の練習場" : game.biome.name}<small>${game.practice ? "体力は減りません" : `${String(actIndex(game.run.stage) + 1).padStart(2, "0")} / ${String(roomIndex(game.run.stage) + 1).padStart(2, "0")} · <span id="run-time">00:00</span>`}</small></div>${game.practice ? '<div class="hud-wallet"><span id="practice-count" class="number">1 / 5</span></div><button data-action="practiceretry" aria-label="お題をやり直す">↺</button>' : `<div class="hud-wallet">${icon("scrap")}<span id="scrap" class="number">0</span></div><button data-action="inventory" aria-label="織片を確認">織</button>`}<button data-action="pause" aria-label="一時停止">Ⅱ</button></div>
  <div class="bossbar" id="bossbar" hidden><div class="name"><span id="boss-name"></span><span id="boss-phase" class="boss-phase"></span></div><div class="bar"><div class="fill" id="boss-fill"></div></div><div class="boss-intent" id="boss-intent"></div><div class="boss-ward" id="boss-ward" hidden><span id="boss-ward-state"></span><span class="boss-ward-meter" id="boss-ward-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i id="boss-ward-fill"></i></span></div><div class="boss-telegraph" id="boss-telegraph" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" hidden><div class="boss-clock"><i id="boss-clock-fill"></i></div><span id="boss-countdown"></span></div></div>
  ${game.apparatus ? `<div class="apparatus-hud"><strong>${game.apparatus.name}</strong><span id="apparatus-status"></span><small>${game.apparatus.short}</small>${game.apparatus.kind === "furnace" ? '<div class="pressure-bar"><i id="pressure-fill"></i></div>' : ""}</div>` : ""}
  <div class="action-dock"><div class="action-feedback" id="action-feedback" aria-hidden="true" hidden><kbd id="action-feedback-key"></kbd><strong id="action-feedback-name"></strong><span id="action-feedback-detail"></span></div><span class="sr-only" id="action-feedback-announcement" role="status" aria-live="polite" aria-atomic="true"></span><div class="ability">${icon("dash")}<div><span><kbd data-control="dash">${escape(controlKey("dash"))}</kbd> 回避</span><small id="dash-status">READY</small><div class="cooldown"><i id="dash-cd"></i></div></div></div><div class="ability">${icon("echo")}<div><span><kbd data-control="echo">${escape(controlKey("echo"))}</kbd> 残響</span><small id="echo-status">READY</small><div class="charge-meter" id="echo-capacity" role="img" aria-label="残響の手持ち">${chargeSlots(game.stats.echoes)}</div><small id="echo-next" class="echo-detail"></small></div></div><div class="ability">${icon("star")}<div><span><kbd data-control="burst">${escape(controlKey("burst"))}</kbd> 解放</span><small id="burst-status">残響をほどく</small><small id="release-targets" class="echo-detail" role="img" title="解放の爆発が届く影と消せる敵弾" hidden></small><small id="echo-life-status" class="echo-detail" hidden></small><div class="cooldown"><i id="burst-cd"></i></div></div></div><div class="dock-hint"><kbd data-control="move">${escape(movementKeys())}</kbd> 移動<br><span class="fire-hint"><kbd data-control="fire">${escape(controlKey("fire"))}</kbd><span data-mouse-fire>${device === "pad" ? "" : " / クリック"}</span> 射撃</span><small id="aim-status">${aimLabel(aim, settings)}</small></div></div>
  <div class="touch-controls"><div class="stick" data-stick="move" aria-label="移動スティック"></div><div class="touch-actions"><button data-touch-key="Space" data-touch-action="dash">回避</button><button data-touch-key="KeyQ" data-touch-action="echo">残響</button><button data-touch-key="KeyR" data-touch-action="burst">解放</button><button data-touch-key="KeyE" data-touch-action="interact">進む</button></div><div class="stick" data-stick="aim" aria-label="照準・射撃スティック"></div></div>`;
}

export function updateReleaseReadout(ui, game) {
  const node = ui.querySelector("#release-targets");
  if (!game || !node) return;
  const readout = releaseReadout(game);
  const hidden = !readout.active;
  if (node.hidden !== hidden) node.hidden = hidden;
  const text = readout.active ? releaseLabel(readout) : "";
  if (node.textContent !== text) node.textContent = text;
  const description = releaseDescription(readout);
  if (node.getAttribute("aria-label") !== description)
    node.setAttribute("aria-label", description);
}

export function updateHud(
  ui,
  game,
  { settings, aim, device, controlKey, currentControlText, notice },
) {
  if (!game) return;
  const set = (id, text) => {
      const el = ui.querySelector(`#${id}`);
      if (el) el.textContent = text;
    },
    width = (id, value) => {
      const el = ui.querySelector(`#${id}`);
      if (el) el.style.width = `${Math.max(0, Math.min(100, value))}%`;
    };
  set("health-number", `${Math.ceil(game.run.hp)} / ${game.run.maxHp}`);
  set("aim-status", aimLabel(aim, settings));
  width("health-fill", (game.run.hp / game.run.maxHp) * 100);
  width("health-trail", healthTrailPercent(game));
  const health = ui.querySelector(".health-hud");
  if (health) health.dataset.impact = game.hitCue?.kind || "";
  set("scrap", game.run.scrap);
  set("run-time", timeText(game.run.time));
  if (game.practice) {
    const step = game.practice.step;
    const change = (id, value) => {
      const el = ui.querySelector(`#${id}`);
      if (el && el.textContent !== value) el.textContent = value;
    };
    change(
      "practice-title",
      `${Math.min(step + 1, 5)}. ${PRACTICE_STEPS[step]?.title || "灯りを織れました"}`,
    );
    change("practice-hint", currentControlText(game.practiceHint));
    change(
      "practice-keys",
      (device === "pad"
        ? [
            PAD_HINTS.move,
            `${PAD_HINTS.fire} · 右スティック`,
            PAD_HINTS.dash,
            PAD_HINTS.echo,
            PAD_HINTS.burst,
          ][step] || ""
        : currentControlText(PRACTICE_STEPS[step]?.keys || "")
      ).replace(
        " / 矢印",
        arrowMovement(settings.keybindings) ? " / 矢印" : "",
      ),
    );
    set("practice-count", `${Math.min(step + 1, 5)} / 5`);
    for (const el of ui.querySelectorAll("[data-practice-step]")) {
      el.classList.toggle("done", Number(el.dataset.practiceStep) < step);
      el.classList.toggle("current", Number(el.dataset.practiceStep) === step);
    }
  }
  width("dash-cd", (1 - game.player.dashCd / game.stats.dashCooldown) * 100);
  set(
    "dash-status",
    game.player.dashCd > 0 ? `${game.player.dashCd.toFixed(1)}s` : "READY",
  );
  const feedback = ui.querySelector("#action-feedback");
  if (feedback) {
    feedback.hidden = !notice;
    feedback.dataset.action = notice?.action || "";
    feedback.dataset.reason = notice?.reason || "";
    if (notice) {
      set("action-feedback-key", controlKey(notice.action));
      ui.querySelector("#action-feedback-key").hidden = device === "touch";
      set("action-feedback-name", notice.label);
      set("action-feedback-detail", notice.detail);
    }
    const announcement = ui.querySelector("#action-feedback-announcement");
    const text = notice?.announcement || "";
    if (announcement && announcement.textContent !== text)
      announcement.textContent = text;
  }
  const echoState = echoReadout(game);
  const recording = echoRecording(game);
  set(
    "echo-status",
    echoState.recording
      ? "軌跡を記録中…"
      : echoState.charges > 0
        ? `READY · ${echoState.charges}/${echoState.capacity}`
        : `0/${echoState.capacity} · 充填中`,
  );
  set(
    "echo-next",
    echoState.charges < echoState.capacity
      ? echoState.nextSeconds
        ? `次の1回 ${echoState.nextSeconds.toFixed(1)}秒`
        : "次の1回 まもなく"
      : recordingLabel(recording),
  );
  const capacity = ui.querySelector("#echo-capacity");
  if (capacity) {
    capacity.setAttribute(
      "aria-label",
      `残響の手持ち ${echoState.charges}/${echoState.capacity}回${echoState.nextSeconds ? `、次の1回まで${echoState.nextSeconds.toFixed(1)}秒` : ""}、${recordingLabel(recording)}、射撃${recording?.shots.length || 0}回。四角の始点から残響が${recording?.playback === "reverse" ? "今の場所から昔の場所へ逆再生します。" : "再生します。"}`,
    );
    if (capacity.children.length !== echoState.capacity)
      capacity.innerHTML = chargeSlots(echoState.capacity);
    for (const [index, slot] of [...capacity.children].entries()) {
      const ready = index < echoState.charges,
        charging = index === echoState.charges;
      slot.dataset.state = ready ? "ready" : charging ? "charging" : "empty";
      slot.firstElementChild.style.width = `${ready ? 100 : charging ? Math.round(echoState.chargingFraction * 100) : 0}%`;
    }
  }
  width("burst-cd", game.echoes.length ? 100 : 0);
  set(
    "burst-status",
    game.echoes.length
      ? game.run.upgrades.counter
        ? `${game.echoes.length}残響 · 蓄え${storedLightCount(game)}`
        : `${game.echoes.length} 残響を解放`
      : "残響をほどく",
  );
  updateReleaseReadout(ui, game);
  const lifeStatus = ui.querySelector("#echo-life-status");
  if (lifeStatus) {
    lifeStatus.hidden = !echoState.shortest;
    lifeStatus.dataset.urgent = String(echoState.shortest?.urgent || false);
    if (echoState.shortest)
      lifeStatus.textContent = `${game.echoes.length > 1 ? "最短" : "寿命あと"} ${echoState.shortest.seconds.toFixed(1)}秒`;
  }
  const bossbar = ui.querySelector("#bossbar");
  if (bossbar) {
    bossbar.hidden = !game.boss || game.boss.hp <= 0;
    if (!bossbar.hidden) {
      set("boss-name", ENEMIES[game.boss.kind].name);
      set("boss-phase", game.boss.phase ? "第二楽章" : "第一楽章");
      width("boss-fill", (game.boss.hp / game.boss.maxHp) * 100);
      const e = game.boss;
      const ward = memoryWardReadout(e);
      const wardRow = ui.querySelector("#boss-ward");
      wardRow.hidden = !ward;
      if (ward) {
        wardRow.dataset.state = ward.state;
        set("boss-ward-state", ward.text);
        width("boss-ward-fill", ward.fraction * 100);
        const meter = ui.querySelector("#boss-ward-meter");
        meter.hidden = ward.state === "quiet";
        meter.setAttribute(
          "aria-label",
          ward.state === "open"
            ? "記憶の盾がほどけた残り時間"
            : "記憶の盾をほどく",
        );
        meter.setAttribute(
          "aria-valuenow",
          String(Math.round(ward.fraction * 100)),
        );
        meter.setAttribute("aria-valuetext", ward.text);
      }
      const telegraph = bossTelegraph(e);
      const clock = ui.querySelector("#boss-telegraph");
      clock.hidden = !telegraph;
      if (telegraph) {
        width("boss-clock-fill", telegraph.progress * 100);
        set(
          "boss-countdown",
          `発動まで ${telegraph.remainingSeconds.toFixed(1)}秒`,
        );
        clock.setAttribute("aria-label", `${e.plan.name}の予兆`);
        clock.setAttribute(
          "aria-valuenow",
          String(Math.round(telegraph.progress * 100)),
        );
      }
      set(
        "boss-intent",
        e.state === "windup"
          ? `${e.plan.name} · ${e.plan.hint}`
          : e.state === "recover"
            ? e.kind === "heart" && e.ward
              ? "攻撃後の隙 · 記憶の盾は残っている"
              : "記憶がほどけている · 攻撃の隙"
            : e.state === "charge"
              ? "渡し守の一歩"
              : e.ward
                ? "記憶の盾 · 光糸と解放が通る"
                : "",
      );
    }
  }
  if (game.apparatus) {
    const m = game.apparatus,
      count = m.objects.filter((node) => node.lit).length;
    set(
      "apparatus-status",
      `${count}/2 ${m.object} · ${m.kind === "furnace" ? (m.warning > 0 ? "圧力上昇！" : `熱 ${Math.round(m.heat * 100)}%`) : m.wave ? "満ち潮" : m.warning > 0 ? "潮が来る" : m.restored ? "織り直しました" : "光糸で修復"}`,
    );
    width("pressure-fill", m.heat * 100);
    const el = ui.querySelector(".apparatus-hud");
    if (el) el.classList.toggle("danger", m.warning > 0);
  }
}
