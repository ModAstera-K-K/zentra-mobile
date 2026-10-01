import AsyncStorage from "@react-native-async-storage/async-storage";

import { createTodayPatternSnapshotStore } from "@/utils/today-pattern-snapshot-store";

export type { TodayPatternSnapshot } from "@/utils/today-pattern-snapshot-store";

const store = createTodayPatternSnapshotStore(AsyncStorage);

export const loadTodayPatternSnapshot = store.load;
export const saveTodayPatternSnapshot = store.save;
export const clearTodayPatternSnapshot = store.clear;
