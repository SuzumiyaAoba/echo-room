import { test, expect } from "@playwright/test";

const step = (page) =>
  page.evaluate(() => window.__ECHO_LOOM__.game().practice.step);
const save = (page) =>
  page.evaluate(() => localStorage.getItem("echo-loom.save.v1"));

async function moveAxis(page, axis, destination) {
  const value = await page.evaluate(
    (axis) => window.__ECHO_LOOM__.game().player[axis],
    axis,
  );
  if (Math.abs(value - destination) < 6) return;
  const key =
    axis === "x"
      ? value < destination
        ? "KeyD"
        : "KeyA"
      : value < destination
        ? "KeyS"
        : "KeyW";
  await page.keyboard.down(key);
  try {
    // Observe each animation frame. Host-side polling can miss the narrow
    // arrival window under load and keep walking after crossing the target.
    await page.waitForFunction(
      ({ axis, destination, direction }) =>
        (window.__ECHO_LOOM__.game().player[axis] - destination) * direction >=
        -4,
      { axis, destination, direction: Math.sign(destination - value) },
      { timeout: 12000 },
    );
  } finally {
    await page.keyboard.up(key);
  }
}

test("練習の五つのお題を実際のキーで達成し、保存を変更せず帰る", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#music-volume").fill("0.15");
  await page.getByRole("button", { name: "設定を閉じる" }).click();
  const before = await save(page);
  await page.getByRole("button", { name: "灯りの練習", exact: true }).click();
  await expect(page.locator("#practice-hint")).toContainText("左の光る輪");
  await moveAxis(page, "x", 90);
  await expect.poll(() => step(page)).toBe(1);
  await page.keyboard.down("KeyJ");
  await expect.poll(() => step(page)).toBe(2);
  await page.keyboard.up("KeyJ");
  await page.keyboard.down("KeyD");
  await page.keyboard.press("Space");
  await expect.poll(() => step(page), { intervals: [25] }).toBe(3);
  await page.keyboard.up("KeyD");
  await moveAxis(page, "y", 160);
  await moveAxis(page, "x", 90);
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.game().practice.phase))
    .toBe("cross");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "灯りをひと休み" }),
  ).toBeVisible();
  const time = await page.evaluate(() => window.__ECHO_LOOM__.game().run.time);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__ECHO_LOOM__.game().run.time)).toBe(
    time,
  );
  await page.getByRole("button", { name: "練習に戻る" }).click();
  await moveAxis(page, "x", 320);
  await page.screenshot({ path: "test-results/practice-recording.png" });
  await page.keyboard.press("KeyQ");
  await expect.poll(() => step(page)).toBe(4);
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.game().run.threadCuts),
  ).toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__ECHO_LOOM__.game().bullets.filter((b) => !b.friendly).length,
      ),
    )
    .toBe(6);
  await expect(page.locator("#practice-title")).toContainText("光をほどく");
  await expect(page.locator("#practice-hint")).toContainText("今の残響なら");
  await page.screenshot({ path: "test-results/practice-release.png" });
  await page.keyboard.press("KeyR");
  await expect(
    page.getByRole("heading", { name: "最初の光が織れました" }),
  ).toBeVisible();
  expect(await save(page)).toBe(before);
  await page.getByRole("button", { name: "もう一度練習する" }).click();
  await expect.poll(() => step(page)).toBe(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "練習を終える" }).click();
  await expect(
    page.getByRole("button", { name: "灯りをともす" }),
  ).toBeVisible();
  expect(await save(page)).toBe(before);
  expect(errors).toEqual([]);
});

test("途中の航路から練習に入っても元の戦闘と入口の保存を保つ", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "灯りをともす" }).click();
  await page.locator("#seed").fill("PRACTICE-RETURN");
  await page.getByRole("button", { name: "この灯りで出発する" }).click();
  await page.getByRole("button", { name: "最初のひと針へ" }).click();
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(220);
  await page.keyboard.up("KeyD");
  await page.keyboard.press("Escape");
  const before = await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    return {
      run: structuredClone(g.run),
      player: { x: g.player.x, y: g.player.y },
      roomTime: g.roomTime,
      enemies: g.enemies.length,
      queue: g.spawnQueue.length,
    };
  });
  const record = await save(page);
  await page.getByRole("button", { name: "操作と残響の使い方" }).click();
  await page.getByRole("button", { name: "灯りの練習をする" }).click();
  await moveAxis(page, "x", 90);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "練習を終える" }).click();
  // Freeze immediately through the existing pause button before comparing the
  // restored scene; the native animation loop may have advanced a few frames.
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  const after = await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    return {
      run: structuredClone(g.run),
      player: { x: g.player.x, y: g.player.y },
      roomTime: g.roomTime,
      enemies: g.enemies.length,
      queue: g.spawnQueue.length,
      practice: !!g.practice,
    };
  });
  expect(after.practice).toBe(false);
  expect(after.run.seed).toBe("PRACTICE-RETURN");
  expect(after.run.echoesCast).toBe(before.run.echoesCast);
  expect(after.run.kills).toBe(before.run.kills);
  expect(after.run.hp).toBe(before.run.hp);
  expect(after.player).toEqual(before.player);
  expect(after.roomTime - before.roomTime).toBeLessThan(0.5);
  expect(await save(page)).toBe(record);
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  await page.getByRole("button", { name: "灯りの練習", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "練習を終える" }).click();
  await page.reload();
  await page.getByRole("button", { name: "航路を続ける" }).click();
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.snapshot().run.seed),
  ).toBe("PRACTICE-RETURN");
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.snapshot().run.echoesCast),
  ).toBe(0);
});

test("横向きのタッチ画面でもお題を読んでスティックで練習できる", async ({
  browser,
  browserName,
}) => {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    ...(browserName === "firefox" ? {} : { isMobile: true }),
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "灯りの練習", exact: true }).click();
  await expect(page.locator(".practice-guide")).toBeInViewport();
  const guide = await page.locator(".practice-guide").boundingBox();
  const stick = await page.locator('[data-stick="move"]').boundingBox();
  expect(guide.y + guide.height).toBeLessThan(stick.y);
  await page.mouse.move(
    stick.x + stick.width / 2 - 24,
    stick.y + stick.height / 2,
  );
  await page.mouse.down();
  await expect.poll(() => step(page), { intervals: [25] }).toBe(1);
  await page.mouse.up();
  await expect(page.locator("#practice-title")).toContainText("影を撃つ");
  await page.screenshot({ path: "test-results/practice-touch.png" });
  await page.getByRole("button", { name: "一時停止", exact: true }).tap();
  await page.getByRole("button", { name: "練習を終える" }).tap();
  await expect(
    page.getByRole("button", { name: "灯りをともす" }),
  ).toBeVisible();
  await context.close();
});
