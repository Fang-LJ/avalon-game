# 提前刺杀与邪恶身份公开

刺客在 `PLAYING` 的 `TEAM_BUILDING`、`TEAM_VOTING`、`MISSION_EXECUTING`、`LADY_OF_LAKE` 阶段可点击圆桌上方红色「提前刺杀」。弹窗取消不产生请求。确认「发动刺杀」后调用 `POST /api/avalon/game/{gameId}/assassination/start`。

服务端在与投票、任务、湖中仙女共用的游戏行锁内重新校验成员、角色、状态与阶段，只将阶段改为 `ASSASSINATION`。事件 `ASSASSINATION_STARTED` 在事务提交后通知其他客户端刷新。未完成的提案、投票与任务保持原样，不制造完成记录，不允许返回任务阶段。

`GameState.revealedEvilIdentities` 只在刺杀阶段返回，元素为 `playerId`、`seatNo`、`nickname`、`roleCode`、`roleName`。仅包含邪恶阵营且角色自身为邪恶的玩家，包括奥伯伦与莫德雷德。正常三成功后的刺杀使用相同公开规则。结束后仍使用原有全员 `identities` 结算数据。

客户端刺杀阶段仅显示公开邪恶身份及本人身份：娜、刺、爪、莫、奥；好人仅本人看到梅、派、忠。其他私有视野标记在此阶段不再显示。公共 `room.players` 不会被修改，也不会加入正义角色信息。已公开邪恶玩家不可选，服务端也拒绝非正义目标。

`assassinationEarly = phase == ASSASSINATION && goodScore < 3`，无需持久化字段。提前命中梅林为邪恶胜、`EARLY_MERLIN_ASSASSINATED`；提前刺错为正义胜、`EARLY_ASSASSINATION_MISSED`。三成功后的正常刺杀保留 `MERLIN_ASSASSINATED` / `ASSASSINATION_MISSED`。10 人局正常三成功且需要湖中仙女时仍先湖中仙女后刺杀。

机器人不会主动提前刺杀；进入刺杀后，机器人刺客继续在正义目标中随机选择，不偏向梅林。

测试覆盖权限、四个可用阶段、不可逆性、各视角隐私、公开奥伯伦、提前与正常结算、未完成记录保留，以及真实 Spring 事务 + 隔离内存 H2 下投票/任务/湖中仙女与提前刺杀的并发锁竞争。所有测试不连接生产数据库。

本功能不修改 schema、SQL、迁移、Nginx 或角色/任务基础规则。生产沿用现有构建产物部署流程，只更新 `avalon-server`；小程序需要重新上传体验版才能在手机看到新入口。
