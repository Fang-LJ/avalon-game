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

所有文件都是 `.webp`。资源映射统一放在 `miniprogram/utils/cards.js`，未知身份退回牌背，未知特殊牌退回通用徽记。

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
| actions/mission-success.webp | 600 × 834 | 85138 | 83.1 |
| actions/mission-fail.webp | 600 × 832 | 72014 | 70.3 |
| actions/approve.webp | 600 × 834 | 85548 | 83.5 |
| actions/reject.webp | 600 × 816 | 72766 | 71.1 |
| back/action-back.webp | 600 × 806 | 83404 | 81.4 |
| special/lady-of-the-lake.webp | 600 × 813 | 82294 | 80.4 |
| special/assassinate.webp | 600 × 822 | 69588 | 68.0 |
| special/good-victory.webp | 600 × 820 | 85914 | 83.9 |
| special/evil-victory.webp | 600 × 796 | 67388 | 65.8 |
| special/generic-emblem.webp | 600 × 803 | 78278 | 76.4 |

总资源 1,564,926 字节，约 1.49 MiB。角色质量参数为 86，其他卡牌为 80；压缩后低于 100 KiB 的文件不刻意增大。原图每张牌实际宽约 270～390 px，输出到 600 px 不会增加原画细节。

`project.config.json` 的 `packOptions.ignore` 排除 `tests/` 和 `package.json`。全包按其余文件未压缩大小保守估算约 1.59 MiB，比 2 MiB 少约 417 KiB。Node 测试会阻止资源增长导致此估算超过 2 MiB；正式上传仍以微信开发者工具计算的编译包大小为准。

如需从本地原图重新导出，可使用带 Pillow/WebP 的 Python 执行 `python3 scripts/export-cards.py`。该脚本也在 `design-source/cards/` 生成仅供本地核对的联系表。

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
