"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import AnimatedSection from "@/components/AnimatedSection";

const features = [
 {
  title: "Visual Data Journey",
  description:
   "The platform's signature feature. See your entire pipeline end-to-end — from 5 raw sources through 10 processing stages to enterprise gold tables. Not code. A visual narrative anyone can follow.",
  icon: (
   <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
   </svg>
  ),
 },
 {
  title: "Entity Resolution Engine",
  description:
   "Native Match & Merge with Trust & Survivorship rules. In production: 2.5M records compressed to 1.4M golden records at 94% match quality. No Zingg, no custom ML pipelines, no third-party tools.",
  icon: (
   <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
   </svg>
  ),
 },
 {
  title: "Bidirectional CRM Sync",
  description:
   "Native Salesforce and HubSpot integration. Data lake is the system of record — CRMs are ingestion sources and optional write-back targets. All historical data preserved with Delta Lake time travel.",
  icon: (
   <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" />
   </svg>
  ),
 },
 {
  title: "MCP AI Agent Tools",
  description:
   "Publish callable tools for AI agents — query datasets, search knowledge, trace lineage. 27,600 invocations in production. 248ms average latency. Permission-scoped. No competitor has this.",
  icon: (
   <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
   </svg>
  ),
 },
 {
  title: "Data Products Marketplace",
  description:
   "Publish curated data products with medallion tier badges (bronze, silver, gold), version control, domain tagging, and contract-based governance. Self-service consumption for your entire org.",
  icon: (
   <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.15c0 .415.336.75.75.75z" />
   </svg>
  ),
 },
 {
  title: "Inline Data Quality",
  description:
   "Great Expectations baked in — not bolted on. Quality scores visible at every stage of the Data Journey: 97% CRM, 98% D&B, 92% LinkedIn, 88% web crawl. Continuous validation, not after-the-fact.",
  icon: (
   <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
   </svg>
  ),
 },
];

const metrics = [
 { value: "2.9M", label: "Records ingested" },
 { value: "1.4M", label: "Golden records" },
 { value: "96%", label: "Avg quality score" },
 { value: "27.6K", label: "AI tool invocations" },
];

const dataJourneyDetail = [
 { stage: "Source", color: "bg-red-500", records: "2.9M", nodes: "Salesforce, D&B, LinkedIn, Web, SEC" },
 { stage: "Transform", color: "bg-orange-500", records: "2.9M", nodes: "Schema normalize, parse & extract" },
 { stage: "Quality", color: "bg-emerald-500", records: "2.9M", nodes: "Validate per source (88-98%)" },
 { stage: "Cleanup", color: "bg-teal-500", records: "2.5M", nodes: "Dedup & clean per source" },
 { stage: "CDM", color: "bg-purple-500", records: "2.5M", nodes: "Common Data Model unification" },
 { stage: "Enrichment", color: "bg-blue-500", records: "2.5M", nodes: "Industry, geo, revenue estimation" },
 { stage: "Resolution", color: "bg-pink-500", records: "1.4M", nodes: "Match & merge (44% compression)" },
 { stage: "Survivorship", color: "bg-green-500", records: "1.4M", nodes: "Trust & survivorship rules (97%)" },
 { stage: "Enterprise Gold", color: "bg-futuri-cyan", records: "1.4M", nodes: "99% quality, production-ready" },
];

export default function FuturiDataPage() {
 return (
  <div className="relative">
   {/* Hero */}
   <section className="relative pt-40 pb-24 overflow-hidden">
    <div className="absolute inset-0 mesh-gradient" />
    <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-futuri-cyan via-futuri-cyan to-futuri-blue opacity-60" />
    <div className="absolute top-1/3 left-1/4 w-[600px] h-[600px] bg-futuri-cyan/5 rounded-full blur-[150px]" />

    <div className="relative z-10 max-w-7xl mx-auto px-6">
     <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7 }}
      className="max-w-3xl"
     >
      <span className="inline-block text-sm font-semibold text-futuri-cyan uppercase tracking-widest mb-4">
       Futuri Data &mdash; FDP
      </span>
      <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[0.9] mb-6 text-white">
       The complete
       <br />
       <span className="gradient-text-data">data intelligence</span>
       <br />
       platform
      </h1>
      <p className="text-xl text-white/40 leading-relaxed mb-4 max-w-2xl">
       A purpose-built data lakehouse for media companies. Everything
       Databricks makes you build, FDP ships out of the box.
      </p>
      <p className="text-sm text-white/25 font-mono mb-8">
       Delta Lake foundation &bull; Medallion architecture &bull; Entity resolution &bull; AI-native
      </p>
      <div className="flex flex-col sm:flex-row gap-4">
       <Link
        href="/contact"
        className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:shadow-xl hover:shadow-emerald-500/25 transition-all duration-300 hover:-translate-y-0.5"
       >
        Request a Demo
       </Link>
       <Link
        href="#journey"
        className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-xl glass text-white/80 hover:text-white hover:bg-white/10 transition-all"
       >
        See the Data Journey
       </Link>
      </div>
     </motion.div>
    </div>
   </section>

   {/* Metrics */}
   <section className="relative py-16">
    <div className="max-w-7xl mx-auto px-6">
     <div className="glass rounded-2xl p-8 md:p-12 ">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
       {metrics.map((m, i) => (
        <AnimatedSection key={m.label} delay={i * 0.1} className="text-center">
         <div className="text-3xl sm:text-4xl font-bold font-mono gradient-text-data mb-1">{m.value}</div>
         <div className="text-xs text-white/30 font-mono uppercase tracking-wider">{m.label}</div>
        </AnimatedSection>
       ))}
      </div>
     </div>
    </div>
   </section>

   {/* Data Journey Detail */}
   <section id="journey" className="relative py-32">
    <div className="max-w-7xl mx-auto px-6">
     <AnimatedSection className="text-center mb-16">
      <p className="text-sm font-semibold text-futuri-cyan uppercase tracking-widest mb-4">
       The Data Journey
      </p>
      <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-white mb-4">
       Nine stages. Zero custom code.
      </h2>
      <p className="text-lg text-white/40 max-w-2xl mx-auto">
       From 5 raw data sources through entity resolution to enterprise-grade golden records — visualized, validated, and governed at every step.
      </p>
     </AnimatedSection>

     <div className="space-y-3">
      {dataJourneyDetail.map((stage, i) => (
       <AnimatedSection key={stage.stage} delay={i * 0.06}>
        <div className="glass rounded-xl p-4 md:p-5 flex items-center gap-4 hover:bg-white/[0.03] transition-all">
         <div className={`w-3 h-3 rounded-full ${stage.color} shrink-0`} />
         <div className="w-28 shrink-0">
          <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">{stage.stage}</span>
         </div>
         <div className="flex-1 text-sm text-white/40">{stage.nodes}</div>
         <div className="text-sm font-mono font-bold text-white/60 shrink-0">{stage.records}</div>
        </div>
       </AnimatedSection>
      ))}
     </div>

     <AnimatedSection delay={0.6}>
      <div className="data-flow-line mt-6 rounded-full" />
      <p className="text-center text-xs font-mono text-white/20 mt-4">
       51% data compression &bull; 99% output quality &bull; All built in
      </p>
     </AnimatedSection>
    </div>
   </section>

   {/* Features */}
   <section id="features" className="relative py-32">
    <div className="max-w-7xl mx-auto px-6">
     <AnimatedSection className="text-center mb-16">
      <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-white mb-4">
       What ships natively
      </h2>
      <p className="text-lg text-white/40 max-w-2xl mx-auto">
       With Databricks you&apos;d need: Fivetran + dbt + Monte Carlo + Atlan + custom
       entity resolution + a data engineering team. FDP ships all of it.
      </p>
     </AnimatedSection>

     <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {features.map((f, i) => (
       <AnimatedSection key={f.title} delay={i * 0.1}>
        <div className="glass rounded-2xl p-8 h-full hover:bg-white/[0.04] transition-all duration-300">
         <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-white mb-5">
          {f.icon}
         </div>
         <h3 className="text-lg font-bold text-white mb-2">{f.title}</h3>
         <p className="text-sm text-white/40 leading-relaxed">{f.description}</p>
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
       Built for media. Purpose-built.
      </h2>
     </AnimatedSection>

     <div className="grid md:grid-cols-2 gap-8">
      {[
       {
        title: "Radio Broadcasting Groups",
        desc: "Unify audience data from streaming, over-the-air measurement, podcast downloads, and digital properties. Connect advertiser CRMs to audience intelligence for provable ROI.",
       },
       {
        title: "Television Broadcasters",
        desc: "Merge linear TV ratings, connected TV measurement, digital viewership, and website analytics into a coherent audience picture with entity resolution.",
       },
       {
        title: "Digital Publishers & Podcast Networks",
        desc: "Deduplicate audiences across web, app, newsletter, and audio platforms. Build unified listener/reader profiles that command premium CPMs.",
       },
       {
        title: "Advertising Agencies",
        desc: "Access governed audience intelligence, market-level insights, and campaign performance data through FDP's Data Products marketplace.",
       },
      ].map((uc, i) => (
       <AnimatedSection key={uc.title} delay={i * 0.1}>
        <div className="glass rounded-2xl p-8 hover:bg-white/[0.04] transition-all">
         <h3 className="text-xl font-bold text-white mb-3">{uc.title}</h3>
         <p className="text-white/40 text-sm leading-relaxed">{uc.desc}</p>
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
       <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/15 via-futuri-black to-cyan-500/10" />
       <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-futuri-cyan to-futuri-cyan" />
       <div className="relative z-10 px-8 py-20 md:px-16 md:py-24 text-center">
        <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-white mb-4">
         Replace your data stack with one platform.
        </h2>
        <p className="text-lg text-white/40 max-w-xl mx-auto mb-8">
         See the complete data journey — from raw CRM data to enterprise gold — in a single demo.
        </p>
        <Link
         href="/contact"
         className="inline-flex px-8 py-4 text-base font-semibold rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:shadow-xl hover:shadow-emerald-500/25 transition-all duration-300 hover:-translate-y-0.5"
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
