# 正式对局提案卡片与顶部菜单验收记录

日期：2026-10-27。仅修改本地代码，未提交、推送、部署或发布。

## 修改文件

业务和样式：

- `miniprogram/utils/proposal-display.js`：从已校验的匿名任务汇总生成结果文案，胜负始终取服务端 status。
- `miniprogram/components/game-log/game-log.wxml`：compact 正式预览显示一行结果，详细记录继续显示任务牌。
- `miniprogram/components/game-log/game-log.wxss`：正式预览 240rpx、Swiper 256rpx；标题白色、结果浅灰白色。
- `miniprogram/pages/room/room.wxml`：正式对局顶部两个按钮；新增居中菜单及权限控制的菜单项。
- `miniprogram/pages/room/room.wxss`：顶部按钮统一 56rpx；透明背景、彩色描边、白色文字；暗绿色居中菜单。
- `miniprogram/pages/room/room.js`：菜单状态、互斥、阶段切换关闭、防重复操作及实时权限复查；复用原有确认和 API。

测试与验证脚本：

- `miniprogram/tests/night-proposal.test.js`
- `miniprogram/tests/proposal-interaction.test.js`
- `miniprogram/tests/early-assassination.test.js`
- `miniprogram/tests/assassination-layout.test.js`
- `miniprogram/tests/room-more-menu.test.js`（新增）
- `scripts/qa-compact-room.js`（新增，微信模拟器）
- `scripts/qa-compact-room-layout.js`（新增，复用模拟器实际输出的 WXML 和项目 WXSS 做浏览器尺寸检查）
- 本验收记录。

`game-log.js` 的 Swiper 手势保护、`mission-result.js` 的匿名汇总校验、服务端接口均未修改。没有新增点击卡片打开详情的手势；通过「更多 → 全部提案」打开原有详情。

## 六类结果与边框

| 服务端结果 | 预览文案 | 边框 |
| --- | --- | --- |
| REJECTED | 提案未通过 | 金黄 |
| APPROVED，任务未结算 | 任务进行中 | 中性 |
| SUCCESS，failCount=0 | 任务成功 | 绿 |
| SUCCESS，failCount=1 | 任务成功 · 1 张失败牌 | 绿 |
| FAILED，failCount=1 | 任务失败 · 1 张失败牌 | 红 |
| FAILED，failCount=2 | 任务失败 · 2 张失败牌 | 红 |

失败牌数量动态生成，更多失败牌同样支持。不会根据失败牌数量推算胜负，兼容第 4 轮一张失败牌但任务成功。未公开投票保持中性，不读取个人任务出牌生成文案。

## 菜单与权限

`moreMenuOpen` 控制固定遮罩和居中弹窗。遮罩捕获点击与移动，内部阻止冒泡；按钮点击先等待菜单关闭渲染，再打开详情或原有确认框。

菜单 z-index 为 45，高于底部按钮 20，低于身份 50、历史 60、结果 100；高优先级弹层存在时拒绝打开菜单。任务结果、秘密任务、阶段/房间/游戏切换及页面隐藏会关闭菜单。动作回调重新检查房间、游戏、阶段、任务与提案范围及 busy，避免执行过期操作。

房主操作再次检查 room.host；提前刺杀在打开菜单、选择动作、原有确认及等待同步后提交时复查 ui.canStartEarlyAssassination(game, role)。原风险说明和服务端 startAssassination 接口保留。退出和结束仍需确认。正式 ASSASSINATION 目标选择、底部确认按钮与 assassinate 流程保持原状。

## 验证结果

- 相关 Node 回归：273/273 通过。包括 5～10 人投票格、六类结果、隐私、Swiper/页码、菜单角色和房主权限、busy、重复点击、过期回调、弹层互斥、提前/正式刺杀、任务提交和队伍同步。
- 微信开发者工具：iPhone 16 模拟器，393×852，基础库 3.8.10。5～10 人 × 六类结果共 36 个卡片场景通过；原生 Swiper 切页、页码按钮、详情卡牌、四类菜单场景、关闭和确认入口通过。使用隔离 API fixtures，无后端写入。
- 响应式布局：实际输出 WXML 配合项目 WXSS 在 Chrome 中检查 375×667、390×844、430×932，共 108 个用例通过。检查卡片/Swiper 高度、文字和方块溢出、顶部进度与按钮间距、菜单及底部按钮边界。此检查不是对应宽度的微信真机测试。
- 全量 Node 测试：910 项，883 通过、27 失败。将修改前 HEAD 完整导出至临时目录复跑为 850 项，823 通过、相同 27 项失败；无新增失败。既有失败集中在旧大厅断言（4）、旧座位坐标断言（17）、旧提案组件测试夹具（1）、准备页旧断言（3）、座位操作（1）、加入房间旧接口（1）。
- JavaScript 语法检查、git diff --check 通过。

## 手动验收

- 真机连续左右拖动、快速切页、点按遮罩和菜单，确认无卡顿、误触或穿透。
- iOS / Android 的微信胶囊、安全区和系统大字体。
- 多人联网时阶段切换、重连、新局切换；实际确认退出、房主结束、提前刺杀及正式刺杀的完整业务流程。

模拟器截图和布局报告保存在本次 Codex 工作目录的 `outputs/compact-room/`。
