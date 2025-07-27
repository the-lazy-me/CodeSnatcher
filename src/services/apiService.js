const express = require('express');
const config = require('../config/config');
const emailService = require('./emailService');
const wsService = require('./wsService');

class ApiService {
  constructor() {
    this.app = express();
    this.server = null;
  }

  /**
   * 初始化API服务
   */
  initialize() {
    // 配置中间件
    this.app.use(express.json());
    
    // 设置CORS
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', config.api.corsOrigins);
      res.header('Access-Control-Allow-Headers', config.api.corsHeaders);
      res.header('Access-Control-Allow-Methods', config.api.corsMethods);
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });
    
    // 设置路由
    this.setupRoutes();
    
    // 启动服务器
    this.server = this.app.listen(config.server.port, () => {
      console.log(`API服务器启动在端口 ${config.server.port}`);
    });
  }

  /**
   * 设置API路由
   */
  setupRoutes() {
    // 健康检查
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    
    // 获取服务状态
    this.app.get('/status', (req, res) => {
      res.json({
        emailConnected: emailService.isConnected,
        wsClients: wsService.clients.size,
        pendingRequests: wsService.pendingRequests.size
      });
    });
    
    // 等待验证码API（HTTP长轮询）
    this.app.post('/wait-for-code', (req, res) => {
      const { email, timeout = config.api.defaultTimeout } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: '缺少邮箱地址' });
      }
      
      console.log(`HTTP客户端请求等待来自 ${email} 的验证码`);
      
      // 创建一个Promise来等待验证码
      const waitForCode = new Promise((resolve, reject) => {
        // 注册邮件监听器
        const listenerId = emailService.registerListener(email, (emailData) => {
          // 收到验证码，解析Promise
          resolve(emailData);
          
          // 移除监听器
          emailService.removeListener(email, listenerId);
        });
        
        // 设置超时
        setTimeout(() => {
          // 超时处理
          reject(new Error('等待验证码超时'));
          
          // 移除监听器
          emailService.removeListener(email, listenerId);
        }, timeout);
      });
      
      // 手动检查一次邮件
      emailService.manualCheck();
      
      // 等待验证码或超时
      waitForCode
        .then(data => {
          res.json({
            success: true,
            data
          });
        })
        .catch(error => {
          res.status(408).json({
            success: false,
            error: error.message
          });
        });
    });
    
    // 手动检查新邮件
    this.app.post('/check-mail', (req, res) => {
      const success = emailService.manualCheck();
      res.json({ success });
    });
  }

  /**
   * 关闭服务器
   */
  close() {
    if (this.server) {
      this.server.close();
      console.log('API服务器已关闭');
    }
  }
}

// 创建单例
const apiService = new ApiService();

module.exports = apiService; 