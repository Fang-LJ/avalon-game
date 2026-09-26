// 微信凭据配置完成后切回 prod；mock 连接线上服务但使用 8 个测试身份。
const ENV = 'mock';
const CONFIG = {
  local: { apiBaseUrl: 'http://127.0.0.1:8081', wsBaseUrl: 'ws://127.0.0.1:8081', mockLogin: true },
  mock: { apiBaseUrl: 'https://api.playmatespace.cloud/avalon', wsBaseUrl: 'wss://api.playmatespace.cloud/avalon', mockLogin: true },
  prod: { apiBaseUrl: 'https://api.playmatespace.cloud/avalon', wsBaseUrl: 'wss://api.playmatespace.cloud/avalon', mockLogin: false }
};
module.exports = { getConfig: () => CONFIG[ENV], getEnvironment: () => ENV };
