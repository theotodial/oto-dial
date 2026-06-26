import { useMemo } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { motion } from 'framer-motion';

const WORLD_MAP_GEO_JSON = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

let regionNames = null;
try {
  regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
} catch {
  regionNames = null;
}

function normalize(name) {
  return String(name || '').toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Live geographic map with animated visitor pings.
 */
export default function LiveGeoMap({ geo = [] }) {
  const { byName, max, markers } = useMemo(() => {
    const map = {};
    let maxVal = 0;
    const pts = [];
    for (const g of geo) {
      const country = g.country || 'Unknown';
      const key = normalize(country);
      map[key] = (map[key] || 0) + (g.visitors || 0);
      if (map[key] > maxVal) maxVal = map[key];
      if (g.lat != null && g.lng != null) {
        pts.push({ ...g, coordinates: [g.lng, g.lat] });
      }
    }
    return { byName: map, max: maxVal, markers: pts };
  }, [geo]);

  const colorFor = (geoName) => {
    const key = normalize(geoName);
    let value = byName[key];
    if (!value) {
      const match = Object.keys(byName).find((k) => k && (key.includes(k) || k.includes(key)));
      value = match ? byName[match] : 0;
    }
    if (!value || max <= 0) return '#1e293b';
    const intensity = Math.min(1, 0.2 + (value / max) * 0.8);
    return `rgba(99, 102, 241, ${intensity.toFixed(2)})`;
  };

  return (
    <div className="rounded-2xl border border-gray-200/80 dark:border-slate-700/80 bg-slate-950/90 backdrop-blur overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800">
        <h3 className="font-semibold text-white">Live Geographic Map</h3>
        <p className="text-xs text-slate-400">{geo.length} locations · {geo.reduce((s, g) => s + (g.visitors || 0), 0)} visitors</p>
      </div>
      <ComposableMap projectionConfig={{ scale: 145 }} height={360} style={{ width: '100%' }}>
        <Geographies geography={WORLD_MAP_GEO_JSON}>
          {({ geographies }) =>
            geographies.map((geoItem) => {
              const name = geoItem.properties?.name || geoItem.properties?.NAME;
              return (
                <Geography
                  key={geoItem.rsmKey}
                  geography={geoItem}
                  fill={colorFor(name)}
                  stroke="#334155"
                  strokeWidth={0.35}
                  style={{ default: { outline: 'none' }, hover: { fill: '#818cf8', outline: 'none' }, pressed: { outline: 'none' } }}
                />
              );
            })
          }
        </Geographies>
        {markers.map((m, i) => (
          <Marker key={`${m.country}-${m.city}-${i}`} coordinates={m.coordinates}>
            <motion.circle
              r={4 + Math.min(8, m.visitors || 1)}
              fill="#10b981"
              stroke="#fff"
              strokeWidth={1}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }}
              transition={{ repeat: Infinity, duration: 2 + (i % 3) * 0.5 }}
            />
            <title>{`${m.city || ''} ${m.country}: ${m.visitors} visitors, ${m.purchases || 0} purchases`}</title>
          </Marker>
        ))}
      </ComposableMap>
    </div>
  );
}
