import assert from "node:assert/strict";
import { SAVE_KEY } from "../src/save.js";

// Read only public markup and the saved build. The battle model is not exposed
// or modified by this observer, including in the offline production checks.
export async function observeUpgradeComparisons(page, action = "upgrade") {
  const before = await page.evaluate(
    (key) => localStorage.getItem(key),
    SAVE_KEY,
  );
  const result = await page.evaluate(
    (action) => ({
      readout: document.querySelector(".weave-readout")?.textContent.trim(),
      cards: [...document.querySelectorAll(`[data-action="${action}"]`)].map(
        (card) => ({
          id: card.dataset.id,
          mode: card.querySelector(".upgrade-comparison")?.dataset.preview,
          disabled: card.disabled,
          effects: [...card.querySelectorAll(".upgrade-effect")].map((row) => ({
            key: row.dataset.effect,
            label: row.querySelector(".effect-label").textContent,
            before: row.querySelector(".effect-before")?.textContent ?? null,
            after: row.querySelector(".effect-values strong").textContent,
          })),
          horizontalOverflow: [
            ...card.querySelectorAll(
              ".upgrade-comparison,.upgrade-effect,.effect-values",
            ),
          ].some((node) => node.scrollWidth > node.clientWidth + 1),
        }),
      ),
    }),
    action,
  );
  assert.equal(
    await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY),
    before,
    "Observing a comparison must not change the save",
  );
  assert.ok(result.readout?.startsWith("いまの灯り"));
  assert.ok(result.cards.length > 0);
  for (const card of result.cards) {
    assert.ok(["next", "current"].includes(card.mode), card.id);
    assert.ok(card.effects.length > 0, card.id);
    assert.equal(card.horizontalOverflow, false, card.id);
    for (const row of card.effects) {
      assert.ok(row.label.length && row.after.length, card.id);
      if (card.mode === "next") {
        assert.ok(row.before?.length, card.id);
        assert.notEqual(row.before, row.after, `${card.id}/${row.key}`);
      } else assert.equal(row.before, null, `${card.id}/${row.key}`);
    }
  }
  return result;
}
