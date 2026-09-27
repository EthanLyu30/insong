# 歌里有我

腾讯音乐高校 AI Hackathon 的 H5 Demo。首版聚焦演唱会结束后的歌迷：把一首歌与一段人生经历保存在同一张音乐记忆卡中。

## 当前进度

TASK 1：React H5 首页、演示歌曲页、FastAPI 健康检查与歌曲接口。记忆创建、账号、数据库、搜索和公开控制仍在后续任务中，当前页面会明确提示未接入。

## 本地启动

后端：

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

前端：

```bash
cd frontend
npm install
npm run dev
```

前端默认 `http://localhost:5173`，后端默认 `http://localhost:8000`。本地 Vite 会将 `/api` 转发给后端；若部署在不同域名，复制 `frontend/.env.example` 为 `frontend/.env` 并配置 `VITE_API_BASE_URL`。

## 素材说明

当前歌曲均为虚构演示曲目，封面由页面样式生成，未使用真实 QQ 音乐数据、歌词或音频。当前演示环境未接入已授权音源。
