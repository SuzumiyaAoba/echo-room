// Keep battle notices clear of the controls whose height changes with the HUD.
export function attachNotificationLayout(ui, host, app) {
  const view = app.ownerDocument.defaultView;
  const selector = ".action-dock, .touch-actions, .stick, .action-feedback";
  let pending = 0;
  const schedule = () => {
    if (!pending) pending = view.requestAnimationFrame(update);
  };
  const resize = new view.ResizeObserver(schedule);
  const refresh = () => {
    resize.disconnect();
    for (const node of [app, host, ...ui.querySelectorAll(selector)]) {
      resize.observe(node);
    }
    schedule();
  };
  const set = (name, value) => {
    if (host.style.getPropertyValue(name) !== value) {
      host.style.setProperty(name, value);
    }
  };
  function update() {
    pending = 0;
    if (
      !host.children.length ||
      ui.querySelector(".overlay") ||
      !ui.querySelector(".hud")
    ) {
      host.removeAttribute("data-combat");
      return;
    }
    const controls = [...ui.querySelectorAll(selector)]
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    if (!controls.length) {
      host.removeAttribute("data-combat");
      return;
    }
    const bounds = app.getBoundingClientRect();
    const bottom =
      Math.min(view.innerHeight, ...controls.map((rect) => rect.top)) - 8;
    set("--notice-left", `${bounds.left + bounds.width / 2}px`);
    set("--notice-bottom", `${Math.max(0, view.innerHeight - bottom)}px`);
    set(
      "--notice-width",
      `${Math.max(0, Math.min(bounds.width * 0.85, view.innerWidth - 24))}px`,
    );
    set("--notice-height", `${Math.max(0, Math.min(180, bottom - 8))}px`);
    if (host.dataset.combat !== "true") host.dataset.combat = "true";
  }
  const hud = new view.MutationObserver(refresh);
  const notices = new view.MutationObserver(schedule);
  hud.observe(ui, { childList: true });
  notices.observe(host, { childList: true });
  view.addEventListener("resize", schedule);
  refresh();
}
