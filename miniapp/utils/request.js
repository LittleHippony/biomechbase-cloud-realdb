const { API_BASE_URL } = require('./config');

const SESSION_KEY = 'biomech_mini_session';

function getSession() {
  return wx.getStorageSync(SESSION_KEY) || null;
}

function setSession(session) {
  wx.setStorageSync(SESSION_KEY, session);
}

function clearSession() {
  wx.removeStorageSync(SESSION_KEY);
}

function request({ url, method = 'GET', data }) {
  const session = getSession();
  const token = session?.sessionToken;

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`,
      method,
      data,
      header: {
        'content-type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }

        const message = res.data?.message || `Request failed (${res.statusCode})`;
        if (res.statusCode === 401) {
          clearSession();
          wx.showModal({
            title: 'Session',
            content: 'Session expired or invalid. Please sign in again.',
            showCancel: false,
            complete: () => {
              wx.reLaunch({ url: '/pages/login/login' });
            }
          });
        }
        const error = new Error(message);
        error.statusCode = res.statusCode;
        error.body = res.data;
        reject(error);
      },
      fail(err) {
        const error = new Error(err?.errMsg || 'Network request failed');
        error.statusCode = 0;
        reject(error);
      }
    });
  });
}

module.exports = {
  request,
  getSession,
  setSession,
  clearSession
};
