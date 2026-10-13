import { useEffect, useRef, useState } from 'react';
import { Image, type ImageSource } from 'expo-image';

import type { PublicPopup, PublicPopupDetail } from '../lib/popups';
import { isCoverUrlStale } from '../lib/placeCoverRecovery';

export type RecoverPlaceCover = (item: PublicPopup) => Promise<PublicPopupDetail | null>;

export function usePlaceCoverImage(item: PublicPopup, recover?: RecoverPlaceCover) {
  const identity = JSON.stringify([item.publicId, item.coverImageUrl, item.coverImageCacheKey, item.coverImageFetchedAt]);
  const latest = useRef({ item, recover, identity });
  const loadedIdentity = useRef<string | null>(null);
  const mounted = useRef(false);
  latest.current = { item, recover, identity };
  const [checked, setChecked] = useState<{ identity: string; source: ImageSource | null } | null>(null);
  const remote: ImageSource | null = item.coverImageUrl
    ? { uri: item.coverImageUrl, ...(item.coverImageCacheKey ? { cacheKey: item.coverImageCacheKey } : {}) } : null;
  const needsCheck = !!recover && !!remote && isCoverUrlStale(item) && loadedIdentity.current !== identity;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!needsCheck) return;
    let cancelled = false;
    const current = latest.current;
    async function check() {
      let path: string | null = null;
      try { path = await Image.getCachePathAsync(item.coverImageCacheKey ?? item.coverImageUrl!); } catch { /* Cache unavailable: recover the URL. */ }
      if (cancelled || latest.current.identity !== current.identity) return;
      if (path) {
        setChecked({ identity, source: { uri: path.startsWith('file:') ? path : `file://${path}`,
          ...(item.coverImageCacheKey ? { cacheKey: item.coverImageCacheKey } : {}) } });
        return;
      }
      const detail = await current.recover!(item);
      if (cancelled || latest.current.identity !== current.identity) return;
      setChecked({ identity, source: detail?.coverImageUrl ? { uri: detail.coverImageUrl,
        ...(detail.coverImageCacheKey ? { cacheKey: detail.coverImageCacheKey } : {}) } : null });
    }
    void check();
    return () => { cancelled = true; };
  }, [identity, needsCheck]);

  const source = checked?.identity === identity ? checked.source : needsCheck ? null : remote;
  const sourceKey = JSON.stringify(source);
  const latestSourceKey = useRef(sourceKey);
  latestSourceKey.current = sourceKey;
  return {
    source,
    onLoad: () => {
      if (mounted.current && latest.current.identity === identity && latestSourceKey.current === sourceKey && source) {
        loadedIdentity.current = identity;
      }
    },
    onError: () => {
      if (!mounted.current || latest.current.identity !== identity || latestSourceKey.current !== sourceKey || !source) return;
      const current = latest.current;
      setChecked({ identity: current.identity, source: null });
      // Error text/status alone cannot identify an expired S3 signature.
      if (!current.recover || !isCoverUrlStale(current.item)) return;
      void current.recover(current.item).then(detail => {
        if (!mounted.current || latest.current.identity !== current.identity || !detail) return;
        setChecked({ identity: current.identity, source: detail.coverImageUrl ? {
          uri: detail.coverImageUrl, ...(detail.coverImageCacheKey ? { cacheKey: detail.coverImageCacheKey } : {}),
        } : null });
      }).catch(() => { /* Keep the placeholder if a caller's recovery rejects. */ });
    },
  };
}
