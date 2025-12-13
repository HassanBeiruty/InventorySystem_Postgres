import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "invoice-system-theme";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
  return stored || "system";
}

function applyTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  
  const root = window.document.documentElement;
  root.classList.remove("light", "dark", "system");
  
  if (theme === "system") {
    // Apply system theme as a separate professional theme
    root.classList.add("system");
    root.setAttribute("data-theme", "system");
  } else {
    // Apply light or dark theme
    root.classList.add(theme);
    root.setAttribute("data-theme", theme);
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark" | "system">(() => 
    theme
  );

  useEffect(() => {
    // Apply theme on mount and when theme changes
    applyTheme(theme);
    setResolvedTheme(theme);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    applyTheme(newTheme);
    setResolvedTheme(newTheme);
  };

  const toggleTheme = () => {
    // Cycle through: light -> dark -> system -> light
    if (theme === "light") {
      setTheme("dark");
    } else if (theme === "dark") {
      setTheme("system");
    } else {
      setTheme("light");
    }
  };

  return {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
  };
}

