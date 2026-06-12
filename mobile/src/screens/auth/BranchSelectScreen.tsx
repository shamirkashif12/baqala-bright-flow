import React from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AppCard } from "@/components/AppCard";
import { mockBranches } from "@/services/mockApi";
import { useApp } from "@/store/AppContext";
import { colors } from "@/theme/colors";
import { AppHeader } from "@/components/AppHeader";

export default function BranchSelectScreen() {
  const { setBranch, user } = useApp();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["bottom"]}>
      <AppHeader title={`Welcome, ${user?.name ?? ""}`} subtitle="Select your branch to continue" />
      <FlatList
        data={mockBranches}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        keyExtractor={i => i.id}
        renderItem={({ item }) => (
          <Pressable onPress={() => setBranch(item)}>
            <AppCard style={styles.row}>
              <View style={styles.icon}><Ionicons name="storefront" size={20} color={colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.sub}>{item.city} · {item.code}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.primary} />
            </AppCard>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.lavender, alignItems: "center", justifyContent: "center" },
  name: { fontWeight: "700", color: colors.text },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});