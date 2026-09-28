function createRequest(wx, config, session, onUnauthorized) {
  return function request(path, method = "GET", data, auth = true) {
    if (!config.api)
      return Promise.reject(
        new Error("请先配置测试后端地址及小游戏 AppSecret"),
      );
    const generation = session.generation;
    const token = session.get();
    if (auth && !token) return Promise.reject(new Error("请先登录"));
    return new Promise((resolve, reject) =>
      wx.request({
        url: config.api + path,
        method,
        data,
        timeout: 12000,
        header: {
          "Content-Type": "application/json",
          ...(auth ? { Authorization: "Bearer " + token } : {}),
        },
        success: ({ statusCode, data: body }) => {
          if (generation !== session.generation)
            return reject(new Error("会话已切换"));
          if (statusCode === 401 || body?.code === "UNAUTHORIZED") {
            session.clear();
            onUnauthorized();
          }
          if (statusCode >= 200 && statusCode < 300 && body?.code === "SUCCESS")
            return resolve(body.data);
          const error = new Error(body?.message || "请求失败，请稍后重试");
          error.statusCode = statusCode;
          error.code = body?.code;
          reject(error);
        },
        fail: () => reject(new Error("网络连接失败，请检查测试后端地址")),
      }),
    );
  };
}
module.exports = createRequest;
