const { request } = require('../utils/request');
module.exports = {
  profile: () => request({ url: '/api/avalon/me/profile' }),
  updateProfile: (data) =>
    request({
      url: '/api/avalon/me/profile',
      method: 'PUT',
      data,
    }),
  history: (page = 1, size = 10, alignment = '') =>
    request({
      url: `/api/avalon/me/games?page=${page}&size=${size}&alignment=${alignment}`,
    }),
  stats: () => request({ url: '/api/avalon/me/stats' }),
  timeline: (id) => request({ url: `/api/avalon/game/${id}/timeline` }),
  replay: (id) => request({ url: `/api/avalon/game/${id}/replay` }),
  currentRoom: () => request({ url: '/api/avalon/room/current' }),
  room: (id, showError = true) => request({ url: `/api/avalon/room/${id}`, showError }),
  createRoom: (data) =>
    request({ url: '/api/avalon/room/create', method: 'POST', data }),
  joinRoom: (data) =>
    request({ url: '/api/avalon/room/join', method: 'POST', data }),
  leaveRoom: (id) =>
    request({ url: `/api/avalon/room/${id}/leave`, method: 'POST' }),
  seat: (id, seatNo) =>
    request({
      url: `/api/avalon/room/${id}/seat`,
      method: 'POST',
      data: { seatNo },
    }),
  stand: (id) =>
    request({ url: `/api/avalon/room/${id}/stand`, method: 'POST' }),
  addBot: (id) =>
    request({ url: `/api/avalon/room/${id}/bots`, method: 'POST' }),
  removeBot: (id, playerId) =>
    request({ url: `/api/avalon/room/${id}/bots/${playerId}`, method: 'DELETE' }),
  endGame: (id) =>
    request({ url: `/api/avalon/game/${id}/end`, method: 'POST' }),
  start: (roomId) =>
    request({ url: `/api/avalon/game/start?roomId=${roomId}`, method: 'POST' }),
  game: (id) => request({ url: `/api/avalon/game/${id}` }),
  myRole: (id) => request({ url: `/api/avalon/game/${id}/my-role` }),
  confirmRole: (id) =>
    request({ url: `/api/avalon/game/${id}/role-confirm`, method: 'POST' }),
  submitTeam: (id, playerIds) =>
    request({
      url: `/api/avalon/game/${id}/team`,
      method: 'POST',
      data: { playerIds },
    }),
  vote: (id, choice) =>
    request({
      url: `/api/avalon/game/${id}/vote`,
      method: 'POST',
      data: { choice },
    }),
  mission: (id, choice) =>
    request({
      url: `/api/avalon/game/${id}/mission`,
      method: 'POST',
      data: { choice },
    }),
  inspectLady: (id, targetPlayerId) =>
    request({
      url: `/api/avalon/game/${id}/lady-of-lake`,
      method: 'POST',
      data: { targetPlayerId },
    }),
  startAssassination: (id) =>
    request({ url: `/api/avalon/game/${id}/assassination/start`, method: 'POST' }),
  selectAssassinationTarget: (id, targetPlayerId) =>
    request({ url: `/api/avalon/game/${id}/assassination/target`, method: 'POST', data: { targetPlayerId } }),
  assassinate: (id, targetPlayerId) =>
    request({
      url: `/api/avalon/game/${id}/assassinate`,
      method: 'POST',
      data: { targetPlayerId },
    }),
  restart: (id) =>
    request({ url: `/api/avalon/game/${id}/restart`, method: 'POST' }),
};
