// Explicitly launched, loopback-only UI fixture. NOT the game backend and NOT
// game-rule verification. Never connects to MySQL, Redis, WeChat or production.
const http = require("node:http"),
  crypto = require("node:crypto");
const fixture = require("../tests/fixtures");
let data = fixture(),
  current = false,
  started = false;
const sockets = new Set();
const counts = { requests: 0, websocket: 0, commands: [] };
function event() {
  for (const socket of sockets) {
    const text = Buffer.from('{"type":"STATE_CHANGED"}');
    socket.write(Buffer.concat([Buffer.from([129, text.length]), text]));
  }
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  let raw = "";
  req.on("data", (b) => (raw += b));
  req.on("end", () => {
    let body = {};
    try {
      body = JSON.parse(raw || "{}");
    } catch (_) {}
    if (url.pathname === "/__qa/status") {
      res.end(
        JSON.stringify({
          ...counts,
          phase: started ? data.game.phase : "WAITING",
        }),
      );
      return;
    }
    if (url.pathname === "/__qa/phase") {
      const count = Number(url.searchParams.get("count") || 8);
      data = fixture(count, url.searchParams.get("phase") || "TEAM_BUILDING");
      started = true;
      current = true;
      event();
      res.end("ok");
      return;
    }
    counts.requests++;
    const p = url.pathname;
    let result;
    if (p.endsWith("/wx-login"))
      result = { token: "synthetic-ui-fixture-token-not-jwt" };
    else if (p.endsWith("/me/profile")) {
      if (req.method === "PUT") data.profile.nickname = body.nickname;
      result = data.profile;
    } else if (p.endsWith("/me/stats")) result = data.stats;
    else if (p.endsWith("/me/games")) {
      const page = Number(url.searchParams.get("page") || 1);
      result = {
        items: data.history.slice((page - 1) * 20, page * 20),
        total: data.history.length,
        page,
        size: 20,
      };
    } else if (p.endsWith("/room/current")) result = current ? data.room : null;
    else if (p.endsWith("/room/create") || p.endsWith("/room/join")) {
      data = fixture(body.maxPlayers || 8);
      current = true;
      started = false;
      result = { ...data.room, currentGameId: null, status: "WAITING" };
      counts.commands.push(p.endsWith("create") ? "create" : "join");
    } else if (p.endsWith("/leave")) {
      current = false;
      started = false;
      result = {};
      counts.commands.push("leave");
    } else if (p.match(/\/room\/\d+$/))
      result = {
        ...data.room,
        currentGameId: started ? 101 : null,
        status: started ? "PLAYING" : "WAITING",
      };
    else if (p.endsWith("/start") || p.endsWith("/restart")) {
      started = true;
      data.game.phase = "ROLE_CONFIRM";
      result = data.game;
      counts.commands.push("start");
    } else if (p.endsWith("/my-role")) result = data.role;
    else if (p.endsWith("/timeline")) result = data.timeline;
    else if (p.endsWith("/replay")) result = data.replay;
    else if (p.match(/\/game\/\d+$/)) result = data.game;
    else if (req.method === "POST") {
      const command = p.split("/").pop();
      counts.commands.push(command);
      if (command === "role-confirm") {
        data.role.confirmed = true;
        data.game.phase = "TEAM_BUILDING";
      }
      if (command === "team") {
        data.game.selectedPlayerIds = body.playerIds;
        data.game.phase = "TEAM_VOTING";
      }
      if (command === "vote") {
        data.game.hasVoted = true;
        data.game.phase = "MISSION_EXECUTING";
      }
      if (command === "mission") {
        data.game.hasSubmittedMission = true;
        data.game.phase = "LADY_OF_LAKE";
        data.game.ladyHolder = true;
      }
      if (command === "lady-of-lake") {
        data.game.phase = "ASSASSINATION";
        result = {
          targetNickname: data.room.players.find(
            (p) => p.playerId === body.targetPlayerId,
          )?.nickname,
          alignment: "EVIL",
        };
      }
      if (command === "assassinate") {
        data = fixture(8, "FINISHED");
      }
      result = result || data.game;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ code: "SUCCESS", data: result }));
    if (req.method === "POST") event();
  });
});
server.on("upgrade", (req, socket) => {
  if (req.url !== "/ws/avalon") {
    socket.destroy();
    return;
  }
  const accept = crypto
    .createHash("sha1")
    .update(
      req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
    )
    .digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " +
      accept +
      "\r\n\r\n",
  );
  sockets.add(socket);
  counts.websocket++;
  socket.on("error", () => sockets.delete(socket));
  socket.on("close", () => sockets.delete(socket));
  socket.on("data", (b) => {
    if ((b[0] & 15) === 8) socket.end();
  });
});
server.listen(8081, "127.0.0.1", () =>
  console.log(
    "Synthetic UI fixture listening on loopback 8081; no real auth or database.",
  ),
);
