import {
  WEAPONS,
  RELICS,
  UPGRADES,
  LORE,
  ENEMIES,
  BIOMES,
} from "../content.js";
import { CITY_PROJECTS, STORIES, cityProgress } from "../story.js";
import { icon, button, panel } from "./markup.js";

export function cityMarkup(profile) {
  return panel(
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
  );
}

export function workshopMarkup(profile) {
  const items = [
    ...WEAPONS.slice(1).map((w) => ({ ...w, icon: "needle" })),
    ...RELICS.slice(1),
  ];
  return panel(
    `<p>記憶を、次の旅のお守りに。解放した道具は何度でも持ち出せます。</p><div class="codex-list" style="margin-top:22px">${items.map((x) => `<article class="codex-entry">${icon(x.icon)}<div style="flex:1"><h3>${x.name}</h3><p>${x.desc}</p><div style="margin-top:12px">${profile.unlocked.includes(x.id) ? '<span class="text-teal" style="font-size:10px">解放済み</span>' : button("unlock", `${x.cost} 記憶片で解放`, "small", `data-id="${x.id}" ${profile.memory < x.cost ? "disabled" : ""}`)}</div></div></article>`).join("")}</div><div class="divider"></div><p>初めて街に朝を届けると、新しい潮の深さ「荒潮」「深淵」が開きます。</p>`,
    {
      title: "灯守の工房",
      eyebrow: "KEEP WHAT THE SEA RETURNS",
      close: "home",
      footer: `<span class="memory-count">${icon("star")}記憶片 ${profile.memory}</span>${button("home", "灯台へ戻る", "ghost")}`,
    },
  );
}

export function codexMarkup(profile, tab) {
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
  return panel(
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
  );
}
