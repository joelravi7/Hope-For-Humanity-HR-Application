import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import {
  ANNUAL_LEAVE_QUOTA,
  CASUAL_LEAVE_QUOTA,
  CheckInArrivalStatus,
  CHECK_IN_GRACE_LABEL,
  LeaveApplication,
  LATE_CHECK_IN_WARNING,
  REGULAR_SIGN_IN_LABEL,
  SHORT_LEAVE_QUOTA,
  canAccessAdminPanel,
  canApplyLeave,
  canViewManagedActivity,
  checkInArrivalLabel,
  getCheckInArrivalStatus,
  requiresAttendance,
  useApp,
} from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

const LOCATION_INTERVAL_MS = 10 * 60 * 1000;

function formatLocalDate(value: string) {
  const [year, month, day] = value.split("T")[0].split("-").map(Number);
  const d = value.includes("T") || !year || !month || !day ? new Date(value) : new Date(year, month - 1, day);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

export default function AttendanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    currentUser, isCheckedIn, todayAttendance,
    checkIn, checkOut, addLocationLog, logout,
    getAttendanceForUser, getAllAttendance, users,
    getLeaveApplications, getLeaveBalance,
    requestLeaveCancellation,
  } = useApp();

  const [loading, setLoading] = useState(false);
  const [locationStatus, setLocationStatus] = useState<"idle" | "tracking" | "denied">("idle");
  const [lastLoggedAt, setLastLoggedAt] = useState<string | null>(null);
  const [clockTick, setClockTick] = useState(() => Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseScale = useSharedValue(1);

  const isAdmin = canAccessAdminPanel(currentUser?.role);
  const attendanceRequired = requiresAttendance(currentUser?.role);
  const leaveEligible = canApplyLeave(currentUser?.role);

  useEffect(() => {
    if (isCheckedIn) {
      pulseScale.value = withRepeat(withTiming(1.18, { duration: 900 }), -1, true);
      setLocationStatus("tracking");
      startPeriodicTracking();
    } else {
      pulseScale.value = withTiming(1);
      setLocationStatus("idle");
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isCheckedIn]);

  useEffect(() => {
    setClockTick(Date.now());
    if (!isCheckedIn) return;
    const id = setInterval(() => setClockTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isCheckedIn, todayAttendance?.checkIn]);

  const startPeriodicTracking = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(async () => {
      if (Platform.OS === "web" || !currentUser || !todayAttendance) return;
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") return;
        const loc = await Location.getCurrentPositionAsync({});
        addLocationLog({
          attendanceId: todayAttendance.id,
          userId: currentUser.id,
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracy: loc.coords.accuracy ?? undefined,
          recordedAt: new Date().toISOString(),
        });
        setLastLoggedAt(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
      } catch {}
    }, LOCATION_INTERVAL_MS);
  };

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: isCheckedIn ? 0.22 : 0,
  }));

  const getLocation = async (): Promise<{ lat?: number; lng?: number; str?: string }> => {
    if (Platform.OS === "web") return { str: "Web — GPS unavailable" };
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { setLocationStatus("denied"); return {}; }
      const loc = await Location.getCurrentPositionAsync({});
      setLocationStatus("tracking");
      return { lat: loc.coords.latitude, lng: loc.coords.longitude, str: `${loc.coords.latitude.toFixed(4)}, ${loc.coords.longitude.toFixed(4)}` };
    } catch { return {}; }
  };

  const handleCheckIn = async () => {
    setLoading(true);
    const loc = await getLocation();
    if (Platform.OS !== "web" && (!loc.lat || !loc.lng)) {
      Alert.alert("Location Required", "Please enable location services so check-in can capture your current location.");
      setLoading(false);
      return;
    }
    const arrivalStatus = getCheckInArrivalStatus(new Date());
    checkIn(loc.lat, loc.lng, loc.str);
    Haptics.notificationAsync(
      arrivalStatus === "late" ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success,
    );
    setLoading(false);
    if (arrivalStatus === "late") {
      Alert.alert("Late Check-In", LATE_CHECK_IN_WARNING);
    }
  };

  const handleCheckOut = async () => {
    Alert.alert("Check Out", "Are you sure you want to check out? Location tracking will stop.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Check Out", onPress: async () => {
          setLoading(true);
          const loc = await getLocation();
          if (Platform.OS !== "web" && (!loc.lat || !loc.lng)) {
            Alert.alert("Location Required", "Please enable location services so checkout can capture your current location.");
            setLoading(false);
            return;
          }
          checkOut(loc.lat, loc.lng, loc.str);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setLoading(false);
          Alert.alert("Checked Out", "Do you want to log out of the app now?", [
            { text: "Stay Signed In", style: "cancel" },
            {
              text: "Log Out",
              onPress: () => {
                logout();
                router.replace("/login");
              },
            },
          ]);
        },
      },
    ]);
  };

  const manageableUserIds = new Set(
    currentUser ? users.filter((u) => canViewManagedActivity(currentUser.role, u, currentUser.id)).map((u) => u.id) : []
  );
  const myRecords = isAdmin
    ? getAllAttendance().filter((record) => manageableUserIds.has(record.userId)).slice().reverse()
    : getAttendanceForUser(currentUser?.id ?? "").slice().reverse();

  const myLeaves = currentUser ? getLeaveApplications(currentUser.id) : [];
  const balance = currentUser ? getLeaveBalance(currentUser.id) : null;

  const todayHours = (() => {
    if (!todayAttendance?.checkIn) return null;
    if (todayAttendance.totalHours) return todayAttendance.totalHours;
    const diff = Math.max(0, clockTick - new Date(todayAttendance.checkIn).getTime());
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h ${m}m`;
  })();

  const locationLogs = todayAttendance?.locationLogs ?? [];
  const todayArrivalStatus = arrivalStatusForRecord(todayAttendance ?? undefined);
  const todayArrivalColor = arrivalMarkerColor(todayArrivalStatus, colors);
  const activeCheckButtonColor = isCheckedIn ? todayArrivalColor : colors.primary;
  const s = styles(colors);

  return (
    <ScrollView
      style={[s.root, { paddingTop: insets.top + 28 }]}
      contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom, 24) + 140 }]}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={FadeInDown.delay(0).duration(500)}>
        <Text style={s.pageTitle}>Attendance</Text>
        <Text style={s.pageSub}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</Text>
      </Animated.View>

      {/* Check In / Out Button */}
      {attendanceRequired ? (
        <Animated.View entering={FadeInDown.delay(80).duration(500)} style={s.checkInCenter}>
          <View style={s.pulseContainer}>
            <Animated.View style={[s.pulse, { backgroundColor: activeCheckButtonColor }, pulseStyle]} />
            <Pressable
              style={[s.checkBtn, { backgroundColor: activeCheckButtonColor }]}
              onPress={isCheckedIn ? handleCheckOut : handleCheckIn}
              disabled={loading}
            >
              <Ionicons name={isCheckedIn ? "log-out-outline" : "finger-print"} size={38} color="#fff" />
              <Text style={s.checkBtnText}>{isCheckedIn ? "Check Out" : "Check In"}</Text>
            </Pressable>
          </View>
          {isCheckedIn && (
            <View style={[s.onDutyBadge, { backgroundColor: todayArrivalColor + "22" }]}>
              <View style={[s.liveDot, { backgroundColor: todayArrivalColor }]} />
              <Text style={[s.onDutyText, { color: todayArrivalColor }]}>
                {checkInArrivalLabel(todayArrivalStatus).toUpperCase()} - TRACKING ACTIVE
              </Text>
            </View>
          )}
        </Animated.View>
      ) : (
        <Animated.View entering={FadeInDown.delay(80).duration(500)} style={s.directorNotice}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
          <Text style={s.directorNoticeTitle}>Attendance not required</Text>
          <Text style={s.directorNoticeText}>
            {currentUser?.role === "it-admin" || currentUser?.role === "admin"
              ? "System Admin access is focused on user creation, roles, and account access control."
              : "Management access is focused on monitoring staff attendance, location, and leave."}
          </Text>
          </View>
        </Animated.View>
      )}

      {/* Today Status */}
      <Animated.View entering={FadeInDown.delay(140).duration(500)} style={s.statusCards}>
        <StatusCard icon="log-in-outline" label="Check In"
          value={todayAttendance?.checkIn ? new Date(todayAttendance.checkIn).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "—"}
          color={todayAttendance?.checkIn ? todayArrivalColor : colors.success} colors={colors} />
        <StatusCard icon="log-out-outline" label="Check Out"
          value={todayAttendance?.checkOut ? new Date(todayAttendance.checkOut).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "—"}
          color={colors.destructive} colors={colors} />
        <StatusCard icon="time-outline" label="Hours" value={todayHours ?? "—"} color={colors.accent} colors={colors} />
      </Animated.View>

      {todayAttendance?.checkIn && (
        <Animated.View entering={FadeInDown.delay(160).duration(500)}>
          <View style={[s.arrivalCard, { borderColor: todayArrivalColor + "66", backgroundColor: todayArrivalColor + "12" }]}>
            <View style={[s.arrivalIcon, { backgroundColor: todayArrivalColor + "22" }]}>
              <Ionicons
                name={todayArrivalStatus === "late" ? "warning-outline" : todayArrivalStatus === "grace" ? "time-outline" : "checkmark-circle-outline"}
                size={18}
                color={todayArrivalColor}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.arrivalTitle, { color: todayArrivalColor }]}>{checkInArrivalLabel(todayArrivalStatus)}</Text>
              <Text style={s.arrivalSub}>
                On time before 8:31 AM. Grace period: {CHECK_IN_GRACE_LABEL}. Regular sign-in: {REGULAR_SIGN_IN_LABEL}.
              </Text>
              {todayArrivalStatus === "late" && <Text style={[s.arrivalWarning, { color: colors.destructive }]}>{LATE_CHECK_IN_WARNING}</Text>}
            </View>
          </View>
        </Animated.View>
      )}

      {/* Location Tracking Status */}
      <Animated.View entering={FadeInDown.delay(180).duration(500)}>
        <View style={[s.locCard, { borderColor: locationStatus === "tracking" ? colors.success + "66" : colors.border }]}>
          <Ionicons
            name={locationStatus === "tracking" ? "location" : "location-outline"}
            size={18}
            color={locationStatus === "tracking" ? colors.success : colors.mutedForeground}
          />
          <View style={{ flex: 1 }}>
            <Text style={[s.locTitle, { color: locationStatus === "tracking" ? colors.success : colors.mutedForeground }]}>
              {locationStatus === "tracking" ? "Location tracking active"
                : locationStatus === "denied" ? "Location permission denied"
                : "Location tracking inactive"}
            </Text>
            <Text style={s.locSub}>
              {locationStatus === "tracking"
                ? `Every 10 min${lastLoggedAt ? ` • Last: ${lastLoggedAt}` : ""} • ${locationLogs.length} log${locationLogs.length !== 1 ? "s" : ""}`
                : "Active only during attendance session"}
            </Text>
          </View>
        </View>
      </Animated.View>

      {/* Leave Balance Card */}
      {leaveEligible && balance && (
        <Animated.View entering={FadeInDown.delay(220).duration(500)}>
          <View style={s.leaveHeader}>
            <Text style={s.sectionTitle}>Leave Balance</Text>
            <Pressable style={s.applyBtn} onPress={() => router.push("/apply-leave")}>
              <Ionicons name="add" size={15} color={colors.primaryForeground} />
              <Text style={s.applyBtnText}>Apply</Text>
            </Pressable>
          </View>
          <View style={s.balanceRow}>
            <LeaveBalanceCard
              label="Casual"
              quota={CASUAL_LEAVE_QUOTA}
              used={balance.casualUsed}
              remaining={balance.casualRemaining}
              unit="days/yr"
              color={colors.primary}
              colors={colors}
            />
            <LeaveBalanceCard
              label="Annual"
              quota={ANNUAL_LEAVE_QUOTA}
              used={balance.annualUsed}
              remaining={balance.annualRemaining}
              unit="days/yr"
              color={colors.accent}
              colors={colors}
            />
            <LeaveBalanceCard
              label="Short"
              quota={SHORT_LEAVE_QUOTA}
              used={balance.shortHoursUsedThisMonth}
              remaining={balance.shortHoursRemainingThisMonth}
              unit="hrs/mo"
              color={colors.warning}
              colors={colors}
            />
          </View>
        </Animated.View>
      )}

      {/* Leave Applications */}
      {leaveEligible && (
        <Animated.View entering={FadeInDown.delay(260).duration(500)}>
          <View style={s.leaveHeader}>
            <Text style={s.sectionTitle}>My Leave History</Text>
          </View>
          <LeaveList
            leaves={myLeaves}
            users={users}
            onCancel={(id, reason) => requestLeaveCancellation(id, currentUser!.id, reason)}
            canRequestCancel
            colors={colors}
          />
        </Animated.View>
      )}

      {/* Attendance History */}
      <Animated.View entering={FadeInDown.delay(320).duration(500)}>
        <Text style={s.sectionTitle}>{isAdmin ? "Managed Staff Attendance" : "Attendance History"}</Text>
        {myRecords.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="calendar-outline" size={32} color={colors.mutedForeground} />
            <Text style={s.emptyText}>No records yet</Text>
          </View>
        ) : (
          myRecords.slice(0, 20).map((r) => {
            const emp = isAdmin ? users.find((u) => u.id === r.userId) : null;
            const arrivalStatus = arrivalStatusForRecord(r);
            const arrivalColor = arrivalMarkerColor(arrivalStatus, colors);
            return (
              <View
                key={r.id}
                style={[
                  s.historyRow,
                  r.status === "incomplete" && { borderColor: colors.warning + "66" },
                  arrivalStatus === "late" && { borderColor: colors.destructive + "66" },
                ]}
              >
                <View style={s.histLeft}>
                  <Text style={s.histDate}>{new Date(r.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</Text>
                  {emp && <Text style={s.histEmp}>{emp.name}</Text>}
                  {r.status === "incomplete" && (
                    <View style={s.incompleteBadge}><Text style={s.incompleteText}>Missed check-out</Text></View>
                  )}
                  {r.checkIn && (
                    <View style={[s.arrivalBadge, { backgroundColor: arrivalColor + "22" }]}>
                      <Text style={[s.arrivalBadgeText, { color: arrivalColor }]}>{checkInArrivalLabel(arrivalStatus)}</Text>
                    </View>
                  )}
                </View>
                <View style={s.histRight}>
                  <Text style={[s.histIn, { color: r.checkIn ? arrivalColor : colors.mutedForeground }]}>
                    {r.checkIn ? new Date(r.checkIn).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "—"}
                  </Text>
                  <Text style={s.histArrow}>→</Text>
                  <Text style={s.histOut}>{r.checkOut ? new Date(r.checkOut).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "—"}</Text>
                  {r.totalHours && (
                    <View style={s.hoursBadge}><Text style={s.hoursText}>{r.totalHours}</Text></View>
                  )}
                  {r.locationLogs.length > 0 && (
                    <View style={s.locBadge}>
                      <Ionicons name="location" size={10} color={colors.primary} />
                      <Text style={s.locBadgeText}>{r.locationLogs.length}</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
      </Animated.View>
    </ScrollView>
  );
}

function LeaveList({
  leaves, users, onCancel, canRequestCancel, colors,
}: {
  leaves: LeaveApplication[];
  users: any[];
  onCancel?: (id: string, reason: string) => void;
  canRequestCancel?: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  if (leaves.length === 0) {
    return (
      <View style={{ alignItems: "center", gap: 8, padding: 28, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border }}>
        <Ionicons name="calendar-clear-outline" size={32} color={colors.mutedForeground} />
        <Text style={{ fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>No leave applications yet</Text>
      </View>
    );
  }

  const leaveTypeColors: Record<string, string> = {
    casual: colors.primary, annual: colors.accent, short: colors.warning,
  };
  const statusColors: Record<string, string> = {
    pending: colors.warning, approved: colors.success, rejected: colors.destructive,
    "cancel-pending": colors.warning, cancelled: colors.mutedForeground,
  };

  return (
    <View style={{ gap: 8 }}>
      {leaves.slice(0, 15).map((leave) => {
        const applicant = users.find((u) => u.id === leave.userId);
        const tc = leaveTypeColors[leave.leaveType] ?? colors.mutedForeground;
        const sc = statusColors[leave.status] ?? colors.mutedForeground;
        return (
          <View key={leave.id} style={{ backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ backgroundColor: tc + "22", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: tc, fontFamily: "Inter_700Bold", textTransform: "uppercase" }}>{leave.leaveType}</Text>
                  </View>
                  {applicant && <Text style={{ fontSize: 12, color: colors.primary, fontFamily: "Inter_500Medium" }}>{applicant.name}</Text>}
                </View>
                <Text style={{ fontSize: 13, color: colors.foreground, fontFamily: "Inter_500Medium", marginTop: 2 }}>
                  {leave.leaveType === "short"
                    ? `${formatLocalDate(leave.startDate)} — ${leave.durationHours}h`
                    : `${formatLocalDate(leave.startDate)} → ${formatLocalDate(leave.endDate)} (${leave.durationDays}d)`}
                </Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }} numberOfLines={2}>{leave.reason}</Text>
              </View>
              <View style={{ backgroundColor: sc + "22", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: sc, fontFamily: "Inter_700Bold" }}>{leave.status.toUpperCase()}</Text>
              </View>
            </View>
            {leave.adminComment && (
              <View style={{ backgroundColor: colors.muted, borderRadius: 8, padding: 8 }}>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Admin: {leave.adminComment}</Text>
              </View>
            )}
            {leave.cancellationReason && (
              <View style={{ backgroundColor: colors.warning + "11", borderRadius: 8, padding: 8 }}>
                <Text style={{ fontSize: 12, color: colors.warning, fontFamily: "Inter_400Regular" }}>Cancel request: {leave.cancellationReason}</Text>
              </View>
            )}
            {canRequestCancel && (leave.status === "pending" || leave.status === "approved") && onCancel && (
              <Pressable
                style={{ backgroundColor: colors.destructive + "22", borderRadius: 10, padding: 10, alignItems: "center" }}
                onPress={() => Alert.alert("Cancel Leave", leave.status === "pending" ? "Cancel this pending leave now?" : "Submit a cancellation request for this approved leave?", [
                  { text: "No", style: "cancel" },
                  { text: leave.status === "pending" ? "Cancel Leave" : "Submit", onPress: () => onCancel(leave.id, "Cancellation requested") },
                ])}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.destructive, fontFamily: "Inter_700Bold" }}>{leave.status === "pending" ? "Cancel Leave" : "Request Cancellation"}</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

function StatusCard({ icon, label, value, color, colors }: { icon: any; label: string; value: string; color: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 12, alignItems: "center", gap: 5, borderWidth: 1, borderColor: colors.border }}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>{value}</Text>
    </View>
  );
}

function LeaveBalanceCard({ label, quota, used, remaining, unit, color, colors }: {
  label: string; quota: number; used: number; remaining: number; unit: string;
  color: string; colors: ReturnType<typeof useColors>;
}) {
  const pct = Math.min(1, used / quota);
  return (
    <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.border, gap: 5, alignItems: "center" }}>
      <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", textTransform: "uppercase" }}>{label}</Text>
      <Text style={{ fontSize: 22, fontWeight: "700", color: remaining === 0 ? colors.destructive : colors.foreground, fontFamily: "Inter_700Bold" }}>
        {remaining}
      </Text>
      <Text style={{ fontSize: 9, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{unit} left</Text>
      <View style={{ width: "100%", height: 4, backgroundColor: colors.muted, borderRadius: 2, overflow: "hidden" }}>
        <View style={{ height: 4, width: `${pct * 100}%`, backgroundColor: pct >= 1 ? colors.destructive : color, borderRadius: 2 }} />
      </View>
      <Text style={{ fontSize: 9, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{used}/{quota}</Text>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 16, gap: 20 },
    pageTitle: { fontSize: 24, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    pageSub: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 },
    checkInCenter: { alignItems: "center", gap: 14 },
    pulseContainer: { width: 164, height: 164, alignItems: "center", justifyContent: "center" },
    pulse: { position: "absolute", width: 164, height: 164, borderRadius: 82 },
    checkBtn: { width: 144, height: 144, borderRadius: 72, alignItems: "center", justifyContent: "center", gap: 8 },
    checkBtnText: { fontSize: 14, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" },
    onDutyBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.success + "22", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
    liveDot: { width: 8, height: 8, borderRadius: 4 },
    onDutyText: { fontSize: 12, fontWeight: "700", fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
    directorNotice: { flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.primary + "33" },
    directorNoticeTitle: { fontSize: 14, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    directorNoticeText: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 18, marginTop: 2 },
    statusCards: { flexDirection: "row", gap: 10 },
    locCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1 },
    locTitle: { fontSize: 13, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
    locSub: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 },
    arrivalCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: 14, padding: 14, borderWidth: 1 },
    arrivalIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
    arrivalTitle: { fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold" },
    arrivalSub: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 18, marginTop: 2 },
    arrivalWarning: { fontSize: 12, fontWeight: "700", fontFamily: "Inter_700Bold", lineHeight: 18, marginTop: 6 },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    leaveHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    applyBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
    applyBtnText: { fontSize: 13, fontWeight: "700", color: colors.primaryForeground, fontFamily: "Inter_700Bold" },
    balanceRow: { flexDirection: "row", gap: 8 },
    tabToggle: { flexDirection: "row", backgroundColor: colors.muted, borderRadius: 10, padding: 3, gap: 3 },
    tabBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
    tabBtnText: { fontSize: 12, fontWeight: "600", color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" },
    emptyBox: { alignItems: "center", gap: 8, padding: 32 },
    emptyText: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    historyRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
    histLeft: { gap: 3 },
    histDate: { fontSize: 14, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold" },
    histEmp: { fontSize: 12, color: colors.primary, fontFamily: "Inter_400Regular" },
    incompleteBadge: { backgroundColor: colors.warning + "22", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start" },
    incompleteText: { fontSize: 10, color: colors.warning, fontFamily: "Inter_600SemiBold" },
    arrivalBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start" },
    arrivalBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
    histRight: { flexDirection: "row", alignItems: "center", gap: 6 },
    histIn: { fontSize: 13, color: colors.success, fontFamily: "Inter_500Medium" },
    histArrow: { fontSize: 12, color: colors.mutedForeground },
    histOut: { fontSize: 13, color: colors.destructive, fontFamily: "Inter_500Medium" },
    hoursBadge: { backgroundColor: colors.primary + "22", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    hoursText: { fontSize: 11, color: colors.primary, fontFamily: "Inter_600SemiBold" },
    locBadge: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: colors.accent + "22", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
    locBadgeText: { fontSize: 10, color: colors.accent, fontFamily: "Inter_600SemiBold" },
  });
