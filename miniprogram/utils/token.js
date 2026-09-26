const KEY = 'AVALON_GAME_TOKEN';
module.exports = {
  getToken: () => wx.getStorageSync(KEY) || '',
  setToken: (token) => wx.setStorageSync(KEY, token),
  clearToken: () => wx.removeStorageSync(KEY)
};
