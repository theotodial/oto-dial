import { useMemo } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';

const WORLD_MAP_GEO_JSON = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

let regionNames = null;
try {
  regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
} catch {
  regionNames = null;
}

function normalize(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/**
 * WorldMap - choropleth of visits by country. Country data is keyed by
 * ISO-2 code (from server geo lookup); we resolve display names via
 * Intl.DisplayNames and fuzzy-match against the atlas geography names.
 */
function WorldMap({ countries = [] }) {
  const { byName, max } = useMemo(() => {
    const map = {};
    let maxVal = 0;
    for (const c of countries) {
      const code = c.countryCode || c.country;
      if (!code) continue;
      let displayName = code;
      if (regionNames && /^[A-Za-z]{2}$/.test(code)) {
        try {
          displayName = regionNames.of(code.toUpperCase()) || code;
        } catch {
          displayName = code;
        }
      }
      const key = normalize(displayName);
      map[key] = (map[key] || 0) + (c.visits || 0);
      if (map[key] > maxVal) maxVal = map[key];
    }
    return { byName: map, max: maxVal };
  }, [countries]);

  const colorFor = (geoName) => {
    const key = normalize(geoName);
    let value = byName[key];
    if (!value) {
      // Fuzzy: match if atlas name contains our name or vice versa.
      const match = Object.keys(byName).find(
        (k) => k && (key.includes(k) || k.includes(key))
      );
      value = match ? byName[match] : 0;
    }
    if (!value || max <= 0) return '#e2e8f0';
    const intensity = Math.min(1, 0.15 + (value / max) * 0.85);
    return `rgba(99, 102, 241, ${intensity.toFixed(2)})`;
  };

  return (
    <div className="w-full">
      <ComposableMap
        projectionConfig={{ scale: 145 }}
        height={380}
        style={{ width: '100%', height: 'auto' }}
      >
        <Geographies geography={WORLD_MAP_GEO_JSON}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const name = geo.properties?.name || geo.properties?.NAME;
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={colorFor(name)}
                  stroke="#cbd5e1"
                  strokeWidth={0.4}
                  style={{
                    default: { outline: 'none' },
                    hover: { fill: '#4f46e5', outline: 'none' },
                    pressed: { outline: 'none' }
                  }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>
    </div>
  );
}

export default WorldMap;
