import React from "react";
import { StyleSheet, View, ViewProps } from "react-native";
import { colors } from "@/theme/colors";
import { radius, shadow, spacing } from "@/theme/spacing";

export const AppCard: React.FC<ViewProps> = ({ style, children, ...rest }) => (
  <View style={[styles.card, style]} {...rest}>{children}</View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
});