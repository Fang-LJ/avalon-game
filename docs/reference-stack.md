# playmate-space 参考审计

仅做了只读审计，没有修改 `/Users/fangliangjun/work_space/playmate-space`。

- 小程序：原生微信小程序 JavaScript/WXML/WXSS；`utils/request.js` 统一包装 `wx.request`；`services/` 按业务拆 API；JWT 保存在微信本地存储。
- 后端：Java 21、Spring Boot 3.3.7、Maven、Spring MVC、MyBatis-Plus 3.5.9。
- 登录：小程序 `wx.login` → `/api/auth/wx-login` → 服务端 `jscode2session` → JWT Bearer；local profile 支持 mock openid。
- 数据库：MySQL 8，连接参数全部由环境变量覆盖；本地默认 schema 是 `playmate_space`、端口是 `13306`。
- 公共响应：`{ code, message, data, traceId }`，成功码是 `SUCCESS`。
- API 鉴权：MVC interceptor 统一解析 `Authorization: Bearer <JWT>`，登录/健康检查等接口放行。
- 服务配置：Spring profiles + 环境变量；生产 Docker Compose/Nginx 配置位于参照项目的 `deploy/`。
- 实时能力：参照项目没有现成 WebSocket 实现，因此本项目使用 Spring 原生 WebSocket，并继续采用 REST 拉取授权状态的安全边界。

本项目沿用了 Java/Spring Boot/Maven/MySQL/JWT、profile 环境变量、统一响应和原生小程序请求分层。数据访问改用 Spring JDBC 显式 SQL，以便清楚表达 `SELECT ... FOR UPDATE`、唯一约束和事务边界；这部分与 playmate-space 不产生代码耦合。
