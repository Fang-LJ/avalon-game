# 刺杀阶段布局与公共临时目标

本轮基于 main 的 e32e358；不改变提前刺杀、最终刺杀、胜负或身份公开规则。

## 小程序

- 顶部入口只把“提前刺杀”改为“刺杀”；确认弹窗和原 start API 不变。
- 任务轨道和 quick actions 不换行；按钮最小 60rpx、左右 padding 6rpx，字体仍为 21rpx。
- 删除圆桌上方“最终刺杀”卡片；中央沿用 board-center 的 24rpx 金色标题和原尺寸体系。
- 所有玩家第一行均为“刺杀梅林阶段”；第二行无目标时“等待刺客刺杀”，有目标时
  “已选择：3号 机器人2”。不是根据 viewer.assassin 生成不同提示。
- 目标和所有客户端的琥珀色选中圈均来自服务端 GameState；没有本地乐观选择。
- ASSASSINATION 不再隐藏 compact game-log，复用原 swiper、任务牌缩略图、投票与全部记录弹层。
- 公开邪恶红环与具体身份徽记不变，邪恶不可被选中且不灰显，GOOD 的具体身份不公开。
- 固定底部按钮、has-phase-actions 的底部留白复用原逻辑；任务/湖中仙女选择不变。

## 新增最小同步接口

`POST /api/avalon/game/{gameId}/assassination/target`

请求为 `{"targetPlayerId": 123}`，ID 是当前 GamePlayer 的 ID，而不是账号 ID 或座位号。
JWT 与房间成员身份仍由原认证链校验。仅 PLAYING / ASSASSINATION 阶段的刺客可以选，
目标必须是当前对局 GOOD 玩家，不能选自己、公开邪恶或别的房间的玩家。

返回现有 GameState，并增加：

```json
{
  "assassinationTarget": { "playerId": 123, "seatNo": 3, "nickname": "机器人2" },
  "assassinationTargetRevision": 1791680400000
}
```

没选目标时 assassinationTarget 为 null。该对象只有 playerId / seatNo / nickname，
没有角色、阵营或任何私有视野。选目标不会结束游戏、修改分数、写入历史或数据库。
只有原 `POST /assassinate` 最终确认接口进行原有结算并保存最终历史目标。

当前生产只有一个 avalon-server；因此采用进程内短期 ConcurrentHashMap，不引入 Redis 依赖。
选择仍先取得现有 game-row 事务锁；内存更新在 afterCommit 发布，然后发
ASSASSINATION_TARGET_CHANGED WebSocket 失效通知，让所有客户端 GET 最新 GameState。
不是向所有人广播带私人字段的完整 GameState。回滚不发布，较旧提交回调不能覆盖较新目标。
前端拒绝晚到的较旧非空目标 revision，保留原 mutation / GET epoch 防乱序能力。

确认结算、房主结束、再来一局时清除临时目标；12 小时 TTL 和定时清理防止遗留。
重启服务器会清除未确认目标，刺客需要重新选择；既有游戏和最终历史不受影响。
以后若扩为多副本，应把此短期 store 换成共享存储，本轮没有该需求或部署变更。

## 验证与部署边界

- `mvn test` / `mvn package`：278 项通过，0 失败 / 错误 / 跳过。
- `npm test`：434 项通过，0 失败 / 跳过；`npm run check` 通过。
- 后端覆盖认证、所有角色权限、阶段、GOOD 目标、重复切换、公开目标隐私、事务回滚、
  真实 JDBC 行锁下的最终刺杀与排队选择竞争；真实事务测试仅使用隔离 H2，不连接生产。
- 375px 微信模拟器检查了 5 / 6 / 7 / 8 / 9 / 10 人的普通阶段与刺杀布局。
  轨道宽 162px，四按钮区宽 142px，在 337px 内容宽内同排；刺杀三按钮区宽 110px。
  历史记录可完整滚动到固定按钮上方；7 人局使用原生 swiper.swipeTo 验证切换，
  实际点击“查看全部记录”与“关闭”，刺客和 GOOD 查看者均显示相同目标与琥珀环。
- 遵照用户要求没有补充截图；真实手机多人操作仍建议上传新体验版后验证。
- 本轮不改 SQL、表结构、规则引擎、角色视野、Nginx、MinIO 或 Compose。
  部署只替换 avalon-server；先保留原镜像、backend 与 release manifest，确认健康后记录新 revision。
  原 .env.prod 与其他容器不动；无数据库 migration。
