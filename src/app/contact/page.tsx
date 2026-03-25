"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import AnimatedSection from "@/components/AnimatedSection";

export default function ContactPage() {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    title: "",
    product: "",
    message: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Form submission logic would go here
    alert("Thank you! Our team will be in touch within one business day.");
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative pt-40 pb-16 overflow-hidden">
        <div className="absolute inset-0 mesh-gradient" />

        <div className="relative z-10 max-w-7xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <span className="inline-block text-sm font-semibold text-futuri-cyan uppercase tracking-widest mb-4">
              Contact
            </span>
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-[0.95] mb-6 text-white">
              Let&apos;s talk about your
              <br />
              <span className="gradient-text">growth</span>
            </h1>
            <p className="text-xl text-white/50 leading-relaxed max-w-2xl mx-auto">
              Request a demo, ask a question, or explore how Futuri&apos;s platform can
              transform your media operation. Our team responds within one business day.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Form + Info */}
      <section className="relative py-16 pb-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-5 gap-12">
            {/* Form */}
            <AnimatedSection className="lg:col-span-3">
              <div className="glass rounded-2xl p-8 md:p-10">
                <h2 className="text-2xl font-bold text-white mb-6">Request a Demo</h2>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm text-white/60 mb-1.5">First Name *</label>
                      <input
                        type="text"
                        name="firstName"
                        required
                        value={formData.firstName}
                        onChange={handleChange}
                        className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-futuri-accent focus:ring-1 focus:ring-futuri-accent transition-colors text-sm"
                        placeholder="John"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-white/60 mb-1.5">Last Name *</label>
                      <input
                        type="text"
                        name="lastName"
                        required
                        value={formData.lastName}
                        onChange={handleChange}
                        className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-futuri-accent focus:ring-1 focus:ring-futuri-accent transition-colors text-sm"
                        placeholder="Smith"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-white/60 mb-1.5">Work Email *</label>
                    <input
                      type="email"
                      name="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-futuri-accent focus:ring-1 focus:ring-futuri-accent transition-colors text-sm"
                      placeholder="john@company.com"
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm text-white/60 mb-1.5">Company *</label>
                      <input
                        type="text"
                        name="company"
                        required
                        value={formData.company}
                        onChange={handleChange}
                        className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-futuri-accent focus:ring-1 focus:ring-futuri-accent transition-colors text-sm"
                        placeholder="Acme Media"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-white/60 mb-1.5">Job Title</label>
                      <input
                        type="text"
                        name="title"
                        value={formData.title}
                        onChange={handleChange}
                        className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-futuri-accent focus:ring-1 focus:ring-futuri-accent transition-colors text-sm"
                        placeholder="VP of Sales"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-white/60 mb-1.5">Interested In</label>
                    <select
                      name="product"
                      value={formData.product}
                      onChange={handleChange}
                      className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-futuri-accent focus:ring-1 focus:ring-futuri-accent transition-colors text-sm appearance-none"
                    >
                      <option value="" className="bg-futuri-navy">Select a product...</option>
                      <option value="data" className="bg-futuri-navy">Futuri Data</option>
                      <option value="content" className="bg-futuri-navy">Futuri Content</option>
                      <option value="sales" className="bg-futuri-navy">Futuri Sales</option>
                      <option value="platform" className="bg-futuri-navy">Full Platform</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-white/60 mb-1.5">Message</label>
                    <textarea
                      name="message"
                      rows={4}
                      value={formData.message}
                      onChange={handleChange}
                      className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-futuri-accent focus:ring-1 focus:ring-futuri-accent transition-colors text-sm resize-none"
                      placeholder="Tell us about your goals..."
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full px-8 py-4 text-base font-semibold rounded-xl bg-gradient-to-r from-futuri-accent to-futuri-cyan text-white hover:shadow-xl hover:shadow-futuri-accent/25 transition-all duration-300 hover:-translate-y-0.5"
                  >
                    Request Demo
                  </button>
                </form>
              </div>
            </AnimatedSection>

            {/* Sidebar */}
            <AnimatedSection delay={0.2} className="lg:col-span-2">
              <div className="space-y-6">
                {/* Office */}
                <div className="glass rounded-2xl p-8">
                  <h3 className="text-lg font-bold text-white mb-4">Headquarters</h3>
                  <p className="text-sm text-white/50 leading-relaxed">
                    301 Congress Avenue, 12th Floor
                    <br />
                    Austin, TX 78701
                  </p>
                </div>

                {/* Quick Links */}
                <div className="glass rounded-2xl p-8">
                  <h3 className="text-lg font-bold text-white mb-4">Quick links</h3>
                  <ul className="space-y-3">
                    <li>
                      <a href="mailto:info@futurimedia.com" className="text-sm text-futuri-cyan hover:text-white transition-colors">
                        info@futurimedia.com
                      </a>
                    </li>
                    <li>
                      <a href="https://www.linkedin.com/company/futuri-media" target="_blank" rel="noopener noreferrer" className="text-sm text-futuri-cyan hover:text-white transition-colors">
                        LinkedIn
                      </a>
                    </li>
                    <li>
                      <a href="https://x.com/fuaborz" target="_blank" rel="noopener noreferrer" className="text-sm text-futuri-cyan hover:text-white transition-colors">
                        X (Twitter)
                      </a>
                    </li>
                  </ul>
                </div>

                {/* Trust */}
                <div className="glass rounded-2xl p-8">
                  <h3 className="text-lg font-bold text-white mb-4">Why Futuri</h3>
                  <ul className="space-y-3">
                    {[
                      "7,000+ enterprise clients",
                      "22 countries served",
                      "20+ patents in AI & broadcast",
                      "9x Inc. 5000 fastest-growing",
                      "FEMA-selected technology partner",
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2.5 text-sm text-white/60">
                        <svg className="w-4 h-4 text-futuri-cyan shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>
    </div>
  );
}
