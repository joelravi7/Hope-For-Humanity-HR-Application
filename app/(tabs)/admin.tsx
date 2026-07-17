import { Ionicons } from "@expo/vector-icons";
import { Directory, File } from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useState } from "react";
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AccountStatus,
  ANNUAL_LEAVE_QUOTA,
  AttendanceRecord,
  CASUAL_LEAVE_QUOTA,
  CheckInArrivalStatus,
  LeaveApplication,
  SHORT_LEAVE_QUOTA,
  User,
  UserRole,
  canAccessAdminPanel,
  canCreateReports,
  canManageUsers,
  canReviewLeaveApplication,
  canViewManagedActivity,
  checkInArrivalLabel,
  getLieuEligibleAttendanceDates,
  getCheckInArrivalStatus,
  isSystemAdmin,
  roleLabel,
  sriLankaPublicHolidayName,
  useApp,
} from "@/context/AppContext";
import { PROGRAM_TYPES, REGIONS } from "@/constants/labels";
import { useColors } from "@/hooks/useColors";

type AdminTab = "overview" | "staff" | "users" | "leave" | "reports" | "audit";
type ReportType =
  | "attendance-summary"
  | "daily-attendance"
  | "leave-utilization"
  | "leave-balances"
  | "staff-roster"
  | "access-control"
  | "audit-activity";
type UserFormState = {
  name: string;
  employeeId: string;
  email: string;
  phone: string;
  department: string;
  region: string;
  program: string;
  role: UserRole;
  status: AccountStatus;
  password: string;
  mustChangePassword: boolean;
};
type ReportPeriod = {
  startDate: string;
  endDate: string;
};
type ReportPdfPage = {
  user: User;
  reportText: string;
};

const USER_ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "it-admin", label: "System Admin" },
  { value: "director", label: "Director" },
  { value: "project-manager", label: "Project Manager" },
  { value: "project-officer", label: "Project Officer" },
  { value: "supervisor", label: "Supervisor" },
  { value: "project-assistant", label: "Project Assistant" },
  { value: "employee", label: "Employee" },
];

const ACCOUNT_STATUS_OPTIONS: AccountStatus[] = ["active", "suspended", "inactive"];
const REPORT_OPTIONS: { value: ReportType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "attendance-summary", label: "Attendance Summary", icon: "stats-chart-outline" },
  { value: "daily-attendance", label: "Daily Attendance", icon: "calendar-outline" },
  { value: "leave-utilization", label: "Leave Utilization", icon: "pie-chart-outline" },
  { value: "leave-balances", label: "Leave Balances", icon: "speedometer-outline" },
  { value: "staff-roster", label: "Staff Roster", icon: "people-outline" },
  { value: "access-control", label: "Access Control", icon: "key-outline" },
  { value: "audit-activity", label: "Audit Activity", icon: "receipt-outline" },
];

const BRAND_PRIMARY = "#ff7a06";
const REPORT_ACCENT_COLORS: Record<ReportType, string> = {
  "attendance-summary": BRAND_PRIMARY,
  "daily-attendance": BRAND_PRIMARY,
  "leave-utilization": BRAND_PRIMARY,
  "leave-balances": BRAND_PRIMARY,
  "staff-roster": BRAND_PRIMARY,
  "access-control": BRAND_PRIMARY,
  "audit-activity": BRAND_PRIMARY,
};

function emptyUserForm(): UserFormState {
  return {
    name: "",
    employeeId: "",
    email: "",
    phone: "",
    department: "",
    region: REGIONS[0] ?? "",
    program: PROGRAM_TYPES[0] ?? "",
    role: "project-assistant",
    status: "active",
    password: "TempPass123",
    mustChangePassword: true,
  };
}

function reportDateTime() {
  return new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseDateValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : new Date(value);
}

function dateValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function currentMonthPeriod(): ReportPeriod {
  const d = new Date();
  return {
    startDate: dateValue(new Date(d.getFullYear(), d.getMonth(), 1)),
    endDate: dateValue(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
  };
}

function normalizePeriod(period: ReportPeriod): ReportPeriod {
  if (parseDateValue(period.startDate).getTime() <= parseDateValue(period.endDate).getTime()) return period;
  return { startDate: period.endDate, endDate: period.startDate };
}

function periodLabel(period: ReportPeriod) {
  const normalized = normalizePeriod(period);
  const format = (value: string) =>
    parseDateValue(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${format(normalized.startDate)} - ${format(normalized.endDate)}`;
}

function periodFileLabel(period: ReportPeriod) {
  const normalized = normalizePeriod(period);
  return `${normalized.startDate}-to-${normalized.endDate}`;
}

function recordMinutes(record: AttendanceRecord) {
  if (!record.checkIn || !record.checkOut) return 0;
  const diff = new Date(record.checkOut).getTime() - new Date(record.checkIn).getTime();
  return Math.max(0, Math.round(diff / 60000));
}

function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function dateKey(value: string) {
  return dateValue(parseDateValue(value));
}

function periodMatches(value: string, period: ReportPeriod) {
  const normalized = normalizePeriod(period);
  const key = dateKey(value);
  return key >= normalized.startDate && key <= normalized.endDate;
}

function periodMonthValues(period: ReportPeriod) {
  const normalized = normalizePeriod(period);
  const start = parseDateValue(normalized.startDate);
  const end = parseDateValue(normalized.endDate);
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const values: string[] = [];

  while (cursor.getTime() <= end.getTime()) {
    values.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return values;
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

function reportHeader(title: string, viewer: User, period: ReportPeriod, userCount: number) {
  return [
    `Hope For Humanity HR - ${title}`,
    `Generated: ${reportDateTime()}`,
    `Prepared by: ${viewer.name} (${roleLabel(viewer.role)})`,
    `Period: ${periodLabel(period)}`,
    `Scope: ${userCount} user${userCount !== 1 ? "s" : ""}`,
    "",
  ];
}

function buildAttendanceSummaryReport(viewer: User, users: User[], records: AttendanceRecord[], period: ReportPeriod) {
  const lines = reportHeader("Attendance Summary Report", viewer, period, users.length);
  const scopedRecords = records.filter((record) => periodMatches(record.date, period));
  const recordDayKey = (record: AttendanceRecord) => `${record.userId}:${dateKey(record.date)}`;
  const attendanceDays = new Set(scopedRecords.map(recordDayKey)).size;
  const today = new Date().toDateString();
  const active = new Set(scopedRecords.filter((record) => record.checkIn && !record.checkOut && new Date(record.date).toDateString() === today).map(recordDayKey)).size;
  const complete = new Set(scopedRecords.filter((record) => record.checkIn && record.checkOut).map(recordDayKey)).size;
  const missed = new Set(scopedRecords.filter(
    (record) => record.status === "incomplete" || (record.checkIn && !record.checkOut && new Date(record.date).toDateString() !== today),
  ).map(recordDayKey)).size;
  const onTime = new Set(scopedRecords.filter((record) => arrivalStatusForRecord(record) === "on-time").map(recordDayKey)).size;
  const grace = new Set(scopedRecords.filter((record) => arrivalStatusForRecord(record) === "grace").map(recordDayKey)).size;
  const late = new Set(scopedRecords.filter((record) => arrivalStatusForRecord(record) === "late").map(recordDayKey)).size;
  const totalMinutes = scopedRecords.reduce((sum, record) => sum + recordMinutes(record), 0);

  lines.push(`Total attendance days: ${attendanceDays}`);
  lines.push(`Completed days: ${complete}`);
  lines.push(`Active days: ${active}`);
  lines.push(`Missed check-outs: ${missed}`);
  lines.push(`On-time check-ins: ${onTime}`);
  lines.push(`Grace-period check-ins: ${grace}`);
  lines.push(`Late check-ins: ${late}`);
  lines.push(`Total completed hours: ${formatMinutes(totalMinutes)}`);
  lines.push("");
  lines.push("By staff member:");

  users.forEach((user) => {
    const userRecords = scopedRecords.filter((record) => record.userId === user.id);
    const userDays = new Set(userRecords.map((record) => dateKey(record.date))).size;
    const minutes = userRecords.reduce((sum, record) => sum + recordMinutes(record), 0);
    const open = new Set(userRecords.filter((record) => record.checkIn && !record.checkOut).map((record) => dateKey(record.date))).size;
    const userGrace = new Set(userRecords.filter((record) => arrivalStatusForRecord(record) === "grace").map((record) => dateKey(record.date))).size;
    const userLate = new Set(userRecords.filter((record) => arrivalStatusForRecord(record) === "late").map((record) => dateKey(record.date))).size;
    lines.push(`- ${user.name} (${user.employeeId}): ${userDays} day${userDays !== 1 ? "s" : ""}, ${formatMinutes(minutes)}, ${open} open day${open !== 1 ? "s" : ""}, ${userGrace} grace, ${userLate} late`);
  });

  return lines.join("\n");
}

function buildDailyAttendanceReport(viewer: User, users: User[], records: AttendanceRecord[], period: ReportPeriod) {
  const lines = reportHeader("Daily Attendance Report", viewer, period, users.length);
  const activeUsers = users.filter((user) => user.status === "active");
  const scopedRecords = records.filter((record) => periodMatches(record.date, period));
  const days = Array.from(new Set(scopedRecords.map((record) => dateKey(record.date)))).sort();

  if (days.length === 0) {
    lines.push("No attendance records captured for this period.");
    return lines.join("\n");
  }

  days.forEach((day) => {
    const dayRecords = scopedRecords.filter((record) => dateKey(record.date) === day);
    const presentIds = new Set(dayRecords.filter((record) => record.checkIn).map((record) => record.userId));
    const checkedOut = dayRecords.filter((record) => record.checkOut).length;
    const absent = Math.max(0, activeUsers.length - presentIds.size);
    const onTime = dayRecords.filter((record) => arrivalStatusForRecord(record) === "on-time").length;
    const grace = dayRecords.filter((record) => arrivalStatusForRecord(record) === "grace").length;
    const late = dayRecords.filter((record) => arrivalStatusForRecord(record) === "late").length;
    lines.push(`${day}: ${presentIds.size} checked in, ${checkedOut} checked out, ${absent} absent/not recorded, ${onTime} on time, ${grace} grace, ${late} late`);
  });

  return lines.join("\n");
}

function buildLeaveUtilizationReport(viewer: User, users: User[], leaves: LeaveApplication[], period: ReportPeriod) {
  const lines = reportHeader("Leave Utilization Report", viewer, period, users.length);
  const scopedLeaves = leaves.filter((leave) => periodMatches(leave.startDate, period));
  const byStatus = ["pending", "approved", "rejected", "cancel-pending", "cancelled"].map((status) => ({
    status,
    count: scopedLeaves.filter((leave) => leave.status === status).length,
  }));
  const byType = ["casual", "annual", "short", "medical", "lieu"].map((type) => ({
    type,
    days: scopedLeaves.filter((leave) => leave.leaveType === type).reduce((sum, leave) => sum + leave.durationDays, 0),
    hours: scopedLeaves.filter((leave) => leave.leaveType === type).reduce((sum, leave) => sum + leave.durationHours, 0),
  }));

  lines.push(`Total applications: ${scopedLeaves.length}`);
  lines.push("");
  lines.push("By status:");
  byStatus.forEach((item) => lines.push(`- ${item.status}: ${item.count}`));
  lines.push("");
  lines.push("By leave type:");
  byType.forEach((item) => {
    const unit = item.type === "short" ? `${item.hours}h` : `${item.days}d`;
    lines.push(`- ${item.type}: ${unit}`);
  });
  lines.push("");
  lines.push("Recent applications:");
  scopedLeaves.slice(0, 20).forEach((leave) => {
    const applicant = users.find((user) => user.id === leave.userId);
    lines.push(`- ${applicant?.name ?? leave.userId}: ${leave.leaveType}, ${leave.status}, ${leave.startDate} to ${leave.endDate}`);
  });

  return lines.join("\n");
}

function buildLeaveBalancesReport(viewer: User, users: User[], leaves: LeaveApplication[], records: AttendanceRecord[], period: ReportPeriod) {
  const lines = reportHeader("Leave Balance Report", viewer, period, users.length);
  const normalized = normalizePeriod(period);
  const year = parseDateValue(normalized.startDate).getFullYear();
  const months = periodMonthValues(period);

  lines.push(`Annual quotas: Casual ${CASUAL_LEAVE_QUOTA}d, Annual ${ANNUAL_LEAVE_QUOTA}d, Short ${SHORT_LEAVE_QUOTA}h/month`);
  lines.push("Lieu Leave: earned monthly from completed 5+ hour workdays on Saturdays, Sundays, or Sri Lankan public holidays.");
  lines.push("");

  users.forEach((user) => {
    const quotaHolding = leaves.filter(
      (leave) => leave.userId === user.id && ["pending", "approved", "cancel-pending"].includes(leave.status),
    );
    const casualUsed = quotaHolding
      .filter((leave) => leave.leaveType === "casual" && new Date(leave.startDate).getFullYear() === year)
      .reduce((sum, leave) => sum + leave.durationDays, 0);
    const annualUsed = quotaHolding
      .filter((leave) => leave.leaveType === "annual" && new Date(leave.startDate).getFullYear() === year)
      .reduce((sum, leave) => sum + leave.durationDays, 0);
    const shortUsed = quotaHolding
      .filter((leave) => leave.leaveType === "short" && periodMatches(leave.startDate, period))
      .reduce((sum, leave) => sum + leave.durationHours, 0);
    const medicalUsed = quotaHolding
      .filter((leave) => leave.leaveType === "medical" && new Date(leave.startDate).getFullYear() === year)
      .reduce((sum, leave) => sum + leave.durationDays, 0);
    const lieuEarned = months.reduce((sum, month) => sum + getLieuEligibleAttendanceDates(user.id, month, records).length, 0);
    const lieuUsed = quotaHolding
      .filter((leave) => leave.leaveType === "lieu" && periodMatches(leave.startDate, period))
      .reduce((sum, leave) => sum + leave.durationDays, 0);

    lines.push(
      `- ${user.name} (${user.employeeId}): casual ${casualUsed}/${CASUAL_LEAVE_QUOTA}, annual ${annualUsed}/${ANNUAL_LEAVE_QUOTA}, short ${shortUsed}/${SHORT_LEAVE_QUOTA}h, lieu ${lieuUsed}/${lieuEarned}d, medical ${medicalUsed}d`,
    );
  });

  return lines.join("\n");
}

function buildStaffRosterReport(viewer: User, users: User[], period: ReportPeriod) {
  const lines = reportHeader("Staff Roster Report", viewer, period, users.length);
  const byRole = USER_ROLE_OPTIONS.map((role) => ({
    label: role.label,
    count: users.filter((user) => user.role === role.value).length,
  }));

  lines.push("Role distribution:");
  byRole.forEach((item) => lines.push(`- ${item.label}: ${item.count}`));
  lines.push("");
  lines.push("Staff roster:");
  users.forEach((user) => {
    lines.push(`- ${user.name} (${user.employeeId}) | ${roleLabel(user.role)} | ${user.department ?? "No department"} | ${user.region ?? "No region"} | ${user.program ?? "No program"} | ${user.status}`);
  });

  return lines.join("\n");
}

function buildAccessControlReport(viewer: User, users: User[], period: ReportPeriod) {
  const lines = reportHeader("Access Control Report", viewer, period, users.length);
  const active = users.filter((user) => user.status === "active").length;
  const suspended = users.filter((user) => user.status === "suspended").length;
  const inactive = users.filter((user) => user.status === "inactive").length;
  const passwordChanges = users.filter((user) => user.mustChangePassword).length;

  lines.push(`Active accounts: ${active}`);
  lines.push(`Suspended accounts: ${suspended}`);
  lines.push(`Inactive accounts: ${inactive}`);
  lines.push(`Password change required: ${passwordChanges}`);
  lines.push("");
  lines.push("Access list:");
  users.forEach((user) => {
    lines.push(`- ${user.name} (${user.employeeId}) | ${user.email} | ${roleLabel(user.role)} | ${user.status}${user.mustChangePassword ? " | password change required" : ""}`);
  });

  return lines.join("\n");
}

function buildAuditActivityReport(viewer: User, logs: { userId: string; actionType: string; timestamp: string; note?: string; targetId?: string }[], users: User[], period: ReportPeriod) {
  const lines = reportHeader("Audit Activity Report", viewer, period, users.length);
  const scopedLogs = logs.filter((log) => periodMatches(log.timestamp, period));
  const actionTypes = Array.from(new Set(scopedLogs.map((log) => log.actionType))).sort();

  lines.push(`Total audit entries: ${scopedLogs.length}`);
  lines.push("");
  lines.push("By action type:");
  actionTypes.forEach((actionType) => {
    lines.push(`- ${actionType}: ${scopedLogs.filter((log) => log.actionType === actionType).length}`);
  });
  lines.push("");
  lines.push("Recent activity:");
  scopedLogs.slice(0, 30).forEach((log) => {
    const actor = users.find((user) => user.id === log.userId);
    lines.push(`- ${new Date(log.timestamp).toLocaleString()}: ${actor?.name ?? log.userId} ${log.actionType}${log.targetId ? ` (${log.targetId})` : ""}${log.note ? ` - ${log.note}` : ""}`);
  });

  return lines.join("\n");
}

function buildReport({
  type,
  viewer,
  users,
  records,
  leaves,
  logs,
  period,
}: {
  type: ReportType;
  viewer: User;
  users: User[];
  records: AttendanceRecord[];
  leaves: LeaveApplication[];
  logs: { userId: string; actionType: string; timestamp: string; note?: string; targetId?: string }[];
  period: ReportPeriod;
}) {
  switch (type) {
    case "attendance-summary":
      return buildAttendanceSummaryReport(viewer, users, records, period);
    case "daily-attendance":
      return buildDailyAttendanceReport(viewer, users, records, period);
    case "leave-utilization":
      return buildLeaveUtilizationReport(viewer, users, leaves, period);
    case "leave-balances":
      return buildLeaveBalancesReport(viewer, users, leaves, records, period);
    case "staff-roster":
      return buildStaffRosterReport(viewer, users, period);
    case "access-control":
      return buildAccessControlReport(viewer, users, period);
    case "audit-activity":
      return buildAuditActivityReport(viewer, logs, users, period);
    default:
      return buildAttendanceSummaryReport(viewer, users, records, period);
  }
}

function escapeHtml(value: string | number | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function reportFileName(label: string, period: ReportPeriod, scope: string) {
  const clean = `${label}-${periodFileLabel(period)}-${scope}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return `${clean || "hfh-hr-report"}.pdf`;
}

function datedPdfFileName(fileName: string) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  return fileName.replace(/\.pdf$/i, `-${stamp}.pdf`);
}

function parseReportBody(reportText: string) {
  const bodyLines = reportText.split("\n").slice(6);
  const metrics: { label: string; value: string }[] = [];
  const sections: { title: string; rows: string[] }[] = [];
  let activeSection: { title: string; rows: string[] } | null = null;
  let seenSection = false;

  bodyLines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    if (line.endsWith(":")) {
      activeSection = { title: line.slice(0, -1), rows: [] };
      sections.push(activeSection);
      seenSection = true;
      return;
    }

    const metricMatch = line.match(/^([^:]{1,42}):\s+(.+)$/);
    const isDailyLine = /^\d{4}-\d{2}-\d{2}:/.test(line);
    if (!seenSection && metricMatch && !isDailyLine && metrics.length < 8) {
      metrics.push({ label: metricMatch[1], value: metricMatch[2] });
      return;
    }

    if (!activeSection) {
      activeSection = { title: "Details", rows: [] };
      sections.push(activeSection);
    }
    activeSection.rows.push(line);
  });

  return { metrics, sections: sections.filter((section) => section.rows.length > 0) };
}

function renderReportRows(rows: string[]) {
  return rows
    .map((line) => {
      const cleanLine = line.startsWith("- ") ? line.slice(2) : line;
      const columns = cleanLine.split("|").map((part) => part.trim()).filter(Boolean);
      if (columns.length > 1) {
        return `<div class="table-row">${columns.map((column) => `<span>${escapeHtml(column)}</span>`).join("")}</div>`;
      }

      const labelValue = cleanLine.match(/^([^:]{1,48}):\s+(.+)$/);
      if (labelValue) {
        return `<div class="detail-row"><span>${escapeHtml(labelValue[1])}</span><strong>${escapeHtml(labelValue[2])}</strong></div>`;
      }

      return `<div class="detail-card">${escapeHtml(cleanLine)}</div>`;
    })
    .join("");
}

function buildUserReportPdfPages({
  type,
  viewer,
  users,
  records,
  leaves,
  logs,
  period,
}: {
  type: ReportType;
  viewer: User;
  users: User[];
  records: AttendanceRecord[];
  leaves: LeaveApplication[];
  logs: { userId: string; actionType: string; timestamp: string; note?: string; targetId?: string }[];
  period: ReportPeriod;
}): ReportPdfPage[] {
  return users.map((user) => ({
    user,
    reportText: buildReport({
      type,
      viewer,
      users: [user],
      records: records.filter((record) => record.userId === user.id),
      leaves: leaves.filter((leave) => leave.userId === user.id),
      logs: logs.filter((log) => log.userId === user.id || log.targetId === user.id),
      period,
    }),
  }));
}

function renderReportPdfPage({
  title,
  viewer,
  period,
  page,
  pageNumber,
  totalPages,
}: {
  title: string;
  viewer: User;
  period: ReportPeriod;
  page: ReportPdfPage;
  pageNumber: number;
  totalPages: number;
}) {
  const { metrics, sections } = parseReportBody(page.reportText);
  const metricHtml = metrics.length
    ? `<div class="metrics">${metrics.map((item) => `<div class="metric"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`).join("")}</div>`
    : "";
  const sectionsHtml = sections.length
    ? sections.map((section) => `<section><h2>${escapeHtml(section.title)}</h2><div class="section-body">${renderReportRows(section.rows)}</div></section>`).join("")
    : `<section><h2>Report Details</h2><div class="section-body">${renderReportRows(page.reportText.split("\n").slice(6).filter(Boolean))}</div></section>`;
  const scopeLabel = `${page.user.name} (${page.user.employeeId})`;

  return `<main class="page">
    <header class="hero">
      <div class="brand">Hope For Humanity HR</div>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(periodLabel(period))} individual report for ${escapeHtml(scopeLabel)}.</p>
    </header>
    <div class="content">
      <div class="profile">
        <div>
          <span>Employee</span>
          <strong>${escapeHtml(page.user.name)}</strong>
          <small>${escapeHtml(page.user.employeeId)} • ${escapeHtml(roleLabel(page.user.role))}</small>
        </div>
        <div>
          <span>Department</span>
          <strong>${escapeHtml(page.user.department ?? "No department")}</strong>
          <small>${escapeHtml(page.user.region ?? "No region")} • ${escapeHtml(page.user.program ?? "No program")}</small>
        </div>
      </div>
      <div class="meta-grid">
        <div class="meta"><span>Generated</span><strong>${escapeHtml(reportDateTime())}</strong></div>
        <div class="meta"><span>Prepared By</span><strong>${escapeHtml(`${viewer.name} (${roleLabel(viewer.role)})`)}</strong></div>
        <div class="meta"><span>Period</span><strong>${escapeHtml(periodLabel(period))}</strong></div>
        <div class="meta"><span>Page</span><strong>${pageNumber} of ${totalPages}</strong></div>
      </div>
      ${metricHtml}
      ${sectionsHtml}
      <div class="footer">Generated by Hope For Humanity HR Mobile</div>
    </div>
  </main>`;
}

function buildReportPdfHtml({
  type,
  viewer,
  period,
  pages,
}: {
  type: ReportType;
  viewer: User;
  period: ReportPeriod;
  pages: ReportPdfPage[];
}) {
  const option = REPORT_OPTIONS.find((item) => item.value === type);
  const title = option?.label ?? "HR Report";
  const accent = REPORT_ACCENT_COLORS[type];
  const pageHtml = pages.length
    ? pages.map((page, index) => renderReportPdfPage({ title, viewer, period, page, pageNumber: index + 1, totalPages: pages.length })).join("")
    : `<main class="page"><div class="content"><section><h2>No Users</h2><div class="detail-card">No users are available in this report scope.</div></section></div></main>`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { margin: 32px; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #f3f6fb;
      color: #172033;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      font-size: 12px;
      line-height: 1.5;
    }
    .page {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 18px;
      overflow: hidden;
      min-height: 100vh;
      break-after: page;
      page-break-after: always;
    }
    .page:last-child {
      break-after: auto;
      page-break-after: auto;
    }
    .hero {
      background: linear-gradient(135deg, ${accent}, #172033);
      color: #ffffff;
      padding: 30px 34px;
    }
    .brand {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 1.4px;
      opacity: 0.86;
      text-transform: uppercase;
    }
    h1 {
      margin: 12px 0 8px;
      font-size: 30px;
      line-height: 1.1;
      letter-spacing: 0;
    }
    .hero p {
      margin: 0;
      opacity: 0.9;
      font-size: 13px;
    }
    .content {
      padding: 26px 34px 34px;
    }
    .profile {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 18px;
    }
    .profile > div {
      border: 1px solid #e5eaf2;
      border-radius: 14px;
      padding: 14px 16px;
      background: #ffffff;
      box-shadow: 0 8px 22px rgba(15, 23, 42, 0.04);
    }
    .profile span {
      display: block;
      color: #64748b;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.7px;
      margin-bottom: 5px;
      text-transform: uppercase;
    }
    .profile strong {
      display: block;
      color: #172033;
      font-size: 16px;
      font-weight: 850;
    }
    .profile small {
      display: block;
      color: #64748b;
      font-size: 11px;
      margin-top: 3px;
    }
    .meta-grid, .metrics {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 18px;
    }
    .meta, .metric {
      border: 1px solid #e5eaf2;
      background: #f8fafc;
      border-radius: 12px;
      padding: 12px 14px;
      break-inside: avoid;
    }
    .meta span, .metric span {
      display: block;
      color: #64748b;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.7px;
      margin-bottom: 4px;
      text-transform: uppercase;
    }
    .meta strong, .metric strong {
      color: #172033;
      font-size: 13px;
      font-weight: 800;
    }
    .metric strong {
      color: ${accent};
      font-size: 18px;
      line-height: 1.2;
    }
    section {
      margin-top: 18px;
      break-inside: avoid;
    }
    h2 {
      color: #172033;
      font-size: 15px;
      margin: 0 0 9px;
      letter-spacing: 0;
    }
    .section-body {
      display: grid;
      gap: 7px;
    }
    .detail-card, .detail-row, .table-row {
      border: 1px solid #e5eaf2;
      border-left: 4px solid ${accent};
      border-radius: 10px;
      padding: 9px 11px;
      background: #ffffff;
      break-inside: avoid;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
    }
    .detail-row span {
      color: #64748b;
      font-weight: 700;
    }
    .detail-row strong {
      color: #172033;
      text-align: right;
    }
    .table-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(105px, 1fr));
      gap: 8px;
    }
    .table-row span {
      color: #243047;
      font-weight: 650;
    }
    .footer {
      color: #94a3b8;
      font-size: 10px;
      margin-top: 22px;
      text-align: center;
    }
  </style>
</head>
<body>
  ${pageHtml}
</body>
</html>`;
}

export default function AdminScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    users,
    attendanceRecords,
    auditLogs,
    createUser,
    deleteUser,
    updateUser,
    reviewLeave,
    reviewLeaveCancellation,
    getAllLeaveApplications,
  } = useApp();
  const [tab, setTab] = useState<AdminTab>("overview");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newUser, setNewUser] = useState<UserFormState>(() => emptyUserForm());
  const [reportType, setReportType] = useState<ReportType>("attendance-summary");
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>(() => currentMonthPeriod());
  const [reportUserId, setReportUserId] = useState("all");
  const [reportPdfAction, setReportPdfAction] = useState<"share" | "save" | null>(null);

  if (!canAccessAdminPanel(currentUser?.role) || !currentUser) {
    return <Locked colors={colors} />;
  }

  const userManagementAllowed = canManageUsers(currentUser.role);
  const reportsAllowed = canCreateReports(currentUser.role);
  const leaveReviewAllowed = !isSystemAdmin(currentUser.role);
  const allLeaves = getAllLeaveApplications();
  const manageableUsers = users.filter((u) => u.status === "active" && canViewManagedActivity(currentUser.role, u, currentUser.id));
  const availableReportUsers = isSystemAdmin(currentUser.role)
    ? users
    : users.filter((u) => canViewManagedActivity(currentUser.role, u, currentUser.id));
  const safeReportUserId = reportUserId === "all" || availableReportUsers.some((user) => user.id === reportUserId) ? reportUserId : "all";
  const reportUsers = safeReportUserId === "all"
    ? availableReportUsers
    : availableReportUsers.filter((user) => user.id === safeReportUserId);
  const selectedReportUser = availableReportUsers.find((user) => user.id === safeReportUserId);
  const reportScopeLabel = selectedReportUser ? `${selectedReportUser.name} (${selectedReportUser.employeeId})` : "All scoped users";
  const reportUserIds = new Set(reportUsers.map((user) => user.id));
  const reportAttendanceRecords = attendanceRecords.filter((record) => reportUserIds.has(record.userId));
  const reportLeaves = allLeaves.filter((leave) => reportUserIds.has(leave.userId));
  const manageableUserIds = new Set(manageableUsers.map((u) => u.id));
  const today = new Date().toDateString();
  const checkedInToday = attendanceRecords.filter((r) => manageableUserIds.has(r.userId) && new Date(r.date).toDateString() === today && r.checkIn && !r.checkOut);
  const checkedOutToday = attendanceRecords.filter((r) => manageableUserIds.has(r.userId) && new Date(r.date).toDateString() === today && r.checkOut);
  const lateToday = attendanceRecords.filter((r) => manageableUserIds.has(r.userId) && new Date(r.date).toDateString() === today && arrivalStatusForRecord(r) === "late");
  const notCheckedIn = manageableUsers.filter((u) => !attendanceRecords.find((r) => r.userId === u.id && new Date(r.date).toDateString() === today));
  const visibleLeaves = leaveReviewAllowed
    ? allLeaves.filter((leave) => {
        const applicant = users.find((u) => u.id === leave.userId);
        return canReviewLeaveApplication(currentUser.role, applicant, currentUser.id);
      })
    : [];
  const pendingLeaveActions = visibleLeaves.filter((leave) => leave.status === "pending" || leave.status === "cancel-pending");
  const visibleAuditLogs = isSystemAdmin(currentUser.role)
    ? auditLogs
    : auditLogs.filter((log) => log.actionType.includes("leave") || log.actionType.includes("check") || log.actionType.includes("user") || log.actionType === "password-change");
  const reportAuditLogs = visibleAuditLogs.filter((log) => isSystemAdmin(currentUser.role) || reportUserIds.has(log.userId) || (log.targetId ? reportUserIds.has(log.targetId) : false));
  const reportText = buildReport({
    type: reportType,
    viewer: currentUser,
    users: reportUsers,
    records: reportAttendanceRecords,
    leaves: reportLeaves,
    logs: reportAuditLogs,
    period: reportPeriod,
  });
  const s = styles(colors);

  const handleCreateUser = () => {
    if (!newUser.name.trim() || !newUser.employeeId.trim() || !newUser.email.trim() || !newUser.password.trim()) {
      Alert.alert("Missing Details", "Name, employee ID, email, and temporary password are required.");
      return;
    }

    const result = createUser({
      employeeId: newUser.employeeId.trim(),
      name: newUser.name.trim(),
      email: newUser.email.trim().toLowerCase(),
      phone: newUser.phone.trim() || undefined,
      department: newUser.department.trim() || undefined,
      region: newUser.region || undefined,
      program: newUser.program || undefined,
      role: newUser.role,
      status: newUser.status,
      password: newUser.password,
      mustChangePassword: newUser.mustChangePassword,
    });

    if (!result.success) {
      Alert.alert("Cannot Create User", result.error ?? "Please check the user details.");
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setNewUser(emptyUserForm());
    setCreateModalOpen(false);
    setTab("users");
  };

  const createReportPdf = async () => {
    const reportLabel = REPORT_OPTIONS.find((option) => option.value === reportType)?.label ?? "HR Report";
    const fileName = reportFileName(reportLabel, reportPeriod, reportScopeLabel);
    const pages = buildUserReportPdfPages({
      type: reportType,
      viewer: currentUser,
      users: reportUsers,
      records: reportAttendanceRecords,
      leaves: reportLeaves,
      logs: reportAuditLogs,
      period: reportPeriod,
    });
    const html = buildReportPdfHtml({
      type: reportType,
      viewer: currentUser,
      period: reportPeriod,
      pages,
    });

    const { uri } = await Print.printToFileAsync({
      html,
      width: 612,
      height: 792,
      margins: { top: 24, right: 24, bottom: 24, left: 24 },
    });

    return { uri, fileName, reportLabel };
  };

  const handleShareReportPdf = async () => {
    if (reportPdfAction) return;
    setReportPdfAction("share");

    try {
      const { uri, fileName } = await createReportPdf();

      if (Platform.OS === "web") {
        await Print.printAsync({ uri });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }

      const sharingAvailable = await Sharing.isAvailableAsync();
      if (!sharingAvailable) {
        Alert.alert("PDF Created", `${fileName} was created at ${uri}`);
        return;
      }

      await Sharing.shareAsync(uri, {
        dialogTitle: `Download ${fileName}`,
        mimeType: "application/pdf",
        UTI: ".pdf",
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Unable to Generate PDF", "The report PDF could not be created on this device.");
    } finally {
      setReportPdfAction(null);
    }
  };

  const handleSaveReportPdf = async () => {
    if (reportPdfAction) return;
    setReportPdfAction("save");

    try {
      const { uri, fileName } = await createReportPdf();
      const saveFileName = datedPdfFileName(fileName);

      if (Platform.OS === "web") {
        await Print.printAsync({ uri });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }

      const directory = await Directory.pickDirectoryAsync();
      const source = new File(uri);
      const target = directory.createFile(saveFileName, "application/pdf");
      target.write(await source.bytes());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("PDF Saved", `${saveFileName} was saved to the selected folder.`);
    } catch {
      Alert.alert("Unable to Save PDF", "Choose a folder and try again.");
    } finally {
      setReportPdfAction(null);
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top + 28 }]}>
      <View style={s.header}>
        <View>
          <Text style={s.pageTitle}>HR Management</Text>
          <Text style={s.pageSub}>Staff attendance, location, leave, users, and audit</Text>
        </View>
        {pendingLeaveActions.length > 0 && (
          <View style={s.pendingBadge}>
            <Text style={s.pendingBadgeText}>{pendingLeaveActions.length}</Text>
          </View>
        )}
      </View>

      <View style={s.tabRow}>
        {([
          { key: "overview", label: "Overview" },
          { key: "staff", label: `Staff${checkedInToday.length ? ` (${checkedInToday.length})` : ""}` },
          ...(userManagementAllowed ? [{ key: "users", label: "Users" }] : []),
          ...(leaveReviewAllowed ? [{ key: "leave", label: `Leave${pendingLeaveActions.length ? ` (${pendingLeaveActions.length})` : ""}` }] : []),
          ...(reportsAllowed ? [{ key: "reports", label: "Reports" }] : []),
          { key: "audit", label: "Audit" },
        ] as { key: AdminTab; label: string }[]).map((item) => (
          <Pressable key={item.key} style={[s.tabBtn, tab === item.key && { backgroundColor: colors.primary }]} onPress={() => setTab(item.key)}>
            <Text style={[s.tabText, tab === item.key && { color: colors.primaryForeground }]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom, 24) + 140 }]} showsVerticalScrollIndicator={false}>
        {tab === "overview" && (
          <View style={s.grid}>
            <StatBlock icon="people" label="Managed Staff" value={manageableUsers.length} color={colors.primary} colors={colors} />
            <StatBlock icon="radio-button-on" label="On Duty" value={checkedInToday.length} color={colors.success} colors={colors} />
            <StatBlock icon="log-out" label="Checked Out" value={checkedOutToday.length} color={colors.accent} colors={colors} />
            <StatBlock icon="warning" label="Late Today" value={lateToday.length} color={lateToday.length ? colors.destructive : colors.mutedForeground} colors={colors} />
            <StatBlock icon="radio-button-off" label="Not Checked In" value={notCheckedIn.length} color={colors.mutedForeground} colors={colors} />
            <StatBlock icon="calendar" label="Leave Reviews" value={pendingLeaveActions.length} color={pendingLeaveActions.length ? colors.warning : colors.mutedForeground} colors={colors} />
          </View>
        )}

        {tab === "staff" && <StaffList colors={colors} users={manageableUsers} attendanceRecords={attendanceRecords} />}

        {tab === "users" && userManagementAllowed && (
          <UsersList
            colors={colors}
            users={users}
            currentUserId={currentUser.id}
            onCreate={() => setCreateModalOpen(true)}
            onUpdateUser={updateUser}
            onToggleStatus={(u) => {
              const status: AccountStatus = u.status === "active" ? "suspended" : "active";
              updateUser(u.id, { status });
            }}
            onDelete={(id) => {
              Alert.alert("Delete User", "This cannot be undone. Proceed?", [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: () => deleteUser(id) },
              ]);
            }}
          />
        )}

        {tab === "leave" && (
          <LeaveList
            colors={colors}
            leaves={visibleLeaves}
            users={users}
            onReview={(id, status) => {
              const result = reviewLeave(id, status, currentUser.id);
              if (!result.success) {
                Alert.alert("Cannot Review Leave", result.error ?? "This request could not be reviewed.");
                return;
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }}
            onReviewCancel={(id, status) => {
              reviewLeaveCancellation(id, status, currentUser.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }}
          />
        )}

        {tab === "reports" && reportsAllowed && (
          <ReportsPanel
            colors={colors}
            reportType={reportType}
            reportPeriod={reportPeriod}
            reportText={reportText}
            reportUsers={availableReportUsers}
            selectedUserId={safeReportUserId}
            userCount={reportUsers.length}
            pdfAction={reportPdfAction}
            onSelectReport={setReportType}
            onChangePeriod={setReportPeriod}
            onSelectUser={setReportUserId}
            onSharePdf={handleShareReportPdf}
            onSavePdf={handleSaveReportPdf}
          />
        )}

        {tab === "audit" && <AuditList colors={colors} logs={visibleAuditLogs} users={users} />}
      </ScrollView>

      <CreateUserModal
        colors={colors}
        visible={createModalOpen}
        value={newUser}
        onChange={setNewUser}
        onClose={() => setCreateModalOpen(false)}
        onSubmit={handleCreateUser}
      />
    </View>
  );
}

function Locked({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles(colors).root, { alignItems: "center", justifyContent: "center" }]}>
      <Ionicons name="lock-closed" size={48} color={colors.mutedForeground} />
      <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 12 }}>HR management access required</Text>
    </View>
  );
}

function StatBlock({ icon, label, value, color, colors }: { icon: any; label: string; value: number; color: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles(colors).statBlock}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: color + "22", alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles(colors).statValue}>{value}</Text>
      <Text style={styles(colors).statLabel}>{label}</Text>
    </View>
  );
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "-";
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function openMaps(lat?: number, lng?: number) {
  if (typeof lat !== "number" || typeof lng !== "number") {
    Alert.alert("Location Unavailable", "No coordinates were captured.");
    return;
  }
  Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`).catch(() => {
    Alert.alert("Unable to Open Maps", "Please check that this device can open Google Maps links.");
  });
}

function StaffList({ colors, users, attendanceRecords }: { colors: ReturnType<typeof useColors>; users: User[]; attendanceRecords: AttendanceRecord[] }) {
  const s = styles(colors);
  const today = new Date().toDateString();
  return (
    <View style={{ gap: 10 }}>
      {users.map((user) => {
        const records = attendanceRecords.filter((record) => record.userId === user.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const todayRecord = records.find((record) => new Date(record.date).toDateString() === today);
        const activeRecord = records.find((record) => record.checkIn && !record.checkOut);
        const latestLog = activeRecord?.locationLogs.slice().sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())[0];
        const lat = latestLog?.latitude ?? activeRecord?.checkInLat ?? todayRecord?.checkInLat;
        const lng = latestLog?.longitude ?? activeRecord?.checkInLng ?? todayRecord?.checkInLng;
        const todayArrivalStatus = arrivalStatusForRecord(todayRecord);
        const todayArrivalColor = arrivalMarkerColor(todayArrivalStatus, colors);
        return (
          <View key={user.id} style={s.stackCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={[s.dot, { backgroundColor: todayRecord?.checkIn ? todayArrivalColor : colors.mutedForeground }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>{user.name}</Text>
                <Text style={s.cardSub}>{roleLabel(user.role)} • {user.employeeId}</Text>
              </View>
            </View>
            <View style={s.twoCol}>
              <Text style={[s.bodyText, todayRecord?.checkIn && { color: todayArrivalColor }]}>
                In: {formatTime(todayRecord?.checkIn)}{todayRecord?.checkIn ? ` • ${checkInArrivalLabel(todayArrivalStatus)}` : ""}
              </Text>
              <Text style={s.bodyText}>Out: {formatTime(todayRecord?.checkOut)}</Text>
            </View>
            <Pressable style={s.locationBtn} onPress={() => openMaps(lat, lng)}>
              <Ionicons name="location-outline" size={14} color={colors.primary} />
              <Text style={s.locationText}>{typeof lat === "number" && typeof lng === "number" ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : "No location captured"}</Text>
            </Pressable>
            {records.slice(0, 3).map((record) => {
              const arrivalStatus = arrivalStatusForRecord(record);
              const arrivalColor = arrivalMarkerColor(arrivalStatus, colors);
              return (
                <Text key={record.id} style={[s.cardSub, record.checkIn && { color: arrivalColor }]}>
                  {formatDate(record.date)} • {formatTime(record.checkIn)} to {formatTime(record.checkOut)} • {record.totalHours ?? "open"} • {checkInArrivalLabel(arrivalStatus)}
                </Text>
              );
            })}
          </View>
        );
      })}
      {users.length === 0 && <Text style={s.emptyText}>No managed staff to show.</Text>}
    </View>
  );
}

function UsersList({ colors, users, currentUserId, onCreate, onUpdateUser, onToggleStatus, onDelete }: {
  colors: ReturnType<typeof useColors>;
  users: User[];
  currentUserId: string;
  onCreate: () => void;
  onUpdateUser: (id: string, data: Partial<User>) => void;
  onToggleStatus: (user: User) => void;
  onDelete: (id: string) => void;
}) {
  const s = styles(colors);
  const resetPassword = (user: User) => {
    const tempPassword = `Temp${Math.floor(100000 + Math.random() * 900000)}Aa`;
    onUpdateUser(user.id, { password: tempPassword, mustChangePassword: true });
    Alert.alert("Temporary Password Set", `${user.name}'s temporary password is ${tempPassword}`);
  };

  return (
    <View style={{ gap: 10 }}>
      <Pressable style={s.primaryActionBtn} onPress={onCreate}>
        <Ionicons name="person-add-outline" size={17} color={colors.primaryForeground} />
        <Text style={s.primaryActionText}>Create New User</Text>
      </Pressable>

      {users.map((user) => (
        <View key={user.id} style={s.stackCard}>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>{user.name}</Text>
              <Text style={s.cardSub}>{roleLabel(user.role)} • {user.employeeId}</Text>
              <Text style={s.cardSub}>{user.email}</Text>
              <Text style={[s.cardSub, { textTransform: "capitalize" }]}>Status: {user.status}{user.mustChangePassword ? " • Password reset required" : ""}</Text>
            </View>
            {user.id !== currentUserId && (
              <View style={{ gap: 8 }}>
                <Pressable style={s.smallBtn} onPress={() => onToggleStatus(user)}>
                  <Text style={s.smallBtnText}>{user.status === "active" ? "Suspend" : "Activate"}</Text>
                </Pressable>
                <Pressable style={[s.smallBtn, { borderColor: colors.destructive + "66" }]} onPress={() => onDelete(user.id)}>
                  <Text style={[s.smallBtnText, { color: colors.destructive }]}>Delete</Text>
                </Pressable>
              </View>
            )}
          </View>

          {user.id !== currentUserId && (
            <View style={{ gap: 10 }}>
              <Text style={s.controlLabel}>Role</Text>
              <View style={s.chipWrap}>
                {USER_ROLE_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    style={[s.controlChip, user.role === option.value && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={() => onUpdateUser(user.id, { role: option.value })}
                  >
                    <Text style={[s.controlChipText, user.role === option.value && { color: colors.primaryForeground }]}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={s.controlLabel}>Account Status</Text>
              <View style={s.chipWrap}>
                {ACCOUNT_STATUS_OPTIONS.map((status) => (
                  <Pressable
                    key={status}
                    style={[s.controlChip, user.status === status && { backgroundColor: colors.accent, borderColor: colors.accent }]}
                    onPress={() => onUpdateUser(user.id, { status })}
                  >
                    <Text style={[s.controlChipText, user.status === status && { color: colors.accentForeground }]}>{status}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={s.actionRow}>
                <Pressable style={s.secondaryActionBtn} onPress={() => onUpdateUser(user.id, { mustChangePassword: true })}>
                  <Text style={s.secondaryActionText}>Force Password Change</Text>
                </Pressable>
                <Pressable style={s.secondaryActionBtn} onPress={() => resetPassword(user)}>
                  <Text style={s.secondaryActionText}>Reset Temp Password</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

function CreateUserModal({
  colors,
  visible,
  value,
  onChange,
  onClose,
  onSubmit,
}: {
  colors: ReturnType<typeof useColors>;
  visible: boolean;
  value: UserFormState;
  onChange: (value: UserFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const s = styles(colors);
  const setField = <K extends keyof UserFormState>(key: K, fieldValue: UserFormState[K]) => {
    onChange({ ...value, [key]: fieldValue });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.modalSheet}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Create User</Text>
            <Pressable style={s.iconOnlyBtn} onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.foreground} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
            <FormInput label="Name" value={value.name} onChangeText={(text) => setField("name", text)} colors={colors} />
            <FormInput label="Employee ID" value={value.employeeId} onChangeText={(text) => setField("employeeId", text)} colors={colors} autoCapitalize="characters" />
            <FormInput label="Email" value={value.email} onChangeText={(text) => setField("email", text)} colors={colors} autoCapitalize="none" keyboardType="email-address" />
            <FormInput label="Phone" value={value.phone} onChangeText={(text) => setField("phone", text)} colors={colors} keyboardType="phone-pad" />
            <FormInput label="Department" value={value.department} onChangeText={(text) => setField("department", text)} colors={colors} />
            <FormInput label="Temporary Password" value={value.password} onChangeText={(text) => setField("password", text)} colors={colors} />

            <Text style={s.controlLabel}>Role</Text>
            <View style={s.chipWrap}>
              {USER_ROLE_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  style={[s.controlChip, value.role === option.value && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => setField("role", option.value)}
                >
                  <Text style={[s.controlChipText, value.role === option.value && { color: colors.primaryForeground }]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={s.controlLabel}>Region</Text>
            <View style={s.chipWrap}>
              {REGIONS.map((region) => (
                <Pressable
                  key={region}
                  style={[s.controlChip, value.region === region && { backgroundColor: colors.accent, borderColor: colors.accent }]}
                  onPress={() => setField("region", region)}
                >
                  <Text style={[s.controlChipText, value.region === region && { color: colors.accentForeground }]}>{region}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={s.controlLabel}>Program</Text>
            <View style={s.chipWrap}>
              {PROGRAM_TYPES.map((program) => (
                <Pressable
                  key={program}
                  style={[s.controlChip, value.program === program && { backgroundColor: colors.accent, borderColor: colors.accent }]}
                  onPress={() => setField("program", program)}
                >
                  <Text style={[s.controlChipText, value.program === program && { color: colors.accentForeground }]}>{program}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={s.checkboxRow}
              onPress={() => setField("mustChangePassword", !value.mustChangePassword)}
            >
              <Ionicons name={value.mustChangePassword ? "checkbox" : "square-outline"} size={20} color={colors.primary} />
              <Text style={s.bodyText}>Require password change on first login</Text>
            </Pressable>

            <Pressable style={s.primaryActionBtn} onPress={onSubmit}>
              <Ionicons name="save-outline" size={17} color={colors.primaryForeground} />
              <Text style={s.primaryActionText}>Create User</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function FormInput({
  label,
  value,
  onChangeText,
  colors,
  ...props
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  colors: ReturnType<typeof useColors>;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles(colors).controlLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={colors.mutedForeground}
        style={styles(colors).textInput}
        {...props}
      />
    </View>
  );
}

function DateRangeCalendar({
  colors,
  visible,
  period,
  onChange,
  onClose,
}: {
  colors: ReturnType<typeof useColors>;
  visible: boolean;
  period: ReportPeriod;
  onChange: (period: ReportPeriod) => void;
  onClose: () => void;
}) {
  const s = styles(colors);
  const [visibleMonth, setVisibleMonth] = useState(() => parseDateValue(period.startDate));
  const [selecting, setSelecting] = useState<keyof ReportPeriod>("startDate");
  const normalized = normalizePeriod(period);
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array(firstDay.getDay()).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => dateValue(new Date(year, month, index + 1))),
  ];
  const visibleHolidays = cells
    .filter((value): value is string => !!value)
    .map((date) => ({ date, name: sriLankaPublicHolidayName(date) }))
    .filter((holiday): holiday is { date: string; name: string } => !!holiday.name);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const changeMonth = (offset: number) => {
    setVisibleMonth(new Date(year, month + offset, 1));
  };
  const selectDate = (value: string) => {
    const next = normalizePeriod({ ...period, [selecting]: value });
    onChange(next);
    setSelecting(selecting === "startDate" ? "endDate" : "startDate");
  };
  const setQuickRange = (range: "today" | "month" | "30days") => {
    const today = new Date();
    const next =
      range === "today"
        ? { startDate: dateValue(today), endDate: dateValue(today) }
        : range === "month"
          ? currentMonthPeriod()
          : { startDate: dateValue(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29)), endDate: dateValue(today) };
    onChange(next);
    setVisibleMonth(parseDateValue(next.startDate));
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.modalSheet}>
          <View style={s.modalHeader}>
            <View>
              <Text style={s.modalTitle}>Report Period</Text>
              <Text style={s.cardSub}>{periodLabel(normalized)}</Text>
            </View>
            <Pressable style={s.iconOnlyBtn} onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.foreground} />
            </Pressable>
          </View>

          <View style={s.periodRow}>
            {(["startDate", "endDate"] as (keyof ReportPeriod)[]).map((key) => {
              const active = selecting === key;
              return (
                <Pressable
                  key={key}
                  style={[s.periodBtn, active && { borderColor: colors.primary, backgroundColor: colors.primary + "18" }]}
                  onPress={() => setSelecting(key)}
                >
                  <Text style={s.controlLabel}>{key === "startDate" ? "Start" : "End"}</Text>
                  <Text style={[s.periodBtnText, active && { color: colors.primary }]}>{key === "startDate" ? normalized.startDate : normalized.endDate}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={s.chipWrap}>
            <Pressable style={s.controlChip} onPress={() => setQuickRange("today")}><Text style={s.controlChipText}>Today</Text></Pressable>
            <Pressable style={s.controlChip} onPress={() => setQuickRange("month")}><Text style={s.controlChipText}>This Month</Text></Pressable>
            <Pressable style={s.controlChip} onPress={() => setQuickRange("30days")}><Text style={s.controlChipText}>Last 30 Days</Text></Pressable>
          </View>

          <View style={s.calendarHeader}>
            <Pressable style={s.iconOnlyBtn} onPress={() => changeMonth(-1)}>
              <Ionicons name="chevron-back" size={20} color={colors.foreground} />
            </Pressable>
            <Text style={s.sectionTitle}>{visibleMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</Text>
            <Pressable style={s.iconOnlyBtn} onPress={() => changeMonth(1)}>
              <Ionicons name="chevron-forward" size={20} color={colors.foreground} />
            </Pressable>
          </View>

          <View style={s.calendarGrid}>
            {weekdays.map((day) => <Text key={day} style={s.calendarWeekText}>{day}</Text>)}
            {cells.map((value, index) => {
              if (!value) return <View key={`blank-${index}`} style={s.calendarDay} />;
              const isStart = value === normalized.startDate;
              const isEnd = value === normalized.endDate;
              const inRange = value >= normalized.startDate && value <= normalized.endDate;
              const holidayName = sriLankaPublicHolidayName(value);
              const isHoliday = !!holidayName;
              return (
                <Pressable
                  key={value}
                  style={[
                    s.calendarDay,
                    inRange && { backgroundColor: colors.primary + "14" },
                    isHoliday && !(isStart || isEnd) && s.calendarHolidayDay,
                    (isStart || isEnd) && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => selectDate(value)}
                >
                  <Text
                    style={[
                      s.calendarDayText,
                      isHoliday && !(isStart || isEnd) && s.calendarHolidayDayText,
                      (isStart || isEnd) && { color: colors.primaryForeground },
                    ]}
                  >
                    {parseDateValue(value).getDate()}
                  </Text>
                  {isHoliday && <View style={[s.calendarHolidayDot, (isStart || isEnd) && { backgroundColor: colors.primaryForeground }]} />}
                </Pressable>
              );
            })}
          </View>

          {visibleHolidays.length > 0 && (
            <View style={s.calendarHolidayPanel}>
              <View style={s.calendarHolidayHeader}>
                <View style={s.calendarHolidayDot} />
                <Text style={s.calendarHolidayTitle}>Public holidays</Text>
              </View>
              {visibleHolidays.map((holiday) => (
                <Text key={holiday.date} style={s.calendarHolidayText}>
                  {parseDateValue(holiday.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}: {holiday.name}
                </Text>
              ))}
            </View>
          )}

          <Pressable style={s.primaryActionBtn} onPress={onClose}>
            <Ionicons name="checkmark-outline" size={17} color={colors.primaryForeground} />
            <Text style={s.primaryActionText}>Apply Period</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function ReportsPanel({
  colors,
  reportType,
  reportPeriod,
  reportText,
  reportUsers,
  selectedUserId,
  userCount,
  pdfAction,
  onSelectReport,
  onChangePeriod,
  onSelectUser,
  onSharePdf,
  onSavePdf,
}: {
  colors: ReturnType<typeof useColors>;
  reportType: ReportType;
  reportPeriod: ReportPeriod;
  reportText: string;
  reportUsers: User[];
  selectedUserId: string;
  userCount: number;
  pdfAction: "share" | "save" | null;
  onSelectReport: (type: ReportType) => void;
  onChangePeriod: (period: ReportPeriod) => void;
  onSelectUser: (userId: string) => void;
  onSharePdf: () => void;
  onSavePdf: () => void;
}) {
  const s = styles(colors);
  const [userSearch, setUserSearch] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const selected = REPORT_OPTIONS.find((option) => option.value === reportType);
  const sortedReportUsers = [...reportUsers].sort((a, b) => a.name.localeCompare(b.name));
  const filteredUsers = sortedReportUsers.filter((user) => {
    const search = userSearch.trim().toLowerCase();
    if (!search) return true;
    return (
      user.name.toLowerCase().includes(search) ||
      user.employeeId.toLowerCase().includes(search) ||
      roleLabel(user.role).toLowerCase().includes(search)
    );
  });
  const selectedUser = reportUsers.find((user) => user.id === selectedUserId);
  const scopeLabel = selectedUser ? `${selectedUser.name} (${selectedUser.employeeId})` : "All scoped users";

  return (
    <View style={{ gap: 12 }}>
      <View style={s.stackCard}>
        <Text style={s.cardTitle}>Report Builder</Text>
        <Text style={s.cardSub}>Scope: {scopeLabel} • {userCount} user{userCount !== 1 ? "s" : ""}</Text>
        <View style={{ gap: 8 }}>
          <Text style={s.controlLabel}>Report Period</Text>
          <Pressable style={s.periodBtn} onPress={() => setCalendarOpen(true)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <Text style={s.periodBtnText}>{periodLabel(reportPeriod)}</Text>
            </View>
          </Pressable>
          <DateRangeCalendar
            colors={colors}
            visible={calendarOpen}
            period={reportPeriod}
            onChange={onChangePeriod}
            onClose={() => setCalendarOpen(false)}
          />
        </View>
        <View style={{ gap: 8 }}>
          <Text style={s.controlLabel}>Report User</Text>
          <TextInput
            value={userSearch}
            onChangeText={setUserSearch}
            placeholder="Search by name, ID, or role"
            placeholderTextColor={colors.mutedForeground}
            style={s.textInput}
            autoCapitalize="none"
          />
          <View style={s.chipWrap}>
            <Pressable
              style={[s.controlChip, selectedUserId === "all" && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={() => onSelectUser("all")}
            >
              <Text style={[s.controlChipText, selectedUserId === "all" && { color: colors.primaryForeground }]}>All Scoped Users</Text>
            </Pressable>
            {filteredUsers.map((user) => {
              const active = selectedUserId === user.id;
              return (
                <Pressable
                  key={user.id}
                  style={[s.controlChip, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => onSelectUser(user.id)}
                >
                  <Text style={[s.controlChipText, active && { color: colors.primaryForeground }]}>
                    {user.name} • {user.employeeId}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {filteredUsers.length === 0 && <Text style={s.cardSub}>No matching users in your report scope.</Text>}
        </View>
      </View>

      <View style={s.reportGrid}>
        {REPORT_OPTIONS.map((option) => {
          const active = option.value === reportType;
          return (
            <Pressable
              key={option.value}
              style={[s.reportTypeBtn, active && { borderColor: colors.primary, backgroundColor: colors.primary + "18" }]}
              onPress={() => onSelectReport(option.value)}
            >
              <Ionicons name={option.icon} size={18} color={active ? colors.primary : colors.mutedForeground} />
              <Text style={[s.reportTypeText, active && { color: colors.primary }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={s.stackCard}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: colors.primary + "22", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name={selected?.icon ?? "document-text-outline"} size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>{selected?.label ?? "Report"}</Text>
            <Text style={s.cardSub}>{periodLabel(reportPeriod)}</Text>
          </View>
        </View>
        <ScrollView style={s.reportPreview} contentContainerStyle={{ padding: 12 }}>
          <Text selectable style={s.reportPreviewText}>{reportText}</Text>
        </ScrollView>
        <View style={s.reportPdfActions}>
          <Pressable
            disabled={!!pdfAction}
            style={[s.primaryActionBtn, s.reportPdfBtn, pdfAction && { opacity: 0.65 }]}
            onPress={onSharePdf}
          >
            <Ionicons name={pdfAction === "share" ? "hourglass-outline" : "share-outline"} size={17} color={colors.primaryForeground} />
            <Text style={s.primaryActionText}>{pdfAction === "share" ? "Preparing..." : "Share PDF"}</Text>
          </Pressable>
          <Pressable
            disabled={!!pdfAction}
            style={[s.secondaryActionBtn, s.reportPdfBtn, pdfAction && { opacity: 0.65 }]}
            onPress={onSavePdf}
          >
            <Ionicons name={pdfAction === "save" ? "hourglass-outline" : "folder-open-outline"} size={17} color={colors.primary} />
            <Text style={s.secondaryActionText}>{pdfAction === "save" ? "Saving..." : "Save to Device"}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function LeaveList({ colors, leaves, users, onReview, onReviewCancel }: {
  colors: ReturnType<typeof useColors>;
  leaves: LeaveApplication[];
  users: User[];
  onReview: (id: string, status: "approved" | "rejected") => void;
  onReviewCancel: (id: string, status: "approved" | "rejected") => void;
}) {
  const s = styles(colors);
  const pending = leaves.filter((leave) => leave.status === "pending" || leave.status === "cancel-pending");
  const reviewed = leaves.filter((leave) => leave.status !== "pending" && leave.status !== "cancel-pending");
  const renderLeave = (leave: LeaveApplication, reviewedItem = false) => {
    const applicant = users.find((user) => user.id === leave.userId);
    const isCancellation = leave.status === "cancel-pending";
    return (
      <View key={leave.id} style={s.stackCard}>
        <Text style={s.cardTitle}>{applicant?.name ?? leave.userId}</Text>
        <Text style={s.cardSub}>{leave.leaveType.toUpperCase()} • {leave.leaveType === "short" ? `${leave.durationHours}h` : `${leave.durationDays}d`} • {formatDate(leave.startDate)} to {formatDate(leave.endDate)}</Text>
        <Text style={s.bodyText}>{leave.reason}</Text>
        {!!leave.medicalCertificateName && <Text style={[s.bodyText, { color: colors.primary }]}>Certificate: {leave.medicalCertificateName}</Text>}
        {!!leave.cancellationReason && <Text style={[s.bodyText, { color: colors.warning }]}>Cancel reason: {leave.cancellationReason}</Text>}
        {reviewedItem ? (
          <Text style={{ color: leave.status === "approved" || leave.status === "cancelled" ? colors.success : colors.destructive, fontFamily: "Inter_700Bold" }}>{leave.status.toUpperCase()}</Text>
        ) : (
          <View style={s.actionRow}>
            <Pressable style={[s.reviewBtn, { backgroundColor: colors.success }]} onPress={() => isCancellation ? onReviewCancel(leave.id, "approved") : onReview(leave.id, "approved")}>
              <Text style={s.reviewText}>Approve</Text>
            </Pressable>
            <Pressable style={[s.reviewBtn, { backgroundColor: colors.destructive }]} onPress={() => isCancellation ? onReviewCancel(leave.id, "rejected") : onReview(leave.id, "rejected")}>
              <Text style={s.reviewText}>Reject</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={{ gap: 14 }}>
      {pending.length === 0 && <Text style={s.emptyText}>No pending leave actions.</Text>}
      {pending.map((leave) => renderLeave(leave))}
      {reviewed.length > 0 && (
        <View style={{ gap: 10 }}>
          <Text style={s.sectionTitle}>Reviewed</Text>
          {reviewed.slice(0, 10).map((leave) => renderLeave(leave, true))}
        </View>
      )}
    </View>
  );
}

function AuditList({ colors, logs, users }: { colors: ReturnType<typeof useColors>; logs: any[]; users: User[] }) {
  const s = styles(colors);
  return (
    <View style={{ gap: 10 }}>
      {logs.slice(0, 50).map((log) => {
        const user = users.find((u) => u.id === log.userId);
        return (
          <View key={log.id} style={s.stackCard}>
            <Text style={s.cardTitle}>{log.actionType.replace(/-/g, " ").toUpperCase()}</Text>
            <Text style={s.cardSub}>{user?.name ?? log.userId} • {new Date(log.timestamp).toLocaleString()}</Text>
            {!!log.note && <Text style={s.bodyText}>{log.note}</Text>}
          </View>
        );
      })}
      {logs.length === 0 && <Text style={s.emptyText}>No HR audit activity yet.</Text>}
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: { paddingHorizontal: 16, marginBottom: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    pageTitle: { fontSize: 28, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    pageSub: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 4 },
    pendingBadge: { minWidth: 28, height: 28, borderRadius: 14, backgroundColor: colors.destructive, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
    pendingBadgeText: { color: "#fff", fontSize: 13, fontWeight: "700", fontFamily: "Inter_700Bold" },
    tabRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 12 },
    tabBtn: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    tabText: { fontSize: 12, color: colors.foreground, fontFamily: "Inter_600SemiBold" },
    content: { paddingHorizontal: 16, gap: 14 },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    statBlock: { width: "47%", backgroundColor: colors.card, borderRadius: 14, padding: 14, gap: 6, borderWidth: 1, borderColor: colors.border },
    statValue: { fontSize: 24, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    statLabel: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    card: { flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border },
    stackCard: { gap: 8, backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border },
    cardTitle: { fontSize: 15, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    cardSub: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    bodyText: { fontSize: 13, color: colors.foreground, fontFamily: "Inter_400Regular", lineHeight: 18 },
    twoCol: { flexDirection: "row", gap: 18 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    locationBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderWidth: 1, borderColor: colors.primary + "55", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
    locationText: { color: colors.primary, fontSize: 12, fontFamily: "Inter_700Bold" },
    smallBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, alignItems: "center" },
    smallBtnText: { fontSize: 12, color: colors.foreground, fontFamily: "Inter_700Bold" },
    actionRow: { flexDirection: "row", gap: 10 },
    primaryActionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary, borderRadius: 12, padding: 13 },
    primaryActionText: { color: colors.primaryForeground, fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold" },
    secondaryActionBtn: { flex: 1, borderWidth: 1, borderColor: colors.primary + "55", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, alignItems: "center" },
    secondaryActionText: { color: colors.primary, fontSize: 12, fontWeight: "700", fontFamily: "Inter_700Bold", textAlign: "center" },
    controlLabel: { fontSize: 12, fontWeight: "700", color: colors.mutedForeground, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.5 },
    periodRow: { flexDirection: "row", gap: 10 },
    periodBtn: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.muted, paddingHorizontal: 12, paddingVertical: 10, justifyContent: "center", gap: 4 },
    periodBtnText: { color: colors.foreground, fontSize: 13, fontWeight: "700", fontFamily: "Inter_700Bold" },
    calendarHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    calendarGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    calendarWeekText: { width: "13.45%", color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_700Bold", textAlign: "center" },
    calendarDay: { width: "13.45%", aspectRatio: 1, borderWidth: 1, borderColor: "transparent", borderRadius: 9, alignItems: "center", justifyContent: "center" },
    calendarDayText: { color: colors.foreground, fontSize: 13, fontFamily: "Inter_700Bold" },
    calendarHolidayDay: { backgroundColor: colors.destructive + "12", borderColor: colors.destructive + "55" },
    calendarHolidayDayText: { color: colors.destructive },
    calendarHolidayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.destructive, marginTop: 2 },
    calendarHolidayPanel: { backgroundColor: colors.destructive + "10", borderWidth: 1, borderColor: colors.destructive + "33", borderRadius: 12, padding: 10, gap: 4 },
    calendarHolidayHeader: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 2 },
    calendarHolidayTitle: { color: colors.destructive, fontSize: 12, fontWeight: "700", fontFamily: "Inter_700Bold" },
    calendarHolidayText: { color: colors.foreground, fontSize: 11, lineHeight: 15, fontFamily: "Inter_500Medium" },
    reportGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    reportTypeBtn: { width: "47%", minHeight: 70, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card, padding: 12, gap: 8, justifyContent: "center" },
    reportTypeText: { color: colors.foreground, fontSize: 12, fontWeight: "700", fontFamily: "Inter_700Bold" },
    reportPreview: { maxHeight: 360, minHeight: 220, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.muted },
    reportPreviewText: { color: colors.foreground, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
    reportPdfActions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    reportPdfBtn: { flex: 1, minWidth: 145, flexDirection: "row", gap: 8 },
    chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
    controlChip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 7 },
    controlChipText: { color: colors.foreground, fontSize: 11, fontWeight: "700", fontFamily: "Inter_700Bold", textTransform: "capitalize" },
    checkboxRow: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: colors.muted, borderRadius: 10, padding: 12 },
    textInput: { minHeight: 46, backgroundColor: colors.muted, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, color: colors.foreground, fontSize: 14, fontFamily: "Inter_400Regular" },
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
    modalSheet: { maxHeight: "88%", backgroundColor: colors.background, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, gap: 14 },
    modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    modalTitle: { fontSize: 18, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    iconOnlyBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" },
    reviewBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
    reviewText: { color: "#fff", fontSize: 13, fontWeight: "700", fontFamily: "Inter_700Bold" },
    sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    emptyText: { color: colors.mutedForeground, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", padding: 20 },
  });
