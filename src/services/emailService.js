const Imap = require('imap');
const { simpleParser } = require('mailparser');
const config = require('../config/config');
const { extractVerificationCode } = require('../utils/codeExtractor');

class EmailService {
  constructor() {
    this.imap = null;
    this.listeners = new Map();
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = config.email.reconnectMaxAttempts;
    this.reconnectInterval = config.email.reconnectInterval;
    this.processedEmails = new Set(); // 存储已处理过的邮件ID
  }

  /**
   * 初始化IMAP连接
   */
  initialize() {
    this.imap = new Imap({
      user: config.email.user,
      password: config.email.password,
      host: config.email.host,
      port: config.email.port,
      tls: config.email.tls,
      tlsOptions: config.email.tlsOptions
    });

    this.setupEventListeners();
    this.connect();
  }

  /**
   * 设置IMAP事件监听器
   */
  setupEventListeners() {
    this.imap.once('ready', () => {
      console.log('邮箱连接成功');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.startWatching();
    });

    this.imap.once('error', (err) => {
      console.error('邮箱连接错误:', err);
      this.handleConnectionError();
    });

    this.imap.once('end', () => {
      console.log('邮箱连接已关闭');
      this.isConnected = false;
      this.handleConnectionError();
    });
  }

  /**
   * 处理连接错误，尝试重新连接
   */
  handleConnectionError() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`尝试重新连接 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      setTimeout(() => this.connect(), this.reconnectInterval);
    } else {
      console.error('达到最大重连次数，停止重连');
    }
  }

  /**
   * 连接到IMAP服务器
   */
  connect() {
    if (this.imap && !this.isConnected) {
      try {
        this.imap.connect();
      } catch (error) {
        console.error('连接时出错:', error);
        this.handleConnectionError();
      }
    }
  }

  /**
   * 开始监听收件箱
   */
  startWatching() {
    this.imap.openBox('INBOX', false, (err, box) => {
      if (err) {
        console.error('打开收件箱失败:', err);
        return;
      }

      console.log('开始监听收件箱');
      this.setupMailListener();
      
      // 初始化时标记旧邮件为已读
      this.markOldEmailsAsRead();
    });
  }

  /**
   * 标记旧邮件为已读
   */
  markOldEmailsAsRead() {
    const thirtyMinutesAgo = new Date();
    thirtyMinutesAgo.setMinutes(thirtyMinutesAgo.getMinutes() - 30);
    
    // 搜索30分钟前的未读邮件
    const searchCriteria = [
      'UNSEEN',
      ['BEFORE', thirtyMinutesAgo]
    ];
    
    this.imap.search(searchCriteria, (err, results) => {
      if (err) {
        console.error('搜索旧邮件失败:', err);
        return;
      }
      
      if (results.length === 0) {
        console.log('没有超过30分钟的未读邮件');
        return;
      }
      
      console.log(`发现 ${results.length} 封超过30分钟的未读邮件，标记为已读`);
      
      // 标记为已读
      this.imap.setFlags(results, ['\\Seen'], (err) => {
        if (err) {
          console.error('标记旧邮件为已读失败:', err);
        } else {
          console.log(`已成功标记 ${results.length} 封旧邮件为已读`);
        }
      });
    });
  }

  /**
   * 设置邮件监听器
   */
  setupMailListener() {
    this.imap.on('mail', () => {
      console.log('收到新邮件，正在检查...');
      this.checkNewEmails();
    });
    
    // 设置定时检查，以防邮件事件未触发
    this.checkInterval = setInterval(() => {
      console.log('定时检查新邮件...');
      this.checkNewEmails();
      
      // 同时检查并标记旧邮件为已读
      this.markOldEmailsAsRead();
    }, config.email.checkInterval)
  }

  /**
   * 检查新邮件
   */
  checkNewEmails() {
    this.imap.search(['UNSEEN'], (err, results) => {
      if (err) {
        console.error('搜索未读邮件失败:', err);
        return;
      }

      if (results.length === 0) {
        console.log('没有新的未读邮件');
        return;
      }

      console.log(`发现 ${results.length} 封未读邮件`);
      this.fetchEmails(results);
    });
  }

  /**
   * 获取邮件内容
   * @param {Array} results 邮件ID列表
   */
  fetchEmails(results) {
    const fetch = this.imap.fetch(results, { bodies: '', markSeen: false });

    fetch.on('message', (msg, seqno) => {
      console.log(`处理邮件 #${seqno}`);
      let mailUID;
      
      msg.on('attributes', (attrs) => {
        mailUID = attrs.uid;
      });
      
      msg.on('body', (stream) => {
        let buffer = '';
        
        stream.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
        });
        
        stream.once('end', () => {
          simpleParser(buffer, (err, mail) => {
            if (err) {
              console.error('解析邮件失败:', err);
              return;
            }
            
            // 检查是否已处理过此邮件
            if (mailUID && this.processedEmails.has(mailUID)) {
              console.log(`邮件 UID:${mailUID} 已处理过，跳过`);
              return;
            }
            
            this.processEmail(mail, mailUID);
          });
        });
      });
    });

    fetch.once('error', (err) => {
      console.error('获取邮件时出错:', err);
    });
  }

  /**
   * 处理邮件内容，提取验证码
   * @param {Object} mail 解析后的邮件对象
   * @param {Number} uid 邮件UID
   */
  processEmail(mail, uid) {
    try {
      const { from, to, subject, text, html, date } = mail;
      const sender = from?.text || '';
      
      // 处理收件人，可能是数组或单个对象
      let recipients = [];
      if (to) {
        if (Array.isArray(to)) {
          recipients = to.map(t => t.text || t.address || '').filter(Boolean);
        } else if (typeof to === 'object') {
          const recipientText = to.text || to.address || '';
          if (recipientText) recipients.push(recipientText);
        } else if (typeof to === 'string') {
          recipients.push(to);
        }
      }
      
      // 如果没有找到收件人，使用空字符串
      const recipientStr = recipients.join(', ');
      
      const emailData = {
        from: sender,
        to: recipientStr,
        subject: subject || '',
        date: date,
        text: text || '',
        html: html || ''
      };

      console.log(`收到来自 ${sender} 的邮件，发送给 ${recipientStr}，主题: ${subject}`);
      console.log(`邮件内容: ${text ? text.substring(0, config.codeExtractor.logEmailContentLength) + '...' : '无文本内容'}`);
      
      // 提取验证码
      const verificationCode = extractVerificationCode(emailData);
      
      if (verificationCode) {
        console.log(`提取到验证码: ${verificationCode}`);
        
        // 标记邮件为已读
        if (uid) {
          this.markEmailAsRead(uid);
          // 添加到已处理列表
          this.processedEmails.add(uid);
        }
        
        // 通知所有监听此收件人邮箱的客户端
        for (const recipient of recipients) {
          console.log(`尝试通知监听 ${recipient} 的客户端`);
          this.notifyListeners(recipient, {
            email: recipient,
            from: sender,
            subject: subject,
            code: verificationCode,
            receivedAt: date
          });
          
          // 尝试通知可能的别名或子域名
          if (recipient.includes('@')) {
            const [localPart, domain] = recipient.split('@');
            // 尝试通配符监听
            this.notifyListeners(`*@${domain}`, {
              email: recipient,
              from: sender,
              subject: subject,
              code: verificationCode,
              receivedAt: date
            });
          }
        }
        
        // 同时也通知监听发件人的客户端（兼容旧版本）
        console.log(`尝试通知监听 ${sender} 的客户端`);
        this.notifyListeners(sender, {
          email: recipientStr,
          from: sender,
          subject: subject,
          code: verificationCode,
          receivedAt: date
        });
        
        // 通知通配符监听器
        console.log(`尝试通知通配符监听器`);
        this.notifyListeners('*', {
          email: recipientStr,
          from: sender,
          subject: subject,
          code: verificationCode,
          receivedAt: date
        });
      } else {
        console.log('未能提取到验证码');
        console.log(`邮件主题: "${subject}"`);
        console.log(`邮件内容片段: "${text ? text.substring(0, config.codeExtractor.logEmailContentFullLength) : '无文本内容'}"`);
        
        // 检查邮件接收时间，如果超过30分钟，标记为已读
        const now = new Date();
        const emailDate = new Date(date);
        const timeDiffMinutes = (now - emailDate) / (1000 * 60);
        
        if (timeDiffMinutes > 30) {
          console.log(`邮件接收时间超过30分钟，标记为已读`);
          if (uid) {
            this.markEmailAsRead(uid);
          }
        }
      }
    } catch (error) {
      console.error('处理邮件时出错:', error);
    }
  }

  /**
   * 标记邮件为已读
   * @param {Number} uid 邮件UID
   */
  markEmailAsRead(uid) {
    if (!uid) return;
    
    this.imap.setFlags([uid], ['\\Seen'], (err) => {
      if (err) {
        console.error(`标记邮件 UID:${uid} 为已读失败:`, err);
      } else {
        console.log(`已标记邮件 UID:${uid} 为已读`);
      }
    });
  }

  /**
   * 注册监听器
   * @param {string} email 要监听的邮箱地址
   * @param {Function} callback 回调函数
   * @returns {string} 监听器ID
   */
  registerListener(email, callback) {
    const listenerId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    if (!this.listeners.has(email)) {
      this.listeners.set(email, new Map());
    }
    
    this.listeners.get(email).set(listenerId, callback);
    console.log(`注册了对 ${email} 的监听，ID: ${listenerId}`);
    
    return listenerId;
  }

  /**
   * 移除监听器
   * @param {string} email 邮箱地址
   * @param {string} listenerId 监听器ID
   */
  removeListener(email, listenerId) {
    if (this.listeners.has(email)) {
      const result = this.listeners.get(email).delete(listenerId);
      console.log(`移除了对 ${email} 的监听器 ${listenerId}: ${result ? '成功' : '失败'}`);
      
      // 如果该邮箱没有监听器了，则移除整个邮箱条目
      if (this.listeners.get(email).size === 0) {
        this.listeners.delete(email);
      }
    }
  }

  /**
   * 通知监听器
   * @param {string} email 邮箱地址
   * @param {Object} data 邮件数据
   */
  notifyListeners(email, data) {
    // 通知特定邮箱的监听器
    if (this.listeners.has(email)) {
      this.listeners.get(email).forEach((callback) => {
        callback(data);
      });
    }
    
    // 通知通配符监听器（监听所有邮箱）
    if (this.listeners.has('*')) {
      this.listeners.get('*').forEach((callback) => {
        callback(data);
      });
    }
  }

  /**
   * 手动检查邮件
   */
  manualCheck() {
    if (this.isConnected) {
      console.log('手动检查新邮件...');
      this.checkNewEmails();
      return true;
    } else {
      console.error('IMAP 未连接，无法检查邮件');
      return false;
    }
  }

  /**
   * 关闭连接
   */
  close() {
    // 清除定时检查
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    if (this.imap && this.isConnected) {
      this.imap.end();
      this.isConnected = false;
    }
  }
}

// 创建单例
const emailService = new EmailService();

module.exports = emailService; 