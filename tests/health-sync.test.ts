import { canAttemptHealthRead } from "@/utils/health-access";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runHealthPageLoop } from "@/utils/health-page-loop";
import {
  cancelHealthSync,
  healthSyncGeneration,
  assertHealthSyncGeneration,
} from "@/utils/health-sync-session";
import { groupExportEvents } from "@/utils/export-data";
import { event } from "./fixtures";

test("pages advance only after commit, stop after four, and resume from last durable cursor", async () => {
  let saved: string | null = null;
  const reads: (string | null)[] = [];
  await runHealthPageLoop(saved, {
    assertActive: () => {},
    read: async (cursor) => {
      reads.push(cursor);
      return {
        records: [],
        deletedIds: [],
        cursor: String(Number(cursor ?? 0) + 1),
        hasMore: true,
      };
    },
    commit: async (page) => {
      saved = page.cursor;
    },
  });
  assert.deepEqual(reads, [null, "1", "2", "3"]);
  assert.equal(saved, "4");
  await assert.rejects(
    runHealthPageLoop(saved, {
      assertActive: () => {},
      read: async (cursor) => ({
        records: [],
        deletedIds: ["deleted-source-id"],
        cursor: String(Number(cursor) + 1),
        hasMore: false,
      }),
      commit: async () => {
        throw new Error("disk full");
      },
    }),
    /disk full/,
  );
  assert.equal(saved, "4");
});
test("expired cursors are durably reset before resnapshot and do not imply deletions", async () => {
  const seen: (string | null)[] = [];
  let count = 0;
  await runHealthPageLoop("expired", {
    assertActive: () => {},
    read: async (cursor) => {
      seen.push(cursor);
      return count++ === 0
        ? {
            records: [],
            deletedIds: [],
            cursor: null,
            hasMore: true,
            reset: true,
          }
        : { records: [], deletedIds: [], cursor: "new", hasMore: false };
    },
    commit: async (page) => assert.deepEqual(page.deletedIds, []),
  });
  assert.deepEqual(seen, ["expired", null]);
});
test("wipe or disable prevents a delayed native response from being committed", async () => {
  const generation = healthSyncGeneration();
  let commits = 0;
  await assert.rejects(
    runHealthPageLoop(null, {
      assertActive: () => assertHealthSyncGeneration(generation),
      read: async () => {
        cancelHealthSync();
        return { records: [], deletedIds: [], cursor: "late", hasMore: false };
      },
      commit: async () => {
        commits++;
      },
    }),
    /cancelled/,
  );
  assert.equal(commits, 0);
});
test("raw export retains original sources and excludes derived statistics and coverage markers", () => {
  const rows = [
    event("phone", 10),
    event("raw", 100, "health_connect"),
    event("total", 100, "health_connect", { platform_aggregate: true }),
    {
      ...event("coverage", 0, "usage_stats", { coverage_window: true }),
      dataType: "app_usage" as const,
    },
  ];
  assert.deepEqual(
    groupExportEvents(rows).steps?.map((e) => e.id),
    ["phone", "raw"],
  );
  assert.equal(groupExportEvents(rows).app_usage, undefined);
});

test("partial Android permissions allow only granted types; iOS attempts reads without write-status inference", () => {
  const permissions = ["android.permission.health.READ_STEPS"];
  assert.equal(canAttemptHealthRead("android", "steps", permissions), true);
  assert.equal(canAttemptHealthRead("android", "sleep", permissions), false);
  assert.equal(canAttemptHealthRead("android", "steps", []), false);
  assert.equal(canAttemptHealthRead("ios", "sleep", []), true);
});
