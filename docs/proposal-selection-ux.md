# 提案卡与队长选人交互优化

日期：2026-10-08。基线：49e82fa。

## 固定尺寸与字段对齐

- 实时历史卡与 swiper 均固定为 276rpx。compact-entry 为父容器高度 100%。
- 移除根据 missionCards.length 切换 swiper 高度的 without-mission 分支。
- 全部记录使用同一 live-proposal-record 模板，每张卡同样固定为 276rpx。
- 标题 26rpx / 行高 36rpx，状态 23rpx / 行高 36rpx，正文 24rpx / 行高 34rpx。
- 双列 Grid 为 1.08fr : 0.92fr，列间距 16rpx，左列队长/队伍，右列同意/反对。
- 每行 label 固定宽 52rpx，label 与 value 间距 8rpx，值单独对齐。
- 长队长昵称 ellipsis，不压缩右侧数字；标题和组队状态不换行。
- 底部任务区域预留至少 76rpx。已结束任务保留匿名成功/失败卡牌；
  APPROVED 尚未结束显示“任务进行中”，REJECTED 显示“未执行任务”。
- 任务缩略牌继续 52×72.28rpx，成功在前，失败在后，不恢复英文数量统计。
- game-log.js 未修改，默认最新、历史 ID 跟踪、swiper 切换、全部记录与 Replay 行为保持不变。

## 颜色语义

在 app.wxss 增加唯一公共颜色变量 `--selection: #55c8ff`。
selected-team 外圈使用该亮蓝色；action-done-icon 保持 var(--good)，
刺杀外圈保持 var(--evil)，Lady 外圈和队长皇冠保持 var(--gold)。
没有修改 ✓ 的判断、位置、私有身份标记或角色规则。

## 按点击顺序替换最后一个队员

只修改 TEAM_BUILDING 且 isLeader 时的 togglePlayer 分支：

1. 已选择：splice 移除对应 ID。
2. 未满：push 当前 ID。
3. 已满：pop 最后一个 ID，再 push 当前 ID。

始终从 selectedIds.slice() 复制草稿，不按 seatNo 或 displayPlayers 排序，不发替换 Toast。
更新 selectedIds 后仍调用 decoratePlayers，蓝色外圈立即更新。
draftKey/newPhase、同轮刷新保留草稿逻辑和 submitTeam API 均未修改。
ASSASSINATION/LADY_OF_LAKE 单选分支及权限限制保持不变。

## 测试与视觉检查

- npm test：202 项全部通过，0 failures/skipped；新增 23 项测试。
- npm run check：通过。
- 原有测试保留，仅调整了有意改变的颜色、字段结构和固定高度断言。
- 2/3/4/5 人任务：追加、选满替换、连续替换、取消、取消后补选与有序提交通过。
- 同轮轮询/WebSocket 刷新保留点击顺序；gameId/missionNo/proposalNo/phase 变化清空旧草稿。
- 非队长、busy、结果遮罩及非选择阶段不能修改队伍；刺杀/Lady 原有单选通过。
- 微信开发者工具 375×812 模拟器：实际点击 player-seat 完成 [1,2] → [1,3] 替换；
  亮蓝色外圈、长昵称省略、10 人数字、最多 5 张任务牌、全部记录已核对。
- REJECTED、APPROVED pending、FAILED、SUCCESS 四类 fixture 的卡片和 swiper 均实测 138px，
  对应 276rpx；实际 swipeTo 切换前后高度不变。
- 对模拟器已渲染节点与仓库实际 WXSS 做隔离 Chromium 375/390/430px 布局检查：
  四类卡片高度相同，标题/状态不重叠，十人数字及五张图片不溢出，label/value 对齐。
  390/430px 是浏览器宽度检查，不冒充微信真机验证；实体手机字体缩放仍待人工核对。
- 测试使用拦截请求的本地 fixture，未向生产数据库写测试数据。
  模拟器结束后恢复原 token、request/socket 方法，停止 QA 页面轮询并返回原首页/登录页。
- 没有 backend/**、docs/sql/**、身份卡、任务卡、洗牌动画、Replay 或数据库改动。
  本次仅前端改动，无需重新部署后端；本轮未运行 Maven 或生产部署。

## 修改文件

- miniprogram/app.wxss
- miniprogram/components/game-log/game-log.wxml
- miniprogram/components/game-log/game-log.wxss
- miniprogram/components/player-seat/player-seat.wxss
- miniprogram/pages/room/room.js
- miniprogram/tests/completion-history-ui.test.js
- miniprogram/tests/formal-game-ui.test.js
- miniprogram/tests/team-selection-ux.test.js（新增）
- docs/proposal-selection-ux.md（本文件）
