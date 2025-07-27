const WebSocket = require('ws');
const config = require('../config/config');
const emailService = require('./emailService');

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // 客户端连接映射表
    this.pendingRequests = new Map(); // 等待验证码的请求
  }

  /**
   * 初始化WebSocket服务器
   */
  initialize() {
    this.wss = new WebSocket.Server({ port: config.server.wsPort });
    console.log(`WebSocket服务器启动在端口 ${config.server.wsPort}`);

    this.setupEventListeners();
  }

  /**
   * 设置WebSocket事件监听器
   */
  setupEventListeners() {
    this.wss.on('connection', (ws) => {
      const clientId = this.generateClientId();
      this.clients.set(clientId, ws);
      
      console.log(`客户端 ${clientId} 已连接`);
      
      // 发送连接成功消息
      this.sendToClient(ws, {
        type: 'connected',
        clientId: clientId,
        message: '连接成功'
      });
      
      // 处理消息
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleMessage(clientId, ws, data);
        } catch (error) {
          console.error('解析消息失败:', error);
          this.sendToClient(ws, {
            type: 'error',
            message: '无效的消息格式'
          });
        }
      });
      
      // 处理关闭连接
      ws.on('close', () => {
        console.log(`客户端 ${clientId} 已断开连接`);
        this.handleClientDisconnect(clientId);
      });
      
      // 处理错误
      ws.on('error', (error) => {
        console.error(`客户端 ${clientId} 发生错误:`, error);
      });
    });
  }

  /**
   * 生成唯一的客户端ID
   * @returns {string} 客户端ID
   */
  generateClientId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * 处理客户端消息
   * @param {string} clientId 客户端ID
   * @param {WebSocket} ws WebSocket连接
   * @param {Object} data 消息数据
   */
  handleMessage(clientId, ws, data) {
    const { type, payload } = data;
    
    switch (type) {
      case 'wait_for_code':
        this.handleWaitForCode(clientId, ws, payload);
        break;
        
      case 'cancel_wait':
        this.handleCancelWait(clientId, payload);
        break;
        
      case 'ping':
        this.sendToClient(ws, { type: 'pong' });
        break;
        
      default:
        console.warn(`未知的消息类型: ${type}`);
        this.sendToClient(ws, {
          type: 'error',
          message: '未知的消息类型'
        });
    }
  }

  /**
   * 处理等待验证码请求
   * @param {string} clientId 客户端ID
   * @param {WebSocket} ws WebSocket连接
   * @param {Object} payload 请求数据
   */
  handleWaitForCode(clientId, ws, payload) {
    const { email, timeout = config.websocket.defaultTimeout } = payload;
    
    if (!email) {
      this.sendToClient(ws, {
        type: 'error',
        message: '缺少邮箱地址'
      });
      return;
    }
    
    console.log(`客户端 ${clientId} 请求等待来自 ${email} 的验证码`);
    
    // 如果已经有相同的请求，先取消它
    if (this.pendingRequests.has(clientId)) {
      const { listenerId, emailAddress } = this.pendingRequests.get(clientId);
      emailService.removeListener(emailAddress, listenerId);
    }
    
    // 注册邮件监听器
    const listenerId = emailService.registerListener(email, (emailData) => {
      // 收到验证码，发送给客户端
      this.sendToClient(ws, {
        type: 'code_received',
        payload: emailData
      });
      
      // 移除请求和监听器
      this.cleanupRequest(clientId);
    });
    
    // 存储请求信息
    this.pendingRequests.set(clientId, {
      listenerId,
      emailAddress: email,
      timeoutId: setTimeout(() => {
        // 超时处理
        this.sendToClient(ws, {
          type: 'timeout',
          message: '等待验证码超时'
        });
        
        this.cleanupRequest(clientId);
      }, timeout)
    });
    
    // 确认请求已接收
    this.sendToClient(ws, {
      type: 'waiting_for_code',
      email: email,
      message: `开始等待来自 ${email} 的验证码`
    });
    
    // 立即手动检查邮件，以防验证码已经到达
    console.log(`立即检查邮件，查找发送给 ${email} 的验证码`);
    const checkResult = emailService.manualCheck();
    console.log(`邮件检查结果: ${checkResult ? '成功' : '失败'}`);
    
    // 设置定期检查，以防邮件通知未触发
    const checkInterval = setInterval(() => {
      console.log(`定期检查邮件，查找发送给 ${email} 的验证码`);
      emailService.manualCheck();
    }, config.websocket.clientCheckInterval);
    
    // 将检查间隔存储在请求中，以便在清理时停止
    this.pendingRequests.get(clientId).checkInterval = checkInterval;
  }

  /**
   * 处理取消等待请求
   * @param {string} clientId 客户端ID
   * @param {Object} payload 请求数据
   */
  handleCancelWait(clientId, payload) {
    this.cleanupRequest(clientId);
    
    // 发送取消确认
    const ws = this.clients.get(clientId);
    if (ws) {
      this.sendToClient(ws, {
        type: 'wait_cancelled',
        message: '已取消等待验证码'
      });
    }
  }

  /**
   * 清理请求资源
   * @param {string} clientId 客户端ID
   */
  cleanupRequest(clientId) {
    if (this.pendingRequests.has(clientId)) {
      const { listenerId, emailAddress, timeoutId, checkInterval } = this.pendingRequests.get(clientId);
      
      // 清除超时定时器
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      // 清除定期检查定时器
      if (checkInterval) {
        clearInterval(checkInterval);
      }
      
      // 移除邮件监听器
      emailService.removeListener(emailAddress, listenerId);
      
      // 移除请求记录
      this.pendingRequests.delete(clientId);
    }
  }

  /**
   * 处理客户端断开连接
   * @param {string} clientId 客户端ID
   */
  handleClientDisconnect(clientId) {
    // 清理请求资源
    this.cleanupRequest(clientId);
    
    // 移除客户端记录
    this.clients.delete(clientId);
  }

  /**
   * 向客户端发送消息
   * @param {WebSocket} ws WebSocket连接
   * @param {Object} data 消息数据
   */
  sendToClient(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  /**
   * 关闭服务器
   */
  close() {
    if (this.wss) {
      // 清理所有请求
      for (const clientId of this.pendingRequests.keys()) {
        this.cleanupRequest(clientId);
      }
      
      // 关闭所有连接
      for (const ws of this.clients.values()) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }
      
      // 关闭服务器
      this.wss.close();
      console.log('WebSocket服务器已关闭');
    }
  }
}

// 创建单例
const wsService = new WebSocketService();

module.exports = wsService; 