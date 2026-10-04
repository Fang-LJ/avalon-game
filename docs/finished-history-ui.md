# 结算身份与实时提案历史

本轮基于 `dad91da`，保留紧凑圆桌、选择外圈、任务牌弹层及 stale-round 防护。
没有修改核心规则、状态机、座位、机器人、restart、身份视野或数据库 schema；没有 migration，也没有生产部署。

## 结算身份

- `PublicIdentity` 新增 `avatarUrl` 和公开 `isBot` 标记，仍只在 `FINISHED` 返回。
- `gamePlayerIdentities(gameId)` 一次 JOIN 游戏玩家和用户，读取昵称快照、当前头像和已公开身份。
- 查询不限制 `left_at`，即使参与者离开房间也继续显示，不依赖 `RoomView.players`。
- 结算行是 `68rpx avatar | minmax(0, 1fr) player | max-content role` 的 grid，按座位正序排列。
- 行高至少 92rpx；头像真实 URL 优先，否则机器人显示“机”，普通用户显示昵称首字。
- 昵称单行省略，角色单行右对齐，GOOD 青绿 / EVIL 红。角色文本不带前导换行，避免字形视觉下沉。
- 胜利卡至身份列表 36rpx，身份列表至操作区 56rpx；长列表正常滚动，不强行压缩十人局。

## 实时与复盘分离

- `logs()` 保持完整复盘数据，`resolved` 只明确识别 APPROVED / REJECTED。
- 新增 `liveLogs()` 只保留这两个状态，任务仅呈现完成后的公开汇总，个人出票与 Lady 结果不进入 live 展示。
- 新增 `teamSeatText` / `leaderText`；实时卡只展示队伍座位，完整队伍昵称仍供复盘和全部记录使用。
- 当前 VOTING 提案仍由圆桌中心展示，历史为空时不渲染 game-log；FINISHED 不渲染 live 历史。
- compact 非 replay 模式使用固定 336rpx swiper，数据旧到新、初次默认最新，带页码。
- 用 `currentProposalId` 保持刷新位置；看最新时跟随新历史，看旧历史时保留同一 ID。
- `gameId` 改变会重置 ID/index 并关闭全部记录面板。
- 多于一条记录时提供“查看全部记录”，自定义 bottom sheet 内 scroll-view 最新在上。
- 同局刷新不会关闭面板；面板没有 API 写操作，不提交任何游戏行动。
- Replay 继续完整纵向列表、任务个人出票和 Lady 历史的既有授权语义，包括 HOST_ENDED 的未完成提案。

## 验证及限制

- 新增后端 `FinishedIdentityTest`：结束态头像/BOT、其他阶段无公开身份、单 JOIN 无 N+1、离开参与者与昵称快照。JDBC 测试使用隔离 H2 内存数据库，不连接生产。
- 增加 HOST_ENDED replay 保留未完成提案的回归测试。
- 新增前端 `finished-history-ui.test.js`：过滤/隐私、短字段、swiper 生命周期、面板、结算 fallback、RoomView 缺少离开玩家仍完整展示、历史刷新不干扰任务选择。
- 微信开发者工具 375×812 模拟器实测 5～10 人结算行与长昵称；头像/角色同列居中，操作区间距 28px（56rpx）。实测没有历史时隐藏、当前 VOTING 不进历史、最新/旧记录刷新策略、全记录面板和换局重置。
- 模拟器请求均由本地 UI fixtures 拦截，没有向服务器写测试数据；结束后恢复原 token 和请求/Socket 方法。
- 实测 Replay 继续纵向渲染全部提案（包含 VOTING），个人任务记录和 Lady 历史仍可显示，没有变成 live swiper。
- 375 / 390 / 430px 结算列宽几何测试通过。未进行真实手机测试，仍需真机核对字体缩放、安全区、swiper 手势与较矮屏幕滚动。

测试命令：`cd backend && mvn test`；`cd miniprogram && npm test && npm run check`。

## 修改文件

- 后端：`game/AvalonRepository.java`、`game/GameService.java`。
- 后端测试：`game/FinishedIdentityTest.java`、`game/GameHistoryServiceTest.java`。
- 小程序：`pages/room/room.{js,wxml,wxss}`、`components/game-log/game-log.{js,wxml,wxss}`、`utils/presentation.js`。
- 小程序测试：`tests/finished-history-ui.test.js`。
- 本说明文档。
