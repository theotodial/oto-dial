import { useCallback, useEffect, useRef, useState } from 'react';

export default function FloatingPanel({
  title,
  open,
  onClose,
  rect,
  onRectChange,
  onActivate,
  children,
  minW = 220,
  minH = 160,
}) {
  const [mode, setMode] = useState(null);
  const origin = useRef({ mx: 0, my: 0, rect: {} });

  const end = useCallback(() => {
    setMode(null);
  }, []);

  useEffect(() => {
    if (!mode) return undefined;
    const onMove = (e) => {
      const dx = e.clientX - origin.current.mx;
      const dy = e.clientY - origin.current.my;
      const r = origin.current.rect;
      if (mode === 'drag') {
        onRectChange({
          ...r,
          x: Math.max(0, r.x + dx),
          y: Math.max(0, r.y + dy),
        });
      } else if (mode === 'resize') {
        onRectChange({
          ...r,
          w: Math.max(minW, r.w + dx),
          h: Math.max(minH, r.h + dy),
        });
      }
    };
    const onUp = () => end();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [mode, minW, minH, onRectChange, end]);

  if (!open) return null;

  const start = (e, m) => {
    e.preventDefault();
    e.stopPropagation();
    onActivate?.();
    origin.current = { mx: e.clientX, my: e.clientY, rect: { ...rect } };
    setMode(m);
  };

  return (
    <div
      className="absolute flex flex-col rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl overflow-hidden"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        zIndex: rect.z || 1,
      }}
      onMouseDown={() => onActivate?.()}
    >
      <div
        className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/80 cursor-grab active:cursor-grabbing select-none shrink-0"
        onPointerDown={(e) => start(e, 'drag')}
      >
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{title}</span>
        <button
          type="button"
          className="text-slate-400 hover:text-slate-700 dark:hover:text-white text-lg leading-none px-1"
          onClick={(e) => {
            e.stopPropagation();
            onClose?.();
          }}
          aria-label="Close panel"
        >
          ×
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{children}</div>
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-40 hover:opacity-100 z-10"
        onPointerDown={(e) => start(e, 'resize')}
        title="Resize"
      />
    </div>
  );
}
