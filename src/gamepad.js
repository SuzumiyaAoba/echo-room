// The W3C standard layout describes physical positions, independently of
// the controller's printed letters. No device identifier enters a save.
export const PAD_HINTS = Object.freeze({
  dash: "A / ×",
  echo: "RB / R1",
  burst: "LB / L1",
  interact: "B / ○",
  fire: "RT / R2",
  pause: "START",
  move: "左スティック",
});

export function padControlText(text) {
  const names = {
    WASD: PAD_HINTS.move,
    SPACE: PAD_HINTS.dash,
    Q: PAD_HINTS.echo,
    R: PAD_HINTS.burst,
    E: PAD_HINTS.interact,
    J: PAD_HINTS.fire,
  };
  return String(text).replace(/WASD|SPACE|\b[QREJ]\b/g, (key) => names[key]);
}

const axis = (value) =>
  Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
const pressed = (button) =>
  Boolean(
    button?.pressed || (Number.isFinite(button?.value) && button.value > 0.5),
  );
const identity = (pad, slot) => `${pad.index ?? slot}:${pad.id ?? ""}`;

export class GamepadInput {
  constructor() {
    this.id = null;
    this.seen = false;
    this.buttons = [];
    this.axes = [0, 0, 0, 0];
    this.edges = new Set();
    this.blocked = new Set();
    this.stickBlocked = [false, false];
    this.direction = null;
    this.repeatAt = Infinity;
  }
  sample(pads) {
    const available = Array.from(pads || [])
      .map((pad, slot) => ({ pad, slot }))
      .filter(
        ({ pad }) =>
          pad && pad.connected !== false && pad.mapping === "standard",
      );
    const selected =
      available.find(({ pad, slot }) => identity(pad, slot) === this.id) ||
      available[0];
    const nextId = selected ? identity(selected.pad, selected.slot) : null;
    const disconnected = this.id !== null && nextId !== this.id;
    const changed = nextId !== this.id;
    const nextButtons = selected
      ? Array.from(selected.pad.buttons || [], pressed)
      : [];
    const nextAxes = Array.from({ length: 4 }, (_, i) =>
      axis(selected?.pad.axes?.[i]),
    );
    if (changed) {
      this.edges.clear();
      this.blocked.clear();
      this.stickBlocked = [false, false];
      this.direction = null;
      this.repeatAt = Infinity;
      // The first user gesture can open the home menu. A replacement or
      // reconnected controller must release its held controls first.
      if (nextId !== null && this.seen) {
        nextButtons.forEach((down, i) => {
          if (down) this.blocked.add(i);
        });
        this.stickBlocked = [0, 2].map(
          (i) => Math.hypot(nextAxes[i], nextAxes[i + 1]) > 0.15,
        );
      }
      this.buttons = [];
      this.axes = [0, 0, 0, 0];
    }
    let activity = false;
    nextButtons.forEach((down, i) => {
      if (!down) this.blocked.delete(i);
      else if (!this.buttons[i] && !this.blocked.has(i)) {
        this.edges.add(i);
        activity = true;
      }
    });
    for (let stick = 0; stick < 2; stick++) {
      const i = stick * 2;
      if (Math.hypot(nextAxes[i], nextAxes[i + 1]) <= 0.15)
        this.stickBlocked[stick] = false;
      if (
        !this.stickBlocked[stick] &&
        Math.hypot(nextAxes[i], nextAxes[i + 1]) > 0.15 &&
        (Math.abs(nextAxes[i] - this.axes[i]) > 0.02 ||
          Math.abs(nextAxes[i + 1] - this.axes[i + 1]) > 0.02)
      )
        activity = true;
    }
    this.id = nextId;
    if (nextId !== null) this.seen = true;
    this.buttons = nextButtons;
    this.axes = nextAxes;
    return { connected: nextId !== null, disconnected, activity };
  }
  suppress() {
    this.edges.clear();
    this.buttons.forEach((down, i) => {
      if (down) this.blocked.add(i);
    });
    for (let stick = 0; stick < 2; stick++) {
      const i = stick * 2;
      this.stickBlocked[stick] ||=
        Math.hypot(this.axes[i], this.axes[i + 1]) > 0.15;
    }
    this.direction = null;
    this.repeatAt = Infinity;
  }
  down(i) {
    return Boolean(this.buttons[i] && !this.blocked.has(i));
  }
  take(...indices) {
    let found = false;
    for (const i of indices) found = this.edges.delete(i) || found;
    return found;
  }
  stick(i) {
    return this.stickBlocked[i] ? [0, 0] : this.axes.slice(i * 2, i * 2 + 2);
  }
  movement() {
    const [x, y] = this.stick(0);
    return {
      x:
        (Math.abs(x) > 0.15 ? x : 0) +
        Number(this.down(15)) -
        Number(this.down(14)),
      y:
        (Math.abs(y) > 0.15 ? y : 0) +
        Number(this.down(13)) -
        Number(this.down(12)),
    };
  }
  menuStep(now) {
    const dx = Number(this.down(15)) - Number(this.down(14));
    const dy = Number(this.down(13)) - Number(this.down(12));
    const [x, y] = this.stick(0);
    let next = dy
      ? dy > 0
        ? "down"
        : "up"
      : dx
        ? dx > 0
          ? "right"
          : "left"
        : null;
    if (!next) {
      if (Math.max(Math.abs(x), Math.abs(y)) >= 0.55)
        next =
          Math.abs(x) > Math.abs(y)
            ? x > 0
              ? "right"
              : "left"
            : y > 0
              ? "down"
              : "up";
      else if (this.direction === "left" && x <= -0.35) next = "left";
      else if (this.direction === "right" && x >= 0.35) next = "right";
      else if (this.direction === "up" && y <= -0.35) next = "up";
      else if (this.direction === "down" && y >= 0.35) next = "down";
    }
    if (next !== this.direction) {
      this.direction = next;
      this.repeatAt = next ? now + 380 : Infinity;
      return next;
    }
    if (next && now >= this.repeatAt) {
      this.repeatAt = now + 110;
      return next;
    }
    return null;
  }
}
