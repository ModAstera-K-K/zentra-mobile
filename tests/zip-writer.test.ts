import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { encodeUtf8 } from "@/utils/utf8";
import { writeZip, type ZipEntry } from "@/utils/zip-writer";

async function collect(entries: ZipEntry[], options = {}) {
  const chunks: Uint8Array[] = [];
  const size = await writeZip(entries, (bytes) => void chunks.push(bytes.slice()), {
    level: 1,
    now: new Date(2026, 8, 30, 14, 5, 58),
    ...options,
  });
  const archive = Buffer.concat(chunks);
  assert.equal(archive.length, size);
  return archive;
}

test("an archive written in pieces reads back as the files that went in", async () => {
  // Enough repeated JSON to span many deflate slices, in uneven pieces.
  const record = (index: number) =>
    JSON.stringify({ id: `evt-${index}`, note: "température ☀️", value: index % 97 });
  const parts: Uint8Array[] = [];
  let expected = "[";
  for (let piece = 0; piece < 40; piece++) {
    const text =
      (piece ? "," : "") +
      Array.from({ length: 500 + piece * 13 }, (_, index) => record(piece * 1000 + index)).join(",");
    expected += text;
    parts.push(encodeUtf8(text));
  }
  expected += "]";
  const progress: number[] = [];
  const archive = await collect(
    [
      { name: "manifest.json", parts: [encodeUtf8('{"schema_version":1}')] },
      { name: "events.json", parts: [encodeUtf8("["), ...parts, encodeUtf8("]")] },
      { name: "empty.csv", parts: [] },
      { name: "données/été.csv", parts: [encodeUtf8("a,b\n1,2")] },
    ],
    { onProgress: (done: number, total: number) => progress.push(done / total) },
  );

  const zip = await JSZip.loadAsync(archive, { checkCRC32: true });
  assert.deepEqual(Object.keys(zip.files), ["manifest.json", "events.json", "empty.csv", "données/été.csv"]);
  assert.equal(await zip.file("events.json")!.async("string"), expected);
  assert.equal(JSON.parse(expected).length, 40 * 500 + 13 * ((39 * 40) / 2));
  assert.equal(await zip.file("empty.csv")!.async("string"), "");
  assert.equal(await zip.file("données/été.csv")!.async("string"), "a,b\n1,2");
  // Entries carry local wall-clock time, as zip tools expect; this reader
  // hands the same digits back as UTC.
  assert.deepEqual(zip.file("manifest.json")!.date, new Date(Date.UTC(2026, 8, 30, 14, 5, 58)));
  assert.ok(archive.length < expected.length / 3, "the content is compressed");
  assert.equal(progress.at(-1), 1);
  assert.ok(progress.every((value, index) => index === 0 || value >= progress[index - 1]));

  // The system's own unzip accepts it too, where there is one.
  const folder = mkdtempSync(join(tmpdir(), "zentra-zip-"));
  try {
    const path = join(folder, "archive.zip");
    writeFileSync(path, archive);
    let listing: string;
    try {
      listing = execFileSync("unzip", ["-t", path], { encoding: "utf8" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    assert.match(listing, /No errors detected/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("cancelling stops the archive part-way", async () => {
  const controller = new AbortController();
  const big = encodeUtf8("x".repeat(400_000));
  let written = 0;
  await assert.rejects(
    writeZip(
      [
        { name: "first.txt", parts: [big] },
        { name: "second.txt", parts: [big, big, big] },
      ],
      (bytes) => {
        written += bytes.length;
        controller.abort();
      },
      { signal: controller.signal },
    ),
    /Work cancelled/,
  );
  assert.ok(written > 0, "the first entry had been written");
});

test("text is encoded as UTF-8 with or without the platform encoder", () => {
  const samples = ["plain", "température", "日本語", "☀️ 🧭", "\ud83d", "a\u0000b"];
  const platform = globalThis.TextEncoder;
  try {
    for (const sample of samples) {
      const expected = [...new platform().encode(sample)];
      // @ts-expect-error exercising the fallback
      delete globalThis.TextEncoder;
      assert.deepEqual([...encodeUtf8(sample)], expected, sample);
      globalThis.TextEncoder = platform;
    }
  } finally {
    globalThis.TextEncoder = platform;
  }
});
