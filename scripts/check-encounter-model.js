import { writeFile } from "node:fs/promises";
import { simulate } from "./simulate.js";
import {
  Game as Before,
  createRun as beforeRun,
} from "../.mdxr/20261007195700-echo-loom/assets/tactics-baseline/src/game.js";
import { Game, createRun } from "../src/game.js";
import { WEAPONS } from "../src/content.js";

const rows = [],
  started = Date.now();
for (const { id: weapon } of WEAPONS)
  for (const difficulty of [0, 2])
    for (const style of ["weaving", "shooting"])
      for (const route of ["loom", "salvage", "rest"]) {
        const options = { weapon, difficulty, style, route };
        const before = simulate("TACTIC-1", {
          ...options,
          GameClass: Before,
          createRunFn: beforeRun,
        });
        const after = simulate("TACTIC-1", {
          ...options,
          GameClass: Game,
          createRunFn: createRun,
        });
        rows.push({ options, before, after });
        console.log(
          JSON.stringify({
            ...options,
            beforeRooms: before.rooms,
            afterRooms: after.rooms,
            beforeDamage: before.damageTaken,
            afterDamage: after.damageTaken,
          }),
        );
      }
await writeFile(
  ".mdxr/20261007195700-echo-loom/assets/tactics-model.json",
  JSON.stringify(
    {
      scope:
        "36 paired fresh expeditions with the same 60 Hz pilot, weapon, difficulty, reward priority and chosen route. The first room is loom. Rest clears heal 30, salvage clears grant 35 scrap; only loom, elite or boss clears offer upgrades. Camps fully heal. Actual before/after Game and run factories. Encounter roster and later combat/choices can diverge; this is neither isolated causality nor human enjoyment/win rate.",
      seed: "TACTIC-1",
      pairs: rows.length,
      runs: rows.length * 2,
      wallSeconds: (Date.now() - started) / 1000,
      rows,
    },
    null,
    2,
  ),
);
