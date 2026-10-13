export type PlaceDatePeriod = {
  mode: 'all' | 'today' | 'sevenDays' | 'custom';
  startDate: string | null;
  endDate: string | null;
};

export function emptyDatePeriod(): PlaceDatePeriod {
  return { mode: 'all', startDate: null, endDate: null };
}

export function localDateValue(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dateAfterDays(days: number, today = new Date()): string {
  const date = new Date(today.getTime());
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return localDateValue(date);
}

export function formatDateInput(digits: string): string {
  const value = digits.replace(/\D/g, '').slice(0, 8);
  return [value.slice(0, 4), value.slice(4, 6), value.slice(6, 8)].filter(Boolean).join('.');
}

export function parseDateInput(text: string): string | null {
  if (!/^\d{4}\.\d{2}\.\d{2}$/.test(text)) return null;
  const date = text.replaceAll('.', '-');
  return isValidDateRange(date, date) ? date : null;
}

// Map the edit position by digit count rather than moving the cursor to the end.
export function editDateInput(previous: string, incoming: string, selection: { start: number; end: number }) {
  let prefix = 0, suffix = 0;
  while (prefix < previous.length && prefix < incoming.length && previous[prefix] === incoming[prefix]) prefix++;
  while (suffix < previous.length - prefix && suffix < incoming.length - prefix
    && previous[previous.length - 1 - suffix] === incoming[incoming.length - 1 - suffix]) suffix++;
  // Repeated digits can make a textual diff ambiguous; prefer the user's selected edit position.
  const atSelection = (start: number, end: number) => {
    const tail = previous.length - end;
    if (start < 0 || incoming.length < start + tail || incoming.slice(0, start) !== previous.slice(0, start)
      || (tail > 0 && incoming.slice(-tail) !== previous.slice(end))) return false;
    prefix = start;
    suffix = tail;
    return true;
  };
  const delta = incoming.length - previous.length;
  if (selection.start !== selection.end || delta >= 0) atSelection(selection.start, selection.end);
  else if (!atSelection(selection.start + delta, selection.start)) atSelection(selection.start, selection.start - delta);
  const removed = previous.slice(prefix, previous.length - suffix);
  let cursor = incoming.length - suffix;
  // Backspace/delete over an automatic dot must remove a digit, not get stuck on the dot.
  if (removed === '.' && incoming.length === previous.length - 1 && selection.start === selection.end) {
    const index = selection.start === prefix + 1 ? prefix - 1 : prefix;
    incoming = incoming.slice(0, index) + incoming.slice(index + 1);
    cursor = Math.max(0, index);
  }
  const before = Math.min(8, incoming.slice(0, cursor).replace(/\D/g, '').length);
  const text = formatDateInput(incoming);
  let position = 0, count = 0;
  while (position < text.length && count < before) {
    if (/\d/.test(text[position])) count++;
    position++;
  }
  if (text[position] === '.') position++;
  return { text, selection: { start: position, end: position } };
}

export function isValidDateRange(start: string | null, end: string | null): boolean {
  const valid = (value: string | null) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(0);
    date.setHours(12, 0, 0, 0);
    date.setFullYear(year, month - 1, day);
    return year >= 1 && localDateValue(date) === value;
  };
  return valid(start) && valid(end) && start! <= end!;
}

export function presetDatePeriod(mode: 'all' | 'today' | 'sevenDays', today = new Date()): PlaceDatePeriod {
  if (mode === 'all') return emptyDatePeriod();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + (mode === 'sevenDays' ? 6 : 0), 12);
  return { mode, startDate: localDateValue(today), endDate: localDateValue(end) };
}
