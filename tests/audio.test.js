import test from "node:test";
import assert from "node:assert/strict";
import { AudioEngine } from "../src/audio.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function engine(context) {
  const audio = new AudioEngine({ music: 0.5, effects: 0.5 });
  audio.ctx = context;
  return audio;
}
function delayedSuspension() {
  const pending = [];
  const context = {
    state: "running",
    resumes: 0,
    suspend() {
      const gate = deferred();
      pending.push(gate);
      return gate.promise.then(() => {
        context.state = "suspended";
      });
    },
    async resume() {
      context.resumes++;
      context.state = "running";
    },
  };
  return { context, pending, audio: engine(context) };
}

test("a visible return waits for the native suspension that still reports running", async () => {
  const { audio, context, pending } = delayedSuspension();
  const stopping = audio.suspend(),
    starting = audio.start();
  assert.equal(context.state, "running");
  assert.equal(context.resumes, 0);
  pending[0].resolve();
  await Promise.all([stopping, starting]);
  assert.equal(context.state, "running");
  assert.equal(context.resumes, 1);
  assert.equal(audio.pendingSuspend, null);
});

test("a later hidden request cancels the waiting visible return", async () => {
  const { audio, context, pending } = delayedSuspension();
  const first = audio.suspend(),
    visible = audio.start(),
    hidden = audio.suspend();
  pending[0].resolve();
  await first;
  assert.equal(context.resumes, 0);
  pending[1].resolve();
  await Promise.all([visible, hidden]);
  assert.equal(context.state, "suspended");
  assert.equal(context.resumes, 0);
  assert.equal(audio.pendingSuspend, null);
});

test("a second visible return waits for every outstanding suspension", async () => {
  const { audio, context, pending } = delayedSuspension();
  const first = audio.suspend(),
    visible = audio.start(),
    second = audio.suspend(),
    returned = audio.start();
  pending[0].resolve();
  await first;
  assert.equal(context.resumes, 0);
  pending[1].resolve();
  await Promise.all([visible, second, returned]);
  assert.equal(context.state, "running");
  assert.equal(audio.pendingSuspend, null);
});

test("a hidden request during an unfinished resume remains suspended afterwards", async () => {
  const gate = deferred();
  const context = {
    state: "suspended",
    stops: 0,
    resume() {
      return gate.promise.then(() => {
        context.state = "running";
      });
    },
    async suspend() {
      context.stops++;
      context.state = "suspended";
    },
  };
  const audio = engine(context),
    starting = audio.start();
  await audio.suspend();
  gate.resolve();
  await starting;
  assert.equal(context.state, "suspended");
  assert.equal(context.stops, 2);
});

test("interrupted audio can retry on the next gesture after a denied resume", async () => {
  let attempts = 0;
  const context = {
    state: "interrupted",
    async resume() {
      if (++attempts === 1) throw Error("temporarily interrupted");
      context.state = "running";
    },
  };
  const audio = engine(context);
  await audio.start();
  assert.equal(context.state, "interrupted");
  await audio.start();
  assert.equal(context.state, "running");
  assert.equal(attempts, 2);
});

test("a rejected suspension does not poison a requested return", async () => {
  const gate = deferred();
  const context = {
    state: "interrupted",
    suspend: () => gate.promise,
    async resume() {
      context.state = "running";
    },
  };
  const audio = engine(context),
    stopping = audio.suspend(),
    starting = audio.start();
  gate.reject(Error("suspension denied"));
  await Promise.all([stopping, starting]);
  assert.equal(context.state, "running");
  assert.equal(audio.pendingSuspend, null);
});

test("closed and absent audio contexts keep lifecycle requests harmless", async () => {
  const context = { state: "closed" },
    audio = engine(context);
  await audio.suspend();
  await audio.start();
  assert.equal(audio.ctx, context);
  assert.equal(audio.pendingSuspend, null);
  const absent = new AudioEngine({ music: 0, effects: 0 });
  await absent.suspend();
  await absent.start();
  assert.equal(absent.ctx, null);
});
