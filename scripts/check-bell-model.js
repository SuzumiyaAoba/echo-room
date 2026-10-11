import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { simulate as before } from "../.mdxr/20261007195700-echo-loom/assets/bell-baseline/scripts/simulate.js";
import { Game as BeforeGame } from "../.mdxr/20261007195700-echo-loom/assets/bell-baseline/src/game.js";
import { simulate as after } from "./simulate.js";
import { Game } from "../src/game.js";
import { WEAPONS } from "../src/content.js";
const destination = ".mdxr/20261007195700-echo-loom/assets";
const phase = process.argv[2] || "before";
assert.ok(["before", "paired"].includes(phase));
function observe(GameClass) {
  const original = GameClass.prototype.dash;
  const meter = { dashes: 0, erased: 0, recoveredSeconds: 0, activeDashes: 0 };
  GameClass.prototype.dash = function (...args) {
    const bullets = this.bullets.slice();
    const cd = this.player.echoCd;
    const result = Reflect.apply(original, this, args);
    if (this.run.relic === "bell") {
      const erased = bullets.filter(
        (b) => !b.friendly && !this.bullets.includes(b),
      ).length;
      meter.dashes++;
      meter.erased += erased;
      meter.recoveredSeconds += Math.max(0, cd - this.player.echoCd);
      if (erased) meter.activeDashes++;
    }
    return result;
  };
  return {
    meter,
    restore: () => {
      GameClass.prototype.dash = original;
    },
  };
}
function run(simulate, GameClass, options) {
  const observer = observe(GameClass);
  try {
    return { result: simulate("BELL-1", options), bell: { ...observer.meter } };
  } finally {
    observer.restore();
  }
}
const rows = [];
const started = Date.now();
for (const { id: weapon } of WEAPONS)
  for (const relic of ["spool", "bell", "ember"])
    for (const difficulty of [0, 2])
      for (const style of ["weaving", "footwork"]) {
        const options = { weapon, relic, difficulty, style };
        const old = run(before, BeforeGame, options);
        const next = phase === "paired" ? run(after, Game, options) : null;
        if (next && relic !== "bell") assert.deepEqual(next, old);
        const row = {
          options,
          before: old,
          ...(next
            ? {
                after: next,
                equal: JSON.stringify(old) === JSON.stringify(next),
              }
            : {}),
        };
        rows.push(row);
        console.log(
          JSON.stringify({
            phase,
            ...options,
            beforeRooms: old.result.rooms,
            afterRooms: next?.result.rooms,
            erased: old.bell.erased,
            recovered: next?.bell.recoveredSeconds,
          }),
        );
      }
await writeFile(
  destination + "/bell-model-" + phase + ".json",
  JSON.stringify(
    {
      phase,
      scope:
        "Deterministic 60 Hz model pilots; camps fully heal, reward offers use the same priorities. This is not native input, human win rate, or isolated causality after offers diverge.",
      seed: "BELL-1",
      runs: rows.length * (phase === "paired" ? 2 : 1),
      wallSeconds: (Date.now() - started) / 1000,
      rows,
    },
    null,
    2,
  ) + "\n",
);
