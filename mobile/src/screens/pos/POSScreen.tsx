import React, { useMemo, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AppHeader } from "@/components/AppHeader";
import { SearchBar } from "@/components/SearchBar";
import { ProductCard } from "@/components/ProductCard";
import { AppButton } from "@/components/AppButton";
import { colors } from "@/theme/colors";
import { useApp } from "@/store/AppContext";
import { sar } from "@/utils/formatters";
import { useNavigation } from "@react-navigation/native";

export default function POSScreen() {
  const nav = useNavigation<any>();
  const { products, addToCart, cart, shiftActive, heldOrders } = useApp();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");

  const categories = useMemo(() => ["All", ...Array.from(new Set(products.map(p => p.category)))], [products]);
  const list = useMemo(() => products.filter(p =>
    (cat === "All" || p.category === cat) &&
    (!q || p.name.toLowerCase().includes(q.toLowerCase()) || p.barcode.includes(q))
  ), [products, cat, q]);

  const cartTotal = cart.reduce((s, c) => s + c.product.price * c.qty, 0);

  const onAdd = (p: any) => {
    if (!shiftActive) {
      Alert.alert("Shift not started", "Please submit Opening Cash first.", [
        { text: "Cancel" }, { text: "Open Cash", onPress: () => nav.navigate("OpeningCash") },
      ]);
      return;
    }
    if (p.expiryStatus === "Expired") {
      Alert.alert("Expired product", "This item is expired and cannot be sold.");
      return;
    }
    if (p.expiryStatus === "Close") {
      Alert.alert("Close to expiry", "Item is close to expiry. Added with warning.", [
        { text: "Cancel", style: "cancel" }, { text: "Add", onPress: () => addToCart(p) },
      ]);
      return;
    }
    addToCart(p);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["bottom"]}>
      <AppHeader title="POS" subtitle="Scan or tap to add" right={
        <Pressable onPress={() => nav.navigate("HeldOrders")} style={{ padding: 6 }}>
          <Ionicons name="bookmark" size={22} color="#fff" />
          {heldOrders.length > 0 ? <View style={styles.dot}><Text style={styles.dotTxt}>{heldOrders.length}</Text></View> : null}
        </Pressable>
      } />
      <View style={{ padding: 12, gap: 10, flex: 1 }}>
        <SearchBar value={q} onChange={setQ} placeholder="Search name or scan barcode"
          right={<Pressable onPress={() => Alert.alert("Scan", "Mock scanner opened.")}><Ionicons name="barcode" size={22} color={colors.primary} /></Pressable>} />
        <FlatList horizontal showsHorizontalScrollIndicator={false} data={categories} keyExtractor={x => x}
          contentContainerStyle={{ gap: 6 }}
          renderItem={({ item }) => (
            <Pressable onPress={() => setCat(item)} style={[styles.chip, cat === item && styles.chipActive]}>
              <Text style={[styles.chipTxt, cat === item && { color: "#fff" }]}>{item}</Text>
            </Pressable>
          )}
        />
        <FlatList
          data={list}
          numColumns={2}
          columnWrapperStyle={{ gap: 10 }}
          contentContainerStyle={{ gap: 10, paddingBottom: 100 }}
          keyExtractor={i => i.id}
          renderItem={({ item }) => <ProductCard product={item} onPress={() => onAdd(item)} />}
        />
      </View>
      {cart.length > 0 && (
        <View style={styles.cartBar}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#fff", fontWeight: "700" }}>{cart.length} items</Text>
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "900" }}>{sar(cartTotal)}</Text>
          </View>
          <AppButton title="View Cart" variant="secondary" onPress={() => nav.navigate("Cart")} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTxt: { color: colors.text, fontSize: 12, fontWeight: "700" },
  cartBar: { position: "absolute", left: 12, right: 12, bottom: 12, backgroundColor: colors.primary, borderRadius: 18, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { position: "absolute", top: -2, right: -2, backgroundColor: colors.warning, borderRadius: 999, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  dotTxt: { color: "#fff", fontSize: 10, fontWeight: "800" },
});