(() => {
  const storageKey = "rua-lens.theme-preference";
  const darkQuery = "(prefers-color-scheme: dark)";
  let preference = "system";

  try {
    const stored = globalThis.localStorage.getItem(storageKey);
    if (stored === "system" || stored === "light" || stored === "dark") {
      preference = stored;
    }
  } catch {
    // Continue with the system preference when storage is unavailable.
  }

  const systemDark = typeof globalThis.matchMedia === "function" && globalThis.matchMedia(darkQuery).matches;
  const theme = preference === "system" ? (systemDark ? "dark" : "light") : preference;
  globalThis.document.documentElement.dataset.theme = theme;

  const themeColor = globalThis.document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.setAttribute("content", theme === "dark" ? "#10151D" : "#F4F6F8");
  }
})();
