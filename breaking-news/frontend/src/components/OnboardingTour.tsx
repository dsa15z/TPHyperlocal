"use client";

import { useState, useEffect } from "react";
import { X, ChevronRight, Sparkles } from "lucide-react";
import clsx from "clsx";

const TOUR_STEPS = [
  {
    title: "Welcome to the News Desk",
    body: "This is your real-time breaking news intelligence platform. Stories are automatically ingested, scored, and categorized from dozens of sources.",
  },
  {
    title: "Dashboard & Filters",
    body: "The main dashboard shows all stories with filters for category, status, source, and trend direction. Use the sparkline column to spot rising stories at a glance.",
  },
  {
    title: "Story Detail",
    body: "Click any story to see AI-generated summaries, fact checks, translations, editorial annotations, collaborative editing, and a development timeline.",
  },
  {
    title: "Smart Pulses",
    body: "Create custom topic feeds based on keywords and categories. Pulses show you only the stories that match your interests.",
  },
  {
    title: "Show Prep & RadioGPT",
    body: "Build broadcast rundowns and generate radio scripts from top stories. RadioGPT creates on-air ready scripts with your preferred voice and format.",
  },
  {
    title: "Coverage Gaps",
    body: "Connect your newsroom's RSS feed to detect what stories you've missed. The 'Gaps Only' filter shows uncovered stories instantly.",
  },
  {
    title: "Keyboard Shortcuts",
    body: "Press ? anytime to see available keyboard shortcuts. Use g+d for dashboard, g+b for bookmarks, and more.",
  },
];

const TOUR_KEY = "bn_onboarding_complete";

export function OnboardingTour() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const done = localStorage.getItem(TOUR_KEY);
    if (!done) setVisible(true);
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(TOUR_KEY, "true");
  };

  const next = () => {
    if (step < TOUR_STEPS.length - 1) {
      setStep(step + 1);
    } else {
      dismiss();
    }
  };

  if (!visible) return null;

  const current = TOUR_STEPS[step];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
      <div className="bg-surface-100 border border-surface-300 rounded-xl shadow-2xl p-6 w-[440px] animate-in">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" />
            <span className="text-xs text-gray-500">{step + 1} of {TOUR_STEPS.length}</span>
          </div>
          <button onClick={dismiss} className="text-gray-500 hover:text-white text-xs">
            Skip tour
          </button>
        </div>

        <h2 className="text-xl font-bold text-white mb-2">{current.title}</h2>
        <p className="text-sm text-gray-300 leading-relaxed mb-6">{current.body}</p>

        {/* Progress dots */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                className={clsx(
                  "w-2 h-2 rounded-full transition-colors",
                  i === step ? "bg-accent" : i < step ? "bg-accent/40" : "bg-surface-300"
                )}
              />
            ))}
          </div>
          <button
            onClick={next}
            className="flex items-center gap-1 px-4 py-2 bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg transition-colors"
          >
            {step < TOUR_STEPS.length - 1 ? (
              <>Next <ChevronRight className="w-4 h-4" /></>
            ) : (
              "Get Started"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
