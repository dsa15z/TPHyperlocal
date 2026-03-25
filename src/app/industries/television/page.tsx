"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import AnimatedSection from "@/components/AnimatedSection";

const sections = [
  {
    title: "Increase market share profitably",
    description:
      "With 15 years in the media trenches, we know what\u2019s possible. Futuri has created a suite of AI-enabled products to help TV build local market connections, create timely content for every platform, and meet the demands of today\u2019s audiences.",
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
      </svg>
    ),
  },
  {
    title: "Grow your revenue",
    description:
      "Sales enablement solutions designed for television teams. From AI-powered prospecting to spec spot creation and data-backed presentations, Futuri helps your sales team close bigger deals faster and stand out in a competitive marketplace.",
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  },
  {
    title: "Meet your audience\u2019s demand for more content",
    description:
      "Real-time trend data from social media and 250,000+ news sources helps your newsroom identify stories before they break. AI-powered content creation tools let you produce more content across every platform without adding headcount.",
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
      </svg>
    ),
  },
];

export default function TelevisionPage() {
  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative pt-40 pb-24 overflow-hidden">
        <div className="absolute inset-0 mesh-gradient" />
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-futuri-accent via-futuri-cyan to-futuri-violet opacity-80" />

        <div className="relative z-10 max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="max-w-3xl"
          >
            <Link
              href="/industries"
              className="inline-flex items-center text-sm text-white/40 hover:text-futuri-cyan transition-colors mb-6"
            >
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              All Industries
            </Link>
            <span className="inline-block text-sm font-semibold text-futuri-cyan uppercase tracking-widest mb-4">
              Television
            </span>
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[0.95] mb-6 text-white">
              Grow your share
              <br />
              <span className="gradient-text">of TV News</span>
            </h1>
            <p className="text-xl text-white/50 leading-relaxed max-w-2xl">
              Hire an AI to uncover stories before they break, close bigger deals
              faster, and scale content creation.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Problem */}
      <section className="relative py-32">
        <div className="max-w-7xl mx-auto px-6">
          <AnimatedSection>
            <div className="glass-strong rounded-2xl p-8 md:p-12 max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold tracking-tight text-white mb-6">
                The challenge
              </h2>
              <p className="text-lg text-white/50 leading-relaxed">
                Broadcast and cable television have more competition than ever.
                Streaming and on-demand choices from platforms like Netflix, YouTube,
                and independent podcasts are taking consumers in new directions.
                Audiences are harder to attract and keep.
              </p>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Solutions */}
      <section className="relative py-32">
        <div className="max-w-7xl mx-auto px-6">
          <AnimatedSection className="text-center mb-16">
            <h2 className="text-4xl font-bold tracking-tight text-white mb-4">
              How Futuri helps television
            </h2>
          </AnimatedSection>

          <div className="grid md:grid-cols-3 gap-6">
            {sections.map((section, i) => (
              <AnimatedSection key={section.title} delay={i * 0.1}>
                <div className="glass rounded-2xl p-8 h-full">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-futuri-accent/20 to-futuri-cyan/20 flex items-center justify-center text-futuri-cyan mb-6">
                    {section.icon}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">
                    {section.title}
                  </h3>
                  <p className="text-sm text-white/40 leading-relaxed">
                    {section.description}
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
              <div className="absolute inset-0 bg-gradient-to-br from-futuri-accent/20 via-futuri-navy to-futuri-cyan/10" />
              <div className="relative z-10 px-8 py-20 md:px-16 md:py-24 text-center">
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-4 max-w-3xl mx-auto">
                  Television brands that embrace AI and innovation are poised to
                  survive and thrive in today&apos;s ever-evolving media landscape.
                </h2>
                <p className="text-lg text-white/50 max-w-xl mx-auto mb-8">
                  See how Futuri can transform your television operation.
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
