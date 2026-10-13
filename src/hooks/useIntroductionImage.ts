import { useEffect, useRef, useState } from 'react';
import { currentIntroductionUrl, introductionImageId, recoverIntroductionImage,
  type IntroductionScope } from '../lib/introductionImageRecovery';

/** Image-local state: recovery never writes to the detail page or the other slides. */
export function useIntroductionImage(uri: string, scope: IntroductionScope | undefined, fetchedAt: number) {
  const identity = introductionImageId(uri);
  const generation = JSON.stringify([scope, identity, uri, fetchedAt]);
  const contentGeneration = JSON.stringify([scope?.popupId, scope?.countryCode, identity, uri, fetchedAt]);
  const latest = useRef(generation);
  latest.current = generation;
  const mounted = useRef(false);
  const pending = useRef<string | null>(null);
  const errored = useRef<string | null>(null);
  const loaded = useRef<{ identity: string | null; scope: string; uri: string } | null>(null);
  const [state, setState] = useState<{ generation: string; requestGeneration: string; uri?: string; failed: boolean; busy: boolean; revision: number } | null>(null);
  const current = state?.generation === contentGeneration ? state : null;
  const scopeId = JSON.stringify([scope?.popupId, scope?.countryCode]);
  const remote = scope ? currentIntroductionUrl(scope, uri, fetchedAt) : uri;
  const sourceUri = current?.uri ?? (identity && loaded.current?.identity === identity && loaded.current.scope === scopeId
    ? loaded.current.uri : remote);
  const sourceKey = JSON.stringify([generation, sourceUri, current?.revision ?? 0]);
  const latestSource = useRef(sourceKey);
  latestSource.current = sourceKey;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function request(manual: boolean) {
    if (!mounted.current || latest.current !== generation || !scope || !identity || pending.current === generation) return;
    pending.current = generation;
    setState({ generation: contentGeneration, requestGeneration: generation, failed: true, busy: true, revision: current?.revision ?? 0 });
    const result = await recoverIntroductionImage(scope, sourceUri, fetchedAt, manual);
    if (mounted.current && latest.current === generation) {
      setState({ generation: contentGeneration, requestGeneration: generation, uri: result?.uri, failed: !result, busy: false, revision: (current?.revision ?? 0) + 1 });
    }
    if (pending.current === generation) pending.current = null;
  }
  return {
    uri: sourceUri,
    imageKey: JSON.stringify([scopeId, identity ?? uri, sourceUri, current?.revision ?? 0]),
    cacheKey: scope && identity ? `introduction:${scope.popupId}:${identity}` : undefined,
    failed: !!current?.failed,
    busy: !!current?.busy && current.requestGeneration === generation,
    canRetry: !!current?.failed && !!identity && !!scope,
    retry: () => { void request(true); },
    isCurrent: () => mounted.current && latest.current === generation && latestSource.current === sourceKey,
    onLoad: () => {
      if (mounted.current && latest.current === generation && latestSource.current === sourceKey) {
        loaded.current = { identity, scope: scopeId, uri: sourceUri };
      }
    },
    onError: () => {
      if (!mounted.current || latest.current !== generation || latestSource.current !== sourceKey
        || current?.failed || errored.current === sourceKey) return;
      errored.current = sourceKey;
      loaded.current = null;
      if (sourceUri !== remote && !current?.uri) {
        setState({ generation: contentGeneration, requestGeneration: generation, uri: remote, failed: false, busy: false, revision: (current?.revision ?? 0) + 1 });
        return;
      }
      setState({ generation: contentGeneration, requestGeneration: generation, failed: true, busy: false, revision: current?.revision ?? 0 });
      void request(false);
    },
  };
}
