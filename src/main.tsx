import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n/config";

// Initialize theme before rendering to prevent flash
function initializeTheme() {
  const storedTheme = localStorage.getItem("invoice-system-theme") || "system";
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  
  if (storedTheme === "system") {
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    root.classList.add(systemTheme);
    root.setAttribute("data-theme", systemTheme);
  } else {
    root.classList.add(storedTheme);
    root.setAttribute("data-theme", storedTheme);
  }
}

// Initialize theme immediately
initializeTheme();

createRoot(document.getElementById("root")!).render(<App />);
