import { runCooperatively } from "@/utils/cooperative-work";

type BindValue = string | number | null;

export interface PagedEventRow {
  id: string;
  page_rowid: number;
  timestamp_start: string;
}

export const EVENT_PAGE_SIZE = 500;

/**
 * Read events in [start, endExclusive) as (timestamp_start, rowid) keyset pages.
 * No single bridge call materializes a whole range, each page is decoded in
 * cooperative slices, and the order matches idx_events_timestamp_start so
 * pages need no sort. Pages are separate reads: a record rewritten between
 * them keeps only its latest copy.
 */
export async function readEventPages<
  Row extends PagedEventRow,
  T extends { id: string; timestampStart: string },
>(
  query: (sql: string, params: BindValue[]) => Promise<Row[]>,
  range: {
    start: string;
    endExclusive: string;
    /** Extra filter on the page, e.g. "timestamp_end >= ?". */
    where?: string;
    params?: BindValue[];
  },
  decode: (row: Row) => T,
  options: { pageSize?: number; signal?: AbortSignal } = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? EVENT_PAGE_SIZE;
  const events: T[] = [];
  const indexById = new Map<string, number>();
  let rewritten = false;
  let cursor: Row | null = null;

  for (;;) {
    // The cursor replaces the lower bound so every page is an index range seek.
    const page: Row[] = await query(
      `SELECT rowid AS page_rowid, * FROM events
        WHERE timestamp_start >= ? AND timestamp_start < ?
        ${cursor ? "AND NOT (timestamp_start = ? AND rowid <= ?)" : ""}
        ${range.where ? `AND ${range.where}` : ""}
        ORDER BY timestamp_start ASC, rowid ASC
        LIMIT ${pageSize}`,
      [
        cursor ? cursor.timestamp_start : range.start,
        range.endExclusive,
        ...(cursor ? [cursor.timestamp_start, cursor.page_rowid] : []),
        ...(range.params ?? []),
      ],
    );
    rewritten =
      (await runCooperatively(
        decodePageWork(page, decode, events, indexById),
        options.signal,
      )) || rewritten;
    if (page.length < pageSize) break;
    cursor = page[page.length - 1];
  }

  if (rewritten)
    events.sort((left, right) =>
      left.timestampStart.localeCompare(right.timestampStart),
    );
  return events;
}

function* decodePageWork<Row extends PagedEventRow, T>(
  page: Row[],
  decode: (row: Row) => T,
  events: T[],
  indexById: Map<string, number>,
): Generator<void, boolean> {
  let rewritten = false;
  for (let i = 0; i < page.length; i++) {
    if (i && i % 50 === 0) yield;
    const event = decode(page[i]);
    const existing = indexById.get(page[i].id);
    if (existing === undefined) {
      indexById.set(page[i].id, events.length);
      events.push(event);
    } else {
      events[existing] = event;
      rewritten = true;
    }
  }
  return rewritten;
}
