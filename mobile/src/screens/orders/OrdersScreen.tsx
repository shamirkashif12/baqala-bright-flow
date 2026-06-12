import React, { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "@/components/AppHeader";
import { SearchBar } from "@/components/SearchBar";
import { OrderCard } from "@/components/OrderCard";
import { colors } from "@/theme/colors";
import { useApp } from "@/store/AppContext";
import { useNavigation } from "@react-navigation/native";

const ranges = ["Today", "Week", "Month", "Custom"];
const statuses = ["All", "pending", "completed", "refunded", "cancelled"];

export default function OrdersScreen() {
  const nav = useNavigation<any>();
  const { orders } = useApp();
  const [q, setQ] = useState(""); const [range, setRange] = useState("Today"); const [st, setSt] = useState("All");

  const list = useMemo(() => orders.filter(o =>
    (st === "All" || o.status === st) &&
    (!q || `${o.id} ${o.customer}`.toLowerCase().includes(q.toLowerCase()))
  ), [orders, q, st]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["bottom"]}>
      <AppHeader title="Orders" subtitle={`${list.length} found`} />
      <View style={{ padding: 12, gap: 8 }}>
        <SearchBar value={q} onChange={setQ} placeholder="Order id or customer" />
        <ScrollChips items={ranges} value={range} onChange={setRange} />
        <ScrollChips items={statuses} value={st} onChange={setSt} />
      </View>
      <FlatList
        data={list}
        keyExtractor={o => o.id}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 30 }}
        renderItem={({ item }) => <OrderCard order={item} onPress={() => nav.navigate("OrderDetails", { order: item })} />}
        ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", padding: 40 }}>No orders</Text>}
      />
    </SafeAreaView>
  );
}

function ScrollChips({ items, value, onChange }: { items: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <FlatList horizontal data={items} keyExtractor={x => x} showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 6 }}
      renderItem={({ item }) => (
        <Pressable onPress={() => onChange(item)} style={[styles.chip, value === item && styles.chipActive]}>
          <Text style={[styles.chipTxt, value === item && { color: "#fff" }]}>{item}</Text>
        </Pressable>
      )} />
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTxt: { color: colors.text, fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
});