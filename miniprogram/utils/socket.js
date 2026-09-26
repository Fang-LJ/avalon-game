const { getConfig } = require('./config');
const { getToken } = require('./token');
let socket = null; let retryTimer = null; let stopped = true;
function connect(onEvent) {
  stopped = false; close(false);
  socket = wx.connectSocket({ url: `${getConfig().wsBaseUrl}/ws/avalon`, header: { Authorization: `Bearer ${getToken()}` } });
  socket.onMessage(message => { try { onEvent(JSON.parse(message.data)); } catch (_) {} });
  socket.onClose(() => { socket = null; if (!stopped) retryTimer = setTimeout(() => connect(onEvent), 2000); });
  socket.onError(() => {});
  return () => close(true);
}
function close(permanent = true) { stopped = permanent; if (retryTimer) clearTimeout(retryTimer); retryTimer = null; if (socket) socket.close({}); socket = null; }
module.exports = { connect, close };
