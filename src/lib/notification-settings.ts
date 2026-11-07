export const NOTIFICATION_TYPES = [
  { key: "loanFunding", label: "Loan funding transfers" },
  { key: "payments", label: "Payments, loan EMIs & card bills" },
  { key: "documents", label: "Document renewals" },
  { key: "trips", label: "Trip plans & bookings" },
  { key: "checkIns", label: "Timed trip check-ins" },
  { key: "depreciation", label: "Monthly depreciation ready" },
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]["key"];
export type NotificationSettings = Record<NotificationType, boolean>;
export function normalizeNotificationSettings(raw?: Partial<NotificationSettings> | null): NotificationSettings {
  return Object.fromEntries(NOTIFICATION_TYPES.map(({ key }) => [key, raw?.[key] !== false])) as NotificationSettings;
}