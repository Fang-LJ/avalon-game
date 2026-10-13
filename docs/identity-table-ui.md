# 身份标识与中央桌板 UI 验收（2026-10-13）

## 实现范围

本轮仅修改共享身份标识的 WXML/WXSS，以及正式房间中央桌板的 WXML/WXSS。

- 所有角色、阵营、系统候选及个人猜测标识统一为实色圆角矩形、纯白文字；常规高度 38rpx，9/10 人局沿用紧凑的 34rpx。
- 邪恶阵营 `#A93447`、梅林 `#94701B`、派西维尔 `#7046A6`、忠臣/蓝方 `#176E78`；白字对比度分别为 6.42:1、4.57:1、6.74:1、5.94:1。
- 梅林 `EVIL` 系统知识显示「红」，派西 `MERLIN_OR_MORGANA` 系统知识显示紫色「?」。组件不读取具体角色身份；个人猜测仍使用 `GUESS` 与独立的黄色问号。
- 移除中央桌板的 `card` 类，显式清除容器背景、边框、圆角和内边距。主标题金色加粗，说明浅灰，保留阶段内容、否决圆点及强制轮警告。
- 刺杀说明和目标允许自然换行，容器水平居中并收窄到桌面宽度的 44%，避免 8 人局长昵称碰到下方头像。
- 游客房间继续引用正式房间样式和共享身份标识组件，自动获得相同外观。

没有修改 `player-seat` 的四个标识锚点、座位坐标、顶部控件、发牌/任务动画、`presentation.js`、`role-guesses.js`、游客引擎/机器人策略、后端或线上配置。

## 修改和新增文件

生产代码修改：

- `miniprogram/components/knowledge-mark/knowledge-mark.wxml`
- `miniprogram/components/knowledge-mark/knowledge-mark.wxss`
- `miniprogram/pages/room/room.wxml`
- `miniprogram/pages/room/room.wxss`

更新旧视觉断言与测试描述（业务断言保留）：

- `miniprogram/tests/assassination-layout.test.js`
- `miniprogram/tests/completion-history-ui.test.js`
- `miniprogram/tests/invites-action-sync.test.js`
- `miniprogram/tests/mission-details-endgame.test.js`
- `miniprogram/tests/mission-rejection-status.test.js`
- `miniprogram/tests/private-identity-assets.test.js`
- `miniprogram/tests/role-guesses-ui.test.js`
- `miniprogram/tests/role-guesses.test.js`
- `miniprogram/tests/role-side-guesses.test.js`

新增：

- `miniprogram/tests/identity-table-visual.test.js`：白字对比度、系统标识隐私边界和桌板阶段内容/换行约束。
- `scripts/qa-identity-table.js`：微信模拟器中的授权 DTO 视角、5～10 人局阶段、标识位置和个人猜测交互验证。仅模拟 GET/Socket，禁止登录与后端写操作；退出恢复测试前的 Token、同意记录和本地标注。可用 `AVALON_QA_COUNTS=10` 单独复查某人数。
- `scripts/qa-identity-table-layout.js`：将微信模拟器实际输出的 WXML 配合现有 WXSS 在 Chromium 中验证不同屏宽，导出截图及几何测量。
- `docs/identity-table-ui.md`：本报告。

## 自动化结果

- `npm --prefix miniprogram test`：750/750 通过。保留梅林/莫德雷德权限、派西候选一致性、猜测容量/切换/清除、正式房间行为和游客引擎等回归断言。
- `npm --prefix miniprogram run check` 及两个新增 QA 脚本的 `node --check`：通过。
- `npm --prefix miniprogram run check:assets`：19/19 卡牌资源验证通过。
- 微信原生模拟器（375×812）：50 个不同场景通过；覆盖 5～10 人组队选人/投票、第四次否决后的强制轮、任务执行、等待刺杀、32 字昵称的刺杀目标、10 人湖中仙女，以及梅林/派西/刺客/忠臣视角和标注修改/清除。头像与中央容器不重叠，王冠/完成对勾/「我」/身份标识保持原锚点。
- Chromium：上述 50 个实际渲染场景在 320×568、375×667、375×812、390×844、430×932 下共 250 项布局检查通过，无水平溢出、头像/王冠遮挡、标识裁切或中央文本截断。
- 现有 `scripts/qa-v106-guest.js`：133 项检查通过；完成五轮任务、任务结果动画、刺杀与结算、再来一局和退出。登录、后端、WebSocket、用户资料请求总数为 0。

原生截图与测量保存在本机 `/tmp/avalon-identity-table/`，游客对局验证在 `/tmp/avalon-guest-regression/`。未将截图或运行时测试依赖加入小程序包。

## 复现方式

基础测试无需新增依赖：

```sh
npm --prefix miniprogram test
npm --prefix miniprogram run check
npm --prefix miniprogram run check:assets
```

UI 自动化使用包体外的 `miniprogram-automator` 和 `ws`。先打开微信开发者工具，开启 CLI 自动化并等待编译完成，再运行：

```sh
NODE_PATH=/path/to/external/node_modules node scripts/qa-identity-table.js /tmp/avalon-identity-table
NODE_PATH=/path/to/external/node_modules node scripts/qa-identity-table-layout.js /tmp/avalon-identity-table
NODE_PATH=/path/to/external/node_modules node scripts/qa-v106-guest.js /tmp/avalon-guest-regression
```

微信模拟器验证实际组件、WXML 分支和交互；Chromium 多尺寸检查用于补充几何验证，不等同于 iPhone 真机或多人线上实测。本轮没有发起正式游戏接口写请求，无需后端部署，未上传微信审核版本。
