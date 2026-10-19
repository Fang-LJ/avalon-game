package com.avalon.game.room;
import com.avalon.game.common.BusinessException;
import com.avalon.game.game.AvalonRepository;
import com.avalon.game.game.AvalonRepository.GameRow;
import com.avalon.game.game.AvalonRepository.GamePlayerRow;
import com.avalon.game.realtime.RoomEventPublisher;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class InvitePreviewTest {
 final AvalonRepository repository = mock(AvalonRepository.class);
 final RoomEventPublisher events = mock(RoomEventPublisher.class);
 final RoomService service = new RoomService(repository, events);
 GameRow game(String status) { return new GameRow(1,"000123",100,5,"AVALON_V1",status,null,1,1,null,0,0,0,null,null,null,null,null,null,null); }
 GamePlayerRow player(long userId, Integer seat) { return new GamePlayerRow(userId,1,userId,seat,"SecretNickname",com.avalon.game.game.GameTypes.Role.MERLIN,com.avalon.game.game.GameTypes.Alignment.GOOD,false,true,null); }
 @Test void nonMemberOnlySeesOccupancyAndCounts() throws Exception {
  when(repository.waitingGameByCode("000123", false)).thenReturn(Optional.of(game("WAITING")));
  when(repository.players(1)).thenReturn(List.of(player(100,1),player(101,null)));
  var result=service.preview(999,"000123");
  assertEquals(2,result.currentPlayers()); assertEquals(1,result.seatedPlayers()); assertNull(result.roomId());
  assertFalse(result.member()); assertEquals(5,result.seats().size()); assertTrue(result.seats().getFirst().occupied());
  String json=new ObjectMapper().writeValueAsString(result);
  for(String secret:List.of("SecretNickname","MERLIN","GOOD","userId","avatarUrl","knowledge","vote")) assertFalse(json.contains(secret),json);
  verifyNoInteractions(events); verify(repository,never()).insertGamePlayer(anyLong(),anyLong(),anyString(),anyInt());
 }
 @Test void existingMemberCanResumePlayingRoom() {
  when(repository.waitingGameByCode("000123",false)).thenReturn(Optional.empty());
  when(repository.latestGameByCode("000123")).thenReturn(Optional.of(game("PLAYING")));
  when(repository.players(1)).thenReturn(List.of(player(100,1)));
  var result=service.preview(100,"000123"); assertTrue(result.member());assertEquals(1L,result.roomId());assertEquals("PLAYING",result.status());
 }
 @Test void currentWaitingRoomWinsOverOlderGeneration() {
  when(repository.waitingGameByCode("000123",false)).thenReturn(Optional.of(game("WAITING")));
  when(repository.players(1)).thenReturn(List.of());service.preview(100,"000123");verify(repository,never()).latestGameByCode(anyString());
 }
 @Test void invalidAndExpiredCodesNeverCreateAnything() {
  assertThrows(BusinessException.class,()->service.preview(100,"bad"));verifyNoInteractions(repository);
  when(repository.waitingGameByCode("000123",false)).thenReturn(Optional.empty());when(repository.latestGameByCode("000123")).thenReturn(Optional.empty());
  assertThrows(BusinessException.class,()->service.preview(100,"000123"));verifyNoInteractions(events);
 }
}
