import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "@/components/AppHeader";
import { AppCard } from "@/components/AppCard";
import { AppButton } from "@/components/AppButton";
import { colors } from "@/theme/colors";
import { useApp } from "@/store/AppContext";
import { mockTerminals } from "@/services/mockApi";
import { todayISO } from "@/utils/formatters";

export default function OpeningCashScreen({ navigation }: any) {
  const { user, branch, setOpening, setTerminal, pushAudit } = useApp();
  const [amount, setAmount] = useState("500");
  const [notes, setNotes] = useState("");
  const [tid, setTid] = useState(mockTerminals[0]?.id ?? "");

  const submit = () => {
    const n = parseFloat(amount);
    if (isNaN(n) || n <= 0) return Alert.alert("Invalid amount");
    const term = mockTerminals.find(t => t.id === tid) ?? null;
    setTerminal(term);
    setOpening({ cashier: user?.name ?? "—", branchId: branch?.id ?? "", terminalId: tid, amount: n, notes, startedAt: todayISO() });
    pushAudit({ action: "Opening Cash Submitted", user: user?.name ?? "—", role: user?.role ?? "Cashier", branch: branch?.name ?? "—", terminalId: tid, status: "success" });
    Alert.alert("Shift started", "Opening cash recorded. POS is now available.");
    navigation.goBack();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["bottom"]}>
      <AppHeader title="Opening Cash" subtitle="Record starting float" back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <AppCard>
          <Field label="Cashier" value={user?.name ?? "—"} readOnly />
          <Field label="Branch" value={branch?.name ?? "—"} readOnly />
          <Text style={styles.label}>Terminal / MPOS device</Text>
          <View style={styles.chipRow}>
            {mockTerminals.map(t => (
              <Text key={t.id} onPress={() => setTid(t.id)} style={[styles.chip, tid === t.id && styles.chipActive]}>{t.id}</Text>
            ))}
          </View>
          <Field label="Opening cash amount (SAR)" value={amount} onChange={setAmount} keyboardType="numeric" />
          <Field label="Notes" value={notes} onChange={setNotes} multiline />
          <AppButton title="Start Shift" onPress={submit} fullWidth style={{ marginTop: 10 }} />
        </AppCard>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, readOnly, keyboardType, multiline }: any) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        editable={!readOnly}
        onChangeText={onChange}
        keyboardType={keyboardType}
        multiline={multiline}
        style={[styles.input, readOnly && { backgroundColor: colors.bg, color: colors.textMuted }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.textMuted, fontSize: 12, marginBottom: 4, fontWeight: "600" },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: colors.text },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 12, fontWeight: "600" },
  chipActive: { backgroundColor: colors.primary, color: "#fff", borderColor: colors.primary },
});