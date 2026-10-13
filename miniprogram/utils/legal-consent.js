const agreement = require('./legal/user-agreement');
const privacy = require('./legal/privacy-policy');
const KEY = 'AVALON_LEGAL_CONSENT';
let blocked = false;
// A local change detector, not a signature or a server audit record.
function fingerprint(text) {
  let a = 2166136261, b = 5381;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ text.charCodeAt(i);
  }
  return `${a >>> 0}:${b >>> 0}`;
}
const documentsSignature = fingerprint(JSON.stringify([agreement, privacy]));
function receipt() {
  try {
    const value = wx.getStorageSync(KEY);
    return value && typeof value === 'object' ? value : null;
  } catch (_) { return null; }
}
function isCurrent(token = '') {
  const value = receipt();
  return !blocked && !!value && value.schema === 1 && value.agreed === true &&
    value.agreementVersion === agreement.version && value.privacyVersion === privacy.version &&
    value.documentsSignature === documentsSignature && Number.isFinite(value.confirmedAt) &&
    value.confirmedAt > 0 && value.confirmedAt <= Date.now() + 60000 &&
    (!token || value.tokenSignature === fingerprint(token));
}
function accept(token = '') {
  const value = { schema: 1, agreed: true, agreementVersion: agreement.version, privacyVersion: privacy.version,
    documentsSignature, confirmedAt: Date.now(), tokenSignature: token ? fingerprint(token) : '', userId: null };
  blocked = true;
  wx.setStorageSync(KEY, value);
  blocked = false;
  if (!isCurrent(token)) throw new Error('无法保存协议同意记录，请重试');
  return value;
}
function clear() { blocked = true; wx.removeStorageSync(KEY); }
function bindSession(token, userId) {
  if (!isCurrent()) throw new Error('请先阅读并同意协议');
  const value = { ...receipt(), tokenSignature: fingerprint(token), userId: userId == null ? null : userId };
  blocked = true;
  wx.setStorageSync(KEY, value);
  blocked = false;
  if (!isCurrent(token)) throw new Error('无法保存协议同意记录，请重试');
}
module.exports = { KEY, receipt, isCurrent, accept, clear, bindSession };
