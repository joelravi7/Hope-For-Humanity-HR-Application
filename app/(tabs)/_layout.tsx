import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import Ionicons from "@expo/vector-icons/Ionicons";
import type React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";

import { canAccessAdminPanel, canReviewLeaveApplication, isSystemAdmin, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

function NativeTabLayout({ isAdmin, showAttendance }: { isAdmin: boolean; showAttendance: boolean }) {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      {showAttendance && (
        <NativeTabs.Trigger name="attendance">
          <Icon sf={{ default: "clock", selected: "clock.fill" }} />
          <Label>Attendance</Label>
        </NativeTabs.Trigger>
      )}
      {isAdmin && (
        <NativeTabs.Trigger name="admin">
          <Icon sf={{ default: "shield", selected: "shield.fill" }} />
          <Label>Admin</Label>
        </NativeTabs.Trigger>
      )}
    </NativeTabs>
  );
}

function TabIconWithDot({ children, showDot, color }: { children: React.ReactNode; showDot: boolean; color: string }) {
  return (
    <View>
      {children}
      {showDot && (
        <View
          style={{
            position: "absolute",
            top: -3,
            right: -6,
            width: 9,
            height: 9,
            borderRadius: 5,
            backgroundColor: color,
            borderWidth: 1.5,
            borderColor: "#fff",
          }}
        />
      )}
    </View>
  );
}

function ClassicTabLayout({ isAdmin, showAttendance, hasManagementReviews }: { isAdmin: boolean; showAttendance: boolean; hasManagementReviews: boolean }) {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : null,
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: "Inter_500Medium",
          marginBottom: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) =>
            isIOS ? (
              <SymbolView name="house" tintColor={color} size={size} />
            ) : (
              <Ionicons name="home-outline" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: "Attendance",
          href: showAttendance ? undefined : null,
          tabBarIcon: ({ color, size }) =>
            isIOS ? (
              <SymbolView name="clock" tintColor={color} size={size} />
            ) : (
              <Ionicons name="time-outline" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: "Admin",
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color, size }) =>
            <TabIconWithDot showDot={hasManagementReviews} color={colors.destructive}>
              {isIOS ? (
                <SymbolView name="shield" tintColor={color} size={size} />
              ) : (
                <Ionicons name="shield-outline" size={22} color={color} />
              )}
            </TabIconWithDot>,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  const { currentUser, users, getAllLeaveApplications } = useApp();
  const isAdmin = canAccessAdminPanel(currentUser?.role);
  const showAttendance = !isSystemAdmin(currentUser?.role);
  const pendingLeaveReviews = currentUser
    ? getAllLeaveApplications().filter((leave) => {
        if (leave.status !== "pending" && leave.status !== "cancel-pending") return false;
        const applicant = users.find((u) => u.id === leave.userId);
        return canReviewLeaveApplication(currentUser.role, applicant, currentUser.id);
      }).length
    : 0;
  const hasManagementReviews = pendingLeaveReviews > 0;

  if (Platform.OS === "ios" && isLiquidGlassAvailable()) {
    return <NativeTabLayout isAdmin={isAdmin} showAttendance={showAttendance} />;
  }

  return <ClassicTabLayout isAdmin={isAdmin} showAttendance={showAttendance} hasManagementReviews={hasManagementReviews} />;
}
