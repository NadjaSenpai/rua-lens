export type DisplayTimeZone = "UTC" | "Asia/Tokyo";

export const DEFAULT_DISPLAY_TIME_ZONE: DisplayTimeZone = "UTC";
export const DISPLAY_TIME_ZONE_STORAGE_KEY = "rua-lens.display-time-zone";

export function readDisplayTimeZone(): DisplayTimeZone {
  try {
    const value = globalThis.localStorage?.getItem(DISPLAY_TIME_ZONE_STORAGE_KEY);
    return isDisplayTimeZone(value) ? value : DEFAULT_DISPLAY_TIME_ZONE;
  } catch {
    return DEFAULT_DISPLAY_TIME_ZONE;
  }
}

export function persistDisplayTimeZone(value: DisplayTimeZone): void {
  try {
    globalThis.localStorage?.setItem(DISPLAY_TIME_ZONE_STORAGE_KEY, value);
  } catch {
    // The active in-memory preference still applies when storage is unavailable.
  }
}

export function formatDisplayDate(value: string, timeZone: DisplayTimeZone): string {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeZone,
  }).format(new Date(value));
}

export function formatDisplayDateTime(value: string, timeZone: DisplayTimeZone): string {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function isDisplayTimeZone(value: string | null | undefined): value is DisplayTimeZone {
  return value === "UTC" || value === "Asia/Tokyo";
}
