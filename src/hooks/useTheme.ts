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
  root.classList.remove("light", "dark");
  
  let resolvedTheme: "light" | "dark";
  if (theme === "system") {
    resolvedTheme = getSystemTheme();
  } else {
    resolvedTheme = theme;
  }
  
  root.classList.add(resolvedTheme);
  root.setAttribute("data-theme", resolvedTheme);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => 
    theme === "system" ? getSystemTheme() : theme
  );

  useEffect(() => {
    // Apply theme on mount and when theme changes
    applyTheme(theme);
    setResolvedTheme(theme === "system" ? getSystemTheme() : theme);

    // Listen for system theme changes if using system theme
    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => {
        const systemTheme = getSystemTheme();
        applyTheme("system");
        setResolvedTheme(systemTheme);
      };

      // Modern browsers
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
      } else {
        // Fallback for older browsers
        mediaQuery.addListener(handleChange);
        return () => mediaQuery.removeListener(handleChange);
      }
    }
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    applyTheme(newTheme);
    setResolvedTheme(newTheme === "system" ? getSystemTheme() : newTheme);
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
  };
}

