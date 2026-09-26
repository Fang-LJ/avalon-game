// 发布前改为 prod，并在微信公众平台配置合法 request/socket 域名。
const ENV = 'local';
const CONFIG = {
  local: { apiBaseUrl: 'http://127.0.0.1:8081', wsBaseUrl: 'ws://127.0.0.1:8081' },
  prod: { apiBaseUrl: 'https://api.playmatespace.cloud/avalon', wsBaseUrl: 'wss://api.playmatespace.cloud/avalon' }
};
module.exports = { getConfig: () => CONFIG[ENV], getEnvironment: () => ENV };
