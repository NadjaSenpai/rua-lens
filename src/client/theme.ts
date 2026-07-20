export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";
export const THEME_PREFERENCE_STORAGE_KEY = "rua-lens.theme-preference";
export const DARK_COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";
export const LIGHT_THEME_COLOR = "#F4F6F8";
export const DARK_THEME_COLOR = "#10151D";

export function readThemePreference(): ThemePreference {
  try {
    const value = globalThis.localStorage?.getItem(THEME_PREFERENCE_STORAGE_KEY);
    return isThemePreference(value) ? value : DEFAULT_THEME_PREFERENCE;
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

export function persistThemePreference(value: ThemePreference): void {
  try {
    globalThis.localStorage?.setItem(THEME_PREFERENCE_STORAGE_KEY, value);
  } catch {
    // The active in-memory preference still applies when storage is unavailable.
  }
}

export function resolveThemePreference(
  preference: ThemePreference,
  prefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") {
    return prefersDark ? "dark" : "light";
  }
  return preference;
}

export function systemPrefersDark(): boolean {
  return typeof globalThis.matchMedia === "function"
    && globalThis.matchMedia(DARK_COLOR_SCHEME_QUERY).matches;
}

export function applyDocumentTheme(theme: ResolvedTheme): void {
  const document = globalThis.document;
  if (!document) {
    return;
  }
  document.documentElement.dataset.theme = theme;
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.content = theme === "dark" ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
  }
}

function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}
