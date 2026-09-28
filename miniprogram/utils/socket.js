const { getConfig } = require('./config');
const { getToken } = require('./token');
let socket = null,
  retryTimer = null,
  generation = 0;
function close() {
  generation++;
  clearTimeout(retryTimer);
  retryTimer = null;
  const previous = socket;
  socket = null;
  if (previous) previous.close({});
}
function connect(onEvent) {
  close();
  const session = generation;
  function open() {
    if (session !== generation || !getToken()) return;
    const current = wx.connectSocket({
      url: `${getConfig().wsBaseUrl}/ws/avalon`,
      header: { Authorization: `Bearer ${getToken()}` },
    });
    socket = current;
    current.onMessage((message) => {
      if (session !== generation) return;
      try {
        onEvent(JSON.parse(message.data));
      } catch (_) {}
    });
    current.onClose(() => {
      if (session !== generation) return;
      socket = null;
      retryTimer = setTimeout(open, 2000);
    });
    current.onError(() => {});
  }
  open();
  return () => {
    if (session === generation) close();
  };
}
module.exports = { connect, close };
