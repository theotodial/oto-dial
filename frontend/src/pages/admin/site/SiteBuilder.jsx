import { useEffect, useMemo, useRef, useState } from "react";
import { Reorder } from "framer-motion";
import API from "../../../api";
import HomepageRenderer from "../../../components/site/HomepageRenderer";
import SiteHeader from "../../../components/site/SiteHeader";
import RichTextEditor from "../../../components/admin/RichTextEditor";
import MediaLibrary from "../../../components/admin/MediaLibrary";

const DEFAULT_VIEWPORT = "desktop";

const SECTION_TEMPLATES = {
  hero: () => ({
    type: "hero",
    hidden: false,
    settings: {
      heading: "Get your virtual phone number today",
      subheading: "Simple calling + SMS for travelers and remote work.",
      buttonText: "Get started",
      buttonLink: "/signup",
      align: "left",
      backgroundImage: ""
    }
  }),
  text: () => ({
    type: "text",
    hidden: false,
    settings: {
      html: "<h2>Why OTO DIAL?</h2><p>Write your content here.</p>",
      align: "left"
    }
  }),
  features_grid: () => ({
    type: "features_grid",
    hidden: false,
    settings: {
      title: "Features",
      items: [
        { id: "f1", title: "Global calling", description: "Call anywhere with transparent pricing." },
        { id: "f2", title: "SMS included", description: "Send messages from your virtual number." },
        { id: "f3", title: "Fast setup", description: "Start in minutes." }
      ]
    }
  }),
  faq: () => ({
    type: "faq",
    hidden: false,
    settings: {
      title: "Frequently Asked Questions",
      items: [
        { id: "q1", q: "How does it work?", a: "You buy a number and start calling/SMS from the app." }
      ]
    }
  }),
  cta: () => ({
    type: "cta",
    hidden: false,
    settings: {
      heading: "Ready to start?",
      subheading: "Choose a plan and get your number today.",
      primaryButtonText: "View pricing",
      primaryButtonLink: "/billing",
      secondaryButtonText: "Sign up",
      secondaryButtonLink: "/signup"
    }
  }),
  spacer: () => ({
    type: "spacer",
    hidden: false,
    settings: { heightPx: 32 }
  }),
  custom_html: () => ({
    type: "custom_html",
    hidden: false,
    settings: { html: "<div>Custom HTML</div>" }
  }),
  image_text: () => ({
    type: "image_text",
    hidden: false,
    settings: {
      imageUrl: "",
      imageSide: "left",
      heading: "Built for global calling",
      html: "<p>Add your copy here.</p>"
    }
  }),
  testimonials: () => ({
    type: "testimonials",
    hidden: false,
    settings: {
      title: "Loved by customers",
      items: [
        { id: "t1", name: "Alex", role: "Freelancer", quote: "Setup was super fast and the call quality is great." },
        { id: "t2", name: "Sam", role: "Traveler", quote: "I got a local number abroad and stayed reachable." },
        { id: "t3", name: "Taylor", role: "Remote worker", quote: "Perfect for international clients." }
      ]
    }
  })
};

function createSectionId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `sec_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

const buildStarterTemplate = () => {
  return [
    { id: createSectionId(), ...SECTION_TEMPLATES.hero() },
    { id: createSectionId(), ...SECTION_TEMPLATES.features_grid() },
    { id: createSectionId(), ...SECTION_TEMPLATES.image_text() },
    { id: createSectionId(), ...SECTION_TEMPLATES.testimonials() },
    { id: createSectionId(), ...SECTION_TEMPLATES.faq() },
    { id: createSectionId(), ...SECTION_TEMPLATES.cta() }
  ];
};

function normalizeBuilderDoc(input) {
  const doc = input && typeof input === "object" ? input : {};
  return {
    siteKey: doc.siteKey || "default",
    sections: Array.isArray(doc.sections)
      ? doc.sections.map((s) => ({ ...s, id: s?.id || createSectionId() }))
      : [],
    themeSettings: doc.themeSettings && typeof doc.themeSettings === "object" ? doc.themeSettings : {},
    headerConfig: doc.headerConfig && typeof doc.headerConfig === "object" ? doc.headerConfig : {},
    updatedAt: doc.updatedAt || null
  };
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      <div className="h-4 w-40 rounded bg-gray-200 dark:bg-slate-700" />
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full rounded bg-gray-200 dark:bg-slate-700" />
        <div className="h-3 w-5/6 rounded bg-gray-200 dark:bg-slate-700" />
        <div className="h-3 w-2/3 rounded bg-gray-200 dark:bg-slate-700" />
      </div>
    </div>
  );
}

function SiteBuilder() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [autosave, setAutosave] = useState(true);
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);
  const [builderDoc, setBuilderDoc] = useState(null);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerTarget, setMediaPickerTarget] = useState(null);
  const isMountedRef = useRef(true);
  const autosaveTimerRef = useRef(null);
  const lastSavedHashRef = useRef("");

  useEffect(() => {
    isMountedRef.current = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await API.get("/api/admin/site/builder");
        if (res.error || res.data?.success === false) {
          throw new Error(res.error || res.data?.error || "Failed to load builder");
        }
        if (!isMountedRef.current) return;
        const normalized = normalizeBuilderDoc(res.data?.builder || null);
        setBuilderDoc(normalized);
        lastSavedHashRef.current = JSON.stringify({
          sections: normalized.sections || [],
          themeSettings: normalized.themeSettings || {},
          headerConfig: normalized.headerConfig || {}
        });
        if (!selectedSectionId && normalized.sections.length) {
          setSelectedSectionId(normalized.sections[0].id);
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        setError(err?.message || "Failed to load builder");
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    };
    load();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!autosave) return;
    if (!builderDoc) return;
    if (saving) return;

    const hash = JSON.stringify({
      sections: builderDoc.sections || [],
      themeSettings: builderDoc.themeSettings || {},
      headerConfig: builderDoc.headerConfig || {}
    });
    if (hash === lastSavedHashRef.current) return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    autosaveTimerRef.current = setTimeout(async () => {
      if (!isMountedRef.current) return;
      setSaving(true);
      setError("");
      try {
        const res = await API.put("/api/admin/site/builder", builderDoc);
        if (res.error || res.data?.success === false) {
          throw new Error(res.error || res.data?.error || "Autosave failed");
        }
        if (!isMountedRef.current) return;
        const normalized = normalizeBuilderDoc(res.data?.builder || builderDoc);
        setBuilderDoc(normalized);
        lastSavedHashRef.current = JSON.stringify({
          sections: normalized.sections || [],
          themeSettings: normalized.themeSettings || {},
          headerConfig: normalized.headerConfig || {}
        });
        setNotice("Autosaved.");
        setTimeout(() => {
          if (isMountedRef.current) setNotice("");
        }, 900);
      } catch (err) {
        if (!isMountedRef.current) return;
        setError(err?.message || "Autosave failed");
      } finally {
        if (isMountedRef.current) setSaving(false);
      }
    }, 800);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [autosave, builderDoc, saving]);

  const previewWidthClass = useMemo(() => {
    if (viewport === "mobile") return "w-[375px]";
    if (viewport === "tablet") return "w-[768px]";
    return "w-full";
  }, [viewport]);

  const handleSave = async () => {
    if (!builderDoc) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await API.put("/api/admin/site/builder", builderDoc);
      if (res.error || res.data?.success === false) {
        throw new Error(res.error || res.data?.error || "Failed to save");
      }
      if (!isMountedRef.current) return;
      setNotice("Saved.");
      const normalized = normalizeBuilderDoc(res.data?.builder || builderDoc);
      setBuilderDoc(normalized);
      lastSavedHashRef.current = JSON.stringify({
        sections: normalized.sections || [],
        themeSettings: normalized.themeSettings || {},
        headerConfig: normalized.headerConfig || {}
      });
      setTimeout(() => {
        if (isMountedRef.current) setNotice("");
      }, 1200);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err?.message || "Failed to save");
    } finally {
      if (isMountedRef.current) setSaving(false);
    }
  };

  const createStarterHomepage = () => {
    setBuilderDoc((prev) => {
      const normalized = normalizeBuilderDoc(prev);
      const hasSections = (normalized.sections || []).length > 0;
      if (hasSections) return normalized;
      return {
        ...normalized,
        sections: buildStarterTemplate(),
        headerConfig: {
          ...(normalized.headerConfig || {}),
          brandText: normalized.headerConfig?.brandText || "OTO DIAL",
          sticky: normalized.headerConfig?.sticky !== false,
          items:
            Array.isArray(normalized.headerConfig?.items) && normalized.headerConfig.items.length
              ? normalized.headerConfig.items
              : [
                  { id: createSectionId(), label: "Pricing", href: "/billing" },
                  { id: createSectionId(), label: "Blog", href: "/blog" },
                  { id: createSectionId(), label: "Contact", href: "/contact" }
                ]
        }
      };
    });
  };

  const addSection = (type) => {
    const factory = SECTION_TEMPLATES[type];
    if (!factory) return;
    const section = { id: createSectionId(), ...factory() };
    setBuilderDoc((prev) => {
      const normalized = normalizeBuilderDoc(prev);
      return { ...normalized, sections: [...(normalized.sections || []), section] };
    });
    setSelectedSectionId(section.id);
  };

  const updateSection = (id, patch) => {
    setBuilderDoc((prev) => {
      const normalized = normalizeBuilderDoc(prev);
      const nextSections = (normalized.sections || []).map((s) => {
        if (s.id !== id) return s;
        return {
          ...s,
          ...(patch || {}),
          settings: { ...(s.settings || {}), ...((patch || {}).settings || {}) }
        };
      });
      return { ...normalized, sections: nextSections };
    });
  };

  const deleteSection = (id) => {
    setBuilderDoc((prev) => {
      const normalized = normalizeBuilderDoc(prev);
      const nextSections = (normalized.sections || []).filter((s) => s.id !== id);
      return { ...normalized, sections: nextSections };
    });
    setSelectedSectionId((prev) => (prev === id ? "" : prev));
  };

  const duplicateSection = (id) => {
    setBuilderDoc((prev) => {
      const normalized = normalizeBuilderDoc(prev);
      const idx = (normalized.sections || []).findIndex((s) => s.id === id);
      if (idx < 0) return normalized;
      const original = normalized.sections[idx];
      const clone = {
        ...original,
        id: createSectionId(),
        settings: JSON.parse(JSON.stringify(original.settings || {}))
      };
      const nextSections = [...normalized.sections];
      nextSections.splice(idx + 1, 0, clone);
      return { ...normalized, sections: nextSections };
    });
  };

  const selectedSection = useMemo(() => {
    const sections = builderDoc?.sections || [];
    return sections.find((s) => s.id === selectedSectionId) || null;
  }, [builderDoc?.sections, selectedSectionId]);

  const updateHeader = (patch) => {
    setBuilderDoc((prev) => {
      const normalized = normalizeBuilderDoc(prev);
      return {
        ...normalized,
        headerConfig: {
          ...(normalized.headerConfig || {}),
          ...(patch || {})
        }
      };
    });
  };

  const updateHeaderItem = (id, patch) => {
    setBuilderDoc((prev) => {
      const normalized = normalizeBuilderDoc(prev);
      const items = Array.isArray(normalized.headerConfig?.items) ? normalized.headerConfig.items : [];
      const nextItems = items.map((it) => (it?.id === id ? { ...it, ...(patch || {}) } : it));
      return { ...normalized, headerConfig: { ...(normalized.headerConfig || {}), items: nextItems } };
    });
  };

  const deleteHeaderItem = (id) => {
    setBuilderDoc((prev) => {
      const normalized = normalizeBuilderDoc(prev);
      const items = Array.isArray(normalized.headerConfig?.items) ? normalized.headerConfig.items : [];
      const nextItems = items.filter((it) => it?.id !== id);
      return { ...normalized, headerConfig: { ...(normalized.headerConfig || {}), items: nextItems } };
    });
  };

  const addHeaderItem = () => {
    const id = createSectionId();
    setBuilderDoc((prev) => {
      const normalized = normalizeBuilderDoc(prev);
      const items = Array.isArray(normalized.headerConfig?.items) ? normalized.headerConfig.items : [];
      return {
        ...normalized,
        headerConfig: {
          ...(normalized.headerConfig || {}),
          items: [...items, { id, label: "Menu", href: "/" }]
        }
      };
    });
  };

  const openMediaPicker = (target) => {
    setMediaPickerTarget(target);
    setMediaPickerOpen(true);
  };

  const handleMediaSelect = (url) => {
    if (!url) return;
    if (mediaPickerTarget === "header.logo") {
      updateHeader({ logoUrl: url });
    }
    if (mediaPickerTarget === "section.hero.bg" && selectedSection?.type === "hero") {
      updateSection(selectedSection.id, { settings: { backgroundImage: url } });
    }
    if (mediaPickerTarget === "section.image_text.image" && selectedSection?.type === "image_text") {
      updateSection(selectedSection.id, { settings: { imageUrl: url } });
    }
    setMediaPickerOpen(false);
    setMediaPickerTarget(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 p-6">
        <div className="mx-auto max-w-7xl space-y-5">
          <SkeletonCard />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <SkeletonCard />
            <div className="lg:col-span-2">
              <SkeletonCard />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
              Site Builder
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Build and publish your homepage with live preview.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={autosave}
                onChange={(e) => setAutosave(e.target.checked)}
              />
              Autosave
            </label>

            <div className="inline-flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
              {[
                { key: "desktop", label: "Desktop" },
                { key: "tablet", label: "Tablet" },
                { key: "mobile", label: "Mobile" }
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setViewport(opt.key)}
                  className={`px-3 py-2 text-xs font-semibold ${
                    viewport === opt.key
                      ? "bg-indigo-600 text-white"
                      : "bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleSave}
              disabled={saving || autosave}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 text-sm font-semibold"
              title={autosave ? "Disable autosave to use manual Save" : "Save changes"}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-5 p-4 rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}
        {notice && (
          <div className="mb-5 p-4 rounded-lg border border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-800 text-green-700 dark:text-green-300 text-sm">
            {notice}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left: controls */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Sections
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Add, reorder (drag), duplicate, hide, and edit sections.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.keys(SECTION_TEMPLATES).map((type) => (
                <button
                  key={type}
                  onClick={() => addSection(type)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-300 dark:hover:bg-indigo-900/30"
                >
                  + {type}
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              {(builderDoc?.sections || []).length === 0 ? (
                <div className="text-sm text-gray-600 dark:text-gray-300 rounded-lg border border-dashed border-gray-300 dark:border-slate-600 p-4">
                  No sections yet.
                </div>
              ) : (
                <Reorder.Group
                  axis="y"
                  values={builderDoc?.sections || []}
                  onReorder={(nextOrder) => {
                    setBuilderDoc((prev) => ({ ...normalizeBuilderDoc(prev), sections: nextOrder }));
                  }}
                  className="space-y-2"
                >
                  {(builderDoc?.sections || []).map((section) => {
                    const isSelected = section.id === selectedSectionId;
                    return (
                      <Reorder.Item
                        key={section.id}
                        value={section}
                        className={`rounded-lg border px-3 py-2 cursor-grab active:cursor-grabbing ${
                          isSelected
                            ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20"
                            : "border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40"
                        }`}
                        onClick={() => setSelectedSectionId(section.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold text-gray-900 dark:text-white">
                              {section.type}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {section.hidden ? "Hidden" : "Visible"}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateSection(section.id, { hidden: !section.hidden });
                              }}
                              className="px-2 py-1 rounded-md text-xs bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700"
                              title={section.hidden ? "Show section" : "Hide section"}
                            >
                              {section.hidden ? "Show" : "Hide"}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                duplicateSection(section.id);
                              }}
                              className="px-2 py-1 rounded-md text-xs bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700"
                              title="Duplicate section"
                            >
                              Dup
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteSection(section.id);
                              }}
                              className="px-2 py-1 rounded-md text-xs bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800"
                              title="Delete section"
                            >
                              Del
                            </button>
                          </div>
                        </div>
                      </Reorder.Item>
                    );
                  })}
                </Reorder.Group>
              )}
            </div>

            {/* Inspector */}
            <div className="mt-5 pt-5 border-t border-gray-200 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Inspector
              </h3>
              {!selectedSection ? (
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Select a section to edit.
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {selectedSection.type === "hero" && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                          Heading
                        </label>
                        <input
                          value={selectedSection.settings?.heading || ""}
                          onChange={(e) =>
                            updateSection(selectedSection.id, { settings: { heading: e.target.value } })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                          Subheading
                        </label>
                        <textarea
                          rows={2}
                          value={selectedSection.settings?.subheading || ""}
                          onChange={(e) =>
                            updateSection(selectedSection.id, { settings: { subheading: e.target.value } })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                            Button text
                          </label>
                          <input
                            value={selectedSection.settings?.buttonText || ""}
                            onChange={(e) =>
                              updateSection(selectedSection.id, { settings: { buttonText: e.target.value } })
                            }
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                            Button link
                          </label>
                          <input
                            value={selectedSection.settings?.buttonLink || ""}
                            onChange={(e) =>
                              updateSection(selectedSection.id, { settings: { buttonLink: e.target.value } })
                            }
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                          Background image
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            value={selectedSection.settings?.backgroundImage || ""}
                            onChange={(e) =>
                              updateSection(selectedSection.id, { settings: { backgroundImage: e.target.value } })
                            }
                            placeholder="https://..."
                            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white text-xs font-mono"
                          />
                          <button
                            onClick={() => openMediaPicker("section.hero.bg")}
                            className="px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-semibold"
                          >
                            Upload
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {selectedSection.type === "text" && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">
                        Rich text
                      </label>
                      <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                        <RichTextEditor
                          value={selectedSection.settings?.html || ""}
                          onChange={(val) =>
                            updateSection(selectedSection.id, { settings: { html: val } })
                          }
                          placeholder="Write homepage content..."
                        />
                      </div>
                    </div>
                  )}

                  {selectedSection.type === "cta" && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                          Heading
                        </label>
                        <input
                          value={selectedSection.settings?.heading || ""}
                          onChange={(e) =>
                            updateSection(selectedSection.id, { settings: { heading: e.target.value } })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                          Subheading
                        </label>
                        <textarea
                          rows={2}
                          value={selectedSection.settings?.subheading || ""}
                          onChange={(e) =>
                            updateSection(selectedSection.id, { settings: { subheading: e.target.value } })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                    </>
                  )}

                  {selectedSection.type === "image_text" && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                          Heading
                        </label>
                        <input
                          value={selectedSection.settings?.heading || ""}
                          onChange={(e) =>
                            updateSection(selectedSection.id, { settings: { heading: e.target.value } })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                            Image side
                          </label>
                          <select
                            value={selectedSection.settings?.imageSide || "left"}
                            onChange={(e) =>
                              updateSection(selectedSection.id, { settings: { imageSide: e.target.value } })
                            }
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white text-sm"
                          >
                            <option value="left">Left</option>
                            <option value="right">Right</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                            Image URL
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              value={selectedSection.settings?.imageUrl || ""}
                              onChange={(e) =>
                                updateSection(selectedSection.id, { settings: { imageUrl: e.target.value } })
                              }
                              placeholder="https://..."
                              className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white text-xs font-mono"
                            />
                            <button
                              onClick={() => openMediaPicker("section.image_text.image")}
                              className="px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-semibold"
                              title="Upload (uses media library)"
                            >
                              Upload
                            </button>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">
                          Body
                        </label>
                        <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                          <RichTextEditor
                            value={selectedSection.settings?.html || ""}
                            onChange={(val) => updateSection(selectedSection.id, { settings: { html: val } })}
                            placeholder="Write section content..."
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {selectedSection.type === "testimonials" && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                          Title
                        </label>
                        <input
                          value={selectedSection.settings?.title || ""}
                          onChange={(e) =>
                            updateSection(selectedSection.id, { settings: { title: e.target.value } })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        {(selectedSection.settings?.items || []).slice(0, 6).map((it, idx) => (
                          <div
                            key={it.id || idx}
                            className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40 p-2"
                          >
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                value={it.name || ""}
                                onChange={(e) => {
                                  const items = [...(selectedSection.settings?.items || [])];
                                  items[idx] = { ...(items[idx] || {}), name: e.target.value };
                                  updateSection(selectedSection.id, { settings: { items } });
                                }}
                                placeholder="Name"
                                className="px-2 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-xs"
                              />
                              <input
                                value={it.role || ""}
                                onChange={(e) => {
                                  const items = [...(selectedSection.settings?.items || [])];
                                  items[idx] = { ...(items[idx] || {}), role: e.target.value };
                                  updateSection(selectedSection.id, { settings: { items } });
                                }}
                                placeholder="Role"
                                className="px-2 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-xs"
                              />
                            </div>
                            <textarea
                              rows={2}
                              value={it.quote || ""}
                              onChange={(e) => {
                                const items = [...(selectedSection.settings?.items || [])];
                                items[idx] = { ...(items[idx] || {}), quote: e.target.value };
                                updateSection(selectedSection.id, { settings: { items } });
                              }}
                              placeholder="Quote"
                              className="mt-2 w-full px-2 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-xs"
                            />
                          </div>
                        ))}
                        <button
                          onClick={() => {
                            const items = Array.isArray(selectedSection.settings?.items)
                              ? [...selectedSection.settings.items]
                              : [];
                            items.push({
                              id: createSectionId(),
                              name: "Customer",
                              role: "",
                              quote: ""
                            });
                            updateSection(selectedSection.id, { settings: { items } });
                          }}
                          className="px-3 py-2 rounded-lg bg-gray-900 text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-gray-100 text-xs font-semibold"
                        >
                          + Add testimonial
                        </button>
                      </div>
                    </>
                  )}

                  {selectedSection.type === "spacer" && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                        Height (px)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={240}
                        value={selectedSection.settings?.heightPx || 0}
                        onChange={(e) =>
                          updateSection(selectedSection.id, { settings: { heightPx: Number(e.target.value || 0) } })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Theme */}
            <div className="mt-5 pt-5 border-t border-gray-200 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Theme
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                    Primary
                  </label>
                  <input
                    type="color"
                    value={builderDoc?.themeSettings?.primaryColor || "#4f46e5"}
                    onChange={(e) =>
                      setBuilderDoc((prev) => ({
                        ...normalizeBuilderDoc(prev),
                        themeSettings: { ...(normalizeBuilderDoc(prev).themeSettings || {}), primaryColor: e.target.value }
                      }))
                    }
                    className="w-full h-10 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                    Secondary
                  </label>
                  <input
                    type="color"
                    value={builderDoc?.themeSettings?.secondaryColor || "#9333ea"}
                    onChange={(e) =>
                      setBuilderDoc((prev) => ({
                        ...normalizeBuilderDoc(prev),
                        themeSettings: { ...(normalizeBuilderDoc(prev).themeSettings || {}), secondaryColor: e.target.value }
                      }))
                    }
                    className="w-full h-10 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                  Border radius
                </label>
                <input
                  type="range"
                  min={0}
                  max={24}
                  value={Number(builderDoc?.themeSettings?.borderRadius || 12)}
                  onChange={(e) =>
                    setBuilderDoc((prev) => ({
                      ...normalizeBuilderDoc(prev),
                      themeSettings: { ...(normalizeBuilderDoc(prev).themeSettings || {}), borderRadius: Number(e.target.value) }
                    }))
                  }
                  className="w-full"
                />
              </div>
            </div>

            {/* Header */}
            <div className="mt-5 pt-5 border-t border-gray-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Header
                </h3>
                <button
                  onClick={addHeaderItem}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-gray-100"
                >
                  + Menu item
                </button>
              </div>

              <div className="space-y-3">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={builderDoc?.headerConfig?.sticky !== false}
                    onChange={(e) => updateHeader({ sticky: e.target.checked })}
                  />
                  Sticky header
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                      Background
                    </label>
                    <input
                      type="text"
                      value={builderDoc?.headerConfig?.background || ""}
                      onChange={(e) => updateHeader({ background: e.target.value })}
                      placeholder="rgba(255,255,255,0.9)"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                      Brand text
                    </label>
                    <input
                      type="text"
                      value={builderDoc?.headerConfig?.brandText || "OTO DIAL"}
                      onChange={(e) => updateHeader({ brandText: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                    Logo
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="url"
                      value={builderDoc?.headerConfig?.logoUrl || ""}
                      onChange={(e) => updateHeader({ logoUrl: e.target.value })}
                      placeholder="https://..."
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white text-xs font-mono"
                    />
                    <button
                      onClick={() => openMediaPicker("header.logo")}
                      className="px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-semibold"
                    >
                      Upload
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40 p-3">
                  {(builderDoc?.headerConfig?.items || []).length === 0 ? (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      No menu items yet.
                    </div>
                  ) : (
                    <Reorder.Group
                      axis="y"
                      values={builderDoc?.headerConfig?.items || []}
                      onReorder={(nextOrder) => updateHeader({ items: nextOrder })}
                      className="space-y-2"
                    >
                      {(builderDoc?.headerConfig?.items || []).map((it) => (
                        <Reorder.Item
                          key={it.id}
                          value={it}
                          className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 cursor-grab active:cursor-grabbing"
                        >
                          <div className="grid grid-cols-1 gap-2">
                            <input
                              value={it.label || ""}
                              onChange={(e) => updateHeaderItem(it.id, { label: e.target.value })}
                              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white text-xs"
                              placeholder="Label"
                            />
                            <div className="flex items-center gap-2">
                              <input
                                value={it.href || ""}
                                onChange={(e) => updateHeaderItem(it.id, { href: e.target.value })}
                                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white text-xs font-mono"
                                placeholder="/path"
                              />
                              <button
                                onClick={() => deleteHeaderItem(it.id)}
                                className="px-3 py-2 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800 text-xs font-semibold"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </Reorder.Item>
                      ))}
                    </Reorder.Group>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right: preview */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                Live Preview
              </h2>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {builderDoc?.updatedAt ? `Updated ${new Date(builderDoc.updatedAt).toLocaleString()}` : ""}
              </span>
            </div>

            <div className="w-full overflow-auto rounded-xl bg-gray-100 dark:bg-slate-900 p-4">
              <div
                className={`mx-auto ${previewWidthClass} min-h-[560px] rounded-xl bg-white dark:bg-slate-800 shadow border border-gray-200 dark:border-slate-700`}
              >
                {(builderDoc?.sections || []).length === 0 && (
                  <div className="p-6 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">
                        No homepage yet
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Create a starter layout to start editing with instant preview.
                      </div>
                    </div>
                    <button
                      onClick={createStarterHomepage}
                      className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-semibold"
                    >
                      Create starter homepage
                    </button>
                  </div>
                )}

                <SiteHeader
                  headerConfig={builderDoc?.headerConfig || {}}
                  themeSettings={builderDoc?.themeSettings || {}}
                  isBuilderPreview
                />
                <HomepageRenderer
                  sections={builderDoc?.sections || []}
                  themeSettings={builderDoc?.themeSettings || {}}
                  renderHidden
                  isBuilderPreview
                  selectedSectionId={selectedSectionId}
                  onSelectSection={(id) => setSelectedSectionId(id)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <MediaLibrary
        isOpen={mediaPickerOpen}
        onClose={() => {
          setMediaPickerOpen(false);
          setMediaPickerTarget(null);
        }}
        onSelect={handleMediaSelect}
      />
    </div>
  );
}

export default SiteBuilder;

