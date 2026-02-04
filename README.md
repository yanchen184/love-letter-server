# Love Letter Server

情書桌遊連線對戰伺服器

## 部署到 Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new)

## API

- `GET /` - 伺服器狀態
- `GET /health` - 健康檢查
- `WS /ws/game/{roomId}` - 遊戲 WebSocket
