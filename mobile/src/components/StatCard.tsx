import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/colors";
import { AppCard } from "./AppCard";

type Accent = "primary" | "success" | "warning" | "danger" | "muted";
const accentColor: Record<Accent, string> = {
  primary: colors.primary, success: colors.success,
  warning: colors.warning, danger: colors.danger, muted: colors.textMuted,
};

interface Props { label: string; value: string | number; icon?: keyof typeof Ionicons.glyphMap; accent?: Accent; sub?: string }

export const StatCard: React.FC<Props> = ({ label, value, icon = "stats-chart", accent = "primary", sub }) => (
  <AppCard style={styles.card}>
    <View style={[styles.iconWrap, { backgroundColor: accentColor[accent] + "1A" }]}>
      <Ionicons name={icon} size={18} color={accentColor[accent]} />
    </View>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value}>{value}</Text>
    {sub ? <Text style={styles.sub}>{sub}</Text> : null}
  </AppCard>
);

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 0 },
  iconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  value: { color: colors.text, fontSize: 20, fontWeight: "800", marginTop: 2 },
  sub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
});