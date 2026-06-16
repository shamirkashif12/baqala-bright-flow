import React, { useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "@/components/AppHeader";
import { AppCard } from "@/components/AppCard";
import { AppButton } from "@/components/AppButton";
import { StatusBadge } from "@/components/StatusBadge";
import { colors } from "@/theme/colors";
import { useApp } from "@/store/AppContext";
import { sar, todayISO } from "@/utils/formatters";

export default function ClosingReportScreen({ navigation }: any) {
  const { user, branch, terminal, opening, orders, setOpening, pushAudit } = useApp();

  const cashSales = useMemo(() => orders.filter(o => o.paymentMethod === "Cash").reduce((s, o) => s + o.total, 0), [orders]);
  const cardSales = useMemo(() => orders.filter(o => o.paymentMethod === "Card").reduce((s, o) => s + o.total, 0), [orders]);
  const walletSales = useMemo(() => orders.filter(o => o.paymentMethod === "Wallet").reduce((s, o) => s + o.total, 0), [orders]);
  const refunds = useMemo(() => orders.filter(o => o.status === "refunded").reduce((s, o) => s + o.total, 0), [orders]);
  const [withdrawals, setW] = useState("0");
  const [actual, setActual] = useState("");
  const [notes, setNotes] = useState("");

  const expected = (opening?.amount ?? 0) + cashSales - refunds - parseFloat(withdrawals || "0");
  const diff = (parseFloat(actual || "0") || 0) - expected;

  const submit = () => {
    pushAudit({ action: "Closing Submitted", user: user?.name ?? "—", role: user?.role ?? "Cashier", branch: branch?.name ?? "—", terminalId: terminal?.id ?? "—", status: "success" });
    setOpening(null);
    Alert.alert("Closing submitted", "Status: Pending Review");
    navigation.goBack();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["bottom"]}>
      <AppHeader title="Closing Report" subtitle="Day-end / shift-end" back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <AppCard>
          <Row k="Cashier" v={user?.name ?? "—"} />
          <Row k="Branch" v={branch?.name ?? "—"} />
          <Row k="Terminal" v={terminal?.id ?? "—"} />
          <Row k="Shift start" v={opening?.startedAt ? new Date(opening.startedAt).toLocaleString() : "—"} />
          <Row k="Shift end" v={new Date().toLocaleString()} />
        </AppCard>
        <AppCard>
          <Row k="Opening cash" v={sar(opening?.amount ?? 0)} />
          <Row k="Cash sales" v={sar(cashSales)} />
          <Row k="Card sales" v={sar(cardSales)} />
          <Row k="Wallet sales" v={sar(walletSales)} />
          <Row k="Refunds" v={sar(refunds)} />
          <Field label="Withdrawals (SAR)" value={withdrawals} onChange={setW} />
          <Row k="Expected closing" v={sar(expected)} highlight />
          <Field label="Actual closing (SAR)" value={actual} onChange={setActual} />
          <Row k="Difference" v={sar(diff)} highlight />
          <Field label="Notes" value={notes} onChange={setNotes} multiline />
          <View style={{ flexDirection: "row", justifyContent: "flex-end", marginVertical: 6 }}>
            <StatusBadge label="Pending" />
          </View>
          <View style={{ gap: 8, marginTop: 6 }}>
            <AppButton title="Submit Closing" onPress={submit} fullWidth />
            <AppButton title="Save Draft" variant="outline" onPress={() => Alert.alert("Draft saved")} fullWidth />
            <AppButton title="Print / Share" variant="secondary" onPress={() => Alert.alert("Print", "Mock printed.")} fullWidth />
          </View>
        </AppCard>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{k}</Text>
      <Text style={{ color: highlight ? colors.primary : colors.text, fontWeight: highlight ? "800" : "600" }}>{v}</Text>
    </View>
  );
}

function Field({ label, value, onChange, multiline }: any) {
  return (
    <View style={{ marginVertical: 6 }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4, fontWeight: "600" }}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} multiline={multiline} keyboardType={multiline ? "default" : "numeric"} style={styles.input} />
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: colors.text },
});