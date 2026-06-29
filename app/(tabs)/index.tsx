import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";

import {
  CheckInArrivalStatus,
  canAccessAdminPanel,
  canApplyLeave,
  canReviewLeaveApplication,
  checkInArrivalLabel,
  getCheckInArrivalStatus,
  isSystemAdmin,
  requiresAttendance,
  roleLabel,
  useApp,
} from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

function formatDate(iso: string) {
  const [year, month, day] = iso.split("T")[0].split("-").map(Number);
  const d = iso.includes("T") || !year || !month || !day ? new Date(iso) : new Date(year, month - 1, day);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function arrivalStatusForRecord(record?: { checkIn?: string; checkInArrivalStatus?: CheckInArrivalStatus }) {
  return record?.checkInArrivalStatus ?? getCheckInArrivalStatus(record?.checkIn);
}

function arrivalMarkerColor(status: CheckInArrivalStatus | null | undefined, colors: ReturnType<typeof useColors>) {
  if (status === "late") return colors.destructive;
  if (status === "grace") return colors.warning;
  if (status === "on-time") return colors.success;
  return colors.mutedForeground;
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser, todayAttendance, isCheckedIn, users, getAllLeaveApplications, getLeaveApplications, getLeaveBalance } = useApp();
  const [clockTick, setClockTick] = useState(() => Date.now());

  useEffect(() => {
    setClockTick(Date.now());
    if (!isCheckedIn) return;
    const id = setInterval(() => setClockTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isCheckedIn, todayAttendance?.checkIn]);

  if (!currentUser) return null;

  const hasAdminAccess = canAccessAdminPanel(currentUser.role);
  const leaveEligible = canApplyLeave(currentUser.role);
  const attendanceEligible = requiresAttendance(currentUser.role);
  const myLeaves = getLeaveApplications(currentUser.id);
  const balance = getLeaveBalance(currentUser.id);
  const pendingLeaveReviews = hasAdminAccess
    ? getAllLeaveApplications().filter((leave) => {
        if (leave.status !== "pending" && leave.status !== "cancel-pending") return false;
        const applicant = users.find((u) => u.id === leave.userId);
        return canReviewLeaveApplication(currentUser.role, applicant, currentUser.id);
      }).length
    : 0;

  const todayHours = (() => {
    if (!todayAttendance?.checkIn) return null;
    if (todayAttendance.totalHours) return todayAttendance.totalHours;
    const diff = Math.max(0, clockTick - new Date(todayAttendance.checkIn).getTime());
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h ${m}m`;
  })();
  const todayArrivalStatus = arrivalStatusForRecord(todayAttendance ?? undefined);
  const todayArrivalColor = arrivalMarkerColor(todayArrivalStatus, colors);

  const s = styles(colors);

  return (
    <ScrollView
      style={[s.root, { paddingTop: insets.top + 28 }]}
      contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom, 24) + 140 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Animated.View entering={FadeInDown.delay(0).duration(500)} style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.greeting}>{getGreeting()},</Text>
          <Text style={s.name}>{currentUser.name}</Text>
          <Text style={s.role}>
            {roleLabel(currentUser.role)}
            {currentUser.region ? ` • ${currentUser.region}` : ""}
          </Text>
        </View>
        <Pressable onPress={() => router.push("/profile")} style={s.avatarBtn}>
          <Text style={s.avatarText}>{currentUser.name.charAt(0)}</Text>
        </Pressable>
      </Animated.View>

      {/* Attendance / Admin Status Card */}
      {attendanceEligible ? (
        <Animated.View entering={FadeInDown.delay(80).duration(500)}>
          <Pressable
            style={[s.attendanceCard, { borderColor: isCheckedIn ? colors.success + "66" : colors.border }]}
            onPress={() => router.push("/(tabs)/attendance")}
          >
            <View style={s.attLeft}>
              <View style={[s.statusDot, { backgroundColor: todayAttendance?.checkIn ? todayArrivalColor : colors.mutedForeground }]} />
              <View>
                <Text style={s.attStatus}>{isCheckedIn ? "On Duty" : todayAttendance?.checkOut ? "Checked Out" : "Not Checked In"}</Text>
                {todayAttendance?.checkIn && (
                  <Text style={s.attTime}>
                    {isCheckedIn
                      ? `Since ${new Date(todayAttendance.checkIn).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} • ${checkInArrivalLabel(todayArrivalStatus)}`
                      : todayAttendance.checkOut
                      ? `Checked out ${new Date(todayAttendance.checkOut).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} • ${checkInArrivalLabel(todayArrivalStatus)}`
                      : ""}
                  </Text>
                )}
                {!todayAttendance && <Text style={s.attTime}>Tap to mark attendance</Text>}
              </View>
            </View>
            <View style={s.attRight}>
              <Text style={[s.attHours, { color: todayAttendance?.checkIn ? todayArrivalColor : colors.mutedForeground }]}>
                {todayHours ?? "—"}
              </Text>
              <Text style={s.attLabel}>Today</Text>
            </View>
          </Pressable>
        </Animated.View>
      ) : hasAdminAccess ? (
        <Animated.View entering={FadeInDown.delay(80).duration(500)}>
          <Pressable
            style={[s.attendanceCard, { borderColor: colors.primary + "44" }]}
            onPress={() => router.push("/(tabs)/admin")}
          >
            <View style={s.attLeft}>
              <View style={[s.statusDot, { backgroundColor: colors.primary }]} />
              <View>
                <Text style={s.attStatus}>{isSystemAdmin(currentUser.role) ? "Access Control" : "Management View"}</Text>
                <Text style={s.attTime}>{isSystemAdmin(currentUser.role) ? "Create users, roles, and account access" : "Review staff activity and approvals"}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
          </Pressable>
        </Animated.View>
      ) : null}

      {/* HR Alerts */}
      {hasAdminAccess && pendingLeaveReviews > 0 && (
        <Animated.View entering={FadeInDown.delay(120).duration(500)} style={s.alertsRow}>
          <Pressable style={[s.alertCard, { borderColor: colors.warning + "55" }]}
            onPress={() => router.push("/(tabs)/admin")}>
            <Ionicons name="calendar-outline" size={18} color={colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={[s.alertTitle, { color: colors.warning }]}>{pendingLeaveReviews} Leave Review{pendingLeaveReviews > 1 ? "s" : ""}</Text>
              <Text style={[s.alertSub, { color: colors.warning + "99" }]}>Waiting for your approval</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={colors.warning} />
          </Pressable>
        </Animated.View>
      )}

      {/* Quick Actions */}
      <Animated.View entering={FadeInDown.delay(160).duration(500)}>
          <Text style={s.sectionTitle}>Quick Actions</Text>
          <View style={s.quickActions}>
          {attendanceEligible && <QuickAction icon="finger-print" label="Attendance" color={colors.primary} onPress={() => router.push("/(tabs)/attendance")} colors={colors} />}
          {leaveEligible && <QuickAction icon="calendar" label="Apply Leave" color={colors.success} onPress={() => router.push("/apply-leave")} colors={colors} />}
          {hasAdminAccess && <QuickAction icon="shield-checkmark" label={isSystemAdmin(currentUser.role) ? "Users" : "Approvals"} color={colors.warning} onPress={() => router.push("/(tabs)/admin")} colors={colors} />}
        </View>
      </Animated.View>

      {/* Stats */}
      {leaveEligible && (
        <Animated.View entering={FadeInDown.delay(220).duration(500)} style={s.statsRow}>
          <StatCard label="Casual Left" value={balance.casualRemaining} icon="sunny" color={colors.accent} colors={colors} />
          <StatCard label="Annual Left" value={balance.annualRemaining} icon="calendar" color={colors.success} colors={colors} />
          <StatCard label="Pending Leave" value={myLeaves.filter((leave) => leave.status === "pending" || leave.status === "cancel-pending").length} icon="hourglass" color={colors.warning} colors={colors} />
        </Animated.View>
      )}

      {/* Recent Leave */}
      {leaveEligible && (
      <Animated.View entering={FadeInDown.delay(280).duration(500)}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Recent Leave</Text>
          <Pressable onPress={() => router.push("/(tabs)/attendance")}>
            <Text style={s.seeAll}>See all</Text>
          </Pressable>
        </View>
        {myLeaves.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="calendar-outline" size={32} color={colors.mutedForeground} />
            <Text style={s.emptyText}>No leave applications yet.</Text>
          </View>
        ) : (
          myLeaves.slice(0, 4).map((leave) => (
            <Pressable
              key={leave.id}
              style={s.leaveCard}
              onPress={() => router.push("/(tabs)/attendance")}
            >
              <View style={[s.riskBar, { backgroundColor: leave.status === "approved" ? colors.success : leave.status === "rejected" ? colors.destructive : colors.warning }]} />
              <View style={s.leaveContent}>
                <View style={s.leaveTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.leaveName} numberOfLines={1}>{leave.leaveType.toUpperCase()} Leave</Text>
                    <Text style={s.leaveDate}>{formatDate(leave.startDate)} - {formatDate(leave.endDate)}</Text>
                  </View>
                  <View style={[s.badge, { backgroundColor: colors.primary + "22" }]}>
                    <Text style={[s.badgeText, { color: colors.primary }]}>{leave.status.toUpperCase()}</Text>
                  </View>
                </View>
                <View style={s.leaveMeta}>
                  <Ionicons name="time-outline" size={11} color={colors.mutedForeground} />
                  <Text style={s.leaveMetaText}>{leave.leaveType === "short" ? `${leave.durationHours}h` : `${leave.durationDays}d`}</Text>
                  <Text style={s.dot}>{"\u2022"}</Text>
                  <Text style={s.leaveMetaText}>{leave.reason}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </Pressable>
          ))
        )}
      </Animated.View>
      )}
    </ScrollView>
  );
}

function QuickAction({ icon, label, color, onPress, colors }: { icon: any; label: string; color: string; onPress: () => void; colors: ReturnType<typeof useColors> }) {
  return (
    <Pressable
      style={({ pressed }) => [{
        flex: 1, alignItems: "center", gap: 7,
        backgroundColor: colors.card, borderRadius: 16, padding: 14,
        borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1,
      }]}
      onPress={onPress}
    >
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: color + "22", alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={{ fontSize: 11, color: colors.foreground, fontFamily: "Inter_500Medium", textAlign: "center" }}>{label}</Text>
    </Pressable>
  );
}

function StatCard({ label, value, icon, color, colors }: { label: string; value: number; icon: any; color: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 6 }}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={{ fontSize: 26, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>{value}</Text>
      <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{label}</Text>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 16, gap: 18 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    greeting: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    name: { fontSize: 22, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    role: { fontSize: 12, color: colors.primary, fontFamily: "Inter_500Medium", marginTop: 2 },
    avatarBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    avatarText: { fontSize: 20, fontWeight: "700", color: colors.primaryForeground, fontFamily: "Inter_700Bold" },
    attendanceCard: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      backgroundColor: colors.card, borderRadius: 16, padding: 18, borderWidth: 1.5,
    },
    attLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
    attStatus: { fontSize: 16, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold" },
    attTime: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 },
    attRight: { alignItems: "flex-end" },
    attHours: { fontSize: 20, fontWeight: "700", fontFamily: "Inter_700Bold" },
    attLabel: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    alertsRow: { gap: 8 },
    alertCard: {
      flexDirection: "row", alignItems: "center", gap: 12,
      backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1,
    },
    alertTitle: { fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold" },
    alertSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold", marginBottom: 10 },
    sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    seeAll: { fontSize: 13, color: colors.primary, fontFamily: "Inter_500Medium" },
    quickActions: { flexDirection: "row", gap: 10 },
    statsRow: { flexDirection: "row", gap: 10 },
    leaveCard: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: colors.card, borderRadius: 14, marginBottom: 8,
      borderWidth: 1, borderColor: colors.border, overflow: "hidden",
    },
    riskBar: { width: 4, alignSelf: "stretch" },
    leaveContent: { flex: 1, padding: 12, gap: 4 },
    leaveTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    leaveName: { fontSize: 14, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold" },
    leaveDate: { fontSize: 11, color: colors.primary, fontFamily: "Inter_500Medium", marginTop: 1 },
    badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 },
    badgeText: { fontSize: 10, fontWeight: "700", fontFamily: "Inter_700Bold" },
    leaveMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
    leaveMetaText: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    dot: { color: colors.mutedForeground, fontSize: 11 },
    statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" },
    statusText: { fontSize: 11, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
    emptyBox: { alignItems: "center", gap: 8, padding: 32 },
    emptyText: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center" },
  });
