import "./style.css";
import { attachNotificationLayout } from "./notification-layout.js";
import { NoticeLifetime } from "./notice-lifetime.js";
import { firstHelp } from "./first-help.js";
import { credits } from "./credits.js";
import { version as releaseVersion } from "../package.json";
import { memoryWardReadout } from "./memory-ward.js";
import { Game, createRun, forecastRoom } from "./game.js";
import { layoutThumbnail } from "./layout-preview.js";
import { rewardPlan, rewardRerollState } from "./rewards.js";
import {
  upgradeEffects,
  previewUpgrade,
  effectText,
} from "./upgrade-preview.js";
import {
  traderStock,
  forecastTrader,
  traderPrice,
  TRADER_HEAL_PRICE,
  TRADER_HEAL_AMOUNT,
} from "./trader.js";
import { PracticeGame, PRACTICE_STEPS } from "./practice.js";
import {
  BIOMES,
  WEAPONS,
  RELICS,
  UPGRADES,
  ENEMIES,
  ROUTES,
  LORE,
  BOSS_VOICES,
  rank,
  ROOM_COUNT,
  actIndex,
  roomIndex,
  isBoss,
  isCamp,
  isElite,
  roomFeature,
} from "./content.js";
import {
  SaveSession,
  loadState,
  SAVE_KEY,
  exportProfile,
  prepareImport,
  loadImportUndo,
  MAX_BACKUP_BYTES,
} from "./save.js";
import { Renderer } from "./render.js";
import { bossTelegraph, healthTrailPercent } from "./combat-feedback.js";
import { echoReadout } from "./echo-feedback.js";
import {
  releaseReadout,
  releaseLabel,
  releaseDescription,
} from "./release-readout.js";
import { echoRecording, recordingLabel } from "./recording-preview.js";
import { bellRelicDescription, bellSeconds, weavesBell } from "./bell-weave.js";
import { rewindsEchoes } from "./echo-playback.js";
import { makeReturnRecord, returnReadout } from "./return-record.js";
import { lastHitAtReturn } from "./last-impact.js";
import { ActionFeedback, captureActions } from "./action-feedback.js";
import { Input } from "./input.js";
import { PAD_HINTS, padControlText } from "./gamepad.js";
import { aimCue, aimLabel } from "./aim-feedback.js";
import { FullscreenControl } from "./fullscreen.js";
import {
  CONTROL_ACTIONS,
  bindingsFor,
  assignBinding,
  keyLabel,
  canonicalKey,
  bindingHint,
  movementHint,
  arrowMovement,
  controlText,
  normalizeKeyLabels,
  capturedKeyLabel,
} from "./keybindings.js";
import { AudioEngine } from "./audio.js";
import { scoreScene } from "./score.js";
import { storedLightCount } from "./counter-thread.js";
import { bitmap } from "./art.js";
import { iconUrl } from "./art.js";
import {
  STORIES,
  CITY_PROJECTS,
  cityProgress,
  startingFragments,
  canChooseStory,
  applyStoryChoice,
  settleCity,
} from "./story.js";

const canvas = document.querySelector("#world"),
  ui = document.querySelector("#interface");
attachNotificationLayout(
  ui,
  document.querySelector("#notifications"),
  document.querySelector("#app"),
);
const noticeLifetime = new NoticeLifetime();
const saveSession = new SaveSession(),
  savedState = saveSession.state,
  profile = savedState.profile;
const audio = new AudioEngine(profile.settings),
  renderer = new Renderer(canvas),
  actionFeedback = new ActionFeedback();
let game = null,
  paused = false,
  screen = "home",
  selection = {
    weapon: "needle",
    relic: "spool",
    difficulty: 0,
    fragment: null,
  },
  offers = [],
  codexTab = "lore",
  previousScreen = "home",
  finished = false;
let saveFailed = savedState.source === "unavailable";
let startupNotice = {
  recovery:
    "保存の破損を検出し、直前の記録から復元しました。設定から記録を書き出せます。",
  damaged:
    "保存されていた記録を読めませんでした。書き出し記録があれば、設定から取り込めます。",
}[savedState.source];
let importUndo = loadImportUndo(),
  pendingImport = null,
  practiceReturn = null,
  bindingCapture = null;
const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icon = (name, cls = "icon") =>
  `<img class="${cls}" src="${iconUrl(name)}" alt="" draggable="false">`;
const button = (action, text, cls = "", attributes = "") =>
  `<button class="pixel-button ${cls}" data-action="${action}" ${attributes}>${text}</button>`;
const timeText = (n) =>
  `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(n % 60)
    .toString()
    .padStart(2, "0")}`;
function toast(message, important = false) {
  const host = document.querySelector("#notifications");
  while (host.children.length >= 2) {
    const ordinary = host.querySelector(".toast:not(.toast-important)");
    if (!ordinary && !important) return;
    (ordinary || host.firstElementChild).remove();
  }
  const el = document.createElement("div");
  el.className = important ? "toast toast-important" : "toast";
  el.textContent = message;
  host.append(el);
  noticeLifetime.add(el, performance.now());
}
function persist() {
  const result = saveSession.save(profile);
  if (result.conflict) {
    queueMicrotask(showSaveConflict);
    return false;
  }
  const saved = result.saved;
  if (!saved && !saveFailed) {
    toast(
      "保存領域に書き込めません。今回の進行はこのタブで続けられます。",
      true,
    );
  }
  saveFailed = !saved;
  return saved;
}
function checkpoint(state = "entry") {
  if (!game || game.practice || finished) return;
  game.run.checkpoint = state;
  profile.run = structuredClone(game.run);
  persist();
}
function logoUrl() {
  const chars = {
    E: ["yyyyy", "y....", "y....", "yyyy.", "y....", "y....", "yyyyy"],
    C: [".yyyy", "y....", "y....", "y....", "y....", "y....", ".yyyy"],
    H: ["y...y", "y...y", "y...y", "yyyyy", "y...y", "y...y", "y...y"],
    O: [".yyy.", "y...y", "y...y", "y...y", "y...y", "y...y", ".yyy."],
    L: ["y....", "y....", "y....", "y....", "y....", "y....", "yyyyy"],
    M: ["y...y", "yy.yy", "y.y.y", "y...y", "y...y", "y...y", "y...y"],
  };
  const el = document.createElement("canvas");
  el.width = 96;
  el.height = 64;
  const c = el.getContext("2d");
  ["ECHO", "LOOM"].forEach((word, y) =>
    [...word].forEach((ch, x) =>
      bitmap(c, chars[ch], x * 24, y * 34, { y: y ? "#80d4bd" : "#ebdbb5" }, 4),
    ),
  );
  return el.toDataURL();
}
const logo = logoUrl();
const input = new Input(
  canvas,
  () => {
    if (screen === "settings") backFromSettings();
    else if (screen === "about") showSettings();
    else if (screen === "notices") showAbout();
    else if (screen === "practice-complete") endPractice();
    else if (game && ["combat", "cleared"].includes(game.mode)) {
      if (screen === "pause") resume();
      else if (screen === "play") showPause();
      else if (["help", "inventory"].includes(screen)) resume();
    } else if (screen === "import") showSettings();
    else if (
      ["setup", "codex", "workshop", "help", "city", "returnrecord"].includes(
        screen,
      ) &&
      !game
    )
      home();
  },
  () => profile.settings.keybindings,
);
input.onPadPause = () => {
  if (screen === "play") showPause();
};
input.onDeviceChange = () => updateControlHints();
input.onPadDisconnect = () => {
  if (input.device === "pad" && game && screen === "play") {
    showPause();
    toast("ゲームパッドの接続が切れたため、航路を停止しました。", true);
  }
};

const fullscreen = new FullscreenControl(document, {
  onUpdate: updateFullscreenButtons,
  onChange: () => {
    cancelBindingCapture("変更をキャンセルしました。", false);
    input.clear();
    if (game && screen === "play") showPause();
  },
  onError: toast,
});
function fullscreenButton(cls = "ghost") {
  return button(
    "fullscreen",
    fullscreen.label,
    cls,
    `aria-pressed="${fullscreen.active}" ${fullscreen.disabled ? "disabled" : ""}`,
  );
}
function updateFullscreenButtons() {
  for (const target of ui.querySelectorAll('[data-action="fullscreen"]')) {
    target.textContent = fullscreen.label;
    target.disabled = fullscreen.disabled;
    target.setAttribute("aria-pressed", String(fullscreen.active));
  }
}
window.addEventListener(
  "keydown",
  (event) => {
    if (event.code !== "Escape" || !fullscreen.active) return;
    // Leave the browser's Escape action intact. It must not also resume the
    // pause menu or close another dialog while fullscreen is being exited.
    event.stopImmediatePropagation();
    input.clear();
    if (game && screen === "play") showPause();
    if (!event.repeat) void fullscreen.toggle();
  },
  { capture: true },
);

function home() {
  bindingCapture = null;
  game = null;
  practiceReturn = null;
  paused = false;
  screen = "home";
  input.clear();
  document.querySelector("#notifications").replaceChildren();
  if (saveFailed)
    toast("保存領域に書き込めません。設定から記録を書き出せます。", true);
  if (startupNotice) {
    toast(startupNotice, true);
    startupNotice = null;
  }
  ui.innerHTML = `<div class="home-shade"></div>
    <div class="topbar"><span class="brand-small">A LIGHT FOR TOMORROW</span><div class="home-tools"><span class="memory-count">${icon("star")} <span class="number">${profile.memory}</span></span>${fullscreenButton("small ghost")}${button("settings", "設定", "small ghost")}</div></div>
    <section class="home"><div class="eyebrow">MEMORY-WOVEN ROGUELITE</div><img class="wordmark" src="${logo}" alt="ECHO LOOM"><h1>残響の灯台</h1><p class="home-copy">昨日のあなたが、<br><em>明日の道を織る。</em></p>
    <div class="home-actions">${profile.run ? button("continue", `<span>航路を続ける<small>CONTINUE · ${escape(BIOMES[actIndex(profile.run.stage)].name)}</small></span><span class="arrow">→</span>`, "primary launch") : button("setup", '<span>灯りをともす<small>BEGIN AN EXPEDITION</small></span><span class="arrow">→</span>', "primary launch")}
    ${profile.run ? button("newrun", "新しい航路", "ghost small") : ""}<div class="home-links">${button("workshop", "灯守の工房", "ghost")}${button("city", "街を織り直す", "ghost")}${button("codex", "記憶の書庫", "ghost")}${button("help", "遊び方", "ghost")}</div>${profile.lastReturn ? `<div class="home-aftercare">${button("practice", "灯りの練習", "practice-link ghost small")}${button("lastreturn", "直近の旅", "ghost small")}</div>` : button("practice", "灯りの練習", "practice-link ghost small")}</div><div class="home-note" data-pad-home data-original="${profile.victories ? "朝が戻っても、まだ届かない灯りがある。" : "ひとりの灯守。いくつもの昨日。"}">${profile.victories ? "朝が戻っても、まだ届かない灯りがある。" : "ひとりの灯守。いくつもの昨日。"}</div></section>
    <div class="art-caption">第七灯台<br><span style="color:#698e81;letter-spacing:3px">${profile.victories ? "05:12 · 明日の岸" : "23:47 · 潮待ち"}</span></div><div class="home-bottom"><span>ORIGINAL PIXEL WORLD / ECHO LOOM</span><span>v${releaseVersion} · BROWSER EDITION</span></div>`;
  updateControlHints();
}
function panel(
  body,
  { title = "", eyebrow = "", compact = false, close = null, footer = "" } = {},
) {
  return `<div class="overlay"><section class="panel ${compact ? "compact" : ""}" role="dialog" aria-modal="true" aria-label="${escape(title)}"><div class="panel-head"><div><div class="eyebrow" data-pad-menu data-original="${escape(eyebrow)}">${eyebrow}</div><h2>${title}</h2></div>${close ? `<button class="close" data-action="${close}" aria-label="閉じる">×</button>` : ""}</div><div class="panel-content">${body}</div>${footer ? `<div class="panel-footer">${footer}</div>` : ""}</section></div>`;
}
function mountDialog(html, name) {
  bindingCapture = null;
  paused = true;
  screen = name;
  input.clear();
  ui.innerHTML = (game ? hud() : '<div class="home-shade"></div>') + html;
  if (game) updateHud();
  updateControlHints();
  queueMicrotask(() => {
    const dialog = ui.querySelector(".overlay");
    // The last dodge or a held action must not activate a new expedition.
    // Focus the result itself; Tab still reaches the return actions normally.
    if (["victory", "defeat"].includes(name)) {
      const result = dialog?.querySelector('[role="dialog"]');
      if (result) {
        result.tabIndex = -1;
        result.focus({ preventScroll: true });
      }
      return;
    }
    (
      dialog?.querySelector("button.primary:not(:disabled)") ||
      dialog?.querySelector("button:not(:disabled)")
    )?.focus({ preventScroll: true });
  });
}
function setup(previousRun = null) {
  selection = {
    weapon: previousRun?.weapon || "needle",
    relic: previousRun?.relic || "spool",
    difficulty: previousRun?.difficulty || 0,
    fragment: startingFragments(profile).includes(previousRun?.startingFragment)
      ? previousRun.startingFragment
      : null,
  };
  showSetup();
}
function showSetup(seed = "", scrollTop = 0) {
  const cards = WEAPONS.map(
    (w) =>
      `<button class="card ${selection.weapon === w.id ? "selected" : ""}" data-action="weapon" data-id="${w.id}" ${profile.unlocked.includes(w.id) ? "" : "disabled"}>${icon("needle")}<span class="tag">${w.en}</span><h3>${w.name}</h3><p>${w.desc}</p><span class="detail">${profile.unlocked.includes(w.id) ? `威力 ${w.damage} × ${w.shots} / ${w.rate}秒` : "灯守の工房で解放"}</span></button>`,
  ).join("");
  mountDialog(
    panel(
      `<p>残響を織り、沈んだ街の奥へ。持ち帰った記憶が、次の旅をひらく。</p><div class="section-label">射出器 / YOUR NEEDLE</div><div class="cards">${cards}</div><div class="section-label">お守り / KEEPSAKE</div><div class="loadout-row">${RELICS.map((r) => `<button class="loadout-item ${selection.relic === r.id ? "selected" : ""}" data-action="relic" data-id="${r.id}" title="${r.desc}" ${profile.unlocked.includes(r.id) ? "" : "disabled"}>${icon(r.icon)}${r.name}</button>`).join("")}</div><p id="relic-description" style="margin-top:10px;font-size:10px">${RELICS.find((r) => r.id === selection.relic).desc}</p>${fragmentSetup()}<div class="seed-row"><label class="field">航路番号 / 空欄で新しい航路<input id="seed" maxlength="32" value="${escape(seed)}" placeholder="例：LIGHT-001" autocomplete="off"></label><div class="field">潮の深さ<div class="segmented">${["凪", "荒潮", "深淵"].map((name, i) => `<button data-action="difficulty" data-id="${i}" class="${selection.difficulty === i ? "selected" : ""}" ${i > 0 && !profile.victories ? "disabled" : ""}>${name}</button>`).join("")}</div></div></div>`,
      {
        title: "旅の支度",
        eyebrow: "PREPARE THE LIGHT",
        close: "home",
        footer: `${button("daily", "今日の航路", "ghost small")} ${button("start", "この灯りで出発する →", "primary")}`,
      },
    ),
    "setup",
  );
  ui.querySelector(".panel-content").scrollTop = scrollTop;
}
function fragmentSetup() {
  const available = startingFragments(profile);
  return `<div class="section-label">はじまりの織片 / A THREAD FROM HOME</div><div class="loadout-row starting-fragments">${button("fragment", "持ち出さない", `loadout-item ${!selection.fragment ? "selected" : ""}`, 'data-id="none"')}${CITY_PROJECTS.map(
    (p) => {
      const u = UPGRADES.find((u) => u.id === p.fragment);
      return `<button class="loadout-item ${selection.fragment === p.fragment ? "selected" : ""}" data-action="fragment" data-id="${p.fragment}" ${available.includes(p.fragment) ? "" : "disabled"} title="${u.desc}">${icon(u.icon)}${u.name}</button>`;
    },
  ).join(
    "",
  )}</div><p class="starting-description">${selection.fragment ? UPGRADES.find((u) => u.id === selection.fragment).desc : "街を修復すると、織片を一つだけ旅の初めから持ち出せます。今日の航路では持ち出しません。"}</p>`;
}
function start(seed = null) {
  const entered = ui.querySelector("#seed")?.value.trim();
  const value =
    seed ||
    entered ||
    `LOOM-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase()}`;
  const run = createRun(
    value,
    selection.weapon,
    selection.relic,
    selection.difficulty,
  );
  if (startingFragments(profile).includes(selection.fragment)) {
    run.startingFragment = selection.fragment;
    run.upgrades[selection.fragment] = 1;
    if (!profile.seen.includes(selection.fragment))
      profile.seen.push(selection.fragment);
  }
  profile.attempts++;
  profile.run = structuredClone(run);
  finished = false;
  persist();
  enter(run);
  if (profile.attempts === 1) showHelp(true);
}
function enter(run) {
  game = new Game(run, gameEvent);
  paused = false;
  screen = "play";
  input.clear();
  checkpoint();
  showPlay();
  if (isCamp(run.stage)) showCamp();
}
function continueRun() {
  const run = structuredClone(profile.run),
    state = run.checkpoint;
  finished = false;
  game = new Game(run, gameEvent);
  input.clear();
  if (state === "cleared" || state === "reward") {
    game.mode = state;
    game.enemies = [];
    game.spawnQueue = [];
  }
  showPlay();
  if (state === "reward") showReward();
  else if (isCamp(run.stage) && state !== "cleared") showCamp();
  toast(
    state === "reward"
      ? "織片を選ぶところから再開しました"
      : state === "shop"
        ? "行商で買いものを続けられます"
        : state === "cleared"
          ? "灯りを織った部屋から再開しました"
          : "部屋の入口から再開しました",
  );
}
function chargeSlots(capacity) {
  return Array.from(
    { length: capacity },
    () => '<i class="charge-slot"><b></b></i>',
  ).join("");
}
function hud() {
  if (!game) return "";
  return `<div class="hud"><div class="health-hud">${icon("heart")}<div class="health-wrap"><div class="health-bar"><div class="health-track"><div class="health-trail" id="health-trail" aria-hidden="true"></div><div class="health-fill" id="health-fill"></div></div></div><div class="health-number number" id="health-number"></div></div></div><div class="hud-location">${game.practice ? "灯守の練習場" : game.biome.name}<small>${game.practice ? "体力は減りません" : `${String(actIndex(game.run.stage) + 1).padStart(2, "0")} / ${String(roomIndex(game.run.stage) + 1).padStart(2, "0")} · <span id="run-time">00:00</span>`}</small></div>${game.practice ? '<div class="hud-wallet"><span id="practice-count" class="number">1 / 5</span></div><button data-action="practiceretry" aria-label="お題をやり直す">↺</button>' : `<div class="hud-wallet">${icon("scrap")}<span id="scrap" class="number">0</span></div><button data-action="inventory" aria-label="織片を確認">織</button>`}<button data-action="pause" aria-label="一時停止">Ⅱ</button></div>
  <div class="bossbar" id="bossbar" hidden><div class="name"><span id="boss-name"></span><span id="boss-phase" class="boss-phase"></span></div><div class="bar"><div class="fill" id="boss-fill"></div></div><div class="boss-intent" id="boss-intent"></div><div class="boss-ward" id="boss-ward" hidden><span id="boss-ward-state"></span><span class="boss-ward-meter" id="boss-ward-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i id="boss-ward-fill"></i></span></div><div class="boss-telegraph" id="boss-telegraph" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" hidden><div class="boss-clock"><i id="boss-clock-fill"></i></div><span id="boss-countdown"></span></div></div>
  ${game.apparatus ? `<div class="apparatus-hud"><strong>${game.apparatus.name}</strong><span id="apparatus-status"></span><small>${game.apparatus.short}</small>${game.apparatus.kind === "furnace" ? '<div class="pressure-bar"><i id="pressure-fill"></i></div>' : ""}</div>` : ""}
  <div class="action-dock"><div class="action-feedback" id="action-feedback" aria-hidden="true" hidden><kbd id="action-feedback-key"></kbd><strong id="action-feedback-name"></strong><span id="action-feedback-detail"></span></div><span class="sr-only" id="action-feedback-announcement" role="status" aria-live="polite" aria-atomic="true"></span><div class="ability">${icon("dash")}<div><span><kbd data-control="dash">${escape(controlKey("dash"))}</kbd> 回避</span><small id="dash-status">READY</small><div class="cooldown"><i id="dash-cd"></i></div></div></div><div class="ability">${icon("echo")}<div><span><kbd data-control="echo">${escape(controlKey("echo"))}</kbd> 残響</span><small id="echo-status">READY</small><div class="charge-meter" id="echo-capacity" role="img" aria-label="残響の手持ち">${chargeSlots(game.stats.echoes)}</div><small id="echo-next" class="echo-detail"></small></div></div><div class="ability">${icon("star")}<div><span><kbd data-control="burst">${escape(controlKey("burst"))}</kbd> 解放</span><small id="burst-status">残響をほどく</small><small id="release-targets" class="echo-detail" role="img" title="解放の爆発が届く影と消せる敵弾" hidden></small><small id="echo-life-status" class="echo-detail" hidden></small><div class="cooldown"><i id="burst-cd"></i></div></div></div><div class="dock-hint"><kbd data-control="move">${escape(movementKeys())}</kbd> 移動<br><span class="fire-hint"><kbd data-control="fire">${escape(controlKey("fire"))}</kbd><span data-mouse-fire>${input.device === "pad" ? "" : " / クリック"}</span> 射撃</span><small id="aim-status">${aimLabel(input.aimView(), profile.settings)}</small></div></div>
  <div class="touch-controls"><div class="stick" data-stick="move" aria-label="移動スティック"></div><div class="touch-actions"><button data-touch-key="Space" data-touch-action="dash">回避</button><button data-touch-key="KeyQ" data-touch-action="echo">残響</button><button data-touch-key="KeyR" data-touch-action="burst">解放</button><button data-touch-key="KeyE" data-touch-action="interact">進む</button></div><div class="stick" data-stick="aim" aria-label="照準・射撃スティック"></div></div>`;
}
function showPlay(banner = false) {
  paused = false;
  screen = "play";
  ui.innerHTML = hud();
  if (game.practice) {
    ui.insertAdjacentHTML(
      "beforeend",
      `<aside class="practice-guide" aria-label="練習のお題"><div class="practice-progress" aria-hidden="true">${PRACTICE_STEPS.map((_, i) => `<i data-practice-step="${i}"></i>`).join("")}</div><strong id="practice-title"></strong><p id="practice-hint" role="status" aria-live="polite"></p><small id="practice-keys"></small></aside>`,
    );
  }
  updateHud();
  input.bindTouch(ui);
  canvas.tabIndex = 0;
  canvas.focus({ preventScroll: true });
  if (banner) {
    const el = document.createElement("div");
    el.className = "room-banner";
    el.innerHTML = `<div class="name">${game.biome.name}</div><div class="subtitle">${game.biome.en}</div>`;
    ui.append(el);
    setTimeout(() => el.remove(), 4000);
  }
  if (!game.practice && game.run.stage === 0 && !game.run.echoesCast) {
    const el = document.createElement("div");
    el.className = "room-tip";
    el.dataset.controlText = "移動しながら射撃 → Q で残響 → 敵と弾へ糸を張る";
    el.textContent = currentControlText(el.dataset.controlText);
    ui.append(el);
  }
  if (game.apparatus && game.roomTime === 0 && game.mode === "combat")
    toast(game.apparatus.hint);
  updateHud();
}
function updateReleaseReadout() {
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

function updateHud() {
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
  set("aim-status", aimLabel(input.aimView(), profile.settings));
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
      (input.device === "pad"
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
        arrowMovement(profile.settings.keybindings) ? " / 矢印" : "",
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
  const notice = screen === "play" ? actionFeedback.read(game) : null;
  const feedback = ui.querySelector("#action-feedback");
  if (feedback) {
    feedback.hidden = !notice;
    feedback.dataset.action = notice?.action || "";
    feedback.dataset.reason = notice?.reason || "";
    if (notice) {
      set("action-feedback-key", controlKey(notice.action));
      ui.querySelector("#action-feedback-key").hidden =
        input.device === "touch";
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
  updateReleaseReadout();
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
function gameEvent(type, data) {
  if (type === "sound") {
    audio.sfx(data);
    return;
  }
  if (type === "clear") {
    game.collectAllScrap();
    if (game.run.stage === ROOM_COUNT - 1) {
      finish(true);
      return;
    }
    const killedBoss = isBoss(game.run.stage) || isElite(game.run.stage);
    if (isBoss(game.run.stage) && !profile.lore.includes(game.biome.boss)) {
      profile.lore.push(game.biome.boss);
      toast("新しい記憶が書庫に戻りました");
    }
    if (data === "rest") {
      game.heal(30);
      toast("潮待ちの灯り · 体力 +30");
    } else if (data === "salvage") {
      game.run.scrap += 35;
      toast("沈船の宝庫 · 歯車 +35");
    }
    if (data === "loom" || killedBoss) showReward();
    else completeRoom();
  }
  if (type === "death") finish(false);
  if (type === "exit") showRoutes();
  if (type === "boss") toast(BOSS_VOICES[game.boss.kind].opening);
  if (type === "keeper") toast(BOSS_VOICES[data].ending);
  if (type === "cord")
    toast("糸喰いが仲間を結ぶ。赤い結びは光糸か解放で切れます。");
  if (type === "cordcut") toast("結びを切り、仲間の護りと射撃をほどきました。");
  if (type === "refraction")
    toast(
      "硝子針に二つの光片が加わりました。離れた残響を敵との間に置くと分光できます。",
    );
  if (type === "stitch")
    toast(
      "合わせ縫い。現在の針で針目を残し、1.2秒以内に残響の針を重ねると追加の光になります。",
    );
  if (type === "stolenecho")
    toast(
      "糸喰いが昨日を逆走する。赤い足跡を避け、動き出した影は光糸・解放でほどけます。",
    );
  if (type === "apparatus") {
    if (game.mode === "cleared") checkpoint("cleared");
    toast(`${data}を織り直しました · 記憶 +3 / 歯車 +8`);
  }
  if (type === "beacon") {
    if (game.mode === "cleared") checkpoint("cleared");
    toast("忘れられた灯りを織りました · 記憶 +4 / 体力 +12");
  }
}
function showReward() {
  game.mode = "reward";
  offers = game.offer();
  const { theme, promised } = rewardPlan(game.run);
  const reroll = rewardRerollState(game.run);
  const rerollLabel =
    reroll.reason === "limit"
      ? "この部屋は二回まで"
      : reroll.reason === "exhausted"
        ? "ほかの候補なし"
        : `織り直す / 歯車 ${reroll.cost}`;
  const offerCount = offers.length === 3 ? "三枚" : `${offers.length}枚`;
  offers.forEach((u) => {
    if (!profile.seen.includes(u.id)) profile.seen.push(u.id);
  });
  checkpoint("reward");
  const cards = offers
    .map(
      (u, i) =>
        `<button class="card ${u.rarity}${u.id === promised?.id ? " promised" : ""}" data-action="upgrade" data-id="${u.id}">${icon(u.icon)}<span class="rarity">${u.rarity.toUpperCase()}</span><span class="tag">${u.tag} / 織片${u.id === promised?.id ? " · 航路の織片" : ""}</span><h3>${u.name}</h3><p>${u.desc}</p>${fragmentComparison(u.id)}<span class="detail">${rank(game.run, u.id) ? `現在 ${rank(game.run, u.id)} → ${rank(game.run, u.id) + 1}` : "新しい織目"} <span style="float:right"><kbd>${i + 1}</kbd></span></span></button>`,
    )
    .join("");
  mountDialog(
    panel(
      `<p>${!offers.length ? "この旅の織片はすべて織り込みました。灯りを持って先へ進もう。" : promised ? `${theme.name}で見つけた織片。${offerCount}からひとつを、灯りに織り込む。` : "ひとつの昨日を、あなたの灯りに織り込む。"}</p>${weaveReadout()}<div class="cards" style="margin-top:14px">${cards}</div>${offers.length ? `<div class="reward-tools"><div><strong>${icon("scrap")}歯車 ${Math.floor(game.run.scrap)}</strong><small>${reroll.reason === "limit" ? "この部屋の糸を使い切りました" : reroll.reason === "exhausted" ? "他に入れ替えられる織片がありません" : `${promised ? "航路の織片を残して、ほかの候補を入れ替える" : "候補を入れ替え、違う織目を探す"} · 残り${reroll.limit - reroll.used}回`}</small></div>${button("rerollreward", rerollLabel, "ghost small", reroll.available ? "" : "disabled")}</div>` : ""}`,
      {
        title: "残響を織る",
        eyebrow: "A FRAGMENT OF YESTERDAY",
        footer: `<span class="muted" style="font-size:10px">この航路の間、効果は重なり続けます。</span>${button("skipreward", "織らずに進む", "ghost small")}`,
      },
    ),
    "reward",
  );
}
function weaveReadout() {
  const s = game.stats;
  return `<div class="weave-readout" role="group" aria-label="いまの灯り"><strong>いまの灯り</strong><span>体力 ${Math.ceil(game.run.hp)} / ${game.run.maxHp}</span><span>残響 最大${s.echoes}体</span><span>充填 ${s.echoCooldown.toFixed(1)}秒</span><span>寿命 ${s.echoDuration.toFixed(1)}秒</span></div>`;
}
function fragmentComparison(id, owned = false) {
  const rows = owned
    ? upgradeEffects(game.run, id).map(({ value, ...row }) => ({
        ...row,
        after: value,
      }))
    : previewUpgrade(game.run, id)?.rows;
  if (!rows?.length) return "";
  return `<span class="upgrade-comparison" data-preview="${owned ? "current" : "next"}">${rows.map((row) => `<span class="upgrade-effect" data-effect="${row.key}"><span class="effect-label">${row.label}</span><span class="effect-values">${owned ? "" : `<span class="effect-before">${effectText(row, row.before)}</span><span aria-hidden="true">→</span>`}<strong>${effectText(row, row.after)}</strong></span></span>`).join("")}</span>`;
}
function completeRoom() {
  game.mode = "cleared";
  checkpoint("cleared");
  showPlay();
  toast(currentControlText("部屋の奥の灯りへ · E で次の航路"));
}
function showRoutes() {
  if (screen !== "play") return;
  const next = game.run.stage + 1,
    boss = isBoss(next),
    event = isCamp(next),
    newBiome = roomIndex(next) === 0;
  const choices = boss
    ? [
        {
          id: "loom",
          name: ENEMIES[BIOMES[actIndex(next)].boss].name,
          en: "THE KEEPER",
          icon: "lighthouse",
          desc: "この場所に残された記憶と向き合う。",
          reward:
            next === ROOM_COUNT - 1 ? "灯台の記憶" : "レア織片・灯守との対話",
          color: "#e4bc80",
        },
      ]
    : ROUTES.map((r) => ({
        ...r,
        desc: event
          ? {
              loom: "街に残された小さな物語",
              salvage: "歯車で織片と回復を購入",
              rest: "戦闘なしで全回復",
            }[r.id]
          : r.desc,
        reward: event
          ? { loom: "選択", salvage: "行商人", rest: "全回復" }[r.id]
          : r.reward,
      }));
  const cards = choices
    .map((r) => {
      const forecast = event ? null : forecastRoom(game.run, next, r.id);
      const stock =
        event && r.id === "salvage" ? forecastTrader(game.run, next) : null;
      const promise = r.id === "loom" ? forecast?.promised : null;
      const theme = promise ? forecast.theme : null;
      const threats = forecast
        ? ["weaver", "shield", "shooter", "charger", "moth", "crawler"]
            .filter((kind) => forecast.enemies[kind])
            .slice(0, 2)
            .map((kind) => `${ENEMIES[kind].name} ${forecast.enemies[kind]}`)
            .join("・")
        : "";
      const fragments = forecast?.offers.some((u) => u.rarity !== "common")
        ? "レア織片"
        : "織片";
      const offerCount =
        forecast?.offers.length === 3 ? "三枚" : `${forecast?.offers.length}枚`;
      const reward =
        boss && next !== ROOM_COUNT - 1
          ? `${forecast.offers.length ? `${fragments}・` : ""}灯守との対話`
          : forecast?.elite
            ? r.id === "loom"
              ? forecast.offers.length
                ? `${fragments}を含む${offerCount}`
                : "織り込み済み"
              : `${r.reward}${forecast.offers.length ? `・${fragments}` : ""}`
            : forecast && r.id === "loom" && !forecast.offers.length
              ? "織り込み済み"
              : r.reward;
      const description = theme
        ? `戦闘後に${theme.tag}の織片を含む${offerCount}から選ぶ。`
        : forecast?.theme
          ? forecast.offers.length
            ? "この織室で今選べる織片はありません。他の織片から選ぶ。"
            : "この旅の織片はすべて織り込みました。灯りを持って先へ進もう。"
          : r.desc;
      const stockPreview = stock
        ? `<span class="route-stock"><small>行商の品ぞろえ · 手持ち ${Math.floor(game.run.scrap)}</small>${stock.length ? stock.map((u) => `<span class="route-stock-item ${u.rarity}" data-id="${u.id}"><span><strong>${u.name}</strong><small>歯車 ${traderPrice(u)}</small></span><span>${u.desc}</span></span>`).join("") : "<span>この旅の織片はすべて織り込みました。</span>"}<span class="route-stock-heal">体力 +${TRADER_HEAL_AMOUNT} / 歯車 ${TRADER_HEAL_PRICE}</span></span>`
        : "";
      const layoutPreview =
        forecast && !boss
          ? `<span class="route-layout" data-layout-id="${escape(forecast.layout.id)}">${layoutThumbnail(forecast.layout)}<span><strong>${escape(forecast.layout.name)}</strong><small>${escape(forecast.layout.hint)}</small></span></span>`
          : "";
      return `<button class="card route-card" data-action="route" data-id="${r.id}"${promise ? ` data-promised="${promise.id}"` : ""}${stock ? ` data-stock="${stock.map((u) => u.id).join(",")}"` : ""}><span class="route-head">${icon(theme?.icon || r.icon)}<span class="route-heading"><span class="tag">${theme ? `${theme.tag} / 織室` : r.en}</span><h3>${theme?.name || r.name}</h3></span></span>${forecast ? `<span class="route-encounter"${forecast.encounter ? ` data-encounter-id="${escape(forecast.encounter.id)}"` : ""}>${forecast.encounter ? `<strong class="route-tactic">${escape(forecast.encounter.name)}</strong><span class="route-tactic-hint">${escape(forecast.encounter.hint)}</span>` : ""}<strong>敵 ${forecast.total}体${forecast.elite ? " · 強敵あり" : ""}</strong>${threats ? `<small>主な敵 · ${threats}</small>` : ""}</span>` : ""}<span class="detail">${reward} →</span><p>${description}</p>${promise ? `<span class="route-promise"><small>出会う織片</small><strong>${promise.name}</strong><span>${promise.desc}</span></span>` : ""}${layoutPreview}${stockPreview}</button>`;
    })
    .join("");
  mountDialog(
    panel(
      `<p>${newBiome ? BIOMES[actIndex(next)].quote : "光の届く先を、あなたが決める。"}</p>${roomFeature(next) ? `<p class="route-feature"><strong>${roomFeature(next).name}</strong> · ${roomFeature(next).hint}</p>` : ""}<div class="route-progress">${Array.from({ length: ROOM_COUNT }, (_, i) => `<div class="route-step ${i < next ? "done" : i === next ? "current" : ""}" title="${i + 1}部屋目"></div>`).join("")}</div><div class="cards route-cards" ${boss ? 'style="grid-template-columns:1fr;max-width:360px;margin:auto"' : ""}>${cards}</div><p style="margin-top:16px;font-size:10px">次の場所：${BIOMES[actIndex(next)].name} / ${roomIndex(next) + 1}　航路 ${escape(game.run.seed)}</p>`,
      {
        title: newBiome
          ? "もっと深く、灯りを"
          : boss
            ? "灯りの守り手"
            : event
              ? "ひとときの潮待ち"
              : "次の航路",
        eyebrow: "CHOOSE A PATH",
        close: "resume",
      },
    ),
    "route",
  );
}
function nextRoom(route) {
  const run = game.run;
  run.stage++;
  run.route = route;
  run.rewardRoll = 0;
  delete run.shopBought;
  delete run.campDone;
  enter(run);
  if (roomIndex(run.stage) === 0) showPlay(true);
}
function showCamp() {
  const route = game.run.route;
  if (route === "rest") {
    game.heal(game.run.maxHp);
    mountDialog(
      panel(
        `<div class="event-art">${icon("lighthouse")}</div><p class="event-copy">小さな灯りの下で、濡れた糸を乾かした。<br>誰かが置いていった温かいお茶が、まだ湯気を立てている。</p><p class="text-teal" style="text-align:center">体力を全回復しました</p>`,
        {
          title: "潮待ちの宿",
          eyebrow: "A MOMENT OF STILLNESS",
          compact: true,
          footer: button("campdone", "灯りを持って進む →", "primary"),
        },
      ),
      "camp",
    );
  } else if (route === "salvage") {
    showShop();
  } else {
    const e = game.event;
    mountDialog(
      panel(
        `<div class="event-art">${icon(e.icon)}</div><p class="event-copy">${e.text}</p><div class="event-choices">${e.choices.map((c, i) => `<button class="event-choice" data-action="event" data-id="${i}" ${canChooseStory(game.run, c) ? "" : "disabled"}><strong>${c.label}</strong><span>${c.detail}${c.help && profile.remembered.includes(`story:${e.id}`) ? " · この街には届いています" : ""}</span></button>`).join("")}</div>`,
        { title: e.title, eyebrow: "A MEMORY LEFT BEHIND" },
      ),
      "event",
    );
  }
}
function showShop() {
  const bought = game.run.shopBought || [];
  checkpoint("shop");
  const cards = traderStock(game.run)
    .map((u) => {
      const price = traderPrice(u);
      return `<button class="card ${u.rarity}" data-action="buy" data-id="${u.id}" ${game.run.scrap < price || bought.includes(u.id) ? "disabled" : ""}>${icon(u.icon)}<span class="tag">${u.tag} / 織片</span><h3>${u.name}</h3><p>${u.desc}</p>${fragmentComparison(u.id, bought.includes(u.id))}<span class="trader-rank">${bought.includes(u.id) ? `現在 ${rank(game.run, u.id)}` : rank(game.run, u.id) ? `現在 ${rank(game.run, u.id)} → ${rank(game.run, u.id) + 1}` : "新しい織目"}</span><span class="detail">${bought.includes(u.id) ? "織り込み済み" : `歯車 ${price}`}</span></button>`;
    })
    .join("");
  mountDialog(
    panel(
      `<p>「光は売らないよ。光をつなぐものなら、少しだけ。」</p>${!cards ? '<p class="text-teal">この旅の織片はすべて織り込みました。回復薬は用意してあるよ。</p>' : ""}${weaveReadout()}<div class="cards" style="margin-top:14px">${cards}</div><div class="trader-tools"><span class="memory-count">${icon("scrap")}歯車 ${Math.floor(game.run.scrap)}</span>${button("buyheal", `体力 +${TRADER_HEAL_AMOUNT} / 歯車${TRADER_HEAL_PRICE}`, "ghost small", game.run.scrap < TRADER_HEAL_PRICE || game.run.hp >= game.run.maxHp ? "disabled" : "")}</div>`,
      {
        title: "漂流者の行商",
        eyebrow: "THE WANDERING TRADER",
        footer: `<span class="muted" style="font-size:10px">買いものは、その場で保存されます。</span>${button("campdone", "灯りを持って進む →", "primary")}`,
      },
    ),
    "shop",
  );
}
function chooseEvent(index) {
  const choice = applyStoryChoice(game, game.event, index);
  if (!choice) return;
  const project = CITY_PROJECTS[actIndex(game.run.stage)];
  mountDialog(
    panel(
      `<div class="event-art">${icon(game.event.icon)}</div><p class="event-copy">${escape(choice.result)}</p>${choice.help ? `<p class="story-gift">${icon(project.icon)}${profile.remembered.includes(`story:${game.event.id}`) ? "この記憶は既に街へ届いています。今回の選択も書庫に残ります。" : `${project.name}に届ける記憶を得ました。帰還したとき街に残ります。`}</p>` : ""}<p class="story-outcome">${escape(choice.detail)}</p>`,
      {
        title: game.event.title,
        eyebrow: "THE CHOICE YOU WOVE",
        compact: true,
        footer: button(
          "storycontinue",
          choice.offer ? "この記憶を織る →" : "灯りを持って進む →",
          "primary",
        ),
      },
    ),
    "story-result",
  );
}
function continueStory() {
  const entry = game.run.journal.find((e) => e.stage === game.run.stage);
  const choice = game.event.choices.find((c) => c.id === entry?.choice);
  if (!choice) return;
  if (choice.offer) showReward();
  else completeRoom();
}
function showPause() {
  if (game.practice) {
    mountDialog(
      panel(
        `<p>練習の灯りは、そのまま待っています。何度でも織り直せます。</p><div class="pause-display">${fullscreenButton()}</div>`,
        {
          title: "灯りをひと休み",
          eyebrow: "A SAFE PLACE TO LEARN",
          compact: true,
          close: "resume",
          footer:
            button("practiceexit", "練習を終える", "ghost") +
            button("resume", "練習に戻る", "primary"),
        },
      ),
      "pause",
    );
    return;
  }
  mountDialog(
    panel(
      `<p>灯りはここで、あなたを待っています。</p><div class="loadout-row" style="flex-direction:column;margin-top:24px">${button("resume", "航路へ戻る", "primary")}${button("inventory", "織片を確かめる", "ghost")}${button("settings", "設定", "ghost")}${fullscreenButton()}${button("help", "操作と残響の使い方", "ghost")}${button("savehome", "灯台へ戻る", "ghost")}</div><p style="font-size:10px;margin-top:20px">進行は部屋ごとに保存されます。戦闘中に戻ると部屋の入口から再開します。</p>`,
      {
        title: "潮を待つ",
        eyebrow: "THE LIGHT IS STILL HERE",
        compact: true,
        close: "resume",
      },
    ),
    "pause",
  );
}
function resume() {
  input.clear();
  showPlay();
}
function showInventory() {
  const entries = UPGRADES.filter((u) => rank(game.run, u.id));
  mountDialog(
    panel(
      `<p>${WEAPONS.find((w) => w.id === game.run.weapon).name} / ${RELICS.find((r) => r.id === game.run.relic).name}</p><p>${game.weapon.desc}</p><p>${bellRelicDescription(game.run, RELICS.find((r) => r.id === game.run.relic).desc)}</p><div class="codex-list" style="margin-top:20px">${entries.length ? entries.map((u) => `<article class="codex-entry">${icon(u.icon)}<div><h3>${u.name} × ${rank(game.run, u.id)}</h3><p>${u.desc}</p></div></article>`).join("") : "<p>まだ織片はありません。戦闘を終え、残響の織室で昨日を選びましょう。</p>"}</div><div class="divider"></div><p>航路 ${escape(game.run.seed)} / 残響 ${game.run.echoesCast}回 / 光糸での撃破 ${game.run.threadKills} / 糸でほどいた弾 ${game.run.threadCuts || 0} / 返し針 ${game.run.threadReturns || 0}${game.run.needleStitches ? ` / 合わせ縫い ${game.run.needleStitches}回` : ""}${weavesBell(game.run) ? ` / 鈴でほどいた弾 ${game.run.bellCuts}発 / 戻した充填 ${bellSeconds(game.run.bellRecovered)}秒` : ""}</p>`,
      {
        title: "あなたの織目",
        eyebrow: "THE LIGHT YOU HAVE WOVEN",
        close: "resume",
        footer: button("resume", "航路へ戻る", "primary"),
      },
    ),
    "inventory",
  );
}
function returnBuild(record) {
  if (!record) return "";
  const r = returnReadout(record),
    run = record.run;
  return `<section class="return-overview" aria-label="織り上げた灯り">
    ${r.lastHit ? `<aside class="return-lesson" aria-label="最後に受けた一撃"><p class="return-lesson-label">${icon("echo")}最後に受けた一撃</p><h3>${escape(r.lastHit.title)}</h3><p class="return-lesson-facts">直前の体力 ${r.lastHit.hpBefore.toFixed(1).replace(/\.0$/, "")} · 一撃 ${r.lastHit.damage.toFixed(1).replace(/\.0$/, "")}</p><p class="return-lesson-hint"><strong>次のひと針</strong>${escape(r.lastHit.hint)}</p></aside>` : ""}
    <p class="return-loadout">${icon("needle")}<strong>${r.weapon.name}</strong><span>/</span>${icon(r.relic.icon)}<strong>${r.relic.name}</strong></p>
    <p class="return-light">残響 最大${r.light.capacity}体 · 充填 ${r.light.chargeSeconds.toFixed(1)}秒 · 寿命 ${r.light.lifeSeconds.toFixed(1)}秒${r.light.playback === "reverse" ? " · 逆再生" : ""}</p>
    <details class="return-build"><summary><strong>今回の織目</strong><span>${r.fragments.length}種 · 合計${r.levels}段</span><small>全ての織片を読む</small></summary>
      <div class="return-fragments">${r.fragments.length ? r.fragments.map((u) => `<article class="return-fragment ${u.rarity === "rare" ? "rare" : ""}" data-return-fragment="${u.id}">${icon(u.icon)}<div><h3>${u.name}<span> ×${u.level}</span></h3><p>${u.desc}</p></div></article>`).join("") : '<p class="muted">最初のひと針。織片を持たずに進んだ旅でした。</p>'}</div>
    </details>
    <details class="return-performance"><summary><strong>灯りの足跡</strong><span>到達 ${run.stage + 1} / ${ROOM_COUNT}部屋</span><small>戦いの記録を読む</small></summary>
      <dl><div><dt>受けた被害</dt><dd>${run.damageTaken.toFixed(1).replace(/\.0$/, "")}</dd></div>${r.performance.map(([label, value, unit]) => `<div><dt>${label}</dt><dd>${value}${unit}</dd></div>`).join("")}</dl>
      <p class="return-route">航路 ${escape(run.seed)} · ${r.difficulty} · ${timeText(run.time)}</p>
    </details>
  </section>`;
}
function showLastReturn() {
  const record = profile.lastReturn;
  if (!record) return;
  mountDialog(
    panel(
      `<p class="return-status">${record.outcome === "victory" ? "街に朝を届けた旅" : "灯台へ帰った旅"} · 持ち帰った記憶 ${record.memory}</p>
     <div class="stats-grid"><div class="stat"><strong>${record.run.kills}</strong><span>ほどいた影</span></div><div class="stat"><strong>${record.run.echoesCast}</strong><span>織った残響</span></div><div class="stat"><strong>${record.run.stage + 1}</strong><span>到達した部屋</span></div><div class="stat"><strong>${timeText(record.run.time)}</strong><span>灯りの時間</span></div></div>${returnBuild(record)}`,
      {
        title: "直近の旅",
        eyebrow: "THE LIGHT YOU LEFT BEHIND",
        close: "home",
        footer:
          button("home", "灯台へ戻る", "ghost") +
          button(
            "returnagain",
            "この装備で旅の支度へ",
            "primary",
            canRepeatReturn()
              ? ""
              : 'disabled title="工房の道具と潮の深さを解放すると、この装備を選べます"',
          ),
      },
    ),
    "returnrecord",
  );
}
function canRepeatReturn() {
  const run = profile.lastReturn?.run;
  return (
    !!run &&
    profile.unlocked.includes(run.weapon) &&
    profile.unlocked.includes(run.relic) &&
    (!run.difficulty || profile.victories > 0)
  );
}
function finish(victory) {
  if (finished) return;
  finished = true;
  game.collectAllScrap();
  const run = game.run,
    reward =
      Math.floor(run.kills * 0.45) +
      actIndex(run.stage) * 8 +
      run.memory +
      (victory ? 35 : 5);
  const returned = settleCity(profile, run, victory);
  const chorus = returned.ending === "chorus";
  const record = makeReturnRecord(
    run,
    victory,
    reward,
    victory ? null : lastHitAtReturn(game),
  );
  if (record) profile.lastReturn = record;
  profile.memory += reward;
  profile.totalKills += run.kills;
  profile.best = Math.max(profile.best, run.stage + 1);
  profile.run = null;
  if (victory) {
    profile.victories++;
    if (!profile.lore.includes("heart")) profile.lore.push("heart");
  }
  persist();
  mountDialog(
    panel(
      `<div class="result-art">${icon(victory ? "lighthouse" : "echo")}<div class="eyebrow">${chorus ? "A CITY OF MANY VOICES" : victory ? "A LIGHT FOR TOMORROW" : "NOT ALL LIGHT IS LOST"}</div></div><p class="result-text">${chorus ? "帰り舟の鈴。温室の窓を揺らす風。灯台の秒針。<br>ばらばらだった街の声が、同じ朝に重なった。<br>ミナはもう、一人で帰る人を待たなくていい。" : victory ? "灯台の心臓は、静かに息をついた。<br>昨日を燃やす代わりに、あなたは光を織った。<br>その糸の先で、沈んだ街に初めての朝が来る。" : "あなたの灯りは、水の底でほどけた。<br>けれど、織った昨日は消えていない。<br>持ち帰った記憶が、次の灯りになる。"}</p><div class="stats-grid"><div class="stat"><strong>${reward}</strong><span>持ち帰った記憶</span></div><div class="stat"><strong>${run.kills}</strong><span>ほどいた影</span></div><div class="stat"><strong>${run.echoesCast}</strong><span>織った残響</span></div><div class="stat"><strong>${timeText(run.time)}</strong><span>灯りの時間</span></div></div>${returned.added.length ? `<div class="return-gifts"><strong>街に届いた新しい記憶 ${returned.added.length}</strong><p>${returned.unlocked.length ? returned.unlocked.map((p) => `${p.name}を修復しました。${p.reward}`).join("<br>") : "灯した灯りと届けた手紙は、次の帰還にも残ります。"}</p></div>` : ""}${returnBuild(record)}`,
      {
        title: chorus
          ? "街は、明日を歌う"
          : victory
            ? "明日の灯り"
            : "灯りは、またともる",
        eyebrow: victory ? "THE CITY REMEMBERS" : "RETURN TO THE LIGHTHOUSE",
        footer: `${button("home", "灯台へ帰る", "ghost")} ${button("again", "もう一度、織る →", "primary")}`,
      },
    ),
    victory ? "victory" : "defeat",
  );
}
function showCity() {
  mountDialog(
    panel(
      `<p>灯した灯り、直した装置、守り手と手紙の記憶を、帰還すると街へ届けます。倒れても持ち帰れます。同じ記憶は一度だけ数えます。</p><div class="city-grid">${CITY_PROJECTS.map(
        (p) => {
          const progress = cityProgress(profile, p);
          return `<article class="city-project ${progress.restored ? "restored" : ""}">${icon(p.icon)}<div class="eyebrow">${progress.restored ? "LIGHT RESTORED" : "A PLACE TO RETURN"}</div><h3>${p.name}</h3><p>${progress.restored ? p.after : p.before}</p><div class="city-progress" role="progressbar" aria-label="${p.name}の修復" aria-valuenow="${progress.count}" aria-valuemin="0" aria-valuemax="${p.goal}"><i style="width:${(progress.count / p.goal) * 100}%"></i></div><strong class="city-count">${progress.count} / ${p.goal} 記憶${progress.restored ? " · 修復済み" : ""}</strong><button class="city-detail" data-action="citydetail" aria-expanded="false">届けた記憶 ${progress.memories.filter((m) => profile.remembered.includes(m.key)).length} / ${progress.memories.length} · 記録を開く</button><ul class="city-ledger" hidden>${progress.memories.map((m) => `<li class="${profile.remembered.includes(m.key) ? "remembered" : ""}"><span aria-label="${profile.remembered.includes(m.key) ? "届けた" : "未収集"}">${profile.remembered.includes(m.key) ? "◆" : "◇"}</span>${m.label}</li>`).join("")}</ul><div class="city-reward">${p.reward}</div></article>`;
        },
      ).join(
        "",
      )}</div>${profile.victories ? '<p class="city-hint">街の三つの場所を修復し、一度の旅で三地域それぞれの忘れられた灯りを灯す。まだ届かない街の声が、その先にあります。</p>' : ""}`,
      {
        title: "街を織り直す",
        eyebrow: "YESTERDAY BECOMES A PLACE TO RETURN",
        close: "home",
        footer: button("home", "灯台へ戻る", "primary"),
      },
    ),
    "city",
  );
}
function showWorkshop() {
  const items = [
    ...WEAPONS.slice(1).map((w) => ({ ...w, icon: "needle" })),
    ...RELICS.slice(1),
  ];
  mountDialog(
    panel(
      `<p>記憶を、次の旅のお守りに。解放した道具は何度でも持ち出せます。</p><div class="codex-list" style="margin-top:22px">${items.map((x) => `<article class="codex-entry">${icon(x.icon)}<div style="flex:1"><h3>${x.name}</h3><p>${x.desc}</p><div style="margin-top:12px">${profile.unlocked.includes(x.id) ? '<span class="text-teal" style="font-size:10px">解放済み</span>' : button("unlock", `${x.cost} 記憶片で解放`, "small", `data-id="${x.id}" ${profile.memory < x.cost ? "disabled" : ""}`)}</div></div></article>`).join("")}</div><div class="divider"></div><p>初めて街に朝を届けると、新しい潮の深さ「荒潮」「深淵」が開きます。</p>`,
      {
        title: "灯守の工房",
        eyebrow: "KEEP WHAT THE SEA RETURNS",
        close: "home",
        footer: `<span class="memory-count">${icon("star")}記憶片 ${profile.memory}</span>${button("home", "灯台へ戻る", "ghost")}`,
      },
    ),
    "workshop",
  );
}
function showCodex(tab = codexTab) {
  codexTab = tab;
  let body = "";
  if (tab === "lore")
    body = LORE.map(
      (l) =>
        `<article class="codex-entry ${profile.lore.includes(l.unlock) ? "" : "locked"}">${icon("lighthouse")}<div><h3>${profile.lore.includes(l.unlock) ? l.title : "まだ届かない記憶"}</h3><p>${profile.lore.includes(l.unlock) ? l.text : "灯りを深くへ持っていくと、この記憶が戻ります。"}</p></div></article>`,
    ).join("");
  if (tab === "upgrades")
    body = UPGRADES.map(
      (u) =>
        `<article class="codex-entry ${profile.seen.includes(u.id) ? "" : "locked"}">${icon(profile.seen.includes(u.id) ? u.icon : "star")}<div><h3>${profile.seen.includes(u.id) ? u.name : "未発見の織片"}</h3><p>${profile.seen.includes(u.id) ? u.desc : "旅の中で出会う織片が、ここに記録されます。"}</p></div></article>`,
    ).join("");
  if (tab === "enemies")
    body = Object.values(ENEMIES)
      .map(
        (e) =>
          `<article class="codex-entry">${icon(e.boss ? "lighthouse" : "shield")}<div><h3>${e.name}</h3><p>${e.desc}</p></div></article>`,
      )
      .join("");
  if (tab === "letters") {
    body = STORIES.map((story) => {
      const choices = story.choices.filter((c) =>
        profile.stories.includes(`${story.id}:${c.id}`),
      );
      return `<article class="codex-entry ${choices.length ? "" : "locked"}">${icon(story.icon)}<div><h3>${choices.length ? story.title : "まだ届かない手紙"}</h3>${choices.length ? choices.map((c) => `<p><strong>${c.label}</strong> · ${c.result}</p>`).join("") : `<p>${BIOMES[story.act].name}の休息で、物語の航路を選びます。</p>`}</div></article>`;
    }).join("");
    body += `<article class="codex-entry ${profile.endings.includes("chorus") ? "" : "locked"}">${icon("lighthouse")}<div><h3>${profile.endings.includes("chorus") ? "街は、明日を歌う" : "街の声"}</h3><p>${profile.endings.includes("chorus") ? "帰り舟も、花も、時計も、誰かの帰る場所になった。朝は終点ではなく、次の手紙の始まりだった。" : "朝を届けたあとも、織り直せる場所が残っています。"}</p></div></article>`;
  }
  mountDialog(
    panel(
      `<div class="codex-tabs">${[
        ["lore", "街の記憶"],
        ["letters", "届けた手紙"],
        ["upgrades", "織片"],
        ["enemies", "影の図鑑"],
      ]
        .map(([id, text]) =>
          button(
            "tab",
            text,
            `${tab === id ? "primary" : "ghost"} small`,
            `data-id="${id}"`,
          ),
        )
        .join(
          "",
        )}</div><div class="codex-list">${body}</div><div class="divider"></div><p>航路 ${profile.attempts}回 / 街に届いた朝 ${profile.victories}回 / ほどいた影 ${profile.totalKills}体</p>`,
      {
        title: "記憶の書庫",
        eyebrow: "WHAT THE CITY REMEMBERS",
        close: "home",
      },
    ),
    "codex",
  );
}
function controlKey(action) {
  if (input.device === "pad") return PAD_HINTS[action];
  if (action === "pause") return "ESC";
  return bindingHint(
    action,
    profile.settings.keybindings,
    profile.settings.keyLabels,
  );
}
function movementKeys() {
  if (input.device === "pad") return PAD_HINTS.move;
  return movementHint(profile.settings.keybindings, profile.settings.keyLabels);
}
function currentControlText(text) {
  if (input.device === "pad") return padControlText(text);
  return controlText(
    text,
    profile.settings.keybindings,
    profile.settings.keyLabels,
  );
}
function updateControlHints() {
  const pad = input.device === "pad";
  document.querySelector("#app").classList.toggle("pad-active", pad);
  const introduction = ui.querySelector(".first-help");
  if (introduction) introduction.dataset.device = input.device;
  for (const el of ui.querySelectorAll("[data-control]")) {
    const action = el.dataset.control;
    const label =
      action === "move"
        ? movementKeys()
        : action === "pointerfire"
          ? pad
            ? PAD_HINTS.fire
            : "クリック"
          : controlKey(action);
    if (el.textContent !== label) el.textContent = label;
  }
  for (const el of ui.querySelectorAll("[data-control-text]"))
    el.textContent = currentControlText(el.dataset.controlText);
  for (const el of ui.querySelectorAll("[data-mouse-fire]"))
    el.textContent = pad ? "" : " / クリック";
  for (const el of ui.querySelectorAll("[data-pad-home]"))
    el.textContent = pad
      ? "左スティック / 十字キー 選択 · A / × 決定"
      : el.dataset.original;
  updatePadMenuHints();
  if (game) updateHud();
}
function updatePadMenuHints() {
  const back = bindingCapture
    ? "B / ○ キャンセル"
    : ui.querySelector(".overlay .close")
      ? "B / ○ 戻る"
      : "";
  for (const el of ui.querySelectorAll("[data-pad-menu]"))
    el.textContent =
      input.device === "pad"
        ? [
            "左スティック 選択",
            "A / × 決定",
            back,
            ui.querySelector(".first-help") ? "" : "右スティック 読む",
          ]
            .filter(Boolean)
            .join(" · ")
        : el.dataset.original;
}
function bindingRows() {
  const bindings = bindingsFor(profile.settings.keybindings);
  return CONTROL_ACTIONS.map(
    ({ id, name }) =>
      `<div class="keybinding-row"><span>${name}</span>${bindings[id].map((code, slot) => button("bindkey", escape(code ? keyLabel(code, profile.settings.keyLabels) : "追加"), "small ghost key-binding", `data-id="${id}" data-slot="${slot}" aria-label="${name}の第${slot + 1}キー ${escape(code ? keyLabel(code, profile.settings.keyLabels) : "未設定")}" aria-pressed="false" aria-describedby="keyboard-help"`)).join("")}</div>`,
  ).join("");
}
function keyboardSettings() {
  return `<details class="keyboard-settings"><summary>キーボードの割り当て</summary><p id="keyboard-help">キーを選び、使いたいキーを押してください。ESCでキャンセル、DeleteかBackspaceで外します。各操作に一つは残してください。左右のSHIFTは同じ操作です。</p><div id="keybinding-rows">${bindingRows()}</div><p id="keyboard-status" class="keyboard-status" role="status" aria-live="polite">一つの操作に二つまで登録できます。タッチとゲームパッドも使えます。</p>${button("resetkeys", "標準のキーに戻す", "small ghost")}</details>`;
}
function bindingStatus(text) {
  const status = ui.querySelector("#keyboard-status");
  if (status) status.textContent = text;
  updatePadMenuHints();
}
function redrawBindings(action, slot, focus = true) {
  const rows = ui.querySelector("#keybinding-rows");
  if (!rows) return;
  rows.innerHTML = bindingRows();
  if (focus)
    rows
      .querySelector(`[data-id="${action}"][data-slot="${slot}"]`)
      ?.focus({ preventScroll: true });
}
function cancelBindingCapture(
  message = "変更をキャンセルしました。",
  focus = true,
) {
  if (!bindingCapture) return;
  const { action, slot } = bindingCapture;
  bindingCapture = null;
  input.clear();
  redrawBindings(action, slot, focus);
  bindingStatus(message);
}
function beginBindingCapture(action, slot) {
  if (
    screen !== "settings" ||
    !CONTROL_ACTIONS.some((item) => item.id === action) ||
    ![0, 1].includes(slot)
  )
    return;
  cancelBindingCapture();
  input.clear();
  bindingCapture = { action, slot, shift: false };
  const target = ui.querySelector(
    `[data-action="bindkey"][data-id="${action}"][data-slot="${slot}"]`,
  );
  target?.classList.add("binding-capture");
  target?.setAttribute("aria-pressed", "true");
  if (target) target.textContent = "キー待ち";
  bindingStatus(
    `${CONTROL_ACTIONS.find((item) => item.id === action).name}を変更中。キーを押してください。ESCでキャンセルできます。`,
  );
}
function finishBindingCapture(code, key, held = true) {
  if (!bindingCapture) return;
  const { action, slot } = bindingCapture;
  const result = assignBinding(
    profile.settings.keybindings,
    action,
    slot,
    code,
  );
  if (!result.ok) {
    const conflict = CONTROL_ACTIONS.find(
      (item) => item.id === result.action,
    )?.name;
    bindingStatus(
      result.reason === "conflict"
        ? `このキーは${conflict}で使っています。別のキーを選んでください。`
        : result.reason === "required"
          ? "各操作に一つはキーを残してください。"
          : "このキーは使えません。英字・数字・矢印などを一つ押してください。",
    );
    return;
  }
  if (result.bindings) profile.settings.keybindings = result.bindings;
  else delete profile.settings.keybindings;
  const labels = { ...profile.settings.keyLabels };
  if (code !== null)
    labels[canonicalKey(code)] = capturedKeyLabel(canonicalKey(code), key);
  const captions = normalizeKeyLabels(labels, result.bindings);
  if (captions) profile.settings.keyLabels = captions;
  else delete profile.settings.keyLabels;
  bindingCapture = null;
  input.clear();
  if (held && code !== null) input.ignoreUntilRelease(canonicalKey(code));
  persist();
  redrawBindings(action, slot);
  const name = CONTROL_ACTIONS.find((item) => item.id === action).name;
  bindingStatus(
    code === null
      ? `${name}のキーを外しました。`
      : `${name}を${keyLabel(canonicalKey(code), captions)}に変更しました。`,
  );
}
function showSettings() {
  previousScreen = screen;
  pendingImport = null;
  document.querySelector("#notifications").replaceChildren();
  mountDialog(
    panel(
      `<div class="setting fullscreen-setting"><div>画面の表示<span>${fullscreen.supported ? "ESCで全画面を閉じると、航路は一時停止します。" : "このブラウザでは全画面を使えません。"}</span></div>${fullscreenButton("small ghost")}</div><div class="setting"><label for="music-volume">音楽<span>灯りと潮の音色</span></label><input id="music-volume" data-setting="music" type="range" min="0" max="1" step="0.05" value="${profile.settings.music}"></div><div class="setting"><label for="effects-volume">効果音<span>射撃・残響・敵の予兆</span></label><input id="effects-volume" data-setting="effects" type="range" min="0" max="1" step="0.05" value="${profile.settings.effects}"></div>${[
        ["shake", "画面の振動", "被弾と解放の手応え"],
        ["flashes", "発光の演出", "画面の明滅 · 被弾の方向と体力の表示は残す"],
        ["autoAim", "照準補助", "最も近い敵に自動で照準を合わせる"],
      ]
        .map(
          ([id, label, desc]) =>
            `<div class="setting"><label for="setting-${id}">${label}<span>${desc}</span></label><input id="setting-${id}" type="checkbox" data-setting="${id}" ${profile.settings[id] ? "checked" : ""}></div>`,
        )
        .join(
          "",
        )}${keyboardSettings()}<div class="save-tools"><div class="section-label">灯守の記録 / KEEP YOUR MEMORIES</div><p>${saveFailed ? "このブラウザには保存できません。タブを閉じる前に、記録を書き出してください。" : "記憶と途中の航路は、このブラウザに保存されます。書き出したファイルで、別のブラウザにも持っていけます。"}</p><div class="save-actions">${button("export", "記録を書き出す", "small")}${button("openimport", "記録を取り込む", "small ghost", game ? "disabled" : "")}${importUndo ? button("undoimport", "直前の取り込みを戻す", "small ghost", game ? "disabled" : "") : ""}</div><input id="save-file" type="file" accept=".json,application/json" hidden><p id="save-status" class="save-status" role="status" aria-live="polite"></p><p class="save-note">${game ? "途中の航路は部屋の区切りで書き出します。取り込みは灯台の画面で行えます。" : "取り込む前に内容を確認できます。今の記録は置き換わります。"}</p></div><div class="divider"></div><p>ドット絵・音響は本作のためにコードで制作。外部アセットや通信を使わずに遊べます。</p>`,
      {
        title: "灯りの調整",
        eyebrow: "MAKE YOURSELF AT HOME",
        compact: true,
        close: "backsettings",
        footer:
          button("about", "この作品について", "ghost small") +
          button("backsettings", "設定を閉じる", "primary"),
      },
    ),
    "settings",
  );
}
function backFromSettings() {
  persist();
  if (game) showPause();
  else home();
}
function showAbout() {
  mountDialog(
    panel(credits({ icon, version: releaseVersion }), {
      title: "この灯りについて",
      eyebrow: "ECHO LOOM / BROWSER EDITION",
      close: "backabout",
      footer:
        button("notices", "使用ソフトウェアの表記", "ghost") +
        button("backabout", "設定へ戻る", "primary"),
    }),
    "about",
  );
}
async function showNotices() {
  mountDialog(
    panel(
      '<span class="credits-notice-status sr-only" role="status" aria-atomic="true">表記を読み込んでいます。</span><pre class="credits-notices" tabindex="0" aria-label="使用ソフトウェアの表記の全文">表記を読み込んでいます。</pre>',
      {
        title: "使用ソフトウェアの表記",
        eyebrow: "THIRD-PARTY NOTICES",
        close: "backnotices",
        footer: button("backnotices", "作品についてへ戻る", "primary"),
      },
    ),
    "notices",
  );
  const text = ui.querySelector(".credits-notices");
  const status = ui.querySelector(".credits-notice-status");
  try {
    const response = await fetch(
      new URL(
        `${import.meta.env.BASE_URL}THIRD-PARTY-NOTICES.txt`,
        document.baseURI,
      ),
    );
    if (!response.ok) throw new Error("Notices unavailable");
    const content = await response.text();
    if (text.isConnected) {
      text.textContent = content;
      status.textContent = "表記を読み込みました。";
    }
  } catch {
    if (text.isConnected) {
      text.textContent =
        "表記を読み込めませんでした。作品についてへ戻り、もう一度開いてください。";
      status.textContent = text.textContent;
    }
  }
}
function downloadRecord() {
  if (game?.mode === "cleared" && !finished) checkpoint("cleared");
  const now = new Date();
  const url = URL.createObjectURL(
    new Blob([exportProfile(profile, now)], {
      type: "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `echo-loom-${now.toISOString().replace(/[:.]/g, "-")}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  ui.querySelector("#save-status").textContent =
    "記憶と航路の記録を書き出しました。";
}
function showImportPreview(record, undo = false) {
  if (game) return;
  pendingImport = record;
  const p = record.profile,
    run = p.run;
  const restored = CITY_PROJECTS.filter(
    (project) => cityProgress(p, project).restored,
  ).length;
  mountDialog(
    panel(
      `<p>${undo ? "直前の取り込み前に持っていた記録へ戻します。" : "このファイルにある記憶と航路を取り込みます。"}今の記録は置き換わります。</p><div class="import-summary"><div class="stats-grid"><div class="stat"><strong>${p.memory}</strong><span>記憶片</span></div><div class="stat"><strong>${p.attempts}</strong><span>航路</span></div><div class="stat"><strong>${p.victories}</strong><span>街に届いた朝</span></div><div class="stat"><strong>${restored} / 3</strong><span>街の修復</span></div></div><div class="divider"></div><h3>${run ? "途中の航路" : "灯台で休んでいる記録"}</h3><p>${run ? `${escape(run.seed)}<br>${BIOMES[actIndex(run.stage)].name} · ${run.stage + 1} / ${ROOM_COUNT}部屋 · ${run.checkpoint === "shop" ? "行商で買いものの途中" : run.checkpoint === "reward" ? "織片を選ぶところ" : run.checkpoint === "cleared" ? "戦闘を終えた部屋" : "部屋の入口"}` : "途中の航路はありません。新しい旅を始められます。"}</p>${record.createdAt ? `<p class="save-note">書き出し ${escape(new Date(record.createdAt).toLocaleString("ja-JP"))}</p>` : ""}</div><p class="save-note">取り込み直前の記録も残します。設定の「直前の取り込みを戻す」から戻せます。</p>`,
      {
        title: undo ? "取り込み前の灯りへ" : "この記録を取り込む",
        eyebrow: "MEMORIES FROM ANOTHER SHORE",
        close: "backimport",
        compact: true,
        footer:
          button("backimport", "戻る", "ghost") +
          button(
            "importrecord",
            undo ? "この記録へ戻す" : "記録を取り込む",
            "primary",
          ),
      },
    ),
    "import",
  );
}
function importRecord() {
  if (game || !pendingImport) return;
  const next = pendingImport.profile,
    previous = structuredClone(profile);
  const result = saveSession.replace(next, profile);
  if (result.conflict) {
    showSaveConflict();
    return;
  }
  Object.assign(profile, next);
  importUndo = previous;
  pendingImport = null;
  saveFailed = !result.saved;
  audio.updateSettings(profile.settings);
  home();
  toast(
    result.saved
      ? "記録を取り込みました。灯りを続けられます。"
      : "記録を取り込みました。このタブを閉じる前に書き出してください。",
  );
}
function showSaveConflict() {
  if (!saveSession.changed()) return;
  pendingImport = null;
  const remote = loadState().profile;
  const summary = (p, label) =>
    `<div><h3>${label}</h3><p>記憶片 ${p.memory} · 航路 ${p.attempts}回<br>${p.run ? `${escape(p.run.seed)} · ${p.run.stage + 1}/${ROOM_COUNT}部屋` : "途中の航路なし"}</p></div>`;
  mountDialog(
    panel(
      `<p>別のタブで、灯守の記録が更新されました。このタブの記録を保存すると、そちらの記録を置き換えます。</p><div class="save-comparison">${summary(profile, "このタブの記録")}${summary(remote, "別のタブの記録")}</div><p class="save-note">別のタブの記録を開くと、途中の航路は保存された部屋の区切りから続けられます。このタブで遊んでいた部屋の途中は引き継ぎません。</p>`,
      {
        title: "二つの灯りの記録",
        eyebrow: "CHOOSE THE LIGHT TO KEEP",
        compact: true,
        footer:
          button("keeplocal", "このタブの記録を残す", "ghost small") +
          button("useremote", "別のタブの記録を開く", "primary small"),
      },
    ),
    "saveconflict",
  );
}
function useExternalRecord() {
  const state = saveSession.accept();
  Object.assign(profile, state.profile);
  importUndo = loadImportUndo();
  audio.updateSettings(profile.settings);
  saveFailed = state.source === "unavailable";
  home();
  toast("別のタブの記録を開きました。");
}
function keepLocalRecord() {
  if (game?.mode === "cleared" && !finished) {
    game.run.checkpoint = "cleared";
    profile.run = structuredClone(game.run);
  }
  const result = saveSession.overwrite(profile);
  saveFailed = !result.saved;
  if (result.conflict) {
    showSaveConflict();
    return;
  }
  if (game && !finished) showPause();
  else home();
  toast(
    result.saved
      ? "このタブの記録を保存しました。"
      : "記録を保存できません。設定から書き出してください。",
  );
}
function showHelp(first = false) {
  mountDialog(
    panel(
      first
        ? firstHelp({ icon, escape, movementKeys, controlKey })
        : `<p>直前3.6秒のあなたを再生する「残響」。現在のあなたと残響の間には、敵を切り、弾をほどく光糸が生まれます。</p><p id="recording-help">呼べる間は、点線が録画した道を示します。四角が残響の始点、金の糸目が射撃の方向。${rewindsEchoes(game?.run) ? "折り返す昨日を織っています。今の自分から昔の場所へ逆再生し、金の留め目で光糸を保ちます。針は録画した向きへ放ちます。" : "そこから今の自分へ、記録した動きを再生します。"}</p><div class="tutorial-grid"><div class="tutorial-step">${icon("needle")}<h3>1. 昨日をつくる</h3><p>移動しながら射撃。敵を避け、広い軌跡を描くと長い糸を張れます。</p><kbd data-control="move">${escape(movementKeys())}</kbd> <kbd data-control="pointerfire">${input.device === "pad" ? PAD_HINTS.fire : "クリック"}</kbd></div><div class="tutorial-step">${icon("echo")}<h3>2. 昨日と織る</h3><p>残響が軌跡と射撃を再生。離れて糸を敵に重ね、糸の中ほどで敵弾を受け止めましょう。足元へ来る弾は回避で避けます。</p><kbd data-control="echo">${escape(controlKey("echo"))}</kbd></div><div class="tutorial-step">${icon("star")}<h3>3. 光をほどく</h3><p>残響の位置で光を爆発。周囲の敵を撃ち、敵弾を消します。</p><kbd data-control="burst">${escape(controlKey("burst"))}</kbd></div></div><div class="divider"></div><div class="controls-grid"><div><kbd data-control="dash">${escape(controlKey("dash"))}</kbd><span>回避 / すり抜ける</span></div><div><kbd data-control="interact">${escape(controlKey("interact"))}</kbd><span>部屋の奥で次の航路へ</span></div><div><kbd data-control="pause">${escape(controlKey("pause"))}</kbd><span>一時停止</span></div><div><kbd data-control="fire">${escape(controlKey("fire"))}</kbd><span>射撃 / キーボード操作</span></div></div><p style="font-size:10px;margin-top:16px">${arrowMovement(profile.settings.keybindings) ? "矢印キーでも移動できます。" : "移動のキーは設定で変更できます。"}照準の印が射撃方向を示します。マウスを画面から離すと自動照準。一時停止から戻った後も自動照準です。設定の照準補助を有効にすると、手動操作中も最寄りの敵を狙います。標準配置のゲームパッド：左スティック移動、右スティック照準、RT/R2射撃、A/×回避、RB/R1残響、LB/L1解放、B/○で次へ、STARTで停止。メニューは左スティックか十字キーで選択、A/×で決定、B/○で戻る。左右で音量、右スティックで本文、LB/RBで一画面ずつ読む。タッチ：左側で移動、右側で照準と射撃。</p><p style="font-size:10px">${!game || game.run.chargeVersion === 1 ? "錆びた衛兵の赤い帯は、突進で触れる範囲と壁で止まる先を示します。足元の四つの目盛りが満ちる前に、帯の外へ歩くか回避しましょう。" : "錆びた衛兵が足を止め、赤い線を出したら突進の合図。狙いを決めた後は追って曲がらないので、横へ歩くか回避しましょう。"}</p><p style="font-size:10px">角の裂け目に浮かぶ影は、これから出現する敵です。下の四つの目盛りが満ちると現れます。輪郭に光糸を置き、出現に備えましょう。</p><p style="font-size:10px">部屋を離れる時、残った歯車はすべて回収されます。残響の寿命を伸ばすと、再生後もその場で糸を維持します。</p>`,
      {
        title: "昨日と、光を織る",
        eyebrow: "HOW TO WEAVE A LIGHT",
        close: game ? "resume" : "home",
        footer:
          (game?.practice
            ? ""
            : button("practice", "灯りの練習をする", "ghost")) +
          button(
            game ? "resume" : "home",
            first ? "最初のひと針へ →" : game ? "航路へ戻る" : "灯台へ戻る",
            "primary",
          ),
      },
    ),
    "help",
  );
}

function startPractice() {
  if (game?.practice) return;
  practiceReturn = { game, finished };
  document.querySelector("#notifications").replaceChildren();
  game = new PracticeGame((type, data) => {
    if (type === "sound") audio.sfx(data);
    if (type === "practice-step" && data === PRACTICE_STEPS.length)
      showPracticeResult();
    if (type === "practice-step" && game?.practice) updateHud();
  });
  finished = false;
  input.clear();
  showPlay();
}
function endPractice() {
  const previous = practiceReturn;
  practiceReturn = null;
  input.clear();
  game = previous?.game || null;
  finished = previous?.finished || false;
  if (game) showPlay();
  else home();
}
function showPracticeResult() {
  mountDialog(
    panel(
      '<div class="result-art">' +
        icon("echo") +
        "</div><p>あなたが歩いた昨日と、今のあなた。<br>二つの灯りの間に、道を織れました。</p><p>広く歩いて残響をつくる。光糸を影に重ね、糸の中ほどで弾をほどく。残響の近くに弾が集まったら、解放する。沈んだ街でも、同じ織り方が使えます。</p>",
      {
        title: "最初の光が織れました",
        eyebrow: "YESTERDAY IS ON YOUR SIDE",
        compact: true,
        close: "practiceexit",
        footer:
          button("practicerepeat", "もう一度練習する", "ghost small") +
          button(
            "practiceexit",
            practiceReturn?.game ? "航路へ戻る" : "灯台へ戻る",
            "primary",
          ),
      },
    ),
    "practice-complete",
  );
}

ui.addEventListener("click", (e) => {
  if (bindingCapture && !e.target.closest('[data-action="bindkey"]'))
    cancelBindingCapture("変更をキャンセルしました。", false);
  const target = e.target.closest("[data-action]");
  if (!target || target.disabled) return;
  audio.start();
  audio.sfx("ui");
  const action = target.dataset.action,
    id = target.dataset.id;
  switch (action) {
    case "fullscreen":
      void fullscreen.toggle();
      break;
    case "bindkey":
      beginBindingCapture(id, Number(target.dataset.slot));
      break;
    case "resetkeys":
      bindingCapture = null;
      delete profile.settings.keybindings;
      delete profile.settings.keyLabels;
      input.clear();
      persist();
      redrawBindings(null, null, false);
      bindingStatus("標準のキーに戻しました。");
      break;
    case "home":
      home();
      break;
    case "setup":
      setup();
      break;
    case "newrun":
      mountDialog(
        panel(
          '<p class="confirm-copy">途中の航路を閉じて、新しく出発します。この航路で拾った街の記憶は、帰還前には街へ届きません。</p>',
          {
            title: "新しい灯りをともす",
            eyebrow: "A NEW BEGINNING",
            compact: true,
            footer:
              button("home", "戻る", "ghost") +
              button("setup", "新しい航路へ", "primary"),
          },
        ),
        "confirm",
      );
      break;
    case "weapon":
    case "relic":
    case "difficulty": {
      const seed = ui.querySelector("#seed")?.value || "";
      const scrollTop = ui.querySelector(".panel-content")?.scrollTop || 0;
      selection[action] = action === "difficulty" ? Number(id) : id;
      showSetup(seed, scrollTop);
      if (input.device === "pad")
        queueMicrotask(() => {
          const choice = [
            ...ui.querySelectorAll("[data-action][data-id]"),
          ].find((el) => el.dataset.action === action && el.dataset.id === id);
          choice?.focus({ preventScroll: true });
        });
      break;
    }
    case "fragment": {
      const seed = ui.querySelector("#seed")?.value || "";
      const scrollTop = ui.querySelector(".panel-content")?.scrollTop || 0;
      selection.fragment = startingFragments(profile).includes(id) ? id : null;
      showSetup(seed, scrollTop);
      if (input.device === "pad")
        queueMicrotask(() => {
          const choice = [
            ...ui.querySelectorAll("[data-action][data-id]"),
          ].find((el) => el.dataset.action === action && el.dataset.id === id);
          choice?.focus({ preventScroll: true });
        });
      break;
    }
    case "start":
      start();
      break;
    case "daily":
      selection = {
        weapon: "needle",
        relic: "spool",
        difficulty: 0,
        fragment: null,
      };
      start(`DAILY-${new Date().toLocaleDateString("sv-SE")}`);
      break;
    case "continue":
      continueRun();
      break;
    case "pause":
      showPause();
      break;
    case "resume":
      resume();
      break;
    case "upgrade":
      if (
        screen === "reward" &&
        game.mode === "reward" &&
        offers.some((u) => u.id === id) &&
        game.addUpgrade(id)
      ) {
        toast(`${UPGRADES.find((u) => u.id === id).name}を織り込みました`);
        completeRoom();
      }
      break;
    case "skipreward":
      if (screen === "reward" && game.mode === "reward") completeRoom();
      break;
    case "rerollreward":
      if (screen === "reward" && game.rerollReward()) {
        showReward();
        toast(
          rewardPlan(game.run).promised
            ? "候補を織り直しました。航路の織片はそのまま残ります。"
            : "候補を織り直しました。違う織目を探してみよう。",
        );
      }
      break;
    case "route":
      nextRoom(id);
      break;
    case "campdone":
      completeRoom();
      break;
    case "event":
      chooseEvent(Number(id));
      break;
    case "storycontinue":
      continueStory();
      break;
    case "buy": {
      if (screen === "shop" && game.buyUpgrade(id)) {
        if (!profile.seen.includes(id)) profile.seen.push(id);
        showShop();
      }
      break;
    }
    case "buyheal":
      if (screen === "shop" && game.buyHeal()) {
        showShop();
      }
      break;
    case "inventory":
      showInventory();
      break;
    case "savehome":
      if (game.mode === "cleared") checkpoint("cleared");
      home();
      toast("航路は部屋の区切りで保存されています");
      break;
    case "again": {
      const previousRun = game?.run;
      game = null;
      setup(previousRun);
      break;
    }
    case "lastreturn":
      showLastReturn();
      break;
    case "returnagain":
      if (canRepeatReturn()) setup(profile.lastReturn.run);
      break;
    case "workshop":
      showWorkshop();
      break;
    case "city":
      showCity();
      break;
    case "citydetail": {
      const ledger = target.nextElementSibling;
      ledger.hidden = !ledger.hidden;
      target.setAttribute("aria-expanded", String(!ledger.hidden));
      break;
    }
    case "unlock": {
      const item = [...WEAPONS, ...RELICS].find((x) => x.id === id);
      if (
        item &&
        !profile.unlocked.includes(id) &&
        profile.memory >= item.cost
      ) {
        profile.memory -= item.cost;
        profile.unlocked.push(id);
        persist();
        audio.sfx("upgrade");
        toast(`${item.name}を解放しました`);
        showWorkshop();
      }
      break;
    }
    case "codex":
      showCodex();
      break;
    case "tab":
      showCodex(id);
      break;
    case "settings":
      showSettings();
      break;
    case "backsettings":
      backFromSettings();
      break;
    case "about":
      showAbout();
      break;
    case "backabout":
      showSettings();
      break;
    case "notices":
      void showNotices();
      break;
    case "backnotices":
      showAbout();
      break;
    case "export":
      downloadRecord();
      break;
    case "openimport":
      if (!game) ui.querySelector("#save-file")?.click();
      break;
    case "undoimport":
      if (importUndo)
        showImportPreview(
          { profile: structuredClone(importUndo), createdAt: null },
          true,
        );
      break;
    case "backimport":
      showSettings();
      break;
    case "importrecord":
      importRecord();
      break;
    case "useremote":
      useExternalRecord();
      break;
    case "keeplocal":
      keepLocalRecord();
      break;
    case "help":
      showHelp();
      break;
    case "practice":
      startPractice();
      break;
    case "practiceexit":
      endPractice();
      break;
    case "practiceretry":
      game?.practice && game.retry();
      input.clear();
      canvas.focus({ preventScroll: true });
      break;
    case "practicerepeat": {
      const previous = practiceReturn;
      game = null;
      startPractice();
      practiceReturn = previous;
      break;
    }
  }
});
ui.addEventListener("change", async (e) => {
  if (e.target.id !== "save-file" || game) return;
  const file = e.target.files?.[0];
  if (!file) return;
  const status = ui.querySelector("#save-status");
  status.textContent = "記録を読んでいます…";
  try {
    if (file.size > MAX_BACKUP_BYTES)
      throw Error(
        "このファイルは大きすぎます。残響の灯台の記録を選んでください。",
      );
    const record = prepareImport(await file.text());
    if (screen === "settings" && status.isConnected) showImportPreview(record);
  } catch (error) {
    if (status.isConnected)
      status.textContent =
        error.message ||
        "記録を読めませんでした。別のファイルを選んでください。";
  }
  e.target.value = "";
});
ui.addEventListener("input", (e) => {
  const key = e.target.dataset.setting;
  if (!key) return;
  profile.settings[key] =
    e.target.type === "checkbox" ? e.target.checked : Number(e.target.value);
  audio.updateSettings(profile.settings);
  persist();
});
window.addEventListener(
  "keydown",
  (e) => {
    if (screen !== "settings" || !bindingCapture) return;
    if (e.code === "Tab") {
      cancelBindingCapture();
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    if (e.code === "Escape") {
      cancelBindingCapture();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) {
      bindingCapture.shift = false;
      bindingStatus(
        "Ctrl・Alt・⌘などの組み合わせは使えません。キーを一つ押してください。",
      );
      return;
    }
    if (["ShiftLeft", "ShiftRight"].includes(e.code)) {
      bindingCapture.shift = true;
      bindingStatus("SHIFTを離すと登録します。ESCでキャンセルできます。");
      return;
    }
    bindingCapture.shift = false;
    finishBindingCapture(
      ["Delete", "Backspace"].includes(e.code) ? null : e.code,
      e.key,
    );
  },
  { capture: true },
);
window.addEventListener(
  "keyup",
  (e) => {
    if (
      screen === "settings" &&
      bindingCapture?.shift &&
      ["ShiftLeft", "ShiftRight"].includes(e.code)
    ) {
      e.preventDefault();
      e.stopImmediatePropagation();
      finishBindingCapture("Shift", "SHIFT", false);
    }
  },
  { capture: true },
);
window.addEventListener("keydown", (e) => {
  if (
    screen === "reward" &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    ["Digit1", "Digit2", "Digit3"].includes(e.code) &&
    !e.repeat
  )
    ui.querySelectorAll('[data-action="upgrade"]')[
      Number(e.code.at(-1)) - 1
    ]?.click();
  if (e.code === "Tab" && paused) {
    const buttons = [
      ...ui.querySelectorAll(
        '.overlay button:not(:disabled),.overlay input,.overlay summary,.overlay .credits-notices[tabindex="0"]',
      ),
    ].filter((el) => el.getClientRects().length);
    if (screen === "route" && buttons.length) {
      e.preventDefault();
      const active = buttons.indexOf(document.activeElement);
      const next =
        active < 0
          ? 0
          : (active + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next].focus();
      return;
    }
    const first = buttons[0],
      last = buttons.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }
});
for (const type of ["pointerdown", "keydown"])
  window.addEventListener(
    type,
    () => {
      if (!document.hidden) void audio.start();
    },
    { passive: true },
  );
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelBindingCapture("変更をキャンセルしました。", false);
    if (game && screen === "play") showPause();
    input.clear();
    void audio.suspend();
  } else if (audio.ctx) audio.start();
});
window.addEventListener("blur", () => {
  cancelBindingCapture("変更をキャンセルしました。", false);
  if (game && screen === "play") showPause();
});
window.addEventListener("pagehide", () => {
  if (game?.mode === "cleared") checkpoint("cleared");
  else persist();
});
window.addEventListener("storage", (e) => {
  if (e.key === SAVE_KEY || e.key === null) showSaveConflict();
});
let previous = performance.now(),
  accumulator = 0,
  lastHud = 0,
  displayedAim = null;
function frame(now) {
  input.pollPad();
  const delta = Math.min(0.1, (now - previous) / 1000);
  previous = now;
  if (game && !paused) {
    accumulator += delta;
    let n = 0;
    while (accumulator >= 1 / 60 && !paused && n++ < 6) {
      const controls = input.read(game.player);
      if (paused) break;
      if (profile.settings.autoAim) controls.autoAim = true;
      const attempt = captureActions(game, controls);
      game.update(1 / 60, controls);
      actionFeedback.observe(game, attempt);
      accumulator -= 1 / 60;
    }
  } else {
    accumulator = 0;
    if (!game) actionFeedback.observe(null, null);
  }
  if (!game || game.mode !== "combat") displayedAim = null;
  else if (!paused && screen === "play")
    displayedAim = aimCue(game, input.aimView(), profile.settings);
  canvas.dataset.aim =
    !paused && screen === "play" ? displayedAim?.source || "" : "";
  renderer.draw(
    game,
    now / 1000,
    profile.settings,
    profile,
    displayedAim,
    input.device === "pad" ? PAD_HINTS : null,
  );
  if (paused || !game)
    input.menu(
      ui,
      () => {
        if (bindingCapture) {
          cancelBindingCapture();
          return;
        }
        const close = ui.querySelector(".overlay .close");
        if (close) close.click();
        else if (screen === "pause") resume();
      },
      now,
      delta,
    );
  noticeLifetime.update(now, paused && !finished);
  audio.update(scoreScene(game, paused, screen, profile));
  if (now - lastHud > 100) {
    updateHud();
    lastHud = now;
  }
  updateReleaseReadout();
  requestAnimationFrame(frame);
}
home();
requestAnimationFrame(frame);
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  const workerURL = new URL(
    `${import.meta.env.BASE_URL}sw.js`,
    document.baseURI,
  );
  navigator.serviceWorker
    .register(workerURL, { scope: new URL("./", workerURL).href })
    .catch(() => {});
}
// A read-only diagnostic snapshot supports reproducible browser verification.
if (import.meta.env.DEV)
  window.__ECHO_LOOM__ = {
    snapshot: () => ({
      screen,
      paused,
      run: game ? structuredClone(game.run) : null,
      mode: game?.mode,
      enemies: game?.enemies.length,
      bullets: game?.bullets.length,
      echoes: game?.echoes.length,
      player: game ? { ...game.player } : null,
    }),
    game: () => game,
    audio: () => audio,
  };
