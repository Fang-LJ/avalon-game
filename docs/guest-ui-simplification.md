# 游客页面导航与体验操作简化

四个游客页面共用固定在状态栏下方、胶囊左侧的返回主页入口。安全区域通过共享 `guest-navigation.js` 计算，旋转或窗口尺寸改变时更新。资料页取消底部返回按钮；普通页面栈返回仍使用 navigateBack，直接打开的页面返回登录页。

体验页在首次输出游戏状态前调用已有 ADD_BOT 与 START，直接显示五人身份发牌，不呈现等待大厅。身份确认只保留卡牌、能力、视野和确认动作。对局进行时，任务轨道右侧显示我的身份和规则允许的刺杀入口，记录入口与点击已完成任务均可查看公开历史。阶段操作固定在底部并预留安全区域。身份弹窗不会因机器人从选人进入表决而自动消失。

返回主页不弹确认框，立即停止机器人，销毁引擎，清空私有身份、动画、选择及历史状态；过期机器人回调、刺杀确认回调和任务选择事件都不能继续改变状态。只有提前刺杀保留二次确认。再来一局仅在结算页提供，重新随机创建完整五人局。

正式 pages/room、Java 后端、登录授权、本地规则引擎及机器人策略均未修改；不部署服务器、不上传小程序或提交微信审核。

## 验证

- 全部 703 项 Node 自动化测试通过，JavaScript 语法检查与 git diff --check 通过。
- 新增页面导航、安全区、各阶段直接退出、过期回调、弹窗、提前刺杀及再来一局测试。50 局页面驱动完整随机对局覆盖五种游客身份、真人和机器人队长及刺客；原有 200 局引擎测试继续通过。
- 微信开发者工具 iPhone 12/13 mini 最终 96 项检查通过，四种被监测调用均为零：固定返回与滚动、直接发牌、身份弹窗打开关闭、公开记录、完整任务及结算、再来一局和直接退出；监测 login、getUserProfile、request、connectSocket。
- Chrome 使用实际 WXSS 验证 320×568、375×667、375×812、390×844、430×932：导航避开状态栏和胶囊，标题不遮挡，任务轨道与刺杀/身份同一行无重叠，底部操作避开模拟的 home indicator，滚动后返回入口固定，无水平溢出。
- 尚未连接物理 iPhone；以上为微信模拟器与浏览器布局检查。

## 复跑

```sh
npm --prefix miniprogram test
npm --prefix miniprogram run check
# 微信开发者工具开启自动化端口 9422；依赖安装在小程序包以外
NODE_PATH=<外部依赖目录>/node_modules node scripts/qa-v106-guest.js /tmp/avalon-guest-ui-native
# 本机安装 Google Chrome
NODE_PATH=<外部依赖目录>/node_modules node scripts/qa-guest-ui-layout.js /tmp/avalon-guest-ui-layout
```

## 修改与新增文件

- `docs/guest-ui-simplification.md`
- `docs/v1.0.6-guest-experience.md`
- `miniprogram/components/guest-header/guest-header.js`
- `miniprogram/components/guest-header/guest-header.wxml`
- `miniprogram/components/guest-header/guest-header.wxss`
- `miniprogram/pages/configuration/configuration.wxml`
- `miniprogram/pages/demo-room/demo-room.js`
- `miniprogram/pages/demo-room/demo-room.wxml`
- `miniprogram/pages/demo-room/demo-room.wxss`
- `miniprogram/pages/guide/guide.wxml`
- `miniprogram/pages/roles/roles.js`
- `miniprogram/pages/roles/roles.wxml`
- `miniprogram/tests/guest-navigation.test.js`
- `miniprogram/tests/guest-pages.test.js`
- `miniprogram/utils/guest-navigation.js`
- `scripts/qa-guest-ui-layout.js`
- `scripts/qa-v106-guest.js`
