import { WEAPONS, RELICS, UPGRADES } from "../content.js";
import { CITY_PROJECTS, startingFragments } from "../story.js";
import { escape, icon, button, panel } from "./markup.js";

export function setupMarkup(profile, selection, seed = "") {
  const cards = WEAPONS.map(
    (w) =>
      `<button class="card ${selection.weapon === w.id ? "selected" : ""}" data-action="weapon" data-id="${w.id}" ${profile.unlocked.includes(w.id) ? "" : "disabled"}>${icon("needle")}<span class="tag">${w.en}</span><h3>${w.name}</h3><p>${w.desc}</p><span class="detail">${profile.unlocked.includes(w.id) ? `威力 ${w.damage} × ${w.shots} / ${w.rate}秒` : "灯守の工房で解放"}</span></button>`,
  ).join("");
  return panel(
    `<p>残響を織り、沈んだ街の奥へ。持ち帰った記憶が、次の旅をひらく。</p><div class="section-label">射出器 / YOUR NEEDLE</div><div class="cards">${cards}</div><div class="section-label">お守り / KEEPSAKE</div><div class="loadout-row">${RELICS.map((r) => `<button class="loadout-item ${selection.relic === r.id ? "selected" : ""}" data-action="relic" data-id="${r.id}" title="${r.desc}" ${profile.unlocked.includes(r.id) ? "" : "disabled"}>${icon(r.icon)}${r.name}</button>`).join("")}</div><p id="relic-description" style="margin-top:10px;font-size:10px">${RELICS.find((r) => r.id === selection.relic).desc}</p>${fragmentSetup(profile, selection)}<div class="seed-row"><label class="field">航路番号 / 空欄で新しい航路<input id="seed" maxlength="32" value="${escape(seed)}" placeholder="例：LIGHT-001" autocomplete="off"></label><div class="field">潮の深さ<div class="segmented">${["凪", "荒潮", "深淵"].map((name, i) => `<button data-action="difficulty" data-id="${i}" class="${selection.difficulty === i ? "selected" : ""}" ${i > 0 && !profile.victories ? "disabled" : ""}>${name}</button>`).join("")}</div></div></div>`,
    {
      title: "旅の支度",
      eyebrow: "PREPARE THE LIGHT",
      close: "home",
      footer: `${button("daily", "今日の航路", "ghost small")} ${button("start", "この灯りで出発する →", "primary")}`,
    },
  );
}

function fragmentSetup(profile, selection) {
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
