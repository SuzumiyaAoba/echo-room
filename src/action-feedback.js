export const ACTION_NOTICE_SECONDS = 1.2;
const playing = (game) => game && ["combat", "cleared"].includes(game.mode);
const tenth = (seconds) => Math.max(0.1, Math.ceil(seconds * 10 - 1e-7) / 10);

// Observe the original update, including recharge and recording on that frame.
// This does not decide whether an action fires or retain any input for later.
export function captureActions(game, controls) {
  if (!playing(game) || !(controls.dash || controls.echo || controls.burst))
    return null;
  return {
    game,
    dash: !!controls.dash,
    echo: !!controls.echo,
    burst: !!controls.burst,
    dashSerial: game.player.dashSerial,
    casts: game.run.echoesCast,
    echoes: game.echoes.length,
  };
}

function unavailable(game, action) {
  if (action === "dash" && game.player.dashCd > 0)
    return { reason: "cooldown", remaining: tenth(game.player.dashCd) };
  if (action === "echo") {
    if (game.history.length < 24)
      return {
        reason: "recording",
        remaining: tenth((24 - game.history.length) / 60),
      };
    if (game.player.echoCharges <= 0 && game.player.echoCd > 0)
      return { reason: "charging", remaining: tenth(game.player.echoCd) };
  }
  if (action === "burst" && !game.echoes.length)
    return { reason: "empty", remaining: null };
  return null;
}

const names = { dash: "回避", echo: "残響", burst: "解放" };
const announcements = {
  cooldown: "回避は充填中です。",
  recording: "残響の軌跡を記録中です。",
  charging: "残響は充填中です。",
  empty: "解放には残響が必要です。先に残響を作ってください。",
};

// A HUD controller separate from Game and the saved run. Its clock is the real
// simulation clock, so pausing cannot age a message or its displayed countdown.
export class ActionFeedback {
  constructor() {
    this.game = null;
    this.notices = new Map();
    this.serial = 0;
  }
  observe(game, before) {
    if (game !== this.game) {
      this.game = game;
      this.notices.clear();
    }
    if (!playing(game)) {
      this.notices.clear();
      return;
    }
    for (const [action, notice] of this.notices)
      if (
        game.t - notice.started >= ACTION_NOTICE_SECONDS ||
        !unavailable(game, action)
      )
        this.notices.delete(action);
    if (!before || before.game !== game) return;
    const cast = game.run.echoesCast > before.casts;
    const succeeded = {
      dash: game.player.dashSerial !== before.dashSerial,
      echo: cast,
      burst: before.echoes > 0 || cast,
    };
    // A simultaneous unavailable echo explains why release is unavailable too.
    for (const action of ["burst", "dash", "echo"]) {
      if (!before[action]) continue;
      if (succeeded[action] || !unavailable(game, action)) {
        this.notices.delete(action);
        continue;
      }
      this.notices.set(action, {
        action,
        started: game.t,
        serial: ++this.serial,
      });
    }
  }
  read(game) {
    if (game !== this.game || !playing(game)) return null;
    let latest = null;
    for (const notice of this.notices.values()) {
      const age = game.t - notice.started;
      if (age < 0 || age >= ACTION_NOTICE_SECONDS) continue;
      const state = unavailable(game, notice.action);
      if (!state || (latest && notice.serial < latest.serial)) continue;
      const seconds = state.remaining?.toFixed(1);
      latest = {
        ...notice,
        ...state,
        label: names[notice.action],
        detail:
          state.reason === "empty"
            ? "先に残響を作る"
            : state.reason === "recording"
              ? `録画あと ${seconds}秒`
              : state.reason === "charging"
                ? `充填あと ${seconds}秒`
                : `あと ${seconds}秒`,
        announcement: announcements[state.reason],
      };
    }
    return latest;
  }
}
