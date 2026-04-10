import React from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/zentra/EmptyState';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Colors, Fonts, FontSizes, Spacing, type AppPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { ActivityHour } from '@/types/zentra';

interface ActivityStripProps {
  hours: ActivityHour[];
}

type ActivityMode = 'movement' | 'screen' | 'rest';

const MODE_OPTIONS: Array<{ key: ActivityMode; label: string }> = [
  { key: 'movement', label: 'Movement' },
  { key: 'screen', label: 'Screen' },
  { key: 'rest', label: 'Rest' },
];

function getModeColor(mode: ActivityMode, palette: AppPalette): string {
  switch (mode) {
    case 'movement':
      return palette.signalPhysical;
    case 'screen':
      return palette.signalCool;
    default:
      return palette.signalHuman;
  }
}

function getModeIntensity(hour: ActivityHour, mode: ActivityMode): number {
  switch (mode) {
    case 'movement':
      return hour.movementIntensity;
    case 'screen':
      return hour.screenIntensity;
    default:
      return hour.restIntensity;
  }
}

function getDominantLabel(hour: ActivityHour): string {
  switch (hour.kind) {
    case 'movement':
      return 'Movement-led';
    case 'screen':
      return 'Screen-led';
    default:
      return 'Rest-led';
  }
}

function getSummaryCopy(mode: ActivityMode): string {
  switch (mode) {
    case 'movement':
      return 'Scrub to inspect where movement stacked up across the day.';
    case 'screen':
      return 'Scrub to inspect screen-heavy periods and usage clusters.';
    default:
      return 'Scrub to inspect calmer and inactive parts of the day.';
  }
}

function getInitialSelectedIndex(hours: ActivityHour[], mode: ActivityMode): number {
  const selected = hours
    .map((hour, index) => ({ index, value: getModeIntensity(hour, mode) }))
    .sort((left, right) => right.value - left.value)[0];

  return selected?.index ?? 0;
}

export function ActivityStrip({ hours }: ActivityStripProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const [mode, setMode] = React.useState<ActivityMode>('movement');
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [stripWidth, setStripWidth] = React.useState(0);
  const accent = getModeColor(mode, palette);

  React.useEffect(() => {
    setSelectedIndex(getInitialSelectedIndex(hours, mode));
  }, [hours, mode]);

  if (!hours.length) {
    return (
      <EmptyState
        body="Activity bands will render once movement, screen-state, or location history is captured."
        title="No daily rhythm yet"
      />
    );
  }

  const clampedIndex = Math.max(0, Math.min(selectedIndex, hours.length - 1));
  const selectedHour = hours[clampedIndex];
  const selectedValue = getModeIntensity(selectedHour, mode);

  function handleLayout(event: LayoutChangeEvent): void {
    setStripWidth(event.nativeEvent.layout.width);
  }

  function updateSelection(locationX: number): void {
    if (!stripWidth || !hours.length) {
      return;
    }

    const slotWidth = stripWidth / hours.length;
    const nextIndex = Math.floor(locationX / Math.max(slotWidth, 1));
    setSelectedIndex(Math.max(0, Math.min(nextIndex, hours.length - 1)));
  }

  return (
    <Card>
      <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
        Daily rhythm
      </Text>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCopy}>
          <Text style={[styles.summaryValue, { color: accent }]}>
            {selectedHour.label}
          </Text>
          <Text style={[styles.summaryBody, { color: palette.textSecondary }]}>
            {getSummaryCopy(mode)}
          </Text>
        </View>
        <View style={styles.summaryMeta}>
          <Text style={[styles.summaryMetric, { color: accent }]}>{selectedValue}%</Text>
          <Text style={[styles.summaryCaption, { color: palette.textSecondary }]}>
            {getDominantLabel(selectedHour)}
          </Text>
        </View>
      </View>

      <View style={styles.modeRow}>
        {MODE_OPTIONS.map((option) => (
          <Chip
            key={option.key}
            active={option.key === mode}
            label={option.label}
            onPress={() => setMode(option.key)}
          />
        ))}
      </View>

      <View
        onLayout={handleLayout}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => updateSelection(event.nativeEvent.locationX)}
        onResponderMove={(event) => updateSelection(event.nativeEvent.locationX)}
        onStartShouldSetResponder={() => true}
        style={styles.stripArea}
      >
        <View style={styles.row}>
          {hours.map((hour, index) => {
            const barValue = getModeIntensity(hour, mode);
            const isSelected = index === clampedIndex;
            const barHeight = 18 + barValue;

            return (
              <View key={hour.label} style={styles.item}>
                <View style={[styles.track, { backgroundColor: palette.card, borderColor: palette.border }]}>
                  <View
                    style={[
                      styles.bar,
                      {
                        backgroundColor: accent,
                        height: barHeight,
                        opacity: isSelected ? 1 : 0.55,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.hourLabel, { color: isSelected ? palette.foreground : palette.mutedForeground }]}>
                  {hour.hour}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderRadius: 999,
    width: '100%',
  },
  eyebrow: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.3,
    marginBottom: Spacing.md,
    textTransform: 'uppercase',
  },
  hourLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
  },
  item: {
    alignItems: 'center',
    flex: 1,
    gap: Spacing.sm,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  row: {
    alignItems: 'flex-end',
    columnGap: Spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stripArea: {
    marginTop: Spacing.xs,
  },
  summaryBody: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  summaryCaption: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  summaryCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  summaryMeta: {
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  summaryMetric: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.xl,
  },
  summaryRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.md,
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  summaryValue: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSizes.base,
  },
  track: {
    alignItems: 'flex-end',
    borderRadius: 999,
    borderWidth: 1,
    height: 124,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    padding: 4,
    width: '100%',
  },
});
