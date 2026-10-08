# 实时提案卡统一 Grid 对齐

日期：2026-10-08。基线：f907493。

## 本次范围

只修改 game-log 的 live-proposal-record 模板、对应 CSS 和布局回归测试。
game-log.js、swiper 行为、Replay 模板、后端、数据库、player-seat、选人交互、
任务结果 Overlay、其它页面与公共主题均未修改。本次无需部署后端。

## 最终布局

- 标题行保持原有 flex；标题左侧、组队通过/否决右侧。
- 信息区只有一个 proposal-info-grid，8 个 text 直接作为 Grid 子元素。
- 第一行：队长 / leaderText / 同意 / approveText。
- 第二行：队伍 / teamSeatText / 反对 / rejectText。
- grid-template-columns：54rpx minmax(0, 1.25fr) 54rpx minmax(0, 1fr)。
- column-gap / row-gap 均 8rpx，align-items:center；统一 24rpx 字号、34rpx 行高。
- 列宽在 375px 微信模拟器核对后微调为 1.25:1，保留左值列较宽，同时确保
  “1 2 3 4 5 6 7 8 9 10” 可完整单行显示。未缩小字体，也没有隐藏票数。
- label 全部 muted、左对齐；只有 approve/reject value 分别使用 good/evil。
- value 单独 min-width:0、nowrap、hidden、ellipsis；长队长昵称不挤占投票列。
- 删除 proposal-columns / proposal-team / proposal-votes / proposal-field 及对应嵌套 Grid CSS。

## 固定高度与任务区

- live-proposal、history-swiper：284rpx；compact-entry 仍 height:100%。
- proposal-mission 内容高度固定 82rpx，content-box；顶部 12rpx padding + 1px divider，
  与信息区间距固定 12rpx，不再 margin-top:auto。在 375px 模拟器中外框总高实测 48px。
- 任务牌：58×80.62rpx，保持 600:834 原图比例，gap:8rpx，最多五张不溢出。
- 完成时显示任务成功/失败及原卡牌；成功在前、失败在后；pending 显示“任务进行中”，
  REJECTED 显示“未执行任务”。三种状态任务内容区高度相同。
- 主 swiper 与全部记录仍复用 live-proposal-record；没有修改模板后的 swiper/overlay 标记。

## 验证

- npm test：212 项全部通过，0 failures/skipped（新增 10 项测试；原测试全部保留）。
- npm run check：通过。
- 微信开发者工具 375×812：四类 7 人提案、5/6/8/9/10 人数字、十人赞同全列表及
  1～9 赞同/10 反对，共 10 组 fixture，均验证两行 label/value 同 top、同列同 left。
- 各类卡片及 swiper 实测统一 142px（284rpx）；最大五张图均在卡片内。
- 实际 swiper.swipeTo 切换不改变高度；相同历史更新仍保留 currentProposalId；
  全部记录四张卡片仍同高、可正常打开关闭。模拟器 JS exception 为 0。
- 隔离 Chromium 使用模拟器渲染后的节点与仓库实际 WXSS，验证 375/390/430px：
  行列对齐、十人数字、长昵称 ellipsis、图片加载与边界、固定高度均通过。
  390/430px 属于浏览器宽度检查，不冒充微信真机验证；实体手机字体缩放仍待核对。
- 测试均拦截为本地 UI fixture，未写生产数据；结束恢复 token、request/socket 与原页面。
- Replay 模板及其后的 swiper/overlay WXML 与基线逐字比较一致。
- git diff 确认没有 backend、SQL、页面、player-seat、utils、game-log.js 或动画文件变更。

## 修改文件

- miniprogram/components/game-log/game-log.wxml
- miniprogram/components/game-log/game-log.wxss
- miniprogram/tests/completion-history-ui.test.js（调整布局/缩略图断言）
- miniprogram/tests/team-selection-ux.test.js（仅调整其中的提案卡断言，选人测试保留）
- miniprogram/tests/proposal-grid-layout.test.js（新增）
- docs/proposal-grid-alignment.md（本文件）
