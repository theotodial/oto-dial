function setMetaTag(nameOrProperty, content, { attr = "name" } = {}) {
  if (!content) return;
  const selector = attr === "property" ? `meta[property="${nameOrProperty}"]` : `meta[name="${nameOrProperty}"]`;
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, nameOrProperty);
    document.head.appendChild(el);
  }
  el.setAttribute("content", String(content));
}

function setCanonicalUrl(url) {
  if (!url) return;
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", String(url));
}

function upsertJsonLd(id, json) {
  if (!json) return;
  const scriptId = `jsonld-${id}`;
  let el = document.getElementById(scriptId);
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = scriptId;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(json);
}

function buildFaqSchemaFromSections(sections = []) {
  const faqSection = (Array.isArray(sections) ? sections : []).find(
    (s) => String(s?.type || "").toLowerCase() === "faq" && !s?.hidden
  );
  const items = Array.isArray(faqSection?.settings?.items) ? faqSection.settings.items : [];
  const entities = items
    .map((it) => ({
      name: String(it?.q || "").trim(),
      acceptedAnswer: { "@type": "Answer", text: String(it?.a || "").trim() }
    }))
    .filter((row) => row.name && row.acceptedAnswer.text)
    .slice(0, 30)
    .map((row) => ({ "@type": "Question", ...row }));

  if (!entities.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entities
  };
}

function buildReviewSchemaFromSections({ sections = [], organizationName = "" } = {}) {
  const testimonialSection = (Array.isArray(sections) ? sections : []).find(
    (s) => String(s?.type || "").toLowerCase() === "testimonials" && !s?.hidden
  );
  const items = Array.isArray(testimonialSection?.settings?.items)
    ? testimonialSection.settings.items
    : [];
  const reviews = items
    .map((it) => ({
      "@type": "Review",
      reviewBody: String(it?.quote || "").trim(),
      author: { "@type": "Person", name: String(it?.name || "Customer").trim() }
    }))
    .filter((r) => r.reviewBody)
    .slice(0, 12);

  if (!reviews.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: organizationName || undefined,
    review: reviews
  };
}

export function applySeoSettingsToDocument(seo = {}, context = {}) {
  if (typeof document === "undefined") return;
  const meta = seo?.meta || {};
  const keywords = Array.isArray(seo?.keywords) ? seo.keywords : [];
  const hiddenKeywords = Array.isArray(seo?.hiddenKeywords) ? seo.hiddenKeywords : [];
  const combinedKeywords = Array.from(
    new Set([...keywords, ...hiddenKeywords].map((k) => String(k || "").trim()).filter(Boolean))
  ).slice(0, 2000);

  if (meta.title) document.title = String(meta.title);
  setMetaTag("description", meta.description);
  if (combinedKeywords.length) setMetaTag("keywords", combinedKeywords.join(", "));
  setCanonicalUrl(meta.canonicalUrl);

  // Open Graph
  setMetaTag("og:title", meta.ogTitle || meta.title, { attr: "property" });
  setMetaTag("og:description", meta.ogDescription || meta.description, { attr: "property" });
  setMetaTag("og:image", meta.ogImage, { attr: "property" });
  setMetaTag("og:url", meta.canonicalUrl, { attr: "property" });

  // Twitter
  setMetaTag("twitter:title", meta.twitterTitle || meta.title);
  setMetaTag("twitter:description", meta.twitterDescription || meta.description);
  setMetaTag("twitter:image", meta.twitterImage || meta.ogImage);

  const schema = seo?.schema || {};
  if (schema?.enableFaqSchema) {
    const faqJson = buildFaqSchemaFromSections(context?.sections || []);
    if (faqJson) upsertJsonLd("faq", faqJson);
  }
  if (schema?.enableReviewSchema) {
    const reviewJson = buildReviewSchemaFromSections({
      sections: context?.sections || [],
      organizationName: meta?.title || ""
    });
    if (reviewJson) upsertJsonLd("reviews", reviewJson);
  }
  if (schema?.customJsonLd) {
    try {
      const parsed =
        typeof schema.customJsonLd === "string"
          ? JSON.parse(schema.customJsonLd)
          : schema.customJsonLd;
      upsertJsonLd("custom", parsed);
    } catch {
      // ignore invalid JSON-LD
    }
  }
}

