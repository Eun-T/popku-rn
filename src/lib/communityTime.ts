import { t } from '../locales';

export function formatCommunityTime(createdAt: string, now: number, translate: typeof t = t): string {
  const minutesAgo = Math.max(0, Math.floor((now - Date.parse(createdAt)) / 60000));
  if (!Number.isFinite(minutesAgo)) return createdAt;
  if (minutesAgo < 60) return translate('community.time.minutesAgo', { count: minutesAgo });
  if (minutesAgo < 1440) return translate('community.time.hoursAgo', { count: Math.floor(minutesAgo / 60) });
  return translate('community.time.daysAgo', { count: Math.floor(minutesAgo / 1440) });
}
