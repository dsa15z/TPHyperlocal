"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import AnimatedSection from "@/components/AnimatedSection";
import type { BlogPost } from "../data";

interface Props {
  post: BlogPost;
  relatedPosts: BlogPost[];
}

export default function BlogPostContent({ post, relatedPosts }: Props) {
  const paragraphs = post.content.split("\n\n");

  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative pt-40 pb-16 overflow-hidden">
        <div className="absolute inset-0 mesh-gradient" />
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-futuri-accent via-futuri-cyan to-futuri-violet opacity-80" />

        <div className="relative z-10 max-w-4xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-futuri-cyan transition-colors mb-8"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
                />
              </svg>
              Back to Blog
            </Link>

            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-futuri-cyan bg-futuri-cyan/10 px-3 py-1 rounded-full mb-6">
              {post.category}
            </span>

            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1] mb-6 text-white">
              {post.title}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-sm text-white/40">
              <span className="font-medium text-white/60">{post.author}</span>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <span>{post.date}</span>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <span>{post.readTime}</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Content */}
      <section className="relative py-16">
        <div className="max-w-4xl mx-auto px-6">
          <AnimatedSection>
            <div className="glass-strong rounded-2xl p-8 md:p-12">
              {paragraphs.map((paragraph, i) => {
                const trimmed = paragraph.trim();
                if (!trimmed) return null;

                // Detect section headings (short lines without periods that act as titles)
                const isHeading =
                  trimmed.length < 80 &&
                  !trimmed.endsWith(".") &&
                  !trimmed.endsWith('"') &&
                  !trimmed.startsWith('"');

                if (isHeading) {
                  return (
                    <h2
                      key={i}
                      className="text-2xl font-bold text-white mt-10 mb-4 first:mt-0"
                    >
                      {trimmed}
                    </h2>
                  );
                }

                return (
                  <p
                    key={i}
                    className="text-base text-white/60 leading-relaxed mb-6 last:mb-0"
                  >
                    {trimmed}
                  </p>
                );
              })}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Related Posts */}
      <section className="relative py-32">
        <div className="max-w-7xl mx-auto px-6">
          <AnimatedSection className="mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-white">
              Related Posts
            </h2>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 gap-8">
            {relatedPosts.map((related, i) => (
              <AnimatedSection key={related.slug} delay={i * 0.1}>
                <Link href={`/blog/${related.slug}`} className="block h-full">
                  <div className="glass rounded-2xl p-8 h-full hover:bg-white/[0.06] transition-all duration-300 hover:-translate-y-1 group">
                    <span className="inline-block text-xs font-semibold uppercase tracking-widest text-futuri-cyan bg-futuri-cyan/10 px-3 py-1 rounded-full mb-4">
                      {related.category}
                    </span>
                    <h3 className="text-lg font-bold text-white mb-3 group-hover:text-futuri-cyan transition-colors leading-snug">
                      {related.title}
                    </h3>
                    <p className="text-sm text-white/40 leading-relaxed mb-4">
                      {related.excerpt}
                    </p>
                    <div className="flex items-center justify-between text-xs text-white/30 pt-4 border-t border-white/5">
                      <span>{related.author}</span>
                      <div className="flex items-center gap-3">
                        <span>{related.date}</span>
                        <span className="w-1 h-1 rounded-full bg-white/20" />
                        <span>{related.readTime}</span>
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
