const LOCAL_API_URL = 'http://192.168.50.146:8080';

function isPrivateIpv4(host) {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
  if (!host.includes(':')) {
    return !host.includes('.') || /\.(localhost|local|internal)$/.test(host) || isPrivateIpv4(host);
  }
  const expandedHost = host.replace(/(\d+\.\d+\.\d+\.\d+)$/, address => {
    const [a, b, c, d] = address.split('.').map(Number);
    return `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  });
  const halves = expandedHost.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const words = (halves.length === 2
    ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right]
    : left).map(word => parseInt(word, 16));
  const first = words[0];
  if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80
    || (first & 0xffc0) === 0xfec0 || (first & 0xff00) === 0xff00) return true;
  if (words.slice(0, 5).every(word => word === 0) && (words[5] === 0 || words[5] === 0xffff)) {
    return isPrivateIpv4(`${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`);
  }
  return false;
}

function resolveApiBaseUrl(value, development) {
  const baseUrl = (value?.trim() || (development ? LOCAL_API_URL : '')).replace(/\/+$/, '');
  if (development) return baseUrl;
  const fail = () => { throw new Error('EXPO_PUBLIC_API_URL must be a public HTTPS API base URL for release builds.'); };
  if (!/^https:\/\//i.test(baseUrl) || /[\s\\]/.test(baseUrl)) fail();
  let url;
  try { url = new URL(baseUrl); } catch { fail(); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password
    || url.search || url.hash || isPrivateHost(url.hostname)) fail();
  return baseUrl;
}

function isReleaseEnvironment(env) {
  return ['production', 'preview'].includes(env.EAS_BUILD_PROFILE)
    || ['production', 'preview'].includes(env.EXPO_PUBLIC_APP_ENV)
    // EAS development clients can build native dependencies with NODE_ENV=production.
    || (env.NODE_ENV === 'production' && env.EAS_BUILD_PROFILE !== 'development');
}

module.exports = { LOCAL_API_URL, resolveApiBaseUrl, isReleaseEnvironment };
