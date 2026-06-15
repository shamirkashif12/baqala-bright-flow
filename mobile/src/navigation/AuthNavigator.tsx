import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import LoginScreen from "@/screens/auth/LoginScreen";
import BranchSelectScreen from "@/screens/auth/BranchSelectScreen";

export type AuthStackParamList = {
  Login: undefined;
  BranchSelect: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="BranchSelect" component={BranchSelectScreen} />
    </Stack.Navigator>
  );
}