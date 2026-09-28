const RoomScene = require("./RoomScene");
const ScrollView = require("../components/ScrollView");
const { theme } = require("../components/UI");
const { permissions, phaseName, logs } = require("../utils/presentation");
const { getSeatLayout } = require("../utils/layout");
class GameScene extends RoomScene {
  constructor(...args) {
    super(...args);
    this.selected = [];
    this.logScroll = new ScrollView();
  }
  pick(id) {
    const p = permissions(this.game, this.room, this.role);
    if (p.team) {
      if (this.selected.includes(id))
        this.selected = this.selected.filter((x) => x !== id);
      else if (this.selected.length < this.game.requiredTeamSize)
        this.selected.push(id);
    } else if (p.lady || p.assassinate) this.selected = [id];
    this.app.invalidate();
  }
  privateRole() {
    const r = this.role;
    if (r)
      this.app.info(
        r.roleName + " · 仅你可见",
        r.instruction +
          "\n" +
          (r.visiblePlayers || [])
            .map((p) => p.nickname + "：" + p.hint)
            .join("\n"),
      );
  }
  render(u) {
    const g = this.game,
      r = this.room;
    this.chrome(
      u,
      phaseName[g?.phase] || "正在同步…",
      g
        ? "第 " +
            g.missionNo +
            " 轮 · 提案 " +
            g.proposalNo +
            " · " +
            g.goodScore +
            " : " +
            g.evilScore
        : "",
    );
    if (!g || !r) return;
    const p = permissions(g, r, this.role);
    const y = u.content;
    if (g.phase === "FINISHED") {
      this.finished(u, g, r, p);
      return;
    }
    if (g.phase === "MISSION_EXECUTING") {
      this.mission(u, g, p);
      return;
    }
    if (g.phase === "LADY_OF_LAKE") {
      this.lady(u, g, r, p);
      return;
    }
    const tableHeight = r.players.length >= 9 ? 470 : 420;
    const contentHeight = 76 + tableHeight + 130;
    u.scroll(
      this.scroll,
      y,
      u.height - u.bottom - 145 - y,
      contentHeight,
      () => {
        u.track.draw(g, this.timeline.missions || [], 0);
        u.text.draw(
          g.phase === "ASSASSINATION"
            ? g.assassin
              ? "你是刺客 · 选择你认为的梅林"
              : "等待刺客选择梅林"
            : "队长：" +
                g.leaderNickname +
                " · 选 " +
                g.requiredTeamSize +
                " 人 · 否决 " +
                g.consecutiveRejections +
                "/5",
          20,
          47,
          12,
          theme.gold,
        );
        const selected =
          p.team || p.assassinate ? this.selected : g.selectedPlayerIds;
        getSeatLayout(r.players.length, 390, tableHeight).forEach((seat, i) => {
          const player = r.players[i];
          u.seat.draw(player, seat.x, 76 + seat.y, {
            selected: selected.includes(player.playerId),
            leader: player.playerId === g.leaderPlayerId,
            onTap: () => this.pick(player.playerId),
            disabled: !(p.team || p.assassinate),
          });
        });
        const center = 76 + tableHeight / 2 - 28;
        u.card.draw(96, center, 198, 82);
        u.text.draw(
          g.phase === "TEAM_VOTING"
            ? "已投票 " + g.voteCount + "/" + g.playerCount
            : g.phase === "ASSASSINATION"
              ? "目标：" +
                (r.players.find((x) => x.playerId === this.selected[0])
                  ?.nickname || "未选择")
              : "已选择 " + this.selected.length + "/" + g.requiredTeamSize,
          110,
          center + 14,
          15,
          theme.gold,
          true,
          174,
        );
        u.text.draw(
          g.phase === "TEAM_VOTING"
            ? "严格过半通过 · 平票否决"
            : g.phase === "ASSASSINATION"
              ? "确认后不可更改"
              : "由队长提交任务队伍",
          110,
          center + 49,
          11,
          theme.muted,
          false,
          174,
        );
        if (g.latestVoteResult) {
          const vote = g.latestVoteResult;
          u.panel(
            "最近投票：" + (vote.approved ? "组队通过" : "组队否决"),
            [
              "第 " + vote.missionNo + " 轮 · 提案 " + vote.proposalNo,
              "同意：" +
                vote.votes
                  .filter((v) => v.choice === "APPROVE")
                  .map((v) => v.seatNo)
                  .join(" "),
              "反对：" +
                vote.votes
                  .filter((v) => v.choice === "REJECT")
                  .map((v) => v.seatNo)
                  .join(" "),
            ],
            82 + tableHeight,
          );
        }
      },
    );
    const actionY = u.height - u.bottom - 130;
    if (g.phase === "TEAM_BUILDING")
      u.button.draw(
        "submit-team",
        p.team ? "确认任务队伍" : "等待队长选人",
        28,
        actionY,
        334,
        () =>
          this.action(() => this.app.api.team(g.gameId, this.selected.slice())),
        { disabled: !p.team || this.selected.length !== g.requiredTeamSize },
      );
    if (g.phase === "TEAM_VOTING") {
      u.button.draw(
        "approve",
        g.hasVoted ? "已投票" : "同意",
        20,
        actionY,
        170,
        () => this.action(() => this.app.api.vote(g.gameId, "APPROVE")),
        { disabled: !p.vote, color: theme.accent },
      );
      u.button.draw(
        "reject",
        "反对",
        200,
        actionY,
        170,
        () => this.action(() => this.app.api.vote(g.gameId, "REJECT")),
        { disabled: !p.vote, color: theme.evil },
      );
    }
    if (g.phase === "ASSASSINATION")
      u.button.draw(
        "assassinate",
        p.assassinate ? "确认刺杀目标" : "等待刺客行动",
        28,
        actionY,
        334,
        () =>
          this.app.confirm(
            "确认刺杀",
            "刺杀 " +
              r.players.find((x) => x.playerId === this.selected[0])?.nickname +
              "？确认后不可更改。",
            () =>
              this.action(() =>
                this.app.api.assassinate(g.gameId, this.selected[0]),
              ),
          ),
        {
          disabled: !p.assassinate || !this.selected.length,
          color: theme.evil,
        },
      );
    this.footer(u);
  }
  footer(u) {
    u.button.draw(
      "my-role",
      "我的身份",
      20,
      u.height - u.bottom - 68,
      108,
      () => this.privateRole(),
      { height: 36, size: 12, color: theme.soft },
    );
    u.button.draw(
      "log",
      "对局记录",
      141,
      u.height - u.bottom - 68,
      108,
      () => {
        this.showLogs = true;
        this.app.invalidate();
      },
      { height: 36, size: 12, color: theme.soft },
    );
    u.button.draw(
      "leave",
      "退出房间",
      262,
      u.height - u.bottom - 68,
      108,
      () => this.leave(),
      { height: 36, size: 12, color: theme.soft },
    );
    if (this.showLogs) {
      u.touch.reset();
      u.card.draw(0, 0, 390, u.height, theme.bg, null, 0);
      u.headerText("对局记录", "当前仅展示公开投票及任务汇总", () => {
        this.showLogs = false;
        this.app.invalidate();
      });
      const items = logs(this.timeline, this.room.players);
      this.renderLogs(u, items);
    }
    if (this.privateLady) {
      const result = this.privateLady;
      u.modal.draw({
        title: "湖中仙女 · 仅你可见",
        text:
          result.targetNickname +
          " 属于：" +
          result.alignment +
          "\n湖中仙女已传递给该玩家。",
        confirm: () => {
          this.privateLady = null;
          this.app.invalidate();
        },
      });
    }
  }
  renderLogs(u, items) {
    const heights = items.map(
      (item) =>
        62 +
        item.lines.reduce(
          (sum, line) => sum + Math.ceil(Math.max(1, line.length) / 25) * 20,
          0,
        ),
    );
    u.scroll(
      this.logScroll,
      u.content,
      u.height - u.bottom - u.content,
      heights.reduce((a, b) => a + b, 0) + 40,
      () => {
        let y = 0;
        if (!items.length)
          u.text.draw("暂时没有对局记录", 20, 20, 14, theme.muted);
        items.forEach((item, i) => {
          u.panel(item.title, item.lines, y);
          y += heights[i];
        });
      },
    );
  }
  mission(u, g, p) {
    u.scroll(
      this.scroll,
      u.content,
      u.height - u.bottom - 145 - u.content,
      480,
      () => {
        u.panel(
          g.onMission ? "你已被选入本轮任务" : "等待任务成员出票",
          [
            "本轮共 " + g.requiredTeamSize + " 名任务成员",
            g.hasSubmittedMission
              ? "你已提交，等待其他成员"
              : "任务卡只会公开最终数量",
          ],
          0,
        );
        u.panel(
          "你的身份：" + (this.role?.roleName || ""),
          [
            g.evil
              ? "邪恶阵营可以选择 SUCCESS 或 FAIL"
              : "正义阵营只能选择 SUCCESS",
          ],
          145,
          g.evil ? theme.evil : theme.good,
        );
        u.text.draw("请选择任务牌", 20, 264, 15, theme.text, true);
        [
          ["SUCCESS", "成功", theme.good],
          ["FAIL", "失败", theme.evil],
        ].forEach(([choice, label, color], i) =>
          u.button.draw(
            "choice-" + choice,
            choice + " · " + label,
            20 + i * 190,
            305,
            160,
            () => {
              this.missionChoice = choice;
              this.app.invalidate();
            },
            {
              disabled: choice === "FAIL" ? !p.fail : !p.success,
              color,
              border: this.missionChoice === choice ? theme.gold : null,
              textColor: choice === "SUCCESS" ? theme.bg : theme.text,
            },
          ),
        );
        u.panel(
          "你的选择不会公开给其他玩家",
          ["当前对局只展示最终 SUCCESS / FAIL 数量。"],
          395,
        );
      },
    );
    u.button.draw(
      "submit-mission",
      g.hasSubmittedMission ? "已提交" : "确认提交",
      28,
      u.height - u.bottom - 130,
      334,
      () =>
        this.action(() => this.app.api.mission(g.gameId, this.missionChoice)),
      {
        disabled:
          !p.success ||
          !this.missionChoice ||
          (this.missionChoice === "FAIL" && !p.fail),
      },
    );
    this.footer(u);
  }
  lady(u, g, r, p) {
    const eligible = r.players.filter((x) =>
      g.ladyEligibleTargetIds.includes(x.playerId),
    );
    u.scroll(
      this.scroll,
      u.content,
      u.height - u.bottom - 145 - u.content,
      Math.max(440, 190 + Math.ceil(eligible.length / 3) * 116),
      () => {
        u.panel(
          "当前持有者：" + g.ladyHolderNickname,
          [
            p.lady
              ? "选择一名从未持有过湖中仙女的玩家"
              : "等待持有者检查阵营，检查结果不会公开。",
          ],
          0,
        );
        eligible.forEach((player, i) =>
          u.seat.draw(
            player,
            30 + (i % 3) * 124,
            144 + Math.floor(i / 3) * 116,
            {
              selected: this.selected.includes(player.playerId),
              onTap: () => this.pick(player.playerId),
              disabled: !p.lady,
            },
          ),
        );
      },
    );
    u.button.draw(
      "lady",
      "检查阵营并传递湖中仙女",
      28,
      u.height - u.bottom - 130,
      334,
      () =>
        this.action(
          () => this.app.api.lady(g.gameId, this.selected[0]),
          (result) => {
            this.privateLady = {
              targetNickname: result.targetNickname,
              alignment: result.alignment,
            };
          },
        ),
      { disabled: !p.lady || !this.selected.length },
    );
    this.footer(u);
  }
  finished(u, g, r, p) {
    u.scroll(
      this.scroll,
      u.content,
      u.height - u.bottom - 195 - u.content,
      170 + (g.identities || []).length * 32,
      () => {
        u.panel(
          g.winner === "GOOD" ? "正义阵营获胜" : "邪恶阵营获胜",
          ["对局已结束 · 完整身份现已公开"],
          0,
          g.winner === "GOOD" ? theme.good : theme.evil,
        );
        u.card.draw(20, 140, 350, 24 + (g.identities || []).length * 32);
        (g.identities || []).forEach((player, i) => {
          u.text.draw(
            player.nickname,
            36,
            156 + i * 32,
            13,
            theme.text,
            false,
            150,
          );
          u.text.draw(
            player.roleName,
            202,
            156 + i * 32,
            13,
            player.alignment === "GOOD" ? theme.good : theme.evil,
            true,
            150,
          );
        });
      },
    );
    u.button.draw(
      "replay",
      "查看完整复盘",
      28,
      u.height - u.bottom - 184,
      334,
      () =>
        this.app.go("Replay", {
          gameId: g.gameId,
          back: "Game",
          roomId: r.roomId,
        }),
    );
    u.button.draw(
      "restart",
      p.restart ? "再来一局" : "等待房主再来一局",
      28,
      u.height - u.bottom - 124,
      334,
      () =>
        this.action(
          () => this.app.api.restart(g.gameId),
          (next) => this.app.go("RoleReveal", { roomId: next.roomId }),
        ),
      { disabled: !p.restart },
    );
    u.button.draw(
      "finish-leave",
      "退出房间",
      28,
      u.height - u.bottom - 64,
      334,
      () => this.leave(),
      { height: 36, color: theme.soft },
    );
  }
}
module.exports = GameScene;
