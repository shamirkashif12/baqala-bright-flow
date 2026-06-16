import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "@/components/AppHeader";
import { AppCard } from "@/components/AppCard";
import { AppButton } from "@/components/AppButton";
import { StatusBadge } from "@/components/StatusBadge";
import { colors } from "@/theme/colors";
import { sar } from "@/utils/formatters";

const movements = [
  { id: "M1", type: "Sale", qty: -2, at: "Today 10:14", by: "Sara K." },
  { id: "M2", type: "Restock", qty: +20, at: "Yesterday 18:02", by: "Warehouse" },
  { id: "M3", type: "Adjustment", qty: -1, at: "2 days ago", by: "Omar A." },
];

export default function ItemDetailsScreen({ route, navigation }: any) {
  const { product } = route.params;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["bottom"]}>
      <AppHeader title={product.name} subtitle={product.sku} back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <AppCard>
          <View style={styles.row}><Text style={styles.h}>{product.name}</Text><StatusBadge label={product.expiryStatus} /></View>
          <Line k="SKU" v={product.sku} />
          <Line k="Barcode" v={product.barcode} />
          <Line k="Category" v={product.category} />
          <Line k="Supplier" v={product.supplier ?? "—"} />
          <Line k="Branch" v={product.branch ?? "—"} />
          <Line k="Warehouse" v={product.warehouse ?? "Central WH"} />
          <Line k="Batch" v={product.batchNumber ?? "—"} />
          <Line k="Expiry" v={product.expiryDate.slice(0, 10)} />
          <Line k="Days left" v={String(product.daysLeft)} />
        </AppCard>
        <AppCard>
          <Text style={styles.h}>Stock & Pricing</Text>
          <Line k="Stock" v={String(product.stock)} />
          <Line k="Purchase price" v={sar(product.purchasePrice ?? product.price * 0.7)} />
          <Line k="Selling price" v={sar(product.price)} highlight />
        </AppCard>
        <AppCard>
          <Text style={styles.h}>Stock Movements</Text>
          {movements.map(m => (
            <View key={m.id} style={styles.movement}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "700" }}>{m.type}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{m.at} · {m.by}</Text>
              </View>
              <Text style={{ fontWeight: "800", color: m.qty > 0 ? colors.success : colors.danger }}>{m.qty > 0 ? `+${m.qty}` : m.qty}</Text>
            </View>
          ))}
        </AppCard>
        <AppButton title="Request Stock Adjustment" onPress={() => navigation.navigate("StockAdjustment", { product })} fullWidth />
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
  movement: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.border },
});