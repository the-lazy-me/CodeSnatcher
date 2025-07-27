FROM node:18-alpine

# 创建工作目录
WORKDIR /app

# 复制package.json和package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制源代码
COPY . .

# 暴露API和WebSocket端口
EXPOSE 3000 3001

# 启动应用
CMD ["node", "src/index.js"] 