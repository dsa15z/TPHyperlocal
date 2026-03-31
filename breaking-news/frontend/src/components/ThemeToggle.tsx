"use client";

import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    // Check saved preference or system preference
    const saved = localStorage.getItem("bn_theme");
    if (saved === "light") {
      setIsDark(false);
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("bn_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("bn_theme", "light");
    }
  };

  return (
    <button
      onClick={toggle}
      className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-surface-300/30 transition-colors"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
