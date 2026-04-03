import { memo, Suspense, useCallback, useMemo } from "react";

function EditableText({
  as: Tag = "span",
  isBuilderPreview,
  onRequestEdit,
  request,
  className = "",
  children
}) {
  if (!isBuilderPreview) {
    return <Tag className={className}>{children}</Tag>;
  }

  return (
    <Tag
      className={`${className} cursor-text`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof onRequestEdit !== "function") return;
        const rect = e.currentTarget?.getBoundingClientRect?.() || null;
        onRequestEdit({ ...request, rect });
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          const rect = e.currentTarget?.getBoundingClientRect?.() || null;
          if (typeof onRequestEdit === "function") onRequestEdit({ ...request, rect });
        }
      }}
    >
      {children}
    </Tag>
  );
}

const HeroBannerSection = memo(function HeroBannerSection({ section, isBuilderPreview, onRequestEdit }) {
  const s = section?.settings || {};
  const heading = s.heading || "Your headline";
  const subheading = s.subheading || "";
  const buttonText = s.buttonText || "";
  const buttonLink = s.buttonLink || "#";
  const backgroundImage = s.backgroundImage || "";
  const align = s.align || "left";

  return (
    <section className="w-full" style={backgroundImage ? { backgroundImage: `url(${backgroundImage})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className={`max-w-2xl ${align === "center" ? "mx-auto text-center" : ""} ${align === "right" ? "ml-auto text-right" : ""}`}>
          <EditableText
            as="h1"
            isBuilderPreview={isBuilderPreview}
            onRequestEdit={onRequestEdit}
            request={{ sectionId: section?.id, kind: "text", path: "settings.heading", label: "Hero heading", value: heading }}
            className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900 dark:text-white"
          >
            {heading}
          </EditableText>
          {subheading && (
            <EditableText
              as="p"
              isBuilderPreview={isBuilderPreview}
              onRequestEdit={onRequestEdit}
              request={{ sectionId: section?.id, kind: "textarea", path: "settings.subheading", label: "Hero subheading", value: subheading }}
              className="mt-4 text-lg text-gray-700 dark:text-gray-300"
            >
              {subheading}
            </EditableText>
          )}
          {buttonText && (
            <div className={`mt-8 ${align === "center" ? "flex justify-center" : ""} ${align === "right" ? "flex justify-end" : ""}`}>
              <a
                href={buttonLink}
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl text-white font-semibold transition-colors"
                style={{ backgroundColor: "var(--site-primary)", borderRadius: "var(--site-radius)" }}
              >
                <EditableText
                  isBuilderPreview={isBuilderPreview}
                  onRequestEdit={onRequestEdit}
                  request={{ sectionId: section?.id, kind: "text", path: "settings.buttonText", label: "Hero button text", value: buttonText }}
                >
                  {buttonText}
                </EditableText>
              </a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
});

const TextBlockSection = memo(function TextBlockSection({ section, isBuilderPreview, onRequestEdit }) {
  const s = section?.settings || {};
  const html = s.html || "";
  const align = s.align || "left";
  return (
    <section className="w-full">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div
          className={`prose dark:prose-invert max-w-none ${
            align === "center" ? "text-center" : align === "right" ? "text-right" : ""
          }`}
          dangerouslySetInnerHTML={{ __html: html }}
          onClick={(e) => {
            if (!isBuilderPreview) return;
            e.preventDefault();
            e.stopPropagation();
            const rect = e.currentTarget?.getBoundingClientRect?.() || null;
            if (typeof onRequestEdit === "function") {
              onRequestEdit({
                sectionId: section?.id,
                kind: "richtext",
                path: "settings.html",
                label: "Text block",
                value: html,
                rect
              });
            }
          }}
          role={isBuilderPreview ? "button" : undefined}
          tabIndex={isBuilderPreview ? 0 : undefined}
        />
      </div>
    </section>
  );
});

const FeaturesGridSection = memo(function FeaturesGridSection({ section, isBuilderPreview, onRequestEdit }) {
  const s = section?.settings || {};
  const title = s.title || "";
  const items = Array.isArray(s.items) ? s.items : [];
  return (
    <section className="w-full bg-gray-50 dark:bg-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {title && (
          <EditableText
            as="h2"
            isBuilderPreview={isBuilderPreview}
            onRequestEdit={onRequestEdit}
            request={{ sectionId: section?.id, kind: "text", path: "settings.title", label: "Section title", value: title }}
            className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-10"
          >
            {title}
          </EditableText>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.slice(0, 24).map((it, idx) => (
            <div
              key={it.id || idx}
              className="border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6"
              style={{ borderRadius: "var(--site-radius)" }}
            >
              <EditableText
                as="div"
                isBuilderPreview={isBuilderPreview}
                onRequestEdit={onRequestEdit}
                request={{
                  sectionId: section?.id,
                  kind: "text",
                  path: `settings.items.${idx}.title`,
                  label: "Feature title",
                  value: it.title || ""
                }}
                className="text-lg font-semibold text-gray-900 dark:text-white"
              >
                {it.title || "Feature"}
              </EditableText>
              <EditableText
                as="div"
                isBuilderPreview={isBuilderPreview}
                onRequestEdit={onRequestEdit}
                request={{
                  sectionId: section?.id,
                  kind: "textarea",
                  path: `settings.items.${idx}.description`,
                  label: "Feature description",
                  value: it.description || ""
                }}
                className="mt-2 text-sm text-gray-600 dark:text-gray-300"
              >
                {it.description || ""}
              </EditableText>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
});

const FaqSection = memo(function FaqSection({ section, isBuilderPreview, onRequestEdit }) {
  const s = section?.settings || {};
  const title = s.title || "FAQ";
  const items = Array.isArray(s.items) ? s.items : [];
  return (
    <section className="w-full">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <EditableText
          as="h2"
          isBuilderPreview={isBuilderPreview}
          onRequestEdit={onRequestEdit}
          request={{ sectionId: section?.id, kind: "text", path: "settings.title", label: "FAQ title", value: title }}
          className="text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center"
        >
          {title}
        </EditableText>
        <div className="space-y-3">
          {items.slice(0, 30).map((it, idx) => (
            <details
              key={it.id || idx}
              className="group rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"
            >
              <summary className="cursor-pointer list-none font-semibold text-gray-900 dark:text-white">
                <EditableText
                  as="span"
                  isBuilderPreview={isBuilderPreview}
                  onRequestEdit={onRequestEdit}
                  request={{
                    sectionId: section?.id,
                    kind: "text",
                    path: `settings.items.${idx}.q`,
                    label: "Question",
                    value: it.q || ""
                  }}
                >
                  {it.q || "Question"}
                </EditableText>
              </summary>
              <EditableText
                as="div"
                isBuilderPreview={isBuilderPreview}
                onRequestEdit={onRequestEdit}
                request={{
                  sectionId: section?.id,
                  kind: "textarea",
                  path: `settings.items.${idx}.a`,
                  label: "Answer",
                  value: it.a || ""
                }}
                className="mt-2 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap"
              >
                {it.a || ""}
              </EditableText>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
});

const CtaSection = memo(function CtaSection({ section, isBuilderPreview, onRequestEdit }) {
  const s = section?.settings || {};
  return (
    <section
      className="w-full"
      style={{
        backgroundImage: "linear-gradient(90deg, var(--site-primary), var(--site-secondary))"
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <EditableText
          as="h2"
          isBuilderPreview={isBuilderPreview}
          onRequestEdit={onRequestEdit}
          request={{
            sectionId: section?.id,
            kind: "text",
            path: "settings.heading",
            label: "CTA heading",
            value: s.heading || ""
          }}
          className="text-3xl md:text-4xl font-bold text-white"
        >
          {s.heading || "Call to action"}
        </EditableText>
        {s.subheading && (
          <EditableText
            as="p"
            isBuilderPreview={isBuilderPreview}
            onRequestEdit={onRequestEdit}
            request={{
              sectionId: section?.id,
              kind: "textarea",
              path: "settings.subheading",
              label: "CTA subheading",
              value: s.subheading || ""
            }}
            className="mt-4 text-lg text-indigo-100"
          >
            {s.subheading}
          </EditableText>
        )}
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          {s.primaryButtonText && (
            <a
              href={s.primaryButtonLink || "#"}
              className="inline-flex items-center justify-center px-6 py-3 bg-white text-indigo-700 font-semibold hover:bg-gray-50 transition-colors"
              style={{ borderRadius: "var(--site-radius)" }}
            >
              <EditableText
                isBuilderPreview={isBuilderPreview}
                onRequestEdit={onRequestEdit}
                request={{
                  sectionId: section?.id,
                  kind: "text",
                  path: "settings.primaryButtonText",
                  label: "Primary button text",
                  value: s.primaryButtonText || ""
                }}
              >
                {s.primaryButtonText}
              </EditableText>
            </a>
          )}
          {s.secondaryButtonText && (
            <a
              href={s.secondaryButtonLink || "#"}
              className="inline-flex items-center justify-center px-6 py-3 border border-white text-white font-semibold hover:bg-white/10 transition-colors"
              style={{ borderRadius: "var(--site-radius)" }}
            >
              <EditableText
                isBuilderPreview={isBuilderPreview}
                onRequestEdit={onRequestEdit}
                request={{
                  sectionId: section?.id,
                  kind: "text",
                  path: "settings.secondaryButtonText",
                  label: "Secondary button text",
                  value: s.secondaryButtonText || ""
                }}
              >
                {s.secondaryButtonText}
              </EditableText>
            </a>
          )}
        </div>
      </div>
    </section>
  );
});

const SpacerSection = memo(function SpacerSection({ section }) {
  const height = Number(section?.settings?.heightPx || 24);
  const safe = Math.min(Math.max(0, height), 240);
  return <div style={{ height: `${safe}px` }} />;
});

const CustomHtmlSection = memo(function CustomHtmlSection({ section }) {
  const html = String(section?.settings?.html || "");
  return (
    <section className="w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </section>
  );
});

const ImageTextSection = memo(function ImageTextSection({ section, isBuilderPreview, onRequestEdit }) {
  const s = section?.settings || {};
  const side = s.imageSide === "right" ? "right" : "left";
  const imageUrl = s.imageUrl || "";
  return (
    <section className="w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-10 items-center`}>
          {side === "left" && (
            <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40" style={{ borderRadius: "var(--site-radius)" }}>
              {imageUrl ? (
                <img src={imageUrl} alt="" className="w-full h-72 object-cover" loading="lazy" />
              ) : (
                <div className="h-72 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                  Image
                </div>
              )}
            </div>
          )}
          <div>
            {s.heading && (
              <EditableText
                as="h2"
                isBuilderPreview={isBuilderPreview}
                onRequestEdit={onRequestEdit}
                request={{
                  sectionId: section?.id,
                  kind: "text",
                  path: "settings.heading",
                  label: "Heading",
                  value: s.heading || ""
                }}
                className="text-3xl font-bold text-gray-900 dark:text-white"
              >
                {s.heading}
              </EditableText>
            )}
            {s.html && (
              <div
                className="mt-4 prose dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: s.html }}
                onClick={(e) => {
                  if (!isBuilderPreview) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const rect = e.currentTarget?.getBoundingClientRect?.() || null;
                  if (typeof onRequestEdit === "function") {
                    onRequestEdit({
                      sectionId: section?.id,
                      kind: "richtext",
                      path: "settings.html",
                      label: "Body",
                      value: s.html || "",
                      rect
                    });
                  }
                }}
                role={isBuilderPreview ? "button" : undefined}
                tabIndex={isBuilderPreview ? 0 : undefined}
              />
            )}
          </div>
          {side === "right" && (
            <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40" style={{ borderRadius: "var(--site-radius)" }}>
              {imageUrl ? (
                <img src={imageUrl} alt="" className="w-full h-72 object-cover" loading="lazy" />
              ) : (
                <div className="h-72 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                  Image
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
});

const TestimonialsSection = memo(function TestimonialsSection({ section, isBuilderPreview, onRequestEdit }) {
  const s = section?.settings || {};
  const title = s.title || "Testimonials";
  const items = Array.isArray(s.items) ? s.items : [];
  return (
    <section className="w-full bg-gray-50 dark:bg-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <EditableText
          as="h2"
          isBuilderPreview={isBuilderPreview}
          onRequestEdit={onRequestEdit}
          request={{
            sectionId: section?.id,
            kind: "text",
            path: "settings.title",
            label: "Testimonials title",
            value: title
          }}
          className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-10"
        >
          {title}
        </EditableText>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {items.slice(0, 12).map((it, idx) => (
            <div
              key={it.id || idx}
              className="border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6"
              style={{ borderRadius: "var(--site-radius)" }}
            >
              <EditableText
                as="div"
                isBuilderPreview={isBuilderPreview}
                onRequestEdit={onRequestEdit}
                request={{
                  sectionId: section?.id,
                  kind: "textarea",
                  path: `settings.items.${idx}.quote`,
                  label: "Quote",
                  value: it.quote || ""
                }}
                className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap"
              >
                “{it.quote || ""}”
              </EditableText>
              <EditableText
                as="div"
                isBuilderPreview={isBuilderPreview}
                onRequestEdit={onRequestEdit}
                request={{
                  sectionId: section?.id,
                  kind: "text",
                  path: `settings.items.${idx}.name`,
                  label: "Name",
                  value: it.name || ""
                }}
                className="mt-4 text-sm font-semibold text-gray-900 dark:text-white"
              >
                {it.name || "Customer"}
              </EditableText>
              {it.role && (
                <EditableText
                  as="div"
                  isBuilderPreview={isBuilderPreview}
                  onRequestEdit={onRequestEdit}
                  request={{
                    sectionId: section?.id,
                    kind: "text",
                    path: `settings.items.${idx}.role`,
                    label: "Role",
                    value: it.role || ""
                  }}
                  className="text-xs text-gray-500 dark:text-gray-400"
                >
                  {it.role}
                </EditableText>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
});

const SECTION_REGISTRY = {
  hero: HeroBannerSection,
  text: TextBlockSection,
  features_grid: FeaturesGridSection,
  faq: FaqSection,
  cta: CtaSection,
  spacer: SpacerSection,
  custom_html: CustomHtmlSection,
  image_text: ImageTextSection,
  testimonials: TestimonialsSection
};

function applyThemeVars(themeSettings = {}) {
  const primary = themeSettings.primaryColor || "#4f46e5";
  const secondary = themeSettings.secondaryColor || "#9333ea";
  const radius = Number(themeSettings.borderRadius || 12);
  const fontFamily = themeSettings.fontFamily || "";

  return {
    "--site-primary": primary,
    "--site-secondary": secondary,
    "--site-radius": `${Math.min(Math.max(0, radius), 24)}px`,
    ...(fontFamily ? { fontFamily } : {})
  };
}

function HomepageRendererInner({
  sections = [],
  themeSettings = {},
  renderHidden = false,
  isBuilderPreview = false,
  selectedSectionId = "",
  onSelectSection = null,
  onRequestEdit = null
}) {
  const styleVars = useMemo(() => applyThemeVars(themeSettings), [themeSettings]);
  const visible = useMemo(() => {
    const list = Array.isArray(sections) ? sections : [];
    if (renderHidden) return list;
    return list.filter((s) => !s?.hidden);
  }, [sections, renderHidden]);

  const handleClickCapture = useCallback(
    (e) => {
      if (!isBuilderPreview) return;
      const link = e.target?.closest ? e.target.closest("a") : null;
      if (link) {
        e.preventDefault();
        e.stopPropagation();
        const wrapper = e.target.closest?.("[data-section-id]") || null;
        const sectionId = wrapper?.getAttribute?.("data-section-id") || "";
        if (sectionId && typeof onSelectSection === "function") {
          onSelectSection(sectionId);
        }
      }
    },
    [isBuilderPreview, onSelectSection]
  );

  return (
    <div style={styleVars} onClickCapture={handleClickCapture}>
      {visible.map((section, idx) => {
        const type = String(section?.type || "").toLowerCase();
        const Comp = SECTION_REGISTRY[type];
        if (!Comp) return null;
        const sectionId = String(section?.id || `${type}-${idx}`);
        const isSelected = isBuilderPreview && selectedSectionId && selectedSectionId === sectionId;
        return (
          <div
            key={sectionId}
            data-section-id={sectionId}
            className={isBuilderPreview ? "relative cursor-pointer" : undefined}
            onClick={() => {
              if (!isBuilderPreview) return;
              if (typeof onSelectSection === "function") onSelectSection(sectionId);
            }}
            style={
              isSelected
                ? {
                    outline: "2px solid var(--site-primary)",
                    outlineOffset: "-2px"
                  }
                : undefined
            }
          >
            <Suspense fallback={<div className="py-10" />}>
              <Comp
                section={section}
                isBuilderPreview={isBuilderPreview}
                onRequestEdit={onRequestEdit}
              />
            </Suspense>
          </div>
        );
      })}
    </div>
  );
}

const HomepageRenderer = memo(HomepageRendererInner);

export default HomepageRenderer;

