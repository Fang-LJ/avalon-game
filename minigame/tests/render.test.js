const test = require("node:test"),
  assert = require("node:assert/strict");
const { UI } = require("../components/UI");
const { TouchManager } = require("../js/TouchManager");
const { viewport } = require("../utils/layout");
const scenes = require("../scenes");
const fixture = require("./fixtures");
function setup(name, phase, count = 8, width = 390) {
  const f = fixture(count, phase);
  const texts = [];
  const ctx = new Proxy(
    {
      measureText: (s) => ({ width: Array.from(String(s)).length * 7 }),
      fillText: (s) => texts.push(String(s)),
    },
    {
      get: (o, k) => (k in o ? o[k] : () => {}),
      set: (o, k, v) => ((o[k] = v), true),
    },
  );
  const app = {
    config: { environment: "local", mock: true },
    touch: new TouchManager(),
    api: {},
    input: { close: () => {} },
    invalidate: () => {},
    go: () => {},
    info: () => {},
    confirm: () => {},
    active: true,
  };
  const u = new UI(app, ctx, app.touch);
  u.begin(
    viewport({
      screenWidth: width,
      screenHeight: (844 * width) / 390,
      pixelRatio: 3,
      safeArea: { top: 44, bottom: (810 * width) / 390 },
      statusBarHeight: 44,
    }),
  );
  const scene = new scenes[name](app, {});
  Object.assign(scene, f, {
    roomId: 101,
    selected: [],
    stateKey: "",
    items: [],
    stats: f.stats,
    profile: f.profile,
  });
  if (name === "Replay") {
    scene.data = f.replay;
    scene.items = require("../utils/presentation").logs(
      f.replay,
      f.replay.players,
      true,
    );
  }
  if (name === "History")
    scene.items = f.history.map(require("../utils/presentation").historyItem);
  scene.render(u);
  return { scene, app, u, texts };
}
for (const width of [375, 390, 430])
  for (const [name, phase] of [
    ["Login"],
    ["Home"],
    ["CreateRoom"],
    ["JoinRoom"],
    ["Lobby"],
    ["RoleReveal", "ROLE_CONFIRM"],
    ["Game", "TEAM_BUILDING"],
    ["Game", "TEAM_VOTING"],
    ["Game", "MISSION_EXECUTING"],
    ["Game", "LADY_OF_LAKE"],
    ["Game", "ASSASSINATION"],
    ["Game", "FINISHED"],
    ["History"],
    ["Replay"],
    ["Me"],
  ])
    test(name + " " + (phase || "") + " renders at " + width, () => {
      const { app, texts } = setup(name, phase, 10, width);
      assert.ok(texts.length > 0);
      for (const r of app.touch.regions) {
        assert.ok(Number.isFinite(r.x) && Number.isFinite(r.y));
        assert.ok(r.height > 0 && r.width > 0);
      }
    });
test("live game does not render roles of other players or secret mission choices", () => {
  const { texts } = setup("Game", "TEAM_BUILDING");
  assert.ok(!texts.join(" ").includes("莫甘娜"));
  assert.ok(!texts.join(" ").includes("派西维尔"));
});
test("mission remains two-step and good cannot hit FAIL", () => {
  const { scene, app, u } = setup("Game", "MISSION_EXECUTING");
  scene.game.evil = false;
  app.touch.reset();
  scene.render(u);
  assert.equal(
    app.touch.regions.find((r) => r.id === "choice-FAIL").disabled,
    true,
  );
  assert.equal(
    app.touch.regions.find((r) => r.id === "submit-mission").disabled,
    true,
  );
  app.touch.regions.find((r) => r.id === "choice-SUCCESS").onTap();
  assert.equal(scene.missionChoice, "SUCCESS");
});
test("offscreen rows have no hit region and log supports scroll", () => {
  const { app } = setup("History");
  assert.ok(
    app.touch.regions.filter((r) => r.id.startsWith("history-")).length < 25,
  );
  const { scene, u } = setup("Game", "TEAM_BUILDING");
  scene.showLogs = true;
  scene.render(u);
  assert.ok(scene.logScroll.contentHeight > scene.logScroll.height);
});
test("hide and dispose remove private role, Lady and replay state", () => {
  const { scene } = setup("Game", "LADY_OF_LAKE");
  scene.privateLady = { alignment: "EVIL" };
  scene.hide();
  assert.equal(scene.privateLady, null);
  assert.equal(scene.role, null);
  assert.equal(scene.game, null);
  const replay = setup("Replay").scene;
  replay.hide();
  assert.equal(replay.data, null);
});
