# 等待大厅与身份揭晓页面适配

本次只修改小程序前端。Java、数据库、登录、角色权限、实时选人接口与 WebSocket 协议均未修改。

## 布局与状态

- 等待大厅去掉房间信息卡片，使用上下两条细分隔线；房间号与复制一行，机器人、退出房间、关闭房间一行。机器人和关闭操作继续只对房主显示，接口与确认流程沿用原方法。
- 底部操作区与中间滚动区分离。普通成员始终只有邀请按钮；房主双按钮按未满/已满切换为 65:35 / 35:65。满员、非 WAITING 或 busy 时邀请按钮禁用且移除 `open-type=share`。开始按钮仍检查服务端 `room.canStart`、busy、人数和房主展示条件。
- 大厅与身份揭晓页面使用限定视口的 Flex 容器，导航及大厅底部不参与滚动；只有中间 scroll-view 的内容超出时才有滚动范围。禁用该滚动区回弹，关闭 room 原生下拉刷新；原有 WebSocket 重连及五秒刷新保持不变。
- 大厅原固定高度改为 Flex 自适应，并保留按人数确定的防碰撞最小高度。`lobbySeats` 的响应式选项只在该大厅启用，默认调用和正式对局位置计算不变；座位顺序、横向位置、头像、昵称和房主标识保持原有设计。
- 身份卡牌仍为原来的 400×715rpx，发牌、翻牌、洗牌逻辑没有变化。715rpx 的桌面预留对应实际大卡牌高度，并非强行缩小卡牌；多条私人视野使内容超高时仍可查看确认按钮及人数提示。

## 验证

- `npm --prefix miniprogram test`：794 项通过。覆盖四种底部状态、canStart=false、busy、房主切换、禁用分享、默认/响应式座位数据，以及原有房间、机器人、实时选人和私人视野回归。
- `npm --prefix miniprogram run check`：通过。
- `scripts/qa-room-preparation.js`：开发者工具原生渲染 24 个状态，使用隔离接口数据，不登录、不写生产接口。检查分享入口、按钮比例、房主变更、按钮禁用、滚动范围、顶部固定及底部安全区。
- `scripts/qa-room-preparation-layout.js`：重放原生 WXML 与项目 WXSS，检查 320×568、375×667、375×812、390×844、430×932 共 120 个布局场景。检查真实溢出时可滚动、内容能放下时滚动范围为零、标题不移动、按钮安全区、座位和昵称碰撞。

在 375×812 原生模拟器中，5/7/8/10 人大厅均无滚动范围；5/7/8 人无额外视野的身份测试页无需滚动，10 人梅林三条视野测试页需要并能够滚动。320×568、375×667 下，7/8/10 人大厅及身份测试内容超高时只滚动中间区，固定标题及大厅底部操作仍完整。实际滚动取决于角色视野、说明文字和设备可用高度，并非按人数强制开关。

这些检查不等同于物理 iPhone/Android 真机、iOS 原生回弹或真实多人联网验收。未部署后端，未上传体验版或微信审核版本。

## 改动文件

- `miniprogram/components/page-head/page-head.js`
- `miniprogram/components/page-head/page-head.wxml`
- `miniprogram/components/page-head/page-head.wxss`
- `miniprogram/pages/room/room.js`
- `miniprogram/pages/room/room.json`
- `miniprogram/pages/room/room.wxml`
- `miniprogram/pages/room/room.wxss`
- `miniprogram/tests/formal-game-ui.test.js`
- `miniprogram/tests/invites-action-sync.test.js`
- `miniprogram/tests/lobby-lossless-v2.test.js`
- `miniprogram/tests/lobby-mission-polish.test.js`
- `miniprogram/tests/lobby-seat-ui.test.js`
- `miniprogram/utils/presentation.js`
- `docs/lobby-preparation-scroll.md`
- `miniprogram/tests/room-preparation.test.js`
- `scripts/qa-room-preparation-layout.js`
- `scripts/qa-room-preparation.js`
