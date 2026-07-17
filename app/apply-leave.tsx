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
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";

import { CalendarField } from "@/components/CalendarField";
import {
  ANNUAL_LEAVE_QUOTA,
  CASUAL_LEAVE_QUOTA,
  LIEU_LEAVE_MINIMUM_WORK_HOURS,
  LeaveType,
  SHORT_LEAVE_QUOTA,
  UserRole,
  canApplyLeave,
  countExcludedLeaveDays,
  countLeaveDays,
  useApp,
} from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

const LEAVE_TYPES: { value: LeaveType; label: string; icon: any; desc: string }[] = [
  {
    value: "casual",
    label: "Casual Leave",
    icon: "sunny-outline",
    desc: `${CASUAL_LEAVE_QUOTA} days per year`,
  },
  {
    value: "annual",
    label: "Annual Leave",
    icon: "calendar-outline",
    desc: `${ANNUAL_LEAVE_QUOTA} days per year (min. 5-day stretches)`,
  },
  {
    value: "short",
    label: "Short Leave",
    icon: "time-outline",
    desc: `${SHORT_LEAVE_QUOTA} hours per month`,
  },
  {
    value: "medical",
    label: "Medical Leave",
    icon: "medkit-outline",
    desc: "Certificate required for more than 2 days",
  },
  {
    value: "lieu",
    label: "Lieu Leave",
    icon: "briefcase-outline",
    desc: `Earned from ${LIEU_LEAVE_MINIMUM_WORK_HOURS}+h weekend/holiday work`,
  },
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : new Date(value);
}

function daysBetween(start: string, end: string) {
  const s = parseLocalDate(start).getTime();
  const e = parseLocalDate(end).getTime();
  if (e < s) return 0;
  return Math.round((e - s) / 86400000) + 1;
}

function approvalRoleLabel(role: UserRole) {
  if (role === "project-assistant" || role === "employee") return "Project Officer's";
  if (role === "project-officer" || role === "supervisor") return "Project Manager's";
  if (role === "project-manager") return "Director's";
  return "system";
}

export default function ApplyLeaveScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser, applyLeave, validateLeaveApplication, getLeaveBalance } = useApp();

  const [leaveType, setLeaveType] = useState<LeaveType>("casual");
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [shortHours, setShortHours] = useState("1");
  const [reason, setReason] = useState("");
  const [medicalCertificateName, setMedicalCertificateName] = useState("");
  const [validationMsg, setValidationMsg] = useState<string | null>(null);

  if (!currentUser) return null;

  const s = styles(colors);

  if (!canApplyLeave(currentUser.role)) {
    return (
      <View style={[s.root, { paddingBottom: Math.max(insets.bottom, 24) + 20 }]}>
        <View style={[s.header, { paddingTop: insets.top + 20 }]}>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="close" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={s.headerTitle}>Leave Unavailable</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={s.lockedWrap}>
          <Ionicons name="shield-checkmark-outline" size={34} color={colors.primary} />
          <Text style={s.lockedTitle}>This role does not apply for leave</Text>
          <Text style={s.lockedText}>System Admin access is reserved for user creation and access control.</Text>
        </View>
      </View>
    );
  }

  const balance = getLeaveBalance(currentUser.id);
  const calendarDays = leaveType !== "short" ? daysBetween(startDate, endDate) : 0;
  const durationDays = leaveType !== "short" ? countLeaveDays(startDate, endDate) : 0;
  const excludedDays = leaveType !== "short" ? countExcludedLeaveDays(startDate, endDate) : 0;
  const durationHours = leaveType === "short" ? parseFloat(shortHours) || 0 : 0;

  const runValidation = () => {
    if (leaveType !== "short" && parseLocalDate(endDate) < parseLocalDate(startDate)) {
      setValidationMsg("End date cannot be before start date.");
      return;
    }
    const result = validateLeaveApplication({
      userId: currentUser.id,
      leaveType,
      startDate,
      endDate: leaveType !== "short" ? endDate : startDate,
      durationDays,
      durationHours,
      reason,
      medicalCertificateName: medicalCertificateName || undefined,
    });
    setValidationMsg(result.valid ? null : (result.error ?? "Invalid application."));
  };

  const handleSubmit = () => {
    if (!reason.trim()) {
      Alert.alert("Reason Required", "Please provide a reason for your leave request.");
      return;
    }
    if (leaveType !== "short" && parseLocalDate(endDate) < parseLocalDate(startDate)) {
      Alert.alert("Invalid Dates", "End date cannot be before start date.");
      return;
    }
    if (leaveType !== "short" && durationDays <= 0) {
      Alert.alert("No Leave Days Counted", "Saturdays, Sundays, and Sri Lankan public holidays are excluded from leave day counts. Please select at least one working day.");
      return;
    }
    if (leaveType === "medical" && durationDays > 2 && !medicalCertificateName) {
      Alert.alert("Medical Certificate Required", "Please attach a medical certificate for medical leave longer than 2 days.");
      return;
    }

    const result = applyLeave({
      userId: currentUser.id,
      leaveType,
      startDate,
      endDate: leaveType !== "short" ? endDate : startDate,
      durationDays,
      durationHours,
      reason: reason.trim(),
      medicalCertificateName: medicalCertificateName || undefined,
    });

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Application Submitted",
        `Your leave request has been submitted and is pending ${approvalRoleLabel(currentUser.role)} approval.`,
        [{ text: "OK", onPress: () => router.back() }]
      );
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Cannot Apply", result.error ?? "Leave quota exceeded or invalid request.");
    }
  };

  const annualRuleInfo =
    balance.annualUsed < 10
      ? `Must apply in min. 5 counted working leave days. After 10 days total, remaining 4 must be taken at once.`
      : balance.annualUsed < 14
      ? `You have used 10+ days. Remaining ${balance.annualRemaining} day${balance.annualRemaining !== 1 ? "s" : ""} must be taken together.`
      : null;

  return (
    <View style={[s.root, { paddingBottom: Math.max(insets.bottom, 24) + 20 }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 20 }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="close" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={s.headerTitle}>Apply for Leave</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

        {/* Balance Summary */}
        <Animated.View entering={FadeInDown.delay(0).duration(400)} style={s.balanceRow}>
          <BalanceCard
            label="Casual"
            used={balance.casualUsed}
            quota={CASUAL_LEAVE_QUOTA}
            unit="days"
            color={colors.primary}
            colors={colors}
          />
          <BalanceCard
            label="Annual"
            used={balance.annualUsed}
            quota={ANNUAL_LEAVE_QUOTA}
            unit="days"
            color={colors.accent}
            colors={colors}
          />
          <BalanceCard
            label="Short"
            used={balance.shortHoursUsedThisMonth}
            quota={SHORT_LEAVE_QUOTA}
            unit="hrs/mo"
            color={colors.warning}
            colors={colors}
          />
          <BalanceCard
            label="Lieu"
            used={balance.lieuUsedThisMonth}
            quota={balance.lieuEarnedThisMonth}
            unit="days/mo"
            color={colors.success}
            colors={colors}
          />
        </Animated.View>

        {/* Leave Type Selector */}
        <Animated.View entering={FadeInDown.delay(60).duration(400)}>
          <Text style={s.sectionLabel}>Leave Type</Text>
          <View style={s.typeCards}>
            {LEAVE_TYPES.map((t) => {
              const isSelected = leaveType === t.value;
              const exhausted =
                t.value === "casual"
                  ? balance.casualRemaining === 0
                  : t.value === "annual"
                  ? balance.annualRemaining === 0
                  : t.value === "short"
                  ? balance.shortHoursRemainingThisMonth === 0
                  : t.value === "lieu"
                  ? balance.lieuRemainingThisMonth === 0
                  : false;
              return (
                <Pressable
                  key={t.value}
                  style={[
                    s.typeCard,
                    isSelected && { borderColor: colors.primary, backgroundColor: colors.primary + "11" },
                    exhausted && { opacity: 0.5 },
                  ]}
                  onPress={() => { setLeaveType(t.value); setValidationMsg(null); }}
                >
                  <View style={[s.typeIcon, { backgroundColor: isSelected ? colors.primary + "22" : colors.muted }]}>
                    <Ionicons name={t.icon} size={22} color={isSelected ? colors.primary : colors.mutedForeground} />
                  </View>
                  <Text style={[s.typeLabel, isSelected && { color: colors.primary }]}>{t.label}</Text>
                  <Text style={s.typeDesc}>{t.desc}</Text>
                  {exhausted && (
                    <View style={s.exhaustedBadge}>
                      <Text style={s.exhaustedText}>Quota full</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        {/* Annual leave rules notice */}
        {leaveType === "annual" && annualRuleInfo && (
          <Animated.View entering={FadeInDown.duration(300)} style={s.ruleBox}>
            <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
            <Text style={s.ruleText}>{annualRuleInfo}</Text>
          </Animated.View>
        )}

        {leaveType === "lieu" && (
          <Animated.View entering={FadeInDown.duration(300)} style={s.ruleBox}>
            <Ionicons name="briefcase-outline" size={16} color={colors.accent} />
            <Text style={s.ruleText}>
              Lieu Leave is valid only within the earned month. This month: {balance.lieuEarnedThisMonth} earned, {balance.lieuUsedThisMonth} used, {balance.lieuRemainingThisMonth} remaining.
            </Text>
          </Animated.View>
        )}

        {/* Dates */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          {leaveType !== "short" ? (
            <>
              <Text style={s.sectionLabel}>Leave Period</Text>
              <View style={s.dateRow}>
                <View style={s.dateField}>
                  <CalendarField
                    label="Start Date"
                    value={startDate}
                    onChange={(v) => { setStartDate(v); setValidationMsg(null); }}
                    placeholder="Select start date"
                  />
                </View>
                <View style={s.dateField}>
                  <CalendarField
                    label="End Date"
                    value={endDate}
                    onChange={(v) => { setEndDate(v); setValidationMsg(null); }}
                    placeholder="Select end date"
                  />
                </View>
              </View>
              {calendarDays > 0 && (
                <View style={s.durationBadge}>
                  <Ionicons name="calendar" size={14} color={colors.primary} />
                  <Text style={s.durationText}>
                    {durationDays} working leave day{durationDays !== 1 ? "s" : ""}{excludedDays ? ` • ${excludedDays} weekend/public holiday day${excludedDays !== 1 ? "s" : ""} excluded` : ""}
                  </Text>
                </View>
              )}
            </>
          ) : (
            <>
              <Text style={s.sectionLabel}>Short Leave Details</Text>
              <View style={s.dateRow}>
                <View style={s.dateField}>
                  <CalendarField
                    label="Date"
                    value={startDate}
                    onChange={(v) => { setStartDate(v); setValidationMsg(null); }}
                    placeholder="Select date"
                  />
                </View>
                <View style={s.dateField}>
                  <Text style={s.fieldLabel}>Hours Needed (max 3)</Text>
                  <View style={s.hoursRow}>
                    {["1", "1.5", "2", "3"].map((h) => (
                      <Pressable
                        key={h}
                        style={[s.hoursChip, shortHours === h && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                        onPress={() => { setShortHours(h); setValidationMsg(null); }}
                      >
                        <Text style={[s.hoursChipText, shortHours === h && { color: colors.primaryForeground }]}>{h}h</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>
              <Text style={s.shortBalance}>
                {balance.shortHoursRemainingThisMonth}h remaining this month
              </Text>
            </>
          )}
        </Animated.View>

        {leaveType === "medical" && durationDays > 2 && (
          <Animated.View entering={FadeInDown.duration(300)} style={s.ruleBox}>
            <Ionicons name="document-attach-outline" size={16} color={colors.accent} />
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={s.ruleText}>Medical leave longer than 2 days requires a medical certificate. Demo accepts an attachment marker; production will upload image, PDF, or document files.</Text>
              <Pressable
                style={s.attachBtn}
                onPress={() => setMedicalCertificateName(`medical-certificate-${Date.now()}.pdf`)}
              >
                <Ionicons name="cloud-upload-outline" size={16} color={colors.primaryForeground} />
                <Text style={s.attachBtnText}>{medicalCertificateName ? "Replace Certificate" : "Attach Certificate"}</Text>
              </Pressable>
              {!!medicalCertificateName && (
                <Text style={s.attachedText}>{medicalCertificateName}</Text>
              )}
            </View>
          </Animated.View>
        )}

        {/* Validation message */}
        {validationMsg && (
          <Animated.View entering={FadeInDown.duration(300)} style={s.errorBox}>
            <Ionicons name="alert-circle" size={16} color={colors.destructive} />
            <Text style={s.errorText}>{validationMsg}</Text>
          </Animated.View>
        )}

        {/* Reason */}
        <Animated.View entering={FadeInDown.delay(140).duration(400)}>
          <Text style={s.sectionLabel}>Reason for Leave</Text>
          <TextInput
            style={[s.input, s.textarea]}
            value={reason}
            onChangeText={setReason}
            placeholder="Describe the reason for your leave request..."
            placeholderTextColor={colors.mutedForeground}
            multiline
            numberOfLines={4}
          />
        </Animated.View>

        {/* Info box */}
        <Animated.View entering={FadeInDown.delay(180).duration(400)} style={s.infoBox}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.mutedForeground} />
          <Text style={s.infoText}>
            Your request will be reviewed by the correct approving officer in your reporting line.
          </Text>
        </Animated.View>

        {/* Submit */}
        <Animated.View entering={FadeInDown.delay(220).duration(400)}>
          <Pressable
            style={({ pressed }) => [s.submitBtn, { opacity: pressed ? 0.85 : 1 }]}
            onPress={handleSubmit}
          >
            <Ionicons name="paper-plane" size={18} color={colors.primaryForeground} />
            <Text style={s.submitText}>Submit Leave Request</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function BalanceCard({
  label, used, quota, unit, color, colors,
}: {
  label: string; used: number; quota: number; unit: string;
  color: string; colors: ReturnType<typeof useColors>;
}) {
  const pct = quota > 0 ? Math.min(1, used / quota) : 0;
  const remaining = Math.max(0, quota - used);
  return (
    <View style={{ flex: 1, minWidth: "47%", backgroundColor: colors.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.border, gap: 6 }}>
      <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", textTransform: "uppercase" }}>{label}</Text>
      <Text style={{ fontSize: 20, fontWeight: "700", color: remaining === 0 ? colors.destructive : colors.foreground, fontFamily: "Inter_700Bold" }}>
        {remaining}
      </Text>
      <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
        {unit} left
      </Text>
      {/* Mini bar */}
      <View style={{ height: 4, backgroundColor: colors.muted, borderRadius: 2, overflow: "hidden" }}>
        <View style={{ height: 4, width: `${pct * 100}%`, backgroundColor: pct >= 1 ? colors.destructive : color, borderRadius: 2 }} />
      </View>
      <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{used}/{quota} used</Text>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 16, paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 17, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    content: { padding: 16, gap: 20, paddingBottom: 64 },
    balanceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    sectionLabel: { fontSize: 13, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
    typeCards: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    typeCard: {
      width: "48%", backgroundColor: colors.card, borderRadius: 14, padding: 12,
      borderWidth: 1.5, borderColor: colors.border, gap: 5, alignItems: "center",
    },
    typeIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    typeLabel: { fontSize: 12, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold", textAlign: "center" },
    typeDesc: { fontSize: 10, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center" },
    exhaustedBadge: { backgroundColor: colors.destructive + "22", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    exhaustedText: { fontSize: 10, color: colors.destructive, fontFamily: "Inter_600SemiBold" },
    ruleBox: {
      flexDirection: "row", alignItems: "flex-start", gap: 8,
      backgroundColor: colors.accent + "11", borderRadius: 12, padding: 12,
      borderWidth: 1, borderColor: colors.accent + "33",
    },
    ruleText: { fontSize: 12, color: colors.accent, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 18 },
    attachBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary, borderRadius: 10, padding: 10 },
    attachBtnText: { fontSize: 13, fontWeight: "700", color: colors.primaryForeground, fontFamily: "Inter_700Bold" },
    attachedText: { fontSize: 12, color: colors.success, fontFamily: "Inter_500Medium" },
    dateRow: { flexDirection: "row", gap: 12 },
    dateField: { flex: 1, gap: 6 },
    fieldLabel: { fontSize: 12, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold" },
    input: {
      backgroundColor: colors.muted, borderRadius: 12, borderWidth: 1,
      borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular",
    },
    textarea: { minHeight: 100, textAlignVertical: "top" },
    hoursRow: { flexDirection: "row", gap: 6 },
    hoursChip: {
      flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center",
      backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
    },
    hoursChipText: { fontSize: 14, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    durationBadge: {
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: colors.primary + "11", borderRadius: 10, padding: 10, marginTop: 4,
    },
    durationText: { fontSize: 13, color: colors.primary, fontFamily: "Inter_500Medium" },
    shortBalance: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 4 },
    errorBox: {
      flexDirection: "row", alignItems: "flex-start", gap: 8,
      backgroundColor: colors.dangerLight, borderRadius: 12, padding: 12,
      borderWidth: 1, borderColor: colors.destructive + "33",
    },
    errorText: { fontSize: 13, color: colors.destructive, fontFamily: "Inter_400Regular", flex: 1 },
    infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: colors.muted, borderRadius: 12, padding: 12 },
    infoText: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 18 },
    lockedWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 28 },
    lockedTitle: { fontSize: 18, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold", textAlign: "center" },
    lockedText: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
    submitBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
      backgroundColor: colors.primary, borderRadius: 14, padding: 16,
    },
    submitText: { fontSize: 16, fontWeight: "700", color: colors.primaryForeground, fontFamily: "Inter_700Bold" },
  });
