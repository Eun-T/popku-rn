import { MoreHorizontal, X } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import CommunityAuthor from './CommunityAuthor';
import CommunityPostMenu from './CommunityPostMenu';
import { clearTokens, getAuthSession, getSavedAccessToken, subscribeAuthSession } from '../../lib/auth';
import { CommunityApiError } from '../../lib/community';
import { createCommunityComment, deleteCommunityComment, getCommunityComments, insertCommunityComment, MAX_COMMENT_LENGTH, type CommentTarget, type CommunityComment } from '../../lib/communityComments';
import { communityLikeSession, publishCommunityCommentCount, publishCommunityCommentDeletion } from '../../lib/communityFeedRefresh';
import { formatCommunityTime } from '../../lib/communityTime';
import { communityColors } from '../../theme/communityColors';
import { spacing, typography } from '../../theme/tokens';

type Props = ({ postId: number; targetType?: 'POST' } | { targetId: number; targetType: 'REVIEW' }) & {
  mutationDisabled?: boolean;
  commentCount: number;
  now: number;
  padding: { paddingLeft: number; paddingRight: number };
  onLogin: () => void;
  children: ReactNode;
};

export default function CommunityComments(props: Props) {
  const { commentCount, now, padding, onLogin, children, mutationDisabled = false } = props;
  const targetType = props.targetType ?? 'POST';
  const postId = 'targetId' in props ? props.targetId : props.postId;
  const [items, setItems] = useState<CommunityComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [content, setContent] = useState('');
  const [target, setTarget] = useState<CommentTarget | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [menuComment, setMenuComment] = useState<CommunityComment | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const busy = useRef(false);
  const generation = useRef(0);
  const input = useRef<TextInput>(null);
  const menuBusy = useRef(false);
  const replySelection = useRef(0);

  useEffect(() => {
    let active = true;
    let sequence = 0;
    const check = () => {
      const current = ++sequence;
      void getSavedAccessToken().then((token) => {
        if (active && current === sequence) setCanWrite(!!token);
      }).catch(() => { if (active && current === sequence) setCanWrite(false); });
    };
    check();
    const unsubscribe = subscribeAuthSession(() => {
      setItems((previous) => previous.map((item) => ({ ...item, isOwner: false })));
      // Old-session completion is intentionally ignored; do not leave its sending
      // UI latched after a REVIEW login transition. The ref lock still drains it.
      if (targetType === 'REVIEW') { setSending(false); setDeleting(false); }
      setRetry((value) => value + 1);
      check();
    });
    return () => { active = false; unsubscribe(); };
  }, [targetType]);

  useEffect(() => {
    const request = new AbortController();
    const current = ++generation.current;
    setLoading(true); setListError(false);
    void getCommunityComments(postId, request.signal, targetType).then((page) => {
      if (current !== generation.current || request.signal.aborted) return;
      setItems(page.items);
      publishCommunityCommentCount(postId, page.commentCount, targetType);
    }).catch(() => { if (!request.signal.aborted && current === generation.current) setListError(true); })
      .finally(() => { if (!request.signal.aborted && current === generation.current) setLoading(false); });
    return () => { request.abort(); generation.current += 1; };
  }, [postId, targetType, retry]);

  const selectReply = async (item: CommunityComment) => {
    if (mutationDisabled || mutationDisabled || busy.current) return;
    const current = generation.current;
    const selection = ++replySelection.current;
    try {
      if (!await getSavedAccessToken()) { onLogin(); return; }
      if (current !== generation.current || selection !== replySelection.current || busy.current) return;
      setTarget({ commentId: item.id, parentCommentId: item.parentCommentId ?? item.id, replyToUserId: item.author.id, nickname: item.author.nickname });
      setWriteError(null);
      input.current?.focus();
    } catch { setWriteError('로그인 정보를 확인하지 못했어요. 다시 시도해 주세요.'); }
  };

  const submit = async () => {
    if (mutationDisabled || busy.current || loading || listError) return;
    const text = content.trim();
    if (!text) return;
    if ([...text].length > MAX_COMMENT_LENGTH) { setWriteError(`댓글은 ${MAX_COMMENT_LENGTH.toLocaleString()}자 이하로 입력해 주세요.`); return; }
    busy.current = true; setSending(true); setWriteError(null);
    const current = generation.current;
    const session = communityLikeSession();
    let authGeneration: number | undefined;
    try {
      const auth = targetType === 'REVIEW' ? await getAuthSession() : undefined;
      authGeneration = auth?.generation;
      const token = auth ? auth.accessToken : await getSavedAccessToken();
      if (!token) { onLogin(); return; }
      if (session !== communityLikeSession() || current !== generation.current) return;
      const result = await createCommunityComment(postId, text, target, token, targetType, authGeneration);
      if (session !== communityLikeSession()) return;
      // Keep the mounted feed in sync even if the user went back while sending.
      publishCommunityCommentCount(postId, result.commentCount, targetType);
      if (current !== generation.current) return;
      setItems((previous) => insertCommunityComment(previous, result.item));
      setContent(''); setTarget(null);
    } catch (error) {
      if (current !== generation.current || session !== communityLikeSession()) return;
      if (error instanceof CommunityApiError && error.status === 401) {
        if (targetType === 'REVIEW') {
          if (await clearTokens(authGeneration).catch(() => false)) onLogin();
        } else { await clearTokens().catch(() => {}); onLogin(); }
      } else setWriteError('댓글을 등록하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      busy.current = false;
      if (current === generation.current) setSending(false);
    }
  };

  const remove = async (item: CommunityComment) => {
    if (mutationDisabled || busy.current || !item.isOwner) return;
    busy.current = true; setDeleting(true);
    replySelection.current += 1;
    const current = generation.current;
    const session = communityLikeSession();
    let authGeneration: number | undefined;
    try {
      const auth = targetType === 'REVIEW' ? await getAuthSession() : undefined;
      authGeneration = auth?.generation;
      const token = auth ? auth.accessToken : await getSavedAccessToken();
      if (!token) { onLogin(); return; }
      if (session !== communityLikeSession() || current !== generation.current) return;
      const result = await deleteCommunityComment(postId, item.id, token, targetType, authGeneration);
      if (session !== communityLikeSession()) return;
      publishCommunityCommentDeletion(postId, item, targetType);
      publishCommunityCommentCount(postId, result.commentCount, targetType);
      if (current !== generation.current) return;
      // Ignore a list callback already queued before this successful deletion.
      generation.current += 1;
      setLoading(false);
      setItems((previous) => previous.filter((comment) => comment.id !== item.id
        && (item.parentCommentId !== null || comment.parentCommentId !== item.id)));
      setTarget((previous) => previous && (previous.commentId === item.id
        || (item.parentCommentId === null && previous.parentCommentId === item.id)) ? null : previous);
    } catch (error) {
      if (current !== generation.current || session !== communityLikeSession()) return;
      if (error instanceof CommunityApiError && error.status === 401) {
        if (targetType === 'REVIEW') {
          if (await clearTokens(authGeneration).catch(() => false)) onLogin();
        } else { await clearTokens().catch(() => {}); onLogin(); }
      } else Alert.alert('댓글을 삭제하지 못했어요', '잠시 후 다시 시도해 주세요.');
    } finally {
      busy.current = false; menuBusy.current = false;
      setDeleting(false);
    }
  };

  const selectMenu = (index: number) => {
    const item = menuComment;
    setMenuComment(null);
    if (index !== 2 || !item) { menuBusy.current = false; return; }
    Alert.alert('댓글을 삭제할까요?', '삭제한 댓글은 되돌릴 수 없습니다.', [
      { text: '취소', style: 'cancel', onPress: () => { menuBusy.current = false; } },
      { text: '삭제', style: 'destructive', onPress: () => { void remove(item); } },
    ], { cancelable: true, onDismiss: () => { if (!busy.current) menuBusy.current = false; } });
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        {children}
        <View style={[styles.section, padding]}>
          <Text style={styles.heading}>댓글 {commentCount}</Text>
          {loading ? <ActivityIndicator color={communityColors.charcoal} />
            : listError ? <View><Text accessibilityRole="alert" style={styles.meta}>댓글을 불러오지 못했어요.</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="댓글 다시 시도" onPress={() => setRetry((value) => value + 1)}>
                <Text style={styles.action}>다시 시도</Text>
              </Pressable></View>
              : items.length === 0 ? <Text style={styles.meta}>아직 댓글이 없어요.</Text>
                : items.map((item) => <View key={item.id} style={[styles.comment, item.parentCommentId !== null && styles.reply]}>
                  <CommunityAuthor author={item.author} createdAt={item.createdAt} now={now} showTime={false} />
                  <Text style={styles.body}>{item.replyToUser && <Text style={styles.mention}>@{item.replyToUser.nickname} </Text>}{item.content}</Text>
                  <View style={styles.footer}>
                    <Text style={styles.meta}>{formatCommunityTime(item.createdAt, now)}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`${item.author.nickname}에게 답글`} disabled={mutationDisabled || sending || deleting}
                      onPress={() => { void selectReply(item); }} hitSlop={8}><Text style={styles.action}>답글</Text></Pressable>
                    {canWrite && item.isOwner && <Pressable accessibilityRole="button" accessibilityLabel={`${item.id}번 댓글 메뉴`}
                      disabled={mutationDisabled || sending || deleting} hitSlop={6} style={styles.more} onPress={() => {
                        if (mutationDisabled || busy.current || menuBusy.current) return;
                        menuBusy.current = true; setMenuComment(item);
                      }}><MoreHorizontal size={18} color={communityColors.secondaryText} /></Pressable>}
                  </View>
                </View>)}
        </View>
      </ScrollView>
      <View style={[styles.composer, padding]}>
        {target && <View style={styles.target}>
          <Text style={styles.meta}>@{target.nickname}에게 답글</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="답글 취소" disabled={mutationDisabled || sending || deleting} hitSlop={8} onPress={() => setTarget(null)}>
            <X size={18} color={communityColors.secondaryText} />
          </Pressable>
        </View>}
        {writeError && <Text accessibilityRole="alert" style={styles.meta}>{writeError}</Text>}
        <View style={styles.inputRow}>
          {canWrite ? <TextInput ref={input} style={styles.input} multiline editable={!mutationDisabled && !sending && !deleting} value={content}
            accessibilityLabel="댓글 입력" placeholder="댓글을 입력해주세요..." placeholderTextColor={communityColors.secondaryText}
            onChangeText={setContent} />
            : <Pressable style={styles.input} accessibilityRole="button" accessibilityLabel="댓글 입력" onPress={onLogin}>
              <Text style={styles.meta}>댓글을 입력해주세요...</Text>
            </Pressable>}
          <Pressable accessibilityRole="button" accessibilityLabel="댓글 등록" disabled={mutationDisabled || sending || deleting || loading || listError || !content.trim()}
            onPress={() => { void submit(); }} style={styles.send}>
            {sending ? <ActivityIndicator color={communityColors.charcoal} /> : <Text style={[styles.action, (!content.trim() || loading || listError) && styles.disabled]}>등록</Text>}
          </Pressable>
        </View>
      </View>
      {menuComment && <CommunityPostMenu showEdit={false} onSelect={selectMenu} />}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: { borderTopWidth: 1, borderTopColor: communityColors.divider, paddingTop: spacing.space24, paddingBottom: spacing.space24, rowGap: spacing.space16 },
  heading: { ...typography.titleS, color: communityColors.text },
  comment: { rowGap: spacing.space8, paddingVertical: spacing.space8 },
  reply: { marginLeft: spacing.space24 },
  body: { ...typography.body, color: communityColors.text, marginLeft: 52 },
  mention: { fontWeight: '700' },
  footer: { flexDirection: 'row', columnGap: spacing.space16, alignItems: 'center', marginLeft: 52 },
  more: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  meta: { ...typography.caption, color: communityColors.secondaryText },
  action: { ...typography.label, color: communityColors.charcoal },
  composer: { borderTopWidth: 1, borderTopColor: communityColors.divider, paddingVertical: spacing.space12, rowGap: spacing.space8, backgroundColor: communityColors.background },
  target: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inputRow: { flexDirection: 'row', alignItems: 'center', columnGap: spacing.space12 },
  input: { ...typography.body, color: communityColors.text, flex: 1, minHeight: 44, maxHeight: 120, paddingVertical: spacing.space8 },
  send: { padding: spacing.space8 },
  disabled: { color: communityColors.secondaryText },
});
