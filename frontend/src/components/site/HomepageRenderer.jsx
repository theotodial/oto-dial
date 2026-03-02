import { memo, Suspense, useMemo } from "react";

const HeroBannerSection = memo(function HeroBannerSection({ section }) {
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
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900 dark:text-white">
            {heading}
          </h1>
          {subheading && (
            <p className="mt-4 text-lg text-gray-700 dark:text-gray-300">
              {subheading}
            </p>
          )}
          {buttonText && (
            <div className={`mt-8 ${align === "center" ? "flex justify-center" : ""} ${align === "right" ? "flex justify-end" : ""}`}>
              <a
                href={buttonLink}
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl text-white font-semibold transition-colors"
                style={{ backgroundColor: "var(--site-primary)", borderRadius: "var(--site-radius)" }}
              >
                {buttonText}
              </a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
});

const TextBlockSection = memo(function TextBlockSection({ section }) {
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
        />
      </div>
    </section>
  );
});

const FeaturesGridSection = memo(function FeaturesGridSection({ section }) {
  const s = section?.settings || {};
  const title = s.title || "";
  const items = Array.isArray(s.items) ? s.items : [];
  return (
    <section className="w-full bg-gray-50 dark:bg-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {title && (
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-10">
            {title}
          </h2>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.slice(0, 24).map((it, idx) => (
            <div
              key={it.id || idx}
              className="border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6"
              style={{ borderRadius: "var(--site-radius)" }}
            >
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {it.title || "Feature"}
              </div>
              <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                {it.description || ""}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
});

const FaqSection = memo(function FaqSection({ section }) {
  const s = section?.settings || {};
  const title = s.title || "FAQ";
  const items = Array.isArray(s.items) ? s.items : [];
  return (
    <section className="w-full">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center">
          {title}
        </h2>
        <div className="space-y-3">
          {items.slice(0, 30).map((it, idx) => (
            <details
              key={it.id || idx}
              className="group rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"
            >
              <summary className="cursor-pointer list-none font-semibold text-gray-900 dark:text-white">
                {it.q || "Question"}
              </summary>
              <div className="mt-2 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                {it.a || ""}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
});

const CtaSection = memo(function CtaSection({ section }) {
  const s = section?.settings || {};
  return (
    <section
      className="w-full"
      style={{
        backgroundImage: "linear-gradient(90deg, var(--site-primary), var(--site-secondary))"
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-white">
          {s.heading || "Call to action"}
        </h2>
        {s.subheading && (
          <p className="mt-4 text-lg text-indigo-100">
            {s.subheading}
          </p>
        )}
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          {s.primaryButtonText && (
            <a
              href={s.primaryButtonLink || "#"}
              className="inline-flex items-center justify-center px-6 py-3 bg-white text-indigo-700 font-semibold hover:bg-gray-50 transition-colors"
              style={{ borderRadius: "var(--site-radius)" }}
            >
              {s.primaryButtonText}
            </a>
          )}
          {s.secondaryButtonText && (
            <a
              href={s.secondaryButtonLink || "#"}
              className="inline-flex items-center justify-center px-6 py-3 border border-white text-white font-semibold hover:bg-white/10 transition-colors"
              style={{ borderRadius: "var(--site-radius)" }}
            >
              {s.secondaryButtonText}
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

const SECTION_REGISTRY = {
  hero: HeroBannerSection,
  text: TextBlockSection,
  features_grid: FeaturesGridSection,
  faq: FaqSection,
  cta: CtaSection,
  spacer: SpacerSection,
  custom_html: CustomHtmlSection
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

function HomepageRendererInner({ sections = [], themeSettings = {}, renderHidden = false }) {
  const styleVars = useMemo(() => applyThemeVars(themeSettings), [themeSettings]);
  const visible = useMemo(() => {
    const list = Array.isArray(sections) ? sections : [];
    if (renderHidden) return list;
    return list.filter((s) => !s?.hidden);
  }, [sections, renderHidden]);

  return (
    <div style={styleVars}>
      {visible.map((section, idx) => {
        const type = String(section?.type || "").toLowerCase();
        const Comp = SECTION_REGISTRY[type];
        if (!Comp) return null;
        return (
          <Suspense
            key={section?.id || `${type}-${idx}`}
            fallback={<div className="py-10" />}
          >
            <Comp section={section} />
          </Suspense>
        );
      })}
    </div>
  );
}

const HomepageRenderer = memo(HomepageRendererInner);

export default HomepageRenderer;

