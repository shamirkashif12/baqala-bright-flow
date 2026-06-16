import React from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/colors";

interface Props { value: string; onChange: (v: string) => void; placeholder?: string; right?: React.ReactNode }

export const SearchBar: React.FC<Props> = ({ value, onChange, placeholder, right }) => (
  <View style={styles.wrap}>
    <Ionicons name="search" size={18} color={colors.textMuted} />
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder ?? "Search…"}
      placeholderTextColor={colors.textMuted}
    />
    {right}
  </View>
);

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#fff", borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 4,
    borderWidth: 1, borderColor: colors.border,
    gap: 8,
  },
  input: { flex: 1, fontSize: 14, color: colors.text, paddingVertical: 8 },
});