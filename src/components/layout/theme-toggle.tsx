"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const toggleTheme = () => {
    const nextTheme = document.documentElement.classList.contains("dark") ? "light" : "dark";
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    document.cookie = `kickon-theme=${nextTheme}; Path=/; Max-Age=31536000; SameSite=Lax`;
  };

  return (
    <Button type="button" variant="ghost" size="icon" className="size-11 xl:size-8" onClick={toggleTheme} aria-label="다크·라이트 테마 전환" title="테마 전환">
      <Sun className="hidden size-4 dark:block" />
      <Moon className="size-4 dark:hidden" />
    </Button>
  );
}
