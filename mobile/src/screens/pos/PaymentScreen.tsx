import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AppHeader } from "@/components/AppHeader";
import { AppCard } from "@/components/AppCard";
import { AppButton } from "@/components/AppButton";
import { StatusBadge } from "@/components/StatusBadge";
import { colors } from "@/theme/colors";
import { useApp } from "@/store/AppContext";
import { sar, todayISO } from "@/utils/formatters";
import type { Order, PaymentMethod } from "@/types";

export default function PaymentScreen({ navigation, route }: any) {
  const { customer = "Walk-in", discount = 0 } = route.params ?? {};
  const { cart, user, branch, terminal, completeOrder } = useApp();
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [received, setReceived] = useState("");

  const subtotal = cart.reduce((s, c) => s + c.product.price * c.qty, 0);
  const taxed = Math.max(0, subtotal - discount);
  const tax = +(taxed * 0.15).toFixed(2);
  const total = +(taxed + tax).toFixed(2);
  const change = Math.max(0, (parseFloat(received || "0") || 0) - total);

  const approve = () => {
    if (method === "Cash" && (parseFloat(received || "0") || 0) < total) {
      return Alert.alert("Insufficient", "Received amount is less than total.");
    }
    const order: Order = {
      id: `ORD-${Math.floor(Math.random() * 90000 + 10000)}`,
      invoiceNo: `INV-${Date.now()}`,
      customer, items: cart, subtotal, tax, discount,
      total, status: "completed", paymentMethod: method, paymentStatus: "paid",
      cashier: user?.name ?? "—", branch: branch?.name ?? "—",
      terminalId: terminal?.id ?? "—", createdAt: todayISO(),
    };
    completeOrder(order);
    navigation.replace("InvoicePreview", { order });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["bottom"]}>
      <AppHeader title="Payment" subtitle={sar(total)} back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <AppCard>
          <Text style={styles.h}>Payment Method</Text>
          <View style={styles.methods}>
            {(["Cash", "Card", "Wallet", "Split"] as PaymentMethod[]).map(m => (
              <Pressable key={m} onPress={() => setMethod(m)} style={[styles.method, method === m && styles.methodActive]}>
                <Ionicons name={m === "Cash" ? "cash" : m === "Card" ? "card" : m === "Wallet" ? "wallet" : "git-branch"} size={20} color={method === m ? "#fff" : colors.primary} />
                <Text style={[styles.methodTxt, method === m && { color: "#fff" }]}>{m}</Text>
              </Pressable>
            ))}
          </View>
        </AppCard>

        {method === "Cash" && (
          <AppCard>
            <Text style={styles.label}>Amount received</Text>
            <TextInput value={received} onChangeText={setReceived} keyboardType="numeric" style={styles.input} placeholder="0.00" />
            <View style={styles.lineRow}><Text>Change</Text><Text style={{ fontWeight: "800", color: colors.primary }}>{sar(change)}</Text></View>
          </AppCard>
        )}
        {method === "Card" && (
          <AppCard>
            <View style={styles.lineRow}><Text>Card machine</Text><StatusBadge label="active" /></View>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>Connected to TML-MPOS-PAY-01</Text>
          </AppCard>
        )}

        <AppCard>
          <View style={styles.lineRow}><Text>Subtotal</Text><Text>{sar(subtotal)}</Text></View>
          <View style={styles.lineRow}><Text>Discount</Text><Text>-{sar(discount)}</Text></View>
          <View style={styles.lineRow}><Text>VAT (15%)</Text><Text>{sar(tax)}</Text></View>
          <View style={styles.lineRow}><Text style={{ fontWeight: "800" }}>Total</Text><Text style={{ fontWeight: "800", color: colors.primary, fontSize: 18 }}>{sar(total)}</Text></View>
        </AppCard>

        <AppButton title="Approve Payment" onPress={approve} fullWidth />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  h: { fontWeight: "800", color: colors.text, marginBottom: 10 },
  methods: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  method: { flexBasis: "47%", flexGrow: 1, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: "center", gap: 6, backgroundColor: "#fff" },
  methodActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  methodTxt: { fontWeight: "700", color: colors.text },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: "600", marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 16, fontWeight: "700" },
  lineRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
});