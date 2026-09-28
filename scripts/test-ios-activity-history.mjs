import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

if (process.platform !== "darwin") {
  console.error("Core Motion helper tests require the macOS Swift toolchain.");
  process.exit(1);
}
const root = resolve(import.meta.dirname, "..");
const source = [
  "modules/zentra-native-signals/ios/IOSActivityTransitionHelpers.swift",
  "modules/zentra-native-signals/ios/IOSActivityHistoryPage.swift",
  "tests/ios-activity-history.swift",
]
  .map((file) => readFileSync(join(root, file), "utf8"))
  .join("\n");
const cache = mkdtempSync(join(tmpdir(), "zentra-motion-tests-"));
try {
  const result = spawnSync(
    "xcrun",
    ["swift", "-module-cache-path", cache, "-"],
    {
      input: source,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(cache, { recursive: true, force: true });
}
