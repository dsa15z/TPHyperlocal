"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import AnimatedSection from "@/components/AnimatedSection";

const features = [
  {
    title: "AI Audio Production",
    description:
      "Generate broadcast-quality audio content 24/7 with customizable AI voices that match your brand. News, weather, trending segments — live and local, always on.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
      </svg>
    ),
  },
  {
    title: "Instant Video Creation",
    description:
      "Transform audio, scripts, or articles into branded video content. Multiple formats, dynamic captions, and Spanish translation — all automated.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    ),
  },
  {
    title: "Automated Content Pipeline",
    description:
      "From trending topic detection to published asset — in minutes. Our AI drafts headlines, articles, talking points, and social posts from real-time data.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
      </svg>
    ),
  },
  {
    title: "Brand-Safe AI Voices",
    description:
      "Customizable AI personalities that match your station format and tone. Choose from dozens of voices with adjustable accent, expression, and style.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
      </svg>
    ),
  },
  {
    title: "Multi-Platform Distribution",
    description:
      "Publish to radio, web, app, streaming, social, and podcast platforms from a single workflow. Format-optimized content for every channel.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 004.5 9.75v7.5a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25v-7.5a2.25 2.25 0 00-2.25-2.25h-.75m0-3l-3-3m0 0l-3 3m3-3v11.25m6-2.25h.75a2.25 2.25 0 012.25 2.25v7.5a2.25 2.25 0 01-2.25 2.25h-7.5a2.25 2.25 0 01-2.25-2.25v-.75" />
      </svg>
    ),
  },
  {
    title: "Broadcast System Integration",
    description:
      "Seamless integration with WideOrbit, RCS Zetta, NexGen, ENCO, and other major broadcast systems. Plug into your existing workflow instantly.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
  },
];

const metrics = [
  { value: "3x", label: "Content output increase" },
  { value: "24/7", label: "Always-on production" },
  { value: "Minutes", label: "Topic to published asset" },
  { value: "6+", label: "Output formats" },
];

export default function FuturiContentPage() {
  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative pt-40 pb-24 overflow-hidden">
        <div className="absolute inset-0 mesh-gradient" />
        <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-futuri-violet/8 rounded-full blur-[150px]" />

        <div className="relative z-10 max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="max-w-3xl"
          >
            <span className="inline-block text-sm font-semibold text-futuri-violet uppercase tracking-widest mb-4">
              Futuri Content
            </span>
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[0.95] mb-6 text-white">
              Create at the speed
              <br />
              of{" "}
              <span className="bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">
                your audience
              </span>
            </h1>
            <p className="text-xl text-white/50 leading-relaxed mb-8 max-w-2xl">
              AI-powered content creation that turns data-driven insights into
              broadcast-ready audio, video, and text — in minutes, not days.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/contact"
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-xl bg-gradient-to-r from-violet-500 to-pink-500 text-white hover:shadow-xl hover:shadow-violet-500/25 transition-all duration-300 hover:-translate-y-0.5"
              >
                Request a Demo
              </Link>
              <Link
                href="#features"
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-xl glass text-white/80 hover:text-white hover:bg-white/10 transition-all"
              >
                See Features
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Metrics */}
      <section className="relative py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="glass rounded-2xl p-8 md:p-12">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {metrics.map((m, i) => (
                <AnimatedSection key={m.label} delay={i * 0.1} className="text-center">
                  <div className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent mb-1">
                    {m.value}
                  </div>
                  <div className="text-sm text-white/40">{m.label}</div>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative py-32">
        <div className="max-w-7xl mx-auto px-6">
          <AnimatedSection className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-white mb-4">
              Every content format. One platform.
            </h2>
            <p className="text-lg text-white/50 max-w-2xl mx-auto">
              Audio, video, text, and social — Futuri Content produces broadcast-quality
              assets across every format your audience consumes.
            </p>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <AnimatedSection key={f.title} delay={i * 0.1}>
                <div className="glass rounded-2xl p-8 h-full hover:bg-white/[0.06] transition-all duration-300">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-400 to-pink-500 flex items-center justify-center text-white mb-5">
                    {f.icon}
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-white/50 leading-relaxed">{f.description}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* The Workflow */}
      <section className="relative py-32">
        <div className="max-w-7xl mx-auto px-6">
          <AnimatedSection className="text-center mb-16">
            <h2 className="text-4xl font-bold tracking-tight text-white mb-4">
              From insight to asset in minutes
            </h2>
          </AnimatedSection>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: "01", title: "Detect", desc: "Futuri Data identifies a trending topic relevant to your audience" },
              { step: "02", title: "Draft", desc: "AI generates scripts, talking points, headlines, and article copy" },
              { step: "03", title: "Produce", desc: "Content engine creates finished audio, video, and text assets" },
              { step: "04", title: "Publish", desc: "Distribute across radio, web, app, social, and streaming platforms" },
            ].map((s, i) => (
              <AnimatedSection key={s.step} delay={i * 0.1}>
                <div className="text-center">
                  <div className="text-5xl font-bold text-futuri-violet/20 mb-3">{s.step}</div>
                  <h3 className="text-lg font-bold text-white mb-2">{s.title}</h3>
                  <p className="text-sm text-white/50">{s.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-32">
        <div className="max-w-7xl mx-auto px-6">
          <AnimatedSection>
            <div className="relative rounded-3xl overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/20 via-futuri-navy to-pink-500/20" />
              <div className="relative z-10 px-8 py-20 md:px-16 md:py-24 text-center">
                <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-white mb-4">
                  Triple your output. Keep your team.
                </h2>
                <p className="text-lg text-white/50 max-w-xl mx-auto mb-8">
                  See how Futuri Content can help your team produce more with less.
                </p>
                <Link
                  href="/contact"
                  className="inline-flex px-8 py-4 text-base font-semibold rounded-xl bg-gradient-to-r from-violet-500 to-pink-500 text-white hover:shadow-xl hover:shadow-violet-500/25 transition-all duration-300 hover:-translate-y-0.5"
                >
                  Schedule a Demo
                </Link>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>
    </div>
  );
}
