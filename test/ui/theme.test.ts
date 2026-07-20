import { describe, expect, it } from "vitest";
import {
  applyDocumentTheme,
  DEFAULT_THEME_PREFERENCE,
  DARK_THEME_COLOR,
  LIGHT_THEME_COLOR,
  persistThemePreference,
  readThemePreference,
  resolveThemePreference,
  THEME_PREFERENCE_STORAGE_KEY,
} from "../../src/client/theme";

describe("theme preference", () => {
  it("defaults to system and rejects unknown stored values", () => {
    expect(readThemePreference()).toBe(DEFAULT_THEME_PREFERENCE);

    localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, "sepia");
    expect(readThemePreference()).toBe("system");
  });

  it("persists valid preferences", () => {
    persistThemePreference("dark");

    expect(localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe("dark");
    expect(readThemePreference()).toBe("dark");
  });

  it("resolves system and manual preferences", () => {
    expect(resolveThemePreference("system", false)).toBe("light");
    expect(resolveThemePreference("system", true)).toBe("dark");
    expect(resolveThemePreference("light", true)).toBe("light");
    expect(resolveThemePreference("dark", false)).toBe("dark");
  });

  it("applies the resolved theme to the document and theme color", () => {
    const themeColor = document.createElement("meta");
    themeColor.name = "theme-color";
    document.head.appendChild(themeColor);

    applyDocumentTheme("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(themeColor).toHaveAttribute("content", DARK_THEME_COLOR);

    applyDocumentTheme("light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(themeColor).toHaveAttribute("content", LIGHT_THEME_COLOR);
  });
});
