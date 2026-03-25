"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

const products = [
  { name: "Futuri Data", href: "/products/futuri-data", desc: "Data lakehouse & predictive intelligence" },
  { name: "Futuri Content", href: "/products/futuri-content", desc: "AI-powered content creation at scale" },
  { name: "Futuri Sales", href: "/products/futuri-sales", desc: "Sales enablement & revenue acceleration" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "glass-strong py-3 shadow-lg shadow-black/20"
          : "py-5 bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="relative">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-futuri-accent to-futuri-cyan flex items-center justify-center font-bold text-white text-lg group-hover:shadow-lg group-hover:shadow-futuri-accent/30 transition-shadow">
              F
            </div>
          </div>
          <span className="text-xl font-bold tracking-tight">
            FUTURI
          </span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden lg:flex items-center gap-1">
          {/* Products Dropdown */}
          <div
            className="relative"
            onMouseEnter={() => setProductsOpen(true)}
            onMouseLeave={() => setProductsOpen(false)}
          >
            <button className="px-4 py-2 text-sm text-white/70 hover:text-white transition-colors flex items-center gap-1">
              Platform
              <svg
                className={`w-4 h-4 transition-transform ${productsOpen ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <AnimatePresence>
              {productsOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.2 }}
                  className="absolute top-full left-0 mt-2 w-80 glass-strong rounded-xl overflow-hidden shadow-2xl"
                >
                  <div className="p-2">
                    {products.map((product) => (
                      <Link
                        key={product.name}
                        href={product.href}
                        className="block p-3 rounded-lg hover:bg-white/5 transition-colors group/item"
                      >
                        <div className="text-sm font-semibold text-white group-hover/item:text-futuri-cyan transition-colors">
                          {product.name}
                        </div>
                        <div className="text-xs text-white/50 mt-0.5">
                          {product.desc}
                        </div>
                      </Link>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Link href="/about" className="px-4 py-2 text-sm text-white/70 hover:text-white transition-colors">
            About
          </Link>
          <Link href="/contact" className="px-4 py-2 text-sm text-white/70 hover:text-white transition-colors">
            Contact
          </Link>
        </div>

        {/* CTA + Mobile */}
        <div className="flex items-center gap-3">
          <Link
            href="/contact"
            className="hidden sm:inline-flex px-5 py-2.5 text-sm font-medium rounded-lg bg-gradient-to-r from-futuri-accent to-futuri-cyan text-white hover:shadow-lg hover:shadow-futuri-accent/25 transition-all duration-300 hover:-translate-y-0.5"
          >
            Request Demo
          </Link>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden p-2 text-white/70 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden glass-strong mt-2 mx-4 rounded-xl overflow-hidden"
          >
            <div className="p-4 space-y-1">
              <p className="text-xs text-white/40 uppercase tracking-widest px-3 py-2">Platform</p>
              {products.map((product) => (
                <Link
                  key={product.name}
                  href={product.href}
                  onClick={() => setMobileOpen(false)}
                  className="block px-3 py-2.5 text-sm text-white/80 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                  {product.name}
                </Link>
              ))}
              <div className="border-t border-white/10 my-2" />
              <Link href="/about" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 text-sm text-white/80 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                About
              </Link>
              <Link href="/contact" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 text-sm text-white/80 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                Contact
              </Link>
              <div className="pt-2">
                <Link
                  href="/contact"
                  onClick={() => setMobileOpen(false)}
                  className="block w-full text-center px-5 py-2.5 text-sm font-medium rounded-lg bg-gradient-to-r from-futuri-accent to-futuri-cyan text-white"
                >
                  Request Demo
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
