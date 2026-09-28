const test = require("node:test"),
  assert = require("node:assert/strict");
const { getSeatLayout, viewport } = require("../utils/layout");
const { TouchManager } = require("../js/TouchManager");
const { InputController, parseRoomCode } = require("../js/InputController");
const ScrollView = require("../components/ScrollView");
const SceneManager = require("../js/SceneManager");
const Session = require("../services/session");
const Auth = require("../services/auth");
const createRequest = require("../services/request");
const createApi = require("../services/avalon");
const {
  permissions,
  sceneFor,
  logs,
  historyItem,
  rules,
} = require("../utils/presentation");
const fixture = require("./fixtures");
function platform() {
  const storage = {};
  return {
    getStorageSync: (k) => storage[k],
    setStorageSync: (k, v) => (storage[k] = v),
    removeStorageSync: (k) => delete storage[k],
  };
}
test("scene switch disposes old scene, closes keyboard, cancels touch", () => {
  const events = [];
  class S {
    enter() {
      events.push("enter");
    }
    dispose() {
      events.push("dispose");
    }
  }
  const app = {
    input: { close: () => events.push("keyboard") },
    touch: { cancel: () => events.push("touch") },
    invalidate: () => {},
  };
  const m = new SceneManager(app, { A: S, B: S });
  m.go("A");
  m.go("B");
  assert.deepEqual(events, [
    "keyboard",
    "touch",
    "enter",
    "dispose",
    "keyboard",
    "touch",
    "enter",
  ]);
  assert.throws(() => m.go("bad"));
});
for (const width of [375, 390, 430])
  for (let count = 5; count <= 10; count++)
    test(count + " seats stay in bounds and do not overlap at " + width, () => {
      const height = ((count >= 9 ? 470 : 420) * width) / 390;
      const seats = getSeatLayout(count, width, height);
      assert.equal(seats.length, count);
      for (const a of seats) {
        assert.ok(
          a.x >= 0 &&
            a.y >= 0 &&
            a.x + a.width <= width + 0.01 &&
            a.y + a.height <= height + 0.01,
        );
        for (const b of seats)
          if (a !== b)
            assert.ok(
              a.x + a.width <= b.x ||
                b.x + b.width <= a.x ||
                a.y + a.height <= b.y ||
                b.y + b.height <= a.y,
            );
      }
    });
test("viewport uses physical DPR and safe area in design units", () => {
  const v = viewport({
    screenWidth: 430,
    screenHeight: 932,
    pixelRatio: 3,
    statusBarHeight: 47,
    safeArea: { top: 59, bottom: 898 },
  });
  assert.equal(v.width * v.dpr, 1290);
  assert.equal(v.scale, 430 / 390);
  assert.equal(v.top, 59 / v.scale);
  assert.equal(v.bottom, 34 / v.scale);
});
test("topmost target only; disabled target cannot fall through", () => {
  const touch = new TouchManager();
  let result = 0;
  touch.add({
    id: "bottom",
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    onTap: () => result++,
  });
  touch.add({
    id: "top",
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    onTap: () => (result += 10),
  });
  touch.start(10, 10);
  assert.equal(touch.pressed, "top");
  touch.end(10, 10);
  assert.equal(result, 10);
  touch.regions[1].disabled = true;
  touch.start(10, 10);
  touch.end(10, 10);
  assert.equal(result, 10);
});
test("drag suppresses tap, clips scroll bounds and ignores second finger", () => {
  const t = new TouchManager(),
    s = new ScrollView();
  s.setBounds(400, 100);
  let tapped = false;
  t.add({
    id: "button",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    onTap: () => (tapped = true),
  });
  t.scrolls = [{ x: 0, y: 0, width: 100, height: 100, scroll: s }];
  t.start(20, 80, 1);
  t.start(20, 80, 2);
  t.move(20, 30, 2);
  assert.equal(s.offset, 0);
  t.move(20, 30, 1);
  t.end(20, 30, 1);
  assert.equal(s.offset, 50);
  assert.equal(tapped, false);
  s.drag(-999);
  assert.equal(s.offset, 300);
  s.drag(999);
  assert.equal(s.offset, 0);
  s.setBounds(20, 100);
  assert.equal(s.offset, 0);
});
test("room code removes nondigits and caps six including leading zero", () => {
  assert.equal(parseRoomCode("a01 234567xyz"), "012345");
  assert.equal(parseRoomCode(null), "");
});
test("keyboard callbacks unregister on confirm and navigation", () => {
  const callbacks = {};
  let value = "",
    confirmed = "",
    removed = 0;
  const wx = {
    onKeyboardInput: (f) => (callbacks.input = f),
    onKeyboardConfirm: (f) => (callbacks.confirm = f),
    offKeyboardInput: () => removed++,
    offKeyboardConfirm: () => removed++,
    showKeyboard: (o) => assert.equal(o.maxLength, 6),
    hideKeyboard: () => {},
    updateKeyboard: () => {},
  };
  const input = new InputController(wx);
  input.open({
    digits: true,
    onChange: (v) => (value = v),
    onConfirm: (v) => (confirmed = v),
  });
  callbacks.input({ value: "abc1234567" });
  assert.equal(value, "123456");
  callbacks.confirm({ value: "234567" });
  assert.equal(confirmed, "234567");
  assert.equal(removed, 2);
});
test("JWT storage is isolated per client, environment and endpoint", () => {
  const wx = platform(),
    a = new Session(wx, { environment: "local", api: "one" }),
    b = new Session(wx, { environment: "test", api: "one" });
  a.set("synthetic-test-token");
  assert.equal(b.get(), "");
  assert.equal(a.get(), "synthetic-test-token");
  a.clear();
  assert.equal(a.get(), "");
  assert.throws(() => a.set(""));
});
test("request maps API, bearer and business error; 401 clears session", async () => {
  const wx = platform(),
    s = new Session(wx, { environment: "local", api: "one" });
  s.set("synthetic");
  let received,
    unauthorized = 0;
  wx.request = (o) => {
    received = o;
    o.success({ statusCode: 200, data: { code: "SUCCESS", data: 7 } });
  };
  const r = createRequest(
    wx,
    { api: "http://local/api" },
    s,
    () => unauthorized++,
  );
  assert.equal(await r("/avalon/me/profile"), 7);
  assert.equal(received.url, "http://local/api/avalon/me/profile");
  assert.equal(received.header.Authorization, "Bearer synthetic");
  wx.request = (o) =>
    o.success({
      statusCode: 401,
      data: { code: "UNAUTHORIZED", message: "expired" },
    });
  await assert.rejects(r("/x"), /expired/);
  assert.equal(unauthorized, 1);
  assert.equal(s.get(), "");
});
test("all API command mappings retain existing backend contract", async () => {
  const calls = [];
  const a = createApi((...args) => {
    calls.push(args);
    return Promise.resolve();
  });
  await a.create(10);
  await a.join("012345");
  await a.vote(9, "REJECT");
  await a.mission(9, "FAIL");
  await a.lady(9, 2);
  await a.assassinate(9, 3);
  await a.updateProfile("测试");
  await a.history(2, "GOOD");
  await a.team(9, [1, 2]);
  await a.start(101);
  await a.restart(9);
  assert.deepEqual(calls[0], [
    "/avalon/room/create",
    "POST",
    { maxPlayers: 10 },
  ]);
  assert.deepEqual(calls[1][2], { roomCode: "012345" });
  assert.equal(calls[2][0], "/avalon/game/9/vote");
  assert.deepEqual(calls[3][2], { choice: "FAIL" });
  assert.equal(calls[4][0], "/avalon/game/9/lady-of-lake");
  assert.deepEqual(calls[5][2], { targetPlayerId: 3 });
  assert.equal(calls[6][1], "PUT");
  assert.match(calls[7][0], /page=2&size=20&alignment=GOOD/);
  assert.deepEqual(calls[8][2], { playerIds: [1, 2] });
  assert.equal(calls[9][0], "/avalon/game/start?roomId=101");
  assert.equal(calls[10][0], "/avalon/game/9/restart");
});
test("local retains ten mocks and never calls wx.login", async () => {
  for (let i = 1; i <= 10; i++) {
    const wx = platform(),
      s = new Session(wx, { environment: "local", api: "local" });
    wx.login = () => assert.fail();
    const auth = new Auth(
      wx,
      { environment: "local", mock: true },
      s,
      async (path, method, data) => {
        assert.equal(data.mockOpenid, "avalon_mock_" + i);
        return { token: "synthetic" };
      },
    );
    await auth.login(i);
    assert.equal(s.get(), "synthetic");
  }
});
test("test login uses wx code even when mock flag set; prod game login guarded", async () => {
  const wx = platform();
  wx.login = (o) => o.success({ code: "synthetic-code" });
  const s = new Session(wx, { environment: "test", api: "test" });
  let data;
  const auth = new Auth(
    wx,
    { environment: "test", mock: true },
    s,
    async (p, m, d) => {
      data = d;
      return { token: "synthetic" };
    },
  );
  await auth.login();
  assert.deepEqual(data, { code: "synthetic-code" });
  auth.config.environment = "prod";
  await assert.rejects(auth.login(), /生产登录尚未启用/);
});
test("logout during in-flight login cannot restore token", async () => {
  const wx = platform(),
    s = new Session(wx, { environment: "local", api: "local" });
  let finish;
  const auth = new Auth(
    wx,
    { environment: "local", mock: true },
    s,
    () => new Promise((r) => (finish = r)),
  );
  const result = auth.login();
  await Promise.resolve();
  auth.logout();
  finish({ token: "stale" });
  await assert.rejects(result, /登录已取消/);
  assert.equal(s.get(), "");
});
test("phase chooses correct scene", () => {
  assert.equal(sceneFor(null), "Lobby");
  assert.equal(sceneFor({ phase: "ROLE_CONFIRM" }), "RoleReveal");
  for (const phase of [
    "TEAM_BUILDING",
    "TEAM_VOTING",
    "MISSION_EXECUTING",
    "LADY_OF_LAKE",
    "ASSASSINATION",
    "FINISHED",
  ])
    assert.equal(sceneFor({ phase }), "Game");
});
test("mission permissions enforce GOOD, nonmember and duplicate restrictions", () => {
  const { game, room } = fixture(8, "MISSION_EXECUTING");
  game.evil = false;
  assert.equal(permissions(game, room).success, true);
  assert.equal(permissions(game, room).fail, false);
  game.evil = true;
  assert.equal(permissions(game, room).fail, true);
  game.hasSubmittedMission = true;
  assert.equal(permissions(game, room).success, false);
  game.hasSubmittedMission = false;
  game.onMission = false;
  assert.equal(permissions(game, room).fail, false);
});
test("team, vote, lady, assassin and FINISHED permissions", () => {
  const { game, room } = fixture();
  assert.equal(permissions(game, room).team, true);
  room.myPlayerId = 2;
  assert.equal(permissions(game, room).team, false);
  game.phase = "TEAM_VOTING";
  assert.equal(permissions(game, room).vote, true);
  game.hasVoted = true;
  assert.equal(permissions(game, room).vote, false);
  game.phase = "LADY_OF_LAKE";
  assert.equal(permissions(game, room).lady, false);
  game.ladyHolder = true;
  assert.equal(permissions(game, room).lady, true);
  game.phase = "FINISHED";
  const p = permissions(game, room);
  for (const key of [
    "team",
    "vote",
    "success",
    "fail",
    "lady",
    "assassinate",
    "confirm",
  ])
    assert.equal(p[key], false);
  assert.equal(p.restart, true);
});
test("public timeline whitelist drops injected identities, actions and Lady secrets", () => {
  const f = fixture();
  const data = {
    ...f.replay,
    secret: "PRIVATE",
    proposals: f.replay.proposals.map((p) => ({
      ...p,
      identities: f.replay.players,
      failActor: "PRIVATE",
    })),
  };
  const publicText = JSON.stringify(logs(data, f.room.players));
  assert.ok(!publicText.includes("PRIVATE"));
  assert.ok(!publicText.includes("刺客"));
  assert.ok(!publicText.includes("湖中仙女"));
  assert.ok(!publicText.includes("→"));
  const privateText = JSON.stringify(logs(data, f.replay.players, true));
  assert.ok(privateText.includes("刺客"));
  assert.ok(privateText.includes("→"));
  assert.ok(privateText.includes("湖中仙女"));
});
test("history projection and 5–10 rule previews", () => {
  for (let n = 5; n <= 10; n++) {
    const r = rules(n);
    assert.equal(r.good + r.evil, n);
    assert.equal(r.lady, n === 10);
    assert.equal(r.fourth, n >= 7 ? 2 : 1);
  }
  assert.ok(rules(8).evilRoles.includes("爪牙"));
  assert.ok(!rules(8).evilRoles.includes("奥伯伦"));
  const item = historyItem(fixture().history[0]);
  assert.equal(item.result, "正义胜利");
  assert.equal(item.date, "2026-09-28 16:00");
});
