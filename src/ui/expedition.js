import {
  BIOMES,
  ENEMIES,
  ROUTES,
  WEAPONS,
  RELICS,
  UPGRADES,
  ROOM_COUNT,
  actIndex,
  roomIndex,
  isBoss,
  isCamp,
  roomFeature,
  rank,
} from "../content.js";
import { forecastRoom } from "../game.js";
import { layoutThumbnail } from "../layout-preview.js";
import { rewardPlan, rewardRerollState } from "../rewards.js";
import {
  upgradeEffects,
  previewUpgrade,
  effectText,
} from "../upgrade-preview.js";
import {
  traderStock,
  forecastTrader,
  traderPrice,
  TRADER_HEAL_PRICE,
  TRADER_HEAL_AMOUNT,
} from "../trader.js";
import {
  bellRelicDescription,
  bellSeconds,
  weavesBell,
} from "../bell-weave.js";
import { escape, icon, button, panel } from "./markup.js";

export function rewardMarkup(game, offers) {
  const { theme, promised } = rewardPlan(game.run);
  const reroll = rewardRerollState(game.run);
  const rerollLabel =
    reroll.reason === "limit"
      ? "この部屋は二回まで"
      : reroll.reason === "exhausted"
        ? "ほかの候補なし"
        : `織り直す / 歯車 ${reroll.cost}`;
  const offerCount = offers.length === 3 ? "三枚" : `${offers.length}枚`;
  const cards = offers
    .map(
      (u, i) =>
        `<button class="card ${u.rarity}${u.id === promised?.id ? " promised" : ""}" data-action="upgrade" data-id="${u.id}">${icon(u.icon)}<span class="rarity">${u.rarity.toUpperCase()}</span><span class="tag">${u.tag} / 織片${u.id === promised?.id ? " · 航路の織片" : ""}</span><h3>${u.name}</h3><p>${u.desc}</p>${fragmentComparison(game.run, u.id)}<span class="detail">${rank(game.run, u.id) ? `現在 ${rank(game.run, u.id)} → ${rank(game.run, u.id) + 1}` : "新しい織目"} <span style="float:right"><kbd>${i + 1}</kbd></span></span></button>`,
    )
    .join("");
  return panel(
    `<p>${!offers.length ? "この旅の織片はすべて織り込みました。灯りを持って先へ進もう。" : promised ? `${theme.name}で見つけた織片。${offerCount}からひとつを、灯りに織り込む。` : "ひとつの昨日を、あなたの灯りに織り込む。"}</p>${weaveReadout(game)}<div class="cards" style="margin-top:14px">${cards}</div>${offers.length ? `<div class="reward-tools"><div><strong>${icon("scrap")}歯車 ${Math.floor(game.run.scrap)}</strong><small>${reroll.reason === "limit" ? "この部屋の糸を使い切りました" : reroll.reason === "exhausted" ? "他に入れ替えられる織片がありません" : `${promised ? "航路の織片を残して、ほかの候補を入れ替える" : "候補を入れ替え、違う織目を探す"} · 残り${reroll.limit - reroll.used}回`}</small></div>${button("rerollreward", rerollLabel, "ghost small", reroll.available ? "" : "disabled")}</div>` : ""}`,
    {
      title: "残響を織る",
      eyebrow: "A FRAGMENT OF YESTERDAY",
      footer: `<span class="muted" style="font-size:10px">この航路の間、効果は重なり続けます。</span>${button("skipreward", "織らずに進む", "ghost small")}`,
    },
  );
}

function weaveReadout(game) {
  const s = game.stats;
  return `<div class="weave-readout" role="group" aria-label="いまの灯り"><strong>いまの灯り</strong><span>体力 ${Math.ceil(game.run.hp)} / ${game.run.maxHp}</span><span>残響 最大${s.echoes}体</span><span>充填 ${s.echoCooldown.toFixed(1)}秒</span><span>寿命 ${s.echoDuration.toFixed(1)}秒</span></div>`;
}
function fragmentComparison(run, id, owned = false) {
  const rows = owned
    ? upgradeEffects(run, id).map(({ value, ...row }) => ({
        ...row,
        after: value,
      }))
    : previewUpgrade(run, id)?.rows;
  if (!rows?.length) return "";
  return `<span class="upgrade-comparison" data-preview="${owned ? "current" : "next"}">${rows.map((row) => `<span class="upgrade-effect" data-effect="${row.key}"><span class="effect-label">${row.label}</span><span class="effect-values">${owned ? "" : `<span class="effect-before">${effectText(row, row.before)}</span><span aria-hidden="true">→</span>`}<strong>${effectText(row, row.after)}</strong></span></span>`).join("")}</span>`;
}

export function routesMarkup(game) {
  const next = game.run.stage + 1,
    boss = isBoss(next),
    event = isCamp(next),
    newBiome = roomIndex(next) === 0;
  const choices = boss
    ? [
        {
          id: "loom",
          name: ENEMIES[BIOMES[actIndex(next)].boss].name,
          en: "THE KEEPER",
          icon: "lighthouse",
          desc: "この場所に残された記憶と向き合う。",
          reward:
            next === ROOM_COUNT - 1 ? "灯台の記憶" : "レア織片・灯守との対話",
          color: "#e4bc80",
        },
      ]
    : ROUTES.map((r) => ({
        ...r,
        desc: event
          ? {
              loom: "街に残された小さな物語",
              salvage: "歯車で織片と回復を購入",
              rest: "戦闘なしで全回復",
            }[r.id]
          : r.desc,
        reward: event
          ? { loom: "選択", salvage: "行商人", rest: "全回復" }[r.id]
          : r.reward,
      }));
  const cards = choices
    .map((r) => {
      const forecast = event ? null : forecastRoom(game.run, next, r.id);
      const stock =
        event && r.id === "salvage" ? forecastTrader(game.run, next) : null;
      const promise = r.id === "loom" ? forecast?.promised : null;
      const theme = promise ? forecast.theme : null;
      const threats = forecast
        ? ["weaver", "shield", "shooter", "charger", "moth", "crawler"]
            .filter((kind) => forecast.enemies[kind])
            .slice(0, 2)
            .map((kind) => `${ENEMIES[kind].name} ${forecast.enemies[kind]}`)
            .join("・")
        : "";
      const fragments = forecast?.offers.some((u) => u.rarity !== "common")
        ? "レア織片"
        : "織片";
      const offerCount =
        forecast?.offers.length === 3 ? "三枚" : `${forecast?.offers.length}枚`;
      const reward =
        boss && next !== ROOM_COUNT - 1
          ? `${forecast.offers.length ? `${fragments}・` : ""}灯守との対話`
          : forecast?.elite
            ? r.id === "loom"
              ? forecast.offers.length
                ? `${fragments}を含む${offerCount}`
                : "織り込み済み"
              : `${r.reward}${forecast.offers.length ? `・${fragments}` : ""}`
            : forecast && r.id === "loom" && !forecast.offers.length
              ? "織り込み済み"
              : r.reward;
      const description = theme
        ? `戦闘後に${theme.tag}の織片を含む${offerCount}から選ぶ。`
        : forecast?.theme
          ? forecast.offers.length
            ? "この織室で今選べる織片はありません。他の織片から選ぶ。"
            : "この旅の織片はすべて織り込みました。灯りを持って先へ進もう。"
          : r.desc;
      const stockPreview = stock
        ? `<span class="route-stock"><small>行商の品ぞろえ · 手持ち ${Math.floor(game.run.scrap)}</small>${stock.length ? stock.map((u) => `<span class="route-stock-item ${u.rarity}" data-id="${u.id}"><span><strong>${u.name}</strong><small>歯車 ${traderPrice(u)}</small></span><span>${u.desc}</span></span>`).join("") : "<span>この旅の織片はすべて織り込みました。</span>"}<span class="route-stock-heal">体力 +${TRADER_HEAL_AMOUNT} / 歯車 ${TRADER_HEAL_PRICE}</span></span>`
        : "";
      const layoutPreview =
        forecast && !boss
          ? `<span class="route-layout" data-layout-id="${escape(forecast.layout.id)}">${layoutThumbnail(forecast.layout)}<span><strong>${escape(forecast.layout.name)}</strong><small>${escape(forecast.layout.hint)}</small></span></span>`
          : "";
      return `<button class="card route-card" data-action="route" data-id="${r.id}"${promise ? ` data-promised="${promise.id}"` : ""}${stock ? ` data-stock="${stock.map((u) => u.id).join(",")}"` : ""}><span class="route-head">${icon(theme?.icon || r.icon)}<span class="route-heading"><span class="tag">${theme ? `${theme.tag} / 織室` : r.en}</span><h3>${theme?.name || r.name}</h3></span></span>${forecast ? `<span class="route-encounter"${forecast.encounter ? ` data-encounter-id="${escape(forecast.encounter.id)}"` : ""}>${forecast.encounter ? `<strong class="route-tactic">${escape(forecast.encounter.name)}</strong><span class="route-tactic-hint">${escape(forecast.encounter.hint)}</span>` : ""}<strong>敵 ${forecast.total}体${forecast.elite ? " · 強敵あり" : ""}</strong>${threats ? `<small>主な敵 · ${threats}</small>` : ""}</span>` : ""}<span class="detail">${reward} →</span><p>${description}</p>${promise ? `<span class="route-promise"><small>出会う織片</small><strong>${promise.name}</strong><span>${promise.desc}</span></span>` : ""}${layoutPreview}${stockPreview}</button>`;
    })
    .join("");
  return panel(
    `<p>${newBiome ? BIOMES[actIndex(next)].quote : "光の届く先を、あなたが決める。"}</p>${roomFeature(next) ? `<p class="route-feature"><strong>${roomFeature(next).name}</strong> · ${roomFeature(next).hint}</p>` : ""}<div class="route-progress">${Array.from({ length: ROOM_COUNT }, (_, i) => `<div class="route-step ${i < next ? "done" : i === next ? "current" : ""}" title="${i + 1}部屋目"></div>`).join("")}</div><div class="cards route-cards" ${boss ? 'style="grid-template-columns:1fr;max-width:360px;margin:auto"' : ""}>${cards}</div><p style="margin-top:16px;font-size:10px">次の場所：${BIOMES[actIndex(next)].name} / ${roomIndex(next) + 1} 航路 ${escape(game.run.seed)}</p>`,
    {
      title: newBiome
        ? "もっと深く、灯りを"
        : boss
          ? "灯りの守り手"
          : event
            ? "ひとときの潮待ち"
            : "次の航路",
      eyebrow: "CHOOSE A PATH",
      close: "resume",
    },
  );
}

export function shopMarkup(game) {
  const bought = game.run.shopBought || [];
  const cards = traderStock(game.run)
    .map((u) => {
      const price = traderPrice(u);
      return `<button class="card ${u.rarity}" data-action="buy" data-id="${u.id}" ${game.run.scrap < price || bought.includes(u.id) ? "disabled" : ""}>${icon(u.icon)}<span class="tag">${u.tag} / 織片</span><h3>${u.name}</h3><p>${u.desc}</p>${fragmentComparison(game.run, u.id, bought.includes(u.id))}<span class="trader-rank">${bought.includes(u.id) ? `現在 ${rank(game.run, u.id)}` : rank(game.run, u.id) ? `現在 ${rank(game.run, u.id)} → ${rank(game.run, u.id) + 1}` : "新しい織目"}</span><span class="detail">${bought.includes(u.id) ? "織り込み済み" : `歯車 ${price}`}</span></button>`;
    })
    .join("");
  return panel(
    `<p>「光は売らないよ。光をつなぐものなら、少しだけ。」</p>${!cards ? '<p class="text-teal">この旅の織片はすべて織り込みました。回復薬は用意してあるよ。</p>' : ""}${weaveReadout(game)}<div class="cards" style="margin-top:14px">${cards}</div><div class="trader-tools"><span class="memory-count">${icon("scrap")}歯車 ${Math.floor(game.run.scrap)}</span>${button("buyheal", `体力 +${TRADER_HEAL_AMOUNT} / 歯車${TRADER_HEAL_PRICE}`, "ghost small", game.run.scrap < TRADER_HEAL_PRICE || game.run.hp >= game.run.maxHp ? "disabled" : "")}</div>`,
    {
      title: "漂流者の行商",
      eyebrow: "THE WANDERING TRADER",
      footer: `<span class="muted" style="font-size:10px">買いものは、その場で保存されます。</span>${button("campdone", "灯りを持って進む →", "primary")}`,
    },
  );
}

export function inventoryMarkup(game) {
  const entries = UPGRADES.filter((u) => rank(game.run, u.id));
  return panel(
    `<p>${WEAPONS.find((w) => w.id === game.run.weapon).name} / ${RELICS.find((r) => r.id === game.run.relic).name}</p><p>${game.weapon.desc}</p><p>${bellRelicDescription(game.run, RELICS.find((r) => r.id === game.run.relic).desc)}</p><div class="codex-list" style="margin-top:20px">${entries.length ? entries.map((u) => `<article class="codex-entry">${icon(u.icon)}<div><h3>${u.name} × ${rank(game.run, u.id)}</h3><p>${u.desc}</p></div></article>`).join("") : "<p>まだ織片はありません。戦闘を終え、残響の織室で昨日を選びましょう。</p>"}</div><div class="divider"></div><p>航路 ${escape(game.run.seed)} / 残響 ${game.run.echoesCast}回 / 光糸での撃破 ${game.run.threadKills} / 糸でほどいた弾 ${game.run.threadCuts || 0} / 返し針 ${game.run.threadReturns || 0}${game.run.needleStitches ? ` / 合わせ縫い ${game.run.needleStitches}回` : ""}${weavesBell(game.run) ? ` / 鈴でほどいた弾 ${game.run.bellCuts}発 / 戻した充填 ${bellSeconds(game.run.bellRecovered)}秒` : ""}</p>`,
    {
      title: "あなたの織目",
      eyebrow: "THE LIGHT YOU HAVE WOVEN",
      close: "resume",
      footer: button("resume", "航路へ戻る", "primary"),
    },
  );
}
