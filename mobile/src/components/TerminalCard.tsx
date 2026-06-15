import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/colors";
import { AppCard } from "./AppCard";
import { StatusBadge } from "./StatusBadge";
import type { Terminal } from "@/types";

export const TerminalCard: React.FC<{ terminal: Terminal; onPress?: () => void }> = ({ terminal, onPress }) => (
  <Pressable onPress={onPress}>
    <AppCard style={{ marginBottom: 10 }}>
      <View style={styles.row}>
        <View style={styles.left}>
          <View style={styles.icon}>
            <Ionicons name={terminal.type === "MPOS" ? "phone-portrait" : "desktop"} size={18} color={colors.primary} />
          </View>
          <View>
            <Text style={styles.id}>{terminal.id}</Text>
            <Text style={styles.sub}>{terminal.branchName} · {terminal.type}</Text>
          </View>
        </View>
        <StatusBadge label={terminal.status} />
      </View>
      <View style={styles.row}>
        <Text style={styles.meta}>Employee: {terminal.employee ?? "—"}</Text>
        <Text style={styles.meta}>Last sync: {terminal.lastSync}</Text>
      </View>
      {terminal.sessionDuration ? (
        <Text style={styles.meta}>Session: {terminal.sessionDuration}</Text>
      ) : null}
    </AppCard>
  </Pressable>
);

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  left: { flexDirection: "row", alignItems: "center", gap: 10 },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.lavender, alignItems: "center", justifyContent: "center", marginRight: 10 },
  id: { color: colors.text, fontWeight: "800" },
  sub: { color: colors.textMuted, fontSize: 11 },
  meta: { color: colors.textMuted, fontSize: 11 },
});