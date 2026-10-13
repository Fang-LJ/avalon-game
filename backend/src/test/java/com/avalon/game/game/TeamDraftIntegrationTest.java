package com.avalon.game.game;

import com.avalon.game.auth.*;
import com.avalon.game.common.*;
import com.avalon.game.game.AvalonRepository.*;
import com.avalon.game.game.GameTypes.*;
import com.avalon.game.realtime.*;
import com.avalon.game.room.RoomService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.context.annotation.*;
import org.springframework.context.PayloadApplicationEvent;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.web.socket.*;
import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real SQL, transactions, row locking and two independent services; never touches production. */
class TeamDraftIntegrationTest {
    AnnotationConfigApplicationContext context;
    JdbcTemplate jdbc;
    AvalonRepository repo;
    RoomService rooms;
    GameService games, second;
    long host, outsider, id;
    List<GamePlayerRow> players;
    final ObjectMapper json = new ObjectMapper();
    final List<RoomEventPublisher.RoomEvent> events = new CopyOnWriteArrayList<>();
    @BeforeEach void setup() throws Exception {
        context=new AnnotationConfigApplicationContext(Config.class);
        jdbc=context.getBean(JdbcTemplate.class); repo=context.getBean(AvalonRepository.class);rooms=context.getBean(RoomService.class);
        games=context.getBean("games",GameService.class);second=context.getBean("second",GameService.class);
        String sql=Files.readString(Path.of("../docs/sql/001_avalon_init.sql"))
            .replaceAll("ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", "")
            .replace("TINYINT(1)","TINYINT").replace(" JSON "," VARCHAR(4096) ");
        var alter=java.util.regex.Pattern.compile("(?s)ALTER TABLE t_avalon_game\\s+(.*?);").matcher(sql);
        if(alter.find())sql=alter.replaceFirst(java.util.regex.Matcher.quoteReplacement(Arrays.stream(alter.group(1).split(",\\s*ADD "))
            .map(c->"ALTER TABLE t_avalon_game "+(c.startsWith("ADD ")?c:"ADD "+c)+";").collect(java.util.stream.Collectors.joining("\n"))));
        try(var connection=context.getBean(DataSource.class).getConnection()){ScriptUtils.executeSqlScript(connection,new ByteArrayResource(sql.getBytes(StandardCharsets.UTF_8)));}
        host=repo.insertUser("WECHAT","host","队长");outsider=repo.insertUser("WECHAT","outside","房外用户");
        context.addApplicationListener(e->{if(e instanceof PayloadApplicationEvent<?> p && p.getPayload() instanceof RoomEventPublisher.RoomEvent r)events.add(r);});
    }
    @AfterEach void close(){if(jdbc!=null)jdbc.execute("shutdown");if(context!=null)context.close();}
    void room(int count) {
        var room=rooms.create(host,count,null);id=room.roomId();
        for(int i=1;i<count;i++){long user=repo.insertUser("WECHAT","member"+i,"玩家"+i);rooms.join(user,room.roomCode(),null);}
        games.start(host,id);players=repo.players(id);for(var p:players)games.confirmRole(p.userId(),id);
        jdbc.update("update t_avalon_game set mission_no=2,leader_game_player_id=? where id=?",players.getFirst().id(),id);
        events.clear();
    }
    TeamDraft current(){return games.state(host,id).teamDraft();}
    List<Long> team(){return players.stream().limit(GameRuleConfig.forPlayers(players.size()).teamSize(2)).map(GamePlayerRow::id).toList();}
    List<Long> alternate(){return players.stream().skip(players.size()-team().size()).map(GamePlayerRow::id).toList();}
    GameService.TeamDraftRequest request(TeamDraft d,List<Long> ids){return new GameService.TeamDraftRequest(ids,d.missionNo(),d.proposalNo(),d.leaderPlayerId(),d.revision());}
    GameService.TeamRequest dispatch(TeamDraft d){return new GameService.TeamRequest(d.selectedPlayerIds(),d.missionNo(),d.proposalNo(),d.leaderPlayerId(),d.revision());}
    int proposalCount(){return jdbc.queryForObject("select count(*) from t_avalon_proposal where game_id=?",Integer.class,id);}
    void error(String code,Runnable action){assertEquals(code,assertThrows(BusinessException.class,action::run).getCode());}

    @ParameterizedTest @ValueSource(ints={5,6,7,8,9,10})
    void partialCancellationNominationEditsAndFinalTeamAreSharedWithoutPrematureHistory(int count) throws Exception {
        room(count);var first=team();TeamDraft d=current();
        for(int i=1;i<=first.size();i++){
            d=games.updateTeamDraft(host,id,request(d,first.subList(0,i)));
            for(var p:players)assertEquals(d,second.state(p.userId(),id).teamDraft());
            assertEquals(0,proposalCount());
        }
        d=games.updateTeamDraft(host,id,request(d,List.of()));assertTrue(d.selectedPlayerIds().isEmpty());
        d=games.updateTeamDraft(host,id,request(d,first));d=games.nominateTeam(host,id,request(d,first));
        assertTrue(d.nominated());assertEquals(first,d.nominatedPlayerIds());assertEquals(1,repo.game(id,false).orElseThrow().proposalNo());assertEquals(0,proposalCount());
        d=second.updateTeamDraft(host,id,request(d,alternate()));assertEquals(first,d.nominatedPlayerIds());
        var publicKeys=json.readTree(json.writeValueAsString(d)).fieldNames();var fields=new HashSet<String>();publicKeys.forEachRemaining(fields::add);
        assertEquals(Set.of("gameId","missionNo","proposalNo","leaderPlayerId","selectedPlayerIds","nominatedPlayerIds","nominated","revision"),fields);
        var finalState=games.submitTeam(host,id,dispatch(d));assertEquals("TEAM_VOTING",finalState.phase());assertNull(finalState.teamDraft());
        assertEquals(alternate().stream().sorted().toList(),finalState.selectedPlayerIds());assertEquals(1,proposalCount());
        assertNull(repo.teamDraft(id));var past=d;error("INVALID_PHASE",()->games.updateTeamDraft(host,id,request(past,first)));
    }
    @Test void legacyDirectDispatchAndBotServiceOverloadIgnoreOptionalNomination() {
        room(7);var d=games.updateTeamDraft(host,id,request(current(),team()));games.nominateTeam(host,id,request(d,team()));
        var result=games.submitTeam(host,id,alternate());assertEquals(alternate().stream().sorted().toList(),result.selectedPlayerIds());assertEquals(1,proposalCount());assertNull(repo.teamDraft(id));
    }
    @Test void malformedForeignAndOverlargeSelectionsOrWrongLeaderCannotMutate() {
        room(7);var d=current();long other=players.get(1).userId();
        error("FORBIDDEN",()->games.updateTeamDraft(other,id,request(d,team())));
        error("FORBIDDEN",()->games.nominateTeam(other,id,request(d,team())));
        assertThrows(BusinessException.class,()->games.updateTeamDraft(outsider,id,request(d,team())));
        for(var ids:Arrays.asList(null,List.of(1L,1L),List.of(999999L),Arrays.asList((Long)null),players.stream().limit(4).map(GamePlayerRow::id).toList()))
            error("PARAM_ERROR",()->games.updateTeamDraft(host,id,request(d,ids)));
        error("STALE_DRAFT",()->games.updateTeamDraft(host,id,new GameService.TeamDraftRequest(team(),3,1,d.leaderPlayerId(),0)));
        error("STALE_DRAFT",()->games.updateTeamDraft(host,id,new GameService.TeamDraftRequest(team(),2,2,d.leaderPlayerId(),0)));
        assertEquals(d,current());assertTrue(events.isEmpty());assertEquals(0,proposalCount());
    }
    @Test void insufficientNominationAndSecondNominationAreRejectedAndFirstListSurvivesEdits() {
        room(7);var empty=current();error("PARAM_ERROR",()->games.nominateTeam(host,id,request(empty,List.of())));
        var d=games.updateTeamDraft(host,id,request(empty,team()));var nominated=games.nominateTeam(host,id,request(d,team()));
        error("ALREADY_NOMINATED",()->games.nominateTeam(host,id,request(nominated,team())));
        var changed=games.updateTeamDraft(host,id,request(nominated,List.of(players.getLast().id())));
        assertEquals(team(),changed.nominatedPlayerIds());error("PARAM_ERROR",()->games.submitTeam(host,id,dispatch(changed)));assertEquals(0,proposalCount());
    }
    @Test void staleRevisionOrUnacknowledgedFinalListCannotDispatchAnOldTeam() {
        room(7);var old=current();var first=games.updateTeamDraft(host,id,request(old,team()));
        error("STALE_DRAFT",()->games.updateTeamDraft(host,id,request(old,alternate())));
        error("STALE_DRAFT",()->games.submitTeam(host,id,new GameService.TeamRequest(alternate(),2,1,first.leaderPlayerId(),first.revision())));
        var latest=games.updateTeamDraft(host,id,request(first,alternate()));
        error("STALE_DRAFT",()->games.submitTeam(host,id,dispatch(first)));assertEquals(0,proposalCount());
        games.submitTeam(host,id,dispatch(latest));assertEquals(1,proposalCount());
    }
    List<String> race(Supplier<?> first,Supplier<?> other) throws Exception {
        var executor=Executors.newFixedThreadPool(2);var start=new CountDownLatch(1);
        try {
            List<Future<String>> futures=new ArrayList<>();for(var action:List.of(first,other))futures.add(executor.submit(()->{start.await();try{action.get();return "OK";}catch(BusinessException e){return e.getCode();}}));
            start.countDown();return List.of(futures.get(0).get(5,TimeUnit.SECONDS),futures.get(1).get(5,TimeUnit.SECONDS));
        }finally{executor.shutdownNow();}
    }
    @Test void twoServerInstancesSerializeConcurrentDraftsNominationsAndDispatch() throws Exception {
        room(7);var initial=current();
        var updates=race(()->games.updateTeamDraft(host,id,request(initial,team())),()->second.updateTeamDraft(host,id,request(initial,alternate())));
        assertEquals(Set.of("OK","STALE_DRAFT"),new HashSet<>(updates));var d=current();assertEquals(1,d.revision());
        var nominations=race(()->games.nominateTeam(host,id,request(d,d.selectedPlayerIds())),()->second.nominateTeam(host,id,request(d,d.selectedPlayerIds())));
        assertEquals(Set.of("OK","ALREADY_NOMINATED"),new HashSet<>(nominations));var nominated=current();assertEquals(2,nominated.revision());
        var submits=race(()->games.submitTeam(host,id,dispatch(nominated)),()->second.submitTeam(host,id,dispatch(nominated)));
        assertEquals(Set.of("OK","INVALID_PHASE"),new HashSet<>(submits));assertEquals(1,proposalCount());
    }
    @Test void rollbackNeitherStoresDraftNorPublishesAndFreshServiceReloadsNomination() {
        room(7);var tx=new TransactionTemplate(context.getBean(DataSourceTransactionManager.class));
        tx.executeWithoutResult(status->{games.updateTeamDraft(host,id,request(current(),team()));assertTrue(events.isEmpty());status.setRollbackOnly();});
        assertEquals(0,current().revision());assertNull(repo.teamDraft(id));assertTrue(events.isEmpty());
        var d=games.updateTeamDraft(host,id,request(current(),team()));var n=games.nominateTeam(host,id,request(d,team()));
        var fresh=new GameService(repo,rooms,new RoleVisibilityService(),context.getBean(RoomEventPublisher.class));
        assertEquals(n,fresh.state(host,id).teamDraft());
    }
    @Test void rejectionAndNextMissionClearDraftAndInvalidatePreviousScope() {
        room(7);var d=games.updateTeamDraft(host,id,request(current(),team()));var n=games.nominateTeam(host,id,request(d,team()));games.submitTeam(host,id,dispatch(n));
        for(var p:players)games.vote(p.userId(),id,VoteChoice.REJECT);
        var next=current();assertEquals(2,next.proposalNo());assertFalse(next.nominated());assertTrue(next.selectedPlayerIds().isEmpty());assertEquals(players.get(1).id(),next.leaderPlayerId());
        error("FORBIDDEN",()->games.updateTeamDraft(host,id,request(n,team())));
        long leader=players.get(1).userId();var r=games.updateTeamDraft(leader,id,request(next,team()));games.submitTeam(leader,id,dispatch(r));
        for(var p:players)games.vote(p.userId(),id,VoteChoice.APPROVE);for(var p:players.stream().filter(p->team().contains(p.id())).toList())games.mission(p.userId(),id,MissionChoice.SUCCESS);
        var round=current();assertEquals(3,round.missionNo());assertEquals(1,round.proposalNo());assertFalse(round.nominated());assertEquals(0,round.revision());
    }
    @Test void hostFinishAndRematchNeverCarryDraftToAnotherGame() {
        room(5);var d=games.updateTeamDraft(host,id,request(current(),team()));games.nominateTeam(host,id,request(d,team()));games.end(host,id);assertNull(repo.teamDraft(id));
        var next=games.restart(host,id);assertNotEquals(id,next.roomId());games.start(host,next.roomId());for(var p:repo.players(next.roomId()))games.confirmRole(p.userId(),next.roomId());
        assertFalse(games.state(host,next.roomId()).teamDraft().nominated());assertEquals(List.of(),games.state(host,next.roomId()).teamDraft().selectedPlayerIds());
    }
    WebSocketSession socket(AvalonWebSocketHandler handler,JwtService jwt,long user) throws Exception {
        var session=mock(WebSocketSession.class);when(session.getId()).thenReturn("u"+user);when(session.isOpen()).thenReturn(true);var headers=new HttpHeaders();headers.set("Authorization","Bearer u"+user);when(session.getHandshakeHeaders()).thenReturn(headers);when(jwt.parse("u"+user)).thenReturn(user);handler.afterConnectionEstablished(session);return session;
    }
    @Test void committedWebSocketPayloadReachesEveryRoomMemberOnlyAndReconnectReadsSameDraft() throws Exception {
        room(7);rooms.create(outsider,5,null);var jwt=mock(JwtService.class);var handler=new AvalonWebSocketHandler(jwt,repo,json);
        var sessions=new ArrayList<WebSocketSession>();for(var p:players)sessions.add(socket(handler,jwt,p.userId()));var outside=socket(handler,jwt,outsider);
        context.addApplicationListener(e->{if(e instanceof PayloadApplicationEvent<?> p && p.getPayload() instanceof RoomEventPublisher.RoomEvent r)handler.onRoomEvent(r);});
        sessions.forEach(s->clearInvocations(s));clearInvocations(outside);
        var d=games.updateTeamDraft(host,id,request(current(),team()));for(var session:sessions){
            var messages=org.mockito.ArgumentCaptor.forClass(WebSocketMessage.class);verify(session).sendMessage(messages.capture());
            var body=json.readTree(messages.getValue().getPayload().toString());assertEquals("TEAM_DRAFT_UPDATED",body.get("type").asText());assertEquals(json.readTree(json.writeValueAsString(d)),body.get("teamDraft"));
            for(var secret:List.of("roleCode","visiblePlayers","alignment","personalGuesses"))assertFalse(body.toString().contains(secret));
        }
        verify(outside,never()).sendMessage(any());
        var n=games.nominateTeam(host,id,request(d,team()));handler.afterConnectionClosed(sessions.getLast(),CloseStatus.NORMAL);socket(handler,jwt,players.getLast().userId());assertEquals(n,second.state(players.getLast().userId(),id).teamDraft());
    }
    @Test void authenticatedHttpContractsAcceptOldDispatchAndGuardNewEndpoints() throws Exception {
        room(7);var jwt=mock(JwtService.class);when(jwt.parse("leader")).thenReturn(host);when(jwt.parse("member")).thenReturn(players.getLast().userId());
        var mvc=org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(new GameController(games)).setControllerAdvice(new GlobalExceptionHandler()).addInterceptors(new AuthInterceptor(jwt)).build();
        var payload=json.writeValueAsString(request(current(),team()));String base="/api/avalon/game/"+id;
        mvc.perform(put(base+"/team-draft").contentType("application/json").content(payload)).andExpect(status().isUnauthorized());
        mvc.perform(put(base+"/team-draft").header("Authorization","Bearer member").contentType("application/json").content(payload)).andExpect(status().isForbidden());
        mvc.perform(put(base+"/team-draft?userId="+outsider).header("Authorization","Bearer leader").contentType("application/json").content(payload)).andExpect(status().isOk());
        mvc.perform(post(base+"/team-nomination").header("Authorization","Bearer leader").contentType("application/json").content(json.writeValueAsString(request(current(),team())))).andExpect(status().isOk());
        mvc.perform(post(base+"/team").header("Authorization","Bearer leader").contentType("application/json").content(json.writeValueAsString(Map.of("playerIds",alternate())))).andExpect(status().isOk());assertEquals(1,proposalCount());
    }
    @Test void additiveMigrationKeepsOldSchemaDataAndTableCount() throws Exception {
        String sql=Files.readString(Path.of("../docs/sql/005_team_draft.sql"));assertTrue(sql.contains("ADD COLUMN team_draft_json JSON NULL"));assertFalse(sql.matches("(?is).*\\b(DROP|TRUNCATE|DELETE)\\b.*"));assertFalse(sql.contains("CREATE TABLE"));
        jdbc.execute("alter table t_avalon_game drop column team_draft_json");
        var before=rooms.create(host,5,null);jdbc.execute(sql.substring(sql.indexOf("ALTER TABLE")).replace(" JSON "," VARCHAR(4096) "));
        assertEquals(before.roomId(),rooms.get(host,before.roomId()).roomId());assertNull(repo.teamDraft(before.roomId()));
    }
    @Configuration @EnableTransactionManagement
    static class Config {
        @Bean DataSource dataSource(){return new DriverManagerDataSource("jdbc:h2:mem:team_"+UUID.randomUUID()+";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1","sa","");}
        @Bean DataSourceTransactionManager transactionManager(DataSource ds){return new DataSourceTransactionManager(ds);}
        @Bean JdbcTemplate jdbc(DataSource ds){return new JdbcTemplate(ds);}
        @Bean AvalonRepository repo(JdbcTemplate jdbc){return new AvalonRepository(jdbc);}
        @Bean RoomEventPublisher events(org.springframework.context.ApplicationEventPublisher publisher){return new RoomEventPublisher(publisher);}
        @Bean RoomService rooms(AvalonRepository repo,RoomEventPublisher events){return new RoomService(repo,events);}
        @Bean GameService games(AvalonRepository repo,RoomService rooms,RoomEventPublisher events){return new GameService(repo,rooms,new RoleVisibilityService(),events);}
        @Bean GameService second(AvalonRepository repo,RoomService rooms,RoomEventPublisher events){return new GameService(repo,rooms,new RoleVisibilityService(),events);}
    }
}
