// 默认连接生产服务器；本地联调时可临时改为 local。
const ENV = 'prod';
const CONFIG = {
  local: { apiBaseUrl: 'http://127.0.0.1:8081', wsBaseUrl: 'ws://127.0.0.1:8081' },
  prod: { apiBaseUrl: 'https://api.playmatespace.cloud/avalon', wsBaseUrl: 'wss://api.playmatespace.cloud/avalon' }
};
module.exports = { getConfig: () => CONFIG[ENV], getEnvironment: () => ENV };
