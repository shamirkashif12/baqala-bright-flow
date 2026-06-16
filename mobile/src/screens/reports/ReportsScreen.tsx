import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AppHeader } from "@/components/AppHeader";
import { AppCard } from "@/components/AppCard";
import { SearchBar } from "@/components/SearchBar";
import { colors } from "@/theme/colors";
import { useApp } from "@/store/AppContext";
import { sar } from "@/utils/formatters";

const reports: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "sales", label: "My Sales Report", icon: "trending-up" },
  { key: "orders", label: "My Orders Report", icon: "receipt" },
  { key: "inv", label: "Inventory Report", icon: "cube" },
  { key: "low", label: "Low Stock Report", icon: "alert-circle" },
  { key: "exp", label: "Expiry Report", icon: "hourglass" },
  { key: "term", label: "Terminal Report", icon: "desktop" },
  { key: "close", label: "Closing Report", icon: "document-text" },
];

export default function ReportsScreen() {
  const { orders, products, terminals } = useApp();
  const [q, setQ] = useState("");
  const [active, setActive] = useState("sales");

  const sales = orders.filter(o => o.status === "completed").reduce((s, o) => s + o.total, 0);
  const low = products.filter(p => p.stock <= 10).length;
  const exp = products.filter(p => p.expiryStatus !== "Fresh").length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["bottom"]}>
      <AppHeader title="Reports" subtitle="Filter by item, branch, date" back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <SearchBar value={q} onChange={setQ} placeholder="Filter by item, cashier, terminal…" />
        <View style={styles.grid}>
          {reports.map(r => (
            <Pressable key={r.key} onPress={() => setActive(r.key)} style={[styles.tile, active === r.key && styles.tileActive]}>
              <Ionicons name={r.icon} size={20} color={active === r.key ? "#fff" : colors.primary} />
              <Text style={[styles.tileTxt, active === r.key && { color: "#fff" }]}>{r.label}</Text>
            </Pressable>
          ))}
        </View>
        <AppCard>
          {active === "sales" && (<>
            <Text style={styles.h}>Sales summary</Text>
            <Row k="Completed orders" v={String(orders.filter(o => o.status === "completed").length)} />
            <Row k="Gross sales" v={sar(sales)} highlight />
            <MiniBars values={[12, 18, 9, 24, 14, 21, 17]} />
          </>)}
          {active === "orders" && (<>
            <Text style={styles.h}>Orders by status</Text>
            {["completed", "pending", "refunded", "cancelled"].map(s => (
              <Row key={s} k={s} v={String(orders.filter(o => o.status === s).length)} />
            ))}
          </>)}
          {active === "inv" && (<>
            <Text style={styles.h}>Inventory</Text>
            <Row k="Total items" v={String(products.length)} />
            <Row k="In stock" v={String(products.filter(p => p.stock > 10).length)} />
          </>)}
          {active === "low" && (<>
            <Text style={styles.h}>Low stock</Text>
            <Row k="Items ≤ 10" v={String(low)} highlight />
            {products.filter(p => p.stock <= 10).map(p => <Row key={p.id} k={p.name} v={String(p.stock)} />)}
          </>)}
          {active === "exp" && (<>
            <Text style={styles.h}>Expiry</Text>
            <Row k="At risk" v={String(exp)} highlight />
            {products.filter(p => p.expiryStatus !== "Fresh").map(p => <Row key={p.id} k={p.name} v={`${p.daysLeft}d`} />)}
          </>)}
          {active === "term" && (<>
            <Text style={styles.h}>Terminals</Text>
            {terminals.map(t => <Row key={t.id} k={t.id} v={t.status} />)}
          </>)}
          {active === "close" && (<>
            <Text style={styles.h}>Closing</Text>
            <Row k="Open shifts" v="2" />
            <Row k="Pending review" v="1" />
          </>)}
        </AppCard>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.border }}>
      <Text style={{ color: colors.textMuted, fontSize: 13, textTransform: "capitalize" }}>{k}</Text>
      <Text style={{ color: highlight ? colors.primary : colors.text, fontWeight: highlight ? "800" : "600" }}>{v}</Text>
    </View>
  );
}

function MiniBars({ values }: { values: number[] }) {
  const max = Math.max(...values);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: 80, marginTop: 12 }}>
      {values.map((v, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 6, height: `${(v / max) * 100}%`, opacity: 0.4 + i * 0.08 }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { flexBasis: "31%", flexGrow: 1, padding: 12, alignItems: "center", borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff", gap: 4 },
  tileActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tileTxt: { fontSize: 11, color: colors.text, fontWeight: "700", textAlign: "center" },
  h: { fontWeight: "800", color: colors.text, marginBottom: 6 },
});