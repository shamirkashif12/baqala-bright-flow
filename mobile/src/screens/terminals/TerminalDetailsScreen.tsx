import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "@/components/AppHeader";
import { AppCard } from "@/components/AppCard";
import { StatusBadge } from "@/components/StatusBadge";
import { colors } from "@/theme/colors";
import { sar } from "@/utils/formatters";

const sessions = [
  { id: "S1", emp: "Sara K.", start: "08:02", end: "—", status: "Active" },
  { id: "S2", emp: "Omar A.", start: "Yesterday 09:00", end: "Yesterday 18:30", status: "Closed" },
];

export default function TerminalDetailsScreen({ route }: any) {
  const { terminal } = route.params;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["bottom"]}>
      <AppHeader title={terminal.id} subtitle={terminal.branchName} back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <AppCard>
          <View style={styles.row}><Text style={styles.h}>{terminal.id}</Text><StatusBadge label={terminal.status} /></View>
          <Line k="Branch" v={terminal.branchName} />
          <Line k="Type" v={terminal.type} />
          <Line k="Current employee" v={terminal.employee ?? "—"} />
          <Line k="Session duration" v={terminal.sessionDuration ?? "—"} />
          <Line k="Last sync" v={terminal.lastSync} />
        </AppCard>
        <AppCard>
          <Text style={styles.h}>Shift</Text>
          <Line k="Opening cash" v={terminal.openingCash != null ? sar(terminal.openingCash) : "—"} />
          <Line k="Orders processed" v={String(terminal.ordersProcessed ?? 0)} />
          <Line k="Total sales" v={sar(terminal.totalSales ?? 0)} highlight />
        </AppCard>
        <AppCard>
          <Text style={styles.h}>Session History</Text>
          {sessions.map(s => (
            <View key={s.id} style={styles.session}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "700" }}>{s.emp}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{s.start} → {s.end}</Text>
              </View>
              <StatusBadge label={s.status.toLowerCase()} />
            </View>
          ))}
        </AppCard>
        <AppCard>
          <Text style={styles.h}>Device Logs</Text>
          {["Ping OK", "Sync complete", "Card reader connected", "App updated to v2.4.1"].map(l => (
            <Text key={l} style={{ color: colors.textMuted, fontSize: 12, paddingVertical: 3 }}>• {l}</Text>
          ))}
        </AppCard>
      </ScrollView>
    </SafeAreaView>
  );
}

function Line({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{k}</Text>
      <Text style={{ color: highlight ? colors.primary : colors.text, fontWeight: highlight ? "800" : "600" }}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  h: { fontWeight: "800", color: colors.text, marginBottom: 6 },
  session: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.border },
});