"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

interface ThemeContextType {
  nightMode: boolean;
  toggleNightMode: () => void;
  demoMode: boolean;
  toggleDemoMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [nightMode, setNightMode] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("night_mode");
    const isNight = stored === "true";
    setNightMode(isNight);
    document.documentElement.classList.toggle("dark", isNight);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("demo_mode");
    if (stored === "true") {
      setDemoMode(true);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("night_mode", String(nightMode));
    document.documentElement.classList.toggle("dark", nightMode);
  }, [nightMode]);

  const toggleNightMode = useCallback(() => {
    setNightMode((prev) => !prev);
  }, []);

  const toggleDemoMode = useCallback(() => {
    setDemoMode((prev) => {
      const next = !prev;
      localStorage.setItem("demo_mode", String(next));
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ nightMode, toggleNightMode, demoMode, toggleDemoMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
