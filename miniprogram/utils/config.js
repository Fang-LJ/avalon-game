// 提交代码保持 prod；本地联调时可临时切换为 local，使用 10 个本地测试身份。
const ENV = 'prod';
const CARD_BASE_URL = 'https://api.playmatespace.cloud/avalon-assets/cards/v1';
const CONFIG = {
  local: { apiBaseUrl: 'http://127.0.0.1:8081', wsBaseUrl: 'ws://127.0.0.1:8081', mockLogin: true, cardBaseUrl: CARD_BASE_URL },
  prod: { apiBaseUrl: 'https://api.playmatespace.cloud/avalon', wsBaseUrl: 'wss://api.playmatespace.cloud/avalon', mockLogin: false, cardBaseUrl: CARD_BASE_URL }
};
module.exports = { getConfig: () => CONFIG[ENV], getEnvironment: () => ENV };
