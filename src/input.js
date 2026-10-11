import { clamp } from "./math.js";
import { bindingsFor, keyCodes } from "./keybindings.js";
import { GamepadInput } from "./gamepad.js";
export class Input {
  constructor(canvas, onPause, getBindings = () => undefined) {
    this.canvas = canvas;
    this.getBindings = getBindings;
    this.bindingSource = undefined;
    this.bindings = bindingsFor();
    this.keys = new Set();
    this.pressed = new Set();
    this.ignoredUntilRelease = new Set();
    this.touchPressed = new Set();
    this.mouse = {
      x: 240,
      y: 150,
      down: false,
      active: false,
      inside: false,
      pointer: null,
    };
    this.aimSource = "assist";
    this.touch = { mx: 0, my: 0, ax: 0, ay: 0, fire: false };
    this.pad = new GamepadInput();
    this.device = "keyboard";
    window.addEventListener("keydown", (e) => {
      if (!e.ctrlKey && !e.metaKey && !e.altKey) this.useDevice("keyboard");
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) {
        if (e.code === "Escape" && !e.repeat) onPause();
        return;
      }
      if ((e.ctrlKey || e.metaKey || e.altKey) && e.code !== "Escape") return;
      if (this.ignoredUntilRelease.has(e.code)) {
        if (e.repeat) {
          e.preventDefault();
          return;
        }
        this.ignoredUntilRelease.delete(e.code);
      }
      if (e.target.closest(".overlay") && e.code !== "Escape") return;
      if (
        [
          "Space",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Tab",
        ].includes(e.code) &&
        e.code !== "Tab"
      )
        e.preventDefault();
      const codes = Object.values(this.currentBindings()).flatMap((keys) =>
        keys.flatMap(keyCodes),
      );
      if (codes.includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (!e.repeat) this.pressed.add(e.code);
      if (e.code === "Escape" && !e.repeat) onPause();
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      this.ignoredUntilRelease.delete(e.code);
    });
    window.addEventListener("blur", () => this.clear());
    window.addEventListener("pointerdown", (e) =>
      this.useDevice(e.pointerType === "touch" ? "touch" : "keyboard"),
    );
    canvas.addEventListener("pointermove", (e) => this.pointMouse(e));
    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch" || e.button !== 0) return;
      this.pointMouse(e);
      this.mouse.down = true;
      this.mouse.pointer = e.pointerId;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Window listeners continue a drag when capture is unavailable.
      }
    });
    canvas.addEventListener("pointerleave", () => {
      this.mouse.inside = false;
      if (!this.mouse.down) this.mouse.active = false;
    });
    window.addEventListener("pointermove", (e) => {
      if (this.mouse.down && e.pointerId === this.mouse.pointer)
        this.pointMouse(e);
    });
    window.addEventListener("pointerup", (e) => {
      if (e.pointerType !== "touch" && e.button === 0)
        this.releaseMouse(e.pointerId);
    });
    window.addEventListener("pointercancel", (e) => {
      if (e.pointerId !== this.mouse.pointer) return;
      this.releaseMouse(e.pointerId);
      this.mouse.active = false;
    });
    canvas.addEventListener("lostpointercapture", (e) => {
      if (e.pointerId === this.mouse.pointer) {
        this.mouse.down = false;
        this.mouse.pointer = null;
        if (!this.mouse.inside) this.mouse.active = false;
      }
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  clear() {
    this.pad.sample(this.getPads());
    this.pad.suppress();
    this.touchAbort?.abort();
    this.keys.clear();
    this.pressed.clear();
    this.touchPressed.clear();
    this.releaseMouse(this.mouse.pointer);
    this.mouse.active = false;
    this.mouse.inside = false;
    this.aimSource = "assist";
    this.touch = { mx: 0, my: 0, ax: 0, ay: 0, fire: false };
  }
  getPads() {
    try {
      return navigator.getGamepads?.() || [];
    } catch {
      return [];
    }
  }
  useDevice(device) {
    if (this.device === device) return;
    this.device = device;
    this.onDeviceChange?.(device);
  }
  pollPad() {
    const state = this.pad.sample(this.getPads());
    if (state.activity) this.useDevice("pad");
    if (state.disconnected) {
      this.onPadDisconnect?.();
      if (this.device === "pad") this.useDevice("keyboard");
    }
    return this.pad;
  }
  pointMouse(event) {
    if (event.pointerType === "touch") return;
    this.useDevice("keyboard");
    const rect = this.canvas.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return;
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 480;
    this.mouse.y = ((event.clientY - rect.top) / rect.height) * 300;
    this.mouse.inside =
      this.mouse.x >= 0 &&
      this.mouse.x < 480 &&
      this.mouse.y >= 0 &&
      this.mouse.y < 300;
    this.mouse.active = this.mouse.inside || this.mouse.down;
  }
  releaseMouse(pointer) {
    if (pointer !== this.mouse.pointer) return;
    this.mouse.down = false;
    this.mouse.pointer = null;
    if (!this.mouse.inside) this.mouse.active = false;
    if (pointer === null) return;
    try {
      if (this.canvas.hasPointerCapture(pointer))
        this.canvas.releasePointerCapture(pointer);
    } catch {
      // A cancelled pointer may already have released capture.
    }
  }
  aimView() {
    return {
      source: this.aimSource,
      x: this.mouse.x,
      y: this.mouse.y,
    };
  }
  consume(...codes) {
    const exists = codes.some((c) => this.pressed.has(c));
    codes.forEach((c) => this.pressed.delete(c));
    return exists;
  }
  ignoreUntilRelease(code) {
    for (const physical of keyCodes(code))
      this.ignoredUntilRelease.add(physical);
  }
  currentBindings() {
    const source = this.getBindings();
    if (source !== this.bindingSource) {
      this.bindingSource = source;
      this.bindings = bindingsFor(source);
    }
    return this.bindings;
  }
  read(player) {
    const pad = this.pollPad(),
      [ax, ay] = pad.stick(1);
    const padAim = Math.hypot(ax, ay) > 0.2;
    if (this.touch.fire || padAim) this.mouse.active = false;
    const bindings = this.currentBindings();
    const codes = (action) => bindings[action].flatMap(keyCodes);
    const key = (action) => codes(action).some((k) => this.keys.has(k));
    const press = (action) => {
      const keyboard = this.consume(...codes(action));
      const touch = this.touchPressed.delete(action);
      return keyboard || touch;
    };
    const value = {
      mx: Number(key("right")) - Number(key("left")) + this.touch.mx,
      my: Number(key("down")) - Number(key("up")) + this.touch.my,
      fire: this.mouse.down || key("fire") || this.touch.fire,
      dash: press("dash"),
      echo: press("echo"),
      burst: press("burst"),
      interact: press("interact"),
      angle: Math.atan2(this.mouse.y - player.y, this.mouse.x - player.x),
      autoAim: !this.mouse.active,
    };
    if (this.touch.fire) {
      value.angle = Math.atan2(this.touch.ay, this.touch.ax);
      value.autoAim = false;
    }
    if (pad.id !== null) {
      const movement = pad.movement();
      value.mx += movement.x;
      value.my += movement.y;
      if (padAim) {
        value.angle = Math.atan2(ay, ax);
        value.autoAim = false;
      }
      value.fire ||= pad.down(7) || pad.down(2);
      const dash = pad.take(0),
        echo = pad.take(5),
        burst = pad.take(4, 6),
        interact = pad.take(1);
      value.dash ||= dash;
      value.echo ||= echo;
      value.burst ||= burst;
      value.interact ||= interact;
      if (pad.take(9)) this.onPadPause?.();
    }
    this.aimSource = value.autoAim
      ? "assist"
      : padAim
        ? "pad"
        : this.touch.fire
          ? "touch"
          : "mouse";
    return value;
  }
  bindTouch(container) {
    this.touchAbort?.abort();
    this.touchAbort = new AbortController();
    const listen = (target, type, handler, options = {}) =>
      target.addEventListener(type, handler, {
        ...options,
        signal: this.touchAbort.signal,
      });
    for (const id of ["move", "aim"]) {
      const el = container.querySelector(`[data-stick="${id}"]`);
      if (!el) continue;
      let pointer = null;
      const update = (e) => {
        const rect = el.getBoundingClientRect(),
          x = (e.clientX - rect.left - rect.width / 2) / (rect.width * 0.38),
          y = (e.clientY - rect.top - rect.height / 2) / (rect.height * 0.38),
          l = Math.hypot(x, y);
        const dx = l > 1 ? x / l : x,
          dy = l > 1 ? y / l : y;
        el.style.setProperty("--sx", `${dx * 22}px`);
        el.style.setProperty("--sy", `${dy * 22}px`);
        if (id === "move") {
          this.touch.mx = dx;
          this.touch.my = dy;
        } else {
          this.touch.ax = dx;
          this.touch.ay = dy;
          this.touch.fire = l > 0.2;
        }
      };
      listen(el, "pointerdown", (e) => {
        if (e.pointerType === "touch") this.lastTouchAt = performance.now();
        pointer = e.pointerId;
        update(e);
        try {
          el.setPointerCapture(pointer);
        } catch {
          /* Window listeners keep dragging functional without capture. */
        }
        e.preventDefault();
      });
      listen(window, "pointermove", (e) => {
        if (e.pointerId === pointer) update(e);
      });
      const stop = () => {
        pointer = null;
        el.style.setProperty("--sx", "0px");
        el.style.setProperty("--sy", "0px");
        if (id === "move") {
          this.touch.mx = 0;
          this.touch.my = 0;
        } else this.touch.fire = false;
      };
      for (const type of ["pointerup", "pointercancel"])
        listen(window, type, (e) => {
          if (e.pointerId === pointer) stop();
        });
      listen(el, "lostpointercapture", stop);
      // Touch-enabled Firefox can expose mouse/touch events without pointer events.
      // These fallbacks also support browsers whose pointer capture is unavailable.
      listen(el, "mousedown", (e) => {
        if (
          e.button !== 0 ||
          pointer !== null ||
          performance.now() - (this.lastTouchAt ?? -1000) < 800
        )
          return;
        pointer = "mouse";
        update(e);
        e.preventDefault();
      });
      listen(window, "mousemove", (e) => {
        if (pointer === "mouse") update(e);
      });
      listen(window, "mouseup", (e) => {
        if (pointer === "mouse" && e.button === 0) stop();
      });
      listen(
        el,
        "touchstart",
        (e) => {
          this.lastTouchAt = performance.now();
          if (pointer !== null) return;
          const touch = e.changedTouches[0];
          pointer = `touch-${touch.identifier}`;
          update(touch);
          e.preventDefault();
        },
        { passive: false },
      );
      listen(
        window,
        "touchmove",
        (e) => {
          const touch = [...e.changedTouches].find(
            (t) => pointer === `touch-${t.identifier}`,
          );
          if (touch) {
            update(touch);
            e.preventDefault();
          }
        },
        { passive: false },
      );
      for (const type of ["touchend", "touchcancel"])
        listen(window, type, (e) => {
          if (
            [...e.changedTouches].some(
              (t) => pointer === `touch-${t.identifier}`,
            )
          )
            stop();
        });
    }
    for (const button of container.querySelectorAll("[data-touch-key]")) {
      const activate = (e) => {
        const now = performance.now();
        if (
          e.type === "mousedown" &&
          (now - (this.lastTouchAt ?? -1000) < 800 ||
            now - (this.lastPointerAt ?? -1000) < 100)
        )
          return;
        if (
          e.type === "touchstart" &&
          now - (this.lastPointerAt ?? -1000) < 100
        )
          return;
        if (e.type === "pointerdown") this.lastPointerAt = now;
        if (e.type === "touchstart" || e.pointerType === "touch")
          this.lastTouchAt = now;
        if (button.dataset.touchAction)
          this.touchPressed.add(button.dataset.touchAction);
        else this.pressed.add(button.dataset.touchKey);
        e.preventDefault();
      };
      listen(button, "pointerdown", activate);
      listen(button, "mousedown", activate);
      listen(button, "touchstart", activate, { passive: false });
    }
  }
  menu(container, onBack, now = performance.now(), delta = 1 / 60) {
    const pad = this.pollPad();
    if (pad.id === null) return;
    const back = pad.take(1, 9);
    if (back) {
      onBack();
      return;
    }
    const scope = container.querySelector(".overlay") || container;
    const buttons = Array.from(
      scope.querySelectorAll(
        "button:not(:disabled),input:not(:disabled),summary",
      ),
    ).filter((el) => el.getClientRects().length);
    let active = document.activeElement,
      index = buttons.indexOf(active);
    const direction = pad.menuStep(now);
    if (
      direction &&
      active?.matches('input[type="range"]') &&
      ["left", "right"].includes(direction)
    ) {
      const before = active.value;
      if (direction === "left") active.stepDown();
      else active.stepUp();
      if (active.value !== before)
        active.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (direction && buttons.length) {
      const step = ["up", "left"].includes(direction) ? -1 : 1;
      index = index < 0 ? 0 : (index + step + buttons.length) % buttons.length;
      active = buttons[index];
      active.focus();
    }
    const content = scope.querySelector(".panel-content");
    const [, scroll] = pad.stick(1);
    const previousPage = pad.take(4),
      nextPage = pad.take(5);
    if (content) {
      if (Math.abs(scroll) > 0.2)
        content.scrollTop += scroll * 300 * Math.min(0.1, delta);
      if (previousPage || nextPage)
        content.scrollTop +=
          (Number(nextPage) - Number(previousPage)) *
          content.clientHeight *
          0.8;
    }
    if (pad.take(0)) {
      if (!buttons.includes(active))
        active = scope.querySelector(".primary") || buttons[0];
      active?.click();
    }
  }
}
