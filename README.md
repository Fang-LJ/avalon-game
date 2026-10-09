# Avalon Game / 阿瓦隆桌游

一个独立的多人在线阿瓦隆微信小程序 MVP。后端是所有房间、身份、视野、投票、任务和胜负结果的唯一可信数据源；小程序只展示状态并提交操作，未来可直接增加 Web 客户端。

## 目录

- `backend/`：Java 21、Spring Boot 3.3.7、MySQL、JWT、原生 WebSocket
- `miniprogram/`：原生微信小程序（无第三方前端依赖）
- `docs/sql/001_avalon_init.sql`：全新安装直接使用的 V2 最终八表 schema
- `docs/sql/002_lady_of_the_lake.sql`：仅保留作 V1 历史记录，V2 禁止执行
- `docs/sql/003_avalon_v2_schema.sql`：已有 V1 开发库备份后的破坏性 V2 重建脚本
- `docs/reference-stack.md`：对 playmate-space 的只读技术栈审计

项目参考了同级 `playmate-space` 的 Spring Boot/JWT/MySQL/API 响应与原生小程序请求封装，但代码和数据库业务表完全独立，没有修改或依赖其源代码。

## 已实现流程

创建/加入 5–10 人房间 → 等待大厅 → 服务端安全随机分配身份 → 私有角色视野 → 全员确认 → 队长选人 → 公开组队投票 → 匿名任务提交 → 自动结算及队长轮换 → 10 人局第 2/3/4 轮湖中仙女 → 三次失败或连续五次否决判负 → 三次成功进入刺杀 → 公开最终身份 → 满员时房主再来一局。

WebSocket 事件只广播事件名、房间号和时间戳，客户端收到后通过带 JWT 的 REST API 拉取自己有权查看的状态。任务失败提交者和未结束对局的其他玩家角色不会出现在公开响应里。WebSocket 断开与重连会更新在线状态，小程序另有 5 秒低频兜底同步。

## 标准任务配置

| 人数 | 第 1 轮 | 第 2 轮 | 第 3 轮 | 第 4 轮 | 第 5 轮 |
|---|---:|---:|---:|---:|---:|
| 5 | 2 | 3 | 2 | 3 | 3 |
| 6 | 2 | 3 | 4 | 3 | 4 |
| 7 | 2 | 3 | 3 | 4（需 2 张失败） | 4 |
| 8 | 3 | 4 | 4 | 5（需 2 张失败） | 5 |
| 9 | 3 | 4 | 4 | 5（需 2 张失败） | 5 |
| 10 | 3 | 4 | 4 | 5（需 2 张失败） | 5 |

配置集中在 `backend/src/main/java/com/avalon/game/game/GameRuleConfig.java`，业务基线是仓库根目录的 `avalon_v1_game_rules.txt`。10 人局启用湖中仙女，第一任持有者是第一任队长右手相邻玩家；第 2、3、4 个任务结算后各使用一次，结果仅当前持有者可见。

## 数据库

全新安装只执行 `docs/sql/001_avalon_init.sql`。不要在 V2 的 001 后执行历史脚本 002。已有 V1 开发环境必须先导出全部 `t_avalon_*` 表，确认数据可删除，再单独执行 `docs/sql/003_avalon_v2_schema.sql` 重建；003 不迁移旧数据，也不会处理任何非 Avalon 表。

- `t_avalon_user`
- `t_avalon_game`
- `t_avalon_game_player`
- `t_avalon_proposal`
- `t_avalon_vote`
- `t_avalon_mission`
- `t_avalon_mission_action`
- `t_avalon_lady_action`

`game` 同时承载等待大厅、进行中对局和已结束历史，`game_player` 保存当局座位、昵称、身份及阵营快照。每次发车、公开投票、任务及具体任务出票、湖中仙女操作都会分别持久化；公开 GameState 仍不会泄露任务出票者或 Lady 私有结果。“再来一局”会复用房间号但创建新的 WAITING game/game_player 记录，真人局上一局保持不变。

房主可在等待大厅添加测试机器人，并在任意进行中阶段结束对局。含机器人的对局不计战绩、不保留历史/复盘，运行数据在结束后清理；真人局被房主提前结束则保留记录但不计胜负。详见 [机器人测试局与结束对局](docs/bot-testing.md)。无需新增表或 migration。

数据库连接位于 `backend/src/main/resources/application.yml`，通过 `AVALON_DB_HOST/PORT/NAME/USERNAME/PASSWORD` 覆盖。默认本地端口和 schema 与 playmate-space 的本地 Docker 配置一致。

## 启动后端

```bash
mysql -h 127.0.0.1 -P 13306 -u playmate -p playmate_space < docs/sql/001_avalon_init.sql
cd backend
SPRING_PROFILES_ACTIVE=local mvn spring-boot:run
```

默认地址为 `http://127.0.0.1:8081`，健康检查是 `GET /api/health`。本地必须显式启用 `local` profile 才接受 `mockOpenid`。生产必须显式启用 `prod`，并完整提供数据库、JWT 与微信环境变量；任何必要配置缺失或继续使用本地 JWT 密钥都会直接启动失败。生产环境示例见 `deploy/.env.prod.example`。

## 打开小程序

用微信开发者工具导入 `miniprogram/`。本地联调保持 `miniprogram/utils/config.js` 中 `ENV = 'local'`，并在开发者工具中关闭合法域名校验。真机/生产发布前：

1. 将 `project.config.json` 的 `appid` 换成真实小程序 AppID。
2. 把 `config.js` 的生产 `apiBaseUrl/wsBaseUrl` 改成 HTTPS/WSS 服务地址并切换为 `prod`。
3. 在微信公众平台配置 request/socket 合法域名。

## 多人流程测试

`local` profile 支持玩家1至玩家10的模拟身份，配合小程序 `utils/config.js` 临时切换到 `local` 使用。`prod` profile 只接受 `wx.login` 产生的 code 并通过微信 `jscode2session` 换取 openid；生产环境不存在重新开启 `mockOpenid` 的配置开关。第一个用户创建房间，其余用户输入六位房间号加入；满员后房主开始。刷新或重开小程序时，首页“返回游戏”会从服务端恢复当前房间与阶段。

自动化检查：

```bash
cd backend && mvn test
cd ../miniprogram && npm test && npm run check
```

## 微信邀请与操作同步

等待大厅“邀请好友”使用微信原生分享，入口是 `/pages/join/join?roomCode=六位房间号`。好友确认后才加入；没有登录或资料尚未完善时，邀请码保存在 `AVALON_PENDING_INVITE_ROOM_CODE`，登录/首次保存资料后恢复加入页面，加入成功才清除。开局后分享回退到普通首页，不再发送无效入房邀请。

投票与任务提交使用独立的 GameState mutation 处理：服务器确认后立即更新自己的完成标记，再等待旧刷新结束并拉取提交后的完整状态。已确认 mutation 会使此前开始的 GET 失效，避免机器人/WebSocket 事件下旧响应抹掉自己的 ✓；新轮次不继承上一轮的完成标记。角色、任务出票和湖中仙女规则均未改变。

## API 概览

- `POST /api/auth/wx-login`
- `POST /api/avalon/room/create|join`
- `GET /api/avalon/room/current|{roomId}`
- `POST /api/avalon/room/{roomId}/leave`
- `POST /api/avalon/game/start?roomId=...`
- `GET /api/avalon/game/{gameId}` 与 `.../my-role`
- `POST .../role-confirm|team|vote|mission|lady-of-lake|assassinate|restart`
- `GET /ws/avalon`（WebSocket upgrade，推荐用 `Authorization: Bearer <JWT>` 握手头；浏览器客户端也可使用 `token` 查询参数）

所有 `/api/avalon/**` 接口需要 `Authorization: Bearer <JWT>`。写操作在事务内锁定对局行，并结合唯一约束阻止重复投票和重复任务提交。

## 当前边界与扩展

首版没有头像、美术卡牌、聊天、匹配、观战、战绩、商城、音视频以及后台管理。网络断线可恢复，但暂未实现多节点 WebSocket 广播；如果部署多个后端实例，需要在事件层接入 Redis Pub/Sub。

## 生产部署

`deploy/docker-compose.prod.yml` 将 Avalon 作为独立容器接入现有 `playmate-prod` Docker 网络，复用 MySQL 服务但只访问 `t_avalon_*` 表。公网入口为：

- REST：`https://api.playmatespace.cloud/avalon/api/...`
- WebSocket：`wss://api.playmatespace.cloud/avalon/ws/avalon`

服务器配置文件是 `/opt/avalon-game/deploy/.env.prod`，不得提交到 Git。Nginx 路由模板位于 `deploy/nginx-avalon.conf.fragment`，当前完整网关配置保存在 `deploy/nginx/api.playmatespace.cloud.conf`。
