import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AppHeader } from "@/components/AppHeader";
import { AppCard } from "@/components/AppCard";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { colors } from "@/theme/colors";
import { useApp } from "@/store/AppContext";
import { sar } from "@/utils/formatters";
import { useNavigation } from "@react-navigation/native";

const quickActions: { label: string; icon: keyof typeof Ionicons.glyphMap; route: string }[] = [
  { label: "Start POS", icon: "cart", route: "Tabs" },
  { label: "Opening Cash", icon: "cash", route: "OpeningCash" },
  { label: "Closing Report", icon: "document-text", route: "ClosingReport" },
  { label: "Orders", icon: "receipt", route: "Tabs" },
  { label: "Inventory", icon: "cube", route: "Tabs" },
  { label: "Terminals", icon: "desktop", route: "TerminalOverview" },
  { label: "Reports", icon: "bar-chart", route: "Reports" },
  { label: "Audit Logs", icon: "shield-checkmark", route: "AuditLogs" },
];

export default function DashboardScreen() {
  const nav = useNavigation<any>();
  const { user, branch, terminal, opening, orders, products, terminals } = useApp();
  const isCashier = user?.role === "Cashier";
  const todayOrders = orders.length;
  const completed = orders.filter(o => o.status === "completed").length;
  const pending = orders.filter(o => o.status === "pending").length;
  const sales = orders.filter(o => o.status === "completed").reduce((s, o) => s + o.total, 0);
  const lowStock = products.filter(p => p.stock <= 10).length;
  const closeExpiry = products.filter(p => p.expiryStatus === "Close" || p.expiryStatus === "Expired").length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["bottom"]}>
      <AppHeader title={`Hi, ${user?.name?.split(" ")[0] ?? ""}`} subtitle={`${branch?.name ?? ""} · ${user?.role ?? ""}`} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <View style={styles.grid}>
          <StatCard label="Today's Sales" value={sar(sales)} icon="trending-up" accent="success" />
          <StatCard label="Today's Orders" value={todayOrders} icon="receipt" accent="primary" />
        </View>
        <View style={styles.grid}>
          <StatCard label="Pending" value={pending} icon="time" accent="warning" />
          <StatCard label="Completed" value={completed} icon="checkmark-done" accent="success" />
        </View>
        <View style={styles.grid}>
          <StatCard label="Opening Cash" value={opening ? sar(opening.amount) : "—"} icon="cash" />
          <StatCard label="Active Terminal" value={terminal?.id ?? "—"} icon="desktop" />
        </View>
        <View style={styles.grid}>
          <StatCard label="Low Stock" value={lowStock} icon="alert-circle" accent="danger" />
          <StatCard label="Close to Expiry" value={closeExpiry} icon="hourglass" accent="warning" />
        </View>

        <Text style={styles.h}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          {quickActions.map(a => (
            <Pressable key={a.label} onPress={() => nav.navigate(a.route)} style={styles.action}>
              <View style={styles.actionIcon}><Ionicons name={a.icon} size={20} color={colors.primary} /></View>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </Pressable>
          ))}
        </View>

        {isCashier ? (
          <>
            <Text style={styles.h}>My Shift</Text>
            <AppCard>
              <View style={styles.rowBetween}>
                <Text style={styles.label}>Shift status</Text>
                <StatusBadge label={opening ? "Active" : "Idle"} />
              </View>
              <View style={styles.rowBetween}><Text style={styles.label}>Opening cash</Text><Text style={styles.val}>{opening ? sar(opening.amount) : "—"}</Text></View>
              <View style={styles.rowBetween}><Text style={styles.label}>My orders</Text><Text style={styles.val}>{todayOrders}</Text></View>
              <View style={styles.rowBetween}><Text style={styles.label}>My sales</Text><Text style={styles.val}>{sar(sales)}</Text></View>
            </AppCard>
          </>
        ) : (
          <>
            <Text style={styles.h}>Terminal Bird-Eye</Text>
            <View style={styles.grid}>
              <StatCard label="Active" value={terminals.filter(t => t.status === "Active").length} icon="pulse" accent="success" />
              <StatCard label="Syncing" value={terminals.filter(t => t.status === "Syncing").length} icon="sync" accent="primary" />
            </View>
            <View style={styles.grid}>
              <StatCard label="Offline" value={terminals.filter(t => t.status === "Offline").length} icon="cloud-offline" accent="danger" />
              <StatCard label="Active Employees" value={terminals.filter(t => t.employee && t.employee !== "—").length} icon="people" accent="primary" />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", gap: 10 },
  h: { fontSize: 15, fontWeight: "800", color: colors.text, marginTop: 4 },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  action: { width: "23%", aspectRatio: 1, backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", padding: 6 },
  actionIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.lavender, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  actionLabel: { fontSize: 10, color: colors.text, fontWeight: "700", textAlign: "center" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  label: { color: colors.textMuted, fontSize: 13 },
  val: { color: colors.text, fontWeight: "700" },
});