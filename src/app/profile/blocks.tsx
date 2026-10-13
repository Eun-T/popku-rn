import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { ChevronLeft, UserRound } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useModerationRevision } from '../../hooks/useModerationRevision';
import { useTranslation } from '../../hooks/useTranslation';
import { authSessionGeneration, getAuthUser, subscribeAuthUser } from '../../lib/auth';
import { getBlockedUsers, unblockUser, type BlockedUser } from '../../lib/moderation';
import { colors, typography } from '../../theme/tokens';

export default function BlockedUsers() {
  const { t } = useTranslation();
  const translation = useRef(t);
  useEffect(() => { translation.current = t; }, [t]);
  const router = useRouter();
  const user = useSyncExternalStore(subscribeAuthUser, getAuthUser, getAuthUser);
  const moderation = useModerationRevision();
  const [items, setItems] = useState<BlockedUser[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [removing, setRemoving] = useState<number | null>(null);
  const request = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const mutation = useRef(false);
  const focused = useRef(false);
  const epoch = useRef(0);
  const confirmation = useRef(0);

  const load = useCallback(async (next: string | null, sequence: number) => {
    if (!getAuthUser() || busy.current || sequence !== epoch.current) return;
    busy.current = true; setLoading(true); setError(false);
    const controller = new AbortController(); request.current = controller;
    const generation = authSessionGeneration();
    try {
      const page = await getBlockedUsers(next, controller.signal, generation);
      if (controller.signal.aborted || sequence !== epoch.current || generation !== authSessionGeneration()) return;
      setItems(previous => next ? [...previous, ...page.items.filter(item => !previous.some(old => old.blockedUserId === item.blockedUserId))] : page.items);
      setCursor(page.nextCursor);
    } catch {
      if (!controller.signal.aborted && sequence === epoch.current && generation === authSessionGeneration()) setError(true);
    } finally {
      if (sequence === epoch.current) { busy.current = false; setLoading(false); }
    }
  }, []);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    request.current?.abort(); busy.current = false;
    const sequence = ++epoch.current;
    setItems([]); setCursor(null); setError(false); setRemoving(null);
    void load(null, sequence);
    return () => {
      focused.current = false; epoch.current += 1; confirmation.current += 1;
      request.current?.abort(); busy.current = false;
    };
  }, [load, user?.id, moderation, retry]));

  function confirm(item: BlockedUser) {
    if (mutation.current || !getAuthUser()) return;
    const generation = authSessionGeneration();
    const ticket = ++confirmation.current;
    const cancel = () => { if (!mutation.current && ticket === confirmation.current) confirmation.current += 1; };
    Alert.alert(t('moderation.unblock'), t('moderation.unblockConfirm', { nickname: item.nickname }), [
      { text: t('community.cancel'), style: 'cancel', onPress: cancel },
      { text: t('moderation.unblock'), onPress: () => {
        if (mutation.current || !focused.current || ticket !== confirmation.current || generation !== authSessionGeneration()) return;
        mutation.current = true; setRemoving(item.blockedUserId);
        void unblockUser(item.blockedUserId, generation, () => {
          if (focused.current && ticket === confirmation.current && generation === authSessionGeneration()) Alert.alert(translation.current('moderation.unblockSuccess'));
        }).catch(() => {
          if (focused.current && ticket === confirmation.current && generation === authSessionGeneration()) Alert.alert(translation.current('moderation.failed'));
        }).finally(() => {
          mutation.current = false;
          if (focused.current) setRemoving(null);
        });
      } },
    ], { cancelable: true, onDismiss: cancel });
  }
  return <SafeAreaView style={styles.container}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('language.back')} style={styles.headerAction}
        onPress={() => router.canGoBack() ? router.back() : router.replace('/profile/settings' as Href)}>
        <ChevronLeft size={24} color={colors.text} />
      </Pressable>
      <Text style={styles.title}>{t('moderation.manageBlocks')}</Text><View style={styles.headerAction} />
    </View>
    {!user ? <Pressable style={styles.message} onPress={() => router.push('/login' as Href)} accessibilityRole="button">
      <Text style={styles.text}>{t('moderation.loginRequired')}</Text>
    </Pressable> : <FlatList data={items} keyExtractor={item => String(item.blockedUserId)} contentContainerStyle={styles.list}
      renderItem={({ item }) => <View style={styles.row}>
        {item.avatarUrl ? <Image source={{ uri: item.avatarUrl }} style={styles.avatar} /> : <View style={styles.avatar}><UserRound size={24} color={colors.secondaryText} /></View>}
        <Text style={[styles.text, styles.nickname]} numberOfLines={2}>{item.nickname}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t('moderation.unblockUser', { nickname: item.nickname })}
          disabled={removing !== null} onPress={() => confirm(item)} style={styles.unblock}>
          {removing === item.blockedUserId ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.unblockText}>{t('moderation.unblock')}</Text>}
        </Pressable>
      </View>}
      ListEmptyComponent={!loading && !error ? <Text style={styles.message}>{t('moderation.emptyBlocks')}</Text> : null}
      ListFooterComponent={<View style={styles.footer}>
        {loading ? <ActivityIndicator color={colors.primary} /> : error ? <Pressable accessibilityRole="button" onPress={() => cursor ? void load(cursor, epoch.current) : setRetry(value => value + 1)}>
          <Text accessibilityRole="alert" style={styles.text}>{t('moderation.loadFailed')}</Text><Text style={styles.unblockText}>{t('community.detail.retry')}</Text>
        </Pressable> : cursor ? <Pressable accessibilityRole="button" onPress={() => { void load(cursor, epoch.current); }}><Text style={styles.text}>{t('moderation.loadMore')}</Text></Pressable> : null}
      </View>} />}
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.titleS, flex: 1, minWidth: 0, textAlign: 'center', color: colors.text },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', columnGap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  text: { ...typography.body, color: colors.text }, nickname: { flex: 1, minWidth: 0 },
  unblock: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  unblockText: { ...typography.label, color: colors.primary },
  message: { ...typography.body, color: colors.secondaryText, paddingVertical: 32, textAlign: 'center' },
  footer: { minHeight: 56, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
});
