import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";

import { canApplyLeave, requiresAttendance, roleLabel, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser, logout, getAttendanceForUser, getLeaveApplications } = useApp();

  if (!currentUser) return null;

  const myAttendance = getAttendanceForUser(currentUser.id);
  const myLeaves = getLeaveApplications(currentUser.id);
  const attendanceEligible = requiresAttendance(currentUser.role);
  const leaveEligible = canApplyLeave(currentUser.role);
  const completedSessions = myAttendance.filter((r) => r.status === "complete").length;

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out", style: "destructive", onPress: () => {
          logout();
          router.replace("/login");
        },
      },
    ]);
  };

  const s = styles(colors);

  return (
    <View style={[s.root, { paddingBottom: Math.max(insets.bottom, 24) }]}>
      <View style={[s.header, { paddingTop: insets.top + 20 }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={s.headerTitle}>Profile</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={[s.content, { paddingBottom: 64 }]} showsVerticalScrollIndicator={false}>
        {/* Avatar */}
        <Animated.View entering={FadeInDown.delay(0).duration(500)} style={s.avatarSection}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{currentUser.name.charAt(0)}</Text>
          </View>
          <Text style={s.name}>{currentUser.name}</Text>
          <Text style={s.empId}>{currentUser.employeeId}</Text>
          <Text style={s.email}>{currentUser.email}</Text>
          <View style={[s.roleBadge, { backgroundColor: colors.primary + "22" }]}>
            <Text style={[s.roleText, { color: colors.primary }]}>
              {roleLabel(currentUser.role)}
            </Text>
          </View>
        </Animated.View>

        {/* Quick Stats */}
        {(attendanceEligible || leaveEligible) && (
          <Animated.View entering={FadeInDown.delay(80).duration(500)} style={s.statsRow}>
            {leaveEligible && (
              <View style={s.statBox}>
                <Text style={s.statValue}>{myLeaves.length}</Text>
                <Text style={s.statLabel}>Leave</Text>
              </View>
            )}
            {attendanceEligible && (
              <View style={[s.statBox, leaveEligible && { borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border }]}>
                <Text style={s.statValue}>{completedSessions}</Text>
                <Text style={s.statLabel}>Sessions</Text>
              </View>
            )}
            {leaveEligible && (
              <View style={s.statBox}>
                <Text style={s.statValue}>{myLeaves.filter((leave) => leave.status === "pending" || leave.status === "cancel-pending").length}</Text>
                <Text style={s.statLabel}>Pending</Text>
              </View>
            )}
          </Animated.View>
        )}

        {/* Account Details */}
        <Animated.View entering={FadeInDown.delay(140).duration(500)} style={s.card}>
          <Text style={s.cardTitle}>Account Details</Text>
          <InfoRow icon="person-outline" label="Name" value={currentUser.name} colors={colors} />
          <InfoRow icon="card-outline" label="Employee ID" value={currentUser.employeeId} colors={colors} />
          <InfoRow icon="mail-outline" label="Email" value={currentUser.email} colors={colors} />
          {currentUser.phone && <InfoRow icon="call-outline" label="Phone" value={currentUser.phone} colors={colors} />}
          {currentUser.department && <InfoRow icon="business-outline" label="Department" value={currentUser.department} colors={colors} />}
          {currentUser.region && <InfoRow icon="map-outline" label="Region" value={currentUser.region} colors={colors} />}
          {currentUser.program && <InfoRow icon="grid-outline" label="Program" value={currentUser.program} colors={colors} />}
          <InfoRow icon="shield-outline" label="Role" value={roleLabel(currentUser.role)} colors={colors} />
          <InfoRow icon="checkmark-circle-outline" label="Status" value={currentUser.status} colors={colors} capitalize />
        </Animated.View>

        {/* Change Password */}
        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
          <Pressable
            style={s.actionRow}
            onPress={() => router.push("/change-password")}
          >
            <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: colors.primary + "22", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="key-outline" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.actionTitle}>Change Password</Text>
              <Text style={s.actionSub}>Update your account password</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </Pressable>
        </Animated.View>

        {/* Sign Out */}
        <Animated.View entering={FadeInDown.delay(240).duration(500)}>
          <Pressable style={({ pressed }) => [s.signOutBtn, { opacity: pressed ? 0.8 : 1 }]} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color={colors.destructive} />
            <Text style={s.signOutText}>Sign Out</Text>
          </Pressable>
        </Animated.View>

        <Text style={s.version}>Hope for Humanity HR v1.0{"\n"}Demo data is stored locally on this device</Text>
      </ScrollView>
    </View>
  );
}

function InfoRow({ icon, label, value, colors, capitalize }: { icon: any; label: string; value: string; colors: ReturnType<typeof useColors>; capitalize?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Ionicons name={icon} size={16} color={colors.mutedForeground} />
      <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", width: 90 }}>{label}</Text>
      <Text style={{ fontSize: 14, color: colors.foreground, fontFamily: "Inter_500Medium", flex: 1, textTransform: capitalize ? "capitalize" : "none" }}>{value}</Text>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 16, paddingBottom: 12,
      backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 17, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    content: { padding: 16, gap: 14 },
    avatarSection: { alignItems: "center", gap: 6, paddingVertical: 20 },
    avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    avatarText: { fontSize: 32, fontWeight: "700", color: colors.primaryForeground, fontFamily: "Inter_700Bold" },
    name: { fontSize: 22, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    empId: { fontSize: 13, color: colors.primary, fontFamily: "Inter_500Medium" },
    email: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    roleBadge: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginTop: 4 },
    roleText: { fontSize: 13, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
    statsRow: { flexDirection: "row", backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
    statBox: { flex: 1, alignItems: "center", paddingVertical: 18, gap: 4 },
    statValue: { fontSize: 24, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    statLabel: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 2 },
    cardTitle: { fontSize: 14, fontWeight: "700", color: colors.primary, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
    actionRow: {
      flexDirection: "row", alignItems: "center", gap: 12,
      backgroundColor: colors.card, borderRadius: 16, padding: 16,
      borderWidth: 1, borderColor: colors.border,
    },
    actionTitle: { fontSize: 15, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold" },
    actionSub: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 1 },
    signOutBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
      backgroundColor: colors.card, borderRadius: 16, padding: 16,
      borderWidth: 1, borderColor: colors.destructive + "44",
    },
    signOutText: { fontSize: 16, fontWeight: "700", color: colors.destructive, fontFamily: "Inter_700Bold" },
    version: { fontSize: 12, color: colors.mutedForeground, textAlign: "center", fontFamily: "Inter_400Regular", lineHeight: 18 },
  });
