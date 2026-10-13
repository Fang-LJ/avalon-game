const agreement = require('../../utils/legal/user-agreement');
const privacy = require('../../utils/legal/privacy-policy');
Page({
  data: { document: null },
  onLoad(options = {}) {
    const document = options.type === 'privacy' ? privacy : agreement;
    this.setData({ document: { ...document, sections: document.sections.map(section => ({
      ...section, blocks: section.blocks.map(block => ({ ...block,
        // The canonical public text keeps the same mailto links as the Markdown.
        displayText: block.text.replace(/\[([^\]]+)\]\(mailto:[^)]+\)/g, '$1'),
      })),
    })) } });
  },
  back() {
    if (getCurrentPages().length > 1) wx.navigateBack();
    else wx.reLaunch({ url: '/pages/login/login' });
  },
});
