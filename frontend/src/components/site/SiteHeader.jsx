import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";

function normalizeMenuItems(items = []) {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => ({
      id: it?.id || `${it?.label || "item"}-${Math.random().toString(16).slice(2)}`,
      label: String(it?.label || "").trim(),
      href: String(it?.href || "").trim(),
      children: Array.isArray(it?.children) ? it.children : []
    }))
    .filter((it) => it.label);
}

function SiteHeader({ headerConfig = {}, themeSettings = {}, isBuilderPreview = false }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const items = useMemo(() => normalizeMenuItems(headerConfig?.items || []), [headerConfig?.items]);
  const sticky = headerConfig?.sticky !== false;
  const bg = headerConfig?.background || "";
  const logoUrl = headerConfig?.logoUrl || "";
  const brandText = headerConfig?.brandText || "OTO DIAL";

  const headerStyle = useMemo(() => {
    const primary = themeSettings?.primaryColor || "#4f46e5";
    const backgroundColor = bg || "rgba(255,255,255,0.9)";
    return {
      background: backgroundColor,
      borderBottom: "1px solid rgba(0,0,0,0.06)",
      backdropFilter: "saturate(180%) blur(12px)",
      WebkitBackdropFilter: "saturate(180%) blur(12px)",
      "--site-primary": primary
    };
  }, [bg, themeSettings?.primaryColor]);

  const Wrapper = sticky ? "div" : "div";

  const preventPreviewNavigation = useCallback(
    (e) => {
      if (!isBuilderPreview) return;
      e.preventDefault();
      e.stopPropagation();
    },
    [isBuilderPreview]
  );

  return (
    <Wrapper className={sticky ? "sticky top-0 z-50" : "relative z-10"} style={headerStyle}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {isBuilderPreview ? (
          <button
            type="button"
            onClick={preventPreviewNavigation}
            className="flex items-center gap-3"
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-8 w-auto object-contain" />
            ) : (
              <div
                className="h-9 w-9 rounded-xl flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: "var(--site-primary)" }}
              >
                OD
              </div>
            )}
            <span className="text-lg font-bold text-gray-900">{brandText}</span>
          </button>
        ) : (
          <Link to="/" className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-8 w-auto object-contain" />
            ) : (
              <div
                className="h-9 w-9 rounded-xl flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: "var(--site-primary)" }}
              >
                OD
              </div>
            )}
            <span className="text-lg font-bold text-gray-900">{brandText}</span>
          </Link>
        )}

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-6">
          {items.map((item) =>
            item.children?.length ? (
              <div key={item.id} className="relative group">
                <button className="text-sm font-semibold text-gray-700 hover:text-gray-900">
                  {item.label}
                </button>
                <div className="absolute left-0 mt-2 w-56 rounded-xl border border-gray-200 bg-white shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition">
                  <div className="p-2">
                    {item.children.slice(0, 20).map((child, idx) => (
                      <a
                        key={child.id || idx}
                        href={child.href || "#"}
                        className="block px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                        onClick={preventPreviewNavigation}
                      >
                        {child.label || "Item"}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <a
                key={item.id}
                href={item.href || "#"}
                className="text-sm font-semibold text-gray-700 hover:text-gray-900"
                onClick={preventPreviewNavigation}
              >
                {item.label}
              </a>
            )
          )}

          {isBuilderPreview ? (
            <>
              <button
                type="button"
                onClick={preventPreviewNavigation}
                className="text-sm font-semibold text-gray-700 hover:text-gray-900"
              >
                Login
              </button>
              <button
                type="button"
                onClick={preventPreviewNavigation}
                className="px-4 py-2 rounded-xl text-white font-semibold text-sm"
                style={{ backgroundColor: "var(--site-primary)" }}
              >
                Get Started
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="text-sm font-semibold text-gray-700 hover:text-gray-900"
              >
                Login
              </Link>
              <Link
                to="/signup"
                className="px-4 py-2 rounded-xl text-white font-semibold text-sm"
                style={{ backgroundColor: "var(--site-primary)" }}
              >
                Get Started
              </Link>
            </>
          )}
        </div>

        {/* Mobile */}
        <button
          className="md:hidden p-2 rounded-lg hover:bg-gray-100"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={mobileOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
            />
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white">
          <div className="max-w-7xl mx-auto px-4 py-4 space-y-2">
            {items.map((item) => (
              <a
                key={item.id}
                href={item.href || "#"}
                className="block px-3 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50"
                onClick={(e) => {
                  if (isBuilderPreview) preventPreviewNavigation(e);
                  setMobileOpen(false);
                }}
              >
                {item.label}
              </a>
            ))}
            <div className="pt-2 flex gap-2">
              {isBuilderPreview ? (
                <>
                  <button
                    type="button"
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-semibold text-center"
                    onClick={(e) => {
                      preventPreviewNavigation(e);
                      setMobileOpen(false);
                    }}
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    className="flex-1 px-3 py-2 rounded-lg text-white text-sm font-semibold text-center"
                    style={{ backgroundColor: "var(--site-primary)" }}
                    onClick={(e) => {
                      preventPreviewNavigation(e);
                      setMobileOpen(false);
                    }}
                  >
                    Get Started
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-semibold text-center"
                    onClick={() => setMobileOpen(false)}
                  >
                    Login
                  </Link>
                  <Link
                    to="/signup"
                    className="flex-1 px-3 py-2 rounded-lg text-white text-sm font-semibold text-center"
                    style={{ backgroundColor: "var(--site-primary)" }}
                    onClick={() => setMobileOpen(false)}
                  >
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Wrapper>
  );
}

export default SiteHeader;

