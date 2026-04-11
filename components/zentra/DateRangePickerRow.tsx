import React from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Colors, Fonts, FontSizes, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { isValidISODate, parseISODate, toISODate } from "@/utils/dates";

type DateRangeValue = {
  start: string;
  end: string;
};

type DateField = keyof DateRangeValue;

type DateRangePickerRowProps = DateRangeValue & {
  onChange: (next: DateRangeValue) => void;
};

function formatPickerLabel(value: string): string {
  if (!isValidISODate(value)) {
    return "Pick date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parseISODate(value));
}

export function DateRangePickerRow({
  end,
  onChange,
  start,
}: DateRangePickerRowProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const [activeField, setActiveField] = React.useState<DateField | null>(null);
  const [draftDate, setDraftDate] = React.useState<Date | null>(null);

  const openField = React.useCallback(
    (field: DateField) => {
      const value = field === "start" ? start : end;
      setActiveField(field);
      setDraftDate(isValidISODate(value) ? parseISODate(value) : new Date());
    },
    [end, start],
  );

  const closePicker = React.useCallback(() => {
    setActiveField(null);
    setDraftDate(null);
  }, []);

  const commitDate = React.useCallback(
    (field: DateField, nextDate: Date) => {
      const nextValue = toISODate(nextDate);
      onChange(
        field === "start"
          ? { start: nextValue, end }
          : { start, end: nextValue },
      );
    },
    [end, onChange, start],
  );

  const handleNativeDateChange = React.useCallback(
    (event: { type?: string }, nextDate?: Date) => {
      if (!activeField) {
        return;
      }

      if (event.type === "dismissed") {
        closePicker();
        return;
      }

      if (!nextDate) {
        return;
      }

      if (Platform.OS === "android") {
        commitDate(activeField, nextDate);
        closePicker();
        return;
      }

      setDraftDate(nextDate);
    },
    [activeField, closePicker, commitDate],
  );

  const applyIosDraft = React.useCallback(() => {
    if (!activeField || !draftDate) {
      closePicker();
      return;
    }

    commitDate(activeField, draftDate);
    closePicker();
  }, [activeField, closePicker, commitDate, draftDate]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        {Platform.OS === "web" ? (
          <>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={(value) => onChange({ start: value, end })}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={palette.mutedForeground}
              style={[
                styles.webInput,
                { borderColor: palette.border, color: palette.foreground },
              ]}
              value={start}
            />
            <Text style={[styles.separator, { color: palette.mutedForeground }]}>
              to
            </Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={(value) => onChange({ start, end: value })}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={palette.mutedForeground}
              style={[
                styles.webInput,
                { borderColor: palette.border, color: palette.foreground },
              ]}
              value={end}
            />
          </>
        ) : (
          <>
            <Pressable
              onPress={() => openField("start")}
              style={[
                styles.nativeButton,
                { backgroundColor: palette.card, borderColor: palette.border },
              ]}
            >
              <Text
                style={[
                  styles.nativeLabel,
                  { color: palette.textSecondary },
                ]}
              >
                Start
              </Text>
              <Text
                style={[styles.nativeValue, { color: palette.foreground }]}
              >
                {formatPickerLabel(start)}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => openField("end")}
              style={[
                styles.nativeButton,
                { backgroundColor: palette.card, borderColor: palette.border },
              ]}
            >
              <Text
                style={[
                  styles.nativeLabel,
                  { color: palette.textSecondary },
                ]}
              >
                End
              </Text>
              <Text
                style={[styles.nativeValue, { color: palette.foreground }]}
              >
                {formatPickerLabel(end)}
              </Text>
            </Pressable>
          </>
        )}
      </View>

      {Platform.OS !== "web" && activeField && draftDate ? (
        <View
          style={[
            styles.nativePickerShell,
            {
              backgroundColor: palette.card,
              borderColor: palette.border,
            },
          ]}
        >
          <DateTimePicker
            display={Platform.OS === "ios" ? "spinner" : "default"}
            mode="date"
            onChange={handleNativeDateChange}
            value={draftDate}
          />
          {Platform.OS === "ios" ? (
            <View style={styles.iosActionRow}>
              <Pressable onPress={closePicker} style={styles.iosActionButton}>
                <Text
                  style={[
                    styles.iosActionText,
                    { color: palette.textSecondary },
                  ]}
                >
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={applyIosDraft}
                style={styles.iosActionButton}
              >
                <Text
                  style={[styles.iosActionText, { color: palette.primary }]}
                >
                  Apply
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  iosActionButton: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
  },
  iosActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  iosActionText: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSizes.sm,
  },
  nativeButton: {
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    minHeight: 68,
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  nativeLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  nativePickerShell: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  nativeValue: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSizes.sm,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
  },
  separator: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
  },
  webInput: {
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    fontFamily: Fonts.mono,
    fontSize: FontSizes.sm,
    minHeight: 44,
    paddingHorizontal: Spacing.md,
  },
  wrapper: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
});
