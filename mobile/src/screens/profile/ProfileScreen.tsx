import React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AppHeader } from "@/components/AppHeader";
import { AppCard } from "@/components/AppCard";
import { AppButton } from "@/components/AppButton";
import { colors } from "@/theme/colors";
import { useApp } from "@/store/AppContext";
import { useNavigation } from "@react-navigation/native";

const links: { label: string; icon: keyof typeof Ionicons.glyphMap; route: string }[] = [
  { label: "Opening Cash", icon: "cash", route: "OpeningCash" },
  { label: "Closing Report", icon: "document-text", route: "ClosingReport" },
  { label: "Held Orders", icon: "bookmark", route: "HeldOrders" },
  { label: "Terminals", icon: "desktop", route: "TerminalOverview" },
  { label: "Reports", icon: "bar-chart", route: "Reports" },
  { label: "Audit Logs", icon: "shield-checkmark", route: "AuditLogs" },
];

export default function ProfileScreen() {
  const nav = useNavigation<any>();
  const { user, branch, terminal, opening, shiftActive, logout } = useApp();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["bottom"]}>
      <AppHeader title="Profile" subtitle={user?.role ?? ""} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <AppCard>
          <View style={styles.head}>
            <View style={styles.avatar}><Text style={{ color: "#fff", fontSize: 22, fontWeight: "900" }}>{user?.name?.[0] ?? "?"}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{user?.name}</Text>
              <Text style={styles.sub}>{user?.email}</Text>
              <Text style={styles.sub}>{user?.role}</Text>
            </View>
          </View>
        </AppCard>
        <AppCard>
          <Line k="Branch" v={branch?.name ?? "—"} />
          <Line k="Terminal" v={terminal?.id ?? "—"} />
          <Line k="Shift" v={shiftActive ? "Active" : "Idle"} />
          <Line k="Opening cash" v={opening ? `ر.س ${opening.amount.toFixed(2)}` : "—"} />
        </AppCard>
        {links.map(l => (
          <Pressable key={l.label} onPress={() => nav.navigate(l.route)}>
            <AppCard style={styles.link}>
              <View style={styles.linkIcon}><Ionicons name={l.icon} size={18} color={colors.primary} /></View>
              <Text style={{ flex: 1, color: colors.text, fontWeight: "700" }}>{l.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </AppCard>
          </Pressable>
        ))}
        <AppButton title="Logout" variant="danger" fullWidth onPress={() => Alert.alert("Logout?", "End your session?", [
          { text: "Cancel", style: "cancel" }, { text: "Logout", style: "destructive", onPress: () => logout() },
        ])} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{k}</Text>
      <Text style={{ color: colors.text, fontWeight: "600" }}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 999, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 16, fontWeight: "800", color: colors.text },
  sub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  link: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  linkIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.lavender, alignItems: "center", justifyContent: "center" },
});