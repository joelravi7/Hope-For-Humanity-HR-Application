import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

export default function ChangePasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser, changePassword } = useApp();

  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const isFirstLogin = currentUser?.mustChangePassword;

  const validate = () => {
    if (newPw.length < 8) return "Password must be at least 8 characters";
    if (!/[A-Z]/.test(newPw)) return "Include at least one uppercase letter";
    if (!/[0-9]/.test(newPw)) return "Include at least one number";
    if (newPw !== confirmPw) return "Passwords do not match";
    return null;
  };

  const handleSave = () => {
    const err = validate();
    if (err) { Alert.alert("Invalid Password", err); return; }
    changePassword(currentUser!.id, newPw);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace("/(tabs)");
  };

  const s = styles(colors);

  return (
    <View style={[s.root, { paddingTop: insets.top + 28, paddingBottom: Math.max(insets.bottom, 24) + 24 }]}>
      <Animated.View entering={FadeInDown.delay(0).duration(500)} style={s.header}>
        {!isFirstLogin && (
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </Pressable>
        )}
        <View style={s.iconWrap}>
          <Ionicons name="key" size={32} color={colors.primary} />
        </View>
        <Text style={s.title}>{isFirstLogin ? "Set New Password" : "Change Password"}</Text>
        <Text style={s.sub}>
          {isFirstLogin
            ? "Your account has a temporary password. Please set a new secure password to continue."
            : "Choose a strong password to keep your account secure."}
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(150).duration(500)} style={s.card}>
        <Text style={s.rulesTitle}>Password Requirements</Text>
        {[
          { rule: "At least 8 characters", ok: newPw.length >= 8 },
          { rule: "One uppercase letter", ok: /[A-Z]/.test(newPw) },
          { rule: "One number", ok: /[0-9]/.test(newPw) },
          { rule: "Passwords match", ok: newPw === confirmPw && confirmPw.length > 0 },
        ].map((r) => (
          <View key={r.rule} style={s.ruleRow}>
            <Ionicons name={r.ok ? "checkmark-circle" : "ellipse-outline"} size={16} color={r.ok ? colors.success : colors.mutedForeground} />
            <Text style={[s.ruleText, r.ok && { color: colors.success }]}>{r.rule}</Text>
          </View>
        ))}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(250).duration(500)} style={s.form}>
        <View style={s.field}>
          <Text style={s.label}>New Password</Text>
          <View style={s.inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.mutedForeground} style={s.icon} />
            <TextInput
              style={[s.input, { flex: 1 }]}
              value={newPw}
              onChangeText={setNewPw}
              placeholder="Enter new password"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry={!showNew}
            />
            <Pressable onPress={() => setShowNew(!showNew)}>
              <Ionicons name={showNew ? "eye-off-outline" : "eye-outline"} size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>

        <View style={s.field}>
          <Text style={s.label}>Confirm New Password</Text>
          <View style={s.inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.mutedForeground} style={s.icon} />
            <TextInput
              style={[s.input, { flex: 1 }]}
              value={confirmPw}
              onChangeText={setConfirmPw}
              placeholder="Re-enter new password"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry={!showConfirm}
            />
            <Pressable onPress={() => setShowConfirm(!showConfirm)}>
              <Ionicons name={showConfirm ? "eye-off-outline" : "eye-outline"} size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [s.btn, { opacity: pressed ? 0.85 : 1 }]}
          onPress={handleSave}
        >
          <Text style={s.btnText}>Set New Password</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 24, gap: 20 },
    header: { alignItems: "center", gap: 10 },
    backBtn: { alignSelf: "flex-start", padding: 4, marginBottom: 4 },
    iconWrap: {
      width: 72, height: 72, borderRadius: 20,
      backgroundColor: colors.primary + "22",
      alignItems: "center", justifyContent: "center",
    },
    title: { fontSize: 22, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold", textAlign: "center" },
    sub: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
    card: {
      backgroundColor: colors.card, borderRadius: 16, padding: 16,
      borderWidth: 1, borderColor: colors.border, gap: 10,
    },
    rulesTitle: { fontSize: 13, fontWeight: "700", color: colors.mutedForeground, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
    ruleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    ruleText: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    form: { gap: 14 },
    field: { gap: 6 },
    label: { fontSize: 13, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold" },
    inputWrap: {
      flexDirection: "row", alignItems: "center", gap: 8,
      backgroundColor: colors.muted, borderRadius: 12,
      borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14,
    },
    icon: { marginRight: 4 },
    input: { height: 48, fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular" },
    btn: { backgroundColor: colors.primary, borderRadius: 12, height: 50, alignItems: "center", justifyContent: "center", marginTop: 4 },
    btnText: { fontSize: 16, fontWeight: "700", color: colors.primaryForeground, fontFamily: "Inter_700Bold" },
  });
