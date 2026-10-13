import { CalendarDays } from 'lucide-react-native';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from '../../hooks/useTranslation';
import { dateAfterDays, editDateInput, formatDateInput, isValidDateRange, parseDateInput, presetDatePeriod, type PlaceDatePeriod } from '../../lib/placeDatePeriod';
import { colors, radius, typography } from '../../theme/tokens';

type Props = { value: PlaceDatePeriod; visible: boolean; onChange: (value: PlaceDatePeriod) => void };
type Field = 'start' | 'end';
type Selection = { start: number; end: number };

export default function PlacePeriodPicker({ value, visible, onChange }: Props) {
  const { t } = useTranslation();
  const [texts, setTexts] = useState(() => ({
    start: formatDateInput(value.startDate ?? ''), end: formatDateInput(value.endDate ?? ''),
  }));
  const [selections, setSelections] = useState<Partial<Record<Field, Selection>>>({});
  const cursor = useRef<Record<Field, Selection>>({ start: { start: 0, end: 0 }, end: { start: 0, end: 0 } });
  const pendingCursor = useRef<Partial<Record<Field, Selection>>>({});
  const lastChange = useRef(value);
  const lastVisible = useRef(visible);
  useEffect(() => {
    // Own edits retain their raw strings; external preset/reset/cancel changes replace them.
    if (value !== lastChange.current || visible !== lastVisible.current) {
      setTexts({ start: formatDateInput(value.startDate ?? ''), end: formatDateInput(value.endDate ?? '') });
      pendingCursor.current = {};
      setSelections({});
    }
    lastChange.current = value;
    lastVisible.current = visible;
    if (!visible) Keyboard.dismiss();
  }, [value, visible]);

  const publish = (field: Field, text: string) => {
    const next: PlaceDatePeriod = {
      ...value, mode: 'custom', [field === 'start' ? 'startDate' : 'endDate']: parseDateInput(text),
    };
    lastChange.current = next;
    onChange(next);
  };
  const setCursor = (field: Field, selection: Selection) => {
    cursor.current[field] = selection;
    pendingCursor.current[field] = selection;
    setSelections(previous => ({ ...previous, [field]: selection }));
  };
  const focus = (field: Field) => {
    // Default only an empty input; never replace an existing/incomplete edit.
    if (texts[field]) return;
    const text = formatDateInput(dateAfterDays(field === 'start' ? 0 : 7));
    setTexts(previous => ({ ...previous, [field]: text }));
    setCursor(field, { start: text.length, end: text.length });
    publish(field, text);
  };
  const edit = (field: Field, incoming: string) => {
    const next = editDateInput(texts[field], incoming, cursor.current[field]);
    setTexts(previous => ({ ...previous, [field]: next.text }));
    setCursor(field, next.selection);
    // Invalid/incomplete text stays local; clear the parsed draft date to block stale Apply.
    publish(field, next.text);
  };
  const select = (field: Field, selection: Selection) => {
    const pending = pendingCursor.current[field];
    if (pending) {
      if (pending.start !== selection.start || pending.end !== selection.end) return;
      delete pendingCursor.current[field];
      setSelections(previous => ({ ...previous, [field]: undefined }));
    }
    cursor.current[field] = selection;
  };
  const valid = isValidDateRange(value.startDate, value.endDate);
  const custom = value.mode === 'custom';

  return <View style={styles.container}>
    <View style={styles.presets}>
      {(['all', 'today', 'sevenDays'] as const).map(mode => <Pressable key={mode} accessibilityRole="button"
        accessibilityState={{ selected: value.mode === mode }} onPress={() => {
          Keyboard.dismiss();
          onChange(presetDatePeriod(mode));
        }} style={[styles.pill, value.mode === mode && styles.selectedPill]}>
        <Text style={[styles.pillText, value.mode === mode && styles.white]}>{t(`place.all.period.${mode === 'all' ? 'any' : mode}`)}</Text>
      </Pressable>)}
    </View>
    <View style={styles.row}>
      {(['start', 'end'] as const).map(field => <Fragment key={field}>
        {field === 'end' && <Text style={styles.separator}>~</Text>}
        <View style={[styles.input, custom && valid && styles.selectedInput]}>
          <CalendarDays size={16} color={colors.secondaryText} />
          <TextInput accessibilityLabel={t(`place.all.period.${field}`)} placeholder={t(`place.all.period.${field}`)}
            placeholderTextColor={colors.secondaryText} keyboardType="number-pad" value={texts[field]}
            selection={selections[field]} onFocus={() => focus(field)} onChangeText={text => edit(field, text)}
            onSelectionChange={event => select(field, event.nativeEvent.selection)}
            autoCorrect={false} style={styles.date} />
        </View>
      </Fragment>)}
    </View>
    {custom && !valid && <Text accessibilityRole="alert" style={styles.note}>
      {t(`place.all.period.${value.startDate && value.endDate ? 'invalidRange' : 'invalidDate'}`)}
    </Text>}
  </View>;
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: 12 },
  presets: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  pill: { minHeight: 36, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, backgroundColor: colors.background },
  selectedPill: { backgroundColor: colors.text, borderColor: colors.text },
  pillText: { ...typography.label, color: colors.text },
  white: { color: colors.background },
  row: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 4 },
  input: { flex: 1, minWidth: 0, height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  date: { flex: 1, minWidth: 0, height: 44, padding: 0, paddingVertical: 0, fontSize: 16, includeFontPadding: false, textAlignVertical: 'center', color: colors.text, textAlign: 'left' },
  separator: { ...typography.caption, width: 16, flexShrink: 0, textAlign: 'center', color: colors.secondaryText },
  selectedInput: { borderColor: colors.primaryDark },
  note: { ...typography.caption, color: colors.secondaryText },
});
