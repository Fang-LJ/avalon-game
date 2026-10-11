# 刺杀阶段奥伯伦公开视野核验

日期：2026-10-11。检查基线：`171665890135bf49cfc2f92dd2c94ccdbead3c7a`。

## 结论与证据边界

在当前 main 上实际启动 1 真人 + 6 机器人，以及 1 真人 + 9 机器人对局，经过真实随机发牌、机器人确认身份、组队否决、任务成功，再通过真实 `GameController.startAssassination` 进入刺杀阶段。没有直接修改 phase 或伪造角色分配。

使用隔离 H2 + JDBC + Spring 事务、真实 JWT 签发/验证、MockMvc REST Controller 链路，不是生产服务器对局。微信开发者工具随后回放这些实际接口响应，核对原生 WXML 徽标、红圈、黄色目标圈及历史组件。原生检查中的 request/socket 被隔离，测试结束恢复登录态与方法；这不是生产 WebSocket 网络联调。

当前版本没有复现“奥伯伦丢失”：数据库行、GameState、序列化 API、presentation、gamePlayerId 合并、player-seat/knowledge-mark 渲染均保留奥伯伦。

线上镜像 revision/JAR hash 与基线一致，不能归因于当前线上 Java 后端落后。没有原问题发生时的客户端版本与接口响应，**原截图对应的历史根因未确认**，不能把“旧客户端/缓存”等可能性当作已证实根因。没有为了制造修复而改动已正确的游戏规则或私有视野过滤。

## 最后一次完整 Maven 测试中的 7 人分配

所有 ID 均为隔离数据库中的测试 gamePlayerId，并非生产账号。

| 座位 | playerId | 昵称 | roleCode | 阵营 |
| --- | --- | --- | --- | --- |
| 1 | 1 | 真人房主 | LOYAL_SERVANT | GOOD |
| 2 | 2 | 机器人1 | MORGANA | EVIL |
| 3 | 3 | 机器人2 | MERLIN | GOOD |
| 4 | 4 | 机器人3 | OBERON | EVIL |
| 5 | 5 | 机器人4 | PERCIVAL | GOOD |
| 6 | 6 | 机器人5 | LOYAL_SERVANT | GOOD |
| 7 | 7 | 机器人6 | ASSASSIN | EVIL |

TEAM_BUILDING 时：刺客只看到 2 号莫甘娜；奥伯伦 visiblePlayers 为 `[]`。公开 revealedEvilIdentities 为 `[]`。

ASSASSINATION 时，7 名 viewer 的公开列表完全一致：

```json
[
  { "playerId": 2, "seatNo": 2, "nickname": "机器人1", "roleCode": "MORGANA", "roleName": "莫甘娜" },
  { "playerId": 4, "seatNo": 4, "nickname": "机器人3", "roleCode": "OBERON", "roleName": "奥伯伦" },
  { "playerId": 7, "seatNo": 7, "nickname": "机器人6", "roleCode": "ASSASSIN", "roleName": "刺客" }
]
```

10 人测试公开 6 号 ASSASSIN、7 号 MORGANA、9 号 OBERON、10 号 MORDRED，4 条，对 10 名 viewer 相同。普通阶段刺客只看到莫甘娜/莫德雷德，奥伯伦仍为空视野。

## 已正确的代码路径（未修改）

- `GameService.state` 的 ASSASSINATION 分支按 alignment=EVIL + role.alignment=EVIL 生成公共名单，不复用私有队友视野。
- `presentation.revealedEvilIdentities/revealedEvilMark` 白名单包含 OBERON，结果为 ROLE / 奥 / evil。
- `room.decoratePlayers` 用 gamePlayerId 构造 revealedByPlayer，与公共 room.players.playerId 合并，覆盖普通阶段私有标识。
- `player-seat.wxml` 同时根据 revealedEvil 绘制 revealed-evil-ring，根据 markType 绘制 knowledge-mark；组件实际收到 ROLE / 奥 / evil。
- 普通阶段 `RoleVisibilityService` 仍然排除邪恶同伴中的奥伯伦，奥伯伦不认识任何邪恶同伴。
- 公共 RoomView 不增加角色字段。刺杀时 identities 仍为空；target 只有 playerId、seatNo、nickname，不带 GOOD 角色。

## 本次实际修改

- 中央卡仅在 ASSASSINATION 使用专属 class，宽度 60%、固定高度 140rpx，padding 12rpx 20rpx、gap 6rpx。
- 标题“刺杀梅林阶段”：var(--evil) / #c95d68，26rpx、800。
- 规则“刺中梅林，邪恶阵营获胜；刺错则正义阵营获胜”：var(--muted)，18rpx，可换行。
- 状态：var(--gold)，22rpx、600，未选择为“等待刺客刺杀”；选择 3 号机器人2 后为“已选择：3号 机器人2”。所有 viewer 同文案，选中前后同高。
- 不恢复顶部重复卡。保留任务轨道、圆桌、皇冠/身份标识、历史 swiper、任务卡牌、全部记录入口和固定确认刺杀按钮。
- 后端仅新增 7/10 人真实数据库/接口回归测试，**没有改 Java 运行时代码**。

## 自动化与原生检查

- `cd backend && mvn test`：280 项全部通过，0 failures/errors/skipped。
- `cd miniprogram && npm test`：457 项全部通过，0 failures/skipped。
- `cd miniprogram && npm run check`：通过。
- 新增 7/10 人全部 viewer、不同 gamePlayerId/userId/seatNo、倒序玩家数组、奥伯伦标识、GOOD 保密与正常阶段隔离回归测试。
- 原生微信模拟器检查实际接口回放，不制作或追加截图；7/10 人各 viewer 的公开标识、目标圈与历史操作结果在本次运行日志核验。
- 测试 JSON 仅输出到 Git 忽略的 backend/target，测试结束关闭/清理测试对局和机器人；未向生产数据库写入任何测试数据。

## 生产环境

只读核验 `avalon-server`：镜像 avalon-game-server:prod，revision `171665890135bf49cfc2f92dd2c94ccdbead3c7a`，JAR SHA256 `cc8a7dfeecfd1a0182b398ebba2380b401aada2a3f90e7a3c1ea3aa771acae4f`，容器 healthy。

公网 `/avalon/api/health` 返回 HTTP 200 / SUCCESS / ok。本次运行时代码只有小程序 UI 改动，Java 后端只增加测试，所以不重复部署/重启正确的现有后端。无数据库 migration、表/字段调整或 Nginx 改动。

手机体验版需要重新上传当前小程序包；Git push 不会自动替换已发布的微信体验版。
