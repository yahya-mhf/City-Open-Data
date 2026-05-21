"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

interface ThemeContextType {
  nightMode: boolean;
  toggleNightMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [nightMode, setNightMode] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("night_mode");
    const isNight = stored === "true";
    setNightMode(isNight);
    document.documentElement.classList.toggle("dark", isNight);
  }, []);

  useEffect(() => {
    localStorage.setItem("night_mode", String(nightMode));
    document.documentElement.classList.toggle("dark", nightMode);
  }, [nightMode]);

  const toggleNightMode = useCallback(() => {
    setNightMode((prev) => !prev);
  }, []);

  return (
    <ThemeContext.Provider value={{ nightMode, toggleNightMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
