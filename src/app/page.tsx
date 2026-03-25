"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import AnimatedSection from "@/components/AnimatedSection";

const products = [
  {
    name: "Futuri Data",
    tagline: "Know More",
    description:
      "Predictive audience intelligence that tells you what your market wants before they know it. Real-time trend analysis across 250,000+ sources, localized insights, and audience behavior modeling.",
    features: [
      "Real-time trend detection & prediction",
      "Audience behavior analytics",
      "Market intelligence dashboards",
      "Predictive content scoring",
    ],
    href: "/products/futuri-data",
    gradient: "from-futuri-cyan to-blue-500",
    iconGradient: "from-cyan-400 to-blue-500",
    glowClass: "glow-cyan",
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
      </svg>
    ),
  },
  {
    name: "Futuri Content",
    tagline: "Create Faster",
    description:
      "AI-powered content creation that turns insights into publish-ready audio, video, and text. From trending topic to finished asset in minutes, not days.",
    features: [
      "AI audio & video generation",
      "Automated content production",
      "Multi-format publishing",
      "Brand-safe AI voices & personas",
    ],
    href: "/products/futuri-content",
    gradient: "from-futuri-violet to-pink-500",
    iconGradient: "from-violet-400 to-pink-500",
    glowClass: "glow-violet",
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
      </svg>
    ),
  },
  {
    name: "Futuri Sales",
    tagline: "Sell Smarter",
    description:
      "Enterprise sales enablement that arms your team with AI-generated research, presentations, prospect intelligence, and spec creative — all in minutes.",
    features: [
      "AI-powered prospect research",
      "Instant presentation generation",
      "Spec commercial creation",
      "Revenue attribution & analytics",
    ],
    href: "/products/futuri-sales",
    gradient: "from-futuri-accent to-emerald-500",
    iconGradient: "from-blue-400 to-emerald-500",
    glowClass: "glow-blue",
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
  },
];

const stats = [
  { value: "7,000+", label: "Enterprise clients" },
  { value: "22", label: "Countries served" },
  { value: "20+", label: "Patents held" },
  { value: "1M+", label: "AI assets created" },
];

const testimonials = [
  {
    quote:
      "Futuri has fundamentally changed how our sales team operates. We went from spending hours on research to closing deals with AI-generated insights in minutes.",
    author: "VP of Sales",
    company: "Top 10 Media Group",
  },
  {
    quote:
      "The content intelligence platform predicted trending stories with 88% accuracy. Our newsroom has never been more efficient or more relevant.",
    author: "Digital Director",
    company: "National Broadcast Network",
  },
  {
    quote:
      "I closed a $25,000 digital deal using a Futuri Sales intelligence report. The data-driven approach gives us instant credibility with prospects.",
    author: "Account Executive",
    company: "Regional Media Company",
  },
];

const logos = [
  "iHeartMedia", "Cumulus", "Beasley", "Townsquare", "Audacy",
  "Salem", "Saga", "Midwest", "Zimmer", "Neuhoff",
];

export default function Home() {
  return (
    <div className="relative">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 mesh-gradient" />
        <div className="absolute inset-0 grid-pattern" />

        {/* Animated orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-futuri-accent/10 rounded-full blur-[128px] animate-float" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-futuri-cyan/10 rounded-full blur-[128px] animate-float" style={{ animationDelay: "-3s" }} />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-futuri-violet/10 rounded-full blur-[100px] animate-float" style={{ animationDelay: "-1.5s" }} />

        <div className="relative z-10 max-w-7xl mx-auto px-6 pt-32 pb-20 text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-xs text-white/70 mb-8"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Trusted by 7,000+ brands across 22 countries
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[0.95] mb-6"
          >
            <span className="block text-white">The Enterprise</span>
            <span className="block gradient-text">AI Platform</span>
            <span className="block text-white">for Media</span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="max-w-2xl mx-auto text-lg sm:text-xl text-white/50 leading-relaxed mb-10"
          >
            Three integrated platforms that turn data into content, content into
            revenue, and revenue into growth. Sell smarter. Create faster. Know more.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              href="/contact"
              className="px-8 py-4 text-base font-semibold rounded-xl bg-gradient-to-r from-futuri-accent to-futuri-cyan text-white hover:shadow-xl hover:shadow-futuri-accent/25 transition-all duration-300 hover:-translate-y-0.5"
            >
              Request a Demo
            </Link>
            <Link
              href="#platform"
              className="px-8 py-4 text-base font-semibold rounded-xl glass text-white/80 hover:text-white hover:bg-white/10 transition-all duration-300"
            >
              Explore the Platform
            </Link>
          </motion.div>

          {/* Scroll indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 1 }}
            className="mt-20"
          >
            <div className="w-6 h-10 rounded-full border-2 border-white/20 mx-auto flex justify-center">
              <motion.div
                animate={{ y: [0, 12, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="w-1.5 h-1.5 rounded-full bg-white/40 mt-2"
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Problem / Opportunity Section */}
      <section className="relative py-32 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <AnimatedSection className="text-center max-w-4xl mx-auto">
            <p className="text-sm font-semibold text-futuri-cyan uppercase tracking-widest mb-4">
              The challenge
            </p>
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6 text-white">
              Content demand is up{" "}
              <span className="gradient-text">5&times;</span>.
              <br />
              Media employment is down{" "}
              <span className="gradient-text">26%</span>.
            </h2>
            <p className="text-xl text-white/50 leading-relaxed">
              Your team is smaller. Your audience expects more. The gap between what you
              need to produce and what you can produce grows every quarter. Futuri closes
              that gap — same team, three times the output.
            </p>
          </AnimatedSection>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="relative py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="glass rounded-2xl p-8 md:p-12">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {stats.map((stat, i) => (
                <AnimatedSection key={stat.label} delay={i * 0.1} className="text-center">
                  <div className="text-3xl sm:text-4xl font-bold gradient-text mb-1">
                    {stat.value}
                  </div>
                  <div className="text-sm text-white/40">{stat.label}</div>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Platform Section */}
      <section id="platform" className="relative py-32">
        <div className="max-w-7xl mx-auto px-6">
          <AnimatedSection className="text-center mb-20">
            <p className="text-sm font-semibold text-futuri-cyan uppercase tracking-widest mb-4">
              The Platform
            </p>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 text-white">
              Three products. One competitive advantage.
            </h2>
            <p className="text-lg text-white/50 max-w-2xl mx-auto">
              An integrated suite that connects audience intelligence, content creation,
              and sales enablement into a single growth engine.
            </p>
          </AnimatedSection>

          <div className="grid lg:grid-cols-3 gap-6">
            {products.map((product, i) => (
              <AnimatedSection key={product.name} delay={i * 0.15}>
                <Link href={product.href} className="group block h-full">
                  <div className={`relative h-full rounded-2xl glass p-8 hover:bg-white/[0.06] transition-all duration-500 ${product.glowClass} hover:shadow-none overflow-hidden`}>
                    {/* Top accent line */}
                    <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r ${product.gradient} opacity-50`} />

                    {/* Icon */}
                    <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${product.iconGradient} flex items-center justify-center text-white mb-6 group-hover:scale-110 transition-transform duration-300`}>
                      {product.icon}
                    </div>

                    {/* Tag */}
                    <span className={`inline-block text-xs font-semibold uppercase tracking-widest bg-gradient-to-r ${product.gradient} bg-clip-text text-transparent mb-3`}>
                      {product.tagline}
                    </span>

                    {/* Name */}
                    <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-futuri-cyan transition-colors">
                      {product.name}
                    </h3>

                    {/* Description */}
                    <p className="text-white/50 leading-relaxed mb-6 text-sm">
                      {product.description}
                    </p>

                    {/* Features */}
                    <ul className="space-y-2.5 mb-8">
                      {product.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5 text-sm text-white/60">
                          <svg className="w-4 h-4 text-futuri-cyan mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                          {feature}
                        </li>
                      ))}
                    </ul>

                    {/* Link */}
                    <div className="flex items-center gap-2 text-sm font-medium text-white/60 group-hover:text-futuri-cyan transition-colors">
                      Learn more
                      <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </div>
                  </div>
                </Link>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="relative py-32">
        <div className="max-w-7xl mx-auto px-6">
          <AnimatedSection className="text-center mb-20">
            <p className="text-sm font-semibold text-futuri-cyan uppercase tracking-widest mb-4">
              How it works
            </p>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 text-white">
              Data in. Revenue out.
            </h2>
            <p className="text-lg text-white/50 max-w-2xl mx-auto">
              Futuri&apos;s three platforms form a flywheel: data informs content,
              content powers sales, and sales validates the data.
            </p>
          </AnimatedSection>

          <div className="relative">
            {/* Connection line */}
            <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-y-1/2" />

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  step: "01",
                  title: "Detect & Predict",
                  desc: "Futuri Data monitors 250,000+ sources in real time, scoring trends for momentum, audience fit, and peak timing. You see what matters before anyone else.",
                  color: "text-futuri-cyan",
                },
                {
                  step: "02",
                  title: "Create & Publish",
                  desc: "Futuri Content transforms those insights into broadcast-ready audio, video, articles, and social content — automatically branded, formatted, and localized.",
                  color: "text-futuri-violet",
                },
                {
                  step: "03",
                  title: "Pitch & Close",
                  desc: "Futuri Sales arms your reps with AI-generated prospect research, custom presentations, and spec commercials that close deals in a single meeting.",
                  color: "text-futuri-accent",
                },
              ].map((item, i) => (
                <AnimatedSection key={item.step} delay={i * 0.15}>
                  <div className="relative text-center p-8">
                    <div className={`text-6xl font-bold ${item.color} opacity-20 mb-4`}>
                      {item.step}
                    </div>
                    <h3 className="text-xl font-bold text-white mb-3">{item.title}</h3>
                    <p className="text-white/50 text-sm leading-relaxed">{item.desc}</p>
                  </div>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="relative py-32">
        <div className="max-w-7xl mx-auto px-6">
          <AnimatedSection className="text-center mb-16">
            <p className="text-sm font-semibold text-futuri-cyan uppercase tracking-widest mb-4">
              Trusted by leaders
            </p>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-white">
              What our clients say
            </h2>
          </AnimatedSection>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <AnimatedSection key={i} delay={i * 0.1}>
                <div className="glass rounded-2xl p-8 h-full flex flex-col">
                  {/* Stars */}
                  <div className="flex gap-1 mb-4">
                    {[...Array(5)].map((_, j) => (
                      <svg key={j} className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <blockquote className="text-white/70 leading-relaxed text-sm flex-1 mb-6">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                  <div>
                    <div className="text-sm font-semibold text-white">{t.author}</div>
                    <div className="text-xs text-white/40">{t.company}</div>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Logo Cloud */}
      <section className="relative py-20">
        <div className="max-w-7xl mx-auto px-6">
          <AnimatedSection className="text-center mb-12">
            <p className="text-sm text-white/40">
              Powering the world&apos;s leading media companies
            </p>
          </AnimatedSection>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
            {logos.map((logo, i) => (
              <AnimatedSection key={logo} delay={i * 0.05}>
                <span className="text-lg font-bold text-white/15 hover:text-white/30 transition-colors tracking-wide">
                  {logo}
                </span>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative py-32">
        <div className="max-w-7xl mx-auto px-6">
          <AnimatedSection>
            <div className="relative rounded-3xl overflow-hidden">
              {/* Background */}
              <div className="absolute inset-0 bg-gradient-to-br from-futuri-accent/20 via-futuri-navy to-futuri-violet/20" />
              <div className="absolute inset-0 grid-pattern opacity-50" />

              <div className="relative z-10 px-8 py-20 md:px-16 md:py-28 text-center">
                <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white mb-6">
                  Ready to transform your
                  <br />
                  <span className="gradient-text">media operation?</span>
                </h2>
                <p className="text-lg text-white/50 max-w-xl mx-auto mb-10">
                  See how Futuri&apos;s integrated platform can help your team sell smarter,
                  create faster, and know more — all from a single demo.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link
                    href="/contact"
                    className="px-8 py-4 text-base font-semibold rounded-xl bg-gradient-to-r from-futuri-accent to-futuri-cyan text-white hover:shadow-xl hover:shadow-futuri-accent/25 transition-all duration-300 hover:-translate-y-0.5"
                  >
                    Request a Demo
                  </Link>
                  <Link
                    href="/about"
                    className="px-8 py-4 text-base font-semibold rounded-xl glass text-white/80 hover:text-white hover:bg-white/10 transition-all duration-300"
                  >
                    Learn About Futuri
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
