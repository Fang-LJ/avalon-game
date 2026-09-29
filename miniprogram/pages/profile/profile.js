const api = require('../../services/avalon');
const auth = require('../../services/auth');
const files = require('../../services/file');
const ui = require('../../utils/presentation');

Page({
  data: {
    mode: 'first',
    loading: true,
    uploading: false,
    saving: false,
    nickname: '',
    avatarUrl: '',
    initial: 'A',
    canSave: false,
    error: '',
  },
  onLoad(options) {
    this.setData({ mode: options && options.mode === 'edit' ? 'edit' : 'first' });
    if (auth.requireSession()) this.load();
  },
  async load() {
    try {
      const profile = await api.profile();
      const nickname =
        this.data.mode === 'first' && profile.nickname === '微信玩家'
          ? ''
          : profile.nickname || '';
      this.setData({
        nickname,
        avatarUrl: profile.avatarUrl || '',
        initial: nickname ? ui.initial(nickname) : 'A',
        error: '',
      });
      this.syncCanSave();
    } catch (error) {
      this.setData({ error: error.message || '资料加载失败，请重试' });
    } finally {
      this.setData({ loading: false });
    }
  },
  nicknameInput(event) {
    const nickname = (event.detail && event.detail.value) || '';
    this.setData({ nickname, initial: nickname ? ui.initial(nickname) : 'A' });
    this.syncCanSave();
  },
  handleChooseAvatar(event) {
    const filePath = event.detail && event.detail.avatarUrl;
    if (!filePath) return this.showUploadError('未获取到微信头像');
    return this.upload(filePath);
  },
  async chooseFromAlbum() {
    try {
      await this.upload(await files.chooseImage());
    } catch (error) {
      this.showUploadError(error.message || '选择图片失败');
    }
  },
  async upload(filePath) {
    if (this.data.uploading) return;
    this.setData({ uploading: true, error: '' });
    this.syncCanSave();
    try {
      const result = await files.uploadAvatar(filePath);
      if (!result || !result.url) throw new Error('头像上传失败，请重试');
      this.setData({ avatarUrl: result.url });
    } catch (error) {
      this.showUploadError(error.message || '头像上传失败，请重试');
    } finally {
      this.setData({ uploading: false });
      this.syncCanSave();
    }
  },
  showUploadError(message) {
    this.setData({ error: message || '头像上传失败，请重试' });
    wx.showToast({ title: message || '头像上传失败，请重试', icon: 'none' });
  },
  syncCanSave() {
    const nickname = (this.data.nickname || '').trim();
    this.setData({
      canSave:
        !!this.data.avatarUrl &&
        !!nickname &&
        nickname.length <= 32 &&
        !this.data.uploading &&
        !this.data.saving,
    });
  },
  async save() {
    if (!this.data.canSave || this.data.saving || this.leaving) return;
    const nickname = this.data.nickname.trim();
    this.setData({ saving: true, error: '' });
    this.syncCanSave();
    try {
      await api.updateProfile({ nickname, avatarUrl: this.data.avatarUrl });
      this.leaving = true;
      if (this.data.mode === 'edit') {
        wx.navigateBack({
          delta: 1,
          fail: () => wx.reLaunch({ url: '/pages/me/me' }),
        });
      } else {
        wx.reLaunch({ url: '/pages/index/index' });
      }
    } catch (error) {
      this.setData({ error: error.message || '保存失败，请重试' });
    } finally {
      this.setData({ saving: false });
      this.syncCanSave();
    }
  },
});
