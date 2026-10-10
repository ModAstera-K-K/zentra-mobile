import pako from "pako";

import { createCooperativeYield } from "@/utils/cooperative-work";
import { encodeUtf8 } from "@/utils/utf8";

/** One file of the archive, as the pieces its content was built in. */
export interface ZipEntry {
  name: string;
  parts: Uint8Array[];
}

export interface ZipWriteOptions {
  /** Deflate level, 1 (fastest) to 9. */
  level?: number;
  signal?: AbortSignal;
  /** Uncompressed bytes taken in so far, of the total. */
  onProgress?: (done: number, total: number) => void;
  /** The modification time written for every entry. */
  now?: Date;
}

const SLICE_BYTES = 64 * 1024;
const OUTPUT_CHUNK_BYTES = 256 * 1024;
const UTF8_NAMES = 0x0800;
const DEFLATE = 8;
const VERSION = 20;
const MAX_FIELD = 0xffffffff;

let crcTable: Uint32Array | null = null;
function crc32(crc: number, bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index++) {
      let value = index;
      for (let bit = 0; bit < 8; bit++)
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      crcTable[index] = value >>> 0;
    }
  }
  for (let index = 0; index < bytes.length; index++)
    crc = crcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  return crc;
}

function header(
  signature: number,
  fields: [bytes: 2 | 4, value: number][],
  name: Uint8Array,
): Uint8Array {
  const size = 4 + fields.reduce((total, [bytes]) => total + bytes, 0);
  const out = new Uint8Array(size + name.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, signature, true);
  let offset = 4;
  for (const [bytes, value] of fields) {
    if (bytes === 2) view.setUint16(offset, value, true);
    else view.setUint32(offset, value, true);
    offset += bytes;
  }
  out.set(name, size);
  return out;
}

/**
 * Write a zip archive to `write`, a piece at a time. Each entry is deflated in
 * slices with a pause whenever a slice of work has used its time, so a large
 * archive never holds the thread, and nothing larger than one entry's
 * compressed bytes is kept. Sizes go in each entry's own header (no data
 * descriptors), which every zip reader accepts. Returns the archive's size.
 */
export async function writeZip(
  entries: ZipEntry[],
  write: (bytes: Uint8Array) => void | Promise<void>,
  options: ZipWriteOptions = {},
): Promise<number> {
  const { signal, onProgress } = options;
  const now = options.now ?? new Date();
  const time =
    (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date =
    (Math.max(0, now.getFullYear() - 1980) << 9) |
    ((now.getMonth() + 1) << 5) |
    now.getDate();
  const total = entries.reduce(
    (sum, entry) =>
      sum + entry.parts.reduce((bytes, part) => bytes + part.length, 0),
    0,
  );
  let done = 0;
  let offset = 0;
  const pause = createCooperativeYield();
  const directory: Uint8Array[] = [];

  for (const entry of entries) {
    const name = encodeUtf8(entry.name);
    const deflater = new pako.Deflate({
      chunkSize: OUTPUT_CHUNK_BYTES,
      level: options.level ?? 6,
      raw: true,
    });
    const compressed: Uint8Array[] = [];
    let compressedSize = 0;
    deflater.onData = (chunk) => {
      compressed.push(chunk);
      compressedSize += chunk.length;
    };
    let crc = 0xffffffff;
    let size = 0;
    for (const part of entry.parts)
      for (let start = 0; start < part.length; start += SLICE_BYTES) {
        if (signal?.aborted) throw new Error("Work cancelled");
        const slice = part.subarray(start, start + SLICE_BYTES);
        crc = crc32(crc, slice);
        deflater.push(slice, false);
        if (deflater.err) throw new Error(deflater.msg || "Compression failed");
        size += slice.length;
        done += slice.length;
        onProgress?.(done, total);
        await pause();
      }
    deflater.push(new Uint8Array(0), true);
    if (deflater.err) throw new Error(deflater.msg || "Compression failed");
    if (signal?.aborted) throw new Error("Work cancelled");
    if (size > MAX_FIELD || compressedSize > MAX_FIELD || offset > MAX_FIELD)
      throw new Error("The archive is too large for this format.");
    crc = (crc ^ 0xffffffff) >>> 0;

    const shared: [2 | 4, number][] = [
      [2, VERSION],
      [2, UTF8_NAMES],
      [2, DEFLATE],
      [2, time],
      [2, date],
      [4, crc],
      [4, compressedSize],
      [4, size],
      [2, name.length],
      [2, 0], // extra field
    ];
    const local = header(0x04034b50, shared, name);
    await write(local);
    for (const chunk of compressed) await write(chunk);
    directory.push(
      header(
        0x02014b50,
        [
          [2, VERSION], // made by
          ...shared,
          [2, 0], // comment
          [2, 0], // disk
          [2, 0], // internal attributes
          [4, 0], // external attributes
          [4, offset],
        ],
        name,
      ),
    );
    offset += local.length + compressedSize;
  }

  if (entries.length > 0xffff)
    throw new Error("The archive has too many files for this format.");
  const directorySize = directory.reduce((sum, part) => sum + part.length, 0);
  for (const part of directory) await write(part);
  await write(
    header(
      0x06054b50,
      [
        [2, 0],
        [2, 0],
        [2, entries.length],
        [2, entries.length],
        [4, directorySize],
        [4, offset],
        [2, 0],
      ],
      new Uint8Array(0),
    ),
  );
  onProgress?.(total, total);
  return offset + directorySize + 22;
}
