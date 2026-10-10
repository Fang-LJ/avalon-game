# 身份卡 UI 第一阶段

> 本文下方为历史阶段记录。当前卡牌已迁至独立 MinIO 静态资源，不再打包进小程序；最新配置、尺寸及部署方式见 [卡牌静态资源与私有视野](card-assets-and-private-visibility.md)。

本阶段只接入身份确认和主动查看身份。后端、数据库、公共 RoomView、角色规则、任务/投票/湖中仙女/刺杀/结算交互均保持原有实现。

## 资源

原图均为 1448 × 1086，来源为本地 `design-source/cards/01-actions.png`、`02-special.png`、`03-roles.png`。保持原有裁切坐标、构图、边框和文案，仅等比例缩放及 JPEG 压缩，没有重绘。原图和本地裁切检查拼版被 `.gitignore` 排除，不删除原图。

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

当前 19 张资源全部为 `.jpg`，涵盖 actions / roles / back / special；包含原有两张任务 JPEG 的重新优化，以及剩余 17 张 WebP 的迁移。所有旧 WebP 已删除，可从 Git 历史恢复。资源映射统一放在 `miniprogram/utils/cards.js`，未知身份退回 JPEG 牌背，未知特殊牌退回 JPEG 通用徽记。

| 资源（相对 cards/） | 尺寸 px | 字节 | KiB |
| --- | --- | ---: | ---: |
| roles/merlin.jpg | 520 × 740 | 100676 | 98.3 |
| roles/percival.jpg | 520 × 819 | 104726 | 102.3 |
| roles/loyal-servant.jpg | 520 × 809 | 99182 | 96.9 |
| roles/assassin.jpg | 520 × 775 | 85667 | 83.7 |
| roles/morgana.jpg | 520 × 963 | 101837 | 99.5 |
| roles/mordred.jpg | 520 × 956 | 96237 | 94.0 |
| roles/oberon.jpg | 520 × 981 | 102586 | 100.2 |
| roles/minion.jpg | 520 × 967 | 93828 | 91.6 |
| back/role-back.jpg | 520 × 880 | 113337 | 110.7 |
| actions/mission-success.jpg | 520 × 723 | 106470 | 104.0 |
| actions/mission-fail.jpg | 520 × 721 | 97007 | 94.7 |
| actions/approve.jpg | 520 × 723 | 105964 | 103.5 |
| actions/reject.jpg | 520 × 708 | 94986 | 92.8 |
| back/action-back.jpg | 520 × 699 | 105791 | 103.3 |
| special/lady-of-the-lake.jpg | 520 × 705 | 102923 | 100.5 |
| special/assassinate.jpg | 520 × 712 | 92308 | 90.1 |
| special/good-victory.jpg | 520 × 710 | 106329 | 103.8 |
| special/evil-victory.jpg | 520 × 690 | 89922 | 87.8 |
| special/generic-emblem.jpg | 520 × 696 | 101817 | 99.4 |

总资源 1,901,593 字节，约 1.81 MiB。全部使用 quality=85、optimize=True、progressive=True。单张最大为身份牌背 113,337 字节，全部低于 200,000 字节（比 200 KiB 更严格）。脚本会在必要时依次尝试 quality=82 / 80，仍超限则报错，不继续劣化画质；本批没有触发降质。

`project.config.json` 的 `packOptions.ignore` 排除 `tests/` 和 `package.json`。本次全包按现有包体测试口径保守估算 2,070,446 字节，约 1.975 MiB，比 2 MiB 少 26,706 字节。未重复打包旧 WebP。Node 测试会阻止资源增长导致此估算超过 2 MiB；正式上传仍以微信开发者工具计算的编译包大小为准。当前预算较紧，新增代码或资源必须继续检查总包体。

如需从本地原图重新导出，可使用带 Pillow 的 Python 执行 `python3 scripts/export-cards.py`。默认正式输出全部 JPEG，并在 `design-source/cards/` 生成仅供本地核对的联系表。导出报告包含每张图片的尺寸、字节和实际 quality。

## 体验版 JPEG 全量迁移

用户已确认：前一轮两张任务 JPEG 正面在 iPhone 体验版正常显示，仍使用 WebP 的牌背不显示。因此本轮全部迁移为 JPEG。为同时满足质量和主包预算，将宽度从 600 px 等比调整为 520 px，保留原有裁切范围，高度按原比例取整；不改 UI 展示尺寸或动画。从原始 PNG 导出，避免重复有损压缩旧 WebP/JPEG。原图每张牌实际宽约 270～390 px，520 px 仍高于原画像素宽度。

秘密任务选择、结果揭晓、历史提案缩略牌和任务详情继续通过统一 `CARDS.actions.SUCCESS/FAIL` 获取资源，没有组件硬编码 JPEG 路径。

`play-card` 的前后图片均增加 `bindload` / `binderror`，由事件 dataset 区分 front/back 及实际 src。仅 develop/trial 输出 `[CARD IMAGE LOAD]` / `[CARD IMAGE ERROR]`；后者含脱敏 errMsg。release 或环境 API 不可用时不输出，不弹 Toast、不改变卡面或游戏状态。3D、翻牌时序、CSS 和卡牌尺寸完全不变。

身份牌、发牌阶段、身份查看、任务选择、结果揭晓、历史缩略图、赞成/反对资源及所有牌背全部通过 `cards.js` 指向 JPEG，没有组件硬编码新路径。需要重新上传并设置新的体验版，逐项验证真机显示；自动化检查并不能替代完整真机渲染验证。后端、数据库、Nginx、MinIO 及合法域名均不涉及。

本次验证：`npm test` 322 项全部通过（卡牌相关 60 项），`npm run check` 通过。检查了全部 JPEG 首尾签名、渐进编码、三色通道、等比尺寸、严格 200,000 字节上限、映射与资源一一对应、无旧资源、主包预算及仅 develop/trial 输出的前后卡牌诊断。全部 19 张 JPEG 经 Pillow 实际解码及比例校验；未执行 Maven 或后端部署。

## 组件与流程

- `play-card`：front/back、flipped、selected、disabled、interactive、small/medium/large。使用 aspectFit 保留原比例与完整说明，CSS perspective/preserve-3d/backface-visibility/rotateY 实现 620ms 翻牌。
- `card-deal-stage`：独立管理本地身份动画、定时器和揭晓/确认事件。现有 `game-card` 保持普通 UI 容器职责。
- ROLE_CONFIRM：SHUFFLE（850ms，6 张牌背）→ DEALING（550ms）→ BACK → 点击 → FLIPPING（620ms）→ REVEALED → 调用现有 confirmRole。
- REVEALED 之前不显示阵营、说明、私有视野或确认按钮，隐藏牌面不装载身份正面。已确认用户直接恢复 REVEALED，禁用重复确认。
- 同一个 gameId 的轮询/Socket 刷新不重置动画。新局初始化新动画。切后台时洗牌/发牌恢复到 BACK，翻牌恢复到 REVEALED；组件销毁清理定时器。
- 正式对局「我的身份」主动打开后直接显示中号身份卡、阵营、后端说明及当前用户私有 visiblePlayers，无洗牌/发牌。
- 卡牌选择只来自 myRole 的 roleCode。公共玩家不增加身份字段，主界面的私有视野标识保持原样。

原画奥伯伦卡写着「不被其他坏人看见」，属于简化描述。保留原画文字，辅助说明仍显示后端返回的规则：奥伯伦和普通邪恶玩家互不可见，梅林可以看见奥伯伦。

## 初始 UI 阶段验证（历史记录）

- `cd miniprogram && npm test`：66 项通过，包括新增 25 项资源/翻牌/刷新/后台恢复/确认/隐私/包体检查。
- `cd miniprogram && npm run check`：通过。
- `cd backend && mvn test`：124 项通过，0 失败，0 跳过。未修改后端源代码或 SQL。
- 微信开发者工具 3.8.10 基础库：使用本地请求桩验证真实点击牌背、翻牌、确认一次、刷新保持揭晓、中号身份弹层和派西维尔同标记；无运行时异常。请求桩在验证结束后移除，没有写入生产数据。
- 原画裁切拼版逐张视觉核对，牌背、梅林、派西维尔和「我的身份」已留存模拟器截图。
- 真机 iOS/Android 的 3D 渲染性能及小屏滚动仍应在发布前验证。

任务成功/失败牌、赞成/反对牌本轮仅准备资源映射。任务牌集中洗牌、湖中仙女、刺杀、胜利结算动画以及音效、粒子留待下一阶段。
