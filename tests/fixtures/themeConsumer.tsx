import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { useTranslation } from '../../src/hooks/useTranslation';
import { useTheme } from '../../src/theme/useTheme';

export function ThemeConsumer({ request }: { request: () => void }) {
  const { themeColors, resolvedTheme } = useTheme();
  const { resolvedLanguage } = useTranslation();
  const [draft, setDraft] = useState('preserved');
  const style = useMemo(() => ({ backgroundColor: themeColors.background }), [themeColors]);
  useEffect(() => { request(); }, [request]);
  return <View style={style} onTouchEnd={() => setDraft('edited')}>
    <Text>{resolvedTheme}:{resolvedLanguage}:{draft}</Text>
  </View>;
}
