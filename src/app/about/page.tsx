"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import AnimatedSection from "@/components/AnimatedSection";

const leadership = [
  {
    name: "Daniel Anstandig",
    title: "CEO & Co-Founder",
    bio: "Entrepreneur with deep media and technology roots. Holds 20+ patents in AI, broadcast, and safety tech. Co-founded SparkTrade.io and HappiSeek.",
  },
  {
    name: "Tracy Gilliam",
    title: "Chief Growth Officer",
    bio: "25-year media veteran and former journalist. Founded TopLine Matters, acquired by Futuri in 2015. Drives enterprise growth strategy.",
  },
  {
    name: "Derek Anderson",
    title: "Chief Product Officer",
    bio: "20+ year product and data executive with deep SaaS and marketplace experience. Leads platform strategy and product innovation.",
  },
  {
    name: "Dana Bojcic",
    title: "SVP, Talent Development",
    bio: "20+ years in media sales training and recruitment. Builds the teams and programs that drive client success.",
  },
  {
    name: "Dan Wise",
    title: "SVP Finance",
    bio: "Corporate finance and product strategy specialist. Guides financial planning and strategic investment across the platform.",
  },
  {
    name: "Craig Hahn",
    title: "VP/GM, Fusion",
    bio: "26+ years as a broadcasting executive. Former iHeartMedia SVP. Leads strategic partnerships and enterprise accounts.",
  },
];

const milestones = [
  { year: "2009", event: "Futuri founded with a mission to modernize media through technology" },
  { year: "2015", event: "Acquired TopLine Matters, expanding into sales enablement" },
  { year: "2018", event: "Launched TopicPulse, the industry's first AI content intelligence platform" },
  { year: "2020", event: "BEACON selected exclusively by FEMA for emergency broadcast AI" },
  { year: "2023", event: "Surpassed 7,000 clients across 22 countries" },
  { year: "2024", event: "Consolidated platform into three enterprise products: Data, Content, Sales" },
  { year: "2026", event: "Launched FuturiData Platform (FDP) — the industry's first purpose-built data lakehouse for media companies" },
];

export default function AboutPage() {
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
            <span className="inline-block text-sm font-semibold text-futuri-cyan uppercase tracking-widest mb-4">
              About Futuri
            </span>
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[0.95] mb-6 text-white">
              Building the future
              <br />
              <span className="gradient-text">of media</span>
            </h1>
            <p className="text-xl text-white/50 leading-relaxed max-w-2xl">
              For over 15 years, Futuri has pioneered AI technology that helps media
              companies do more with less. Today, we serve 7,000+ brands across 22
              countries with 20+ patents in AI, broadcast, and safety technology.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Mission */}
      <section className="relative py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <AnimatedSection>
              <h2 className="text-4xl font-bold tracking-tight text-white mb-6">
                Our mission
              </h2>
              <p className="text-lg text-white/50 leading-relaxed mb-6">
                Media companies face an impossible equation: audiences expect more content
                across more platforms, while teams are smaller than ever — and fragmented
                data stacks make it harder to see the full picture. We exist to solve
                that equation.
              </p>
              <p className="text-lg text-white/50 leading-relaxed">
                Futuri is not just a media tools company — we are an enterprise data
                intelligence platform. Our technology consolidates fragmented data stacks
                into a single purpose-built lakehouse, transforming how media companies
                understand their audiences, create content, and generate revenue. We
                don&apos;t replace your team — we multiply them.
              </p>
            </AnimatedSection>
            <AnimatedSection delay={0.2}>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { value: "15+", label: "Years of innovation" },
                  { value: "7,000+", label: "Clients worldwide" },
                  { value: "20+", label: "Patents held" },
                  { value: "9x", label: "Inc. 5000 honoree" },
                ].map((stat) => (
                  <div key={stat.label} className="glass rounded-2xl p-6 text-center">
                    <div className="text-2xl font-bold gradient-text mb-1">{stat.value}</div>
                    <div className="text-xs text-white/40">{stat.label}</div>
                  </div>
                ))}
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="relative py-32">
        <div className="max-w-7xl mx-auto px-6">
          <AnimatedSection className="text-center mb-16">
            <h2 className="text-4xl font-bold tracking-tight text-white mb-4">
              Our journey
            </h2>
          </AnimatedSection>

          <div className="max-w-3xl mx-auto">
            {milestones.map((m, i) => (
              <AnimatedSection key={m.year} delay={i * 0.1}>
                <div className="flex gap-6 mb-8 last:mb-0">
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full glass flex items-center justify-center text-sm font-bold text-futuri-cyan shrink-0">
                      {m.year}
                    </div>
                    {i < milestones.length - 1 && (
                      <div className="w-px h-full bg-white/10 my-2" />
                    )}
                  </div>
                  <div className="pt-3 pb-8">
                    <p className="text-white/70 text-sm leading-relaxed">{m.event}</p>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Leadership */}
      <section id="team" className="relative py-32">
        <div className="max-w-7xl mx-auto px-6">
          <AnimatedSection className="text-center mb-16">
            <h2 className="text-4xl font-bold tracking-tight text-white mb-4">
              Leadership
            </h2>
            <p className="text-lg text-white/50 max-w-2xl mx-auto">
              Decades of media, technology, and enterprise experience driving innovation.
            </p>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {leadership.map((person, i) => (
              <AnimatedSection key={person.name} delay={i * 0.1}>
                <div className="glass rounded-2xl p-8 h-full hover:bg-white/[0.06] transition-all">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-futuri-accent to-futuri-cyan flex items-center justify-center text-white font-bold text-lg mb-4">
                    {person.name.split(" ").map(n => n[0]).join("")}
                  </div>
                  <h3 className="text-lg font-bold text-white">{person.name}</h3>
                  <p className="text-sm text-futuri-cyan mb-3">{person.title}</p>
                  <p className="text-sm text-white/40 leading-relaxed">{person.bio}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="relative py-32">
        <div className="max-w-7xl mx-auto px-6">
          <AnimatedSection className="text-center mb-16">
            <h2 className="text-4xl font-bold tracking-tight text-white mb-4">
              What drives us
            </h2>
          </AnimatedSection>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: "Innovation First",
                desc: "20+ patents and counting. We don't follow trends — we create the technology that defines them.",
              },
              {
                title: "Client Obsessed",
                desc: "Every feature starts with a client problem. Our VIP support and hands-on onboarding prove our commitment.",
              },
              {
                title: "Enterprise Grade",
                desc: "Built for scale, security, and reliability. Trusted by the world's largest media companies to run mission-critical workflows.",
              },
            ].map((v, i) => (
              <AnimatedSection key={v.title} delay={i * 0.1}>
                <div className="glass rounded-2xl p-8 h-full text-center">
                  <h3 className="text-xl font-bold text-white mb-3">{v.title}</h3>
                  <p className="text-sm text-white/50 leading-relaxed">{v.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="careers" className="relative py-32">
        <div className="max-w-7xl mx-auto px-6">
          <AnimatedSection>
            <div className="relative rounded-3xl overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-futuri-accent/20 via-futuri-navy to-futuri-cyan/10" />
              <div className="relative z-10 px-8 py-20 md:px-16 md:py-24 text-center">
                <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-white mb-4">
                  Join the team building the future of media
                </h2>
                <p className="text-lg text-white/50 max-w-xl mx-auto mb-8">
                  We&apos;re always looking for talented people who want to make an impact.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link
                    href="/contact"
                    className="px-8 py-4 text-base font-semibold rounded-xl bg-gradient-to-r from-futuri-accent to-futuri-cyan text-white hover:shadow-xl hover:shadow-futuri-accent/25 transition-all duration-300 hover:-translate-y-0.5"
                  >
                    Get in Touch
                  </Link>
                </div>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>
    </div>
  );
}
