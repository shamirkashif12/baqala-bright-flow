import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/colors";

const map: Record<string, { bg: string; fg: string }> = {
  active: { bg: "#DCFCE7", fg: colors.success },
  success: { bg: "#DCFCE7", fg: colors.success },
  paid: { bg: "#DCFCE7", fg: colors.success },
  completed: { bg: "#DCFCE7", fg: colors.success },
  fresh: { bg: "#DCFCE7", fg: colors.success },
  allowed: { bg: "#DCFCE7", fg: colors.success },
  syncing: { bg: colors.lavender, fg: colors.primary },
  pending: { bg: "#FEF3C7", fg: colors.warning },
  unpaid: { bg: "#FEF3C7", fg: colors.warning },
  warning: { bg: "#FEF3C7", fg: colors.warning },
  close: { bg: "#FEF3C7", fg: colors.warning },
  held: { bg: "#FEF3C7", fg: colors.warning },
  offline: { bg: "#FEE2E2", fg: colors.danger },
  error: { bg: "#FEE2E2", fg: colors.danger },
  expired: { bg: "#FEE2E2", fg: colors.danger },
  refunded: { bg: "#FEE2E2", fg: colors.danger },
  cancelled: { bg: "#FEE2E2", fg: colors.danger },
  restricted: { bg: "#FEE2E2", fg: colors.danger },
  idle: { bg: "#F3F4F6", fg: colors.textMuted },
};

export const StatusBadge: React.FC<{ label: string }> = ({ label }) => {
  const k = label.toLowerCase();
  const s = map[k] ?? { bg: colors.lavender, fg: colors.primary };
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.text, { color: s.fg }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: "flex-start" },
  text: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
});