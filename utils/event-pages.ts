import { runCooperatively } from "@/utils/cooperative-work";

type BindValue = string | number | null;

export interface PagedEventRow {
  id: string;
  page_rowid: number;
  timestamp_start: string;
}

type PageQuery<Row> = (sql: string, params: BindValue[]) => Promise<Row[]>;

interface EventPageRange {
  start: string;
  endExclusive: string;
  /** Extra filter on the page, e.g. "timestamp_end >= ?". */
  where?: string;
  params?: BindValue[];
}

interface EventPageOptions {
  pageSize?: number;
  signal?: AbortSignal;
  /** Changes whenever a stored row in the range is written or removed. */
  revision?: () => Promise<string>;
}

export const EVENT_PAGE_SIZE = 500;
// SQLite reads a LIMIT this large as no limit: the whole range in one page.
const UNPAGED = Number.MAX_SAFE_INTEGER;

/**
 * Read events in [start, endExclusive) as (timestamp_start, rowid) keyset pages.
 * No single bridge call materializes a whole range, each page is decoded in
 * cooperative slices, and the order matches idx_events_timestamp_start so
 * pages need no sort.
 *
 * Pages are separate reads, so a write can land between them: a record that
 * moves behind the cursor is missed, and one already read keeps its old copy
 * when it moves back or is deleted. With `revision`, a read of more than one
 * page whose range changed underneath it is discarded and repeated as a single
 * statement, which no write can split. Without it, the only repair is that a
 * record seen again on a later page keeps its latest copy.
 */
export async function readEventPages<
  Row extends PagedEventRow,
  T extends { id: string; timestampStart: string },
>(
  query: PageQuery<Row>,
  range: EventPageRange,
  decode: (row: Row) => T,
  options: EventPageOptions = {},
): Promise<T[]> {
  const { revision } = options;
  const before = revision ? await revision() : null;
  const read = await readPages(query, range, decode, options);
  // One page is one statement, so only a longer read can straddle a write.
  if (!revision || read.pages === 1 || before === (await revision()))
    return read.events;
  const whole = { ...options, pageSize: UNPAGED };
  return (await readPages(query, range, decode, whole)).events;
}

async function readPages<
  Row extends PagedEventRow,
  T extends { id: string; timestampStart: string },
>(
  query: PageQuery<Row>,
  range: EventPageRange,
  decode: (row: Row) => T,
  options: EventPageOptions,
): Promise<{ events: T[]; pages: number }> {
  const pageSize = options.pageSize ?? EVENT_PAGE_SIZE;
  const events: T[] = [];
  const indexById = new Map<string, number>();
  let rewritten = false;
  let cursor: Row | null = null;
  let pages = 0;

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
    pages++;
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
  return { events, pages };
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
