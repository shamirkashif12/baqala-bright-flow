import React from "react";
import { ActivityIndicator, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AuthNavigator from "./AuthNavigator";
import MainTabs from "./MainTabs";
import { useApp } from "@/store/AppContext";
import { colors } from "@/theme/colors";

import OpeningCashScreen from "@/screens/cash/OpeningCashScreen";
import ClosingReportScreen from "@/screens/cash/ClosingReportScreen";
import CartScreen from "@/screens/pos/CartScreen";
import PaymentScreen from "@/screens/pos/PaymentScreen";
import HeldOrdersScreen from "@/screens/pos/HeldOrdersScreen";
import InvoicePreviewScreen from "@/screens/pos/InvoicePreviewScreen";
import OrderDetailsScreen from "@/screens/orders/OrderDetailsScreen";
import ItemDetailsScreen from "@/screens/inventory/ItemDetailsScreen";
import StockAdjustmentScreen from "@/screens/inventory/StockAdjustmentScreen";
import TerminalOverviewScreen from "@/screens/terminals/TerminalOverviewScreen";
import TerminalDetailsScreen from "@/screens/terminals/TerminalDetailsScreen";
import ReportsScreen from "@/screens/reports/ReportsScreen";
import AuditLogsScreen from "@/screens/audit/AuditLogsScreen";
import type { Order, Product, Terminal } from "@/types";

export type RootStackParamList = {
  Tabs: undefined;
  OpeningCash: undefined;
  ClosingReport: undefined;
  Cart: undefined;
  Payment: undefined;
  HeldOrders: undefined;
  InvoicePreview: { order: Order };
  OrderDetails: { order: Order };
  ItemDetails: { product: Product };
  StockAdjustment: { product: Product };
  TerminalOverview: undefined;
  TerminalDetails: { terminal: Terminal };
  Reports: undefined;
  AuditLogs: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { user, branch, bootstrapping } = useApp();
  if (bootstrapping) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }
  if (!user || !branch) return <AuthNavigator />;
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={MainTabs} />
      <Stack.Screen name="OpeningCash" component={OpeningCashScreen} />
      <Stack.Screen name="ClosingReport" component={ClosingReportScreen} />
      <Stack.Screen name="Cart" component={CartScreen} />
      <Stack.Screen name="Payment" component={PaymentScreen} />
      <Stack.Screen name="HeldOrders" component={HeldOrdersScreen} />
      <Stack.Screen name="InvoicePreview" component={InvoicePreviewScreen} />
      <Stack.Screen name="OrderDetails" component={OrderDetailsScreen} />
      <Stack.Screen name="ItemDetails" component={ItemDetailsScreen} />
      <Stack.Screen name="StockAdjustment" component={StockAdjustmentScreen} />
      <Stack.Screen name="TerminalOverview" component={TerminalOverviewScreen} />
      <Stack.Screen name="TerminalDetails" component={TerminalDetailsScreen} />
      <Stack.Screen name="Reports" component={ReportsScreen} />
      <Stack.Screen name="AuditLogs" component={AuditLogsScreen} />
    </Stack.Navigator>
  );
}