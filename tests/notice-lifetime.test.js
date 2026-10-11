import test from "node:test";
import assert from "node:assert/strict";
import { NoticeLifetime } from "../src/notice-lifetime.js";
const notice = () => ({
  isConnected: true,
  removed: 0,
  remove() {
    this.removed++;
    this.isConnected = false;
  },
});

test("案内は2.6秒の表示時間で消え、同じ消去を繰り返さない", () => {
  const lifetime = new NoticeLifetime(),
    node = notice();
  lifetime.add(node, 100);
  lifetime.update(2699, false);
  assert.equal(node.removed, 0);
  lifetime.update(2700, false);
  assert.equal(node.removed, 1);
  lifetime.update(10000, false);
  assert.equal(node.removed, 1);
});
test("停止中の3.5秒を数えず、戻ってから残りの1.8秒を読む", () => {
  const lifetime = new NoticeLifetime(),
    node = notice();
  lifetime.add(node, 0);
  lifetime.update(800, false);
  lifetime.update(800, true);
  lifetime.update(4300, true);
  assert.equal(node.removed, 0);
  lifetime.update(4300, false);
  lifetime.update(6099, false);
  assert.equal(node.removed, 0);
  lifetime.update(6100, false);
  assert.equal(node.removed, 1);
});
test("外された案内の期限を破棄し、停止中に加えた別の案内を保つ", () => {
  const lifetime = new NoticeLifetime(),
    old = notice(),
    added = notice();
  lifetime.add(old, 0);
  old.isConnected = false;
  lifetime.update(100, true);
  old.isConnected = true;
  lifetime.add(added, 500);
  lifetime.update(6000, true);
  assert.equal(added.removed, 0);
  lifetime.update(6000, false);
  lifetime.update(8599, false);
  assert.equal(added.removed, 0);
  assert.equal(old.removed, 0);
  lifetime.update(8600, false);
  assert.equal(added.removed, 1);
  assert.equal(old.removed, 0);
});
