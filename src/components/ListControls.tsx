// Search box, filter chips and tags shared by list screens (Patients, Tokens).

import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Search, X } from 'lucide-react-native';
import { colors } from '../theme/colors';

export function SearchBox({
  value,
  onChangeText,
  placeholder,
  testID,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  testID: string;
}) {
  return (
    <View style={styles.searchBox}>
      <Search size={18} color={colors.muted} />
      <TextInput
        testID={testID}
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        autoCorrect={false}
        returnKeyType="search"
      />
      {value ? (
        <Pressable
          testID="clear-search"
          onPress={() => onChangeText('')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <X size={18} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Horizontally scrolling chips with counts. Bleeds into the parent's
 * horizontal padding (`inset`) so chips can scroll edge to edge.
 */
export function FilterChips<K extends string>({
  options,
  value,
  onChange,
  inset = 16,
}: {
  options: { key: K; label: string; count: number }[];
  value: K;
  onChange: (key: K) => void;
  inset?: number;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -inset }}
      contentContainerStyle={[styles.chipRow, { paddingHorizontal: inset }]}
    >
      {options.map(option => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            testID={`filter-${option.key}`}
            onPress={() => onChange(option.key)}
            style={[styles.chip, selected && styles.chipOn]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.chipText, selected && styles.chipTextOn]}>
              {option.label}
            </Text>
            <View style={[styles.count, selected && styles.countOn]}>
              <Text style={[styles.countText, selected && styles.chipTextOn]}>
                {option.count}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Grey track with a white pill on the selected option (doctor switch, tabs). */
export function SegmentedTabs<K extends string | number>({
  options,
  value,
  onChange,
  testIDPrefix,
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  /** Each option gets `{testIDPrefix}-{key}`. */
  testIDPrefix: string;
}) {
  return (
    <View style={styles.segmented}>
      {options.map(option => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            testID={`${testIDPrefix}-${option.key}`}
            onPress={() => onChange(option.key)}
            style={[styles.segment, selected && styles.segmentOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text
              style={[styles.segmentText, selected && styles.segmentTextOn]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
/** Small rounded label, e.g. "Online", "Waiting". */
export function Tag({
  text,
  bg,
  fg,
  border,
}: {
  text: string;
  bg: string;
  fg: string;
  border?: string;
}) {
  return (
    <View
      style={[styles.tag, { backgroundColor: bg, borderColor: border ?? bg }]}
    >
      <Text style={[styles.tagText, { color: fg }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  segmented: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: 4,
  },
  segment: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  segmentOn: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  segmentText: { fontSize: 14, fontWeight: '500', color: colors.muted },
  segmentTextOn: { color: colors.navy, fontWeight: '700' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    paddingVertical: 0,
    fontSize: 15,
    color: colors.text,
  },
  chipRow: { gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { fontSize: 14, fontWeight: '500', color: colors.text },
  chipTextOn: { color: colors.white, fontWeight: '700' },
  count: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: colors.neutralSoft,
    alignItems: 'center',
  },
  countOn: { backgroundColor: 'rgba(255,255,255,0.2)' },
  countText: { fontSize: 12, fontWeight: '600', color: colors.text },
  tag: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  tagText: { fontSize: 12, fontWeight: '600' },
});
