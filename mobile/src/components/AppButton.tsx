import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { colors } from "@/theme/colors";
import { radius, spacing } from "@/theme/spacing";

type Variant = "primary" | "secondary" | "outline" | "danger" | "ghost";
interface Props {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  fullWidth?: boolean;
}

export const AppButton: React.FC<Props> = ({ title, onPress, variant = "primary", loading, disabled, icon, style, fullWidth }) => {
  const v = styles[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base, v.btn,
        fullWidth && { alignSelf: "stretch" },
        (disabled || loading) && { opacity: 0.6 },
        pressed && { opacity: 0.85 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={v.text.color as string} /> : (
        <View style={styles.row}>
          {icon ? <View style={{ marginRight: 6 }}>{icon}</View> : null}
          <Text style={[styles.text, v.text]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center" },
  text: { fontSize: 15, fontWeight: "700" },
  primary: { btn: { backgroundColor: colors.primary }, text: { color: "#fff" } },
  secondary: { btn: { backgroundColor: colors.lavender }, text: { color: colors.primary } },
  outline: { btn: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.primary }, text: { color: colors.primary } },
  danger: { btn: { backgroundColor: colors.danger }, text: { color: "#fff" } },
  ghost: { btn: { backgroundColor: "transparent" }, text: { color: colors.primary } },
} as any);