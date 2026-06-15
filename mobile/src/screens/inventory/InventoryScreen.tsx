import React, { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AppHeader } from "@/components/AppHeader";
import { SearchBar } from "@/components/SearchBar";
import { AppCard } from "@/components/AppCard";
import { StatusBadge } from "@/components/StatusBadge";
import { colors } from "@/theme/colors";
import { useApp } from "@/store/AppContext";
import { sar } from "@/utils/formatters";
import { useNavigation } from "@react-navigation/native";

const stockFilters = ["All", "Low", "Out"];
const expFilters = ["All", "Fresh", "Close", "Expired"];

export default function InventoryScreen() {
  const nav = useNavigation<any>();
  const { products } = useApp();
  const [q, setQ] = useState(""); const [sf, setSf] = useState("All"); const [ef, setEf] = useState("All");

  const list = useMemo(() => products.filter(p =>
    (!q || p.name.toLowerCase().includes(q.toLowerCase())) &&
    (sf === "All" || (sf === "Low" && p.stock <= 10 && p.stock > 0) || (sf === "Out" && p.stock === 0)) &&
    (ef === "All" || p.expiryStatus === ef)
  ), [products, q, sf, ef]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["bottom"]}>
      <AppHeader title="Inventory" subtitle={`${list.length} items`} />
      <View style={{ padding: 12, gap: 8 }}>
        <SearchBar value={q} onChange={setQ} placeholder="Search items" />
        <Chips items={stockFilters} v={sf} on={setSf} />
        <Chips items={expFilters} v={ef} on={setEf} />
      </View>
      <FlatList
        data={list}
        keyExtractor={p => p.id}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 30, gap: 10 }}
        renderItem={({ item }) => (
          <Pressable onPress={() => nav.navigate("ItemDetails", { product: item })}>
            <AppCard>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.sub}>{item.sku} · {item.category}</Text>
                </View>
                <StatusBadge label={item.expiryStatus} />
              </View>
              <View style={[styles.row, { marginTop: 6 }]}>
                <Text style={{ color: colors.text }}>Stock: <Text style={{ fontWeight: "800", color: item.stock <= 10 ? colors.danger : colors.text }}>{item.stock}</Text></Text>
                <Text style={{ color: colors.primary, fontWeight: "800" }}>{sar(item.price)}</Text>
              </View>
              <View style={[styles.row, { marginTop: 4 }]}>
                <Text style={styles.sub}>{item.supplier ?? "—"}</Text>
                <Pressable onPress={() => nav.navigate("StockAdjustment", { product: item })} style={styles.adjust}>
                  <Ionicons name="create" size={14} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>Adjust</Text>
                </Pressable>
              </View>
            </AppCard>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function Chips({ items, v, on }: { items: string[]; v: string; on: (x: string) => void }) {
  return (
    <FlatList horizontal data={items} keyExtractor={x => x} showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 6 }}
      renderItem={({ item }) => (
        <Pressable onPress={() => on(item)} style={[styles.chip, v === item && styles.chipActive]}>
          <Text style={[styles.chipTxt, v === item && { color: "#fff" }]}>{item}</Text>
        </Pressable>
      )} />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { color: colors.text, fontWeight: "700" },
  sub: { color: colors.textMuted, fontSize: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTxt: { color: colors.text, fontSize: 12, fontWeight: "700" },
  adjust: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.lavender },
});