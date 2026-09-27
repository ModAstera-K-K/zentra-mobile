import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useAppStore, useRepositoryStore } from "@/stores";
import { HEALTH_RECORD_TYPES, type HealthSyncState } from "@/types/health-sync";
import {
  getHealthSyncStates,
  resetHealthHistory,
} from "@/utils/health-sync-repository";
import {
  requestHealthHistory,
  requestHealthConnectPermissionsAsync,
} from "@/utils/native/zentra-native-signals";
import { syncHealthHistory } from "@/utils/health-sync-runner";
import { RELEASE_FLAGS } from "@/constants/release-flags";
import { Colors, Spacing, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Card } from "@/components/ui/Card";

export function HealthSourcesCard() {
  const palette = Colors[useColorScheme()],
    focused = useIsFocused();
  const enabled = useAppStore((s) => s.collectors.healthConnect.enabled);
  const mode = useAppStore((s) => s.dataMode);
  const [states, setStates] = React.useState<HealthSyncState[]>([]);
  const [busy, setBusy] = React.useState(false),
    [message, setMessage] = React.useState("");
  React.useEffect(() => {
    if (!focused || mode === "demo") return;
    let cancelled = false;
    const read = () => {
      void getHealthSyncStates()
        .then((value) => {
          if (!cancelled) setStates(value);
        })
        .catch(() => {
          if (!cancelled) setMessage("Source status unavailable. Retry below.");
        });
    };
    read();
    const timer = setInterval(read, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [focused, mode]);
  async function run(extend: boolean) {
    setBusy(true);
    setMessage("");
    try {
      if (extend) {
        if (!(await requestHealthHistory())) {
          setMessage(
            "Older history is unavailable or permission was not granted. Existing data remains available.",
          );
          return;
        }
        await resetHealthHistory(90);
      } else await requestHealthConnectPermissionsAsync();
      await syncHealthHistory();
      setStates(await getHealthSyncStates());
      await useRepositoryStore.getState().refreshAll();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Import failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (mode === "demo") return null;
  return (
    <Card style={styles.section}>
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: palette.foreground }]}
      >
        Health sources
      </Text>
      <Text style={{ color: palette.textSecondary }}>
        Imports stay on this device. Readable records may not represent
        continuous capture.
      </Text>
      {HEALTH_RECORD_TYPES.map((type, index) => {
        const state = states.find((s) => s.record_type === type);
        return (
          <View key={type} style={[styles.row, { borderTopColor: palette.divider, borderTopWidth: index ? 1 : 0 }]}>
            <Text style={{ color: palette.foreground }}>
              {type.replaceAll("_", " ")} · {state?.status ?? "Not imported"}
            </Text>
            <Text style={{ color: palette.textSecondary }}>
              {state?.message ??
                (state?.start_at
                  ? `Requested ${state.start_at.slice(0, 10)} to ${state.end_at?.slice(0, 10) ?? "now"}`
                  : "Enable the health collector to import available history.")}
            </Text>
            {!!state?.record_count && (
              <Text style={{ color: palette.textSecondary }}>
                {state.record_count} source records ·{" "}
                {state.observed_start?.slice(0, 10)}–
                {state.observed_end?.slice(0, 10)}
              </Text>
            )}
            {state?.updated_at && (
              <Text style={{ color: palette.textSecondary }}>
                Last saved {new Date(state.updated_at).toLocaleString()}
              </Text>
            )}
          </View>
        );
      })}
      {Platform.OS === "ios" && (
        <Text style={{ color: palette.textSecondary }}>
          Apple Health keeps read permissions private. An empty result can mean
          no records or restricted access.
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        disabled={busy || !enabled}
        onPress={() => void run(false)}
        style={styles.button}
      >
        <Text style={{ color: palette.foreground }}>
          {busy
            ? "Importing…"
            : enabled
              ? "Review access and retry"
              : "Enable health collection above"}
        </Text>
      </Pressable>
      {RELEASE_FLAGS.extendedHealthHistory && (
        <Pressable
          accessibilityRole="button"
          disabled={busy || !enabled}
          onPress={() => void run(true)}
          style={styles.button}
        >
          <Text style={{ color: palette.foreground }}>
            Import up to 90 days
          </Text>
        </Pressable>
      )}
      {!!message && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: palette.textSecondary }}
        >
          {message}
        </Text>
      )}
      <Text style={{ color: palette.textSecondary }}>
        Android app-usage events may only be available for a few days. Location
        and sensor history starts when Zentra records it.
      </Text>
    </Card>
  );
}
const styles = StyleSheet.create({
  title: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 20,
    marginBottom: Spacing.md,
  },
  section: { marginBottom: 34 },
  row: { gap: Spacing.xs, paddingVertical: Spacing.md },
  button: {
    minHeight: 48,
    justifyContent: "center",
    paddingVertical: Spacing.sm,
  },
});
