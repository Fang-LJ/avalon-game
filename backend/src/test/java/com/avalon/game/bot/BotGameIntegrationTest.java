package com.avalon.game.bot;

import com.avalon.game.common.BusinessException;
import com.avalon.game.game.*;
import com.avalon.game.game.AvalonRepository.*;
import com.avalon.game.game.GameTypes.*;
import com.avalon.game.me.MeService;
import com.avalon.game.realtime.RoomEventPublisher;
import com.avalon.game.room.RoomService;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Bean;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

/** Real JDBC + Spring transactions, isolated in-memory DB; never connects to production. */
class BotGameIntegrationTest {
    AnnotationConfigApplicationContext context;
    AvalonRepository repository;
    RoomService rooms;
    GameService games;
    BotTurnService bots;
    JdbcTemplate jdbc;
    long host;
    long outsider;
    @BeforeEach void setup() throws Exception {
        context = new AnnotationConfigApplicationContext(Config.class);
        jdbc = context.getBean(JdbcTemplate.class);
        repository = context.getBean(AvalonRepository.class);
        rooms = context.getBean(RoomService.class);
        games = context.getBean(GameService.class);
        bots = context.getBean(BotTurnService.class);
        // Only adapt MySQL-specific syntax for H2. The tracked schema itself is not changed.
        String sql = Files.readString(Path.of("../docs/sql/001_avalon_init.sql"))
                .replaceAll("ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", "")
                .replace("TINYINT(1)", "TINYINT").replace(" JSON ", " VARCHAR(2048) ");
        var alter = java.util.regex.Pattern.compile("(?s)ALTER TABLE t_avalon_game\\s+(.*?);").matcher(sql);
        if (alter.find()) {
            String replacement = Arrays.stream(alter.group(1).split(",\\s*ADD "))
                    .map(clause -> "ALTER TABLE t_avalon_game " + (clause.startsWith("ADD ") ? clause : "ADD " + clause) + ";")
                    .collect(java.util.stream.Collectors.joining("\n"));
            sql = alter.replaceFirst(java.util.regex.Matcher.quoteReplacement(replacement));
        }
        try (var connection = context.getBean(DataSource.class).getConnection()) {
            ScriptUtils.executeSqlScript(connection, new ByteArrayResource(sql.getBytes(StandardCharsets.UTF_8)));
        }
        host = repository.insertUser("WECHAT", "host", "真人房主");
        outsider = repository.insertUser("WECHAT", "outsider", "房外用户");
    }
    @AfterEach void close() {
        if (jdbc != null) jdbc.execute("shutdown");
        if (context != null) context.close();
    }
    long lobby(int count) {
        long id = rooms.create(host, count, null).roomId();
        for (int n = 1; n < count; n++) rooms.addBot(host, id);
        return id;
    }
    @Test void hostCanAddAndRemoveBotsAndSeatsFillTheSmallestGap() throws Exception {
        long id = rooms.create(host, 5, null).roomId();
        var first = rooms.addBot(host, id).players().stream().filter(RoomService.PlayerView::isBot).findFirst().orElseThrow();
        rooms.stand(host, id);
        var view = rooms.addBot(host, id);
        assertEquals(1, view.players().stream().filter(p -> p.isBot() && p.playerId() != first.playerId()).findFirst().orElseThrow().seatNo());
        long botUser = repository.gamePlayer(id, first.playerId()).orElseThrow().userId();
        rooms.removeBot(host, id, first.playerId());
        assertTrue(repository.user(botUser).isEmpty());
        assertEquals(2, rooms.get(host, id).currentPlayers());
        String json = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(view);
        assertTrue(json.contains("\"isBot\":true"));
        assertTrue(json.contains("\"testGame\":true"));
        assertFalse(json.contains("roleCode")); assertFalse(json.contains("alignment"));
    }
    @Test void onlyHostMayManageBotsAndHumansCannotBeRemovedAsBots() {
        long id = rooms.create(host, 5, null).roomId();
        var human = rooms.join(outsider, rooms.get(host,id).roomCode(), null);
        assertEquals("FORBIDDEN", assertThrows(BusinessException.class, () -> rooms.addBot(outsider,id)).getCode());
        assertThrows(BusinessException.class, () -> rooms.removeBot(host,id,human.myPlayerId()));
        assertThrows(BusinessException.class, () -> rooms.removeBot(outsider,id,human.myPlayerId()));
        assertEquals(2, rooms.get(host,id).currentPlayers());
    }
    @Test void fullRoomAndStartedGameRejectBotManagement() {
        long id = lobby(5);
        assertThrows(BusinessException.class, () -> rooms.addBot(host,id));
        long bot = rooms.get(host,id).players().stream().filter(RoomService.PlayerView::isBot).findFirst().orElseThrow().playerId();
        games.start(host,id);
        assertThrows(BusinessException.class, () -> rooms.addBot(host,id));
        assertThrows(BusinessException.class, () -> rooms.removeBot(host,id,bot));
    }
    @ParameterizedTest @ValueSource(ints = {5,6,7,8,9,10})
    void humanAndBotsCanCompleteEverySupportedGameSize(int count) {
        long id = lobby(count);
        games.start(host,id);
        playToFinish(id);
        GameRow finished = repository.game(id,false).orElseThrow();
        assertEquals("FINISHED", finished.status());
        assertNotNull(finished.winner());
        assertTrue(repository.players(id).stream().allMatch(GamePlayerRow::confirmed));
        assertEquals(0, context.getBean(MeService.class).stats(host).totalGames());
        assertEquals(0, context.getBean(MeService.class).games(host,1,10,null).total());
        assertThrows(BusinessException.class, () -> context.getBean(GameHistoryService.class).replay(host,id));
        assertTrue(jdbc.queryForObject("select count(*) from t_avalon_proposal where game_id=?", Integer.class,id) > 0);
        // Rematch retains identities as account records and seats, not previous game records.
        Set<Long> botUsers = repository.botUserIds(id);
        var next = games.restart(host,id);
        assertEquals("WAITING", next.status()); assertNull(next.currentGameId());
        assertTrue(repository.game(id,false).isEmpty());
        assertEquals(botUsers,repository.botUserIds(next.roomId()));
        assertTrue(repository.players(next.roomId()).stream().allMatch(p -> p.role()==null && !p.confirmed()));
        assertEquals(0,jdbc.queryForObject("select count(*) from t_avalon_vote",Integer.class));
        assertEquals(0,jdbc.queryForObject("select count(*) from t_avalon_mission_action",Integer.class));
    }
    void playToFinish(long id) {
        BotStrategy humanStrategy = new BotStrategy(new Random(301));
        for (int tick = 0; tick < 1000; tick++) {
            GameRow game = repository.game(id,false).orElseThrow();
            if (game.phase() == Phase.FINISHED) return;
            GamePlayerRow me = repository.player(id,host).orElseThrow();
            List<GamePlayerRow> players = repository.players(id);
            switch (game.phase()) {
                case ROLE_CONFIRM -> { if (!me.confirmed()) games.confirmRole(host,id); }
                case TEAM_BUILDING -> {
                    if (game.leaderGamePlayerId()==me.id()) games.submitTeam(host,id,humanStrategy.team(me.id(),
                            players.stream().map(GamePlayerRow::id).toList(),GameRuleConfig.forPlayers(players.size()).teamSize(game.missionNo())));
                }
                case TEAM_VOTING -> {
                    var proposal=repository.currentProposal(id,game.missionNo(),game.proposalNo()).orElseThrow();
                    if (!repository.hasVote(proposal.id(),me.id())) games.vote(host,id,VoteChoice.APPROVE);
                }
                case MISSION_EXECUTING -> {
                    var proposal=repository.currentProposal(id,game.missionNo(),game.proposalNo()).orElseThrow();
                    var mission=repository.currentMission(id,game.missionNo()).orElseThrow();
                    if (proposal.teamPlayerIds().contains(me.id()) && !repository.hasAction(mission.id(),me.id())) games.mission(host,id,MissionChoice.SUCCESS);
                }
                case LADY_OF_LAKE -> {
                    if (game.ladyHolderGamePlayerId()==me.id()) games.inspectWithLady(host,id,players.stream()
                            .filter(p -> p.id()!=me.id() && !repository.ladyHolderHistory(id).contains(p.id())).findFirst().orElseThrow().id());
                }
                case ASSASSINATION -> {
                    if (me.role()==Role.ASSASSIN) games.assassinate(host,id,players.stream().filter(p -> p.alignment()==Alignment.GOOD).findFirst().orElseThrow().id());
                }
                default -> fail("Unexpected phase " + game.phase());
            }
            bots.act(id);
        }
        fail("Game stalled");
    }
    @Test void lastHumanLeavingWaitingBotRoomClosesAndPurgesOnlyThatRoom() {
        long id = lobby(5);
        rooms.leave(host,id);
        assertTrue(repository.game(id,false).isEmpty());
        assertEquals(0,jdbc.queryForObject("select count(*) from t_avalon_user where provider='BOT'",Integer.class));
        assertTrue(repository.user(host).isPresent()); assertTrue(repository.user(outsider).isPresent());
    }
    @Test void botCannotBecomeOwnerWhenHostLeaves() {
        long id=rooms.create(host,5,null).roomId();
        rooms.addBot(host,id);
        rooms.join(outsider,rooms.get(host,id).roomCode(),null);
        rooms.leave(host,id);
        assertEquals(outsider,repository.game(id,false).orElseThrow().ownerUserId());
    }
    @Test void hostEndingRunningBotGameDeletesAllTransientDataAndStopsTicks() {
        long id=lobby(5);
        games.start(host,id);
        for (int i=0;i<4;i++) {
            if (!repository.player(id,host).orElseThrow().confirmed()) games.confirmRole(host,id);
            bots.act(id);
        }
        var players=repository.players(id);
        var leader=repository.gamePlayerById(repository.game(id,false).orElseThrow().leaderGamePlayerId()).orElseThrow();
        games.submitTeam(leader.userId(),id,List.of(players.get(0).id(),players.get(1).id()));
        games.vote(host,id,VoteChoice.APPROVE);
        bots.act(id);
        assertThrows(BusinessException.class,()->games.end(outsider,id));
        games.end(host,id);
        assertTrue(repository.game(id,false).isEmpty());
        assertEquals(0,jdbc.queryForObject("select count(*) from t_avalon_vote",Integer.class));
        assertEquals(0,jdbc.queryForObject("select count(*) from t_avalon_proposal",Integer.class));
        bots.act(id); // Stale tick must not resurrect a deleted game.
        assertEquals(0,jdbc.queryForObject("select count(*) from t_avalon_user where provider='BOT'",Integer.class));
    }
    @Test void expiredFinishedTestGameIsPurgedWithoutTouchingHumanOnlyGame() {
        long id=lobby(5); games.start(host,id); playToFinish(id);
        long humanGame=repository.insertWaitingGame("987654",outsider,5);
        repository.finish(humanGame,Winner.GOOD,"ASSASSINATION_MISSED",null);
        bots.cleanUp(id); assertTrue(repository.game(id,false).isPresent());
        jdbc.update("update t_avalon_game set finished_at=? where id=?",java.time.LocalDateTime.now().minusMinutes(10),id);
        bots.cleanUp(id);
        assertTrue(repository.game(id,false).isEmpty());
        assertTrue(repository.game(humanGame,false).isPresent());
        assertTrue(repository.user(outsider).isPresent());
    }
    @Test void cleanupGuardNeverDeletesRunningOrHumanOnlyGames() {
        long id=lobby(5); games.start(host,id);
        repository.deleteBotTestGame(id);
        assertTrue(repository.game(id,false).isPresent());
        long humanGame=repository.insertWaitingGame("987654",outsider,5);
        repository.closeGame(humanGame); repository.deleteBotTestGame(humanGame);
        assertTrue(repository.game(humanGame,false).isPresent());
    }
    @ParameterizedTest @ValueSource(strings={"ROLE_CONFIRM","TEAM_BUILDING","TEAM_VOTING","MISSION_EXECUTING","LADY_OF_LAKE","ASSASSINATION","MISSION_RESULT"})
    void hostCanEndHumanOnlyGameInAnyPhaseWithoutInventingWinner(String phase) {
        long id=rooms.create(host,5,null).roomId();
        for (int i=0;i<4;i++) {
            long user=repository.insertUser("WECHAT","friend"+i,"朋友"+i);
            rooms.join(user,rooms.get(host,id).roomCode(),null);
        }
        games.start(host,id);
        repository.setPhase(id,Phase.valueOf(phase));
        long member=repository.players(id).stream().filter(p->p.userId()!=host).findFirst().orElseThrow().userId();
        assertThrows(BusinessException.class,()->games.end(member,id));
        assertThrows(BusinessException.class,()->games.end(outsider,id));
        assertFalse(games.end(host,id).closed());
        GameRow game=repository.game(id,false).orElseThrow();
        assertEquals(Phase.FINISHED,game.phase()); assertNull(game.winner());
        assertEquals("HOST_ENDED",game.finishReason());
        assertEquals(5,repository.gamePlayers(id).size());
        assertEquals(0,context.getBean(MeService.class).stats(host).totalGames());
        var history=context.getBean(MeService.class).games(host,1,10,null);
        assertEquals(1,history.total()); assertNull(history.items().getFirst().winner());
        assertEquals("HOST_ENDED",context.getBean(GameHistoryService.class).replay(host,id).finishReason());
        assertThrows(BusinessException.class,()->games.confirmRole(host,id));
        assertThrows(BusinessException.class,()->games.submitTeam(host,id,List.of()));
        assertThrows(BusinessException.class,()->games.vote(host,id,VoteChoice.APPROVE));
        assertThrows(BusinessException.class,()->games.mission(host,id,MissionChoice.SUCCESS));
        assertThrows(BusinessException.class,()->games.inspectWithLady(host,id,1));
        assertThrows(BusinessException.class,()->games.assassinate(host,id,1));
        assertFalse(games.end(host,id).closed()); // No second mutation or invented result.
    }
    @Test void hostCanCloseHumanOnlyWaitingRoomWithoutCreatingGameHistory() {
        long id=rooms.create(host,5,null).roomId();
        assertTrue(games.end(host,id).closed());
        assertEquals("CLOSED",repository.game(id,false).orElseThrow().status());
        assertTrue(repository.activeGameForUser(host).isEmpty());
        assertEquals(0,context.getBean(MeService.class).games(host,1,10,null).total());
    }
    @Test void allSuccessTenPlayerGamePassesBotLadyAndAssassinPhases() {
        BotStrategy strategy=context.getBean(BotStrategy.class);
        org.mockito.Mockito.doReturn(VoteChoice.APPROVE).when(strategy).vote();
        org.mockito.Mockito.doReturn(MissionChoice.SUCCESS).when(strategy).mission(org.mockito.ArgumentMatchers.any());
        long id=lobby(10); games.start(host,id);
        List<GamePlayerRow> players=repository.players(id);
        List<Role> roles=GameRuleConfig.forPlayers(10).roles();
        for(int i=0;i<10;i++) repository.assignRole(id,players.get(i).id(),roles.get(i));
        repository.startGame(id,players.get(1).id(),players.get(2).id());
        playToFinish(id);
        assertEquals(3,repository.game(id,false).orElseThrow().goodScore());
        assertEquals(2,repository.ladyActionCount(id));
        assertTrue(repository.ladyActions(id).stream().allMatch(a -> a.holderGamePlayerId()!=a.targetGamePlayerId()));
        assertNotNull(repository.game(id,false).orElseThrow().assassinationTargetGamePlayerId());
        org.mockito.Mockito.verify(strategy,org.mockito.Mockito.atLeastOnce()).target(org.mockito.ArgumentMatchers.anyList());
    }
    @Test void concurrentHostEndAndPendingBotTickAreSerializedByGameLock() throws Exception {
        long id=lobby(5); games.start(host,id);
        var executor=java.util.concurrent.Executors.newSingleThreadExecutor();
        var started=new java.util.concurrent.CountDownLatch(1);
        var transaction=new org.springframework.transaction.support.TransactionTemplate(context.getBean(DataSourceTransactionManager.class));
        java.util.concurrent.atomic.AtomicReference<java.util.concurrent.Future<?>> pending=new java.util.concurrent.atomic.AtomicReference<>();
        try {
            transaction.executeWithoutResult(status -> {
                repository.game(id,true).orElseThrow();
                pending.set(executor.submit(()-> { started.countDown(); bots.act(id); }));
                try { assertTrue(started.await(5,java.util.concurrent.TimeUnit.SECONDS)); }
                catch(InterruptedException e) { Thread.currentThread().interrupt(); throw new RuntimeException(e); }
                games.end(host,id);
            });
            pending.get().get(5,java.util.concurrent.TimeUnit.SECONDS);
            assertTrue(repository.game(id,false).isEmpty());
            assertTrue(repository.activeBotGameIds().isEmpty());
        } finally { executor.shutdownNow(); }
    }
    @Test void concurrentBotAdditionsNeverOverfillRoomAndFailuresLeaveNoOrphanAccounts() throws Exception {
        long id=rooms.create(host,5,null).roomId();
        for(int i=0;i<3;i++) rooms.addBot(host,id);
        var executor=java.util.concurrent.Executors.newFixedThreadPool(2);
        var go=new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.Callable<Boolean> add=()-> {
            go.await();
            try { rooms.addBot(host,id); return true; }
            catch(BusinessException expected) { assertEquals("房间已满",expected.getMessage()); return false; }
        };
        try {
            var first=executor.submit(add); var second=executor.submit(add); go.countDown();
            assertNotEquals(first.get(5,java.util.concurrent.TimeUnit.SECONDS),second.get(5,java.util.concurrent.TimeUnit.SECONDS));
            assertEquals(5,rooms.get(host,id).currentPlayers());
            assertEquals(4,jdbc.queryForObject("select count(*) from t_avalon_user where provider='BOT'",Integer.class));
            assertEquals(5,repository.players(id).stream().map(GamePlayerRow::seatNo).distinct().count());
        } finally { executor.shutdownNow(); }
    }
    @Test void deletingTestGameLeavesOtherGamesVotesAndPlayersUntouched() {
        long test=lobby(5); games.start(host,test);
        long real=rooms.create(outsider,5,null).roomId();
        for(int i=0;i<4;i++) {
            long user=repository.insertUser("WECHAT","real"+i,"真人"+i);
            rooms.join(user,rooms.get(outsider,real).roomCode(),null);
        }
        games.start(outsider,real);
        for (GamePlayerRow player : repository.players(real)) games.confirmRole(player.userId(),real);
        var leader=repository.gamePlayerById(repository.game(real,false).orElseThrow().leaderGamePlayerId()).orElseThrow();
        games.submitTeam(leader.userId(),real,repository.players(real).stream().limit(2).map(GamePlayerRow::id).toList());
        games.vote(outsider,real,VoteChoice.APPROVE);
        long proposal=repository.currentProposal(real,1,1).orElseThrow().id();
        games.end(host,test);
        assertTrue(repository.game(test,false).isEmpty());
        assertEquals(Phase.TEAM_VOTING,repository.game(real,false).orElseThrow().phase());
        assertEquals(1,repository.voteCount(proposal)); assertEquals(5,repository.players(real).size());
        assertTrue(repository.user(host).isPresent()); assertTrue(repository.user(outsider).isPresent());
    }
    long humanGameWithKnownRoles() {
        long id = rooms.create(host,10,null).roomId();
        for (int i=0;i<9;i++) rooms.join(repository.insertUser("WECHAT","early-friend"+i,"朋友"+i),rooms.get(host,id).roomCode(),null);
        games.start(host,id);
        var players = repository.players(id);
        var roles = GameRuleConfig.forPlayers(10).roles();
        for (int i=0;i<10;i++) repository.assignRole(id,players.get(i).id(),roles.get(i));
        for (var player:players) games.confirmRole(player.userId(),id);
        return id;
    }
    @ParameterizedTest @ValueSource(strings={"TEAM_VOTING","MISSION_EXECUTING","LADY_OF_LAKE"})
    void queuedVoteMissionOrLadyCannotWriteAfterEarlyAssassinationCommits(String value) throws Exception {
        long id = humanGameWithKnownRoles();
        var players = repository.players(id);
        var assassin = players.stream().filter(p -> p.role()==Role.ASSASSIN).findFirst().orElseThrow();
        var leader = repository.gamePlayerById(repository.game(id,false).orElseThrow().leaderGamePlayerId()).orElseThrow();
        games.submitTeam(leader.userId(),id,players.stream().limit(3).map(GamePlayerRow::id).toList());
        if (!value.equals("TEAM_VOTING")) for (var p:players) games.vote(p.userId(),id,VoteChoice.APPROVE);
        if (value.equals("LADY_OF_LAKE")) repository.applyMissionScore(id,2,0,Phase.LADY_OF_LAKE);
        var before = repository.game(id,false).orElseThrow();
        var proposals = repository.proposals(id);
        var missions = repository.missions(id);
        int votes = jdbc.queryForObject("select count(*) from t_avalon_vote",Integer.class);
        var events = new java.util.concurrent.CopyOnWriteArrayList<RoomEventPublisher.RoomEvent>();
        context.addApplicationListener(event -> {
            if (event instanceof org.springframework.context.PayloadApplicationEvent<?> payload &&
                    payload.getPayload() instanceof RoomEventPublisher.RoomEvent roomEvent) events.add(roomEvent);
        });
        var executor = java.util.concurrent.Executors.newSingleThreadExecutor();
        var started = new java.util.concurrent.CountDownLatch(1);
        var pending = new java.util.concurrent.atomic.AtomicReference<java.util.concurrent.Future<String>>();
        var transaction = new org.springframework.transaction.support.TransactionTemplate(context.getBean(DataSourceTransactionManager.class));
        try {
            transaction.executeWithoutResult(status -> {
                repository.game(id,true).orElseThrow();
                pending.set(executor.submit(() -> {
                    started.countDown();
                    try {
                        switch (value) {
                            case "TEAM_VOTING" -> games.vote(host,id,VoteChoice.REJECT);
                            case "MISSION_EXECUTING" -> games.mission(players.getFirst().userId(),id,MissionChoice.SUCCESS);
                            default -> games.inspectWithLady(repository.gamePlayerById(before.ladyHolderGamePlayerId()).orElseThrow().userId(),id,players.getFirst().id());
                        }
                        return "unexpected-success";
                    } catch (BusinessException expected) { return expected.getCode(); }
                }));
                try {
                    assertTrue(started.await(5,java.util.concurrent.TimeUnit.SECONDS));
                    assertThrows(java.util.concurrent.TimeoutException.class,() -> pending.get().get(100,java.util.concurrent.TimeUnit.MILLISECONDS));
                } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new RuntimeException(e); }
                var state = games.startAssassination(assassin.userId(),id);
                assertEquals("ASSASSINATION",state.phase()); assertTrue(state.assassinationEarly());
                assertEquals(4,state.revealedEvilIdentities().size()); // Includes Mordred and Oberon in 10 players.
                assertTrue(events.isEmpty(),"WebSocket invalidation must wait for commit");
            });
            assertEquals("INVALID_PHASE",pending.get().get(5,java.util.concurrent.TimeUnit.SECONDS));
            assertEquals(List.of("ASSASSINATION_STARTED"),events.stream().map(RoomEventPublisher.RoomEvent::type).toList());
            var after = repository.game(id,false).orElseThrow();
            assertEquals(Phase.ASSASSINATION,after.phase());
            assertEquals(before.goodScore(),after.goodScore()); assertEquals(before.evilScore(),after.evilScore());
            assertEquals(before.missionNo(),after.missionNo()); assertEquals(before.proposalNo(),after.proposalNo());
            assertEquals(proposals,repository.proposals(id)); assertEquals(missions,repository.missions(id));
            assertEquals(votes,jdbc.queryForObject("select count(*) from t_avalon_vote",Integer.class));
            assertEquals(0,jdbc.queryForObject("select count(*) from t_avalon_mission_action",Integer.class));
            assertEquals(0,repository.ladyActionCount(id));
        } finally { executor.shutdownNow(); }
    }
    @Test void thirdSuccessWinningLockMakesQueuedEarlyStartFailWithoutChangingNormalFinishReason() throws Exception {
        long id = humanGameWithKnownRoles();
        var players = repository.players(id);
        var assassin = players.stream().filter(p -> p.role()==Role.ASSASSIN).findFirst().orElseThrow();
        var good = players.stream().filter(p -> p.alignment()==Alignment.GOOD).limit(3).toList();
        var leader = repository.gamePlayerById(repository.game(id,false).orElseThrow().leaderGamePlayerId()).orElseThrow();
        games.submitTeam(leader.userId(),id,good.stream().map(GamePlayerRow::id).toList());
        for(var p:players) games.vote(p.userId(),id,VoteChoice.APPROVE);
        repository.applyMissionScore(id,2,0,Phase.MISSION_EXECUTING); // Task 1: no Lady before normal assassination.
        games.mission(good.get(0).userId(),id,MissionChoice.SUCCESS);
        games.mission(good.get(1).userId(),id,MissionChoice.SUCCESS);
        var executor = java.util.concurrent.Executors.newSingleThreadExecutor();
        var started = new java.util.concurrent.CountDownLatch(1);
        var pending = new java.util.concurrent.atomic.AtomicReference<java.util.concurrent.Future<String>>();
        var transaction = new org.springframework.transaction.support.TransactionTemplate(context.getBean(DataSourceTransactionManager.class));
        try {
            transaction.executeWithoutResult(status -> {
                repository.game(id,true).orElseThrow();
                pending.set(executor.submit(() -> {
                    started.countDown();
                    try { games.startAssassination(assassin.userId(),id); return "unexpected-success"; }
                    catch(BusinessException expected) { return expected.getCode(); }
                }));
                try { assertTrue(started.await(5,java.util.concurrent.TimeUnit.SECONDS)); }
                catch(InterruptedException e) { Thread.currentThread().interrupt(); throw new RuntimeException(e); }
                games.mission(good.get(2).userId(),id,MissionChoice.SUCCESS);
            });
            assertEquals("INVALID_PHASE",pending.get().get(5,java.util.concurrent.TimeUnit.SECONDS));
            var state = games.state(assassin.userId(),id);
            assertEquals("ASSASSINATION",state.phase()); assertFalse(state.assassinationEarly());
            assertEquals(3,state.goodScore()); assertEquals(4,state.revealedEvilIdentities().size());
            games.assassinate(assassin.userId(),id,good.stream().filter(p -> p.role()==Role.MERLIN).findFirst().orElseThrow().id());
            assertEquals("MERLIN_ASSASSINATED",repository.game(id,false).orElseThrow().finishReason());
        } finally { executor.shutdownNow(); }
    }
    @ParameterizedTest @ValueSource(strings={"MERLIN","PERCIVAL","LOYAL_SERVANT"})
    void earlyAssassinationFinishesActualGameAndKeepsInterruptedVotingUnresolved(String targetRole) {
        long id=humanGameWithKnownRoles();
        var players=repository.players(id);
        var assassin=players.stream().filter(p->p.role()==Role.ASSASSIN).findFirst().orElseThrow();
        var target=players.stream().filter(p->p.role()==Role.valueOf(targetRole)).findFirst().orElseThrow();
        var leader=repository.gamePlayerById(repository.game(id,false).orElseThrow().leaderGamePlayerId()).orElseThrow();
        games.submitTeam(leader.userId(),id,players.stream().limit(3).map(GamePlayerRow::id).toList());
        games.vote(host,id,VoteChoice.APPROVE);
        repository.applyMissionScore(id,1,0,Phase.TEAM_VOTING);
        var proposal=repository.proposals(id).getFirst();
        games.startAssassination(assassin.userId(),id);
        assertEquals("PARAM_ERROR",assertThrows(BusinessException.class,
                ()->games.assassinate(assassin.userId(),id,players.stream().filter(p->p.role()==Role.OBERON).findFirst().orElseThrow().id())).getCode());
        games.assassinate(assassin.userId(),id,target.id());
        var finished=repository.game(id,false).orElseThrow();
        assertEquals(Phase.FINISHED,finished.phase());
        assertEquals(target.role()==Role.MERLIN?Winner.EVIL:Winner.GOOD,finished.winner());
        assertEquals(target.role()==Role.MERLIN?"EARLY_MERLIN_ASSASSINATED":"EARLY_ASSASSINATION_MISSED",finished.finishReason());
        assertEquals(target.id(),finished.assassinationTargetGamePlayerId());
        assertEquals(1,finished.goodScore()); assertEquals(0,finished.evilScore());
        assertEquals(proposal,repository.proposals(id).getFirst()); assertEquals(1,repository.voteCount(proposal.id()));
        assertEquals(0,repository.missions(id).size()); // No invented result for interrupted vote.
        var state=games.state(host,id);
        assertEquals(10,state.identities().size()); assertTrue(state.revealedEvilIdentities().isEmpty());
        var replay=context.getBean(GameHistoryService.class).replay(host,id);
        assertEquals(finished.finishReason(),replay.finishReason()); assertEquals("VOTING",replay.proposals().getFirst().status());
        assertThrows(BusinessException.class,()->games.startAssassination(assassin.userId(),id));
        assertThrows(BusinessException.class,()->games.assassinate(assassin.userId(),id,target.id()));
    }
    @Configuration @EnableTransactionManagement
    static class Config {
        @Bean DataSource dataSource() {
            return new DriverManagerDataSource("jdbc:h2:mem:bot_"+UUID.randomUUID()+";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1","sa","");
        }
        @Bean DataSourceTransactionManager transactionManager(DataSource ds) { return new DataSourceTransactionManager(ds); }
        @Bean JdbcTemplate jdbc(DataSource ds) { return new JdbcTemplate(ds); }
        @Bean AvalonRepository repository(JdbcTemplate jdbc) { return new AvalonRepository(jdbc); }
        @Bean RoomEventPublisher events(org.springframework.context.ApplicationEventPublisher publisher) { return new RoomEventPublisher(publisher); }
        @Bean RoomService rooms(AvalonRepository repo,RoomEventPublisher events) { return new RoomService(repo,events); }
        @Bean GameService games(AvalonRepository repo,RoomService rooms,RoomEventPublisher events) { return new GameService(repo,rooms,new RoleVisibilityService(),events); }
        @Bean BotStrategy strategy() { return org.mockito.Mockito.spy(new BotStrategy(new Random(177))); }
        @Bean BotTurnService bots(AvalonRepository repo,GameService games,BotStrategy strategy,RoomEventPublisher events) { return new BotTurnService(repo,games,strategy,events); }
        @Bean MeService me(AvalonRepository repo,JdbcTemplate jdbc) { return new MeService(repo,jdbc); }
        @Bean GameHistoryService history(AvalonRepository repo) { return new GameHistoryService(repo); }
    }
}
