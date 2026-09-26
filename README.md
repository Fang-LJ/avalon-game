# Avalon Game / 阿瓦隆桌游

一个独立的多人在线阿瓦隆微信小程序 MVP。后端是所有房间、身份、视野、投票、任务和胜负结果的唯一可信数据源；小程序只展示状态并提交操作，未来可直接增加 Web 客户端。

## 目录

- `backend/`：Java 21、Spring Boot 3.3.7、MySQL、JWT、原生 WebSocket
- `miniprogram/`：原生微信小程序（无第三方前端依赖）
- `docs/sql/001_avalon_init.sql`：完整 MySQL 初始化脚本
- `docs/reference-stack.md`：对 playmate-space 的只读技术栈审计

项目参考了同级 `playmate-space` 的 Spring Boot/JWT/MySQL/API 响应与原生小程序请求封装，但代码和数据库业务表完全独立，没有修改或依赖其源代码。

## 已实现流程

创建/加入 6、7、8 人房间 → 等待大厅 → 服务端安全随机分配身份 → 私有角色视野 → 全员确认 → 队长选人 → 公开组队投票 → 匿名任务提交 → 任务结算/队长轮换 → 三次失败或连续五次否决判负 → 三次成功进入刺杀 → 公开最终身份 → 房主再来一局。

WebSocket 事件只广播事件名、房间号和时间戳，客户端收到后通过带 JWT 的 REST API 拉取自己有权查看的状态。任务失败提交者和未结束对局的其他玩家角色不会出现在公开响应里。WebSocket 断开与重连会更新在线状态，小程序另有 5 秒低频兜底同步。

## 标准任务配置

| 人数 | 第 1 轮 | 第 2 轮 | 第 3 轮 | 第 4 轮 | 第 5 轮 |
|---|---:|---:|---:|---:|---:|
| 6 | 2 | 3 | 4 | 3 | 4 |
| 7 | 2 | 3 | 3 | 4（需 2 张失败） | 4 |
| 8 | 3 | 4 | 4 | 5（需 2 张失败） | 5 |

配置集中在 `backend/src/main/java/com/avalon/game/game/GameRuleConfig.java`。规则依据为 The Resistance: Avalon rulebook：7 人及以上仅第 4 个任务需要至少两张失败牌；连续五支队伍被否决时邪恶获胜。

## 数据库

先将 `docs/sql/001_avalon_init.sql` 执行到 playmate-space 所使用的同一个 MySQL schema。脚本只创建以下独立表，不修改已有业务表：

- `t_avalon_user`
- `t_avalon_user_identity`
- `t_avalon_room`
- `t_avalon_player`
- `t_avalon_game`
- `t_avalon_game_player`
- `t_avalon_mission`
- `t_avalon_vote`
- `t_avalon_mission_action`

数据库连接位于 `backend/src/main/resources/application.yml`，通过 `AVALON_DB_HOST/PORT/NAME/USERNAME/PASSWORD` 覆盖。默认本地端口和 schema 与 playmate-space 的本地 Docker 配置一致。

## 启动后端

```bash
mysql -h 127.0.0.1 -P 13306 -u playmate -p playmate_space < docs/sql/001_avalon_init.sql
cd backend
mvn spring-boot:run
```

默认地址为 `http://127.0.0.1:8081`，健康检查是 `GET /api/health`。本地 profile 接受 `mockOpenid`；非 local profile 使用微信 `jscode2session`，必须配置 `AVALON_WECHAT_APP_ID` 和 `AVALON_WECHAT_APP_SECRET`。生产环境示例见 `.env.example`。

## 打开小程序

用微信开发者工具导入 `miniprogram/`。本地联调保持 `miniprogram/utils/config.js` 中 `ENV = 'local'`，并在开发者工具中关闭合法域名校验。真机/生产发布前：

1. 将 `project.config.json` 的 `appid` 换成真实小程序 AppID。
2. 把 `config.js` 的生产 `apiBaseUrl/wsBaseUrl` 改成 HTTPS/WSS 服务地址并切换为 `prod`。
3. 在微信公众平台配置 request/socket 合法域名。

## 多人流程测试

本地 profile 内置 8 个测试身份。可在不同微信开发者工具实例/存储环境中将 `AVALON_MOCK_USER` 设置为 `1` 到 `8`（或临时调用 `auth.selectMockUser('2')`），分别登录。第一个用户创建房间，其余用户输入六位房间号加入；满员后房主开始。刷新或重开小程序时，首页“返回游戏”会从服务端恢复当前房间与阶段。

自动化检查：

```bash
cd backend && mvn test
cd ../miniprogram && npm test && npm run check
```

## API 概览

- `POST /api/auth/wx-login`
- `POST /api/avalon/room/create|join`
- `GET /api/avalon/room/current|{roomId}`
- `POST /api/avalon/room/{roomId}/leave`
- `POST /api/avalon/game/start?roomId=...`
- `GET /api/avalon/game/{gameId}` 与 `.../my-role`
- `POST .../role-confirm|team|vote|mission|continue|assassinate|restart`
- `GET /ws/avalon`（WebSocket upgrade，推荐用 `Authorization: Bearer <JWT>` 握手头；浏览器客户端也可使用 `token` 查询参数）

所有 `/api/avalon/**` 接口需要 `Authorization: Bearer <JWT>`。写操作在事务内锁定对局行，并结合唯一约束阻止重复投票和重复任务提交。

## 当前边界与扩展

首版没有头像、美术卡牌、聊天、匹配、观战、战绩、商城、音视频以及后台管理。网络断线可恢复，但暂未实现多节点 WebSocket 广播；如果部署多个后端实例，需要在事件层接入 Redis Pub/Sub。

增加 5/9/10 人时，只需在 `GameRuleConfig.CONFIGS` 中增加人数、角色、五轮人数和失败阈值配置，并开放创建页人数选项；核心状态机无需改写。新增莫德雷德、兰斯洛特等角色时，扩展 `GameTypes.Role`、配置和 `RoleVisibilityService`。

## 生产部署

`deploy/docker-compose.prod.yml` 将 Avalon 作为独立容器接入现有 `playmate-prod` Docker 网络，复用 MySQL 服务但只访问 `t_avalon_*` 表。公网入口为：

- REST：`https://api.playmatespace.cloud/avalon/api/...`
- WebSocket：`wss://api.playmatespace.cloud/avalon/ws/avalon`

服务器配置文件是 `/opt/avalon-game/deploy/.env.prod`，不得提交到 Git。Nginx 路由模板位于 `deploy/nginx-avalon.conf.fragment`，当前完整网关配置保存在 `deploy/nginx/api.playmatespace.cloud.conf`。
