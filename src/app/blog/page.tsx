"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import AnimatedSection from "@/components/AnimatedSection";
import { posts } from "./data";

export default function BlogPage() {
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
              Blog
            </span>
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[0.95] mb-6 text-white">
              News &amp;{" "}
              <span className="gradient-text">Insights</span>
            </h1>
            <p className="text-xl text-white/50 leading-relaxed max-w-2xl">
              The latest from Futuri — case studies, research, and resources for
              media professionals.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Posts Grid */}
      <section className="relative py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-8">
            {posts.map((post, i) => (
              <AnimatedSection key={post.slug} delay={i * 0.1}>
                <Link href={`/blog/${post.slug}`} className="block h-full">
                  <div className="glass rounded-2xl p-8 h-full hover:bg-white/[0.06] transition-all duration-300 hover:-translate-y-1 group">
                    <span className="inline-block text-xs font-semibold uppercase tracking-widest text-futuri-cyan bg-futuri-cyan/10 px-3 py-1 rounded-full mb-4">
                      {post.category}
                    </span>
                    <h2 className="text-xl font-bold text-white mb-3 group-hover:text-futuri-cyan transition-colors leading-snug">
                      {post.title}
                    </h2>
                    <p className="text-sm text-white/40 leading-relaxed mb-6">
                      {post.excerpt}
                    </p>
                    <div className="flex items-center justify-between text-xs text-white/30 mt-auto pt-4 border-t border-white/5">
                      <span>{post.author}</span>
                      <div className="flex items-center gap-3">
                        <span>{post.date}</span>
                        <span className="w-1 h-1 rounded-full bg-white/20" />
                        <span>{post.readTime}</span>
                      </div>
                    </div>
                  </div>
                </Link>
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
                <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-white mb-4">
                  Ready to see Futuri in action?
                </h2>
                <p className="text-lg text-white/50 max-w-xl mx-auto mb-8">
                  Schedule a demo and discover how Futuri helps media companies
                  sell smarter, create faster, and know more.
                </p>
                <Link
                  href="/contact"
                  className="inline-block px-8 py-4 text-base font-semibold rounded-xl bg-gradient-to-r from-futuri-accent to-futuri-cyan text-white hover:shadow-xl hover:shadow-futuri-accent/25 transition-all duration-300 hover:-translate-y-0.5"
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
