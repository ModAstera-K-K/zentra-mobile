import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyActivityHistory,
  type ActivityHistory,
} from "@/utils/activity-cache-loader";
import { startActivityCacheSession } from "@/utils/activity-cache-session";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/** A session whose passes and settle waits are released by hand. */
function createHarness(handled?: string) {
  const passes: {
    signal: AbortSignal;
    progress: (history: ActivityHistory) => void;
    finish: (history?: ActivityHistory) => void;
    fail: (error: Error) => void;
  }[] = [];
  const waits: { ms: number; release: () => void }[] = [];
  const events: string[] = [];
  const session = startActivityCacheSession({
    handled,
    load: (signal, onProgress) =>
      new Promise((resolve, reject) => {
        passes.push({
          signal,
          progress: onProgress,
          finish: (history = emptyActivityHistory()) => resolve(history),
          fail: reject,
        });
      }),
    onHistory: (history, revision, final) =>
      events.push(
        `${final ? "final" : "progress"}@${revision}:${history.complete}`,
      ),
    onLoading: (loading) => events.push(loading ? "loading" : "idle"),
    onError: (error) => events.push(`error:${(error as Error).message}`),
    settleMs: 1500,
    maxSettleMs: 9000,
    wait: (ms, signal) =>
      new Promise((resolve) => {
        waits.push({ ms, release: resolve });
        signal.addEventListener("abort", () => resolve());
      }),
  });
  return { session, passes, waits, events };
}

test("writes during a pass never restart it; they queue one follow-up after settling", async () => {
  const { session, passes, waits, events } = createHarness();
  session.noteRevision("1");
  await tick();
  assert.equal(passes.length, 1);
  assert.equal(waits.length, 0, "the first pass does not wait");

  // A reconcile lands several bursts of writes while the pass is running.
  for (const revision of ["2", "3", "4"]) session.noteRevision(revision);
  await tick();
  assert.equal(passes.length, 1);
  assert.equal(passes[0].signal.aborted, false);

  passes[0].progress({ ...emptyActivityHistory(), complete: false });
  passes[0].finish();
  await tick();
  assert.deepEqual(events, [
    "loading",
    "progress@1:false",
    "final@1:true",
    "idle",
  ]);

  // One follow-up for all three, and only after the settle wait.
  assert.equal(passes.length, 1);
  assert.deepEqual(
    waits.map((wait) => wait.ms),
    [1500],
  );
  waits[0].release();
  await tick();
  assert.equal(passes.length, 2);
  passes[1].finish();
  await tick();
  assert.equal(events.at(-2), "final@4:true");

  // Nothing new: no further pass.
  session.noteRevision("4");
  await tick();
  assert.equal(passes.length, 2);
  assert.equal(waits.length, 1);
});

test("a follow-up waits for the writes to pause, up to a limit", async () => {
  const { session, passes, waits } = createHarness();
  session.noteRevision("1");
  await tick();
  passes[0].finish();
  await tick();

  // Each settle wait ends with another write having landed: keep waiting.
  session.noteRevision("2");
  await tick();
  for (const revision of ["3", "4"]) {
    session.noteRevision(revision);
    waits.at(-1)!.release();
    await tick();
    assert.equal(passes.length, 1);
  }
  assert.equal(waits.length, 3);
  // A wait that no write interrupts ends it, and one pass covers them all.
  waits.at(-1)!.release();
  await tick();
  assert.equal(passes.length, 2);
  passes[1].finish();
  await tick();

  // Writes that never pause still get a pass after the limit (6 x 1500 ms).
  let revision = 5;
  session.noteRevision(String(revision));
  await tick();
  while (passes.length === 2) {
    session.noteRevision(String(++revision));
    waits.at(-1)!.release();
    await tick();
  }
  assert.equal(waits.length, 3 + 6);
  assert.equal(passes[2].signal.aborted, false);
});

test("stopping aborts the pass in flight and reports nothing more", async () => {
  const { session, passes, events } = createHarness();
  session.noteRevision("1");
  await tick();
  session.stop();
  assert.equal(passes[0].signal.aborted, true);
  passes[0].progress(emptyActivityHistory());
  passes[0].finish();
  await tick();
  session.noteRevision("2");
  await tick();
  assert.deepEqual(events, ["loading"]);
  assert.equal(passes.length, 1);
});

test("a failed pass is reported once and retried only when the data moves", async () => {
  const { session, passes, waits, events } = createHarness();
  session.noteRevision("1");
  await tick();
  passes[0].fail(new Error("disk"));
  await tick();
  assert.deepEqual(events, ["loading", "error:disk", "idle"]);
  await tick();
  assert.equal(passes.length, 1, "no retry loop");

  session.noteRevision("2");
  await tick();
  waits[0].release();
  await tick();
  assert.equal(passes.length, 2);
  passes[1].finish();
  await tick();
  assert.equal(events.at(-2), "final@2:true");
});

test("a session started from a handled revision loads nothing until the revision moves", async () => {
  const { session, passes, waits, events } = createHarness("7");
  // Coming back to a screen whose data did not change.
  session.noteRevision("7");
  await tick();
  assert.equal(passes.length, 0);
  assert.deepEqual(events, []);

  // Data changed while the screen was away: its first pass does not wait.
  session.noteRevision("8");
  await tick();
  assert.equal(passes.length, 1);
  assert.equal(waits.length, 0);
  passes[0].finish();
  await tick();
  assert.deepEqual(events, ["loading", "final@8:true", "idle"]);

  // Later changes settle first, as in any session.
  session.noteRevision("9");
  await tick();
  assert.equal(passes.length, 1);
  assert.equal(waits.length, 1);
  session.stop();
});
