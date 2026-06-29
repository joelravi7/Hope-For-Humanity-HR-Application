import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

const BIOMETRIC_LOGIN_KEY = "hfh_last_demo_login";

async function canUseSecureStore() {
  if (Platform.OS === "web") return false;
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

async function getSavedLogin() {
  if (await canUseSecureStore()) {
    const secured = await SecureStore.getItemAsync(BIOMETRIC_LOGIN_KEY);
    if (secured) return secured;
  }
  return AsyncStorage.getItem(BIOMETRIC_LOGIN_KEY);
}

async function saveLogin(credentials: { email: string; password: string }) {
  const value = JSON.stringify(credentials);
  if (await canUseSecureStore()) {
    await SecureStore.setItemAsync(BIOMETRIC_LOGIN_KEY, value);
    await AsyncStorage.removeItem(BIOMETRIC_LOGIN_KEY).catch(() => {});
    return;
  }
  await AsyncStorage.setItem(BIOMETRIC_LOGIN_KEY, value);
}

async function removeSavedLogin() {
  if (await canUseSecureStore()) {
    await SecureStore.deleteItemAsync(BIOMETRIC_LOGIN_KEY).catch(() => {});
  }
  await AsyncStorage.removeItem(BIOMETRIC_LOGIN_KEY).catch(() => {});
}

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useApp();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  const isLocked = attempts >= 5;

  useEffect(() => {
    const checkBiometrics = async () => {
      if (Platform.OS === "web") return;
      try {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        const savedLogin = await getSavedLogin();
        setBiometricAvailable(compatible && enrolled && !!savedLogin);
      } catch {
        setBiometricAvailable(false);
      }
    };
    checkBiometrics();
  }, []);

  const finishSuccessfulLogin = async (mustChangePassword?: boolean, credentials?: { email: string; password: string }) => {
    if (credentials) {
      await saveLogin(credentials).catch(() => {});
      setBiometricAvailable(Platform.OS !== "web");
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (mustChangePassword) {
      router.replace("/change-password");
    } else {
      router.replace("/(tabs)");
    }
  };

  const handleLogin = async () => {
    if (isLocked) return;
    if (!email.trim() || !password.trim()) {
      setError("Please fill in all fields");
      return;
    }
    setLoading(true);
    setError("");
    await new Promise((r) => setTimeout(r, 500));
    const result = await login(email.trim(), password.trim());
    setLoading(false);
    if (result.success) {
      await finishSuccessfulLogin(result.mustChangePassword, { email: email.trim(), password: password.trim() });
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      if (newAttempts >= 5) {
        setError("Too many failed attempts. Contact your admin to reset your account.");
      } else {
        setError(`Invalid credentials. ${5 - newAttempts} attempt${5 - newAttempts !== 1 ? "s" : ""} remaining.`);
      }
    }
  };

  const handleBiometricLogin = async () => {
    setError("");
    try {
      const saved = await getSavedLogin();
      if (!saved) {
        setError("Sign in once with your password to enable fingerprint login.");
        return;
      }
      const auth = await LocalAuthentication.authenticateAsync({
        promptMessage: "Use fingerprint to sign in",
        fallbackLabel: "Use password",
      });
      if (!auth.success) return;
      const credentials = JSON.parse(saved) as { email: string; password: string };
      setLoading(true);
      const result = await login(credentials.email, credentials.password);
      setLoading(false);
      if (result.success) {
        await finishSuccessfulLogin(result.mustChangePassword);
      } else {
        setError("Saved login no longer works. Please sign in with your password.");
        await removeSavedLogin();
        setBiometricAvailable(false);
      }
    } catch {
      setLoading(false);
      setError("Fingerprint login failed. Please sign in with your password.");
    }
  };

  const s = styles(colors);

  return (
    <View style={[s.root, { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 24) }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={s.flex}>
        <View style={s.inner}>
          <Animated.View entering={FadeInUp.delay(100).duration(600)} style={s.header}>
            <View style={s.logoWrap}>
              <Ionicons name="shield-checkmark" size={38} color={colors.primary} />
            </View>
            <Text style={s.appName}>Hope for Humanity</Text>
            <Text style={s.tagline}>Secure Employee Field App</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(300).duration(600)} style={s.card}>
            <Text style={s.cardTitle}>Sign In</Text>
            <Text style={s.cardSub}>Use credentials provided by your administrator</Text>

            {!!error && (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={16} color={colors.destructive} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            <View style={s.field}>
              <Text style={s.label}>Email / Employee ID</Text>
              <View style={s.inputWrap}>
                <Ionicons name="person-outline" size={18} color={colors.mutedForeground} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="employee@hopeforhumanity.org"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  returnKeyType="next"
                  editable={!isLocked}
                />
              </View>
            </View>

            <View style={s.field}>
              <Text style={s.label}>Password</Text>
              <View style={s.inputWrap}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.mutedForeground} style={s.inputIcon} />
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry={!showPw}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  editable={!isLocked}
                />
                <Pressable onPress={() => setShowPw(!showPw)} style={s.eyeBtn}>
                  <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={18} color={colors.mutedForeground} />
                </Pressable>
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [s.btn, { opacity: pressed || isLocked ? 0.7 : 1, backgroundColor: isLocked ? colors.mutedForeground : colors.primary }]}
              onPress={handleLogin}
              disabled={loading || isLocked}
            >
              {loading ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={s.btnText}>{isLocked ? "Account Locked" : "Sign In"}</Text>
              )}
            </Pressable>

            {biometricAvailable && (
              <Pressable style={s.bioBtn} onPress={handleBiometricLogin} disabled={loading}>
                <Ionicons name="finger-print" size={18} color={colors.primary} />
                <Text style={s.bioBtnText}>Sign in with Fingerprint</Text>
              </Pressable>
            )}

            <View style={s.hintBox}>
              <Text style={s.hintText}>Demo — System Admin: admin@hopeforhumanity.org / admin123</Text>
              <Text style={s.hintText}>Director: director@hopeforhumanity.org / director123</Text>
              <Text style={s.hintText}>PM: pm@hopeforhumanity.org / pm123 • PO: po@hopeforhumanity.org / po123</Text>
              <Text style={s.hintText}>PA: john@hopeforhumanity.org / emp123</Text>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(500).duration(600)} style={s.footerRow}>
            <Ionicons name="lock-closed" size={12} color={colors.mutedForeground} />
            <Text style={s.footer}>Demo data is stored locally on this device</Text>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    inner: { flex: 1, paddingHorizontal: 24, justifyContent: "center", gap: 24 },
    header: { alignItems: "center", gap: 8 },
    logoWrap: {
      width: 80, height: 80, borderRadius: 24,
      backgroundColor: colors.card, alignItems: "center", justifyContent: "center",
      borderWidth: 1, borderColor: colors.border, marginBottom: 4,
    },
    appName: { fontSize: 22, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold", textAlign: "center" },
    tagline: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    card: { backgroundColor: colors.card, borderRadius: 20, padding: 24, gap: 16, borderWidth: 1, borderColor: colors.border },
    cardTitle: { fontSize: 20, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    cardSub: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: colors.dangerLight, borderRadius: 8, padding: 12 },
    errorText: { fontSize: 13, color: colors.destructive, fontFamily: "Inter_400Regular", flex: 1 },
    field: { gap: 6 },
    label: { fontSize: 13, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold" },
    inputWrap: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: colors.muted, borderRadius: 12,
      borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14,
    },
    inputIcon: { marginRight: 8 },
    input: { flex: 1, height: 48, fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular" },
    eyeBtn: { padding: 4 },
    btn: { backgroundColor: colors.primary, borderRadius: 12, height: 50, alignItems: "center", justifyContent: "center", marginTop: 4 },
    btnText: { fontSize: 16, fontWeight: "700", color: colors.primaryForeground, fontFamily: "Inter_700Bold" },
    bioBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.primary + "55", backgroundColor: colors.primary + "11" },
    bioBtnText: { fontSize: 14, fontWeight: "700", color: colors.primary, fontFamily: "Inter_700Bold" },
    hintBox: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 4 },
    hintText: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center" },
    footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
    footer: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
  });
