// Jest stand-in for Firebase messaging (no native module in tests). Jest uses
// it automatically; tests can change what the jest.fn()s return.

const messaging = { name: 'test-messaging' };

module.exports = {
  AuthorizationStatus: {
    NOT_DETERMINED: -1,
    DENIED: 0,
    AUTHORIZED: 1,
    PROVISIONAL: 2,
    EPHEMERAL: 3,
  },
  getMessaging: jest.fn(() => messaging),
  getToken: jest.fn(async () => 'test-fcm-token'),
  requestPermission: jest.fn(async () => 1),
  onMessage: jest.fn(() => () => {}),
  onNotificationOpenedApp: jest.fn(() => () => {}),
  onTokenRefresh: jest.fn(() => () => {}),
  getInitialNotification: jest.fn(async () => null),
  setBackgroundMessageHandler: jest.fn(),
};
