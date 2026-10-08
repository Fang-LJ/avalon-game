# 完成状态标记与实时提案布局

日期：2026-10-08。基线：8186a2c。

## 后端：完成进度不包含票型

GameState 新增两个 `List<Long>`：

- `votedPlayerIds`：当前 TEAM_VOTING 提案已投票的 game_player_id。
- `missionSubmittedPlayerIds`：当前 MISSION_EXECUTING 任务已秘密提交的 game_player_id。

Repository 分别单独查询 `t_avalon_vote` 与 `t_avalon_mission_action` 的 game_player_id，
按 ID 排序（不按提交时间）。不复用 votes/missionActions，不读取票型，也不返回行为顺序。
没有当前 proposal/mission，或不处于对应阶段时，返回 []，不返回 null。
详细投票仍按原规则全员投完后公开，任务仍只公开匿名总数。WebSocket 仍只发 roomId/type。
没有修改 schema、SQL migration、任务规则或状态机推进方法。

## 前端：每次根据当前阶段计算 ✓

`presentation.actionDone(game, playerId)`：投票阶段读取 votedPlayerIds；任务阶段读取
missionSubmittedPlayerIds，同时校验该玩家在 selectedPlayerIds 中。其他阶段始终 false。
Room 只在客户端 displayPlayers 中合并该字段，不修改公共 room.players 或私有角色规则。
不存储完成状态，不根据 APPROVE/REJECT/SUCCESS/FAIL 区分颜色或图标。

player-seat 的青绿色 ✓ 位于头像右上（top/right -5rpx；最小 84rpx 头像 right -9rpx）。队长顶部、私有视野右下、我左下、
selected 外圈保持独立；badge 使用 border-box，队长标记限制为 30rpx，防止小头像角标重叠。

圆桌中央：

- TEAM_VOTING：是否同意这支队伍？/ 队伍 / 请投票，或已投票，等待其他玩家。
- MISSION_EXECUTING：任务执行中 / 请做任务、已完成任务，等待其他任务成员、等待任务成员完成。
- 不再显示 x/y、未完成人员名单或上一轮同意/反对列表；底部自身操作入口保留。

## 实时历史布局

新增 live-proposal-record 模板，标题左、组队通过/否决右；中间两列 Grid：
左为队长与队伍，右为同意与反对；底部为任务结果和静态卡牌缩略图。
轮播与“查看全部记录”共用此模板。Replay 原 proposal-record 模板、完整个人出票与 Lady 信息保留。

任务牌直接复用 CARDS.actions.SUCCESS / FAIL，用现有 resultCards 根据匿名数量生成。
所有成功在前、失败在后；REJECTED、未结束任务和非法汇总不显示任务牌。
缩略图 52×72.28rpx（600:834），间距 8rpx，aspectFit，最多五张不换行。
有任务牌时 swiper 高 244rpx；无任务牌时 156rpx，减少多余留白。
proposalId 跟踪、默认最新、浏览旧记录时保留当前位置、全记录 Overlay 及跨 gameId 重置逻辑未重构。

## 任务结果揭晓减字

删除“匿名揭晓 · 不对应玩家座位”、“任务结果已揭晓”及成功/失败数量文字。
RESULT 仅保留任务序号、真实卡牌、任务成功/失败标题和确认按钮。
动画阶段保留必要状态文案。没有修改 mission-result.js、组件动画 JS、Timer、确认 storage 或卡牌排序。

## 验证

- mvn test：195 项通过，0 failures/errors/skipped；新增完成状态/隐私测试 14 项。
- npm test：179 项通过，0 failures/skipped；新增前端测试 14 项，原测试未删除。
- npm run check：通过。
- 本地隔离 H2 中使用真实 RoomService、GameService、BotTurnService 和 JDBC 运行 7 人机器人局：
  验证 0～6 人投票状态，未全员完成前 detailed votes 为空；全员完成后 vote progress 清空。
  验证任务未提交/已提交/旁观者的状态，结算后 mission progress 清空，再运行至游戏结束。
- 微信开发者工具 375×812 模拟器使用上述真实 service 快照替代网络响应：逐个 ✓、中央文案、
  阶段清除、结果遮罩减字、双列历史、全部记录、稳定历史位置均已核对。
- 独立 UI 压力数据验证长昵称、十人投票列表、五张缩略图和最小 84rpx 头像四角标记共存。
  这些压力数据只用于渲染检查，不宣称是实际后端对局结果。
- 375/390/430px 的缩略图宽度与比例计算通过；实体手机尚未验证。
- 真机待核对：系统字体放大、52rpx 卡牌细节可辨识度、最小头像角标间距、iOS/Android 细微字体差异。
- 未连接或写入生产数据库，H2 用后 shutdown。模拟器 QA 结束恢复原 token、结果 storage、request 和 socket。
- 本次仅提交代码，未部署生产后端；线上头像 ✓ 需要部署新增 GameState 字段的后端版本。

## 文件清单

后端：

- backend/src/main/java/com/avalon/game/game/AvalonRepository.java
- backend/src/main/java/com/avalon/game/game/GameService.java
- backend/src/test/java/com/avalon/game/game/CompletionProgressTest.java（新增）

小程序：

- miniprogram/components/game-log/game-log.js / .wxml / .wxss
- miniprogram/components/player-seat/player-seat.wxml / .wxss
- miniprogram/components/mission-result-overlay/mission-result-overlay.wxml / .wxss
- miniprogram/pages/room/room.js / .wxml
- miniprogram/utils/presentation.js
- miniprogram/tests/completion-history-ui.test.js（新增）
- miniprogram/tests/finished-history-ui.test.js
- miniprogram/tests/formal-game-ui.test.js

文档：本文件（新增）。没有生产配置、密钥、临时图片或测试数据进入 Git。
