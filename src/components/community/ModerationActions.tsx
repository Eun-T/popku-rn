import { useFocusEffect } from 'expo-router';
import { MoreHorizontal } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from '../../hooks/useTranslation';
import { authSessionGeneration, getAuthUser, subscribeAuthSession, subscribeAuthUser } from '../../lib/auth';
import { blockContentAuthor, ModerationApiError, type ModerationTarget } from '../../lib/moderation';
import { communityColors } from '../../theme/communityColors';
import CommunityPostMenu from './CommunityPostMenu';
import ReportSheet from './ReportSheet';

type Props = ModerationTarget & { authorId: number; disabled?: boolean; iconSize?: number; style?: StyleProp<ViewStyle> };
export default function ModerationActions({ targetType, targetId, authorId, disabled = false, iconSize = 20, style }: Props) {
  const { t } = useTranslation();
  const translation = useRef(t);
  useEffect(() => { translation.current = t; }, [t]);
  const user = useSyncExternalStore(subscribeAuthUser, getAuthUser, getAuthUser);
  const [menu, setMenu] = useState(false);
  const [report, setReport] = useState(false);
  const [pending, setPending] = useState(false);
  const [context, setContext] = useState<{ generation: number; ticket: number } | null>(null);
  const busy = useRef(false);
  const menuBusy = useRef(false);
  const focused = useRef(false);
  const attempt = useRef(0);
  const session = useRef(authSessionGeneration());
  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; attempt.current += 1; menuBusy.current = false; setMenu(false); setReport(false); };
  }, []));
  useEffect(() => {
    const reset = () => {
      attempt.current += 1; menuBusy.current = false; setMenu(false); setReport(false); setPending(false);
    };
    reset();
    return subscribeAuthSession(reset);
  }, [user?.id, targetType, targetId, authorId]);
  const available = () => focused.current && session.current === authSessionGeneration()
    && !!getAuthUser() && getAuthUser()?.id !== authorId;

  async function block(ticket: number) {
    if (busy.current || ticket !== attempt.current || !available()) return;
    busy.current = true; setPending(true);
    try {
      await blockContentAuthor({ targetType, targetId }, authorId, session.current, duplicate => {
        // Notify before refresh unmounts the selected author's detail/menu.
        if (ticket === attempt.current && available()) Alert.alert(translation.current(duplicate ? 'moderation.blockDuplicate' : 'moderation.blockSuccess'));
      });
    } catch (error) {
      if (!(error instanceof ModerationApiError && error.status === 409) && ticket === attempt.current && available()) Alert.alert(translation.current(
        error instanceof ModerationApiError && error.status === 404 ? 'moderation.targetMissing' : 'moderation.failed'));
    } finally {
      busy.current = false;
      if (ticket === attempt.current && focused.current) setPending(false);
    }
  }
  function select(index: number) {
    if (!context || context.ticket !== attempt.current || context.generation !== authSessionGeneration() || !available()) return;
    setMenu(false); menuBusy.current = false;
    if (!available() || busy.current) return;
    if (index === 3) setReport(true);
    if (index === 4) {
      const ticket = ++attempt.current;
      const cancel = () => { if (!busy.current && ticket === attempt.current) attempt.current += 1; };
      Alert.alert(translation.current('moderation.block'), translation.current('moderation.blockConfirm'), [
        { text: translation.current('community.cancel'), style: 'cancel', onPress: cancel },
        { text: translation.current('moderation.block'), style: 'destructive', onPress: () => { void block(ticket); } },
      ], { cancelable: true, onDismiss: cancel });
    }
  }
  if (!user || user.id === authorId) return null;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={t('moderation.menu')} disabled={disabled || pending}
      accessibilityState={{ disabled: disabled || pending, busy: pending }} hitSlop={6}
      style={[styles.button, style]} onPress={event => {
        event.stopPropagation();
        if (disabled || busy.current || menuBusy.current || !focused.current) return;
        session.current = authSessionGeneration();
        setContext({ generation: session.current, ticket: ++attempt.current });
        menuBusy.current = true; setMenu(true);
      }}>
      <MoreHorizontal size={iconSize} color={communityColors.secondaryText} />
    </Pressable>
    {menu && <CommunityPostMenu edgeToEdge showEdit={false} showDelete={false} showModeration onSelect={select} />}
    {report && context && <ReportSheet target={{ targetType, targetId }} generation={context.generation} onClose={success => {
      // A late native onDismiss must not close a newer report/menu or show its receipt.
      if (context.ticket !== attempt.current || context.generation !== authSessionGeneration() || !available()) return;
      setReport(false);
      if (success && available()) Alert.alert(translation.current('moderation.reportSuccess'));
    }} />}
  </>;
}
const styles = StyleSheet.create({ button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' } });
