export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  author: string;
  category: string;
  excerpt: string;
  content: string;
  readTime: string;
}

export const posts: BlogPost[] = [
  {
    slug: "topicpulse-wsb-20-county-coverage",
    title: "How the South's Most Powerful Newsroom Uses TopicPulse to Break Stories Across 20 Counties",
    date: "January 29, 2026",
    author: "Fulani Clarke",
    category: "Case Studies",
    readTime: "8 min read",
    excerpt:
      "Cox Media Group's WSB (750 AM) and WSBB (95.5 FM) serve a massive 20-county metro area. By orchestrating TopicPulse as an ambient alert system, the newsroom now spots stories first.",
    content: `At a Glance

WSB has been known as "The Voice of the South" since 1922. Broadcasting at 50,000 watts on 750 AM and 100,000 watts on 95.5 FM, WSB and WSBB together serve a massive 20-county metro area across the Atlanta region. The station is also the flagship home of the Georgia Bulldogs, making it one of the most recognized call signs in American broadcasting. Under the leadership of News Director Ken Charles, the newsroom operates as a lean, high-performance team tasked with covering one of the largest metro footprints in the country.

The 20-County News Coverage Challenge

Covering 20 counties with a lean newsroom means localized blind spots are inevitable — especially in outlying counties where community sources often post breaking news to Facebook and Instagram long before any press release is issued. Small-town fire departments, school boards, and county commissions were sharing critical updates on social media, and the WSB team simply could not monitor every feed in every county around the clock. The risk was clear: competitors or digital-first outlets could beat WSB to stories that mattered to their audience.

The Solution: TopicPulse as an Ambient Alert System

WSB deployed TopicPulse with custom views configured for every county in their coverage area. Rather than relying on a single statewide feed, the newsroom set up county-level dashboards that surface hyperlocal stories as they emerge. The "Most Recent" view became the go-to for early discovery — allowing producers and reporters to catch stories in their earliest stages, often before they had gained any traction on traditional news wires. TopicPulse now runs on every screen in the WSB newsroom, functioning as an always-on ambient alert system that the entire team can glance at throughout the day.

As Ken Charles put it: "TopicPulse has become my boots on the ground in parts of the metro I can't cover. It picks up what people are talking about in counties where I don't have a reporter stationed, and it gives us the jump."

Results: Beating Competitors and Expanding Coverage

The impact has been significant across the board. WSB now consistently beats competitors to local stories, particularly in outlying counties where coverage was previously thin. The newsroom is producing more stories from every county in their footprint, giving audiences a reason to stay tuned. Reporters and producers spend far less time manually monitoring social feeds and local sources, freeing them up for higher-value journalism. The ROI has been strong enough that TopicPulse adoption is now station-wide — not just limited to the news department.

Ken Charles summarized the value clearly: "I would tell every newsroom, especially at a time when everybody is asked to do more with less, that a resource like TopicPulse allows you to do more with less. It doesn't replace journalists — it makes every journalist on your team more effective. For a newsroom covering 20 counties, that's not a luxury. It's a necessity."`,
  },
  {
    slug: "keeping-tv-radio-in-ai-equation",
    title: "Keeping TV and Radio in the AI Equation",
    date: "August 25, 2025",
    author: "Kiersten Peterson",
    category: "Resources",
    readTime: "5 min read",
    excerpt:
      "Advertisers and agencies using LLMs to build media plans often overweight digital channels while overlooking traditional TV and radio performance.",
    content: `The AI Blind Spot in Media Planning

As advertisers and agencies increasingly rely on large language models (LLMs) like ChatGPT, Gemini, and Claude to build media plans, a dangerous pattern is emerging: AI systems are systematically overweighting digital channels while overlooking the proven performance of traditional TV and radio. The training data powering these models is heavily skewed toward digital marketing content, creating a structural bias that threatens billions in broadcast advertising revenue.

LLM-Era Talking Points for Account Executives

Every AE needs to be prepared for the moment a client says, "We asked ChatGPT to build our media plan." The response should not be defensive — it should be data-driven. TV and radio consistently deliver superior reach, frequency, and cost-per-acquisition in categories like automotive, healthcare, legal, and home services. AEs armed with the right proof points can reframe the conversation from "digital vs. traditional" to "what combination drives the best business outcomes."

Media Mix Modeling Guidance

Modern Media Mix Models (MMMs) are increasingly powered by AI, but many rely on incomplete data sets that underrepresent broadcast media touchpoints. When radio and TV impressions are not properly attributed, the models naturally shift budget recommendations toward channels with cleaner data trails — primarily digital. Organizations must ensure their MMM inputs include accurate broadcast measurement data, including lift studies and attribution models designed for offline media.

Answer Engine Optimization Playbook

As search evolves into answer engines — where AI provides direct answers rather than links — broadcast media companies must ensure their content, research, and proof points are visible to these systems. This means publishing structured data, maintaining robust web presences, and creating citeable research that LLMs can reference when generating media planning recommendations.

Vertical-Specific Proof Points

The case for broadcast varies by vertical. In automotive, radio drives more dealer visits per dollar than any digital channel. In healthcare, local TV remains the most trusted source for provider advertising. In legal services, radio delivers the lowest cost-per-lead in most markets. AEs who can speak fluently about their client's specific vertical — with data to back it up — will win the budget conversation every time.`,
  },
  {
    slug: "forensic-analysis-radio-tv-revenue-loss-2025",
    title: "Futuri's Forensic Analysis on Radio and TV Revenue Loss in 2025",
    date: "July 15, 2025",
    author: "Mark McCarron",
    category: "Research",
    readTime: "6 min read",
    excerpt:
      "AI is systematically deleting radio and TV from ad spend. Our forensic analysis reveals how LLMs consistently omit broadcast media from advertising recommendations.",
    content: `The Disappearing Act: How AI Is Erasing Broadcast Media

Futuri's research team conducted a forensic analysis of how leading AI systems handle media planning queries, and the results are alarming. Across hundreds of prompts tested against ChatGPT, Gemini, Perplexity, and Claude, broadcast media — radio and television — was consistently omitted or significantly underweighted in advertising recommendations. This is not a minor oversight. It represents a structural threat to an industry that still delivers massive reach and proven ROI.

How Agencies Are Using AI for Campaign Decisions

The shift is already happening at scale. Media agencies are integrating AI-powered tools into their planning workflows, from initial budget allocation to ongoing optimization. Marketing teams at brands of all sizes are using LLMs to draft media plans, evaluate channel options, and justify budget decisions to leadership. When these AI systems consistently exclude or minimize broadcast media, the downstream effect is real revenue loss for TV and radio stations across the country.

The Training Data Problem

The root cause is straightforward: LLMs are trained on internet-scale data that is overwhelmingly produced by and about digital marketing. Blog posts, case studies, whitepapers, and trade publications about digital advertising outnumber equivalent content about broadcast media by orders of magnitude. The models are not intentionally biased — they simply reflect the imbalance in their training data. But the effect is the same: radio and TV become invisible in AI-generated recommendations.

AI-Powered MMMs and the Attribution Gap

Media Mix Models powered by AI face a related challenge. Digital channels produce granular, real-time data that feeds neatly into machine learning models. Broadcast media measurement, while improving, remains less granular and harder to integrate. The result is that AI-driven MMMs systematically undervalue broadcast contributions to campaign performance, creating a self-reinforcing cycle where less budget leads to less measurement investment, which leads to even less visibility in future models.

What Organizations Must Do Now

Staying visible and competitive in an AI-driven media landscape requires immediate action. Broadcast organizations must invest in creating high-quality, citeable digital content that AI systems can reference. They must push for better measurement and attribution standards that give AI models accurate data about broadcast performance. They must arm their sales teams with AI-specific talking points and proof points. And they must advocate industry-wide for fair representation of all media channels in AI training data and recommendation systems.`,
  },
  {
    slug: "strategic-advantage-advertising-during-downturns",
    title: "The Strategic Advantage of Advertising During Downturns",
    date: "July 7, 2025",
    author: "Mark McCarron",
    category: "Sales Intelligence",
    readTime: "5 min read",
    excerpt:
      "Historical data shows companies that maintain advertising during recessions emerge with greater market share and superior ROI.",
    content: `History Rewards the Bold Advertiser

When economic uncertainty rises, the instinct for most companies is to cut advertising budgets. But decades of research and real-world case studies tell a consistent story: companies that maintain or increase advertising during downturns emerge with significantly greater market share and superior return on investment. The brands that pull back create a vacuum — and the brands that lean in fill it.

Case Study: Amazon During the 2008-2009 Recession

Amazon is perhaps the most cited example. While competitors slashed marketing budgets during the Great Recession, Amazon increased its advertising spend and accelerated its push into new product categories. The result: Amazon's sales grew 28% during the recession, and the company emerged as the dominant force in e-commerce — a position it has never relinquished.

Case Study: Toyota's Strategic Play

Toyota maintained its advertising investment during the early 2000s recession while domestic automakers cut back dramatically. The payoff was a measurable increase in market share that persisted long after the economy recovered. Toyota's consistency in front of consumers during a period when competitors went silent created lasting brand preference that translated directly into sales volume.

Case Study: Kellogg's vs. Post

The classic case study dates back to the Great Depression. While Post Cereal cut its advertising budget, Kellogg's doubled down — increasing ad spend and launching new products including Rice Krispies. Kellogg's emerged from the Depression as the dominant cereal brand, a position it held for decades. The lesson has been validated in every subsequent downturn.

The Cost Advantage: 15-30% Lower Advertising Rates

One of the most compelling reasons to advertise during downturns is purely economic. When competitors pull back, advertising costs drop 15-30% across channels. Radio rates, television spots, digital CPMs, OTT/CTV inventory, and streaming audio all become significantly more affordable. Advertisers who maintain spend during these periods get more reach and frequency for every dollar — a compounding advantage that persists as the economy recovers.

Sales Talking Points for AEs

Account executives should frame downturn advertising not as a risk but as a strategic investment. The data is clear: brands that go dark during recessions lose an average of 2-3 years of market share growth. Recovery costs — the additional spending required to regain lost share after a downturn — typically exceed what would have been spent to maintain presence throughout. For clients in competitive categories, the math is unambiguous: maintaining visibility during a downturn is cheaper than rebuilding it afterward.`,
  },
  {
    slug: "ai-buyers-guide-digital-publishers",
    title: "AI Buyer's Guide for Digital Publishers",
    date: "July 2, 2025",
    author: "Mark McCarron",
    category: "Resources",
    readTime: "4 min read",
    excerpt:
      "Cover more stories. Engage more readers. Keep your sanity. A practical guide to AI for newsrooms and content teams.",
    content: `The Digital Publisher's Dilemma

Digital publishers face an impossible balancing act. Teams are smaller than ever, but the demands keep growing — more platforms, more formats, more content, more speed. Editorial Directors, Managing Editors, SEO specialists, and Product teams are all feeling the pressure to do more with less. AI promises to help, but the landscape of tools is overwhelming and the stakes of getting it wrong — factual errors, brand voice inconsistency, audience trust erosion — are high.

Identifying Emerging Stories Before They Break

The first challenge for any newsroom is knowing what to cover. AI-powered trend detection systems can monitor thousands of sources in real time — social media, local government feeds, community forums, competitor publications — and surface stories as they emerge, often hours before they hit the mainstream news cycle. The best systems go beyond simple keyword alerts, using natural language understanding to identify genuinely newsworthy developments and filter out noise.

Safe AI for Drafting, Headlines, and SEO

Generative AI can dramatically accelerate content production when deployed correctly. The key word is "safely." AI should assist with first drafts, headline variations, meta descriptions, and SEO optimization — but always with human oversight. The best implementations treat AI as a force multiplier for journalists, not a replacement. Every piece of AI-assisted content should pass through editorial review before publication, maintaining the voice, values, and standards that audiences trust.

Visibility in SGE, ChatGPT, and Gemini

Search is changing fast. Google's Search Generative Experience (SGE), ChatGPT's browsing capabilities, and Gemini's integrated search are rewriting the rules of content discovery. Publishers who want to remain visible must optimize for these AI-driven answer engines — not just traditional search. This means structured data, authoritative sourcing, clear attribution, and content formats that AI systems can easily parse and cite.

Human-in-the-Loop: The Non-Negotiable

No matter how sophisticated AI tools become, the human-in-the-loop model is non-negotiable for credible publishing. AI handles the heavy lifting — research, drafting, optimization, distribution — while human editors maintain quality control, editorial judgment, and brand voice. Publishers using the right stack are shipping 10x more stories per day without sacrificing voice, values, or editorial control.

Evaluation Questions for Your Team

Before investing in any AI platform, publishers should ask: Does it integrate with our existing CMS and workflows? Can we customize it to match our editorial voice? What guardrails exist to prevent factual errors? How does it handle attribution and sourcing? What is the learning curve for our team? Does it scale across all our platforms and formats? And critically — does the vendor understand the unique challenges of publishing, or are they selling generic AI tools to every industry?`,
  },
];
