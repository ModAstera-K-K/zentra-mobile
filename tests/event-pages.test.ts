import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readEventPages, type PagedEventRow } from "@/utils/event-pages";

type Row = PagedEventRow & { timestamp_end: string; value: number };

function createEvents(count: number) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE events (id TEXT PRIMARY KEY NOT NULL, timestamp_start TEXT NOT NULL, timestamp_end TEXT NOT NULL, value INTEGER);
    CREATE INDEX idx_events_timestamp_start ON events(timestamp_start);`);
  const insert = db.prepare("INSERT INTO events VALUES(?,?,?,?)");
  for (let i = 0; i < count; i++) {
    // Runs of identical start times make page boundaries fall inside ties.
    const start = new Date(
      Date.UTC(2026, 8, 30, 0, Math.floor(i / 4)),
    ).toISOString();
    insert.run(
      `e-${(i * 7919) % count}`,
      start,
      i % 3 ? start : "2026-09-30T23:59:59.000Z",
      i,
    );
  }
  const query = async (sql: string, params: (string | number | null)[]) =>
    db.prepare(sql).all(...params) as unknown as Row[];
  return { db, query };
}

const decode = (row: Row) => ({
  id: row.id,
  timestampStart: row.timestamp_start,
  value: row.value,
});

test("keyset pages return exactly the rows of one range query, in order", async () => {
  const { db, query } = createEvents(203);
  try {
    const range = {
      start: "2026-09-30T00:03:00.000Z",
      endExclusive: "2026-09-30T00:47:00.000Z",
    };
    const expected = (
      db
        .prepare(
          "SELECT * FROM events WHERE timestamp_start >= ? AND timestamp_start < ? ORDER BY timestamp_start, rowid",
        )
        .all(range.start, range.endExclusive) as unknown as Row[]
    ).map(decode);
    for (const pageSize of [1, 3, 4, 7, 500]) {
      assert.deepEqual(
        await readEventPages(query, range, decode, { pageSize }),
        expected,
        `page size ${pageSize}`,
      );
    }

    const filtered = await readEventPages(
      query,
      {
        ...range,
        where: "timestamp_end >= ?",
        params: ["2026-09-30T23:00:00.000Z"],
      },
      decode,
      { pageSize: 3 },
    );
    assert.deepEqual(
      filtered,
      (
        db
          .prepare(
            "SELECT * FROM events WHERE timestamp_start >= ? AND timestamp_start < ? AND timestamp_end >= ? ORDER BY timestamp_start, rowid",
          )
          .all(
            range.start,
            range.endExclusive,
            "2026-09-30T23:00:00.000Z",
          ) as unknown as Row[]
      ).map(decode),
    );
    assert.ok(filtered.length > 0 && filtered.length < expected.length);
  } finally {
    db.close();
  }
});

test("each page is an index range seek with no sort", async () => {
  const { db } = createEvents(10);
  try {
    let plan = "";
    await readEventPages(
      async (sql, params) => {
        plan += JSON.stringify(
          db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params),
        );
        return db.prepare(sql).all(...params) as unknown as Row[];
      },
      {
        start: "2026-09-30T00:00:00.000Z",
        endExclusive: "2026-10-01T00:00:00.000Z",
      },
      decode,
      { pageSize: 3 },
    );
    assert.match(
      plan,
      /idx_events_timestamp_start \(timestamp_start>\? AND timestamp_start<\?\)/,
    );
    assert.doesNotMatch(plan, /TEMP B-TREE/);
  } finally {
    db.close();
  }
});

test("a record rewritten between pages keeps only its latest copy", async () => {
  const { db, query } = createEvents(12);
  try {
    let pages = 0;
    const events = await readEventPages(
      async (sql, params) => {
        if (pages++ === 1)
          // Between pages, the first record moves later and changes value.
          db.prepare(
            "UPDATE events SET timestamp_start='2026-09-30T00:02:30.000Z', value=999 WHERE rowid=1",
          ).run();
        return query(sql, params);
      },
      {
        start: "2026-09-30T00:00:00.000Z",
        endExclusive: "2026-10-01T00:00:00.000Z",
      },
      decode,
      { pageSize: 4 },
    );
    const ids = events.map((event) => event.id);
    assert.equal(ids.length, 12);
    assert.equal(new Set(ids).size, ids.length);
    const moved = events.find((event) => event.value === 999);
    assert.ok(moved);
    assert.deepEqual(
      events.map((event) => event.timestampStart),
      [...events.map((event) => event.timestampStart)].sort(),
    );
  } finally {
    db.close();
  }
});

// A read wired as the repository wires it: the revision moves on every write.
function consistentRead(
  db: ReturnType<typeof createEvents>["db"],
  betweenPages: (page: number) => void,
) {
  const calls = { pages: 0, unpaged: 0 };
  const events = readEventPages(
    async (sql, params) => {
      if (/LIMIT 4\s*$/.test(sql)) betweenPages(calls.pages++);
      else calls.unpaged++;
      return db.prepare(sql).all(...params) as unknown as Row[];
    },
    {
      start: "2026-09-30T00:00:00.000Z",
      endExclusive: "2026-10-01T00:00:00.000Z",
    },
    decode,
    {
      pageSize: 4,
      revision: async () =>
        String(db.prepare("SELECT total_changes() AS n").get()!.n),
    },
  );
  return { calls, events };
}

const storedRange = (db: ReturnType<typeof createEvents>["db"]) =>
  (
    db
      .prepare("SELECT * FROM events ORDER BY timestamp_start, rowid")
      .all() as unknown as Row[]
  ).map(decode);

test("a record that moves behind the cursor mid-read is not lost", async () => {
  const { db } = createEvents(12);
  try {
    const { calls, events } = consistentRead(db, (page) => {
      if (page === 2)
        // Still unread, and now earlier than everything already returned.
        db.prepare(
          "UPDATE events SET timestamp_start='2026-09-30T00:00:00.000Z', value=999 WHERE rowid=12",
        ).run();
    });
    assert.deepEqual(await events, storedRange(db));
    assert.equal((await events).length, 12);
    assert.equal(calls.unpaged, 1);
  } finally {
    db.close();
  }
});

test("a record deleted or moved back after it was read leaves no stale copy", async () => {
  const { db } = createEvents(12);
  try {
    const { events } = consistentRead(db, (page) => {
      if (page !== 2) return;
      db.prepare("DELETE FROM events WHERE rowid=1").run();
      db.prepare(
        "UPDATE events SET timestamp_start='2026-09-30T00:00:00.000Z', value=999 WHERE rowid=6",
      ).run();
    });
    assert.deepEqual(await events, storedRange(db));
    assert.equal((await events).length, 11);
  } finally {
    db.close();
  }
});

test("an undisturbed read is not repeated, and one page needs no second check", async () => {
  const { db } = createEvents(12);
  try {
    const paged = consistentRead(db, () => {});
    assert.deepEqual(await paged.events, storedRange(db));
    assert.deepEqual(paged.calls, { pages: 4, unpaged: 0 });

    let queries = 0;
    let revisionReads = 0;
    const single = await readEventPages(
      async (sql, params) => {
        queries++;
        // A write right after the only statement cannot have split the read.
        const rows = db.prepare(sql).all(...params) as unknown as Row[];
        db.prepare("UPDATE events SET value=1 WHERE rowid=1").run();
        return rows;
      },
      {
        start: "2026-09-30T00:00:00.000Z",
        endExclusive: "2026-10-01T00:00:00.000Z",
      },
      decode,
      { revision: async () => String(revisionReads++) },
    );
    assert.equal(single.length, 12);
    assert.deepEqual({ queries, revisionReads }, { queries: 1, revisionReads: 1 });
  } finally {
    db.close();
  }
});
