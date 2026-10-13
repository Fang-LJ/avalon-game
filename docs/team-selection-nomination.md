# 实时选人与一次性提名交付说明（2026-10-13）

基于 main 的 `920fc923` 开发。身份标识采用指定最终配色，保持纯白字、实色圆角矩形、尺寸和四个标识锚点。梅林看到「红」，派西看到同样的紫色「?」，私人猜测的小黄色问号与规则保持原样。

最终背景色：邪恶 `#A93447`、梅林 `#A36B13`、派西/系统候选 `#8052C1`、忠臣/蓝方 `#147FA7`；文字均为 `#FFFFFF`。

## 状态与接口

现有游戏表增加一个可空 `team_draft_json` 列，不增加表，不改正式提案、投票、任务、复盘的数据结构。仅保存当前 `TEAM_BUILDING` 的公开 UI 状态：

```json
{
  "gameId": 90,
  "missionNo": 2,
  "proposalNo": 1,
  "leaderPlayerId": 101,
  "selectedPlayerIds": [101, 102, 103],
  "nominatedPlayerIds": [104, 105, 106],
  "nominated": true,
  "revision": 8
}
```

ID 为当前 GamePlayer ID，不是账号 ID 或座位号。所有数组保留选择顺序；显示号码从房间座位数据生成。

- `PUT /api/avalon/game/{gameId}/team-draft`：更新当前选人草稿，可以为空或不满人数。
- `POST /api/avalon/game/{gameId}/team-nomination`：只保存一次首次提名，仍处于 `TEAM_BUILDING`。
- 两个请求均携带 `playerIds / missionNo / proposalNo / leaderPlayerId / expectedRevision`，返回公开 TeamDraft。
- 原 `POST /api/avalon/game/{gameId}/team` 保留 `playerIds`。新客户端额外提供 `missionNo / proposalNo / leaderPlayerId / expectedDraftRevision`，必须与最新草稿的名单、上下文及修订号一致。
- `GET /game/{gameId}` 增加 `teamDraft`，选人阶段返回当前草稿，其他阶段为 null。原顶层 `selectedPlayerIds` 继续表示正式队伍，不把草稿混入旧数据语义。
- `TEAM_DRAFT_UPDATED` WebSocket 事件包含公开 TeamDraft，事务提交后向同房间连接发送，不含角色、阵营、私人视野或身份猜测。

服务端对三个写操作使用同一游戏行 `SELECT ... FOR UPDATE`。只允许当前队长、PLAYING/TEAM_BUILDING、当前上下文更新；验证人数上限、重复和非法成员。版本不匹配返回 `STALE_DRAFT`；二次提名返回 `ALREADY_NOMINATED`。发车原子性创建一个正式提案并进入投票。

## 前端交互与恢复

- 正常点击、取消及满员后的 FIFO 替换立即更新本地预览，串行提交并合并快速点击的最新意图。服务端确认后，全房间通过 WS 同步蓝色光环。
- 发车/提名前等待当前同步队列完成，再提交对应版本；未同步成功时阻止发车并显示可点击重试入口。重试先读取服务端最新状态。
- 旧 GET、乱序 WS 和晚到的 HTTP 回复不能覆盖较新的草稿。页面退出、换对局或换上下文会关闭旧队列，晚到回调不能继续发送下一次选择。
- 提名前满员后显示左右两个按钮；未满员禁用并提示所需人数。非队长不显示提名和发车按钮。
- 提名后只显示首次名单、原有否决进度及强制轮警告，不再显示“已选”或调整文案。继续改人只更新光环；确认发车使用最新草稿，投票阶段显示正式队伍。
- 新队长/提案/任务、发车、提前刺杀、结束、关闭和重新开局均清除旧草稿。首次提名不会写入提案历史，不增加提案次数。
- 已有 `CONNECTED`/重连通知与轮询读取 GET，恢复最新光环和首次提名。无新增定时器或前端持久化草稿。

旧客户端仍可只提交 `playerIds`，机器人也继续使用原服务方法直接发车，不要求草稿或提名。旧客户端不会显示新增的实时草稿/提名 UI，但正式发车、投票及后续玩法兼容。新客户端遇到不含 TeamDraft 的旧后端 DTO 时保留直接发车入口，不请求新增接口。

游客引擎、机器人策略、角色分配、任务和投票逻辑没有修改；游客页仅复用新的标识配色。

## 重启与多实例

草稿及首次提名存在 MySQL 当前游戏行中；服务重启后 GET 直接恢复，修订号和首次提名不会因 JVM 重建而丢失。无需内存 TTL 或新的恢复任务。

多个实例共享同一 MySQL 时，状态校验和行锁仍能防止重复提名、旧草稿覆盖与重复发车。当前项目的 WS 广播仍是单实例事件分发，未添加消息中间件。未来横向扩容必须把公开房间事件接到共享消息总线（例如现有 README 提到的 Redis Pub/Sub），再由各实例广播给自己的连接；未接总线时，其他节点只能依靠 GET/轮询恢复，不能保证跨节点即时推送。数据库仍为状态权威来源。

## 验证结果

- 小程序：768 项自动化测试通过；语法检查通过。新覆盖 5～10 人同步、FIFO 替换、提名与最新选择分离、高速点击、旧响应、其他设备竞争、同步失败重试、超时后恢复、退出、新提案与旧接口请求形状。
- Java：297 项测试通过，包括 17 个新增集成场景；真实 JDBC、Spring 事务和两个独立服务实例验证权限、事务回滚、并发、重启后读取、各类重置、JWT、新旧 HTTP 接口和全房间 WS 消息。全部数据库测试使用隔离 H2，不连接生产。
- 可执行 JAR 打包成功：`backend/target/avalon-game-server-0.0.1-SNAPSHOT.jar`；打包复用已通过的测试结果。
- 微信开发者工具：5～10 人局共 30 个交互截图场景通过，实际点击选择/取消、提名、修改、发车；非队长无操作按钮，首次名单不变，最新光环与最终队伍正确，中央没有恢复卡片背景。
- 多尺寸：上述 30 个实际 WXML 场景在 320×568、375×667、375×812、390×844、430×932 下共 150 项布局检查通过，无头像/王冠遮挡、横向溢出或中央信息裁切。
- 标识配色：另有 15 个原生场景通过，核对实际组件背景为指定颜色、纯白字、派西两个问号相同、黄色猜测问号保留和标注修改/清除。
- 游客完整对局：109 项原生检查通过，完成身份确认、组队、投票、任务动画、刺杀、结算、再来一局和退出；登录、用户资料、后端及 WebSocket 请求为 0。

未连接物理 iPhone；开发者工具与 Chromium 屏宽检查不等同于真机多人联网测试。上线前仍需用真机体验版验证网络延迟和实际字体。没有自动部署服务器或上传微信审核版本。

## 手动部署步骤

1. 备份现有数据库、JAR、镜像及 release manifest，保留现有 `.env.prod`、AppID/AppSecret、Nginx、端口和网络配置。
2. 使用现有数据库连接先检查列：`SHOW COLUMNS FROM t_avalon_game LIKE 'team_draft_json';`。现有 V2 数据库仅在列不存在时执行 `docs/sql/005_team_draft.sql`，新增 nullable JSON 列；此迁移只运行一次。不要在生产执行会重建数据的 `003`。新安装的 `001` 已包含该列，不重复执行 `005`。
3. 在代码仓库执行 `mvn -f backend/pom.xml test`、`npm --prefix miniprogram test`；使用验收过的 JAR 更新服务器对应文件。按现有运行镜像发布流程只替换 `avalon-server`：

```sh
# 这些命令供人工在既有服务器部署流程中执行，本轮未执行。
# 将变量值替换为本次交付且已验收的 commit SHA。
TEAM_RELEASE=replace-with-verified-commit-sha
docker tag avalon-game-server:prod "avalon-game-server:before-$TEAM_RELEASE"
docker build -f /opt/avalon-game/backend/Dockerfile.runtime -t "avalon-game-server:$TEAM_RELEASE" /opt/avalon-game/backend/target
docker tag "avalon-game-server:$TEAM_RELEASE" avalon-game-server:prod
docker compose -f /opt/avalon-game/deploy/docker-compose.prod.yml up -d --no-deps --no-build avalon-server
```

4. 检查健康接口及认证后的游戏 GET；用旧 `playerIds` 请求验证直接发车，用新客户端验证 WS 草稿、首次提名、修改后发车和断线重连。先完成数据库迁移和后端升级，再发布新小程序体验版/审核版。
5. 若回滚后端，保留新增可空列即可，旧版本忽略该列；不要为回滚删除列或其他游戏数据。

## 修改文件

- `backend/src/main/java/com/avalon/game/game/AvalonRepository.java`
- `backend/src/main/java/com/avalon/game/game/GameActionPolicy.java`
- `backend/src/main/java/com/avalon/game/game/GameController.java`
- `backend/src/main/java/com/avalon/game/game/GameService.java`
- `backend/src/main/java/com/avalon/game/game/TeamDraft.java`
- `backend/src/main/java/com/avalon/game/realtime/AvalonWebSocketHandler.java`
- `backend/src/main/java/com/avalon/game/realtime/RoomEventPublisher.java`
- `backend/src/test/java/com/avalon/game/game/GameActionPolicyTest.java`
- `backend/src/test/java/com/avalon/game/game/TeamDraftIntegrationTest.java`
- `docs/sql/001_avalon_init.sql`
- `docs/sql/003_avalon_v2_schema.sql`
- `docs/sql/005_team_draft.sql`
- `docs/team-selection-nomination.md`
- `miniprogram/components/knowledge-mark/knowledge-mark.wxss`
- `miniprogram/pages/room/room.js`
- `miniprogram/pages/room/room.wxml`
- `miniprogram/pages/room/room.wxss`
- `miniprogram/services/avalon.js`
- `miniprogram/tests/bots.test.js`
- `miniprogram/tests/formal-game-ui.test.js`
- `miniprogram/tests/identity-table-visual.test.js`
- `miniprogram/tests/invites-action-sync.test.js`
- `miniprogram/tests/private-identity-assets.test.js`
- `miniprogram/tests/role-guesses-ui.test.js`
- `miniprogram/tests/team-draft-sync.test.js`
- `miniprogram/tests/team-selection-ux.test.js`
- `miniprogram/tests/v1-ui.test.js`
- `miniprogram/utils/team-draft.js`
- `scripts/qa-identity-table.js`
- `scripts/qa-team-nomination.js`
