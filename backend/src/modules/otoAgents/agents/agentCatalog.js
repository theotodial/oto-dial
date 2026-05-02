export const OTO_AGENT_TYPES = [
  {
    role: "growth_seo",
    name: "Growth & SEO Agent",
    mission: "Find traffic opportunities, competitor gaps, keyword clusters, and SEO content moves for OTO Dial.",
    capabilities: ["keyword_research", "competitor_gap_analysis", "content_briefs", "metadata_suggestions"],
    targets: ["RingCentral", "OpenPhone", "JustCall", "Dialpad", "Google Voice", "CallTools", "BatchDialer", "TextNow", "Aircall", "Grasshopper", "CallRail"],
  },
  {
    role: "social_media",
    name: "Social Media AI Team",
    mission: "Draft premium multi-platform social content, trend responses, ad concepts, and engagement ideas.",
    capabilities: ["trend_monitoring", "captions", "hashtags", "viral_hooks", "image_prompts", "reply_suggestions"],
    targets: ["Instagram", "X/Twitter", "LinkedIn", "Facebook", "TikTok", "Reddit", "YouTube"],
  },
  {
    role: "reputation_monitoring",
    name: "Reputation Monitoring Agent",
    mission: "Detect public complaints, negative sentiment spikes, churn signals, and public outage narratives.",
    capabilities: ["sentiment_scoring", "mention_monitoring", "complaint_summaries", "response_suggestions"],
    targets: ["Reddit", "X/Twitter", "YouTube", "Trustpilot", "telecom forums"],
  },
  {
    role: "customer_success",
    name: "AI Customer Success Agent",
    mission: "Summarize support issues, detect angry users, cluster bug trends, and suggest support replies.",
    capabilities: ["ticket_summaries", "churn_risk", "escalation_detection", "issue_heatmaps"],
    targets: ["support tickets", "refund risk", "bug clusters"],
  },
  {
    role: "revenue_optimization",
    name: "Revenue Optimization Agent",
    mission: "Analyze profitability, carrier costs, plan abuse, churn risk, and upsell opportunities.",
    capabilities: ["cost_analysis", "plan_abuse_detection", "upsell_insights", "margin_alerts"],
    targets: ["SMS costs", "voice costs", "subscription plans", "usage patterns"],
  },
  {
    role: "content_factory",
    name: "Autonomous Content Factory",
    mission: "Generate blogs, landing pages, comparison pages, tutorials, newsletters, and ad copy.",
    capabilities: ["blog_drafts", "landing_pages", "comparison_pages", "newsletters", "ad_copy"],
    targets: ["RingCentral alternatives", "SMS platform keywords", "telecom SaaS education"],
  },
  {
    role: "competitive_intelligence",
    name: "AI Competitive Intelligence Agent",
    mission: "Monitor competitors, launches, pricing, outages, reviews, ads, and feature gaps.",
    capabilities: ["pricing_analysis", "feature_gap_analysis", "launch_monitoring", "competitor_reports"],
    targets: ["RingCentral", "TextNow", "Google Voice", "OpenPhone", "Dialpad", "Aircall"],
  },
  {
    role: "product_strategy",
    name: "Product Strategy Agent",
    mission: "Analyze behavior, churn, feature usage, UX bottlenecks, and roadmap opportunities.",
    capabilities: ["retention_insights", "ux_bottlenecks", "roadmap_suggestions", "flow_breakage_detection"],
    targets: ["dashboard usage", "billing flows", "call flows", "campaign usage"],
  },
];

export function getAgentType(role) {
  return OTO_AGENT_TYPES.find((type) => type.role === role) || null;
}
