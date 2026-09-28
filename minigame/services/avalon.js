module.exports = function createApi(request) {
  const get = (path) => request("/avalon" + path);
  const post = (path, data) => request("/avalon" + path, "POST", data);
  return {
    profile: () => get("/me/profile"),
    updateProfile: (nickname) =>
      request("/avalon/me/profile", "PUT", { nickname }),
    stats: () => get("/me/stats"),
    history: (page = 1, alignment = "") =>
      get(
        "/me/games?page=" +
          page +
          "&size=20&alignment=" +
          encodeURIComponent(alignment),
      ),
    currentRoom: () => get("/room/current"),
    room: (id) => get("/room/" + id),
    create: (maxPlayers) => post("/room/create", { maxPlayers }),
    join: (roomCode) => post("/room/join", { roomCode }),
    leave: (id) => post("/room/" + id + "/leave"),
    start: (id) => post("/game/start?roomId=" + id),
    game: (id) => get("/game/" + id),
    role: (id) => get("/game/" + id + "/my-role"),
    timeline: (id) => get("/game/" + id + "/timeline"),
    replay: (id) => get("/game/" + id + "/replay"),
    confirm: (id) => post("/game/" + id + "/role-confirm"),
    team: (id, playerIds) => post("/game/" + id + "/team", { playerIds }),
    vote: (id, choice) => post("/game/" + id + "/vote", { choice }),
    mission: (id, choice) => post("/game/" + id + "/mission", { choice }),
    lady: (id, targetPlayerId) =>
      post("/game/" + id + "/lady-of-lake", { targetPlayerId }),
    assassinate: (id, targetPlayerId) =>
      post("/game/" + id + "/assassinate", { targetPlayerId }),
    restart: (id) => post("/game/" + id + "/restart"),
  };
};
