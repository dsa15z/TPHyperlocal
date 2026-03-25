"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import AnimatedSection from "@/components/AnimatedSection";

const products = [
 {
  name: "Futuri Data",
  tagline: "Know More",
  description:
   "A purpose-built data lakehouse that ingests audience and advertiser data from CRMs, enrichment providers, and web sources — then resolves, cleans, and surfaces enterprise-grade golden records.",
  features: [
   "Visual Data Journey — source to gold",
   "Native entity resolution & matching",
   "Bidirectional CRM sync",
   "MCP Tool Registry for AI agents",
  ],
  href: "/products/futuri-data",
  gradient: "from-futuri-cyan to-blue-500",
  iconGradient: "from-cyan-400 to-blue-500",
  glowClass: "glow-green",
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
   "AI-powered content engine that turns data-driven insights into publish-ready audio, video, and text. From trending topic to finished asset in minutes, not days.",
  features: [
   "AI audio & video generation",
   "Automated content pipeline",
   "Brand-safe AI voices & personas",
   "Multi-platform distribution",
  ],
  href: "/products/futuri-content",
  gradient: "from-futuri-violet to-pink-500",
  iconGradient: "from-violet-400 to-pink-500",
  glowClass: "glow-red",
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
   "Enterprise sales enablement powered by your data lakehouse. AI-generated research, presentations, prospect intelligence, and spec creative — all in minutes.",
  features: [
   "AI-powered prospect research",
   "Instant presentation builder",
   "Spec commercial generation",
   "Revenue attribution analytics",
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

const dataJourneyStages = [
 { label: "SOURCE", sub: "5 feeds", color: "bg-red-500" },
 { label: "TRANSFORM", sub: "Normalize", color: "bg-orange-500" },
 { label: "QUALITY", sub: "Validate", color: "bg-emerald-500" },
 { label: "CDM", sub: "Unify", color: "bg-purple-500" },
 { label: "ENRICH", sub: "Augment", color: "bg-blue-500" },
 { label: "RESOLVE", sub: "Deduplicate", color: "bg-pink-500" },
 { label: "GOLD", sub: "Enterprise", color: "bg-futuri-cyan" },
];

const stats = [
 { value: "2.9M", label: "Records processed", color: "text-futuri-cyan" },
 { value: "1.4M", label: "Golden records out", color: "text-futuri-cyan" },
 { value: "96%", label: "Average quality", color: "text-futuri-cyan" },
 { value: "27.6K", label: "AI tool invocations", color: "text-futuri-accent" },
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
   "The data platform predicted trending stories with 88% accuracy. Our newsroom has never been more efficient or more relevant.",
  author: "Digital Director",
  company: "National Broadcast Network",
 },
 {
  quote:
   "I closed a $25,000 digital deal using a Futuri intelligence report. The data-driven approach gives us instant credibility with prospects.",
  author: "Account Executive",
  company: "Regional Media Company",
 },
];

export default function Home() {
 return (
  <div className="relative">
   {/* Hero Section — F1 inspired */}
   <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
    <div className="absolute inset-0 mesh-gradient" />
    <div className="absolute inset-0 grid-pattern" />

    {/* Racing-inspired gradient streaks */}
    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-futuri-accent via-futuri-cyan to-futuri-violet opacity-80" />
    <div className="absolute top-20 right-0 w-96 h-px bg-gradient-to-l from-futuri-accent/20 to-transparent" />
    <div className="absolute top-32 right-0 w-64 h-px bg-gradient-to-l from-futuri-cyan/30 to-transparent" />

    {/* Animated orbs */}
    <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-futuri-accent/10 rounded-full blur-[150px] animate-float" />
    <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-futuri-violet/20 rounded-full blur-[150px] animate-float" style={{ animationDelay: "-3s" }} />

    <div className="relative z-10 max-w-7xl mx-auto px-6 pt-32 pb-20 text-center">
     {/* Badge */}
     <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-xs text-white/70 mb-8 uppercase tracking-widest"
     >
      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
      Trusted by 7,000+ brands across 22 countries
     </motion.div>

     {/* Headline */}
     <motion.h1
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.1 }}
      className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[0.9] mb-6"
     >
      <span className="block text-white">Your Data.</span>
      <span className="block gradient-text">Race-Tuned.</span>
      <span className="block text-white/90 text-4xl sm:text-5xl md:text-6xl lg:text-7xl mt-2">Enterprise-Grade.</span>
     </motion.h1>

     {/* Subheadline */}
     <motion.p
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.2 }}
      className="max-w-3xl mx-auto text-lg sm:text-xl text-white/40 leading-relaxed mb-10"
     >
      Everything Databricks makes you build, Futuri ships out of the box.
      A purpose-built data lakehouse, content engine, and sales enablement
      platform — all integrated for media companies.
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
       href="#data-journey"
       className="px-8 py-4 text-base font-semibold rounded-xl glass text-white/80 hover:text-white hover:bg-white/10 transition-all duration-300"
      >
       See the Data Journey
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

   {/* Data Journey — The Pit Lane Telemetry */}
   <section id="data-journey" className="relative py-32 overflow-hidden">
    <div className="max-w-7xl mx-auto px-6">
     <AnimatedSection className="text-center mb-16">
      <p className="text-sm font-semibold text-futuri-cyan uppercase tracking-widest mb-4">
       The Data Journey
      </p>
      <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 text-white">
       From 5 raw sources to{" "}
       <span className="gradient-text-data">enterprise gold</span>
      </h2>
      <p className="text-lg text-white/40 max-w-2xl mx-auto">
       Like an F1 team&apos;s telemetry pipeline — every data point ingested,
       validated, enriched, resolved, and promoted to race-ready intelligence.
      </p>
     </AnimatedSection>

     {/* Pipeline visualization */}
     <AnimatedSection>
      <div className="glass rounded-2xl p-6 md:p-10 overflow-x-auto">
       {/* Top metrics */}
       <div className="flex items-center justify-between mb-8 text-xs font-mono text-white/30 uppercase tracking-widest">
        <span>2.9M records in</span>
        <span className="hidden sm:block">51% compression</span>
        <span>1.4M records out</span>
       </div>

       {/* Stage nodes */}
       <div className="flex items-center gap-2 md:gap-3 min-w-[640px]">
        {dataJourneyStages.map((stage, i) => (
         <div key={stage.label} className="flex items-center flex-1">
          <div className="flex-1 text-center">
           <div className={`w-full h-12 md:h-14 ${stage.color} rounded-lg flex items-center justify-center mb-2 opacity-90`}>
            <span className="text-[10px] md:text-xs font-bold font-mono text-white tracking-wider">
             {stage.label}
            </span>
           </div>
           <span className="text-[10px] text-white/30 font-mono">{stage.sub}</span>
          </div>
          {i < dataJourneyStages.length - 1 && (
           <svg className="w-4 h-4 text-white/15 mx-1 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
           </svg>
          )}
         </div>
        ))}
       </div>

       {/* Data flow line */}
       <div className="data-flow-line mt-6 rounded-full" />

       {/* Source labels */}
       <div className="flex flex-wrap gap-3 mt-6 justify-center">
        {["Salesforce CRM", "Dun & Bradstreet", "LinkedIn", "Web Crawlers", "SEC Filings"].map((s) => (
         <span key={s} className="text-[10px] font-mono text-white/20 px-2 py-1 rounded border border-white/5">
          {s}
         </span>
        ))}
       </div>
      </div>
     </AnimatedSection>
    </div>
   </section>

   {/* Stats — Pit Board */}
   <section className="relative py-16">
    <div className="max-w-7xl mx-auto px-6">
     <div className="glass rounded-2xl p-8 md:p-12 ">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
       {stats.map((stat, i) => (
        <AnimatedSection key={stat.label} delay={i * 0.1} className="text-center">
         <div className={`text-3xl sm:text-4xl font-bold font-mono ${stat.color} mb-1`}>
          {stat.value}
         </div>
         <div className="text-xs text-white/30 uppercase tracking-widest">{stat.label}</div>
        </AnimatedSection>
       ))}
      </div>
     </div>
    </div>
   </section>

   {/* Problem Statement */}
   <section className="relative py-32 overflow-hidden">
    <div className="max-w-7xl mx-auto px-6">
     <AnimatedSection className="text-center max-w-4xl mx-auto">
      <p className="text-sm font-semibold text-futuri-cyan uppercase tracking-widest mb-4">
       The challenge
      </p>
      <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6 text-white">
       Most media companies run on
       <br />
       <span className="gradient-text">7-12 disconnected systems.</span>
      </h2>
      <p className="text-xl text-white/40 leading-relaxed">
       No unified view of audiences. No unified view of advertisers. Data teams spend
       70-80% of their time on integration and maintenance. Futuri gives you one
       platform — the complete intelligence layer.
      </p>
     </AnimatedSection>
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
      <p className="text-lg text-white/40 max-w-2xl mx-auto">
       An integrated suite: data lakehouse, content engine, and sales enablement
       — purpose-built for media companies.
      </p>
     </AnimatedSection>

     <div className="grid lg:grid-cols-3 gap-6">
      {products.map((product, i) => (
       <AnimatedSection key={product.name} delay={i * 0.15}>
        <Link href={product.href} className="group block h-full">
         <div className={`relative h-full rounded-2xl glass p-8 hover:bg-white/[0.04] transition-all duration-500 overflow-hidden`}>
          <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${product.gradient} opacity-60`} />

          <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${product.iconGradient} flex items-center justify-center text-white mb-6 group-hover:scale-110 transition-transform duration-300`}>
           {product.icon}
          </div>

          <span className={`inline-block text-sm font-semibold uppercase tracking-[0.15em] bg-gradient-to-r ${product.gradient} bg-clip-text text-transparent mb-3`}>
           {product.tagline}
          </span>

          <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-futuri-cyan transition-colors">
           {product.name}
          </h3>

          <p className="text-white/40 leading-relaxed mb-6 text-sm">
           {product.description}
          </p>

          <ul className="space-y-2.5 mb-8">
           {product.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5 text-sm text-white/50">
             <svg className="w-4 h-4 text-futuri-cyan mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
             </svg>
             {feature}
            </li>
           ))}
          </ul>

          <div className="flex items-center gap-2 text-sm font-medium text-white/40 group-hover:text-futuri-cyan transition-colors">
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

   {/* Competitive Comparison — like a pit board */}
   <section className="relative py-32">
    <div className="max-w-7xl mx-auto px-6">
     <AnimatedSection className="text-center mb-16">
      <p className="text-sm font-semibold text-futuri-cyan uppercase tracking-widest mb-4">
       FDP vs The Field
      </p>
      <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 text-white">
       What ships out of the box
      </h2>
     </AnimatedSection>

     <AnimatedSection>
      <div className="glass rounded-2xl overflow-hidden">
       <div className="overflow-x-auto">
        <table className="w-full text-sm">
         <thead>
          <tr className="border-b border-white/5">
           <th className="text-left px-6 py-4 text-xs font-mono text-white/30 uppercase tracking-wider">Capability</th>
           <th className="text-center px-4 py-4 text-xs font-mono text-futuri-cyan uppercase tracking-wider">FDP</th>
           <th className="text-center px-4 py-4 text-xs font-mono text-white/30 uppercase tracking-wider">Databricks</th>
           <th className="text-center px-4 py-4 text-xs font-mono text-white/30 uppercase tracking-wider">Snowflake</th>
          </tr>
         </thead>
         <tbody className="font-mono">
          {[
           ["Visual Data Journey Pipeline", true, false, false],
           ["CRM Sync (Salesforce, HubSpot)", true, false, false],
           ["Entity Resolution & Matching", true, false, false],
           ["AI Agent Tools (MCP Registry)", true, false, false],
           ["Data Quality (Great Expectations)", true, "partial", "partial"],
           ["Data Product Marketplace", true, "partial", true],
           ["SQL Editor with AI Assist", true, true, true],
           ["Pipeline Orchestration", true, true, "partial"],
          ].map(([cap, fdp, db, sf], i) => (
           <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
            <td className="px-6 py-3 text-white/60 text-xs">{cap as string}</td>
            <td className="text-center px-4 py-3">
             {fdp === true && <span className="text-futuri-cyan">&#10003;</span>}
             {fdp === "partial" && <span className="text-futuri-accent">~</span>}
             {fdp === false && <span className="text-white/20">&#10005;</span>}
            </td>
            <td className="text-center px-4 py-3">
             {db === true && <span className="text-white/40">&#10003;</span>}
             {db === "partial" && <span className="text-white/20">~</span>}
             {db === false && <span className="text-white/10">&#10005;</span>}
            </td>
            <td className="text-center px-4 py-3">
             {sf === true && <span className="text-white/40">&#10003;</span>}
             {sf === "partial" && <span className="text-white/20">~</span>}
             {sf === false && <span className="text-white/10">&#10005;</span>}
            </td>
           </tr>
          ))}
         </tbody>
        </table>
       </div>
      </div>
     </AnimatedSection>
    </div>
   </section>

   {/* How It Works — Flywheel */}
   <section className="relative py-32">
    <div className="max-w-7xl mx-auto px-6">
     <AnimatedSection className="text-center mb-20">
      <p className="text-sm font-semibold text-futuri-cyan uppercase tracking-widest mb-4">
       The Flywheel
      </p>
      <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 text-white">
       Data in. Revenue out.
      </h2>
     </AnimatedSection>

     <div className="grid md:grid-cols-3 gap-8">
      {[
       {
        step: "01",
        title: "Ingest & Resolve",
        desc: "Futuri Data pulls from CRMs, enrichment providers, web crawlers, and SEC filings. Entity resolution compresses 2.9M records into 1.4M golden records at 99% quality.",
        color: "text-futuri-cyan",
       },
       {
        step: "02",
        title: "Create & Publish",
        desc: "Futuri Content transforms data-driven insights into broadcast-ready audio, video, articles, and social content — automatically branded and localized.",
        color: "text-futuri-cyan",
       },
       {
        step: "03",
        title: "Pitch & Close",
        desc: "Futuri Sales arms your reps with AI-generated prospect intelligence, custom presentations, and spec commercials that close deals in a single meeting.",
        color: "text-futuri-accent",
       },
      ].map((item, i) => (
       <AnimatedSection key={item.step} delay={i * 0.15}>
        <div className="relative text-center p-8 glass rounded-2xl">
         <div className={`text-5xl font-bold font-mono ${item.color} opacity-20 mb-4`}>
          {item.step}
         </div>
         <h3 className="text-xl font-bold text-white mb-3">{item.title}</h3>
         <p className="text-white/40 text-sm leading-relaxed">{item.desc}</p>
        </div>
       </AnimatedSection>
      ))}
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
         <div className="flex gap-1 mb-4">
          {[...Array(5)].map((_, j) => (
           <svg key={j} className="w-4 h-4 text-futuri-accent" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
           </svg>
          ))}
         </div>
         <blockquote className="text-white/60 leading-relaxed text-sm flex-1 mb-6">
          &ldquo;{t.quote}&rdquo;
         </blockquote>
         <div>
          <div className="text-sm font-semibold text-white">{t.author}</div>
          <div className="text-xs text-white/30">{t.company}</div>
         </div>
        </div>
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
       <div className="absolute inset-0 bg-gradient-to-br from-futuri-accent/20 via-futuri-navy to-futuri-violet/20" />
       <div className="absolute inset-0 grid-pattern opacity-50" />
       <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-futuri-accent via-futuri-cyan to-futuri-violet" />

       <div className="relative z-10 px-8 py-20 md:px-16 md:py-28 text-center">
        <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white mb-6">
         Stop building.
         <br />
         <span className="gradient-text">Start racing.</span>
        </h2>
        <p className="text-lg text-white/40 max-w-xl mx-auto mb-10">
         Databricks gives you a compute engine. Futuri gives you the complete
         intelligence layer — out of the box.
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
