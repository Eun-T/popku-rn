import { useTranslation } from '../../hooks/useTranslation';
import { useFocusEffect, useRouter } from 'expo-router';
import { MoreHorizontal } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Pressable, StyleSheet, type GestureResponderEvent } from 'react-native';
import CommunityPostMenu from '../community/CommunityPostMenu';
import { authSessionGeneration, clearTokens, getAuthUser, subscribeAuthUser } from '../../lib/auth';
import { CommunityApiError } from '../../lib/community';
import { deleteReview, reviewDeleted, type ReviewDetail } from '../../lib/reviews';
import { communityColors } from '../../theme/communityColors';

type Props = { review: Pick<ReviewDetail, 'id' | 'author' | 'popup'> };

// Menu state lives with the action button: opening it does not update the list's
// items, scroll state, or fetch revision. The existing detail sheet is reused.
export default function ReviewActions({ review }: Props) {
  const { t } = useTranslation();
  const translation = useRef(t);
  useEffect(() => { translation.current = t; }, [t]);
  const router = useRouter();
  const user = useSyncExternalStore(subscribeAuthUser, getAuthUser, getAuthUser);
  const owned = user?.id !== undefined && user.id === review.author.id;
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const locked = useRef(false);
  const selected = useRef(false);
  const removing = useRef(false);
  const deleted = useRef(false);
  const mounted = useRef(true);
  const focused = useRef(true);
  const confirmation = useRef<object | null>(null);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    if (!removing.current) locked.current = false;
    return () => { focused.current = false; confirmation.current = null; setOpen(false); };
  }, []));
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; confirmation.current = null; };
  }, []);
  useEffect(() => {
    setOpen(false);
    confirmation.current = null;
    if (!removing.current) locked.current = false;
  }, [user]);

  function owner() { return getAuthUser()?.id === review.author.id; }
  async function remove(ticket: object, generation: number) {
    if (confirmation.current !== ticket || !mounted.current || !focused.current || !owner()
      || authSessionGeneration() !== generation || removing.current || deleted.current) return;
    confirmation.current = null;
    removing.current = true;
    setDeleting(true);
    try {
      await deleteReview(review.id);
      deleted.current = true;
      reviewDeleted(review);
    } catch (reason) {
      if (reason instanceof CommunityApiError && reason.status === 401) {
        const invalidated = await clearTokens(reason.authGeneration).catch(() => false);
        if (invalidated && mounted.current && focused.current) router.push('/profile/login');
      } else if (mounted.current && focused.current) {
        Alert.alert(translation.current('review.deleteFailed'), translation.current('place.detail.tryLater'));
      }
    } finally {
      removing.current = false;
      locked.current = false;
      if (mounted.current) setDeleting(false);
    }
  }
  function select(index: number) {
    if (selected.current) return;
    selected.current = true;
    setOpen(false);
    if (!mounted.current || !focused.current || !owner() || removing.current || deleted.current) return;
    if (index === 0) { locked.current = false; return; }
    if (index === 1) {
      // Keep this lock until focus returns from the editor.
      try { router.push({ pathname: '/reviews/write', params: { editId: String(review.id) } }); }
      catch { locked.current = false; Alert.alert(t('review.editOpenFailed')); }
    } else if (index === 2 && confirmation.current === null) {
      const ticket = {}; confirmation.current = ticket;
      const generation = authSessionGeneration();
      const cancel = () => {
        if (confirmation.current !== ticket) return;
        confirmation.current = null; locked.current = false;
      };
      Alert.alert(t('review.deleteTitle'), t('community.delete.message'), [
        { text: t('community.cancel'), style: 'cancel', onPress: cancel },
        { text: t('community.delete.confirm'), style: 'destructive', onPress: () => { void remove(ticket, generation); } },
      ], { cancelable: true, onDismiss: cancel });
    }
  }
  if (!owned) return null;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={t('review.menu')} accessibilityState={{ expanded: open, disabled: deleting }}
      disabled={deleting} style={styles.button} onPress={(event: GestureResponderEvent) => {
        event.stopPropagation();
        if (!locked.current && !removing.current && !deleted.current) {
          selected.current = false; locked.current = true; setOpen(true);
        }
      }}>
      <MoreHorizontal size={20} color={communityColors.secondaryText} />
    </Pressable>
    {open && owned && <CommunityPostMenu edgeToEdge onSelect={select} />}
  </>;
}
const styles = StyleSheet.create({ button: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' } });
