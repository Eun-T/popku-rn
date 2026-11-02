import { isValidDateRange } from './placeDatePeriod';

type MapPopupDates = { startDate?: string | null; endDate?: string | null; countryCode?: string | null };
export type MapPopupDays = { KR: string; JP: string };

const formatters = {
  KR: new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }),
  JP: new Intl.DateTimeFormat('en', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }),
};

export function mapPopupDays(now = Date.now()): MapPopupDays {
  const dateIn = (country: keyof MapPopupDays) => {
    const parts = formatters[country].formatToParts(now);
    return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
  };
  return { KR: dateIn('KR'), JP: dateIn('JP') };
}

export function filterOngoingMapPopups<T extends MapPopupDates>(popups: readonly T[], days = mapPopupDays()): T[] {
  return popups.filter(popup => {
    const { startDate, endDate, countryCode } = popup;
    if (typeof startDate !== 'string' || typeof endDate !== 'string' || !isValidDateRange(startDate, endDate)) return false;
    if (countryCode && countryCode !== 'KR' && countryCode !== 'JP') return false;
    // The map contract omits countryCode. Both supported countries currently share
    // the same calendar day; require both boundaries rather than infer country from language.
    const today = countryCode === 'KR' ? [days.KR] : countryCode === 'JP' ? [days.JP] : [days.KR, days.JP];
    return today.every(day => startDate <= day && endDate >= day);
  });
}

export function nextMapDayDelay(now = Date.now()): number {
  // Seoul and Tokyo both use UTC+09:00 without DST. This parses only the clock
  // boundary with an explicit offset, never the popup's date-only fields as UTC.
  return Date.parse(`${mapPopupDays(now).KR}T00:00:00+09:00`) + 86_400_000 - now;
}
