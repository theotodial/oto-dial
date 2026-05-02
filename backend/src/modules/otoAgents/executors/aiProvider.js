function parseJsonMaybe(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || raw;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

export function getAiProviderStatus() {
  return {
    configured: Boolean(String(process.env.OPENAI_API_KEY || "").trim()),
    provider: "openai",
    model: process.env.OTO_AGENTS_AI_MODEL || "gpt-4o-mini",
    imageModel: process.env.OTO_AGENTS_IMAGE_MODEL || "gpt-image-1",
    researchConfigured: Boolean(String(process.env.TAVILY_API_KEY || "").trim()),
    researchProvider: "tavily",
  };
}

export async function executeAiPrompt({ systemPrompt, userPrompt, model, temperature = 0.4, expectJson = true }) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured for OTO Agents execution");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || process.env.OTO_AGENTS_AI_MODEL || "gpt-4o-mini",
      temperature,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      ...(expectJson ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `AI provider failed with HTTP ${response.status}`);
  }

  const text = data?.choices?.[0]?.message?.content || "";
  return {
    text,
    json: expectJson ? parseJsonMaybe(text) : null,
    provider: "openai",
    model: data?.model || model || process.env.OTO_AGENTS_AI_MODEL || "gpt-4o-mini",
    usage: data?.usage || null,
  };
}

export async function generateAiImage({ prompt, size = "1024x1024" }) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured for OTO Agents image generation");
  }

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OTO_AGENTS_IMAGE_MODEL || "gpt-image-1",
      prompt,
      size,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `Image provider failed with HTTP ${response.status}`);
  }
  return {
    provider: "openai",
    model: process.env.OTO_AGENTS_IMAGE_MODEL || "gpt-image-1",
    image: data?.data?.[0] || null,
  };
}
