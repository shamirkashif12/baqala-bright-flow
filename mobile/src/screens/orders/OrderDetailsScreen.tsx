import React from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "@/components/AppHeader";
import { AppCard } from "@/components/AppCard";
import { AppButton } from "@/components/AppButton";
import { StatusBadge } from "@/components/StatusBadge";
import { colors } from "@/theme/colors";
import { sar, fmtDate } from "@/utils/formatters";

export default function OrderDetailsScreen({ route, navigation }: any) {
  const { order } = route.params;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["bottom"]}>
      <AppHeader title={order.id} subtitle={order.invoiceNo} back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <AppCard>
          <View style={styles.row}><Text style={styles.h}>Summary</Text><StatusBadge label={order.status} /></View>
          <Line k="Customer" v={order.customer} />
          <Line k="Cashier" v={order.cashier} />
          <Line k="Branch" v={order.branch} />
          <Line k="Terminal" v={order.terminalId} />
          <Line k="Date" v={fmtDate(order.createdAt)} />
        </AppCard>
        <AppCard>
          <Text style={styles.h}>Items ({order.items.length})</Text>
          {order.items.length === 0
            ? <Text style={{ color: colors.textMuted, marginTop: 6 }}>No item snapshot available.</Text>
            : order.items.map((it: any) => (
              <View key={it.product.id} style={styles.itemRow}>
                <Text style={{ flex: 1, color: colors.text }}>{it.product.name} × {it.qty}</Text>
                <Text style={{ fontWeight: "700", color: colors.text }}>{sar(it.product.price * it.qty)}</Text>
              </View>
            ))}
        </AppCard>
        <AppCard>
          <Text style={styles.h}>Payment</Text>
          <Line k="Method" v={order.paymentMethod ?? "—"} />
          <Line k="Status" v={order.paymentStatus} />
          <Line k="Subtotal" v={sar(order.subtotal)} />
          <Line k="VAT" v={sar(order.tax)} />
          <Line k="Total" v={sar(order.total)} highlight />
        </AppCard>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <AppButton title="Print" variant="outline" style={{ flex: 1 }} onPress={() => Alert.alert("Mock print")} />
          <AppButton title="Share" variant="outline" style={{ flex: 1 }} onPress={() => Alert.alert("Mock share")} />
          <AppButton title="Refund" variant="danger" style={{ flex: 1 }} onPress={() => Alert.alert("Refund requested", "Pending manager approval.")} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Line({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: colors.textMuted, fontSize: 13, textTransform: "capitalize" }}>{k}</Text>
      <Text style={{ color: highlight ? colors.primary : colors.text, fontWeight: highlight ? "800" : "600" }}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  h: { fontWeight: "800", color: colors.text },
  itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
});