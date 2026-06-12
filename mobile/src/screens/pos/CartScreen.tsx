import React, { useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AppHeader } from "@/components/AppHeader";
import { AppButton } from "@/components/AppButton";
import { AppCard } from "@/components/AppCard";
import { colors } from "@/theme/colors";
import { useApp } from "@/store/AppContext";
import { sar } from "@/utils/formatters";

export default function CartScreen({ navigation }: any) {
  const { cart, updateCartQty, removeFromCart, holdCurrentOrder } = useApp();
  const [customer, setCustomer] = useState("Walk-in");
  const [discount, setDiscount] = useState("0");

  const subtotal = cart.reduce((s, c) => s + c.product.price * c.qty, 0);
  const disc = parseFloat(discount || "0") || 0;
  const taxed = Math.max(0, subtotal - disc);
  const tax = +(taxed * 0.15).toFixed(2);
  const total = +(taxed + tax).toFixed(2);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["bottom"]}>
      <AppHeader title="Cart" subtitle={`${cart.length} items`} back />
      <FlatList
        data={cart}
        keyExtractor={c => c.product.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 240 }}
        ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", padding: 40 }}>Cart is empty</Text>}
        renderItem={({ item }) => (
          <AppCard>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.product.name}</Text>
                <Text style={styles.cat}>{sar(item.product.price)} · {item.product.category}</Text>
              </View>
              <Pressable onPress={() => removeFromCart(item.product.id)}><Ionicons name="trash" size={18} color={colors.danger} /></Pressable>
            </View>
            <View style={styles.row}>
              <View style={styles.qty}>
                <Pressable style={styles.qtyBtn} onPress={() => updateCartQty(item.product.id, item.qty - 1)}><Text style={styles.qtyTxt}>−</Text></Pressable>
                <Text style={{ width: 28, textAlign: "center", fontWeight: "700", color: colors.text }}>{item.qty}</Text>
                <Pressable style={styles.qtyBtn} onPress={() => updateCartQty(item.product.id, item.qty + 1)}><Text style={styles.qtyTxt}>+</Text></Pressable>
              </View>
              <Text style={{ fontWeight: "800", color: colors.text }}>{sar(item.product.price * item.qty)}</Text>
            </View>
          </AppCard>
        )}
      />
      <View style={styles.summary}>
        <View style={styles.sumRow}><Text style={styles.label}>Customer</Text>
          <TextInput value={customer} onChangeText={setCustomer} style={styles.input} /></View>
        <View style={styles.sumRow}><Text style={styles.label}>Discount</Text>
          <TextInput value={discount} onChangeText={setDiscount} keyboardType="numeric" style={styles.input} /></View>
        <View style={styles.sumLine}><Text>Subtotal</Text><Text>{sar(subtotal)}</Text></View>
        <View style={styles.sumLine}><Text>VAT (15%)</Text><Text>{sar(tax)}</Text></View>
        <View style={styles.sumLine}><Text style={{ fontWeight: "800" }}>Total</Text><Text style={{ fontWeight: "800", color: colors.primary }}>{sar(total)}</Text></View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <AppButton title="Hold" variant="outline" onPress={() => {
            if (!cart.length) return;
            holdCurrentOrder(customer);
            Alert.alert("Order held");
            navigation.goBack();
          }} style={{ flex: 1 }} />
          <AppButton title="Payment" onPress={() => {
            if (!cart.length) return Alert.alert("Cart empty");
            navigation.navigate("Payment", { customer, discount: disc });
          }} style={{ flex: 2 }} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: 4 },
  name: { color: colors.text, fontWeight: "700" },
  cat: { color: colors.textMuted, fontSize: 12 },
  qty: { flexDirection: "row", alignItems: "center", gap: 4 },
  qtyBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.lavender, alignItems: "center", justifyContent: "center" },
  qtyTxt: { color: colors.primary, fontWeight: "800", fontSize: 16 },
  summary: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "#fff", borderTopWidth: 1, borderColor: colors.border, padding: 12, gap: 6 },
  sumRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  sumLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  input: { flex: 1, marginLeft: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, color: colors.text },
});