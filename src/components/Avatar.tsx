import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { initialsOf } from '../utils/format';

type Props = {
  name: string;
  size?: number;
  background?: string;
  color?: string;
};

/** Round avatar showing the person's initials. */
export default function Avatar({
  name,
  size = 44,
  background = colors.headerBg,
  color = colors.primary,
}: Props) {
  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: background,
        },
      ]}
    >
      <Text style={[styles.text, { color, fontSize: size * 0.34 }]}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  text: { fontWeight: '700' },
});
