import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "@/components/AppHeader";
import { AppCard } from "@/components/AppCard";
import { AppButton } from "@/components/AppButton";
import { colors } from "@/theme/colors";
import { useApp } from "@/store/AppContext";

export default function StockAdjustmentScreen({ route, navigation }: any) {
  const { product } = route.params;
  const { pushAudit, user, branch } = useApp();
  const [qty, setQty] = useState("0");
  const [reason, setReason] = useState("Damage");
  const [notes, setNotes] = useState("");

  const submit = () => {
    pushAudit({ action: `Stock Adjustment Requested (${product.sku} ${qty})`, user: user?.name ?? "—", role: user?.role ?? "Cashier", branch: branch?.name ?? "—", terminalId: "—", status: "warning" });
    Alert.alert("Submitted", "Adjustment request sent to manager.");
    navigation.goBack();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["bottom"]}>
      <AppHeader title="Adjust Stock" subtitle={product.name} back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <AppCard>
          <Text style={styles.label}>Quantity change (+/-)</Text>
          <TextInput value={qty} onChangeText={setQty} keyboardType="numbers-and-punctuation" style={styles.input} />
          <Text style={styles.label}>Reason</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {["Damage", "Expired", "Theft", "Recount", "Other"].map(r => (
              <Text key={r} onPress={() => setReason(r)} style={[styles.chip, reason === r && styles.chipActive]}>{r}</Text>
            ))}
          </View>
          <Text style={styles.label}>Notes</Text>
          <TextInput value={notes} onChangeText={setNotes} multiline style={[styles.input, { minHeight: 70 }]} />
          <AppButton title="Submit Request" onPress={submit} fullWidth style={{ marginTop: 8 }} />
        </AppCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.textMuted, fontSize: 12, fontWeight: "600", marginTop: 4, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: colors.text },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 12, fontWeight: "600" },
  chipActive: { backgroundColor: colors.primary, color: "#fff", borderColor: colors.primary },
});