const BaseScene = require("./BaseScene");
const { sceneFor } = require("../utils/presentation");
class RoomScene extends BaseScene {
  enter() {
    this.roomId = this.params.roomId;
    this.room = this.params.room;
    this.game = this.params.game;
    this.role = this.params.role;
    this.timeline = this.params.timeline || {};
    this.resume();
  }
  resume() {
    this.refresh();
    clearInterval(this.poll);
    this.poll = setInterval(() => this.refresh(), 5000);
    this.app.socket.connect(() => this.refresh());
  }
  hide() {
    super.hide();
    clearInterval(this.poll);
    this.privateLady = null;
    this.role = null;
    this.game = null;
    this.timeline = {};
    this.selected = [];
    this.missionChoice = null;
    this.version = (this.version || 0) + 1;
  }
  show() {
    this.resume();
  }
  dispose() {
    super.dispose();
    clearInterval(this.poll);
    this.app.socket.close();
    this.privateLady = null;
    this.role = null;
    this.game = null;
    this.timeline = {};
    this.version = (this.version || 0) + 1;
  }
  async refresh() {
    if (!this.alive || !this.app.active) return;
    if (this.loading) {
      this.refreshAgain = true;
      return;
    }
    this.loading = true;
    const version = this.version || 0;
    try {
      const room = await this.app.api.room(this.roomId);
      const [game, role, timeline] = room.currentGameId
        ? await Promise.all([
            this.app.api.game(room.currentGameId),
            this.app.api.role(room.currentGameId),
            this.app.api.timeline(room.currentGameId),
          ])
        : [null, null, {}];
      if (!this.alive || !this.app.active || version !== (this.version || 0))
        return;
      const name = sceneFor(game);
      if (name !== this.app.scenes.name) {
        this.app.go(name, { roomId: room.roomId, room, game, role, timeline });
        return;
      }
      const key = game
        ? [game.gameId, game.phase, game.missionNo, game.proposalNo].join("-")
        : "";
      if (key !== this.stateKey) {
        this.selected = [];
        this.missionChoice = null;
        this.stateKey = key;
      }
      if (this.game?.gameId !== game?.gameId) this.privateLady = null;
      this.room = room;
      this.game = game;
      this.role = role;
      this.timeline = timeline;
      this.error = null;
      this.app.invalidate();
    } catch (e) {
      if (this.alive && version === (this.version || 0)) {
        this.error = e.message;
        this.app.invalidate();
      }
    } finally {
      this.loading = false;
      if (this.refreshAgain && this.alive) {
        this.refreshAgain = false;
        this.refresh();
      }
    }
  }
  action(work, success) {
    this.run(work, (result) => {
      success?.(result);
      if (this.alive) this.refresh();
    });
  }
  leave() {
    this.app.confirm(
      "退出房间",
      "确认退出当前房间？进行中的对局是否允许退出由服务端裁定。",
      () =>
        this.action(
          () => this.app.api.leave(this.roomId),
          () => this.app.go("Home"),
        ),
    );
  }
  chrome(u, title, sub) {
    u.headerText(title, sub, () => this.app.go("Home"));
    if (this.error)
      u.text.draw(this.error, 20, u.content - 18, 11, "#c95d68", false, 350);
  }
}
module.exports = RoomScene;
