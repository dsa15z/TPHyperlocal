# Futuri Website

## Project Overview
Enterprise website for Futuri (futurimedia.com) — an AI-powered platform for media companies. The site positions Futuri as an enterprise sales enablement and data company with three consolidated products.

## Three Products
- **Futuri Data** — Audience intelligence & predictive analytics (formerly TopicPulse analytics)
- **Futuri Content** — AI-powered content creation at scale (formerly AudioAI, TopicPulse content, POST, Prep+)
- **Futuri Sales** — Sales enablement & revenue acceleration (formerly TopLine, SpotOn, LDR)

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS with custom theme
- **Animations**: Framer Motion
- **Icons**: Heroicons (inline SVG)

## Project Structure
```
src/
├── app/
│   ├── layout.tsx          # Root layout with Navbar + Footer
│   ├── page.tsx            # Homepage
│   ├── globals.css         # Global styles, glass effects, gradients
│   ├── about/page.tsx      # About page with leadership, timeline, values
│   ├── contact/page.tsx    # Contact/demo request form
│   └── products/
│       ├── futuri-data/page.tsx
│       ├── futuri-content/page.tsx
│       └── futuri-sales/page.tsx
├── components/
│   ├── Navbar.tsx           # Fixed nav with dropdown, mobile menu
│   ├── Footer.tsx           # Site footer with links
│   └── AnimatedSection.tsx  # Framer Motion scroll-reveal wrapper
```

## Design System
- **Theme**: Dark (navy #0B1437 background)
- **Glass morphism**: `glass` and `glass-strong` CSS classes for translucent cards
- **Gradients**: `gradient-text` for gradient text, product-specific color gradients
- **Colors**: See `tailwind.config.ts` for the `futuri` color palette
- **Typography**: Geist Sans/Mono (local fonts)

## Key Commands
```bash
npm run dev     # Development server
npm run build   # Production build
npm run start   # Start production server
npm run lint    # Run ESLint
```

## Brand Guidelines
- Company name: "Futuri" (not "Futuri Media" in most contexts)
- Tagline: "Sell smarter. Create faster. Know more."
- Enterprise positioning — avoid "tools" or "widgets" language
- Use "platform" and "enterprise" terminology
- HQ: 301 Congress Avenue, 12th Floor, Austin, TX 78701

## Key Stats (for social proof)
- 7,000+ enterprise clients
- 22 countries served
- 20+ patents in AI, broadcast, and safety tech
- 9x Inc. 5000 fastest-growing company
- 1M+ AI assets created
