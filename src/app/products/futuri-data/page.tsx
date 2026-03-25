"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import AnimatedSection from "@/components/AnimatedSection";

const features = [
  {
    title: "Real-Time Trend Detection",
    description:
      "Monitor 250,000+ trusted news sources and social platforms. Our AI scores every storyline for momentum, audience relevance, and peak interest timing.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
  {
    title: "Predictive Content Scoring",
    description:
      "Know which stories will trend before they peak. Our algorithms predict audience engagement with 88% accuracy, giving you a first-mover advantage.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
  },
  {
    title: "Audience Behavior Analytics",
    description:
      "Understand how your audience consumes content across every platform. Track engagement patterns, demographic shifts, and consumption preferences in real time.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
  },
  {
    title: "Hyperlocal Intelligence",
    description:
      "Automatically localize national stories and surface micro-trends unique to your market. From metro areas to individual zip codes.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
      </svg>
    ),
  },
  {
    title: "Market Intelligence Dashboards",
    description:
      "Executive-ready dashboards that visualize competitive landscape, audience share, and content performance. Customizable views for every stakeholder.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
      </svg>
    ),
  },
  {
    title: "API & Integrations",
    description:
      "Connect Futuri Data to your existing tech stack. Feed intelligence directly into your CMS, sales tools, and content workflows via robust APIs.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
      </svg>
    ),
  },
];

const metrics = [
  { value: "250K+", label: "Sources monitored" },
  { value: "88%", label: "Prediction accuracy" },
  { value: "<30s", label: "Trend detection speed" },
  { value: "24/7", label: "Always-on intelligence" },
];

export default function FuturiDataPage() {
  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative pt-40 pb-24 overflow-hidden">
        <div className="absolute inset-0 mesh-gradient" />
        <div className="absolute top-1/3 left-1/4 w-[600px] h-[600px] bg-futuri-cyan/8 rounded-full blur-[150px]" />

        <div className="relative z-10 max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="max-w-3xl"
          >
            <span className="inline-block text-sm font-semibold text-futuri-cyan uppercase tracking-widest mb-4">
              Futuri Data
            </span>
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[0.95] mb-6 text-white">
              Know what your
              <br />
              audience wants{" "}
              <span className="gradient-text-warm">before they do</span>
            </h1>
            <p className="text-xl text-white/50 leading-relaxed mb-8 max-w-2xl">
              Predictive audience intelligence powered by real-time analysis of 250,000+
              sources. Stop guessing. Start knowing.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/contact"
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:shadow-xl hover:shadow-cyan-500/25 transition-all duration-300 hover:-translate-y-0.5"
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
                  <div className="text-3xl sm:text-4xl font-bold gradient-text-warm mb-1">{m.value}</div>
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
              Intelligence at every layer
            </h2>
            <p className="text-lg text-white/50 max-w-2xl mx-auto">
              From macro trends to micro-market signals, Futuri Data gives your team
              the insights they need to act decisively.
            </p>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <AnimatedSection key={f.title} delay={i * 0.1}>
                <div className="glass rounded-2xl p-8 h-full hover:bg-white/[0.06] transition-all duration-300">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white mb-5">
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

      {/* Use Cases */}
      <section className="relative py-32">
        <div className="max-w-7xl mx-auto px-6">
          <AnimatedSection className="text-center mb-16">
            <h2 className="text-4xl font-bold tracking-tight text-white mb-4">
              Built for every media team
            </h2>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                title: "Newsrooms & Content Teams",
                desc: "Fill rundowns and editorial calendars with data-backed story picks. Know which stories will engage your specific audience before committing resources.",
              },
              {
                title: "Sales & Revenue Teams",
                desc: "Arm sellers with market intelligence that demonstrates authority. Use audience data to prove campaign value and identify advertiser opportunities.",
              },
              {
                title: "Programming & Strategy",
                desc: "Make programming decisions with confidence. Understand audience flow, competitive positioning, and optimal scheduling through real-time analytics.",
              },
              {
                title: "Executive Leadership",
                desc: "Dashboard-level visibility into audience trends, market share, and content performance. Data-driven decision making at the enterprise level.",
              },
            ].map((uc, i) => (
              <AnimatedSection key={uc.title} delay={i * 0.1}>
                <div className="glass rounded-2xl p-8 hover:bg-white/[0.06] transition-all">
                  <h3 className="text-xl font-bold text-white mb-3">{uc.title}</h3>
                  <p className="text-white/50 text-sm leading-relaxed">{uc.desc}</p>
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
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 via-futuri-navy to-blue-500/20" />
              <div className="relative z-10 px-8 py-20 md:px-16 md:py-24 text-center">
                <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-white mb-4">
                  Stop reacting. Start predicting.
                </h2>
                <p className="text-lg text-white/50 max-w-xl mx-auto mb-8">
                  See Futuri Data in action and discover what your audience wants next.
                </p>
                <Link
                  href="/contact"
                  className="inline-flex px-8 py-4 text-base font-semibold rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:shadow-xl hover:shadow-cyan-500/25 transition-all duration-300 hover:-translate-y-0.5"
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
