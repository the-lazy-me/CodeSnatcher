# 自动收邮件验证码程序

这是一个基于 Node.js 的自动收邮件验证码程序，可以通过 IMAP 协议监听指定邮箱，提取邮件中的验证码，并通过 WebSocket 或 HTTP API 实时返回给客户端。

## 功能特点

- 基于 IMAP 协议监听邮箱
- 支持多种验证码格式的自动提取
- 提供 WebSocket 接口实现实时通知
- 提供 HTTP API 接口支持长轮询
- 支持多客户端同时监听不同邮箱
- 自动重连和错误处理
- 支持 API 和 WebSocket 鉴权认证
- 简单的客户端示例

## 安装

1. 克隆仓库：

```bash
git clone https://github.com/yourusername/autoemail.git
cd autoemail
```

2. 安装依赖：

```bash
npm install
```

3. 配置环境变量：

创建 `.env` 文件，参考以下内容：

```
# 邮箱配置
EMAIL_USER=your_email@example.com
EMAIL_PASSWORD=your_email_password
EMAIL_HOST=imap.example.com
EMAIL_PORT=993
EMAIL_TLS=true

# 服务器配置
PORT=3000
WS_PORT=3001

# 认证配置
AUTH_ENABLED=true
API_TOKEN=your_api_token_here
WS_TOKEN=your_websocket_token_here
```

## 使用方法

### 启动服务

```bash
npm start
```

或者开发模式：

```bash
npm run dev
```

### WebSocket 客户端

使用 WebSocket 客户端连接到 `ws://localhost:3001`（或者您配置的端口）。

#### 认证

如果启用了认证（AUTH_ENABLED=true），连接后需要先发送认证消息：

```json
{
  "type": "authenticate",
  "payload": {
    "token": "your_websocket_token_here"
  }
}
```

认证成功后会收到响应：

```json
{
  "type": "auth_success",
  "message": "认证成功"
}
```

认证失败则会收到：

```json
{
  "type": "auth_error",
  "message": "无效的认证令牌"
}
```

#### 消息格式

1. 等待验证码：

```json
{
  "type": "wait_for_code",
  "payload": {
    "email": "example@domain.com",
    "timeout": 300000
  }
}
```

2. 取消等待：

```json
{
  "type": "cancel_wait",
  "payload": {}
}
```

3. 保持连接（ping）：

```json
{
  "type": "ping"
}
```

#### 响应格式

1. 连接成功：

```json
{
  "type": "connected",
  "clientId": "unique_client_id",
  "message": "连接成功"
}
```

2. 开始等待验证码：

```json
{
  "type": "waiting_for_code",
  "email": "example@domain.com",
  "message": "开始等待来自 example@domain.com 的验证码"
}
```

3. 收到验证码：

```json
{
  "type": "code_received",
  "payload": {
    "email": "sender@example.com",
    "subject": "您的验证码",
    "code": "123456",
    "receivedAt": "2023-01-01T12:00:00.000Z"
  }
}
```

4. 等待超时：

```json
{
  "type": "timeout",
  "message": "等待验证码超时"
}
```

5. 取消等待：

```json
{
  "type": "wait_cancelled",
  "message": "已取消等待验证码"
}
```

### HTTP API

#### 认证

如果启用了认证（AUTH_ENABLED=true），所有 API 请求需要在 Header 中添加认证令牌：

```
Authorization: Bearer your_api_token_here
```

#### 接口列表

1. 健康检查：

```
GET /health
```

2. 服务状态：

```
GET /status
```

3. 等待验证码（长轮询）：

```
POST /wait-for-code
Content-Type: application/json

{
  "email": "example@domain.com",
  "timeout": 60000
}
```

4. 手动检查邮件：

```
POST /check-mail
```

## 外部调用指南

### 方法一：使用 WebSocket 客户端

这是推荐的方式，适用于需要实时接收验证码的场景。

#### JavaScript 示例：

```javascript
// 创建 WebSocket 连接
const ws = new WebSocket('ws://your-server:3001');

// 连接建立后
ws.onopen = () => {
  console.log('连接已建立');
  
  // 发送认证请求（如果启用了认证）
  ws.send(JSON.stringify({
    type: 'authenticate',
    payload: {
      token: 'your_websocket_token_here'
    }
  }));
};

// 接收消息
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'auth_success') {
    // 认证成功，发送等待验证码请求
    ws.send(JSON.stringify({
      type: 'wait_for_code',
      payload: {
        email: 'target@example.com', // 要监听的邮箱地址
        timeout: 300000 // 5分钟超时
      }
    }));
  }
  else if (data.type === 'auth_error') {
    console.error('认证失败:', data.message);
  }
  else if (data.type === 'code_received') {
    // 收到验证码
    const code = data.payload.code;
    console.log('验证码:', code);
    
    // 在这里处理验证码，例如自动填写表单
    // document.getElementById('verification-input').value = code;
  }
};

// 错误处理
ws.onerror = (error) => {
  console.error('WebSocket错误:', error);
};

// 连接关闭
ws.onclose = () => {
  console.log('连接已关闭');
};

// 取消等待（如果需要）
function cancelWaiting() {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'cancel_wait',
      payload: {}
    }));
  }
}
```

#### Python 示例：

```python
import json
import websocket
import time
import threading

# 认证令牌
auth_token = "your_websocket_token_here"

# 连接回调
def on_open(ws):
    print("连接已建立")
    # 发送认证请求
    ws.send(json.dumps({
        "type": "authenticate",
        "payload": {
            "token": auth_token
        }
    }))

# 消息回调
def on_message(ws, message):
    data = json.loads(message)
    
    if data["type"] == "auth_success":
        print("认证成功")
        # 发送等待验证码请求
        ws.send(json.dumps({
            "type": "wait_for_code",
            "payload": {
                "email": "target@example.com",  # 要监听的邮箱地址
                "timeout": 300000  # 5分钟超时
            }
        }))
    elif data["type"] == "auth_error":
        print(f"认证失败: {data.get('message')}")
    elif data["type"] == "code_received":
        # 收到验证码
        code = data["payload"]["code"]
        print(f"验证码: {code}")
        
        # 在这里处理验证码

# 错误回调
def on_error(ws, error):
    print(f"错误: {error}")

# 关闭回调
def on_close(ws, close_status_code, close_msg):
    print("连接已关闭")

# 创建WebSocket连接
def connect_websocket():
    websocket.enableTrace(True)
    ws = websocket.WebSocketApp("ws://your-server:3001",
                              on_open=on_open,
                              on_message=on_message,
                              on_error=on_error,
                              on_close=on_close)
    
    # 启动WebSocket连接
    ws.run_forever()

# 在后台线程中运行WebSocket
websocket_thread = threading.Thread(target=connect_websocket)
websocket_thread.daemon = True
websocket_thread.start()

# 保持主线程运行
try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    print("程序已终止")
```

### 方法二：使用 HTTP API

适用于不需要实时性或无法使用 WebSocket 的场景。

#### JavaScript 示例（使用 fetch）：

```javascript
// API令牌
const apiToken = 'your_api_token_here';

// 等待验证码
async function waitForCode(email) {
  try {
    const response = await fetch('http://your-server:3000/wait-for-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`  // 添加认证头
      },
      body: JSON.stringify({
        email: email,
        timeout: 60000 // 1分钟超时
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP错误: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success && data.data.code) {
      console.log('验证码:', data.data.code);
      return data.data.code;
    } else {
      throw new Error('未能获取验证码');
    }
  } catch (error) {
    console.error('获取验证码失败:', error);
    return null;
  }
}

// 使用示例
waitForCode('target@example.com').then(code => {
  if (code) {
    // 处理验证码
    console.log('成功获取验证码:', code);
  }
});
```

#### Python 示例（使用 requests）：

```python
import requests
import json

# API令牌
api_token = "your_api_token_here"

def wait_for_code(email, timeout=60000):
    try:
        response = requests.post(
            'http://your-server:3000/wait-for-code',
            headers={
                'Authorization': f'Bearer {api_token}'  # 添加认证头
            },
            json={
                'email': email,
                'timeout': timeout
            },
            timeout=(timeout/1000) + 5  # 请求超时时间比等待时间多5秒
        )
        
        response.raise_for_status()  # 检查HTTP错误
        data = response.json()
        
        if data.get('success') and data.get('data', {}).get('code'):
            code = data['data']['code']
            print(f"验证码: {code}")
            return code
        else:
            print("未能获取验证码")
            return None
            
    except requests.exceptions.Timeout:
        print("请求超时")
        return None
    except requests.exceptions.RequestException as e:
        print(f"请求错误: {e}")
        return None

# 使用示例
code = wait_for_code('target@example.com')
if code:
    # 处理验证码
    print(f"成功获取验证码: {code}")
```

### 在实际应用中的集成

1. **自动化测试**：将验证码接收器集成到测试框架中，自动处理需要验证码的测试场景。

2. **注册流程**：在用户注册流程中，自动填写验证码，提高注册转化率。

3. **批量操作**：在需要处理多个账号的场景中，自动化验证码获取过程。

4. **API集成**：将验证码接收功能作为中间件集成到您的API中。

## 客户端示例

项目包含一个简单的 HTML 客户端示例 `client-example.html`，可以直接在浏览器中打开使用。该示例已包含认证功能。

## 安全建议

1. 在生产环境中务必启用认证（AUTH_ENABLED=true）
2. 使用强密码作为API和WebSocket令牌
3. 定期更换认证令牌
4. 使用HTTPS/WSS加密通信
5. 限制API访问频率，防止暴力破解

## 注意事项

1. 确保您的邮箱服务器支持 IMAP 协议并已开启
2. 对于 Gmail，您可能需要开启"不太安全的应用"访问权限或使用应用专用密码
3. 建议在生产环境中使用 HTTPS/WSS 以保证安全性
4. 验证码提取基于正则表达式，可能需要根据实际邮件格式调整

## 许可证

MIT 