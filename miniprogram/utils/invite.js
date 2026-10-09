const KEY = 'AVALON_PENDING_INVITE_ROOM_CODE';
let memoryCode = '';
let memoryOnly = false;

function validRoomCode(value) {
  return typeof value === 'string' && /^\d{6}$/.test(value) ? value : '';
}
function save(value) {
  const code = validRoomCode(value);
  if (!code) return false;
  memoryCode = code;
  try { wx.setStorageSync(KEY, code); memoryOnly = false; }
  catch (_) { memoryOnly = true; /* Keep intent through an in-app relaunch if storage is unavailable. */ }
  return true;
}
function get() {
  if (memoryOnly) return memoryCode;
  try { return validRoomCode(wx.getStorageSync(KEY)); }
  catch (_) { return memoryCode; }
}
function clear(expectedCode) {
  // A late join response must not erase a newer invitation opened in another page.
  if (expectedCode && get() !== expectedCode) return;
  memoryCode = '';
  try { wx.removeStorageSync(KEY); memoryOnly = false; }
  catch (_) { memoryOnly = true; /* In-memory intent is already cleared. */ }
}
function joinPath(code) {
  return `/pages/join/join?roomCode=${validRoomCode(code)}`;
}
function destinationOrHome() {
  const code = get();
  return code ? joinPath(code) : '/pages/index/index';
}
module.exports = { KEY, validRoomCode, save, get, clear, joinPath, destinationOrHome };
