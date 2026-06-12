import React from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "@/components/AppHeader";
import { AppCard } from "@/components/AppCard";
import { StatusBadge } from "@/components/StatusBadge";
import { colors } from "@/theme/colors";
import { useApp } from "@/store/AppContext";
import { sar, fmtDate } from "@/utils/formatters";

export default function HeldOrdersScreen({ navigation }: any) {
  const { heldOrders, resumeHeld } = useApp();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["bottom"]}>
      <AppHeader title="Held Orders" subtitle={`${heldOrders.length} on hold`} back />
      <FlatList
        data={heldOrders}
        keyExtractor={o => o.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", padding: 40 }}>No held orders</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => { resumeHeld(item.id); navigation.navigate("Cart"); }}>
            <AppCard>
              <View style={styles.row}><Text style={styles.id}>{item.id}</Text><StatusBadge label="held" /></View>
              <Text style={{ color: colors.text, fontWeight: "600" }}>{item.customer}</Text>
              <View style={styles.row}>
                <Text style={{ color: colors.text, fontWeight: "800" }}>{sar(item.total)}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{fmtDate(item.createdAt)}</Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{item.items.length} items · tap to resume</Text>
            </AppCard>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: 2 },
  id: { color: colors.primary, fontWeight: "800" },
});