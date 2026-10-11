import { simulate, SIMULATION_STYLES } from "./simulate.js";
import { simulate as previous } from "../tests/fixtures/layouts-v1/simulate.js";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const pairs = [];
for (const weapon of ["needle", "scatter", "prism"])
  for (const difficulty of [0, 2])
    for (const style of Object.keys(SIMULATION_STYLES))
      for (let i = 0; i < 3; i++) {
        const seed = `LAYOUT-BALANCE-${i}`,
          options = { weapon, difficulty, style };
        const before = previous(seed, options),
          after = simulate(seed, options);
        for (const r of [before, after]) {
          assert.ok(r.seconds > 0 && Number.isFinite(r.seconds));
          assert.ok(r.choices.every((c) => c.offered.includes(c.id)));
          assert.ok(r.encounters.every((e) => e.seconds > 0));
        }
        const row = { seed, ...options, before, after };
        pairs.push(row);
        console.log(
          JSON.stringify({
            seed,
            ...options,
            previous: before.failed
              ? `${before.reason}/${before.stage}`
              : "win",
            current: after.failed ? `${after.reason}/${after.stage}` : "win",
            seconds: [before.seconds, after.seconds],
            damageTaken: [before.damageTaken, after.damageTaken],
          }),
        );
      }
await writeFile(
  "/tmp/echo-layouts-balance.json",
  JSON.stringify(
    {
      scope:
        "72 paired complete/failed expeditions using the actual old and current combat models, same seeds, three weapons, two difficulties and four actual-offer policies at 60Hz. Original pilot inputs and camp recovery; no HP/enemy/clock shortcuts. Automated model evidence, not native browser play, human win rates or enjoyment.",
      pairs,
    },
    null,
    2,
  ) + "\n",
);
