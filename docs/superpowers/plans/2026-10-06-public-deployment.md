# insong.me Public Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if the user chooses delegated execution. Steps use checkbox syntax for tracking.

**Goal:** 将正式项目部署到 insong.me，使用 Vercel、Render Free 和 Supabase Free，并接入 GitHub main 自动部署。

**Architecture:** Vercel 托管 React 静态资源，并将同源 `/api` 请求转发到 Render 的单进程 FastAPI。PostgreSQL 在独立 Supabase 项目的 `insong` schema 中保存记录、会话和照片；量化 E5 随后端镜像部署。

**Tech Stack:** React / Vite / TypeScript / pnpm，Python / FastAPI / SQLAlchemy / psycopg，PostgreSQL，ONNX Runtime，Docker，GitHub Actions。

**Spec:** [已确认的迁移方案](../specs/2026-10-06-public-deployment-design.md)

## Global Constraints

- 本地默认 SQLite；云端通过 `DATABASE_URL` 使用 PostgreSQL，云端缺少配置时启动失败。
- 云端表放在独立的 `insong` schema，该 schema 不加入 Supabase 的 Data API 暴露列表。
- 照片沿用校验、去除元数据、压缩后存入 PostgreSQL 的流程和所有权检查。
- 云端 Cookie 使用 HttpOnly、Secure、SameSite=Lax，路径为 `/`；私人数据及会话响应禁止缓存。
- 保留现有接口、手机端行为、样例及关键词回退；正常样例的 E5 语义搜索必须确实成功。
- Vercel、Render、Supabase均选择免费方案；使用正式仓库 `Saskia-1/TME` 的 main 分支。
- 本机数据库保留；云端初始数据来自仓库的虚构样例。

## Review Focus

1. 初始化后自增编号冲突、重复启动恢复已删除样例：Task 2 验证新用户、新记录及重复启动。
2. Unicode 标签和多图公开权限在 PostgreSQL 下变化：Task 2 验证精确标签、多图公开与撤回。
3. 转发后 Cookie 丢失或错误来源可写入：Task 3 验证来源和 Cookie；Task 5 用手机浏览器验证。
4. 数据库断连或 Render 冷启动后误用临时数据库：Task 1 验证配置失败；Task 5 验证重启持久化和冷启动恢复。
5. 免费实例中 E5 或大图处理耗尽内存：Task 4 验证限制；Task 5 实测语义搜索及资源峰值。

## 文件职责

- `backend/app/settings.py`：环境、数据库 URL、允许来源、Cookie 配置。
- `backend/app/database.py`、`backend/app/database_compat.py`：数据库连接、schema、初始化、方言差异。
- `backend/app/models.py`、`main.py`、`accounts.py`、`photos.py`、`stories.py`、`footprints.py`、`card_metadata.py`：接入兼容层和生产配置。
- `backend/tests/test_deployment_settings.py`、`test_postgres_flow.py`：配置行为和真实 PostgreSQL 流程。
- `backend/Dockerfile`、`.dockerignore`、`render.yaml`、`backend/requirements-deploy.txt`、`backend/.env.example`：可重建的后端镜像和免费部署参数。
- `frontend/vercel.json`、`frontend/package.json`、`.github/workflows/ci.yml`：前端发布路由和自动检查。
- `docs/DEPLOY.md`：实际服务地址、配置步骤、验收与恢复方法，不写凭证。

## Task 1：生产配置和数据库连接

**Interfaces:** 新增不可变 `Settings` 及 `load_settings() -> Settings`；新增 `create_database_engine(database_url: str, schema: str = 'insong') -> Engine`。保留 `create_sqlite_engine` 的本地兼容入口。`create_app(database_url=None)` 使用显式参数或 Settings。

- [ ] 写配置测试，覆盖默认 SQLite、`postgres://` URL 规范化、生产缺少 DATABASE_URL、生产使用临时 SQLite、非法 schema 和来源配置；断言失败时不包含密码。
- [ ] 运行 `pytest tests/test_deployment_settings.py -q`，确认新行为尚不存在而失败。
- [ ] 在 settings.py、database.py、main.py 实现 URL 选择、PostgreSQL psycopg 驱动、小连接池及连接健康检查。生产使用 TLS 验证；测试数据库在本地独立容器中运行。
- [ ] 实现 schema 初始化，限定安全 schema 名；明确失败，不自动退回临时数据库。
- [ ] 运行新测试和 `pytest tests/test_app_database.py -q`；记录 PostgreSQL 引擎连接结果。
- [ ] 提交该任务的代码和测试。

## Task 2：PostgreSQL 上的完整记录流程

**Interfaces:** database_compat.py 提供 `conflict_insert(db: OrmSession, table) -> Insert`、`json_array_contains(column: ColumnElement[str], value: str, dialect_name: str) -> ColumnElement[bool]` 和 `synchronize_sequences(connection) -> None`。`public_query` 保留现有五个筛选参数，并新增 `dialect_name: str = 'sqlite'`，使用调用者数据库方言。

- [ ] 为真实 PostgreSQL 编写下列行为测试，测试数据库使用独立 schema，与正式库隔离：

- `test_seed_restart_preserves_changes_and_deleted_samples`：修改样例文字并删除另一张卡；重新创建应用后，文字与修改后的值相同，已删除卡仍返回 404。
- `test_new_account_and_record_ids_follow_seeded_ids`：初始化后注册成功返回 201，用户编号大于 2；新记录编号大于初始化完成时已消耗的最大 receipt 编号。删除记录后新记录不得复用旧编号。
- `test_public_unicode_tag_matches_exact_tag`：创建公开标签 `跨城追星`；按该标签查询命中，按 `跨城` 查询不命中。
- `test_multi_photo_publication_and_withdrawal_enforce_access`：记录关联两张照片；私密时匿名读取两张均为 404，公开后均为 200，撤回后均为 404，作者仍能读取。
- `test_record_photo_snapshot_and_collections_survive_restart`：保存记录、照片、场次快照、歌手关注、场次收藏和歌单；重启应用后逐项读取的标识、文字与照片字节相同。

- [ ] 启动本机 Docker，用官方 PostgreSQL 镜像提供临时测试库；确认这些测试在未适配的代码上失败。若 Docker 服务不能启动，使用独立远程测试库并说明实际环境。
- [ ] 在兼容层、database.py、models.py 处理冲突插入、布尔默认值、JSON 查询和样例自增序列；在现有调用处接入。初始化需幂等，序列同步不能降低已消耗编号。
- [ ] 标签与照片查询必须在 PostgreSQL 真正执行，保留撤回公开后不可读和作者可读的行为。
- [ ] 运行 PostgreSQL 测试和完整 `pytest -q`；不得仅凭 SQL 编译通过认定流程可用。
- [ ] 提交适配及测试。

## Task 3：云端登录和同源访问

**Interfaces:** Settings 提供 `allowed_origins: tuple[str, ...]` 和 `cookie_secure: bool`。main.py 与 accounts.py 共用该配置；浏览器继续以空 `VITE_API_BASE_URL` 请求相对 `/api`。

- [ ] 测试 production 环境下 `https://insong.me` 可写入、未批准来源返回 403、转发后的登录 Cookie 含 Secure / HttpOnly / SameSite=Lax，并验证登录和登出。
- [ ] 先运行相关测试确认失败，再在生产配置、middleware 和 Cookie 写入处接入 Settings；保留本地测试和开发来源。
- [ ] 运行完整后端测试及前端测试，确认 API 接口和权限仍兼容。
- [ ] 提交该任务。

## Task 4：镜像、模型和自动检查

**Interfaces:** requirements-deploy.txt 安装 PostgreSQL 驱动和现有 AI 依赖；镜像通过环境 DATABASE_URL、CORS_ORIGINS、APP_ENV 和 PORT 运行；`/api/health` 是部署健康检查。

- [ ] 新增 Dockerfile、排除规则和 Render Free Blueprint，镜像仅包含应用、必要媒体和模型；以非 root 用户运行单进程 Uvicorn。
- [ ] 镜像构建时从已有模型源下载固定 revision `761b726dd34fb83930e26aab4e9ac3899aa1fa78` 的量化模型及 tokenizer。运行时不下载权重、不依赖本机 models 目录。
- [ ] 用容器和临时 PostgreSQL 启动完整应用，验证 health、样例、多图和实际语义搜索；检查模型缺失、超时和超过上传限制时的反馈。
- [ ] 新增 GitHub Actions：前端测试与构建、后端 SQLite 测试、官方 PostgreSQL service 上的集成测试。所有测试凭证仅用于 CI 临时服务。
- [ ] 运行完整测试、前端生产构建、后端镜像构建；测量模型加载和搜索的内存。资源调整需以测量为依据，保留语义功能。
- [ ] 提交配置及必要验证代码。

## Task 5：平台部署、域名和自动发布验收

**Interfaces:** Render 控制台产生真实 `backend_origin`；Vercel 配置据此转发 `/api/:path*`，SPA fallback 位于 API 规则之后。Supabase 凭证只进入 Render 的 DATABASE_URL。

- [ ] 在登录后的 Supabase 核对免费项目额度，创建独立项目；由用户完成数据库密码设置。选择 Session pooler，通过安全方式将连接配置加入 Render。
- [ ] 在 Render 建立 Free Docker 服务，连接正式仓库，设置生产来源、数据库、TLS 和健康检查。仅在具体 GitHub 授权需要扩大权限时请求确认。
- [ ] 创建 frontend/vercel.json，写入已验证的 Render 外部地址；配置前端测试后构建、静态资源和 SPA fallback。在 Vercel 创建独立前端项目，根目录为 frontend。
- [ ] 用平台默认地址验证注册、登录、多图记录、公开、撤回、收藏、重启持久化和语义匹配。进行一个冷启动测试，检查失败后的内容保留和可重试体验。
- [ ] 将验证通过的变更集成到 main 并推送；Render 选择 After CI Checks Pass，Vercel 使用 main 生产分支。观察实际 CI、自动构建和部署状态，核对两端提交。
- [ ] 在前后端就绪后，将 insong.me 从测试 Worker 切换到 Vercel 给出的解析目标，按实际页面完成需要确认的旧绑定移除操作。
- [ ] 从手机浏览器验证 HTTPS、Cookie、深链接、图片、地图和创建流程；请用户在国内受影响网络关闭 VPN 复测，分别报告网络和功能结果。
- [ ] 写 docs/DEPLOY.md 的实际配置步骤和恢复方法；保存必要的最终验证证据。核对精确目标后清理本次临时数据库、辅助文件和测试记录。

## 完成判定

只有正式项目在 insong.me 可访问、数据库和照片跨重启保留、E5 语义模式确实工作，以及一次 main 提交实际触发两端部署，才能报告部署完成。未执行或被平台账号权限阻挡的检查必须逐项说明。
