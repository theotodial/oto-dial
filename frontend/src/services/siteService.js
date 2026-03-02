import API from "../api";

export async function fetchHomepageStructure() {
  const res = await API.get("/api/site/homepage");
  if (res.error || res.data?.success === false) {
    throw new Error(res.error || res.data?.error || "Failed to load homepage");
  }
  return res.data?.homepage || { sections: [], themeSettings: {}, headerConfig: {}, updatedAt: null };
}

export async function fetchPublicSeoSettings() {
  const res = await API.get("/api/site/seo");
  if (res.error || res.data?.success === false) {
    throw new Error(res.error || res.data?.error || "Failed to load SEO settings");
  }
  return (
    res.data?.seo || { meta: {}, keywords: [], hiddenKeywords: [], schema: {}, updatedAt: null }
  );
}

