"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Keyboard, X } from "lucide-react";
import clsx from "clsx";

const SHORTCUTS = [
  { keys: "g d", label: "Go to Dashboard", path: "/" },
  { keys: "g b", label: "Go to Bookmarks", path: "/bookmarks" },
  { keys: "g p", label: "Go to Pulses", path: "/pulses" },
  { keys: "g a", label: "Go to Analytics", path: "/analytics" },
  { keys: "g r", label: "Go to RadioGPT", path: "/radio" },
  { keys: "g s", label: "Go to Show Prep", path: "/show-prep" },
  { keys: "?", label: "Show keyboard shortcuts", path: null },
];

export function KeyboardShortcuts() {
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  useEffect(() => {
    let timeout: NodeJS.Timeout;

    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger in input fields
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) return;

      const key = e.key.toLowerCase();

      if (key === "?" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowHelp((prev) => !prev);
        return;
      }

      if (key === "escape") {
        setShowHelp(false);
        setPendingKey(null);
        return;
      }

      if (pendingKey === "g") {
        const shortcut = SHORTCUTS.find((s) => s.keys === `g ${key}`);
        if (shortcut?.path) {
          e.preventDefault();
          router.push(shortcut.path);
        }
        setPendingKey(null);
        return;
      }

      if (key === "g") {
        setPendingKey("g");
        timeout = setTimeout(() => setPendingKey(null), 1500);
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timeout);
    };
  }, [pendingKey, router]);

  if (!showHelp) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60" onClick={() => setShowHelp(false)}>
      <div className="bg-surface-100 border border-surface-300 rounded-xl shadow-2xl p-6 w-[400px] animate-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-accent" />
            Keyboard Shortcuts
          </h2>
          <button onClick={() => setShowHelp(false)} className="text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-2">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-center justify-between py-1.5">
              <span className="text-sm text-gray-300">{s.label}</span>
              <div className="flex items-center gap-1">
                {s.keys.split(" ").map((k, i) => (
                  <span key={i}>
                    <kbd className="px-2 py-0.5 rounded bg-surface-300 text-gray-200 text-xs font-mono">{k}</kbd>
                    {i < s.keys.split(" ").length - 1 && <span className="text-gray-600 text-xs mx-1">then</span>}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-600 mt-4">Press <kbd className="px-1.5 py-0.5 rounded bg-surface-300 text-gray-300 text-xs">Esc</kbd> to close</p>
      </div>
    </div>
  );
}
