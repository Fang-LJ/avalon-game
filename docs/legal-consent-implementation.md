# 协议阅读与登录前主动同意

## 当前行为

- 原样使用提供的两份结构化 JS 正文，将资料包中的四个文件移至指定的 `miniprogram/utils/legal/` 和 `docs/legal/`。协议正文没有改写；WXML 仅遍历章节与段落，不复制正文、不使用 Markdown 渲染库。
- `/pages/legal/legal?type=agreement` 和 `?type=privacy` 共用完整阅读页面：金色标题、版本号、发布日期、生效日期、段落/小标题/项目符号、分章节卡片。复用 guest-header 的固定安全区返回入口；从登录或我的进入都使用正常页面栈返回。阅读页不读取 Token、不登录、不请求后端、不记录“完整阅读”，随时可返回。
- 登录页初始 agreed=false。勾选框与两份协议链接相互独立，打开阅读页不会同意。未同意时禁用按钮，登录页方法和 auth.login 再次校验；local mock 同样必须同意，生产仍禁止 mock。
- 只有主动勾选才生成本地同意记录，保存两个版本号、确认时间、正文变更标记。成功登录后关联 userId 与当前 Token 的本地变更标记，不额外保存明文 Token。同版本真实记录可复用，版本、生效日期或正文变化会要求再次同意。
- 旧 Token 无有效记录时，不自动恢复、不请求个人资料；正式页面 requireSession 也会返回登录页。确认前保留旧 Token，不删账号、房间或正式战绩。取消同意、离开页面、重复点击及过期登录回调都受保护。旧会话的迟到 401 不会清掉新会话，失败的非认证登录请求也不会清掉旧 Token。
- 新用户可自主完善资料或跳过并使用默认“微信玩家”及默认头像展示。已有账号不因 profileComplete=false 被反复强制完善资料。昵称可手动填写、自定义头像可选，不索取手机号，不自动弹出资料授权。
- 我的页面提供用户服务协议、隐私政策两个独立入口，已移除 presentation.showLegal 的摘要弹窗及所有业务引用。

## 微信平台隐私授权

自有协议同意记录不代表微信平台的隐私接口已授权。微信头像选择保持原生、用户主动点击的 chooseAvatar；相册选择在用户主动点击时先调用 wx.requirePrivacyAuthorize，成功后才调用 chooseMedia。拒绝或接口不支持时不打开相册，可继续使用默认头像。昵称改为普通手动文本输入，避免默认触发微信昵称资料能力。

没有注册自定义 onNeedPrivacyAuthorization，也没有从自有协议勾选调用 resolve(event:agree)。沿用微信官方隐私弹窗处理平台同意。官方指南确认：平台隐私接口与组件必须在管理后台指引中声明；无自定义响应时由官方弹窗处理同意与拒绝。

参考：[微信小程序隐私协议开发指南](https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/PrivacyAuthorize.html)（含官方隐私弹窗说明）、[wx.requirePrivacyAuthorize](https://developers.weixin.qq.com/miniprogram/dev/api/open-api/privacy/wx.requirePrivacyAuthorize.html)。

当前涉及的类型包括账号标识、主动设置的昵称、主动选择/上传的头像图片，以及正式房间与对局记录。管理员仍需核对微信公众平台已公布指引与实际收集类型、头像及相册接口声明一致。代码检查无法读取公众平台管理后台的实际声明，本轮未修改平台配置。

## 本地记录的限制

该记录仅用于客户端同意与会话恢复控制，不是服务端审计记录，变更标记也不是安全签名。跨设备、清缓存或卸载后不会同步。退出登录会清除当前同意记录；切换成不同缓存 Token 不会复用旧会话记录。仅在微信系统层更换账号、而本地缓存没有同步改变时，客户端无法可靠辨别该变化。local mock 切换只沿用此前主动确认的时间，不伪造新的勾选时间。

若已在用户同意期间发出登录 HTTP 请求，之后取消只能阻止后续提交、Token 写入和页面跳转，不能撤销已经被服务器处理的请求。本轮没有新增服务端协议记录、数据库字段或服务部署；可靠的跨设备、逐账号同意审计需要后续独立后端方案。

## 发布前待补全（原文保留）

1. 两份正文中的【开发者真实姓名】。
2. 两份正文中的【联系邮箱】。
3. 隐私政策中的【运行日志保存期限，请按生产环境实际配置填写，例如“30日”；如各类日志保存期不同，请分别列明】。

没有猜测真实信息或删除条款。提供的 Markdown 也要求核对正式小程序名称、服务器/文件存储所在地、第三方服务商和数据删除流程：正文名称为“圆桌秘境”，目前界面品牌仍为“阿瓦隆”，保持用户要求的现有设计。补全后应同步修改对应 JS 和 Markdown 并修订协议版本；正文变化会使旧本地记录失效。

## 验证

- `npm --prefix miniprogram test`：738 项通过，包括首次未同意、两份阅读后不自动同意、勾选/取消、零登录请求、旧 Token、版本/正文更新、会话/账号变化、异步撤销、重复点击、存储失败、默认资料与邀请恢复，以及独立微信隐私授权通过/拒绝/缺失的测试。
- `npm --prefix miniprogram run check`、脚本语法检查及代码文件差异检查通过。两份原始 Markdown 中四处行尾双空格用于 Markdown 强制换行，按原样保留；完整差异检查仅有这四处格式提示。
- 微信开发者工具 iPhone 12/13 mini：44 项协议与登录交互检查通过。两份全文、所有章节与段落、固定返回及滚动、明确勾选、取消、旧 Token、默认资料跳过、我的两个阅读入口、版本更新均验证。只有主动勾选后的登录产生一次 wx.login 和一次 wx-login；这些请求全部模拟，没有访问真实账号后端或创建线上用户。
- Chrome 对实际导出的登录 DOM 与 WXSS 验证 320×480、320×568、375×667、375×812、390×844、430×932：保留四卡布局，协议区域与金色链接无水平溢出，在小屏可通过自然滚动完整显示，登录按钮与同意区域不遮挡。
- 共享游客导航的五组宽度检查继续通过；微信开发者工具额外完成 122 项游客检查及完整刺杀/结算、再来一局、退出，游客调用监测中登录、用户资料、后端请求、WebSocket 均为零。游客引擎的完整对局测试继续通过。
- 未连接物理手机测试平台授权弹窗；平台权限拒绝/成功在自动化中模拟。未修改正式游戏规则、Java 后端或数据库，未部署服务器、上传小程序或提交审核。

## 复跑

```sh
npm --prefix miniprogram test
npm --prefix miniprogram run check
# 微信开发者工具开启自动化端口 9422，依赖安装在小程序包以外
NODE_PATH=<外部依赖目录>/node_modules node scripts/qa-legal-login.js /tmp/avalon-legal-native
NODE_PATH=<外部依赖目录>/node_modules node scripts/qa-legal-layout.js /tmp/avalon-legal-native
NODE_PATH=<外部依赖目录>/node_modules node scripts/qa-v106-guest.js /tmp/avalon-legal-guests-native
```

## 修改与新增文件

- `docs/legal-consent-implementation.md`
- `docs/legal/圆桌秘境-用户服务协议.md`
- `docs/legal/圆桌秘境-隐私政策.md`
- `miniprogram/app.json`
- `miniprogram/components/guest-header/guest-header.js`
- `miniprogram/components/guest-header/guest-header.wxml`
- `miniprogram/components/guest-header/guest-header.wxss`
- `miniprogram/pages/legal/legal.js`
- `miniprogram/pages/legal/legal.json`
- `miniprogram/pages/legal/legal.wxml`
- `miniprogram/pages/legal/legal.wxss`
- `miniprogram/pages/login/login.js`
- `miniprogram/pages/login/login.wxml`
- `miniprogram/pages/login/login.wxss`
- `miniprogram/pages/me/me.js`
- `miniprogram/pages/me/me.wxml`
- `miniprogram/pages/profile/profile.js`
- `miniprogram/pages/profile/profile.wxml`
- `miniprogram/services/auth.js`
- `miniprogram/services/file.js`
- `miniprogram/tests/config.test.js`
- `miniprogram/tests/helpers/legal-consent-fixture.js`
- `miniprogram/tests/invites-action-sync.test.js`
- `miniprogram/tests/legal-login.test.js`
- `miniprogram/tests/login-diagnostics.test.js`
- `miniprogram/tests/profile-flow.test.js`
- `miniprogram/tests/v1-ui.test.js`
- `miniprogram/tests/wechat-privacy.test.js`
- `miniprogram/utils/legal-consent.js`
- `miniprogram/utils/legal/privacy-policy.js`
- `miniprogram/utils/legal/user-agreement.js`
- `miniprogram/utils/presentation.js`
- `miniprogram/utils/request.js`
- `miniprogram/utils/wechat-privacy.js`
- `scripts/qa-guest-ui-layout.js`
- `scripts/qa-legal-layout.js`
- `scripts/qa-legal-login.js`
