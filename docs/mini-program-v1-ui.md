# Avalon 微信小程序 V1 UI 与查询接口交付说明

## 范围与基线

- 基线：`1e37d71c8ceb500e23d5a28bb3ca3d4aacb98a0b`，分支 `main`。
- 规则仍以根目录 `avalon_v1_game_rules.txt` 为准；未修改规则或游戏状态机。
- 本轮仅小程序 UI、账户昵称以及必要查询接口；没有 Web、生产部署、数据库迁移或结构变更。
- 原 8 张 V2 表保持不变，未修改或执行任何 SQL 文件。

## Figma 来源与页面映射

Figma 文件：`Vy1WdzYMtNgF3hcpt1t81Q`；页面 `385:2`（阿瓦隆游戏 UI）。
实际读取页面 metadata、以下全部 15 个 frame 的 design context 和截图，使用其深绿、圆角、状态色、卡片和围桌构图。

| 节点 | 实现 |
| --- | --- |
| 391:119 | login 微信授权登录 |
| 391:130 | index 首页 |
| 391:162 | create 创建房间 |
| 391:193 | join 加入房间 |
| 387:3 | room 等待大厅 |
| 387:57 | ROLE_CONFIRM 私密身份卡 |
| 387:81 | TEAM_BUILDING 队长选人 |
| 387:152 | TEAM_VOTING / 投票完成的围桌结果 |
| 392:123 | MISSION_EXECUTING 秘密任务 |
| 392:143 | LADY_OF_LAKE 检查与私密结果 |
| 392:174 | ASSASSINATION 刺杀梅林 |
| 392:210 | FINISHED 结束结算 |
| 393:122 | history 我的战绩 |
| 393:159 | replay 完整复盘 |
| 393:180 | me 我的 |

新增四页 login/history/replay/me；重构 index/create/join/room，共八页。
新增组件 page-head、app-tab-bar、game-card、player-seat、mission-track、game-log。
图标使用 Figma 原有几何 SVG，没有新增角色插画。

颜色来自设计变量：背景 #101713、卡片 #18221d、软底 #223027、正文 #f5f1e8、次要正文 #b8b7af、GOOD #46c2a3、EVIL #c95d68、金色 #d8b25c、边框 #324238、按钮 #3e6f58。

## 登录与首页

App 启动不再登录。登录页仅在已有 token 时请求 profile 验证会话；没有 token 时等待点击登录按钮，再执行 wx.login → code → 后端登录 → 保存 token → 首页。
无效 token 清除并回登录页；网络异常不清除有效会话。
仅 local 且 mockLogin=true 显示十个模拟用户；prod 即使配置 mockLogin=true 也不走 mock 分支。
首页为真实 profile、最近一局历史、当前房间、创建/加入、规则入口和自定义底部 Tab。
昵称编辑只更新账户；创建/加入由服务端读取账户昵称写入本局快照，不接受客户端房间昵称覆盖，也不改历史快照。

## Room 与布局

- 等待大厅：复制房间码、玩家、人数与规则，满员房主开始。
- 身份：只使用本人 my-role 接口；派西维尔两名候选人相同呈现。
- 选人：队长选择、人数限制、确认发车；其他人等待。
- 投票：全员同意/反对、已提交状态；结束后显示公开投票。
- 任务：仅成员可提交；GOOD 只有 SUCCESS；EVIL 可选 SUCCESS/FAIL，点击确认后提交。
- Lady：只有持有者能选择合法目标；检查只显示阵营，弹层仅本机本人可见，token 转移以后端为准。
- 刺杀：只有刺客可选择，提交前原生二次确认。
- 结束：阵营胜负、全部身份、完整复盘、满员房主再来一局、退出。
- 原有 API 继续使用；无 continueRound，页面不会自行裁定胜负。
- WebSocket 事件刷新 + 5 秒兜底轮询，页面离开停止；连接代次防止旧连接回调影响新页面。
- 新局或 phase 变化清理选择状态；新局清理上局私密 Lady 弹层。

以 390×844 为设计基准，用 rpx / flex / grid / 百分比定位。8 人保留 Figma 环桌构图，其他人数按顺时针椭圆计算；9/10 人头像缩小、桌面加高。
顶部读取状态栏高度，底部预留 safe-area。长昵称省略。为避免设计转实际设备后的标签遮挡，预留座位名称/徽章区域；主要阶段按钮固定在底部，内容可滚动。
Lady 目标网格最多四列并排除不可检查对象（持有者视角），适配 10 人。
响应式自动测试验证 375/390/430 宽度下 5–10 人座位边界与互不重叠；这不等同于三种实体手机验收。

## 查询 API

所有端点从 JWT 的 LoginUserContext 获取 userId，不接受 query/body 指定身份。

| 方法与路径 | 返回及约束 |
| --- | --- |
| GET /api/avalon/me/profile | userId、nickname、avatarUrl，不返回 openid/provider |
| PUT /api/avalon/me/profile | body nickname；1–32 字符，不允许控制字符，只改本人账户 |
| GET /api/avalon/me/games?page=1&size=10&alignment=GOOD | items、total、page、size；size 1–50；alignment 可空/GOOD/EVIL |
| GET /api/avalon/me/stats | 总局、胜/负、百分比胜率、两阵营局数/胜数、各角色局数/胜数 |
| GET /api/avalon/game/{gameId}/timeline | 本局参与者可读；提案、已结束投票、已结算任务总数 |
| GET /api/avalon/game/{gameId}/replay | 已结束对局参与者可读；身份、提案投票、任务个人动作、Lady、刺杀与结算 |

历史和统计只统计 phase=FINISHED 且 status=FINISHED/CLOSED 的本人对局。
查询不使用 left_at 过滤，因此离开或归档不丢历史。分页与阵营参数校验，SQL 值使用参数绑定。
胜率按玩家阵营是否等于获胜阵营计算，空历史返回 0。

### 隐私边界

timeline 使用专门的 DTO；未完成投票的 votes 为空、票数为空；仅包含 SUCCESS/FAILED 的任务聚合。
timeline 不查询 mission_action 或 lady_action，不返回角色、阵营视野、个人任务票、Lady 结果。
replay 先验证历史参与资格，再验证结束状态，两者通过之后才查询动作和 Lady；不能只检查 status=CLOSED（未完成但关闭的局同样拒绝）。
进行中原 GameState / WebSocket 没有加入私密字段，FAIL 出票者仍不会公开。
结束后仅本局参与者通过 replay 获得完整记录。前端公共 game-log 再次隔离秘密展示；replay 模式才展示个人票及 Lady，Lady 按任务序号插入时间线。

## 验证记录

- 后端 `cd backend && mvn test`：95 项，0 失败、0 错误、0 跳过。
- 新增后端 23 项：profile、昵称边界、history、stats、归档历史、timeline 隐私、replay 权限及结束检查、完整动作/Lady、JWT 接口权限。
- 小程序 `npm test`：24 项通过；包含登录、local/prod 隔离、页面配置、API、任务确认、刺杀确认、Lady、私密状态清理、旧 socket 回调隔离和三种宽度几何检查。
- `npm run check`：通过。
- 微信原生 wcc：14 个 WXML 通过；wcsc：15 个 WXSS 通过。
- 微信开发者工具模拟器：对全部主要页面和各房间阶段进行截图核对（390×844 对应设备，输出 600×1300）。
- 模拟器实际点击创建按钮、输入六位房间码并点击加入按钮：在 API fixture 下均成功跳转 room 页面；测试结束已恢复 wx.request/getStorageSync/connectSocket，未修改用户持久化凭据。
- UI 截图采用工具侧的 API fixture，不向生产服务写入游戏数据；不能据此宣称已完成真实数据库、多设备实时对局或真实微信登录联调。
- 本轮没有运行数据库迁移，也没有启动/改动生产服务器。后端新增接口必须在后续获准部署后才在线上生效。
- 开发者工具测试脚本、截图、凭据均放在仓库外，不提交 token 或临时数据。

## 本地联调

在已有 V2 本地数据库环境启动 backend，使用 local Spring profile。小程序 utils/config.js 的 ENV 在本地临时改为 local，local mockLogin=true，即可通过登录页/首页切换 avalon_mock_1 … avalon_mock_10。
提交版本仍为 prod。不要为小程序调试重新开启生产 mock 登录。
真实微信登录、真实数据库和多人真机流程仍需后续联调验收；本说明不会把 fixture 截图当成这类验证。

## 修改文件

后端：
- game/AvalonRepository.java：账户与复盘读取。
- game/GameHistoryController.java、game/GameHistoryService.java：timeline/replay。
- me/MeController.java、me/MeService.java：profile/history/stats。
- room/RoomService.java：账户昵称快照。
- 测试 GameHistoryServiceTest、MeServiceTest、QueryAuthorizationTest、RoomServiceTest。

小程序：
- app.js/json/wxss。
- pages/login、index、create、join、room、history、replay、me。
- components/page-head、app-tab-bar、game-card、player-seat、mission-track、game-log（各四件套）。
- services/auth.js、services/avalon.js。
- utils/request.js、utils/socket.js、utils/presentation.js。
- assets/avalon-mark.svg、assets/role-emblem.svg。
- tests/config.test.js、tests/v1-ui.test.js。

本文件为交付与验收记录；完整逐文件列表可用本次提交的 `git show --stat` 查看。
