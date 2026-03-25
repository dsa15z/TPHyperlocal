"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import AnimatedSection from "@/components/AnimatedSection";

const features = [
  {
    title: "Real-time, geo-targeted delivery",
    description:
      "Deliver emergency information precisely where it's needed most. Geo-targeted alerts reach affected communities instantly across radio, mobile, streaming, and TV platforms.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
      </svg>
    ),
  },
  {
    title: "Multi-language support",
    description:
      "Alerts are delivered in the languages your community speaks. AI-powered translation matches local dialects to ensure critical information is understood by everyone.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
        <path strokeLinecap="round" strokeLinejoin="round" d="m10.5 21 5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 0 1 6-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364V3m0 2.364a48.028 48.028 0 0 1 0 0ZM9 5.25a48.667 48.667 0 0 0 0 0m3.334 2.364c2.675.178 5.28.535 7.8 1.058" />
      </svg>
    ),
  },
  {
    title: "24/7 multi-platform operation",
    description:
      "BEACON operates around the clock across radio, mobile, streaming, and TV. When emergencies strike at any hour, your community receives immediate, life-saving information.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  },
  {
    title: "Encrypted government integration",
    description:
      "Secure, encrypted integration with government sources ensures alert accuracy and reliability. BEACON meets the highest standards for emergency broadcast compliance.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    ),
  },
];

export default function PublicSafetyPage() {
  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative pt-40 pb-24 overflow-hidden">
        <div className="absolute inset-0 mesh-gradient" />
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-red-500 via-amber-400 to-red-500 opacity-80" />

        <div className="relative z-10 max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="max-w-3xl"
          >
            <Link href="/industries" className="inline-flex items-center text-sm text-white/40 hover:text-futuri-cyan transition-colors mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 mr-1">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              All Industries
            </Link>
            <span className="inline-block text-sm font-semibold text-futuri-cyan uppercase tracking-widest mb-4">
              Public Safety
            </span>
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[0.95] mb-6 text-white">
              Keeping you safe
              <br />
              <span className="gradient-text-warm">— always</span>
            </h1>
            <p className="text-xl text-white/50 leading-relaxed max-w-2xl">
              Real-time, multilingual emergency alerts that protect your community.
            </p>
          </motion.div>
        </div>
      </section>

      {/* BEACON Product */}
      <section className="relative py-32">
        <div className="max-w-7xl mx-auto px-6">
          <AnimatedSection>
            <div className="glass-strong rounded-2xl p-8 md:p-12 max-w-4xl mx-auto text-center">
              <span className="inline-block text-sm font-semibold text-amber-400 uppercase tracking-widest mb-4">
                Introducing
              </span>
              <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-white mb-6">
                BEACON&trade;
              </h2>
              <p className="text-lg text-white/50 leading-relaxed max-w-2xl mx-auto mb-6">
                The world&apos;s first AI-powered emergency broadcast system.
                Purpose-built to deliver life-saving information to every community
                member, in every language, on every platform.
              </p>
              <div className="inline-flex items-center gap-2 glass rounded-full px-5 py-2.5">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-amber-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                </svg>
                <span className="text-sm text-white/70">
                  Selected exclusively by FEMA to develop BEACON&trade;
                </span>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Features */}
      <section className="relative py-32">
        <div className="max-w-7xl mx-auto px-6">
          <AnimatedSection className="text-center mb-16">
            <h2 className="text-4xl font-bold tracking-tight text-white mb-4">
              BEACON&trade; capabilities
            </h2>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 gap-6">
            {features.map((feature, i) => (
              <AnimatedSection key={feature.title} delay={i * 0.1}>
                <div className="glass rounded-2xl p-8 h-full hover:bg-white/[0.06] transition-all">
                  <div className="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-amber-400 mb-5">
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-white/50 leading-relaxed">
                    {feature.description}
                  </p>
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
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/20 via-futuri-navy to-amber-400/10" />
              <div className="relative z-10 px-8 py-20 md:px-16 md:py-24 text-center">
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-4 max-w-3xl mx-auto">
                  Protect your community with AI-powered emergency broadcast
                </h2>
                <p className="text-lg text-white/50 max-w-xl mx-auto mb-8">
                  Learn how BEACON&trade; can safeguard your listeners and viewers.
                </p>
                <Link
                  href="/contact"
                  className="px-8 py-4 text-base font-semibold rounded-xl bg-gradient-to-r from-futuri-accent to-futuri-cyan text-white hover:shadow-xl hover:shadow-futuri-accent/25 transition-all duration-300 hover:-translate-y-0.5 inline-block"
                >
                  Request a Demo
                </Link>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>
    </div>
  );
}
