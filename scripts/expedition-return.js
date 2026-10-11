import { developmentURL } from "./browser-url.js";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { SAVE_KEY, prepareImport } from "../src/save.js";
import { actIndex, stats } from "../src/content.js";
import { makeReturnRecord, returnReadout } from "../src/return-record.js";

// Observe a genuinely completed native expedition. All actions use public UI;
// the only Game access is a read-only snapshot for the frozen victory screen.
export async function inspectExpeditionReturn({
  page,
  run,
  departure,
  destination,
  artifact,
}) {
  const saved = (target) =>
    target.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
  const report = {
    departure,
    scope:
      "Full native expedition, genuine public download, independent fresh-context public import/reload/book and next-run start. No injected profile, actors, damage, health, RNG or clock.",
    status: "running",
    checks: [],
  };
  let importedContext = null;
  try {
    const completed = await saved(page);
    report.completed = completed;
    assert.equal(completed.run, null);
    assert.equal(completed.attempts, departure.attempts + 1);
    assert.equal(completed.victories, departure.victories + 1);
    assert.equal(completed.totalKills, departure.totalKills + run.kills);
    assert.equal(completed.best, Math.max(departure.best, run.stage + 1));
    const memory =
      Math.floor(run.kills * 0.45) + actIndex(run.stage) * 8 + run.memory + 35;
    assert.equal(completed.memory, departure.memory + memory);
    assert.deepEqual(completed.lastReturn, makeReturnRecord(run, true, memory));
    const light = stats(run);
    assert.equal(completed.lastReturn.light.capacity, light.echoes);
    assert.equal(completed.lastReturn.light.chargeSeconds, light.echoCooldown);
    assert.equal(completed.lastReturn.light.lifeSeconds, light.echoDuration);
    report.checks.push(
      "actual final run and paid return match the persisted record",
    );
    const readout = returnReadout(completed.lastReturn);
    await page.locator(".return-build > summary").click();
    await page.locator(".return-performance > summary").click();
    assert.equal(
      await page.locator("[data-return-fragment]").count(),
      readout.fragments.length,
    );
    for (const fragment of readout.fragments) {
      const text = await page
        .locator('[data-return-fragment="' + fragment.id + '"]')
        .innerText();
      assert.ok(text.includes(fragment.name));
      assert.ok(text.includes("×" + fragment.level));
    }
    const frozen = () =>
      page.evaluate(
        (key) => ({
          game: JSON.stringify(window.__ECHO_LOOM__.game()),
          pixels: document.querySelector("#world").toDataURL(),
          body: document.body.innerText,
          save: localStorage.getItem(key),
        }),
        SAVE_KEY,
      );
    await page.waitForFunction(
      () => document.querySelector("#notifications").children.length === 0,
    );
    await page.waitForTimeout(100);
    const before = await frozen();
    await page.waitForTimeout(350);
    assert.deepEqual(await frozen(), before);
    report.freeze = {
      milliseconds: 350,
      sha256: Object.fromEntries(
        Object.entries(before).map(([key, value]) => [
          key,
          createHash("sha256").update(value).digest("hex"),
        ]),
      ),
      game: true,
      pixels: true,
      body: true,
      rawSave: true,
    };
    await page.screenshot({
      path: destination + "/" + artifact + "-return.png",
    });
    report.checks.push(
      "all earned fragments are readable and the full victory state stays frozen",
    );
    await page.locator('[data-action="home"]').click();
    assert.deepEqual(await saved(page), completed);
    await page.reload();
    assert.deepEqual(await saved(page), completed);
    await page.getByRole("button", { name: "設定", exact: true }).click();
    const downloadEvent = page.waitForEvent("download");
    await page.locator('[data-action="export"]').click();
    const download = await downloadEvent;
    const exportedArtifact = artifact + "-export.json";
    await download.saveAs(destination + "/" + exportedArtifact);
    const bytes = await readFile(destination + "/" + exportedArtifact);
    const portable = prepareImport(bytes.toString()).profile;
    assert.deepEqual(portable, completed);
    assert.deepEqual(await saved(page), completed);
    report.export = {
      artifact: exportedArtifact,
      suggestedFilename: download.suggestedFilename(),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
    };
    report.checks.push(
      "home, reload and genuine export preserve the entire completed profile",
    );
    importedContext = await page
      .context()
      .browser()
      .newContext({ viewport: { width: 1200, height: 850 } });
    await importedContext.addInitScript(() => {
      const Native = window.AudioContext;
      window.AudioContext = class extends Native {
        constructor(options) {
          super({ ...options, sinkId: { type: "none" } });
        }
      };
    });
    const target = await importedContext.newPage();
    const errors = [];
    target.on("pageerror", (error) => errors.push(error.message));
    await target.goto(developmentURL);
    assert.equal(
      await saved(target),
      null,
      "The importing context starts without a save",
    );
    await target.getByRole("button", { name: "設定", exact: true }).click();
    await target
      .locator("#save-file")
      .setInputFiles(destination + "/" + exportedArtifact);
    await target.locator('[data-action="importrecord"]').click();
    assert.deepEqual(await saved(target), completed);
    await target.reload();
    assert.deepEqual(await saved(target), completed);
    await target.locator('[data-action="lastreturn"]').click();
    await target.locator(".return-build > summary").click();
    assert.equal(
      await target.locator("[data-return-fragment]").count(),
      readout.fragments.length,
    );
    assert.deepEqual(await saved(target), completed);
    await target.screenshot({
      path: destination + "/" + artifact + "-imported.png",
    });
    report.checks.push(
      "an independent fresh context imports the actual file and retains the whole profile after reload and book reading",
    );
    await target.locator('[data-action="returnagain"]').click();
    const nextSeed = ("NEXT-" + run.seed).slice(0, 32);
    await target.locator("#seed").fill(nextSeed);
    await target.locator('[data-action="start"]').click();
    await target.keyboard.press("Escape");
    const next = await target.evaluate(() =>
      structuredClone(window.__ECHO_LOOM__.game().run),
    );
    assert.equal(next.stage, 0);
    assert.equal(next.seed, nextSeed);
    assert.equal(next.weapon, run.weapon);
    assert.equal(next.relic, run.relic);
    assert.deepEqual(
      next.upgrades,
      run.startingFragment ? { [run.startingFragment]: 1 } : {},
    );
    for (const key of [
      "kills",
      "damageTaken",
      "echoesCast",
      "threadKills",
      "threadCuts",
      "threadReturns",
      "needleStitches",
    ])
      assert.equal(next[key], 0);
    assert.deepEqual((await saved(target)).lastReturn, completed.lastReturn);
    assert.deepEqual(errors, []);
    report.next = next;
    report.errors = errors;
    report.checks.push(
      "the actual next run has the selected equipment and fresh combat counters; the previous return is retained",
    );
    await importedContext.close();
    importedContext = null;
    await page.bringToFront();
    await page
      .getByRole("button", { name: "設定を閉じる", exact: true })
      .click();
    await page.locator('[data-action="lastreturn"]').click();
    await page.locator('[data-action="returnagain"]').click();
    assert.deepEqual(await saved(page), completed);
    report.status = "pass";
    await writeFile(
      destination + "/" + artifact + "-return.json",
      JSON.stringify(report, null, 2) + "\n",
    );
    return {
      artifact: artifact + "-return.json",
      export: exportedArtifact,
      checks: report.checks.length,
      status: report.status,
    };
  } catch (error) {
    report.status = "fail";
    report.failure = { message: error.message, stack: error.stack };
    await writeFile(
      destination + "/" + artifact + "-return.json",
      JSON.stringify(report, null, 2) + "\n",
    );
    throw error;
  } finally {
    if (importedContext) await importedContext.close();
  }
}
