import { clamp } from "../../../src/math.js";
import { bindingsFor, keyCodes } from "../../../src/keybindings.js";
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
    this.mouse = { x: 240, y: 150, down: false, active: false };
    this.touch = { mx: 0, my: 0, ax: 0, ay: 0, fire: false };
    this.padPrevious = [];
    window.addEventListener("keydown", (e) => {
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
    canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "touch") {
        const rect = canvas.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 480;
        this.mouse.y = ((e.clientY - rect.top) / rect.height) * 300;
        this.mouse.active = true;
      }
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch" && e.button === 0) this.mouse.down = true;
    });
    window.addEventListener("pointerup", () => (this.mouse.down = false));
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  clear() {
    this.touchAbort?.abort();
    this.keys.clear();
    this.pressed.clear();
    this.touchPressed.clear();
    this.mouse.down = false;
    this.touch = { mx: 0, my: 0, ax: 0, ay: 0, fire: false };
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
    const pad = Array.from(navigator.getGamepads?.() || []).find(Boolean);
    if (pad) {
      value.mx += Math.abs(pad.axes[0]) > 0.15 ? pad.axes[0] : 0;
      value.my += Math.abs(pad.axes[1]) > 0.15 ? pad.axes[1] : 0;
      if (Math.hypot(pad.axes[2] || 0, pad.axes[3] || 0) > 0.2) {
        value.angle = Math.atan2(pad.axes[3], pad.axes[2]);
        value.autoAim = false;
      }
      const btn = (i) => pad.buttons[i]?.pressed || false,
        edge = (i) => btn(i) && !this.padPrevious[i];
      value.fire ||= btn(7) || btn(2);
      value.dash ||= edge(0);
      value.echo ||= edge(5);
      value.burst ||= edge(4) || edge(6);
      value.interact ||= edge(1);
      if (edge(9)) this.onPadPause?.();
      this.padPrevious = pad.buttons.map((b) => b.pressed);
    }
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
  menu(container, onBack) {
    const pad = Array.from(navigator.getGamepads?.() || []).find(Boolean);
    if (!pad) return;
    const btn = (i) => pad.buttons[i]?.pressed || false,
      edge = (i) => btn(i) && !this.padPrevious[i];
    const scope = container.querySelector(".overlay") || container;
    const buttons = Array.from(
      scope.querySelectorAll("button:not(:disabled),input,summary"),
    ).filter((el) => el.getClientRects().length);
    let active = document.activeElement,
      index = buttons.indexOf(active);
    if (edge(12) || edge(14)) {
      index = (index - 1 + buttons.length) % buttons.length;
      buttons[index]?.focus();
    }
    if (edge(13) || edge(15)) {
      index = (index + 1) % buttons.length;
      buttons[index]?.focus();
    }
    if (edge(0)) {
      if (!scope.contains(active))
        active = scope.querySelector(".primary") || buttons[0];
      active?.click();
    }
    if (edge(1) || edge(9)) onBack();
    this.padPrevious = pad.buttons.map((b) => b.pressed);
  }
}
