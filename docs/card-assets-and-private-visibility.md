# 卡牌静态资源与私有视野

## 当前资源

统一 HTTPS base：`https://api.playmatespace.cloud/avalon-assets/cards/v2`。
local/prod 均使用此 base；不改变 API、WebSocket 和 mock 登录配置。

19 个对象位于现有 `playmate-minio` 的独立 bucket `avalon-assets`，key 为
`cards/v2/{roles,actions,back,special}/*.png`。
Git 原件位于 `static-assets/avalon/cards/v2/`，v1 JPG 在 Git 与服务器上均完整保留。
主包 `miniprogram/assets/cards/` 保持不存在。
经用户批准，匿名策略只增加 v2 前缀的 `s3:GetObject`；v1 继续可读，不开放列表或写入。

导出：`python3 scripts/export-cards.py`，需要 Pillow 以及本地保留的三张原 PNG。
直接读取 1448×1086 RGB PNG 母版，保持原裁切坐标与比例；原生宽 272–388px、高 501–526px。
v2 使用 2× LANCZOS、RGB PNG、optimize 与 compress_level=9；无锐化、无有损压缩、无调色板降级。
19 张共 18,148,413 字节，尺寸/来源/像素与哈希报告位于 `static-assets/avalon/card-export-v2.json`。
2× 插值不增加真实细节，只预先完成高 DPI 放大；PNG 编码无损保存插值后像素。
本地原生 PNG / 2× PNG A/B 及总览在忽略的 `design-source/cards/` 中。

| 类别 | 原生裁切尺寸（px） |
| --- | --- |
| 梅林 / 派西维尔 / 忠臣 / 刺客 | 352×501 / 318×501 / 322×501 / 336×501 |
| 莫甘娜 / 莫德雷德 / 奥伯伦 / 爪牙 | 277×513 / 279×513 / 272×513 / 276×513 |
| 身份背 / 动作背 | 299×506 / 378×508 |
| 成功 / 失败 / 同意 / 反对 | 377×524 / 378×524 / 377×524 / 377×513 |
| 湖中仙女 / 刺杀 / 正义胜利 / 邪恶胜利 / 徽记 | 388×526 / 384×526 / 385×526 / 388×515 / 385×515 |

按现有包体测试口径估算主包约 0.17 MiB，相比原来的 2,070,446 字节明显减少。
微信开发者工具实际编译/上传包大小以其显示为准，本轮没有上传体验版或真机验证。

## 发布与验证

```sh
SSH_HOST=ubuntu@115.159.47.212 \
SSH_IDENTITY=/Users/fangliangjun/.ssh/playmate-prod-ubuntu \
bash scripts/publish-card-assets.sh
cd miniprogram
npm run check:assets
```

发布脚本使用容器现有环境中的凭据，只复用既有 bucket、增加 19 个 v2 对象及批准的 v2 只读前缀。
不输出凭据、不改其他桶、不安装或重启 MinIO。已有相同对象跳过；v2 对象字节不同则中止，
对 v1 的 19 张对象进行发布前后哈希比对；原策略与哈希留在服务器静态资源备份目录。
以后更新图像应发布 v3 并修改 base，不能覆盖 immutable v1 / v2。
`check:assets` 单独运行公网 HEAD/GET、Content-Type、缓存及 SHA-256 验证，并验证匿名列表 403。
普通 `npm test` 离线运行，不依赖生产网络。

真实 Nginx 文件：`/opt/playmate-space/deploy/nginx/default.conf`。
此前 v1 接入时备份：`default.conf.before-avalon-assets-20261010`；本轮 v2 没有修改 Nginx。
已有 `deploy/nginx-assets.conf.fragment` 中的 location 复用 `playmate_minio_backend`，
代理 `/avalon-assets/` 到桶同名路径并传递 `Host: playmate-minio:9000`，缓存 365 天/immutable。
不得用仓库模板覆盖真实配置；修改后 `docker exec playmate-nginx nginx -t` 通过才 reload。
原 `/avalon/` Web、`/avalon/socket.io/`、`/avalon/ws/`、`/avalon/api/`、`/api/`、`/minio/` 和健康路由不变。

## 私有身份

`VisiblePlayer` 新增 nullable `roleCode` / `roleName`。
仅 `/my-role` 为当前鉴权玩家返回私有视野：

- 莫甘娜、刺客、爪牙、莫德雷德互知具体身份，排除自身和奥伯伦。
- 梅林只得到 EVIL（包含奥伯伦、不含莫德雷德），两个角色字段均 null。
- 派西维尔两名候选均为 MERLIN_OR_MORGANA、相同 hint、角色字段均 null。
- 奥伯伦、忠臣没有额外视野。

私有 DTO 经显式投影生成本地徽记，不修改公共 room.players。
自己优先：忠/梅/派/娜/刺/爪/莫/奥；普通邪恶同伴按获准的具体角色显示娜/刺/爪/莫。
梅林见红月，派西维尔见相同紫色问号，绝不使用候选角色字段/排序/样式区分。
身份 Overlay 与身份确认使用相同私有显示，只有普通邪恶可见具体同伴角色名称。

皇冠 42rpx（9/10 人 36），身份/红月/问号 38rpx（9/10 人 34），角色字 22、问号 24rpx。
✓ 仍为 30rpx。皇冠上中、✓右上、我左下、身份右下。当前选择边框颜色及公开邪恶红环见
[刺杀与任务状态 UI](mission-rejection-status-ui.md)。
不改变卡牌动画、状态机、角色配置、投票/任务/湖中仙女规则。

## 后端部署边界

生产 `/opt/avalon-game` 是构建产物目录，不是 Git checkout。
完整测试/提交推送后，按现有方式构建可执行 JAR，用服务器现有 `Dockerfile.runtime` 构建独立镜像，
保留旧镜像和 backend/release manifest 备份，再运行
`docker compose -f /opt/avalon-game/deploy/docker-compose.prod.yml up -d --no-deps --no-build avalon-server`。
仅替换 `avalon-server`；保留原 `.env.prod`、prod profile、Docker 网络及端口。
本轮无 SQL、migration、表结构变化或历史清理，不重启数据库/Redis/MinIO/其他应用。

完成后仍需上传新的微信体验版，在 iOS/Android 检查全部卡牌、身份徽记及 9/10 人紧凑布局。
