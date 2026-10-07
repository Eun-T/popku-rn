import ja from './ja.json';
import ko from './ko.json';

export type Locale = 'ko' | 'ja';

const defaultLocale: Locale = 'ko';
const currentLocale: Locale = defaultLocale;
export function getLocale(): Locale { return currentLocale; }
const dictionaries: Record<Locale, unknown> = { ko, ja };

function lookup(dictionary: unknown, key: string): string | undefined {
  let value = dictionary;

  for (const part of key.split('.')) {
    if (typeof value !== 'object' || value === null || !Object.prototype.hasOwnProperty.call(value, part)) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[part];
  }

  if (typeof value === 'object' && value !== null) {
    value = (value as Record<string, unknown>)._label;
  }

  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function t(key: string, params?: Record<string, string | number>): string {
  const message = lookup(dictionaries[currentLocale], key)
    ?? lookup(dictionaries[defaultLocale], key)
    ?? key;

  if (!params) return message;
  return message.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] === undefined ? match : String(params[name]));
}
