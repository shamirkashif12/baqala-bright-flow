import React from "react";
import { FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "@/components/AppHeader";
import { StatCard } from "@/components/StatCard";
import { TerminalCard } from "@/components/TerminalCard";
import { colors } from "@/theme/colors";
import { useApp } from "@/store/AppContext";
import { useNavigation } from "@react-navigation/native";

export default function TerminalOverviewScreen() {
  const nav = useNavigation<any>();
  const { terminals } = useApp();
  const active = terminals.filter(t => t.status === "Active").length;
  const syncing = terminals.filter(t => t.status === "Syncing").length;
  const offline = terminals.filter(t => t.status === "Offline").length;
  const mpos = terminals.filter(t => t.type === "MPOS" && t.status !== "Offline").length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["bottom"]}>
      <AppHeader title="Terminals" subtitle="Bird-eye view" back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={styles.grid}>
          <StatCard label="Total" value={terminals.length} icon="apps" />
          <StatCard label="Active" value={active} icon="pulse" accent="success" />
        </View>
        <View style={styles.grid}>
          <StatCard label="Syncing" value={syncing} icon="sync" accent="primary" />
          <StatCard label="Offline" value={offline} icon="cloud-offline" accent="danger" />
        </View>
        <View style={styles.grid}>
          <StatCard label="MPOS Active" value={mpos} icon="phone-portrait" />
          <StatCard label="Employees" value={terminals.filter(t => t.employee && t.employee !== "—").length} icon="people" />
        </View>
        <Text style={styles.h}>Terminals</Text>
        {terminals.map(t => (
          <TerminalCard key={t.id} terminal={t} onPress={() => nav.navigate("TerminalDetails", { terminal: t })} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", gap: 10 },
  h: { fontSize: 15, fontWeight: "800", color: colors.text, marginTop: 6 },
});