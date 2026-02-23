const { request, setSession, getSession } = require('../../utils/request');

Page({
  data: {
    username: 'admin',
    password: 'Dongweiliu',
    loading: false,
    error: ''
  },

  onShow() {
    const session = getSession();
    if (session?.sessionToken) {
      wx.reLaunch({ url: '/pages/dashboard/dashboard' });
    }
  },

  onInputUsername(e) {
    this.setData({ username: e.detail.value });
  },

  onInputPassword(e) {
    this.setData({ password: e.detail.value });
  },

  async onSubmit() {
    if (this.data.loading) return;
    const username = this.data.username.trim();
    const password = this.data.password.trim();
    if (!username || !password) {
      this.setData({ error: 'Username and password are required.' });
      return;
    }

    this.setData({ loading: true, error: '' });
    try {
      const user = await request({
        url: '/auth/login',
        method: 'POST',
        data: { username, password }
      });
      setSession(user);
      wx.reLaunch({ url: '/pages/dashboard/dashboard' });
    } catch (error) {
      this.setData({ error: error.message || 'Login failed.' });
    } finally {
      this.setData({ loading: false });
    }
  }
});
