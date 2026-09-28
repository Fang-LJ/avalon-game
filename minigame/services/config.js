// Only non-secret endpoint configuration belongs in this file.
const environment = "local";
const endpoints = {
  local: {
    api: "http://127.0.0.1:8081/api",
    socket: "ws://127.0.0.1:8081/ws/avalon",
    mock: true,
  },
  test: { api: "", socket: "", mock: false },
  prod: {
    api: "https://api.playmatespace.cloud/avalon/api",
    socket: "wss://api.playmatespace.cloud/avalon/ws/avalon",
    mock: false,
  },
};
function getConfig(name = environment) {
  if (!endpoints[name]) throw new Error("未知环境");
  return { ...endpoints[name], environment: name };
}
module.exports = { getConfig };
