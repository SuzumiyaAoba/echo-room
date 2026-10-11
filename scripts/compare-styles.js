import { observationPath } from "./observation-files.js";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { SIMULATION_STYLES, simulate } from "./simulate.js";

const samples = Number(process.argv[2] || 3);
const destination = process.argv[3] || observationPath("balance-styles.json");
const rows = [];
const groups = [];
for (const weapon of ["needle", "scatter", "prism"])
  for (const difficulty of [0, 2])
    for (const style of Object.keys(SIMULATION_STYLES)) {
      const group = [];
      for (let index = 0; index < samples; index++) {
        const row = simulate(`STYLE-${index}`, { weapon, difficulty, style });
        assert.ok(Number.isFinite(row.seconds));
        assert.ok(row.hp >= 0);
        assert.ok(
          Object.values(row.damage).every((n) => Number.isFinite(n) && n >= 0),
        );
        assert.ok(row.choices.every((c) => c.offered.includes(c.id)));
        rows.push(row);
        group.push(row);
      }
      const wins = group.filter((row) => !row.failed);
      const total = (source) =>
        group.reduce((sum, row) => sum + (row.damage[source] || 0), 0);
      const dealt = group.reduce(
        (sum, row) =>
          sum + Object.values(row.damage).reduce((a, b) => a + b, 0),
        0,
      );
      const share = (source) =>
        Number(((100 * total(source)) / (dealt || 1)).toFixed(1));
      const mean = (key) =>
        wins.length
          ? Math.round(
              wins.reduce((sum, row) => sum + row[key], 0) / wins.length,
            )
          : null;
      const summary = {
        weapon,
        difficulty,
        style,
        wins: wins.length,
        attempts: samples,
        clearSeconds: mean("seconds"),
        clearDamageTaken: mean("damageTaken"),
        clearThreadCuts: mean("threadCuts"),
        clearThreadReturns: mean("threadReturns"),
        clearNeedleStitches: mean("needleStitches"),
        damagePercent: {
          shot: share("shot"),
          echo: share("echo"),
          thread: share("thread"),
          burst: share("burst"),
          counter: share("counter"),
        },
        failures: group
          .filter((row) => row.failed)
          .map((row) => ({
            seed: row.seed,
            stage: row.stage,
            reason: row.reason,
          })),
      };
      assert.ok(
        Math.abs(
          Object.values(summary.damagePercent).reduce((a, b) => a + b, 0) - 100,
        ) < 0.3,
      );
      groups.push(summary);
      console.log(JSON.stringify(summary));
    }
await writeFile(
  destination,
  JSON.stringify(
    {
      environment:
        "Production combat model at 60Hz; ordinary controls, actual offered upgrades, spool relic, full recovery at camps. Automated pilot evidence, not human win rates or enjoyment.",
      styles: SIMULATION_STYLES,
      groups,
      rows,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Saved ${rows.length} complete/failed expeditions to ${destination}`,
);
