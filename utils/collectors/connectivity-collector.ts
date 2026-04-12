import type { CollectorHandle } from "@/utils/collectors/types";

export async function startConnectivityCollector(deps: {
  refreshRepository: () => Promise<void>;
}): Promise<CollectorHandle> {
  void deps;

  return {
    stop: () => undefined,
  };
}
