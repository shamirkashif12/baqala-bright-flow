import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";

interface Props { title: string; subtitle?: string; back?: boolean; right?: React.ReactNode }

export const AppHeader: React.FC<Props> = ({ title, subtitle, back, right }) => {
  const nav = useNavigation();
  return (
    <View style={styles.wrap}>
      <View style={styles.left}>
        {back && (
          <Pressable onPress={() => nav.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
        )}
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  left: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  backBtn: { marginRight: 10, padding: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)" },
  title: { color: "#fff", fontSize: 20, fontWeight: "800" },
  subtitle: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
});