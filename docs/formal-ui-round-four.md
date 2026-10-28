# 正式对局 UI 第四轮精修

2026-10-28；基于本地 main / 0d74c68。仅本地修改，未提交、推送、部署或发布。

## 实现

- 顶部两按钮：56rpx 高、23rpx 白字、600 字重、18rpx 圆角、2rpx 边框、12rpx 间距；背景 rgba(10,20,17,.82)。身份按钮为原金色边框，更多为 #A4ADA7 银灰边框。
- 正式预览三行：标题和页码、原投票方块、左侧结果文字与右侧任务牌。第三行低对比度分隔线，文字与牌组垂直居中。
- 默认任务牌显示框 54×75.06rpx，间距 8rpx；375px 及以下为 50×69.5rpx，间距 6rpx。沿用已有成功/失败 PNG，以 aspectFit 保持原始比例、不裁剪。两类图片原比例略有不同，均完整适配显示框。
- 卡片 300rpx，Swiper 316rpx（上下各 8rpx）；卡片内边距上下 20rpx、左右 16rpx。详细记录仍为原有 376rpx 卡片和 76×105.64rpx 大牌。
- 未通过显示「提案未通过」，无牌；通过但未结算显示「等待任务结果」，无牌且保留已公开投票。结算后文案沿用服务端 status 和 failCount；卡牌直接复用原 missionCards，排序仍为匿名成功牌在前、失败牌在后，不映射到个人。
- 正式对局使用屏幕高度的纵向 Flex 容器。头部和底部不压缩，中间圆桌/提案区域独立纵向滚动。原圆桌高度和坐标保持不变；空间足够时以自动上边距把提案靠近底部操作区。正文底部 8rpx、Swiper 底部 8rpx，加操作区顶部 18rpx，卡片至按钮约 34rpx。空间不足时滚动正文，底部操作区仍完整可见。
- 正式对局覆盖原 220rpx 底部预留，底部操作区域在 Flex 中实际占位，保留原 14rpx + safe-area-inset-bottom 下边距，避免双重预留与固定定位覆盖。

本轮没有修改 room.js、game-log.js、mission-result.js、图片、罗盘、座位坐标、任务进度条样式、底部按钮样式、菜单权限、刺杀流程及后端。

## 文件清单

实现（5 个）：

- miniprogram/components/game-log/game-log.wxml
- miniprogram/components/game-log/game-log.wxss
- miniprogram/utils/proposal-display.js
- miniprogram/pages/room/room.wxml
- miniprogram/pages/room/room.wxss

测试和验证（6 个）：

- miniprogram/tests/night-proposal.test.js
- miniprogram/tests/proposal-interaction.test.js
- miniprogram/tests/formal-game-ui.test.js
- miniprogram/tests/room-preparation.test.js（仅将旧的全页滚动区计数断言限定到准备页，准备页实现不变）
- scripts/qa-compact-room.js
- scripts/qa-compact-room-layout.js

文档：docs/formal-ui-round-four.md。

## 测试结果

- 相关 Node 回归 274/274 通过：人数、文案、匿名卡牌数量/顺序、预览与详情一致、待结算转结算刷新、Swiper 运动中的延迟更新、页码、隐私、菜单权限及提前/正式刺杀。
- 微信开发者工具 iPhone 16 模拟器 393×852，基础库 3.8.10：5～10 人 × 六类结果，共 36 个场景通过；原生 Swiper/页码、头部按钮低于原生胶囊、卡牌数量与比例、滚动正文和底部不重叠、完整记录大牌、四类菜单权限场景通过。使用隔离接口 fixtures，无后端写入。
- Chrome 重放模拟器输出的 WXML 与项目 WXSS：375×667、390×844、430×932，共 108 个场景通过。检查最多 5 张牌、结果文字不裁切、图像比例、圆桌未压缩、滚动后完整卡片可见、顶部与底部尺寸和无横向溢出。该项不是这些尺寸的微信真机验证。
- 全量 Node：911 项，884 通过、27 项既有失败，与上一轮通过验收的基线失败集合完全一致，无新增失败。
- JavaScript 语法与 git diff --check 通过。

## 人工验收

- iOS/Android 真机上的圆桌纵向滚动与提案横向拖动手感，尤其斜向拖动、快速反向滑动和长按。
- 微信胶囊、安全区、系统大字体及低屏幕设备。低屏幕允许滚动正文查看完整圆桌和提案，底部按钮始终占据独立区域。
- 真实联网任务结算与重连时的刷新，以及远程卡牌图片在弱网下的加载效果。

截图与报告：本次 Codex 工作目录 outputs/fourth-room/。
