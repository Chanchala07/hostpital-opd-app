import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { colors } from '../theme/colors';

export type SelectOption<T> = { value: T; label: string; hint?: string };

/** Bottom sheet with a list to pick one value from (a dropdown). */
export default function SelectSheet<T extends string | number>({
  visible,
  title,
  options,
  value,
  onPick,
  onClose,
  testIDPrefix = 'option',
}: {
  visible: boolean;
  title: string;
  options: SelectOption<T>[];
  value: T | null;
  onPick: (value: T) => void;
  onClose: () => void;
  /** Each row gets `{testIDPrefix}-{value}`. */
  testIDPrefix?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}
          onPress={() => {}}
        >
          <Text style={styles.title}>{title}</Text>
          <ScrollView style={styles.list}>
            {options.map(option => {
              const selected = option.value === value;
              return (
                <Pressable
                  key={String(option.value)}
                  testID={`${testIDPrefix}-${option.value}`}
                  onPress={() => onPick(option.value)}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && styles.rowPressed,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <View style={styles.flex}>
                    <Text style={[styles.label, selected && styles.labelOn]}>
                      {option.label}
                    </Text>
                    {option.hint ? (
                      <Text style={styles.hint}>{option.hint}</Text>
                    ) : null}
                  </View>
                  {selected ? <Check size={18} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  sheet: {
    maxHeight: '70%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 18,
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  rowPressed: { backgroundColor: colors.background },
  label: { fontSize: 15, color: colors.text },
  labelOn: { color: colors.primary, fontWeight: '700' },
  hint: { marginTop: 1, fontSize: 12, color: colors.muted },
});
