# Figma V3 小程序 UI 实施记录

设计来源：Figma 文件 `Vy1WdzYMtNgF3hcpt1t81Q`，目标页「阿瓦隆 UI V3 · 主页面优化」。本轮通过 Figma MCP 读取六个节点的设计上下文、原始 SVG、变量与截图，未以整页截图充当小程序背景。

| 页面 | 节点 | 实现 |
| --- | --- | --- |
| 登录 | 406:6 | 74px 品牌图标、简洁品牌文字、横向图标的四个游客入口、登录按钮和协议区；移除旧宣传语，保留开发环境模拟入口 |
| 首页 | 406:57 | Hero、金色/绿色描边的并排创建与加入按钮、动态最近对局、怎么玩、未结束房间入口 |
| 战绩 | 406:110 | 对局概览、服务端胜率、胜负比例条、阵营筛选、动态战绩卡片与复盘入口 |
| 资料 | 406:162 | 居中头像及编辑角标、昵称输入及微信昵称建议入口、保存、首次跳过；编辑模式不显示跳过 |
| 我的 | 406:200 | 账号入口、三项战绩、两组菜单、移除关于菜单、红色实底退出按钮 |
| 头像来源 | 411:54 | 两个来源入口，原生 chooseAvatar 与原有相册选择分别接入现有上传链路 |

## 主题、尺寸与资源

- `miniprogram/styles/ui-v3.wxss` 定义局部主题：背景 `#0d1711`，卡片 `#142119`，强表面 `#19281f`，边框 `#304237`，金色 `#d8b75c`，正义 `#63c7a7`，邪恶 `#d76776`，按钮绿 `#5e826f`，主文字 `#f1f3ee`，次文字 `#aab2ac`。退出按钮为节点指定的 `#a94050`。
- 390px 设计参考映射到 750rpx：布局宽度、间距与圆角按比例处理，字号和 SVG 保留实际 CSS px，导航和安全区域使用微信窗口/胶囊数据及 env。没有将全部尺寸机械翻倍。
- 公共头部、卡片和 TabBar 通过 `v3` 参数启用。其余页面继续使用既有参数、结构和样式；`app.wxss` 与所有游戏页面未改动。
- 四个带标题的页面增加局部吸顶容器，滚动时标题仍避开状态栏；首页头像位于微信胶囊左侧，避免覆盖。
- 30 个原始 SVG 共 15,838 字节。未修改 SVG 内容或尺寸，未增加 PNG 卡牌副本。节点、资源、原始尺寸和 SHA-256 见 `docs/ui-v3-assets.json`。全部资源均已本地化，运行时代码不引用临时 Figma URL。

## 必要 JS 修改

- `pages/login/login.js`：仅调整设计图标映射、品牌区域的自适应顶部位置。登录、协议版本记录、会话恢复、首次跳转、游客与模拟登录逻辑不变。
- `pages/history/history.js`：增加比例条宽度与筛选视觉类型。胜率仍使用服务端返回值，空统计显示空比例条；接口、分页、筛选参数与复盘方法不变。
- `pages/profile/profile.js`：增加头像来源弹层开关、昵称聚焦/失焦方法；原生头像回调与相册入口关闭弹层后调用原有上传。保存、MinIO 接口、昵称校验、默认资料跳过、编辑返回逻辑不变。
- `page-head`：增加可选 V3 属性和胶囊避让度量；`game-card`、`app-tab-bar` 增加可选样式/图标属性，不改导航方法。
- 首页与我的页面 JS、鉴权、文件上传、平台隐私授权服务均未修改。

## 静态稿之外的必要补充与已知差异

1. 新用户协议默认未勾选；Figma 的已勾选仅作为已同意状态参考，没有据此改变授权逻辑。
2. 保留加载、错误、空数据、未结束房间、开发环境模拟用户等真实状态。它们存在时页面高度会相应增加。
3. 我的页面原有常用角色信息在有统计数据时保留一行次级文字；静态设计未包含此行，保留它以免删除现有信息。
4. 设计没有画出微信状态栏、胶囊与 Home Indicator。真实页面顶部留白、首页头像位置、TabBar 底部留白因系统数据而异；不在界面内部重画设计画布的设备外边框和圆角。较短屏幕中的战绩/我的页面需要自然滚动，底部操作可以完整滚至 TabBar 上方。
5. 字号和字重遵循设计；设备字体可能回退为 PingFang SC 等系统字体，字形和抗锯齿不能保证跨设备逐像素一致。
6. 头像来源以真正的底部弹层呈现，增加必要遮罩与安全区；微信自身头像选择及昵称建议界面仍由平台提供。

## 已完成验证

- JS 语法检查：10 个修改或新增 JS 文件通过；`git diff --check` 通过。
- 静态事件检查：五个页面 35 处明确事件绑定均解析到已有/新增方法。
- 相关轻量验证：`profile-flow.test.js`、`legal-login.test.js`、`wechat-privacy.test.js` 共 47 项通过。涵盖默认未同意不登录、会话/版本校验、首次跳过、昵称输入、原生头像回调、上传路径、相册独立隐私授权与拒绝恢复。没有运行全套测试或后端测试。
- `scripts/qa-ui-v3.js`：375×812 微信开发者工具原生渲染 19 个场景，无运行异常。覆盖五页、头像来源、协议选中/未选中、空/加载/错误、未结束房间、筛选、编辑模式、长昵称、常用角色及退出按钮滚动可达；头像/相册请求全部隔离，不访问生产写接口。
- `scripts/qa-ui-v3-layout.js`：320×568、390×844、430×932 共 33 个实际浏览器渲染场景，使用原生 WXML 和当前项目 WXSS；无水平溢出，标题不会滚入状态栏，退出按钮可滚至 TabBar 上方。全部 30 个 SVG 在原生与重放结果中核对了实际显示尺寸。
- 本机截图与报告位于 `/tmp/avalon-ui-v3/`，Figma 参考截图在该目录的 `figma/` 子目录，不进入小程序包。

## 待真机确认

- 不同微信/iOS/Android 版本中昵称建议栏是否按用户操作出现，以及 chooseAvatar、原生键盘的具体呈现。
- 真实平台隐私授权拒绝/取消后的系统表现。
- 真实网络条件下头像上传至 MinIO、保存和返回页面后的资料刷新。本轮使用隔离上传响应，不将 mock 结果当成真实服务器验证。
- 大号系统字体、平台字体差异、实际安全区域与滚动手感。

未修改后端、数据库、鉴权协议、WebSocket、游戏规则、生产配置；未部署、发布、提交或推送。

## 修改文件

页面：

- `miniprogram/pages/login/login.js`、`login.wxml`、`login.wxss`、`login.json`
- `miniprogram/pages/index/index.wxml`、`index.wxss`、`index.json`
- `miniprogram/pages/history/history.js`、`history.wxml`、`history.wxss`、`history.json`
- `miniprogram/pages/profile/profile.js`、`profile.wxml`、`profile.wxss`、`profile.json`
- `miniprogram/pages/me/me.wxml`、`me.wxss`、`me.json`

公共 UI 与静态素材：

- `miniprogram/styles/ui-v3.wxss`
- `miniprogram/components/page-head/page-head.js`、`page-head.wxml`、`page-head.wxss`
- `miniprogram/components/game-card/game-card.js`、`game-card.wxml`、`game-card.wxss`
- `miniprogram/components/app-tab-bar/app-tab-bar.js`、`app-tab-bar.wxml`、`app-tab-bar.wxss`
- `miniprogram/assets/ui-v3/*.svg`，完整 30 个文件见资源清单

验证与记录：

- `miniprogram/tests/profile-flow.test.js`
- `miniprogram/tests/wechat-privacy.test.js`
- `scripts/qa-ui-v3.js`
- `scripts/qa-ui-v3-layout.js`
- `docs/ui-v3-assets.json`
- `docs/ui-v3-implementation.md`
