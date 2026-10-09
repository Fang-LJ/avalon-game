# 身份卡 UI 第一阶段

本阶段只接入身份确认和主动查看身份。后端、数据库、公共 RoomView、角色规则、任务/投票/湖中仙女/刺杀/结算交互均保持原有实现。

## 资源

原图均为 1448 × 1086，来源为本地 `design-source/cards/01-actions.png`、`02-special.png`、`03-roles.png`。仅裁切、等比例缩放及 WebP 压缩，没有重绘或修改原画文字。原图和本地裁切检查拼版被 `.gitignore` 排除，不删除原图。

共导出 19 张：身份牌 8、身份牌背 1、动作牌 4、动作牌背 1、特殊牌 5。动作图中的重复牌背保留中间一张；特殊图的重复牌背不另行导出。

```text
miniprogram/assets/cards/
  roles/    merlin, percival, loyal-servant, assassin,
            morgana, mordred, oberon, minion
  actions/  mission-success, mission-fail, approve, reject
  back/     role-back, action-back
  special/  lady-of-the-lake, assassinate, good-victory,
            evil-victory, generic-emblem
```

当前资源为 17 张 `.webp` 和 2 张 `.jpg`：仅任务成功/失败牌使用 JPEG，角色、牌背、赞成/反对及特殊牌仍使用 WebP。资源映射统一放在 `miniprogram/utils/cards.js`，未知身份退回牌背，未知特殊牌退回通用徽记。

| 资源（相对 cards/） | 尺寸 px | 字节 | KiB |
| --- | --- | ---: | ---: |
| roles/merlin.webp | 600 × 854 | 101314 | 98.9 |
| roles/percival.webp | 600 × 945 | 96678 | 94.4 |
| roles/loyal-servant.webp | 600 × 934 | 91266 | 89.1 |
| roles/assassin.webp | 600 × 895 | 76240 | 74.5 |
| roles/morgana.webp | 600 × 1111 | 87250 | 85.2 |
| roles/mordred.webp | 600 × 1103 | 82644 | 80.7 |
| roles/oberon.webp | 600 × 1132 | 87072 | 85.0 |
| roles/minion.webp | 600 × 1115 | 77846 | 76.0 |
| back/role-back.webp | 600 × 1015 | 82284 | 80.4 |
| actions/mission-success.jpg | 600 × 834 | 138399 | 135.2 |
| actions/mission-fail.jpg | 600 × 832 | 124146 | 121.2 |
| actions/approve.webp | 600 × 834 | 85548 | 83.5 |
| actions/reject.webp | 600 × 816 | 72766 | 71.1 |
| back/action-back.webp | 600 × 806 | 83404 | 81.4 |
| special/lady-of-the-lake.webp | 600 × 813 | 82294 | 80.4 |
| special/assassinate.webp | 600 × 822 | 69588 | 68.0 |
| special/good-victory.webp | 600 × 820 | 85914 | 83.9 |
| special/evil-victory.webp | 600 × 796 | 67388 | 65.8 |
| special/generic-emblem.webp | 600 × 803 | 78278 | 76.4 |

总资源 1,670,319 字节，约 1.59 MiB。WebP 角色质量参数为 86，其他 WebP 卡牌为 80；两张 JPEG 使用 quality=88、optimize=True、progressive=True。原图每张牌实际宽约 270～390 px，输出到 600 px 不会增加原画细节。

`project.config.json` 的 `packOptions.ignore` 排除 `tests/` 和 `package.json`。本次全包按现有包体测试口径保守估算 1,839,189 字节，约 1.754 MiB，比 2 MiB 少 257,963 字节。对应两个旧 WebP 已删除，未重复打包。Node 测试会阻止资源增长导致此估算超过 2 MiB；正式上传仍以微信开发者工具计算的编译包大小为准。

如需从本地原图重新导出，可使用带 Pillow/WebP 的 Python 执行 `python3 scripts/export-cards.py`。该脚本也在 `design-source/cards/` 生成仅供本地核对的联系表。

## 体验版 JPEG 最小验证

本次仅将现有任务成功/失败 WebP 解码后重新编码为 JPEG，保留 600 × 834 / 600 × 832 的像素尺寸，不重新裁切、缩放或改动构图。首次迁移命令为 `python3 scripts/export-cards.py --convert-mission-jpeg`，仅在旧 WebP 尚存在时使用；默认重新导出会根据目标扩展名输出混合 JPEG/WebP，不会恢复两张任务牌的旧 WebP 路径。

秘密任务选择、结果揭晓、历史提案缩略牌和任务详情继续通过统一 `CARDS.actions.SUCCESS/FAIL` 获取资源，没有组件硬编码 JPEG 路径。

`play-card` 的前后图片均增加 `bindload` / `binderror`，由事件 dataset 区分 front/back 及实际 src。仅 develop/trial 输出 `[CARD IMAGE LOAD]` / `[CARD IMAGE ERROR]`；后者含脱敏 errMsg。release 或环境 API 不可用时不输出，不弹 Toast、不改变卡面或游戏状态。3D、翻牌时序、CSS 和卡牌尺寸完全不变。

这不是已确认的 WebP 根因修复。需要重新上传并设置新的体验版，在 iPhone 微信分别核对任务成功、邪恶玩家任务失败、结果揭晓及历史缩略牌。若 JPG 正常显示，下一阶段再考虑其他 WebP；若 JPG 仍不显示，停止批量转换，结合加载日志检查 image/3D 渲染和真实上传包内容。后端、数据库、Nginx、MinIO 及合法域名均不涉及。

本次验证：`npm test` 304 项全部通过（卡牌相关 42 项），`npm run check` 通过。检查了 JPEG 首尾签名、渐进编码、三色通道、原始尺寸、17 张 WebP 签名、无重复资源、主包预算及仅 develop/trial 输出的前后卡牌诊断。其余 17 张图片字节未改动，未执行 Maven 或后端部署。

## 组件与流程

- `play-card`：front/back、flipped、selected、disabled、interactive、small/medium/large。使用 aspectFit 保留原比例与完整说明，CSS perspective/preserve-3d/backface-visibility/rotateY 实现 620ms 翻牌。
- `card-deal-stage`：独立管理本地身份动画、定时器和揭晓/确认事件。现有 `game-card` 保持普通 UI 容器职责。
- ROLE_CONFIRM：SHUFFLE（850ms，6 张牌背）→ DEALING（550ms）→ BACK → 点击 → FLIPPING（620ms）→ REVEALED → 调用现有 confirmRole。
- REVEALED 之前不显示阵营、说明、私有视野或确认按钮，隐藏牌面不装载身份正面。已确认用户直接恢复 REVEALED，禁用重复确认。
- 同一个 gameId 的轮询/Socket 刷新不重置动画。新局初始化新动画。切后台时洗牌/发牌恢复到 BACK，翻牌恢复到 REVEALED；组件销毁清理定时器。
- 正式对局「我的身份」主动打开后直接显示中号身份卡、阵营、后端说明及当前用户私有 visiblePlayers，无洗牌/发牌。
- 卡牌选择只来自 myRole 的 roleCode。公共玩家不增加身份字段，主界面的私有视野标识保持原样。

原画奥伯伦卡写着「不被其他坏人看见」，属于简化描述。保留原画文字，辅助说明仍显示后端返回的规则：奥伯伦和普通邪恶玩家互不可见，梅林可以看见奥伯伦。

## 验证

- `cd miniprogram && npm test`：66 项通过，包括新增 25 项资源/翻牌/刷新/后台恢复/确认/隐私/包体检查。
- `cd miniprogram && npm run check`：通过。
- `cd backend && mvn test`：124 项通过，0 失败，0 跳过。未修改后端源代码或 SQL。
- 微信开发者工具 3.8.10 基础库：使用本地请求桩验证真实点击牌背、翻牌、确认一次、刷新保持揭晓、中号身份弹层和派西维尔同标记；无运行时异常。请求桩在验证结束后移除，没有写入生产数据。
- 原画裁切拼版逐张视觉核对，牌背、梅林、派西维尔和「我的身份」已留存模拟器截图。
- 真机 iOS/Android 的 3D 渲染性能及小屏滚动仍应在发布前验证。

任务成功/失败牌、赞成/反对牌本轮仅准备资源映射。任务牌集中洗牌、湖中仙女、刺杀、胜利结算动画以及音效、粒子留待下一阶段。
