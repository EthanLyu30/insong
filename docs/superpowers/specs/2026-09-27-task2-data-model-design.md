# Task 2：SQLite 数据模型与演示数据设计

## 目标与边界

为「歌里有我」H5 Demo 建立可持久化的数据基础，供后续演示身份、私密记忆、公开控制和发现功能复用。Task 2 只交付数据库模型、初始化、演示数据及其测试；不提前开放身份、记忆或公开故事 API，也不改动前端页面流程。

当前 `/api/songs` 与 `/api/songs/{song_id}` 改为读取 SQLite，但保持 Task 1 的 JSON 字段和错误行为，避免破坏现有 H5。

## 存储与生命周期

- 使用 SQLAlchemy 2.x 和 SQLite。默认文件为 `backend/data/demo.db`，路径不依赖启动时的工作目录；数据库文件继续由 `.gitignore` 排除。
- FastAPI 启动时创建表，并仅在全新数据库中以单个事务执行 Seed。重复启动不得重复插入数据，也不得恢复已被编辑、撤回公开或删除的演示故事。
- 提供可注入数据库 URL 的应用创建入口，测试使用独立临时 SQLite 文件；`uvicorn app.main:app` 的启动方式保持不变。
- 不在 Task 2 引入 Alembic。此 Demo 的初始版本使用 `create_all`；未来如需升级已有数据库，再单独设计迁移方案。

## 模型

| 模型 | 核心字段与约束 |
| --- | --- |
| `User` | 整数主键、`display_name`、`is_demo`。Seed 固定建立小林与阿远两个演示用户，后续 Task 3 以稳定 ID 选择帐号。 |
| `Song` | 整数主键、`title`、`artist`、`version`、`source_label`、`is_demo`、`audio_available`、`created_at`。Seed 歌曲 ID 维持 1—5，以保持现有页面链接和占位封面稳定。 |
| `MemoryCard` | 整数主键、`owner_id`、`song_id`、`story`、可空的 `life_time` 和 `scene`、`visibility`、`is_demo_sample`、`created_at`、`updated_at`。可见性只允许 `private` / `public`，默认 `private`；演示样例显式设为 `public`。 |
| `Tag` | 整数主键、唯一的 `name`。名称统一保存不带 `#` 的文本，展示层再加 `#`。 |
| `MemoryCardTag` | `memory_card_id` 与 `tag_id` 组成复合主键，避免重复关联；删除记忆时关联记录同步移除。 |
| `Session` | 字符串主键 `id`、`user_id`、`created_at`、可空的 `expires_at`。Task 2 只建表，不创建登录会话或 Cookie。 |

外键连接用户、歌曲、记忆卡与标签；启用 SQLite 外键约束。时间以 UTC 存储。10—500 字故事及最多 3 个 Tag 的输入校验将在 Task 4 API 层实现；Task 2 的 Seed 数据自身满足这些限制。

## Seed 数据与来源标注

- 两名受控演示用户：小林、阿远；没有真实用户身份或外部帐号数据。
- 五首既有虚构歌曲，保留当前名称、`Demo Artist`、版本、`虚构演示曲目` 标记和 `audio_available=false`；不引入封面、歌词或音频素材。
- 至少五条原创的虚构公开故事，关联演示歌曲与两个演示用户，均设置 `is_demo_sample=true`，每条 10—500 字，可配 0—3 个预设 Tag。它们仅供功能演示，不作为真实用户反馈。
- Seed 使用稳定的用户、歌曲和故事 ID。初始化事务以首首演示歌曲为已完成标记：标记存在时跳过整个 Seed，不补回后来被删除的故事；事务失败则整体回滚，避免半套演示数据。

## API 与权限边界

歌曲列表和详情由数据库查询并序列化为现有字段；不存在的歌曲继续返回 404。Task 2 不增加公开故事、搜索或记忆详情接口，因此 Seed 故事不会因新接口提前暴露。Task 3 起的身份和权限判断必须在服务端完成；本阶段的默认私密约束为其提供基础，但不能替代权限测试。

## 验证与完成标准

- 测试新数据库从零初始化、两次初始化不重复、重启后数据仍在、已删除或撤回的样例不会因重启恢复，以及 2 用户、5 歌曲、至少 5 条公开且标记为演示样例的故事。
- 测试模型关系、默认私密状态和已有歌曲 API 的兼容性；测试数据全部落在临时目录，不依赖或污染 `backend/data/demo.db`。
- 执行后端 `pytest`、前端构建和 `git diff --check`；确认数据库、环境文件与凭据未入 Git。
- Task 2 功能与测试通过后，按既定分支提交 `feat: add demo data model` 并通过 HTTPS 推送。未成功推送不视为完成。
