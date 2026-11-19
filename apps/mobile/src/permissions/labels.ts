import type { PermissionSource } from "@chartnexa/api-contracts";

export const SOURCE_LABEL: Record<PermissionSource, string> = {
  role: "From role",
  individual: "Individual grant",
  switched_off: "Switched off for this person",
  none: "Not given",
};

export const ROLE_LABEL = {
  instructor: "Instructor",
  manager: "Manager",
  student: "Student",
} as const;

export function expiryText(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `Ends ${d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`;
}

export const EXPIRY_CHOICES = [
  { key: "never", label: "No end date", days: 0 },
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
] as const;
export type ExpiryKey = (typeof EXPIRY_CHOICES)[number]["key"];

export function expiryIso(key: ExpiryKey, now = Date.now()): string | null {
  const days = EXPIRY_CHOICES.find((c) => c.key === key)?.days ?? 0;
  return days === 0 ? null : new Date(now + days * 86_400_000).toISOString();
}
