import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from '../../hooks/useTranslation';
import { authSessionGeneration } from '../../lib/auth';
import { ModerationApiError, REPORT_REASONS, reportContent, type ModerationTarget, type ReportReason } from '../../lib/moderation';
import { communityColors } from '../../theme/communityColors';
import { colors, typography } from '../../theme/tokens';
import CommunityPostMenu from './CommunityPostMenu';

type Props = { target: ModerationTarget; generation: number; onClose: (success: boolean) => void };
export default function ReportSheet({ target, generation, onClose }: Props) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  async function submit(dismiss: (index: number) => void) {
    if (!reason || busy.current || generation !== authSessionGeneration()) return;
    busy.current = true; setPending(true); setError(null);
    try {
      await reportContent(target, reason, detail, generation);
      if (active.current && generation === authSessionGeneration()) dismiss(5);
    } catch (failure) {
      if (active.current && generation === authSessionGeneration()) {
        setError(failure instanceof ModerationApiError && failure.status === 409 ? 'moderation.reportDuplicate'
          : failure instanceof ModerationApiError && failure.status === 404 ? 'moderation.targetMissing' : 'moderation.failed');
      }
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  }
  return <CommunityPostMenu edgeToEdge showEdit={false} showDelete={false} onSelect={index => onClose(index === 5)}
    content={dismiss => <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('moderation.report')}</Text>
      {REPORT_REASONS.map(value => <Pressable key={value} accessibilityRole="radio"
        accessibilityState={{ checked: reason === value, disabled: pending }} disabled={pending}
        onPress={() => setReason(value)} style={styles.option}>
        <View style={[styles.radio, reason === value && styles.selected]} /><Text style={styles.text}>{t(`moderation.reasons.${value}`)}</Text>
      </Pressable>)}
      <TextInput style={styles.input} multiline textAlignVertical="top" editable={!pending} value={detail}
        accessibilityLabel={t('moderation.detail')} placeholder={t('moderation.detail')} placeholderTextColor={communityColors.secondaryText}
        onChangeText={value => setDetail([...value].slice(0, 200).join(''))} />
      <Text style={styles.count}>{[...detail].length}/200</Text>
      {error && <Text accessibilityRole="alert" style={styles.error}>{t(error)}</Text>}
      <Pressable accessibilityRole="button" accessibilityLabel={t('moderation.submit')} disabled={!reason || pending}
        accessibilityState={{ disabled: !reason || pending, busy: pending }} onPress={() => { void submit(dismiss); }}
        style={[styles.submit, (!reason || pending) && styles.disabled]}>
        {pending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>{t('moderation.submit')}</Text>}
      </Pressable>
      <Pressable accessibilityRole="button" disabled={pending} onPress={() => dismiss(0)} style={styles.option}>
        <Text style={styles.text}>{t('community.cancel')}</Text>
      </Pressable>
    </ScrollView>} />;
}
const styles = StyleSheet.create({
  scroll: { maxHeight: 480, flexShrink: 1 }, content: { paddingBottom: 8 },
  title: { ...typography.titleS, color: communityColors.text, marginBottom: 8 },
  option: { minHeight: 44, flexDirection: 'row', alignItems: 'center', columnGap: 12 },
  text: { ...typography.body, color: communityColors.text },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: colors.border },
  selected: { borderWidth: 5, borderColor: colors.primary },
  input: { ...typography.body, color: communityColors.text, minHeight: 84, maxHeight: 120, borderWidth: 1,
    borderColor: colors.border, borderRadius: 8, padding: 12, marginTop: 8 },
  count: { ...typography.caption, color: communityColors.secondaryText, textAlign: 'right', marginVertical: 8 },
  error: { ...typography.caption, color: '#DC2626', marginBottom: 8 },
  submit: { height: 52, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 }, submitText: { ...typography.label, color: '#FFFFFF' },
});
