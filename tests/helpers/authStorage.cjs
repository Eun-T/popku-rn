// Read the current atomic format or an upgrade fixture's legacy token keys.
function savedToken(storage, key) {
  const suffix = key.endsWith('refreshToken') ? 'refreshToken' : 'accessToken';
  const prefix = key.slice(0, -suffix.length);
  const raw = storage.get(`${prefix}session.v1`);
  return raw ? JSON.parse(raw)[suffix] : storage.get(key);
}
module.exports = { savedToken };
