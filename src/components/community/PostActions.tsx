import { useFocusEffect, useRouter } from 'expo-router';
import { MoreHorizontal } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from '../../hooks/useTranslation';
import { authSessionGeneration, clearTokens, getAuthUser, subscribeAuthUser } from '../../lib/auth';
import { CommunityApiError, deleteCommunityPost, type CommunityFeedItem } from '../../lib/community';
import { publishCommunityPostChange } from '../../lib/communityFeedRefresh';
import { communityColors } from '../../theme/communityColors';
import CommunityPostMenu from './CommunityPostMenu';
import ModerationActions from './ModerationActions';

export default function PostActions({ post }: { post: Pick<CommunityFeedItem, 'id' | 'author'> }) {
  const { t } = useTranslation();
  const translation = useRef(t);
  useEffect(() => { translation.current = t; }, [t]);
  const router = useRouter();
  const user = useSyncExternalStore(subscribeAuthUser, getAuthUser, getAuthUser);
  const owned = user?.id !== undefined && user.id === post.author.id;
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const locked = useRef(false);
  const removing = useRef(false);
  const focused = useRef(false);
  const mounted = useRef(true);
  const confirmation = useRef<object | null>(null);
  const menuGeneration = useRef(authSessionGeneration());
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
    setOpen(false); confirmation.current = null;
    if (!removing.current) locked.current = false;
  }, [user, post.id]);
  const available = (generation: number) => mounted.current && focused.current
    && authSessionGeneration() === generation && getAuthUser()?.id === post.author.id;
  async function remove(ticket: object, generation: number) {
    if (confirmation.current !== ticket || !available(generation) || removing.current) return;
    confirmation.current = null; removing.current = true; setDeleting(true);
    try {
      await deleteCommunityPost(post.id);
      publishCommunityPostChange(post.id, null);
    } catch (error) {
      if (error instanceof CommunityApiError && error.status === 401) {
        const invalidated = await clearTokens(error.authGeneration).catch(() => false);
        if (invalidated && mounted.current && focused.current) router.push('/profile/login');
      } else if (available(generation)) Alert.alert(translation.current('community.delete.failed'));
    } finally {
      removing.current = false; locked.current = false;
      if (mounted.current) setDeleting(false);
    }
  }
  function select(index: number) {
    setOpen(false);
    const generation = menuGeneration.current;
    if (!available(generation) || removing.current) return;
    if (index === 1) {
      try { router.push({ pathname: '/community/write', params: { editId: String(post.id) } }); }
      catch { locked.current = false; Alert.alert(t('community.edit.failed')); }
    } else if (index === 2 && confirmation.current === null) {
      const ticket = {}; confirmation.current = ticket;
      const cancel = () => {
        if (confirmation.current !== ticket) return;
        confirmation.current = null; locked.current = false;
      };
      Alert.alert(t('community.delete.title'), t('community.delete.message'), [
        { text: t('community.cancel'), style: 'cancel', onPress: cancel },
        { text: t('community.delete.confirm'), style: 'destructive', onPress: () => { void remove(ticket, generation); } },
      ], { cancelable: true, onDismiss: cancel });
    } else locked.current = false;
  }
  if (!owned) return <ModerationActions targetType="POST" targetId={post.id} authorId={post.author.id} />;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={t('community.postMenu')} disabled={deleting}
      accessibilityState={{ expanded: open, disabled: deleting }} style={styles.button} onPress={event => {
        event.stopPropagation();
        if (!locked.current && !removing.current && focused.current) {
          menuGeneration.current = authSessionGeneration(); locked.current = true; setOpen(true);
        }
      }}>
      <MoreHorizontal size={20} color={communityColors.secondaryText} />
    </Pressable>
    {open && <CommunityPostMenu onSelect={select} />}
  </>;
}
const styles = StyleSheet.create({ button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' } });
