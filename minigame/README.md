# Avalon 微信小游戏 V1

独立原生 Canvas 2D 客户端，`compileType=game`。保留原有 `../miniprogram/`，两者没有运行时依赖。当前分支为开发迁移版本，未部署生产。

## 打开与环境

微信开发者工具导入本目录，选择小游戏模式。当前小游戏测试号 AppID 仅在 `project.config.json` 中配置。

在 `services/config.js` 切换 `environment`：

- `local`（默认）：HTTP `127.0.0.1:8081/api`，WebSocket `127.0.0.1:8081/ws/avalon`，支持 `avalon_mock_1` 至 `avalon_mock_10`。后端必须使用 local profile。登录页可选择用户，退出登录后可切换。真机测试须把回环地址替换为可访问的测试机地址。
- `test`：先填入独立测试后端的 API 与 WebSocket 地址，使用真实 `wx.login`。后端配置 `AVALON_WECHAT_APP_ID`（值与本目录项目配置一致）和对应 `AVALON_WECHAT_APP_SECRET`。凭证只通过后端环境变量/受保护配置注入，绝不能放入前端、Git、日志或本文档。使用 prod profile 的独立测试后端还须满足现有数据库/JWT 必填校验。
- `prod`：保留现有生产 API/WebSocket 地址，但小游戏生产登录有明确保护，防止把小游戏 code 发送给普通小程序的微信身份配置。生产双客户端接入需要另行设计和确认；本次没有修改生产配置。

开发工具当前关闭域名校验仅用于本地开发；真机/正式发布需配置合法 HTTPS/WSS 域名并打开校验。

## 架构

```text
game.js / game.json / project.config.json
js/          GameApp、SceneManager、TouchManager、InputController
components/  Canvas UI 组件和 ScrollView
scenes/      登录、首页、创建、加入、大厅、身份、游戏、历史、复盘、我的
services/    request、auth、session、avalon、socket、config
utils/       布局、权限、记录展示
assets/      原创占位资源说明
tests/       纯逻辑、绘制和合成测试数据
scripts/     语法检查、独立 UI 测试服务
```

Canvas 按屏幕尺寸与 DPR 建立画布，390 宽设计坐标等比缩放并处理安全区；触摸坐标反向换算。UI 状态变化时按需重绘，不持续运行 60 FPS。前后台生命周期暂停轮询和连接，前台重新读取授权状态。WebSocket 事件仅触发刷新，另有 5 秒 polling fallback。

统一命中区域支持禁用、按压和拖动取消点击。ScrollView 裁剪绘制与命中区域并限制滚动边界。房间号通过系统键盘输入，过滤非数字并限制六位。围桌覆盖 5–10 人，9/10 人使用避免头像、名字和徽标重叠的周边布局。

## Figma 对应

设计来源：Figma 文件 `Vy1WdzYMtNgF3hcpt1t81Q` 的“阿瓦隆游戏 UI”页面 `385:2`。本轮实际重新读取节点与截图。

| 状态 | 节点 | 实现 |
| --- | --- | --- |
| 等待大厅 | 387:3 | LobbyScene |
| 身份揭晓 | 387:57 | RoleRevealScene |
| 队长选人 | 387:81 | GameScene / TEAM_BUILDING |
| 投票完成 | 387:152 | GameScene 投票与最近投票结果 |
| 登录 | 391:119 | LoginScene |
| 首页 | 391:130 | HomeScene |
| 创建房间 | 391:162 | CreateRoomScene |
| 加入房间 | 391:193 | JoinRoomScene |
| 秘密任务 | 392:123 | GameScene / MISSION_EXECUTING |
| 湖中仙女 | 392:143 | GameScene / LADY_OF_LAKE |
| 刺杀梅林 | 392:174 | GameScene / ASSASSINATION |
| 结算 | 392:210 | GameScene / FINISHED |
| 历史战绩 | 393:122 | HistoryScene |
| 完整复盘 | 393:159 | ReplayScene |
| 我的 | 393:180 | MeScene |

已接入现有创建/加入、开始、身份确认、选队、投票、任务出票、Lady、刺杀、重开、退出、历史、复盘、个人资料与统计接口。服务端继续裁定全部规则。当前记录只展示公开汇总；完整角色、个人出票和 Lady 复盘仅来自结束后授权的 replay 接口。私有角色与 Lady 结果仅在当前场景内保存，不写入 storage、不打印日志。

## 测试与当前验收状态

```sh
cd backend && mvn test
cd ../miniprogram && npm test && npm run check
cd ../minigame && npm test && npm run check
```

截至用户要求停止测试并提交时：后端 95 项、原小程序 24 项、小游戏 84 项测试通过；已有语法检查通过。后续少量运行时修正尚未再次全量回归。

开发者工具已作为小游戏启动。实际截图/触摸验证覆盖登录页、首页、创建房间、大厅、身份确认、队长选人、投票、秘密任务、历史滚动及复盘。测试使用本机合成 UI 服务，不是真实微信身份、数据库或多人端到端验收；WebSocket 已与该测试服务建立连接并触发页面状态更新。

按用户要求停止后续测试，以下仍待验证：系统键盘输入与加入房间实际联动、Lady/刺杀/结算完整触摸流程、真机表现、真实后端多人完整对局和最终全量回归。

**真实小游戏 wx.login 待测试后端配置小游戏 AppSecret，尚未完成。** 未修改后端、数据库八表、生产环境或原小程序代码。

需要重复 UI 验证时可手动执行 `node scripts/fixture-server.js`，它只监听本机回环 8081，提供明确标记的合成数据和 WebSocket，不连接任何真实数据库或微信服务。不要与真实本地后端同时启动。测试结束须停止该进程并退出合成登录会话。`tests/` 与 `scripts/` 均不打入游戏包。
