# UI V3 第二轮实施记录（2026-10-19）

本轮保留本地修改，不提交、不推送、不部署、不发布。基线 main `9c12cd4`，开始时工作区干净且与 origin/main 一致。

## 设计依据

已通过 Figma MCP 获取下列各 Frame 的设计数据和截图：

| 页面 | Node | 本轮处理 |
| --- | --- | --- |
| 登录 | 406:6 | 仅协议整体居中；鉴权、协议记录和跳转不改 |
| 首页 | 406:57 | 上部以用户参考图片为准，下部采用最新设计 |
| 战绩 | 406:110、429:3 | 概览、两阵营筛选保留；卡片统一个人阵营与个人胜负 |
| 资料 | 406:162、411:54 | 核对并保留上一轮已确认的实现，不恢复底部说明 |
| 我的 | 406:200 | 核对并保留现状，不恢复标题、常用角色或关于菜单 |
| 邀请确认 | 427:4 | 真实预览数据、确认加入、自动落座 |
| 分享封面 | 427:54 | 原设计按 800×640 导出 PNG，接入分享 imageUrl |
| 邀请异常 | 427:95 | 满员、已开始、失效及网络错误 |

## 首页背景资源

`miniprogram/assets/ui-v3-round2/home-castle.jpg`：800×1200，约129 KiB。

使用内置 image_gen，以用户参考图为参考，生成独立背景，再用 sips 压缩为 JPEG。无 UI 文字、按钮、卡片或手机边框；不是整页截图。实际文字和按钮均为原生 WXML。

生成提示词：
> Create ONE production mobile game background illustration, portrait 1024x1536. Match the attached reference image's dark ink forest-green and antique muted gold atmosphere. Extract/recreate only SCENERY from reference: in upper right large thin gold astrolabe compass with circular orbital lines, beneath it a detailed medieval gothic castle silhouetted against warm full gold moon, layered mountain ridges, dense conifer forest, mist, distant arched stone bridge to right. Composition: entire artwork fills canvas edge to edge, no outer white canvas, no phone frame. Top-left 40% near-black green negative space for live greeting; castle occupies upper middle/right 30%-55% height, layered fog and forest around middle. Lower 35% fades smoothly to solid #0d1711 for live controls. Dramatic but subdued cinematic digital painting, clear finely detailed castle turrets and golden moon, as polished as reference. CRITICAL: REMOVE ALL UI: no words, no letters, no Chinese characters, no nickname, no logos, no labels, no borders/cards, no buttons, no tabs, no rounded phone edges. This is a background asset only, not a screen mockup. The supplied image is visual style/composition reference, not a request to reproduce interface controls.

背景仅首页使用，上半屏显示、底部渐变衔接；aspectFill 保持比例。Hero 背景 rgba(14,27,19,.48)，操作按钮 rgba(22,34,27,.65)。系统状态栏、胶囊区域正常预留。

实际差异：这是按参考图重绘的独立场景，城堡、月亮和雾的细节及位置不可能逐像素一致；标题用设备宋体/衬线字体回退，字形依系统不同；系统安全区使顶部位置与无状态栏参考图不同。没有自称完全像素还原。

## 战绩映射

新增 `utils/history-presentation.js`，不修改 gameplay/replay 使用的原有 historyItem 输出语义。
- alignment 决定本人阵营名称和角色字体颜色，所有正义角色统一青绿，所有邪恶角色统一红色。
- 有合法 alignment/winner 且不是 HOST_ENDED 才计胜负，alignment===winner 为本人胜利，否则本人失败。对合法服务端数据与 won 一致，不通过角色文字推断阵营，不把邪恶获胜等同本人失败。
- 结果文字白色；本人胜利绿框、本人失败红框、未结算中性框；背景一致。
- 首页与战绩共用样式，不再有身份胶囊。首页增加全部战绩入口，返回现有房间、空状态、错误、加载和模拟用户入口均保留。
- 分页与重复点击取消阵营筛选逻辑保留。

## 分享及邀请

`share-cover.png` 为 Figma 427:54 的原始 800×640 PNG，约64 KiB。分享标题已更正为圆桌秘境，动态房间号保留。

保留旧路径 `/pages/join/join?roomCode=xxxxxx`。加载页面只保存邀请意图、登录后预览，不自动加入。未登录仍使用原有登录/首次资料/邀请恢复流程。首页手动加入弹窗继续保留。

预览只输出占用状态，不输出其他玩家昵称头像；座位用占用对勾/空位加号，因此与 Figma 示例中的 F 字母存在合理差异。

确认后调用原 join：新成员仍由原后端 join 自动选择首个空座；已经在等待房间但起立的本人复用原 seat 接口，竞争失败可重试。本人已经在进行中的房间时可直接返回。加入期间禁止重复提交和取消。正式加入响应为权威，预览有空位不保证最终成功；若加入时房主开始导致 NOT_FOUND，会重新预览，显示已开始状态。过期回调不更新已离开的页面。

## 最小后端变更（需后续部署）

新增登录后只读接口：`GET /api/avalon/room/invite-preview?roomCode=000123`。

原房间 get 仅允许房间成员，故不能安全复用于加入前预览。本接口继续要求现有 JWT 登录，不新增匿名放行，不修改鉴权协议。DTO 仅包含 roomCode/status/maxPlayers/currentPlayers/seatedPlayers/member/座位号及 occupied；只有本人已是成员时返回可恢复的 roomId。无角色、阵营、私人视野、投票、其他用户ID、昵称或头像。

新增 repository 查询为参数化只读查询，无建表或字段变更。未修改 join、seat、房主转移、规则引擎、WebSocket、数据库结构。后续先按现有流程部署包含该接口的后端，再上传这版小程序；无需数据库迁移。本轮未连接或部署生产。

## 验证

- 前端相关测试28项全部通过：邀请状态、登录恢复、重复提交、落座、本人战绩映射、筛选乱序、首页弹窗、资料原有流程。
- 旧邀请/登录恢复相关8项与分享路径1项通过；旧输入页断言已随确认页调整。
- 新后端 InvitePreviewTest 4项通过，包括 JSON 不含身份和其他用户信息、成员返回、非法/不存在房间、不产生写操作。
- 另外尝试 RoomServiceTest：16项中15项通过，1项失败。原 `ownerTransferPrefersLowestSeatedPlayerThenEarliestStandingPlayer` 期望固定房主，而当前 main nextOwner 使用随机选人；本轮未改动此逻辑或为了测试改玩法。这是已发现的旧测试与实现不一致，不能宣称所有后端测试通过。
- JS语法、git diff --check 通过。
- 微信开发者工具编译及16个实际页面状态预览，无运行异常。请求、登录及跳转均用隔离数据模拟，无真实账号注册、加入、建局或生产数据修改。
- 额外实际预览10人邀请页，席位自动分成两行；占位图32px、状态点7px、等待图标22px实际尺寸检查通过，无运行错误。
- 320×568、390×844、430×932 的24个补充浏览器布局案例通过，使用实际 WXML 与 WXSS，SVG实际尺寸校验通过，无横向溢出，退出按钮可滚动至TabBar上方。这不是24种真机测试。
- 实际截图位于本机 `/tmp/avalon-round2/`，含home/history/invite/invite-full/invite-started/invite-expired/invite-network/login/profile/me等。

尚需真机验证：好友聊天卡片缩略图缓存/裁剪、点击旧邀请链接及跨登录完整流程、真实后端发布后的预览与加入竞争、iOS/Android字体与键盘行为、10人席位在真机上的文字与小屏滚动。静态截图和隔离请求不能替代这些联调。

## 修改文件

- `backend/src/main/java/com/avalon/game/game/AvalonRepository.java`
- `backend/src/main/java/com/avalon/game/room/RoomController.java`
- `backend/src/main/java/com/avalon/game/room/RoomService.java`
- `miniprogram/components/app-tab-bar/app-tab-bar.js`
- `miniprogram/components/app-tab-bar/app-tab-bar.wxml`
- `miniprogram/components/app-tab-bar/app-tab-bar.wxss`
- `miniprogram/pages/history/history.js`
- `miniprogram/pages/history/history.wxml`
- `miniprogram/pages/history/history.wxss`
- `miniprogram/pages/index/index.js`
- `miniprogram/pages/index/index.wxml`
- `miniprogram/pages/index/index.wxss`
- `miniprogram/pages/join/join.js`
- `miniprogram/pages/join/join.json`
- `miniprogram/pages/join/join.wxml`
- `miniprogram/pages/join/join.wxss`
- `miniprogram/pages/login/login.wxss`
- `miniprogram/pages/room/room.js`
- `miniprogram/services/avalon.js`
- `miniprogram/tests/invites-action-sync.test.js`
- `miniprogram/tests/main-pages-refinement.test.js`
- `backend/src/test/java/com/avalon/game/room/InvitePreviewTest.java`
- `docs/ui-v3-round2-assets.json`
- `miniprogram/styles/history-card.wxss`
- `miniprogram/tests/invite-preview-ui.test.js`
- `miniprogram/utils/history-presentation.js`

新增资源（原始SVG未改写；来源、root尺寸、哈希见 ui-v3-round2-assets.json）：

- `miniprogram/assets/ui-v3-round2/013b8.svg`
- `miniprogram/assets/ui-v3-round2/07ff8.svg`
- `miniprogram/assets/ui-v3-round2/08cc9.svg`
- `miniprogram/assets/ui-v3-round2/16283.svg`
- `miniprogram/assets/ui-v3-round2/37192.svg`
- `miniprogram/assets/ui-v3-round2/3bb5b.svg`
- `miniprogram/assets/ui-v3-round2/469dc.svg`
- `miniprogram/assets/ui-v3-round2/5175b.svg`
- `miniprogram/assets/ui-v3-round2/52726.svg`
- `miniprogram/assets/ui-v3-round2/5b292.svg`
- `miniprogram/assets/ui-v3-round2/697fe.svg`
- `miniprogram/assets/ui-v3-round2/704a9.svg`
- `miniprogram/assets/ui-v3-round2/78be2.svg`
- `miniprogram/assets/ui-v3-round2/7f978.svg`
- `miniprogram/assets/ui-v3-round2/aa638.svg`
- `miniprogram/assets/ui-v3-round2/abb84.svg`
- `miniprogram/assets/ui-v3-round2/d397d.svg`
- `miniprogram/assets/ui-v3-round2/home-castle.jpg`
- `miniprogram/assets/ui-v3-round2/share-cover.png`

- `docs/ui-v3-round2-implementation.md`（本记录）
