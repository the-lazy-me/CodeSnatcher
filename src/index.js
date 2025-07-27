const emailService = require('./services/emailService');
const wsService = require('./services/wsService');
const apiService = require('./services/apiService');

/**
 * 启动所有服务
 */
function startServices() {
  console.log('启动自动收邮件验证码服务...');
  
  // 初始化邮件服务
  console.log('初始化邮件服务...');
  emailService.initialize();
  
  // 初始化WebSocket服务
  console.log('初始化WebSocket服务...');
  wsService.initialize();
  
  // 初始化API服务
  console.log('初始化API服务...');
  apiService.initialize();
}

/**
 * 关闭所有服务
 */
function stopServices() {
  console.log('正在关闭服务...');
  
  // 关闭API服务
  apiService.close();
  
  // 关闭WebSocket服务
  wsService.close();
  
  // 关闭邮件服务
  emailService.close();
  
  console.log('所有服务已关闭');
}

// 处理进程退出
process.on('SIGINT', () => {
  console.log('接收到SIGINT信号');
  stopServices();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('接收到SIGTERM信号');
  stopServices();
  process.exit(0);
});

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  stopServices();
  process.exit(1);
});

// 启动服务
startServices(); 