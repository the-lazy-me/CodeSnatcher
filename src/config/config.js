require('dotenv').config();

module.exports = {
  email: {
    user: process.env.EMAIL_USER || 'your_email@example.com',
    password: process.env.EMAIL_PASSWORD || 'your_email_password',
    host: process.env.EMAIL_HOST || 'imap.example.com',
    port: parseInt(process.env.EMAIL_PORT || '993', 10),
    tls: process.env.EMAIL_TLS === 'true',
    // 重连配置
    reconnectMaxAttempts: parseInt(process.env.EMAIL_RECONNECT_MAX_ATTEMPTS || '5', 10),
    reconnectInterval: parseInt(process.env.EMAIL_RECONNECT_INTERVAL || '5000', 10),
    // 检查配置
    checkInterval: parseInt(process.env.EMAIL_CHECK_INTERVAL || '30000', 10),
    // IMAP连接配置
    tlsOptions: { rejectUnauthorized: process.env.EMAIL_TLS_REJECT_UNAUTHORIZED === 'true' }
  },
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    wsPort: parseInt(process.env.WS_PORT || '3001', 10)
  },
  websocket: {
    // 客户端检查配置
    clientCheckInterval: parseInt(process.env.WS_CLIENT_CHECK_INTERVAL || '15000', 10),
    // 默认超时时间
    defaultTimeout: parseInt(process.env.WS_DEFAULT_TIMEOUT || '300000', 10),
    // Ping配置
    pingInterval: parseInt(process.env.WS_PING_INTERVAL || '30000', 10)
  },
  api: {
    // 认证配置
    authEnabled: process.env.AUTH_ENABLED === 'true',
    token: process.env.API_TOKEN,
    wsToken: process.env.WS_TOKEN,
    // 默认超时时间
    defaultTimeout: parseInt(process.env.API_DEFAULT_TIMEOUT || '60000', 10),
    // CORS配置
    corsOrigins: process.env.API_CORS_ORIGINS || '*',
    corsHeaders: process.env.API_CORS_HEADERS || 'Origin, X-Requested-With, Content-Type, Accept',
    corsMethods: process.env.API_CORS_METHODS || 'GET, POST, PUT, DELETE, OPTIONS'
  },
  codeExtractor: {
    // 验证码格式
    minCodeLength: parseInt(process.env.CODE_MIN_LENGTH || '4', 10),
    maxCodeLength: parseInt(process.env.CODE_MAX_LENGTH || '8', 10),
    // 日志配置
    logEmailContentLength: parseInt(process.env.LOG_EMAIL_CONTENT_LENGTH || '100', 10),
    logEmailContentFullLength: parseInt(process.env.LOG_EMAIL_CONTENT_FULL_LENGTH || '200', 10)
  }
}; 