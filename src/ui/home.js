import { BIOMES, actIndex } from "../content.js";
import { escape, icon, button } from "./markup.js";

export function homeMarkup(profile, { logo, version, fullscreenButton }) {
  return `<div class="home-shade"></div>
    <div class="topbar"><span class="brand-small">A LIGHT FOR TOMORROW</span><div class="home-tools"><span class="memory-count">${icon("star")} <span class="number">${profile.memory}</span></span>${fullscreenButton("small ghost")}${button("settings", "設定", "small ghost")}</div></div>
    <section class="home"><div class="eyebrow">MEMORY-WOVEN ROGUELITE</div><img class="wordmark" src="${logo}" alt="ECHO LOOM"><h1>残響の灯台</h1><p class="home-copy">昨日のあなたが、<br><em>明日の道を織る。</em></p>
    <div class="home-actions">${profile.run ? button("continue", `<span>航路を続ける<small>CONTINUE · ${escape(BIOMES[actIndex(profile.run.stage)].name)}</small></span><span class="arrow">→</span>`, "primary launch") : button("setup", '<span>灯りをともす<small>BEGIN AN EXPEDITION</small></span><span class="arrow">→</span>', "primary launch")}
    ${profile.run ? button("newrun", "新しい航路", "ghost small") : ""}<div class="home-links">${button("workshop", "灯守の工房", "ghost")}${button("city", "街を織り直す", "ghost")}${button("codex", "記憶の書庫", "ghost")}${button("help", "遊び方", "ghost")}</div>${profile.lastReturn ? `<div class="home-aftercare">${button("practice", "灯りの練習", "practice-link ghost small")}${button("lastreturn", "直近の旅", "ghost small")}</div>` : button("practice", "灯りの練習", "practice-link ghost small")}</div><div class="home-note" data-pad-home data-original="${profile.victories ? "朝が戻っても、まだ届かない灯りがある。" : "ひとりの灯守。いくつもの昨日。"}">${profile.victories ? "朝が戻っても、まだ届かない灯りがある。" : "ひとりの灯守。いくつもの昨日。"}</div></section>
    <div class="art-caption">第七灯台<br><span style="color:#698e81;letter-spacing:3px">${profile.victories ? "05:12 · 明日の岸" : "23:47 · 潮待ち"}</span></div><div class="home-bottom"><span>ORIGINAL PIXEL WORLD / ECHO LOOM</span><span>v${version} · BROWSER EDITION</span></div>`;
}
