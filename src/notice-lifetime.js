export class NoticeLifetime {
  constructor() {
    this.entries = new Map();
  }
  add(node, now) {
    this.entries.set(node, { remaining: 2600, at: now });
  }
  update(now, paused) {
    for (const [node, entry] of this.entries) {
      if (!node.isConnected) {
        this.entries.delete(node);
        continue;
      }
      const elapsed = Math.max(0, now - entry.at);
      entry.at = Math.max(now, entry.at);
      if (!paused) entry.remaining -= elapsed;
      if (entry.remaining <= 0) {
        node.remove();
        this.entries.delete(node);
      }
    }
  }
}
