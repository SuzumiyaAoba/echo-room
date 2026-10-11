import test from "node:test";
import assert from "node:assert/strict";
import { FullscreenControl } from "../src/fullscreen.js";

function fixture(enabled = true) {
  const doc = new EventTarget();
  doc.fullscreenEnabled = enabled;
  doc.fullscreenElement = null;
  doc.documentElement = {};
  const events = [],
    errors = [];
  const change = (element) => {
    doc.fullscreenElement = element;
    doc.dispatchEvent(new Event("fullscreenchange"));
  };
  doc.documentElement.requestFullscreen = async () =>
    change(doc.documentElement);
  doc.exitFullscreen = async () => change(null);
  const control = new FullscreenControl(doc, {
    onUpdate: () => events.push([control.active, control.pending]),
    onChange: (active) => events.push(active),
    onError: (message) => errors.push(message),
  });
  return { doc, control, change, events, errors };
}

test("全画面の開始・終了は要求した希望でなくブラウザの状態を読む", async () => {
  const { doc, control, events } = fixture();
  let finish;
  doc.documentElement.requestFullscreen = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const request = control.toggle();
  assert.equal(control.active, false);
  assert.equal(control.pending, true);
  assert.equal(control.label, "画面を切り替え中…");
  finish();
  assert.equal(await request, true);
  assert.equal(control.active, false);
  assert.equal(control.label, "全画面にする");
  assert.deepEqual(events, [
    [false, true],
    [false, false],
  ]);
});

test("クリック直後にAPIを呼び、完了前の二重要求を防ぐ", async () => {
  const { doc, control, change } = fixture();
  let calls = 0,
    finish;
  doc.documentElement.requestFullscreen = (options) => {
    calls++;
    assert.deepEqual(options, { navigationUI: "hide" });
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const request = control.toggle();
  assert.equal(calls, 1);
  assert.equal(await control.toggle(), false);
  change(doc.documentElement);
  assert.equal(control.disabled, true);
  finish();
  assert.equal(await request, true);
  assert.equal(control.active, true);
  assert.equal(control.disabled, false);
  assert.equal(control.label, "全画面を閉じる");
  assert.equal(await control.toggle(), true);
  assert.equal(control.active, false);
});

test("ブラウザが自発的に終了した時は一度だけ変更を通知する", () => {
  const { doc, control, change, events } = fixture();
  change(doc.documentElement);
  change(doc.documentElement);
  change(null);
  assert.equal(control.active, false);
  assert.deepEqual(
    events.filter((value) => typeof value === "boolean"),
    [true, false],
  );
});

test("非対応・権限なし・メソッドなしではAPIを要求しない", async () => {
  for (const condition of ["denied", "request", "exit"]) {
    const { doc, control } = fixture(condition !== "denied");
    if (condition === "request") delete doc.documentElement.requestFullscreen;
    if (condition === "exit") delete doc.exitFullscreen;
    assert.equal(control.supported, false);
    assert.equal(control.disabled, true);
    assert.equal(await control.toggle(), false);
    assert.equal(control.pending, false);
  }
});

test("開始の拒否と同期例外は画面状態を変えず再操作できる", async () => {
  for (const synchronous of [false, true]) {
    const { doc, control, errors } = fixture();
    doc.documentElement.requestFullscreen = () => {
      if (synchronous) throw new TypeError("denied");
      return Promise.reject(new TypeError("denied"));
    };
    assert.equal(await control.toggle(), false);
    assert.equal(control.active, false);
    assert.equal(control.disabled, false);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /このまま遊べます/);
  }
});

test("終了の拒否は全画面の状態を保ち、再操作できる", async () => {
  const { doc, control, change, errors } = fixture();
  change(doc.documentElement);
  doc.exitFullscreen = () => Promise.reject(new TypeError("denied"));
  assert.equal(await control.toggle(), false);
  assert.equal(control.active, true);
  assert.equal(control.pending, false);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /ESC/);
});

test("ESCとAPI終了が重なり既に閉じた時は誤った失敗を通知しない", async () => {
  const { doc, control, change, errors } = fixture();
  change(doc.documentElement);
  doc.exitFullscreen = () => {
    change(null);
    return Promise.reject(new TypeError("already exited"));
  };
  assert.equal(await control.toggle(), true);
  assert.equal(control.active, false);
  assert.deepEqual(errors, []);
});
