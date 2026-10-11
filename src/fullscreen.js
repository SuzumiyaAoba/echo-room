// The browser owns the fullscreen session. Never save a requested mode as if it
// were the actual mode, or postpone the API call beyond the user's click.
export class FullscreenControl {
  constructor(document, { onUpdate, onChange, onError } = {}) {
    this.document = document;
    this.onUpdate = onUpdate;
    this.onChange = onChange;
    this.onError = onError;
    this.pending = false;
    this.wasActive = this.active;
    document.addEventListener("fullscreenchange", () => {
      const active = this.active;
      if (active !== this.wasActive) {
        this.wasActive = active;
        this.onChange?.(active);
      }
      this.onUpdate?.();
    });
  }

  get active() {
    return Boolean(this.document.fullscreenElement);
  }

  get supported() {
    return (
      this.document.fullscreenEnabled === true &&
      typeof this.document.documentElement.requestFullscreen === "function" &&
      typeof this.document.exitFullscreen === "function"
    );
  }

  get disabled() {
    return this.pending || (!this.active && !this.supported);
  }

  get label() {
    return this.pending
      ? "画面を切り替え中…"
      : this.active
        ? "全画面を閉じる"
        : "全画面にする";
  }

  async toggle() {
    if (this.disabled) return false;
    const exiting = this.active;
    this.pending = true;
    this.onUpdate?.();
    try {
      if (exiting) await this.document.exitFullscreen();
      else
        await this.document.documentElement.requestFullscreen({
          navigationUI: "hide",
        });
      return true;
    } catch {
      // Escape may make the browser exit before our exit promise completes.
      if (exiting && !this.active) return true;
      this.onError?.(
        exiting
          ? "全画面を閉じられませんでした。ESCでも閉じられます。"
          : "全画面に切り替えられませんでした。このまま遊べます。",
      );
      return false;
    } finally {
      this.pending = false;
      this.onUpdate?.();
    }
  }
}
