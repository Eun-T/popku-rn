export type PopupOperatingStatus = '오픈 예정' | '운영 중' | '종료';

function dateAtMidnight(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function popupOperatingStatus(
  startDate: string | null,
  endDate: string | null,
  today = new Date(),
): PopupOperatingStatus | null {
  const currentDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (startDate && currentDate < dateAtMidnight(startDate)) return '오픈 예정';
  if (endDate && currentDate > dateAtMidnight(endDate)) return '종료';
  return startDate || endDate ? '운영 중' : null;
}
