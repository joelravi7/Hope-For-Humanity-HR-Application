import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

function toDateOnly(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDate(value?: string) {
  if (!value) return new Date();
  const [year, month, day] = value.split("-").map(Number);
  const parsed = year && month && day ? new Date(year, month - 1, day) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function CalendarField({
  label,
  value,
  onChange,
  placeholder = "Select date",
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const colors = useColors();
  const selected = parseDate(value);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(new Date(selected.getFullYear(), selected.getMonth(), 1));

  const days = useMemo(() => {
    const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const d = new Date(start);
      d.setDate(start.getDate() + index);
      return d;
    });
  }, [visibleMonth]);

  const moveMonth = (amount: number) => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  };

  const chooseDate = (date: Date) => {
    onChange(toDateOnly(date));
    setOpen(false);
  };

  const s = styles(colors);
  const monthTitle = visibleMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <>
      {label && <Text style={s.label}>{label}</Text>}
      <Pressable style={s.field} onPress={() => setOpen(true)}>
        <Ionicons name="calendar-outline" size={17} color={colors.primary} />
        <Text style={[s.value, !value && { color: colors.mutedForeground }]}>
          {value ? selected.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setOpen(false)}>
          <Pressable style={s.modal}>
            <View style={s.monthHeader}>
              <Pressable style={s.iconBtn} onPress={() => moveMonth(-1)}>
                <Ionicons name="chevron-back" size={20} color={colors.foreground} />
              </Pressable>
              <Text style={s.monthTitle}>{monthTitle}</Text>
              <Pressable style={s.iconBtn} onPress={() => moveMonth(1)}>
                <Ionicons name="chevron-forward" size={20} color={colors.foreground} />
              </Pressable>
            </View>

            <View style={s.weekRow}>
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <Text key={`${d}-${i}`} style={s.weekText}>{d}</Text>
              ))}
            </View>

            <View style={s.grid}>
              {days.map((day) => {
                const inMonth = day.getMonth() === visibleMonth.getMonth();
                const isSelected = value && sameDay(day, selected);
                const isToday = sameDay(day, new Date());
                return (
                  <Pressable
                    key={toDateOnly(day)}
                    style={[
                      s.dayBtn,
                      isSelected && { backgroundColor: colors.primary },
                      !isSelected && isToday && { borderColor: colors.primary },
                    ]}
                    onPress={() => chooseDate(day)}
                  >
                    <Text
                      style={[
                        s.dayText,
                        !inMonth && { color: colors.mutedForeground, opacity: 0.45 },
                        isSelected && { color: colors.primaryForeground, fontFamily: "Inter_700Bold" },
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={s.footer}>
              <Pressable style={s.footerBtn} onPress={() => chooseDate(new Date())}>
                <Text style={s.footerBtnText}>Today</Text>
              </Pressable>
              <Pressable style={[s.footerBtn, { backgroundColor: colors.muted }]} onPress={() => setOpen(false)}>
                <Text style={[s.footerBtnText, { color: colors.foreground }]}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    label: { fontSize: 12, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
    field: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      backgroundColor: colors.muted,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
    },
    value: { flex: 1, fontSize: 15, color: colors.foreground, fontFamily: "Inter_500Medium" },
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 20 },
    modal: { backgroundColor: colors.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.border },
    monthHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" },
    monthTitle: { fontSize: 17, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    weekRow: { flexDirection: "row", marginBottom: 6 },
    weekText: { flex: 1, textAlign: "center", fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_700Bold" },
    grid: { flexDirection: "row", flexWrap: "wrap" },
    dayBtn: {
      width: `${100 / 7}%`,
      aspectRatio: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "transparent",
    },
    dayText: { fontSize: 14, color: colors.foreground, fontFamily: "Inter_500Medium" },
    footer: { flexDirection: "row", gap: 10, marginTop: 12 },
    footerBtn: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12 },
    footerBtnText: { fontSize: 14, fontWeight: "700", color: colors.primaryForeground, fontFamily: "Inter_700Bold" },
  });
