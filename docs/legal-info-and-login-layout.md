# 协议真实信息与登录页布局更新

## 完成内容

两份协议版本均由 1.0.0 更新至 1.0.1（发布/生效日期 2026-10-13）。开发者为方良军，邮箱为 [842515974@qq.com](mailto:842515974@qq.com)，正式小程序名称为圆桌秘境，主体为个人开发者。保留产品介绍中的阿瓦隆桌游辅助定位。没有新增身份证、住址或无关信息。

JS 正文与 Markdown 中同步使用同一公开邮箱链接，全文页面只将 mailto 链接转换成实际邮箱显示，不引入 Markdown 库、不修改规范正文对象。逐章节测试核对两种形式的标题、段落、版本和日期一致。删除了 Markdown 文件开头的“发布前必须补全”“协议初稿”等编辑说明；仍未核实的运维事项移至本交付记录，隐私政策内的相关待确认条款保留。

使用原有协议版本与正文变更检测。真实的 1.0.0 本地同意记录不会继续授权新版会话恢复或登录；用户需要重新勾选 1.0.1。账号 Token 和正式对局数据不会因为版本更新被主动删除。同意仍仅保存在本机，跨设备与服务端审计限制没有变化。

登录页保留阿瓦隆 Logo/标题、AVALON、宣传语与 2×2 游客功能卡片。登录按钮、首次账号说明、协议区整体通过 flex 和 margin-top:auto 靠近底部安全区，卡片与按钮至少预留 40px，底部预留安全区加 16px。短屏自然增高并可滚动，没有固定或绝对定位登录按钮。状态栏及胶囊尺寸变化时更新顶部品牌位置。

勾选视觉为透明背景的 22px 圆形与浅灰绿色边框，选中填充金色、显示深绿色对勾；实际按钮热区为 44×44px。保留 checkbox 无障碍语义及状态。协议名称保持金色、独立打开对应全文。默认未勾选，未同意不调用登录接口。按用户确认删除常驻“请先阅读并同意协议”，保留“首次登录将自动创建阿瓦隆账号”。

## 日志期限核查

检查了以下仓库文件和配置目录：

- `backend/src/main/resources/application.yml`：未指定日志轮转、保存天数或文件保存策略。
- `backend/Dockerfile`：未提供日志保留策略。
- `deploy/docker-compose.prod.yml`：未指定 Docker logging driver 的保留策略或按天清理。
- `deploy/nginx/api.playmatespace.cloud.conf`、Nginx 配置片段及部署示例：未提供 access/error 日志的轮转期限或 logrotate 配置。
- `docs/reference-stack.md` 与部署说明：未记录可确认的生产日志保存天数。

JWT 过期时间、代理超时、图片缓存期限均不是日志保留期限。仓库配置不足以确认主机 Docker daemon、外部 Nginx、应用日志采集平台及备份中的实际保留期限。本轮没有连接生产服务器或修改线上配置。

隐私政策仍保留原标记【运行日志保存期限，请按生产环境实际配置填写，例如“30日”；如各类日志保存期不同，请分别列明】。其中“30日”仅是原文件示例，不作为已确认的生产期限。

## 仍需确认的内容

1. 实际应用、网关/访问、安全日志的保留与清理期限。
2. 隐私政策第四章第一条中的服务器与文件存储实际所在地、是否位于中国大陆；“正式发布前须核实”说明尚未由仓库证据确认。
3. 第五章第二条涉及的基础设施服务商及具体委托处理安排。
4. 第四章第五条的备份轮换、清理与删除范围。
5. 第六章中邮箱申请渠道的可用性、身份核验、撤回同意/删除数据/注销账号的人工处理流程。真实邮箱已填写，但没有发送测试邮件或擅自声称流程已建立；当前没有一键注销功能。
6. 第八章涉及未成年人的保护与监护人处理流程，需要确认实际运营是否能够落实现有条款。
7. 微信公众平台的用户隐私保护指引仍需与当前账号、头像、资料及对局记录处理保持一致。本轮未改动该平台配置。

除日志保存期限外，四份协议文件中已无姓名或邮箱占位符。以上运营事项没有被编造为已落实，也没有删掉相关条款。AppID、AppSecret、API 地址及部署配置没有改动。

## 验证

- 全部 744 项 Node 自动化测试通过；新增逐章节 JS/Markdown 一致性、邮箱显示、1.0.0 升级重新确认及登录安全区重算验证。
- 微信开发者工具 iPhone 12/13 mini：53 项协议与登录交互检查通过，包含真实公开信息、版本 1.0.1、邮箱不露出链接语法、22px 圆形/44px 热区、无常驻提示、仅阅读不自动同意、勾选/取消、旧 Token、默认资料及我的协议入口。登录和个人资料请求全部模拟，未创建真实线上账号。
- 使用实际导出的登录 DOM 和 WXSS 检查 320×480、320×568、375×667、375×812、390×844、430×932。验证 2×2 卡片、按钮间距、圆形尺寸、触摸区域、短屏可达性、水平不溢出及大屏安全区底部位置；刘海机型在浏览器中模拟 34px 底部安全区。修正了布局检查脚本转换 page 类型选择器时误改 .login-page 类名的问题。
- JavaScript 语法检查与代码差异检查通过。Markdown 元数据保留原有双空格硬换行，完整差异检查按此格式放行。
- 未连接物理 iPhone；没有改动游戏规则、游客引擎、正式房间或 Java 后端，没有部署或上传微信审核。

## 复跑

```sh
npm --prefix miniprogram test
npm --prefix miniprogram run check
# 微信开发者工具开启自动化端口 9422，自动化依赖安装在小程序包以外
NODE_PATH=<外部依赖目录>/node_modules node scripts/qa-legal-login.js /tmp/avalon-login-bottom-native
NODE_PATH=<外部依赖目录>/node_modules node scripts/qa-legal-layout.js /tmp/avalon-login-bottom-native
```

## 修改与新增文件

- `docs/legal-consent-implementation.md`
- `docs/legal-info-and-login-layout.md`
- `docs/legal/圆桌秘境-用户服务协议.md`
- `docs/legal/圆桌秘境-隐私政策.md`
- `miniprogram/pages/legal/legal.js`
- `miniprogram/pages/legal/legal.wxml`
- `miniprogram/pages/login/login.js`
- `miniprogram/pages/login/login.wxml`
- `miniprogram/pages/login/login.wxss`
- `miniprogram/tests/legal-content.test.js`
- `miniprogram/tests/legal-login.test.js`
- `miniprogram/utils/legal/privacy-policy.js`
- `miniprogram/utils/legal/user-agreement.js`
- `scripts/qa-legal-layout.js`
- `scripts/qa-legal-login.js`
