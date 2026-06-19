# 打牌记账后端服务

这是给自有服务器部署用的 Node.js + SQLite 后端。当前先作为独立服务存在，不会影响小程序现有本地存储逻辑。

## 本地运行

```bash
cd server
npm install
npm run start
```

默认监听：

```text
http://127.0.0.1:3000
```

健康检查：

```bash
curl http://127.0.0.1:3000/health
```

## 环境变量

复制 `.env.example` 为 `.env` 后按需配置。当前代码不自动读取 `.env`，服务器上建议用 systemd 或进程管理工具注入环境变量。

```text
PORT=3000
SQLITE_PATH=./data/dapai-jizhang.sqlite
WECHAT_APPID=你的小程序 AppID
WECHAT_SECRET=你的小程序 AppSecret
```

## 主要接口

```text
GET    /health
POST   /api/auth/wechat
GET    /api/rooms
POST   /api/rooms
GET    /api/rooms/:id
GET    /api/rooms/by-code/:code
PUT    /api/rooms/:id/owner-profile
POST   /api/rooms/:id/players
POST   /api/rooms/:id/rounds
DELETE /api/rooms/:id/rounds/:roundId
POST   /api/rooms/:id/settlement
POST   /api/rooms/:id/finish
GET    /api/histories
GET    /api/histories/:id
```

## 部署提醒

微信小程序正式请求后端时，接口域名必须是 HTTPS，并且要在微信公众平台配置到 `request 合法域名`。

建议部署结构：

```text
微信小程序 -> https://api.example.com -> Nginx -> Node.js:3000 -> SQLite
```

SQLite 数据库文件默认在 `server/data/`，这个目录已加入 `.gitignore`，部署时要做好备份。

## Linux 服务器部署示例

假设项目放在：

```text
/opt/dapai-jizhang
```

安装依赖并启动测试：

```bash
cd /opt/dapai-jizhang/server
npm install --omit=dev
PORT=3000 SQLITE_PATH=/opt/dapai-jizhang/server/data/dapai-jizhang.sqlite npm start
```

systemd 示例：

```ini
[Unit]
Description=Dapai Jizhang API
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/dapai-jizhang/server
Environment=PORT=3000
Environment=SQLITE_PATH=/opt/dapai-jizhang/server/data/dapai-jizhang.sqlite
Environment=WECHAT_APPID=你的小程序AppID
Environment=WECHAT_SECRET=你的小程序AppSecret
ExecStart=/usr/bin/node src/app.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Nginx 反向代理示例：

```nginx
server {
  listen 443 ssl http2;
  server_name api.example.com;

  ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

微信公众平台里把下面域名加入 `request 合法域名`：

```text
https://api.example.com
```
