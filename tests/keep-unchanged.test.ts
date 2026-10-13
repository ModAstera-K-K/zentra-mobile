import { test } from "node:test";
import assert from "node:assert/strict";
import { keepUnchanged } from "@/utils/keep-unchanged";

const series = (key: string, values: number[]) => ({
  key,
  points: values.map((value, index) => ({ label: `d${index}`, value })),
});
const keyOf = (entry: { key: string }) => entry.key;

test("a rebuilt list keeps the objects whose content did not change", () => {
  const steps = series("steps", [1, 2, 3]);
  const sleep = series("sleep", [7, 8]);
  const previous = [steps, sleep];

  // Rebuilt with nothing different: the list itself is kept.
  assert.equal(
    keepUnchanged(previous, [series("steps", [1, 2, 3]), series("sleep", [7, 8])], keyOf),
    previous,
  );

  // One series gained a point: only that one is new.
  const next = [series("steps", [1, 2, 3]), series("sleep", [7, 8, 6])];
  const kept = keepUnchanged(previous, next, keyOf);
  assert.notEqual(kept, previous);
  assert.equal(kept[0], steps);
  assert.equal(kept[0].points, steps.points);
  assert.equal(kept[1], next[1]);

  // Added, removed and reordered entries make a new list of kept objects.
  const reordered = keepUnchanged(previous, [series("sleep", [7, 8]), series("steps", [1, 2, 3])], keyOf);
  assert.notEqual(reordered, previous);
  assert.deepEqual(reordered, [sleep, steps]);
  assert.equal(reordered[0], sleep);
  assert.deepEqual(keepUnchanged(previous, [series("steps", [1, 2, 3])], keyOf), [steps]);
  const added = keepUnchanged(previous, [...previous.map((entry) => ({ ...entry })), series("usage", [4])], keyOf);
  assert.equal(added.length, 3);
  assert.equal(added[1], sleep);

  const first = [series("steps", [1])];
  assert.equal(keepUnchanged(null, first, keyOf), first);
});
