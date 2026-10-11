import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { simulate } from "./simulate.js";

const destination = ".mdxr/20261007195700-echo-loom/assets";
const saved = JSON.parse(
  await readFile(`${destination}/balance-counter.json`, "utf8"),
);
const expected = saved.rows.find(
  (r) =>
    r.failed &&
    r.weapon === "prism" &&
    r.style === "weaving" &&
    r.seed === "STYLE-1",
);
assert.ok(expected);
const options = { weapon: "prism", difficulty: 2, style: "weaving" };
const baseline = simulate("STYLE-1", options);
assert.deepEqual(
  baseline,
  expected,
  "Default selector must reproduce the saved failed run exactly",
);
const branches = [];
for (const id of ["counter", "quickecho", "refund"]) {
  const row = simulate("STYLE-1", { ...options, rewardChoices: { 7: id } });
  assert.deepEqual(
    row.choices.filter((c) => c.stage < 7),
    baseline.choices.filter((c) => c.stage < 7),
  );
  assert.deepEqual(
    row.encounters.filter((c) => c.stage <= 7),
    baseline.encounters.filter((c) => c.stage <= 7),
  );
  assert.equal(row.choices.find((c) => c.stage === 7)?.id, id);
  assert.ok(row.choices.every((c) => c.offered.includes(c.id)));
  if (id === "counter") assert.deepEqual(row, baseline);
  branches.push({ forcedLegalChoiceAtStage7: id, ...row });
  console.log(
    JSON.stringify({
      choice: id,
      failed: row.failed,
      stage: row.stage,
      hp: row.hp,
      seconds: row.seconds,
      threadReturns: row.threadReturns,
      stage8: row.encounters.find((c) => c.stage === 8),
      stage9: row.encounters.find((c) => c.stage === 9),
      errors: [],
    }),
  );
}
assert.throws(
  () => simulate("STYLE-1", { ...options, rewardChoices: { 0: "counter" } }),
  /was not offered/,
);
await writeFile(
  `${destination}/counter-choice-investigation.json`,
  JSON.stringify(
    {
      scope:
        "Production combat model at fixed 60Hz, identical STYLE-1 prism/spool highest-difficulty weaving pilot. Only the chosen actual offered fragment at stage seven is explicitly selected; earlier encounters and choices must match the saved failure. Later ordinary choices follow the same priority and may diverge. Camps still use the simulator's full recovery assumption. No game balance change, actual browser run, human win-rate or enjoyment claim.",
      defaultSavedFailureReproduced: true,
      illegalChoiceRejected: true,
      baseline,
      branches,
    },
    null,
    2,
  ) + "\n",
);
