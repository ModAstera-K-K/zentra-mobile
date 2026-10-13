import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import type { ExportFile } from "@/utils/export-job";

/**
 * A file in the cache directory that an export is written into as bytes. It is
 * written under a temporary name and only takes `fileName` when the archive is
 * complete, so an export that stops early never leaves a file that looks
 * finished.
 */
export function openExportFile(fileName: string): ExportFile {
  const partial = new File(Paths.cache, `${fileName}.part`);
  if (partial.exists) partial.delete();
  partial.create();
  const handle = partial.open();
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    handle.close();
  };
  return {
    write: (bytes) => handle.writeBytes(bytes),
    finish: () => {
      close();
      const finished = new File(Paths.cache, fileName);
      if (finished.exists) finished.delete();
      partial.move(finished);
      return finished.uri;
    },
    discard: () => {
      try {
        close();
        if (partial.exists) partial.delete();
      } catch {
        // Nothing more can be done for a file that will not close or delete;
        // the cache directory is the system's to clear.
      }
    },
  };
}

export async function shareExportFile(uri: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) return;
  await Sharing.shareAsync(uri, {
    mimeType: "application/zip",
    dialogTitle: "Share Zentra export",
    UTI: "public.zip-archive",
  });
}
