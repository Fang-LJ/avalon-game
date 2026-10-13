const { configuration, backToLogin } = require('../../utils/guest-content');
Page({
  data: {
    configurations: [5, 6, 7, 8, 9, 10].map(configuration),
    stages: [
      { n: '01', title: '确认身份', text: '随机分配身份，查看自己的卡牌及角色视野。身份保密，所有人确认后开始。' },
      { n: '02', title: '队长选人', text: '队长按本轮任务人数选出队伍，可以包含自己。首任队长随机，队伍被否决或任务结束后按座位轮换。' },
      { n: '03', title: '全员表决', text: '每人投赞成或反对，赞成票超过总人数一半才通过。结果公布前，其他人的选择保密。' },
      { n: '04', title: '秘密任务', text: '队伍成员秘密出牌。正义只能出成功，邪恶可以出成功或失败。只公布混洗后的成功与失败总数，不公布谁出了哪张牌。' },
      { n: '05', title: '刺杀梅林', text: '三个任务成功后，邪恶身份公开，刺客从正义玩家中选择目标。刺中梅林则邪恶获胜，否则正义获胜。' },
    ],
  },
  back: backToLogin,
});
