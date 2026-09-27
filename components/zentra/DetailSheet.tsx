import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MetricDetailVisual } from '@/components/zentra/MetricDetailVisual';
import {
  getActionIcon,
} from '@/constants/iconography';
import { Colors, Fonts, FontSizes, IconSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { TodayDetailPayload } from '@/utils/today-visualization';

interface DetailSheetProps {
  onClose: () => void;
  payload: TodayDetailPayload | null;
}

export function DetailSheet({ onClose, payload }: DetailSheetProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const visible = payload !== null;
  const insets = useSafeAreaInsets();
  const [showRows, setShowRows] = React.useState(false);

  React.useEffect(() => {
    setShowRows(false);
  }, [payload?.key]);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <Pressable onPress={onClose} style={[styles.scrim, { backgroundColor: palette.overlay }]} />
        <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: palette.card, borderColor: palette.border }]}>
          {payload ? (
            <ScrollView
              bounces={false}
              contentContainerStyle={[styles.content, { paddingBottom: Math.max(24, insets.bottom + 16) }]}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.header}>
                <View style={styles.headerCopy}>
                  <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
                    {payload.eyebrow}
                  </Text>
                  <Text style={[styles.title, { color: palette.foreground }]}>
                    {payload.title}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close details"
                  onPress={onClose}
                  style={[styles.closeButton, { borderColor: palette.border }]}
                >
                  <Ionicons
                    color={palette.textSecondary}
                    name={getActionIcon('close')}
                    size={IconSizes.inline}
                  />
                  <Text style={[styles.closeLabel, { color: palette.textSecondary }]}>Close</Text>
                </Pressable>
              </View>

              <View style={styles.metricHeader}>
                <Text style={[styles.value, { color: palette.foreground }]}>{payload.value}</Text>
                <Text style={[styles.meta, { color: palette.textSecondary }]}>{payload.meta}</Text>
              </View>
              <MetricDetailVisual tone={payload.tone} visual={payload.visual} />
              <Text style={[styles.summary, { color: palette.foreground }]}>{payload.summary}</Text>

              <View style={[styles.rule, { backgroundColor: palette.border }]} />

              <View style={styles.factGrid}>
                {payload.facts.map((fact, index) => (
                  <View
                    key={`${payload.key}-${fact.label}`}
                    style={[styles.factCard, { borderTopColor: palette.divider, borderTopWidth: index ? 1 : 0 }]}
                  >
                    <View style={styles.factLabelRow}>
                      <Text style={[styles.factLabel, { color: palette.textSecondary }]}>{fact.label}</Text>
                    </View>
                    <Text style={[styles.factValue, { color: palette.foreground }]}>{fact.value}</Text>
                  </View>
                ))}
              </View>

              {payload.rows.length ? (
                <View style={styles.section}>
                  <Pressable accessibilityRole="button" accessibilityState={{ expanded: showRows }} onPress={() => setShowRows((current) => !current)} style={styles.toggleRow}>
                    <Ionicons
                      color={palette.textSecondary}
                      name={showRows ? 'chevron-down-outline' : 'chevron-forward-outline'}
                      size={IconSizes.inline}
                    />
                    <Text style={[styles.sectionLabel, { color: palette.textSecondary }]}>
                      {showRows ? 'Hide supporting records' : 'Show supporting records'}
                    </Text>
                  </Pressable>
                  {showRows ? payload.rows.map((row, index) => (
                    <View
                      key={`${payload.key}-${index}-${row.label}-${row.value}`}
                      style={[styles.eventRow, { borderTopColor: palette.border }]}
                    >
                      <View style={styles.eventLabelRow}>
                        <Ionicons
                          color={palette.textSecondary}
                          name="time-outline"
                          size={IconSizes.inline}
                        />
                        <Text style={[styles.eventLabel, { color: palette.textSecondary }]}>{row.label}</Text>
                      </View>
                      <Text style={[styles.eventValue, { color: palette.foreground }]}>{row.value}</Text>
                    </View>
                  )) : null}
                </View>
              ) : null}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  closeButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.xs,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 68,
    paddingHorizontal: Spacing.md,
  },
  closeLabel: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.xs,
    letterSpacing: 0,
  },
  content: {
    gap: Spacing.lg,
    padding: Spacing.xl,
    paddingBottom: Spacing['3xl'],
  },
  eventLabel: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.xs,
    letterSpacing: 0,
  },
  eventLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  eventRow: {
    gap: Spacing.xs,
    paddingTop: Spacing.md,
  },
  factCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.lg,
    paddingVertical: Spacing.md,
    minHeight: 48,
  },
  eventValue: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.base,
    lineHeight: 22,
  },
  eyebrow: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSizes.xs,
    letterSpacing: 0,
  },
  factLabel: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.xs,
    letterSpacing: 0,
  },
  factLabelRow: {
    flex: 1,
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  factGrid: { gap: 0 },
  factValue: {
    flex: 1.7,
    textAlign: 'right',
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.lg,
  },
  headerCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  metricHeader: {
    gap: Spacing.xs,
  },
  meta: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  rule: { height: 0 },
  scrim: {
    ...StyleSheet.absoluteFillObject,
  },
  section: {
    gap: Spacing.md,
  },
  sectionLabel: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.xs,
    letterSpacing: 0,
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '84%',
    minHeight: '46%',
    overflow: 'hidden',
  },
  summary: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  toggleRow: {
    minHeight: 48,
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingBottom: Spacing.xs,
  },
  title: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSizes.xl,
  },
  value: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSizes['2xl'],
  },
});
