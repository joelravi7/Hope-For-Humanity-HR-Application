import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type UserRole =
  | "it-admin"
  | "director"
  | "project-manager"
  | "project-officer"
  | "project-assistant"
  | "employee"
  | "admin"
  | "supervisor";
export type AccountStatus = "active" | "inactive" | "suspended";
export type CheckInArrivalStatus = "on-time" | "grace" | "late";

export interface User {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  role: UserRole;
  department?: string;
  phone?: string;
  region?: string;
  program?: string;
  status: AccountStatus;
  password: string;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  date: string;
  checkIn?: string;
  checkInArrivalStatus?: CheckInArrivalStatus;
  checkOut?: string;
  checkInLocation?: string;
  checkOutLocation?: string;
  checkInLat?: number;
  checkInLng?: number;
  checkOutLat?: number;
  checkOutLng?: number;
  totalHours?: string;
  status: "active" | "complete" | "incomplete";
  locationLogs: LocationLog[];
}

export interface LocationLog {
  id: string;
  attendanceId: string;
  userId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  recordedAt: string;
}

export type AuditActionType =
  | "login"
  | "logout"
  | "check-in"
  | "check-out"
  | "location-log"
  | "user-create"
  | "user-update"
  | "user-delete"
  | "password-change"
  | "leave-apply"
  | "leave-approved"
  | "leave-rejected"
  | "leave-cancel-request"
  | "leave-cancel-approved"
  | "leave-cancel-rejected";

export interface AuditLog {
  id: string;
  userId: string;
  actionType: AuditActionType;
  targetType?: string;
  targetId?: string;
  previousValue?: string;
  newValue?: string;
  timestamp: string;
  note?: string;
}

export type LeaveType = "casual" | "annual" | "short" | "medical";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancel-pending" | "cancelled";
type LeaveApplicationInput = Omit<LeaveApplication, "id" | "status" | "createdAt"> & { id?: string };

export interface LeaveApplication {
  id: string;
  userId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  durationDays: number;
  durationHours: number;
  reason: string;
  medicalCertificateName?: string;
  status: LeaveStatus;
  cancellationReason?: string;
  cancellationRequestedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  adminComment?: string;
  createdAt: string;
}

export const CASUAL_LEAVE_QUOTA = 7;
export const ANNUAL_LEAVE_QUOTA = 14;
export const SHORT_LEAVE_QUOTA = 3;
export const REGULAR_SIGN_IN_LABEL = "8:30 AM";
export const CHECK_IN_GRACE_LABEL = "8:31 AM - 8:59 AM";
export const LATE_CHECK_IN_WARNING = "Arriving to work late frequently will lead to consequences.";

export interface LeaveBalance {
  casualUsed: number;
  casualRemaining: number;
  annualUsed: number;
  annualRemaining: number;
  shortHoursUsedThisMonth: number;
  shortHoursRemainingThisMonth: number;
  medicalUsed: number;
}

interface AppState {
  currentUser: User | null;
  users: User[];
  attendanceRecords: AttendanceRecord[];
  todayAttendance: AttendanceRecord | null;
  isCheckedIn: boolean;
  auditLogs: AuditLog[];
  leaveApplications: LeaveApplication[];
}

interface AppContextType extends AppState {
  login: (email: string, password: string) => Promise<{ success: boolean; mustChangePassword?: boolean }>;
  logout: () => void;
  createUser: (user: Omit<User, "id" | "createdAt">) => { success: boolean; error?: string; user?: User };
  updateUser: (id: string, data: Partial<User>) => void;
  deleteUser: (userId: string) => void;
  checkIn: (lat?: number, lng?: number, location?: string) => void;
  checkOut: (lat?: number, lng?: number, location?: string) => void;
  addLocationLog: (log: Omit<LocationLog, "id">) => void;
  getAttendanceForUser: (userId: string) => AttendanceRecord[];
  getAllAttendance: () => AttendanceRecord[];
  changePassword: (userId: string, newPassword: string) => void;
  addAuditLog: (log: Omit<AuditLog, "id" | "timestamp">) => void;
  applyLeave: (application: Omit<LeaveApplication, "id" | "status" | "createdAt">) => { success: boolean; error?: string };
  reviewLeave: (id: string, status: "approved" | "rejected", adminId: string, comment?: string) => { success: boolean; error?: string };
  requestLeaveCancellation: (id: string, userId: string, reason: string) => void;
  reviewLeaveCancellation: (id: string, status: "approved" | "rejected", reviewerId: string, comment?: string) => void;
  getLeaveBalance: (userId: string) => LeaveBalance;
  getLeaveApplications: (userId: string) => LeaveApplication[];
  getAllLeaveApplications: () => LeaveApplication[];
  validateLeaveApplication: (app: LeaveApplicationInput) => { valid: boolean; error?: string };
}

const AppContext = createContext<AppContextType | null>(null);
const STORAGE_KEY = "hfh_hr_app_v1";

function calendarYear() {
  return new Date().getFullYear();
}

function calendarMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function getCheckInArrivalStatus(value?: string | Date | null): CheckInArrivalStatus | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  const minutes = d.getHours() * 60 + d.getMinutes();
  if (minutes < 8 * 60 + 31) return "on-time";
  if (minutes < 9 * 60) return "grace";
  return "late";
}

export function checkInArrivalLabel(status?: CheckInArrivalStatus | null) {
  switch (status) {
    case "on-time":
      return "On time";
    case "grace":
      return "Grace period";
    case "late":
      return "Late check-in";
    default:
      return "Not checked in";
  }
}

function daysBetween(start: string, end: string) {
  const parse = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return year && month && day ? new Date(year, month - 1, day) : new Date(value);
  };
  return Math.round((parse(end).getTime() - parse(start).getTime()) / 86400000) + 1;
}

export function roleLabel(role?: UserRole) {
  switch (role) {
    case "it-admin":
    case "admin":
      return "System Admin";
    case "director":
      return "Director";
    case "project-manager":
      return "Project Manager";
    case "project-officer":
      return "Project Officer";
    case "supervisor":
      return "Supervisor";
    case "project-assistant":
    case "employee":
      return "Project Assistant";
    default:
      return "Staff";
  }
}

export function isSystemAdmin(role?: UserRole) {
  return role === "it-admin" || role === "admin";
}

export function isLeadershipRole(role?: UserRole) {
  return role === "director" || role === "project-manager" || role === "project-officer" || role === "supervisor";
}

export function isITAdmin(role?: UserRole) {
  return isSystemAdmin(role);
}

export function canAccessAdminPanel(role?: UserRole) {
  return isSystemAdmin(role) || isLeadershipRole(role);
}

export function canManageUsers(role?: UserRole) {
  return isSystemAdmin(role);
}

export function canCreateReports(role?: UserRole) {
  return isSystemAdmin(role) || role === "director" || role === "project-manager";
}

export function canApplyLeave(role?: UserRole) {
  return !!role && !isSystemAdmin(role) && role !== "director";
}

export function requiresAttendance(role?: UserRole) {
  return !!role && canApplyLeave(role);
}

export function canViewManagedActivity(viewerRole: UserRole | undefined, targetUser: Pick<User, "id" | "role">, viewerId?: string) {
  if (!viewerRole || targetUser.id === viewerId) return false;
  if (isSystemAdmin(viewerRole)) return true;
  if (targetUser.role === "project-manager") return viewerRole === "director";
  if (viewerRole === "director") return ["project-manager", "project-officer", "project-assistant", "employee", "supervisor"].includes(targetUser.role);
  if (viewerRole === "project-manager") return ["project-officer", "project-assistant", "employee", "supervisor"].includes(targetUser.role);
  if (viewerRole === "project-officer" || viewerRole === "supervisor") return ["project-assistant", "employee"].includes(targetUser.role);
  return false;
}

export function canReviewLeaveApplication(viewerRole: UserRole | undefined, applicant: Pick<User, "id" | "role"> | undefined, viewerId?: string) {
  if (!viewerRole || !applicant || applicant.id === viewerId) return false;
  if (isSystemAdmin(viewerRole)) return false;
  if (viewerRole === "project-officer" || viewerRole === "supervisor") return applicant.role === "project-assistant" || applicant.role === "employee";
  if (viewerRole === "project-manager") return applicant.role === "project-officer" || applicant.role === "supervisor";
  if (viewerRole === "director") return applicant.role === "project-manager";
  return false;
}

const QUOTA_HOLDING_STATUSES: LeaveStatus[] = ["pending", "approved", "cancel-pending"];

function holdsLeaveQuota(status: LeaveStatus) {
  return QUOTA_HOLDING_STATUSES.includes(status);
}

function validateLeaveAgainstApplications(
  app: LeaveApplicationInput,
  applications: LeaveApplication[],
): { valid: boolean; error?: string } {
  const year = calendarYear();
  const month = app.startDate.slice(0, 7);
  const existing = applications.filter(
    (a) => a.userId === app.userId && a.id !== app.id && holdsLeaveQuota(a.status),
  );

  if (app.leaveType === "casual") {
    const used = existing
      .filter((a) => a.leaveType === "casual" && new Date(a.startDate).getFullYear() === year)
      .reduce((s, a) => s + a.durationDays, 0);
    if (used + app.durationDays > CASUAL_LEAVE_QUOTA) {
      const remaining = Math.max(0, CASUAL_LEAVE_QUOTA - used);
      return { valid: false, error: `You only have ${remaining} casual leave day${remaining !== 1 ? "s" : ""} remaining this year, including pending requests.` };
    }
  }

  if (app.leaveType === "annual") {
    const used = existing
      .filter((a) => a.leaveType === "annual" && new Date(a.startDate).getFullYear() === year)
      .reduce((s, a) => s + a.durationDays, 0);
    const remaining = ANNUAL_LEAVE_QUOTA - used;
    if (app.durationDays > remaining) {
      return { valid: false, error: `You only have ${Math.max(0, remaining)} annual leave day${remaining !== 1 ? "s" : ""} remaining this year, including pending requests.` };
    }
    if (used < 10 && app.durationDays < 5) {
      return { valid: false, error: "Annual leave must be taken in a minimum of 5 consecutive days." };
    }
    if (used >= 10 && app.durationDays !== remaining) {
      return { valid: false, error: `After 10 days, remaining ${remaining} day${remaining !== 1 ? "s" : ""} of annual leave must be taken all at once.` };
    }
  }

  if (app.leaveType === "short") {
    const usedHours = existing
      .filter((a) => a.leaveType === "short" && a.startDate.startsWith(month))
      .reduce((s, a) => s + a.durationHours, 0);
    if (![1, 1.5, 2, 3].includes(app.durationHours)) {
      return { valid: false, error: "Short leave must be 1, 1.5, 2, or 3 hours." };
    }
    if (usedHours + app.durationHours > SHORT_LEAVE_QUOTA) {
      const remaining = Math.max(0, SHORT_LEAVE_QUOTA - usedHours);
      return { valid: false, error: `You only have ${remaining} short leave hour${remaining !== 1 ? "s" : ""} remaining this month, including pending requests.` };
    }
  }

  if (app.leaveType === "medical" && app.durationDays > 2 && !app.medicalCertificateName) {
    return { valid: false, error: "Medical leave longer than 2 days requires a medical certificate attachment." };
  }

  return { valid: true };
}

const SEED_USERS: User[] = [
  {
    id: "admin-1", employeeId: "IT-001", name: "Joel Admin", email: "admin@hopeforhumanity.org",
    role: "it-admin", department: "IT Administration", phone: "+94 77 100 0001",
    region: "Western Province", program: "All Programs", status: "active",
    password: "admin123", mustChangePassword: false,
    createdAt: new Date(Date.now() - 90 * 86400000).toISOString(),
  },
  {
    id: "director-1", employeeId: "DIR-001", name: "Anjali Director", email: "director@hopeforhumanity.org",
    role: "director", department: "Executive Office", phone: "+94 77 100 0002",
    region: "Western Province", program: "All Programs", status: "active",
    password: "director123", mustChangePassword: false,
    createdAt: new Date(Date.now() - 80 * 86400000).toISOString(),
  },
  {
    id: "pm-1", employeeId: "PM-001", name: "Nimal Project Manager", email: "pm@hopeforhumanity.org",
    role: "project-manager", department: "Program Management", phone: "+94 77 100 0003",
    region: "Western Province", program: "Child Protection", status: "active",
    password: "pm123", mustChangePassword: false,
    createdAt: new Date(Date.now() - 75 * 86400000).toISOString(),
  },
  {
    id: "po-1", employeeId: "PO-001", name: "Maya Project Officer", email: "po@hopeforhumanity.org",
    role: "project-officer", department: "Field Operations", phone: "+94 77 100 0004",
    region: "Western Province", program: "Child Protection", status: "active",
    password: "po123", mustChangePassword: false,
    createdAt: new Date(Date.now() - 70 * 86400000).toISOString(),
  },
  {
    id: "pa-1", employeeId: "PA-001", name: "John Project Assistant", email: "john@hopeforhumanity.org",
    role: "project-assistant", department: "Field Operations", phone: "+94 77 100 0005",
    region: "Southern Province", program: "Child Protection", status: "active",
    password: "emp123", mustChangePassword: false,
    createdAt: new Date(Date.now() - 60 * 86400000).toISOString(),
  },
  {
    id: "pa-2", employeeId: "PA-002", name: "Maria Project Assistant", email: "maria@hopeforhumanity.org",
    role: "project-assistant", department: "Social Support", phone: "+94 77 100 0006",
    region: "Northern Province", program: "Education Support", status: "active",
    password: "emp123", mustChangePassword: false,
    createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
  },
];

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>({
    currentUser: null,
    users: SEED_USERS,
    attendanceRecords: [],
    todayAttendance: null,
    isCheckedIn: false,
    auditLogs: [],
    leaveApplications: [],
  });

  useEffect(() => { loadData(); }, []);

  const save = (next: AppState) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
      users: next.users,
      attendanceRecords: next.attendanceRecords,
      auditLogs: next.auditLogs,
      leaveApplications: next.leaveApplications,
    })).catch(() => {});
  };

  const loadData = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      setState((prev) => ({
        ...prev,
        users: parsed.users ?? SEED_USERS,
        attendanceRecords: parsed.attendanceRecords ?? [],
        auditLogs: parsed.auditLogs ?? [],
        leaveApplications: parsed.leaveApplications ?? [],
      }));
    } catch {}
  };

  const addAuditLog = useCallback((log: Omit<AuditLog, "id" | "timestamp">) => {
    setState((prev) => {
      const entry: AuditLog = { ...log, id: "audit-" + Date.now(), timestamp: new Date().toISOString() };
      const next = { ...prev, auditLogs: [entry, ...prev.auditLogs].slice(0, 1000) };
      save(next);
      return next;
    });
  }, []);

  const getLeaveBalance = useCallback((userId: string): LeaveBalance => {
    const year = calendarYear();
    const month = calendarMonth();
    const approved = state.leaveApplications.filter(
      (a) => a.userId === userId && (a.status === "approved" || a.status === "cancel-pending")
    );
    const casualUsed = approved.filter((a) => a.leaveType === "casual" && new Date(a.startDate).getFullYear() === year).reduce((s, a) => s + a.durationDays, 0);
    const annualUsed = approved.filter((a) => a.leaveType === "annual" && new Date(a.startDate).getFullYear() === year).reduce((s, a) => s + a.durationDays, 0);
    const shortHoursUsedThisMonth = approved.filter((a) => a.leaveType === "short" && a.startDate.startsWith(month)).reduce((s, a) => s + a.durationHours, 0);
    const medicalUsed = approved.filter((a) => a.leaveType === "medical" && new Date(a.startDate).getFullYear() === year).reduce((s, a) => s + a.durationDays, 0);
    return {
      casualUsed,
      casualRemaining: Math.max(0, CASUAL_LEAVE_QUOTA - casualUsed),
      annualUsed,
      annualRemaining: Math.max(0, ANNUAL_LEAVE_QUOTA - annualUsed),
      shortHoursUsedThisMonth,
      shortHoursRemainingThisMonth: Math.max(0, SHORT_LEAVE_QUOTA - shortHoursUsedThisMonth),
      medicalUsed,
    };
  }, [state.leaveApplications]);

  const validateLeaveApplication = useCallback(
    (app: LeaveApplicationInput): { valid: boolean; error?: string } =>
      validateLeaveAgainstApplications(app, state.leaveApplications),
    [state.leaveApplications]
  );

  const login = async (email: string, password: string) => {
    const identifier = email.trim().toLowerCase();
    const user = state.users.find(
      (u) =>
        (u.email.toLowerCase() === identifier || u.employeeId.toLowerCase() === identifier) &&
        u.password === password &&
        u.status === "active",
    );
    if (!user) return { success: false };
    const todayRecord = state.attendanceRecords
      .filter((r) => r.userId === user.id && new Date(r.date).toDateString() === new Date().toDateString())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    setState((prev) => ({
      ...prev,
      currentUser: user,
      todayAttendance: todayRecord ?? null,
      isCheckedIn: !!(todayRecord?.checkIn && !todayRecord?.checkOut),
    }));
    addAuditLog({ userId: user.id, actionType: "login" });
    return { success: true, mustChangePassword: user.mustChangePassword };
  };

  const logout = () => {
    if (state.currentUser) addAuditLog({ userId: state.currentUser.id, actionType: "logout" });
    setState((prev) => ({ ...prev, currentUser: null, todayAttendance: null, isCheckedIn: false }));
  };

  const createUser = (user: Omit<User, "id" | "createdAt">) => {
    if (!canManageUsers(state.currentUser?.role)) {
      return { success: false, error: "Only System Admin can create users." };
    }
    const email = user.email.trim().toLowerCase();
    const employeeId = user.employeeId.trim().toLowerCase();
    if (state.users.some((u) => u.email.toLowerCase() === email)) {
      return { success: false, error: "A user with this email already exists." };
    }
    if (state.users.some((u) => u.employeeId.toLowerCase() === employeeId)) {
      return { success: false, error: "A user with this employee ID already exists." };
    }
    const newUser: User = { ...user, id: "user-" + Date.now(), createdAt: new Date().toISOString() };
    setState((prev) => {
      const next = { ...prev, users: [...prev.users, newUser] };
      save(next);
      return next;
    });
    if (state.currentUser) addAuditLog({ userId: state.currentUser.id, actionType: "user-create", targetId: newUser.id });
    return { success: true, user: newUser };
  };

  const updateUser = (id: string, data: Partial<User>) => {
    if (!canManageUsers(state.currentUser?.role) && state.currentUser?.id !== id) return;
    const changedFields = Object.keys(data).filter((key) => key !== "password");
    setState((prev) => {
      const next = { ...prev, users: prev.users.map((u) => u.id === id ? { ...u, ...data } : u) };
      save(next);
      return next;
    });
    if (state.currentUser) addAuditLog({
      userId: state.currentUser.id,
      actionType: "user-update",
      targetId: id,
      note: changedFields.length ? `Updated ${changedFields.join(", ")}` : "Updated password",
    });
  };

  const deleteUser = (userId: string) => {
    if (!canManageUsers(state.currentUser?.role) || state.currentUser?.id === userId) return;
    setState((prev) => {
      const next = { ...prev, users: prev.users.filter((u) => u.id !== userId) };
      save(next);
      return next;
    });
    if (state.currentUser) addAuditLog({ userId: state.currentUser.id, actionType: "user-delete", targetId: userId });
  };

  const changePassword = (userId: string, newPassword: string) => {
    setState((prev) => {
      const nextUsers = prev.users.map((u) => u.id === userId ? { ...u, password: newPassword, mustChangePassword: false } : u);
      const currentUser = prev.currentUser?.id === userId ? { ...prev.currentUser, password: newPassword, mustChangePassword: false } : prev.currentUser;
      const next = { ...prev, users: nextUsers, currentUser };
      save(next);
      return next;
    });
    addAuditLog({ userId, actionType: "password-change" });
  };

  const checkIn = (lat?: number, lng?: number, location?: string) => {
    const checkedInAt = new Date();
    const now = checkedInAt.toISOString();
    const arrivalStatus = getCheckInArrivalStatus(checkedInAt);
    setState((prev) => {
      if (!prev.currentUser) return prev;
      const record: AttendanceRecord = {
        id: "att-" + Date.now(),
        userId: prev.currentUser.id,
        date: now,
        checkIn: now,
        checkInArrivalStatus: arrivalStatus ?? undefined,
        checkInLocation: location,
        checkInLat: lat,
        checkInLng: lng,
        status: "active",
        locationLogs: [],
      };
      const next = { ...prev, attendanceRecords: [...prev.attendanceRecords, record], todayAttendance: record, isCheckedIn: true };
      save(next);
      return next;
    });
    if (state.currentUser) {
      const note = [location, arrivalStatus ? checkInArrivalLabel(arrivalStatus) : null].filter(Boolean).join(" | ");
      addAuditLog({ userId: state.currentUser.id, actionType: "check-in", note: note || undefined });
    }
  };

  const checkOut = (lat?: number, lng?: number, location?: string) => {
    setState((prev) => {
      if (!prev.currentUser || !prev.todayAttendance) return prev;
      const now = new Date().toISOString();
      const diff = Date.now() - new Date(prev.todayAttendance.checkIn ?? now).getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const record: AttendanceRecord = {
        ...prev.todayAttendance,
        checkOut: now,
        checkOutLocation: location,
        checkOutLat: lat,
        checkOutLng: lng,
        totalHours: `${h}h ${m}m`,
        status: "complete",
      };
      const next = {
        ...prev,
        attendanceRecords: prev.attendanceRecords.map((r) => r.id === record.id ? record : r),
        todayAttendance: record,
        isCheckedIn: false,
      };
      save(next);
      return next;
    });
    if (state.currentUser) addAuditLog({ userId: state.currentUser.id, actionType: "check-out", note: location });
  };

  const addLocationLog = (log: Omit<LocationLog, "id">) => {
    setState((prev) => {
      if (!prev.todayAttendance) return prev;
      const entry: LocationLog = { ...log, id: "loc-" + Date.now() };
      const record = { ...prev.todayAttendance, locationLogs: [...prev.todayAttendance.locationLogs, entry] };
      const next = {
        ...prev,
        attendanceRecords: prev.attendanceRecords.map((r) => r.id === record.id ? record : r),
        todayAttendance: record,
      };
      save(next);
      return next;
    });
  };

  const applyLeave = (application: Omit<LeaveApplication, "id" | "status" | "createdAt">) => {
    const applicant = state.users.find((user) => user.id === application.userId);
    if (!canApplyLeave(applicant?.role)) {
      return { success: false, error: "This role is not eligible to apply for leave." };
    }
    const check = validateLeaveApplication(application);
    if (!check.valid) return { success: false, error: check.error };
    const newApplication: LeaveApplication = {
      ...application,
      id: "leave-" + Date.now(),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    setState((prev) => {
      const next = { ...prev, leaveApplications: [newApplication, ...prev.leaveApplications] };
      save(next);
      return next;
    });
    addAuditLog({ userId: application.userId, actionType: "leave-apply", note: `${application.leaveType} leave applied` });
    return { success: true };
  };

  const reviewLeave = (id: string, status: "approved" | "rejected", adminId: string, comment?: string) => {
    const reviewer = state.users.find((user) => user.id === adminId);
    const existing = state.leaveApplications.find((application) => application.id === id);
    const applicant = existing ? state.users.find((user) => user.id === existing.userId) : undefined;
    if (!existing || !canReviewLeaveApplication(reviewer?.role, applicant, adminId)) {
      return { success: false, error: "You do not have permission to review this leave request." };
    }
    if (status === "approved") {
      const check = validateLeaveAgainstApplications(existing, state.leaveApplications);
      if (!check.valid) return { success: false, error: check.error };
    }
    setState((prev) => {
      const next = {
        ...prev,
        leaveApplications: prev.leaveApplications.map((a) =>
          a.id === id ? { ...a, status, reviewedBy: adminId, reviewedAt: new Date().toISOString(), adminComment: comment } : a
        ),
      };
      save(next);
      return next;
    });
    addAuditLog({ userId: adminId, actionType: status === "approved" ? "leave-approved" : "leave-rejected", targetId: id });
    return { success: true };
  };

  const requestLeaveCancellation = (id: string, userId: string, reason: string) => {
    const existing = state.leaveApplications.find((a) => a.id === id);
    if (!existing || existing.userId !== userId) return;
    const immediateCancel = existing?.status === "pending";
    setState((prev) => {
      const next = {
        ...prev,
        leaveApplications: prev.leaveApplications.map((a) =>
          a.id === id
            ? {
                ...a,
                status: (immediateCancel ? "cancelled" : "cancel-pending") as LeaveStatus,
                cancellationReason: reason,
                cancellationRequestedAt: new Date().toISOString(),
              }
            : a
        ),
      };
      save(next);
      return next;
    });
    addAuditLog({ userId, actionType: immediateCancel ? "leave-cancel-approved" : "leave-cancel-request", targetId: id, note: reason });
  };

  const reviewLeaveCancellation = (id: string, status: "approved" | "rejected", reviewerId: string, comment?: string) => {
    const reviewer = state.users.find((user) => user.id === reviewerId);
    const existing = state.leaveApplications.find((application) => application.id === id);
    const applicant = existing ? state.users.find((user) => user.id === existing.userId) : undefined;
    if (!existing || !canReviewLeaveApplication(reviewer?.role, applicant, reviewerId)) return;
    setState((prev) => {
      const next = {
        ...prev,
        leaveApplications: prev.leaveApplications.map((a) =>
          a.id === id
            ? {
                ...a,
                status: (status === "approved" ? "cancelled" : "approved") as LeaveStatus,
                reviewedBy: reviewerId,
                reviewedAt: new Date().toISOString(),
                adminComment: comment,
              }
            : a
        ),
      };
      save(next);
      return next;
    });
    addAuditLog({ userId: reviewerId, actionType: status === "approved" ? "leave-cancel-approved" : "leave-cancel-rejected", targetId: id });
  };

  const getAttendanceForUser = (userId: string) => state.attendanceRecords.filter((r) => r.userId === userId);
  const getAllAttendance = () => state.attendanceRecords;
  const getLeaveApplications = (userId: string) => state.leaveApplications.filter((a) => a.userId === userId);
  const getAllLeaveApplications = () => state.leaveApplications;

  return (
    <AppContext.Provider value={{
      ...state,
      login,
      logout,
      createUser,
      updateUser,
      deleteUser,
      checkIn,
      checkOut,
      addLocationLog,
      getAttendanceForUser,
      getAllAttendance,
      changePassword,
      addAuditLog,
      applyLeave,
      reviewLeave,
      requestLeaveCancellation,
      reviewLeaveCancellation,
      getLeaveBalance,
      getLeaveApplications,
      getAllLeaveApplications,
      validateLeaveApplication,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}
