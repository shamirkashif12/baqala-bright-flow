import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/colors";
import { radius } from "@/theme/spacing";
import { sar } from "@/utils/formatters";
import { StatusBadge } from "./StatusBadge";
import type { Product } from "@/types";

export const ProductCard: React.FC<{ product: Product; onPress?: () => void }> = ({ product, onPress }) => {
  const lowStock = product.stock <= 10;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
      <View style={styles.thumb}>
        <Ionicons name="cube-outline" size={28} color={colors.primary} />
      </View>
      <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
      <Text style={styles.cat}>{product.category}</Text>
      <Text style={styles.price}>{sar(product.price)}</Text>
      <View style={styles.row}>
        <Text style={[styles.stock, lowStock && { color: colors.danger }]}>Stock: {product.stock}</Text>
        <StatusBadge label={product.expiryStatus} />
      </View>
      <Text style={styles.days}>{product.daysLeft >= 0 ? `${product.daysLeft}d left` : "Expired"}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1, backgroundColor: "#fff", borderRadius: radius.lg,
    padding: 12, borderWidth: 1, borderColor: colors.border, gap: 4,
  },
  thumb: {
    height: 60, backgroundColor: colors.lavender,
    borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginBottom: 6,
  },
  name: { fontWeight: "700", color: colors.text, fontSize: 13 },
  cat: { color: colors.textMuted, fontSize: 11 },
  price: { color: colors.primary, fontWeight: "800", fontSize: 15, marginTop: 2 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  stock: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
  days: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
});