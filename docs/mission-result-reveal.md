# 任务收牌、洗牌与结果揭晓

## 范围与隐私

本轮仅修改小程序，不改后端 Phase、任务胜负、数据库、实际提交或历史 swiper。
组件不调用 API，也没有玩家、座位、提交顺序等输入。`normalizeResult` 只保留
`missionNo / successCount / failCount / status`，以匿名汇总重新生成卡牌。
成功牌全部在左，失败牌全部在右。任务是否成功只相信服务端 `status`，
所以 7 人以上第四任务一张 FAIL 仍可显示任务成功。

## 动画与卡牌

`COLLECT` 400ms → `SHUFFLE` 900ms → `SPREAD` 400ms → `REVEAL` 左到右每张间隔 280ms
→ 最后一张翻牌完成 620ms + 停顿 400ms → `RESULT`。
2～5 张总时长约 3.0～3.84 秒，只有 RESULT 出现确认按钮。
前三阶段不向 play-card 提供正面资源。翻牌复用原组件的 rotateY 与 620ms transition。
卡面和牌背直接复用 CARDS.actions.SUCCESS / FAIL、CARDS.back.ACTION，没有新增或复制图片。

play-card 新增 `size="result"` 与可选 `resultCount`：2/3/4/5 张分别宽
200/170/140/118rpx，高度依任务卡正面 600:834 比例计算；所有图片保持 aspectFit。
单排间距分别 20/16/12/12rpx。五张总宽 638rpx，小于扣除左右 32rpx 后的 686rpx。
全屏 overlay z-index 100，头尾预留安全区，确认 footer 不参与压缩；小高度屏幕另有收紧样式。

## 状态同步与恢复

- fetchState 在更新服务器真实阶段的同一次 setData 内打开结果 overlay，避免先闪现结算。
- 显示 key 为 `${gameId}-${missionNo}`；storage 为 `avalon:mission-result:${gameId}`，值为最后确认任务号。
- 同一结果轮询不会重启动画，确认后轮询或重建页面不会再次弹出。
- 未确认结果在断线、后台或重新进入后仍补看。组件 hide/show 将中断动画安全恢复为所有牌正面 RESULT，仍需本人确认。
- storage 失败时使用本页内存确认，不阻塞游戏；若设备存储持续不可写，重新打开页面可能再次补看，这是安全降级。
- 新 gameId 清空展示状态并使用独立 storage。旧结果仍显示时收到更晚结果，先确认旧结果，再展示最新结果。
- MISSION_COMPLETED 继续沿用现有 WebSocket refresh，结果仅从 GameState 读取，不信事件中的额外字段。
- 新结果关闭秘密任务选牌、私有身份和投票面板；高层遮罩覆盖历史面板。
- 服务器可以处于 TEAM_BUILDING / LADY_OF_LAKE / ASSASSINATION / FINISHED，不等待客户端确认。
- detached、隐藏、输入变化时取消 timer，并以 generation 拒绝失效回调。

## 验证（2026-10-04）

- npm test：165 项通过，原有测试保留，新增 33 项。
- npm run check：通过。
- mvn test：181 项通过，0 failures/errors/skipped；后端无代码改动。
- 临时 Java QA 复用 BotGameIntegrationTest 的真实 service、Spring 事务、JDBC 与隔离 H2。
  实际创建 5/7/10 人机器人局并进行组队、投票、任务、Lady、刺杀，提取公开状态供小程序验证。
  普通任务成功/失败、7 人第四任务一 FAIL 成功、第三次失败 FINISHED、第三次成功 ASSASSINATION、10 人 LADY_OF_LAKE 全部获得真实 service 结果。
  H2 用完 shutdown，未连接或写入生产库。
- 微信开发者工具 iPhone 12/13 mini（375×812）：使用上述 service 状态替代网络响应，核对真实组件动画、最终排序、按钮可见、卡牌边界和确认后阶段。
  2/3/4/5 张实际渲染均通过，模拟器 JS exception 为 0；确认后刷新不重弹。
  自动化结束恢复原 token、结果 storage、request 与 socket，不保留测试账号登录态。
- 390/430px：自动布局尺寸、比例及安全区代码检查通过；尚未在这些宽度的实体手机测试。
- 待真机：iOS/Android 3D backface 表现、低性能机洗牌流畅度、系统字体放大、横屏/极短屏、刘海安全区和五张牌细节辨识度。
  本轮没有手机真机远程预览或多人公网端到端测试，不将模拟器检查称作真机通过。

## 修改文件

新增 components/mission-result-overlay 下 js/json/wxml/wxss、utils/mission-result.js、
tests/mission-result.test.js 和本说明；修改 play-card 的 js/wxml/wxss、room 的 js/json/wxml，
以及 bots.test.js 的依赖注入映射（原测试内容未删除）。
没有后端、SQL、资源图片、生产 env 或密钥改动，不需要重新部署后端。
