import { useState } from "react";
import { saveTheme, type Theme } from "../theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  const label = theme === "light" ? "다크 테마로 전환" : "라이트 테마로 전환";
  return <button type="button" className="theme-toggle" aria-label={label} title={label} aria-pressed={theme === "dark"} onClick={() => {
    const next = theme === "light" ? "dark" : "light";
    saveTheme(next); setTheme(next);
  }}>
    <span className="theme-logo-rotor" aria-hidden="true">
      <span className="theme-logo-face theme-logo-dark"><img src="./branding/kickon-logo-dark.svg" width="994" height="485" alt="" /></span>
      <span className="theme-logo-face theme-logo-light"><img src="./branding/kickon-logo.svg" width="994" height="485" alt="" /></span>
    </span>
  </button>;
}
