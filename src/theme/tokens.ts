export const colors = {
  primary: '#22C55E',
  primaryLight: '#DCFCE7',
  primaryDark: '#15803D',
  infoLight: '#DBEAFE',
  infoDark: '#1D4ED8',
  background: '#FFFFFF',
  surface: '#F8FAFC',
  moreButtonBackground: '#F7F8FC',
  text: '#111827',
  secondaryText: '#6B7280',
  inactiveText: '#9CA3AF',
  inactiveTabText: '#B8BEC8',
  border: '#E5E7EB',
  paginationActive: '#494B4F',
  paginationInactive: '#E5E7EB',
  brandGradient: ['#22C55E', '#86EFAC'],
} as const;

export const typography = {
  display: { fontSize: 32, fontWeight: '700', lineHeight: 40 },
  titleL: { fontSize: 24, fontWeight: '700', lineHeight: 32 },
  titleM: { fontSize: 20, fontWeight: '700', lineHeight: 28 },
  titleS: { fontSize: 18, fontWeight: '600', lineHeight: 26 },
  body: { fontSize: 16, fontWeight: '400', lineHeight: 24 },
  label: { fontSize: 14, fontWeight: '500', lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '400', lineHeight: 18 },
} as const;

export const spacing = {
  space2: 2,
  space4: 4,
  space6: 6,
  space8: 8,
  space12: 12,
  space16: 16,
  space20: 20,
  space24: 24,
  space28: 28,
  space32: 32,
  space40: 40,
  space56: 56,
  space60: 60,
} as const;

export const radius = {
  radius4: 4,
  radius8: 8,
  radius12: 12,
  radius16: 16,
  radius24: 24,
  full: 999,
} as const;
