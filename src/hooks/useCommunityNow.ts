import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

export function useCommunityNow() {
  const [now, setNow] = useState(Date.now());
  const updateNow = useCallback(() => setNow(Date.now()), []);
  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') updateNow();
    }, 60000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') updateNow();
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [updateNow]);
  return { now, updateNow };
}
