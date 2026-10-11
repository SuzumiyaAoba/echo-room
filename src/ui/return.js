import { ROOM_COUNT } from "../content.js";
import { returnReadout } from "../return-record.js";
import { escape, icon, timeText } from "./markup.js";

export function returnBuild(record) {
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
