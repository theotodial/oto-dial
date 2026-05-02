export async function collectResearchSources({ query }) {
  const tavilyKey = String(process.env.TAVILY_API_KEY || "").trim();
  if (!tavilyKey) {
    return {
      sources: [],
      liveResearchEnabled: false,
      note: "TAVILY_API_KEY is not configured; execution will use agent knowledge and provided context only.",
    };
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: tavilyKey,
      query,
      search_depth: "advanced",
      max_results: 8,
      include_answer: false,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Research provider failed with HTTP ${response.status}`);
  }
  return {
    liveResearchEnabled: true,
    sources: Array.isArray(data?.results)
      ? data.results.map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content,
          score: r.score,
        }))
      : [],
  };
}
