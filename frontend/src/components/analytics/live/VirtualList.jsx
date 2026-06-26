import { useCallback, useMemo, useRef, useState } from 'react';

/**
 * Lightweight virtual list for large visitor tables (no extra deps).
 */
export default function VirtualList({
  items = [],
  rowHeight = 52,
  height = 480,
  overscan = 4,
  renderRow,
  getKey = (item, i) => item?.sessionId || i
}) {
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);

  const onScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop);
  }, []);

  const { start, end, totalHeight, offsetY } = useMemo(() => {
    const visible = Math.ceil(height / rowHeight) + overscan * 2;
    const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const endIdx = Math.min(items.length, startIdx + visible);
    return {
      start: startIdx,
      end: endIdx,
      totalHeight: items.length * rowHeight,
      offsetY: startIdx * rowHeight
    };
  }, [items.length, scrollTop, rowHeight, height, overscan]);

  const slice = items.slice(start, end);

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      style={{ height, overflow: 'auto' }}
      className="relative w-full"
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {slice.map((item, i) => (
            <div key={getKey(item, start + i)} style={{ height: rowHeight }}>
              {renderRow(item, start + i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
