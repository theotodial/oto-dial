import { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import { useAppState } from './AppStateContext';
import { patchUserCampaignMode } from '../services/campaignService';

const CampaignContext = createContext(null);

export function CampaignProvider({ children }) {
  const { user, mergeUser } = useAppState();
  const threadCacheRef = useRef(new Map());

  const campaignMode = user?.preferences?.campaignMode === 'pro' ? 'pro' : 'lite';

  const setCampaignMode = useCallback(
    async (mode) => {
      const m = mode === 'pro' ? 'pro' : 'lite';
      await patchUserCampaignMode(m);
      mergeUser({ preferences: { campaignMode: m } });
    },
    [mergeUser]
  );

  const setThreadCache = useCallback((phone, items) => {
    const k = String(phone || '').replace(/\D/g, '');
    if (!k) return;
    threadCacheRef.current.set(k, Array.isArray(items) ? items : []);
  }, []);

  const getThreadCache = useCallback((phone) => {
    const k = String(phone || '').replace(/\D/g, '');
    return threadCacheRef.current.get(k);
  }, []);

  const clearThreadCache = useCallback((phone) => {
    const k = String(phone || '').replace(/\D/g, '');
    if (k) threadCacheRef.current.delete(k);
  }, []);

  const value = useMemo(
    () => ({
      campaignMode,
      setCampaignMode,
      setThreadCache,
      getThreadCache,
      clearThreadCache,
    }),
    [campaignMode, setCampaignMode, setThreadCache, getThreadCache, clearThreadCache]
  );

  return <CampaignContext.Provider value={value}>{children}</CampaignContext.Provider>;
}

export function useCampaign() {
  const ctx = useContext(CampaignContext);
  if (!ctx) {
    throw new Error('useCampaign must be used within CampaignProvider');
  }
  return ctx;
}
