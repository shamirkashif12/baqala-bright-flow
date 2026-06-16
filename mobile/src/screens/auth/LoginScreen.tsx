import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AppButton } from "@/components/AppButton";
import { AppCard } from "@/components/AppCard";
import { useApp } from "@/store/AppContext";
import { api, mockUsers } from "@/services/mockApi";
import { colors } from "@/theme/colors";

export default function LoginScreen({ navigation }: any) {
  const { setUser, pushAudit } = useApp();
  const [email, setEmail] = useState("sara@mart.sa");
  const [password, setPassword] = useState("•••••");
  const [lang, setLang] = useState<"EN" | "AR">("EN");
  const [loading, setLoading] = useState(false);

  const login = async (mail?: string) => {
    setLoading(true);
    try {
      const u = await api.login(mail ?? email);
      setUser(u);
      pushAudit({ action: "Login", user: u.name, role: u.role, branch: "—", terminalId: "—", status: "success" });
      navigation.replace("BranchSelect");
    } catch { Alert.alert("Login failed", "Invalid credentials"); }
    finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.primary }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <View style={styles.hero}>
            <View style={styles.logo}><Ionicons name="storefront" size={32} color={colors.primary} /></View>
            <Text style={styles.brand}>MART ECR</Text>
            <Text style={styles.sub}>MPOS · Saudi Baqala POS</Text>
            <Pressable style={styles.lang} onPress={() => setLang(l => l === "EN" ? "AR" : "EN")}>
              <Text style={{ color: "#fff", fontWeight: "700" }}>{lang}</Text>
            </Pressable>
          </View>
          <View style={styles.body}>
            <AppCard>
              <Text style={styles.title}>Sign in</Text>
              <Text style={styles.label}>Email or phone</Text>
              <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" style={styles.input} placeholder="name@mart.sa" placeholderTextColor={colors.textMuted} />
              <Text style={styles.label}>Password</Text>
              <TextInput value={password} onChangeText={setPassword} secureTextEntry style={styles.input} placeholder="••••••" placeholderTextColor={colors.textMuted} />
              <AppButton title="Login" loading={loading} onPress={() => login()} style={{ marginTop: 8 }} fullWidth />
            </AppCard>
            <Text style={styles.quickTitle}>Demo accounts</Text>
            {mockUsers.map(u => (
              <Pressable key={u.id} onPress={() => login(u.email)} style={styles.userRow}>
                <View style={styles.avatar}><Text style={{ color: colors.primary, fontWeight: "800" }}>{u.name[0]}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>{u.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{u.role} · {u.email}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  hero: { padding: 24, alignItems: "center", paddingTop: 12 },
  logo: { width: 64, height: 64, borderRadius: 18, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  brand: { color: "#fff", fontSize: 24, fontWeight: "900", letterSpacing: 1 },
  sub: { color: "rgba(255,255,255,0.85)", marginTop: 4 },
  lang: { position: "absolute", right: 16, top: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.2)" },
  body: { backgroundColor: colors.bg, flex: 1, padding: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 12 },
  title: { fontSize: 18, fontWeight: "800", color: colors.text, marginBottom: 8 },
  label: { color: colors.textMuted, fontSize: 12, marginTop: 8, marginBottom: 4, fontWeight: "600" },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: colors.text },
  quickTitle: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginTop: 6, marginLeft: 4 },
  userRow: { flexDirection: "row", alignItems: "center", padding: 12, backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: colors.border, gap: 12 },
  avatar: { width: 38, height: 38, borderRadius: 999, backgroundColor: colors.lavender, alignItems: "center", justifyContent: "center" },
});