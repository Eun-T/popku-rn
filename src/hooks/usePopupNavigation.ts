import { useCallback, useRef } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

/** One popup transition per focused screen; shared by that screen's entry points. */
export function usePopupNavigation() {
  const router = useRouter();
  const locked = useRef(false);

  useFocusEffect(useCallback(() => { locked.current = false; }, []));

  return useCallback((id: string) => {
    if (locked.current) return;
    locked.current = true;
    try {
      router.push({ pathname: '/places/[id]', params: { id } });
    } catch (error) {
      locked.current = false;
      throw error;
    }
  }, [router]);
}
