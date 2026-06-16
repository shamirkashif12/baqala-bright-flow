import React from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "@/components/AppHeader";
import { AppCard } from "@/components/AppCard";
import { AppButton } from "@/components/AppButton";
import { colors } from "@/theme/colors";
import { sar, fmtDate } from "@/utils/formatters";

export default function InvoicePreviewScreen({ navigation, route }: any) {
  const { order } = route.params;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["bottom"]}>
      <AppHeader title="Invoice" subtitle={order.invoiceNo} back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <AppCard>
          <Text style={styles.brand}>MART ECR</Text>
          <Text style={styles.muted}>Tax Invoice</Text>
          <View style={styles.divider} />
          <Row k="Invoice #" v={order.invoiceNo} />
          <Row k="Order ID" v={order.id} />
          <Row k="Date" v={fmtDate(order.createdAt)} />
          <Row k="Customer" v={order.customer} />
          <Row k="Cashier" v={order.cashier} />
          <Row k="Branch" v={order.branch} />
          <Row k="Terminal" v={order.terminalId} />
          <View style={styles.divider} />
          {order.items.map((it: any) => (
            <View key={it.product.id} style={styles.itemRow}>
              <Text style={{ flex: 1, color: colors.text }}>{it.product.name} × {it.qty}</Text>
              <Text style={{ color: colors.text, fontWeight: "700" }}>{sar(it.product.price * it.qty)}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <Row k="Subtotal" v={sar(order.subtotal)} />
          <Row k="Discount" v={`- ${sar(order.discount)}`} />
          <Row k="VAT (15%)" v={sar(order.tax)} />
          <Row k="Total" v={sar(order.total)} highlight />
          <Row k="Payment" v={order.paymentMethod ?? "—"} />
        </AppCard>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <AppButton title="Print" variant="outline" onPress={() => Alert.alert("Print", "Mock printed to thermal printer.")} style={{ flex: 1 }} />
          <AppButton title="Share" variant="outline" onPress={() => Alert.alert("Share", "Mock shared.")} style={{ flex: 1 }} />
          <AppButton title="Done" onPress={() => navigation.popToTop()} style={{ flex: 1 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{k}</Text>
      <Text style={{ color: highlight ? colors.primary : colors.text, fontWeight: highlight ? "800" : "600", fontSize: highlight ? 16 : 13 }}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  brand: { fontSize: 22, fontWeight: "900", color: colors.primary, textAlign: "center" },
  muted: { color: colors.textMuted, textAlign: "center" },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
});