"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import AnimatedSection from "@/components/AnimatedSection";

const features = [
 {
  title: "AI Prospect Research",
  description:
   "Enter a prospect URL and get a complete intelligence dossier: market analysis, competitive landscape, audience demographics, and co-op funding opportunities.",
  icon: (
   <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
   </svg>
  ),
 },
 {
  title: "Instant Presentation Builder",
  description:
   "Generate data-driven pitch decks and infographics automatically. Visual, persuasive presentations that demonstrate your value proposition in minutes.",
  icon: (
   <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
   </svg>
  ),
 },
 {
  title: "Spec Commercial Generation",
  description:
   "Create polished audio and video spec commercials during the sales meeting. Input a client URL, choose a voice, and present a finished ad on the spot.",
  icon: (
   <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
   </svg>
  ),
 },
 {
  title: "Prospect Personality Profiling",
  description:
   "AI-built personality and communication profiles for every prospect. Know their decision-making style, priorities, and preferred engagement approach.",
  icon: (
   <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
   </svg>
  ),
 },
 {
  title: "Revenue Attribution",
  description:
   "Track every deal from first touch to close. Prove ROI with attribution analytics that connect your sales activities to real revenue outcomes.",
  icon: (
   <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
   </svg>
  ),
 },
 {
  title: "Co-op & Funding Discovery",
  description:
   "Automatically uncover cooperative advertising funds and vendor programs your prospects can tap into. Turn budget objections into closed deals.",
  icon: (
   <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
   </svg>
  ),
 },
];

const metrics = [
 { value: "11x", label: "Average ROI" },
 { value: "10+", label: "Hours saved per rep/week" },
 { value: "44%", label: "Higher email engagement" },
 { value: "1M+", label: "Spec ads created" },
];

export default function FuturiSalesPage() {
 return (
  <div className="relative">
   {/* Hero */}
   <section className="relative pt-40 pb-24 overflow-hidden">
    <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-futuri-accent to-emerald-500 opacity-60" />
    <div className="absolute inset-0 mesh-gradient" />
    <div className="absolute top-1/3 left-1/3 w-[600px] h-[600px] bg-futuri-blue/8 rounded-full blur-[150px]" />

    <div className="relative z-10 max-w-7xl mx-auto px-6">
     <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7 }}
      className="max-w-3xl"
     >
      <span className="inline-block text-sm font-semibold text-futuri-accent uppercase tracking-widest mb-4">
       Futuri Sales
      </span>
      <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[0.95] mb-6 text-white">
       Close bigger deals
       <br />
       <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
        in less time
       </span>
      </h1>
      <p className="text-xl text-white/50 leading-relaxed mb-8 max-w-2xl">
       Powered by your data lakehouse. AI-generated research, presentations,
       prospect intelligence, and spec creative — all surfaced from FDP golden records.
      </p>
      <div className="flex flex-col sm:flex-row gap-4">
       <Link
        href="/contact"
        className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-xl bg-gradient-to-r from-futuri-accent to-emerald-500 text-white hover:shadow-xl hover:shadow-futuri-accent/25 transition-all duration-300 hover:-translate-y-0.5"
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
         <div className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent mb-1">
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
       Everything your reps need to win
      </h2>
      <p className="text-lg text-white/50 max-w-2xl mx-auto">
       From prospect research to spec creative to closed deal — Futuri Sales
       compresses the entire sales cycle into a single platform.
      </p>
     </AnimatedSection>

     <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {features.map((f, i) => (
       <AnimatedSection key={f.title} delay={i * 0.1}>
        <div className="glass rounded-2xl p-8 h-full hover:bg-white/[0.06] transition-all duration-300">
         <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-400 to-emerald-500 flex items-center justify-center text-white mb-5">
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

   {/* Sales Workflow */}
   <section className="relative py-32">
    <div className="max-w-7xl mx-auto px-6">
     <AnimatedSection className="text-center mb-16">
      <h2 className="text-4xl font-bold tracking-tight text-white mb-4">
       The AI-powered sales meeting
      </h2>
      <p className="text-lg text-white/50 max-w-2xl mx-auto">
       Walk into every meeting with the intelligence and creative assets
       that used to take a week to prepare.
      </p>
     </AnimatedSection>

     <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
      {[
       {
        before: "Hours researching prospects manually",
        after: "Complete prospect dossier generated in seconds",
       },
       {
        before: "Generic pitch decks with stale data",
        after: "Custom data-driven presentations per prospect",
       },
       {
        before: "Days waiting for spec creative from production",
        after: "Spec commercials created live in the meeting",
       },
       {
        before: "Guessing which prospects to prioritize",
        after: "AI-scored lead prioritization with revenue signals",
       },
      ].map((item, i) => (
       <AnimatedSection key={i} delay={i * 0.1}>
        <div className="glass rounded-2xl p-6">
         <div className="flex items-start gap-4 mb-4">
          <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
           <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
           </svg>
          </div>
          <p className="text-sm text-white/40 line-through">{item.before}</p>
         </div>
         <div className="flex items-start gap-4">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
           <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
           </svg>
          </div>
          <p className="text-sm text-white/80 font-medium">{item.after}</p>
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
       <div className="absolute inset-0 bg-gradient-to-br from-futuri-accent/20 via-futuri-navy to-emerald-500/20" />
       <div className="relative z-10 px-8 py-20 md:px-16 md:py-24 text-center">
        <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-white mb-4">
         Give every rep a superpower.
        </h2>
        <p className="text-lg text-white/50 max-w-xl mx-auto mb-8">
         See how Futuri Sales can accelerate your revenue growth.
        </p>
        <Link
         href="/contact"
         className="inline-flex px-8 py-4 text-base font-semibold rounded-xl bg-gradient-to-r from-futuri-accent to-emerald-500 text-white hover:shadow-xl hover:shadow-futuri-accent/25 transition-all duration-300 hover:-translate-y-0.5"
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
