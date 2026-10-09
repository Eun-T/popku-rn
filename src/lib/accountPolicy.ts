export function normalizeNickname(value: string): string {
  return value.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '').normalize('NFC');
}

export function isValidNickname(value: string): boolean {
  const length = Array.from(value).length;
  return length >= 2 && length <= 10 && /^[\p{L}\p{Nd}\p{Mn}_]+$/u.test(value);
}

export function isValidPassword(value: string): boolean {
  return /^[\x21-\x7e]{8,72}$/.test(value) && /[A-Za-z]/.test(value) && /[0-9]/.test(value);
}

export function passwordChangeError(current: string, password: string, confirmation: string): string | null {
  if (!current) return '현재 비밀번호를 입력해 주세요.';
  if (!isValidPassword(password)) return '새 비밀번호는 영문과 숫자를 포함한 8~72자의 공백 없는 영문·숫자·기호여야 해요.';
  if (password !== confirmation) return '새 비밀번호와 확인값이 일치하지 않아요.';
  if (current === password) return '현재 비밀번호와 다른 비밀번호를 입력해 주세요.';
  return null;
}
