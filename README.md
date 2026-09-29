# 歌里有我

腾讯音乐高校 AI Hackathon 的 H5 Demo。首版聚焦演唱会结束后的歌迷：把一首歌与一段人生经历保存在同一张音乐记忆卡中。

## 当前进度

已实现 React H5 首页与歌曲页、FastAPI 歌曲接口、SQLAlchemy/SQLite 数据模型和种子数据、演示账号会话，以及带可见性检查的记忆详情读取接口。

记忆创建、个人记忆列表和发现页面仍为占位流程；创建、编辑、删除、发布与撤回、音乐片段定位和 AI 检索尚未完成。演示身份可由访问者自行切换，不适合保存真实私人经历。当前未接入 TME 账号、曲库或播放器。

## 产品方案

[PRD v2 差异化方案](docs/歌里有我_PRD_v2_差异化方案.md) 是产品修订提案，建议优先完成“私人记录 → 本人经历找回 → 重听音乐片段”，再验证公开共鸣。文档包含竞品证据、与 v1 的取舍、验收条件和演示路径；其中新增需求不代表已经实现。

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

当前歌曲均为虚构演示曲目，封面使用演示图片素材，未使用真实 QQ 音乐数据、歌词或音频。当前演示环境未接入已授权音源。
