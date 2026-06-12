import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "@/components/AppHeader";
import { SearchBar } from "@/components/SearchBar";
import { AppCard } from "@/components/AppCard";
import { StatusBadge } from "@/components/StatusBadge";
import { colors } from "@/theme/colors";
import { useApp } from "@/store/AppContext";
import { fmtDate } from "@/utils/formatters";

export default function AuditLogsScreen() {
  const { auditLogs } = useApp();
  const [q, setQ] = useState("");
  const list = useMemo(() => auditLogs.filter(l =>
    !q || `${l.action} ${l.user} ${l.terminalId} ${l.branch}`.toLowerCase().includes(q.toLowerCase())
  ), [auditLogs, q]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["bottom"]}>
      <AppHeader title="Audit Logs" subtitle={`${list.length} entries`} back />
      <View style={{ padding: 12 }}><SearchBar value={q} onChange={setQ} placeholder="Action, user, terminal…" /></View>
      <FlatList
        data={list}
        keyExtractor={l => l.id}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 30, gap: 10 }}
        renderItem={({ item }) => (
          <AppCard>
            <View style={styles.row}>
              <Text style={styles.action} numberOfLines={1}>{item.action}</Text>
              <StatusBadge label={item.status} />
            </View>
            <Text style={styles.meta}>{item.user} · {item.role}</Text>
            <Text style={styles.meta}>{item.branch} · {item.terminalId}</Text>
            <Text style={styles.meta}>{fmtDate(item.timestamp)}</Text>
          </AppCard>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  action: { color: colors.text, fontWeight: "700", flex: 1, marginRight: 8 },
  meta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
});