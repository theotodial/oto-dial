import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import ActiveCallChrome from './ActiveCallChrome';

/**
 * Full-viewport call UI on routes other than /recents (xl+).
 * On /recents at 1280px+, the dialer column mounts ActiveCallChrome instead so the call UI stays in the dialer strip.
 */
export default function GlobalCallOverlay() {
  const location = useLocation();
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    setIsDesktop(mq.matches);
    const fn = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  if (location.pathname === '/recents' && isDesktop) {
    return null;
  }

  return <ActiveCallChrome isDesktop={isDesktop} dockMode={false} />;
}
