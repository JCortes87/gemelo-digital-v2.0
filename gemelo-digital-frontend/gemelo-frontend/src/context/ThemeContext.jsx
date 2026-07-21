import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("gemelo_dark") === "1";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("gemelo_dark", darkMode ? "1" : "0");
  }, [darkMode]);

  const toggleDark = useCallback(() => setDarkMode((v) => !v), []);

  // Memoizado: evita re-renders en cascada de todos los consumidores de useTheme()
  const value = useMemo(
    () => ({ darkMode, setDarkMode, toggleDark }),
    [darkMode, toggleDark],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
