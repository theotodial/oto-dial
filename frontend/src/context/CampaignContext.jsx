import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAppState } from './AppStateContext';
import { patchUserCampaignMode } from '../services/campaignService';

const CampaignContext = createContext(null);

export function CampaignProvider({ children }) {
  const { user, mergeUser } = useAppState();
  const threadCacheRef = useRef(new Map());
  const hydratedFromProfileRef = useRef(false);
  const [campaignMode, setCampaignModeState] = useState(() => {
    if (typeof window === 'undefined') return 'lite';
    const savedMode = window.localStorage.getItem('otodial_campaign_mode');
    return savedMode === 'pro' ? 'pro' : 'lite';
  });
  const [isSwitching, setIsSwitching] = useState(false);
  const campaignModeRef = useRef(campaignMode);
  campaignModeRef.current = campaignMode;

  useEffect(() => {
    if (hydratedFromProfileRef.current) return;
    if (!user) return;
    const profileMode = user?.preferences?.campaignMode === 'pro' ? 'pro' : 'lite';
    hydratedFromProfileRef.current = true;
    setCampaignModeState(profileMode);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('otodial_campaign_mode', profileMode);
    }
  }, [user]);

  const setCampaignMode = useCallback(
    async (mode) => {
      const newMode = mode === 'pro' ? 'pro' : 'lite';
      const previousMode = campaignModeRef.current;
      if (newMode === previousMode || isSwitching) return;
      setIsSwitching(true);
      console.log('MODE:', newMode);
      try {
        setCampaignModeState(newMode);
        mergeUser({ preferences: { campaignMode: newMode } });
        await patchUserCampaignMode(newMode);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('otodial_campaign_mode', newMode);
        }
      } catch (err) {
        setCampaignModeState(previousMode);
        mergeUser({ preferences: { campaignMode: previousMode } });
        throw err;
      } finally {
        setTimeout(() => setIsSwitching(false), 300);
      }
    },
    [isSwitching, mergeUser]
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
      isSwitching,
      setCampaignMode,
      setThreadCache,
      getThreadCache,
      clearThreadCache,
    }),
    [campaignMode, isSwitching, setCampaignMode, setThreadCache, getThreadCache, clearThreadCache]
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
