import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/colors";
import { AppCard } from "./AppCard";
import { StatusBadge } from "./StatusBadge";
import { sar, fmtDate } from "@/utils/formatters";
import type { Order } from "@/types";

export const OrderCard: React.FC<{ order: Order; onPress?: () => void }> = ({ order, onPress }) => (
  <Pressable onPress={onPress}>
    <AppCard style={{ marginBottom: 10 }}>
      <View style={styles.row}>
        <Text style={styles.id}>{order.id}</Text>
        <StatusBadge label={order.status} />
      </View>
      <Text style={styles.cust}>{order.customer}</Text>
      <View style={styles.row}>
        <Text style={styles.amt}>{sar(order.total)}</Text>
        <StatusBadge label={order.paymentStatus} />
      </View>
      <Text style={styles.meta}>{order.cashier} · {order.terminalId}</Text>
      <Text style={styles.meta}>{fmtDate(order.createdAt)}</Text>
    </AppCard>
  </Pressable>
);

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  id: { color: colors.primary, fontWeight: "800" },
  cust: { color: colors.text, fontWeight: "600", marginVertical: 2 },
  amt: { color: colors.text, fontWeight: "800", fontSize: 16 },
  meta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
});