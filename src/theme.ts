export type Theme = "light" | "dark";
const themeKey = "kickon-admin-theme";

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.seedColorMode = theme === "dark" ? "dark-only" : "light-only";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#111111" : "#ffffff");
}

export function initializeTheme() {
  let theme: Theme = "light";
  try { const saved = localStorage.getItem(themeKey); if (saved === "light" || saved === "dark") theme = saved; } catch { /* Theme switching also works when storage is unavailable. */ }
  applyTheme(theme);
}

export function saveTheme(theme: Theme) {
  applyTheme(theme);
  try { localStorage.setItem(themeKey, theme); } catch { /* Keep the active theme even when preferences cannot be saved. */ }
}
