"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import AnimatedSection from "@/components/AnimatedSection";

const sections = [
  {
    title: "Identifying stories before they break",
    description:
      "Real-time predictive data from social media and 250,000+ news sources surfaces the stories your audience will care about before your competitors publish them. Stay ahead of the news cycle with AI-powered trend intelligence.",
    gradient: "gradient-text-data",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
      </svg>
    ),
  },
  {
    title: "Drive impressions and break through the noise",
    description:
      "AI-powered editorial planning, content gap monitoring, and audience engagement tools that help you publish smarter. Identify what your readers want and deliver it consistently across every channel.",
    gradient: "gradient-text-content",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
      </svg>
    ),
  },
  {
    title: "Grow your revenue",
    description:
      "AI-powered sales enablement gives your ad team the tools to prospect smarter, create compelling presentations, and close deals faster. Turn your data into revenue opportunities.",
    gradient: "gradient-text-sales",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  },
];

export default function DigitalPublishersPage() {
  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative pt-40 pb-24 overflow-hidden">
        <div className="absolute inset-0 mesh-gradient" />
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-pink-500 via-futuri-violet to-pink-500 opacity-80" />

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
              Digital Publishers
            </span>
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[0.95] mb-6 text-white">
              Stand out in
              <br />
              <span className="gradient-text-content">a crowded space</span>
            </h1>
            <p className="text-xl text-white/50 leading-relaxed max-w-2xl">
              Content intelligence for the newsrooms of the future.
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
                Declining advertising income, new platforms, balancing free and paid
                content, fighting disinformation — the work of digital publishers is
                harder than ever before.
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
              How Futuri helps
            </h2>
          </AnimatedSection>

          <div className="space-y-8">
            {sections.map((section, i) => (
              <AnimatedSection key={section.title} delay={i * 0.1}>
                <div className="glass rounded-2xl p-8 md:p-10 hover:bg-white/[0.06] transition-all">
                  <div className="flex flex-col md:flex-row md:items-start gap-6">
                    <div className="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-futuri-cyan shrink-0">
                      {section.icon}
                    </div>
                    <div>
                      <h3 className={`text-2xl font-bold mb-3 ${section.gradient}`}>
                        {section.title}
                      </h3>
                      <p className="text-white/50 leading-relaxed">
                        {section.description}
                      </p>
                    </div>
                  </div>
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
              <div className="absolute inset-0 bg-gradient-to-br from-pink-500/20 via-futuri-navy to-futuri-violet/10" />
              <div className="relative z-10 px-8 py-20 md:px-16 md:py-24 text-center">
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-4 max-w-3xl mx-auto">
                  The future of digital publishing is AI-powered
                </h2>
                <p className="text-lg text-white/50 max-w-xl mx-auto mb-8">
                  See how Futuri can transform your newsroom.
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
