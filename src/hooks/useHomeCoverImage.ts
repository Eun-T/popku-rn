import { useEffect, useRef, useState } from 'react';
import type { ImageSource } from 'expo-image';

import type { PublicPopup, PublicPopupDetail } from '../lib/popups';

export type RecoverHomeCover = (item: PublicPopup, manual?: boolean) => Promise<{
  detail: PublicPopupDetail; fetchedAt: number;
} | null>;

const placeholder = require('../../assets/images/ranking-placeholder.png');

/** Recover only after a native error. Rendering and tab focus never request a URL. */
export function useHomeCoverImage(image: ImageSource | number, item?: PublicPopup,
  recover?: RecoverHomeCover, scope?: string) {
  const identity = JSON.stringify([scope, item?.publicId, item?.coverImageUrl, item?.coverImageCacheKey, item?.coverImageFetchedAt, image]);
  const latest = useRef(identity);
  latest.current = identity;
  const mounted = useRef(false);
  const pending = useRef<string | null>(null);
  const errored = useRef<string | null>(null);
  const imageId = JSON.stringify([item?.publicId, item?.coverImageCacheKey ?? item?.coverImageUrl ?? image]);
  const loaded = useRef<{ imageId: string; source: ImageSource | number } | null>(null);
  const [state, setState] = useState<{ identity: string; failed: boolean; busy: boolean;
    source?: ImageSource; revision: number } | null>(null);
  const current = state?.identity === identity ? state : null;
  const remote = item ? (item.coverImageUrl ? { uri: item.coverImageUrl,
    ...(item.coverImageCacheKey ? { cacheKey: item.coverImageCacheKey } : {}) } : placeholder) : image;
  // Another home section renewing this cover must not disturb an already visible poster.
  const source = current?.failed ? placeholder : current?.source
    ?? (loaded.current?.imageId === imageId ? loaded.current.source : remote);
  const sourceIdentity = JSON.stringify([identity, source, current?.revision ?? 0]);
  const latestSource = useRef(sourceIdentity);
  latestSource.current = sourceIdentity;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function request(manual: boolean) {
    if (!mounted.current || latest.current !== identity || !item?.coverImageUrl || !recover || pending.current === identity) return;
    pending.current = identity;
    setState({ identity, failed: true, busy: true, revision: current?.revision ?? 0 });
    try {
      const result = await recover(item, manual);
      if (!mounted.current || latest.current !== identity) return;
      setState({ identity, failed: !result?.detail.coverImageUrl, busy: false, revision: (current?.revision ?? 0) + 1,
        ...(result?.detail.coverImageUrl ? { source: { uri: result.detail.coverImageUrl,
          ...(result.detail.coverImageCacheKey ? { cacheKey: result.detail.coverImageCacheKey } : {}) } } : {}) });
    } catch {
      if (mounted.current && latest.current === identity) {
        setState({ identity, failed: true, busy: false, revision: current?.revision ?? 0 });
      }
    } finally {
      if (pending.current === identity) pending.current = null;
    }
  }

  return {
    source, imageKey: JSON.stringify([imageId, source, current?.revision ?? 0]),
    canRetry: !!current?.failed && !!item?.coverImageUrl && !!recover,
    busy: !!current?.busy,
    retry: () => { void request(true); },
    onLoad: () => {
      if (mounted.current && latest.current === identity && latestSource.current === sourceIdentity && source !== placeholder) {
        loaded.current = { imageId, source };
      }
    },
    onError: () => {
      if (!mounted.current || latest.current !== identity || latestSource.current !== sourceIdentity || source === placeholder
        || errored.current === sourceIdentity) return;
      errored.current = sourceIdentity;
      loaded.current = null;
      if (typeof source === 'object' && typeof remote === 'object' && source.uri !== remote.uri && !current?.source) {
        // A sibling already renewed this URL. Try it without issuing another GET.
        setState({ identity, failed: false, busy: false, source: remote, revision: (current?.revision ?? 0) + 1 });
        return;
      }
      setState({ identity, failed: true, busy: false, revision: current?.revision ?? 0 });
      void request(false);
    },
  };
}
