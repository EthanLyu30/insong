# 香港服务器迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有项目、数据和自动发布迁至已购买的腾讯香港服务器，缩短手机访问等待。

**Architecture:** Nginx 提供 HTTPS、静态前端和同源 API；非 root 后端镜像与 PostgreSQL 在专用容器网络运行，数据库保持 TLS verify-full。经 CI 验证的发布产物通过受限账户上传，预热新版本后切换，数据卷独立于代码版本。

**Tech Stack:** Ubuntu 24.04、Docker Compose、Nginx、Certbot、PostgreSQL 17、现有 FastAPI/Vite/E5、GitHub Actions。

**Spec:** docs/superpowers/specs/2026-10-07-hong-kong-deployment-design.md

## Global Constraints

- 使用已经购买的香港 2核4GB/70GB/30Mbps 实例和 50GB 优选流量包，继续使用 insong.me。
- 源仓库 lxy 先推送，再把同一个提交推到个人部署仓库 main；生产发布仅允许后者 main 的成功 CI。
- 保留非 root 单进程后端、固定版本 E5、私密数据权限、Secure/HttpOnly/Lax Cookie、数据库 verify-full。
- 数据库与后端不开放独立公网服务，私密响应 no-store；只开放网站需要的 HTTP/HTTPS。
- 凭据、备份和真实用户内容不进入 Git、前端和工具输出；不修改 spoken，不导入本地 SQLite。
- 数据迁移前冻结原后端写入；恢复和核对成功后才切换 DNS；保留必要回滚资源。
- 由本任务直接执行，沿用用户已经选择的方式。新增 SSH 登录授权、凭据录入和浏览器涉及安全的变更在具体动作时按规则处理。

## Review Focus

- 恶意或损坏的发布包：拒绝路径穿越、链接、重复条目及哈希不符，不覆盖当前版本；Task 3 测试覆盖。
- 错误数据库证书或主机名：生产连接拒绝且日志不泄露 URI；Task 2 原生连接检查覆盖。
- 发版失败、并发及旧页面延迟加载：保留健康版本和旧指纹资源；Task 3/4 覆盖。
- 数据迁移期间的写入、会话和照片：写入拒绝可重试、身份编号和照片字节保持一致；Task 1/5 覆盖。
- 来自 PR、其他仓库或旧提交的发布事件：不能获得生产发布能力；Task 4 覆盖。

---

### Task 1：迁移期间的写入保护

**Files:** Modify `backend/app/settings.py`, `backend/app/main.py`, `backend/.env.example`; Create `backend/tests/test_migration_read_only.py`.

**Interfaces:** Produces `Settings.migration_read_only: bool`，环境变量 `MIGRATION_READ_ONLY=0|1`，默认0。冻结时 API 写入返回503、Retry-After60、Cache-Control no-store；读取保持原行为。

- [ ] 写失败测试：开启时 `/api/demo/sessions` POST 返回503且不产生会话，歌曲 GET 为200；默认模式仍可登录；不可信 Origin 仍为403。
- [ ] 运行 `python -m pytest tests/test_migration_read_only.py -q`；Expected：未实现时冻结测试 FAIL。
- [ ] 最小实现配置解析和现有中间件内的写入保护，不读取被拒绝请求的上传体。
- [ ] 运行目标测试和完整后端测试；Expected：全部通过，PostgreSQL 检查在原生 CI 验证。
- [ ] 提交该任务。

### Task 2：同机运行、TLS 与反向代理

**Files:** Create `ops/hk/compose.yaml`, `ops/hk/nginx.conf.template`, `ops/hk/runtime.env.example`, `ops/hk/bootstrap.py`, `ops/hk/tests/test_runtime_config.py`.

**Interfaces:** Bootstrap 在 `/opt/insong` 创建专用状态、证书和备份目录，返回非秘密配置状态。PostgreSQL 名称 `postgres`、数据库 `insong`、schema `insong`；服务证书包含 DNS:postgres。后端蓝／绿版本只发布 `127.0.0.1:18001/18002`。Nginx 的前端根目录和后端端口通过经验证的当前版本配置产生。

- [ ] 先写运行检查：无匹配 CA 或错误主机名连接失败；正确 TLS 下生产后端能读写隔离的 QA 库。反向代理测试确认深链接返回 HTML、API 错误不回退 HTML、私密 API no-store、版本资源 immutable。
- [ ] 先运行检查，记录没有运行配置时的失败；Expected：FAIL 而非跳过。
- [ ] 实现持久卷、内部网络、内部 CA、最小应用账户与 Nginx 配置。秘密只生成／接收在受保护的服务器文件中，Bootstrap 重跑保持已有状态。
- [ ] 在新服务器安装官方来源运行时并验证空环境：Docker Compose 配置、Nginx `-t`、PostgreSQL TLS 正反例和现有后端真实 E5／大图 smoke；Expected：PASS。暂不连接正式源库或切换域名。
- [ ] 提交配置与检查。

### Task 3：安全发布包与原子切换

**Files:** Create `ops/hk/release_bundle.py`, `ops/hk/deploy_release.py`, `ops/hk/ssh_gateway.py`, `ops/hk/tests/test_release_bundle.py`, `ops/hk/tests/test_deploy_release.py`.

**Interfaces:** `verify_bundle(path: Path, expected_sha: str) -> Manifest` 验证40位小写提交 SHA、所有文件与哈希，在写当前状态前完成校验。`deploy_release(bundle: Path, expected_sha: str, root: Path) -> ReleaseReceipt` 预热候选后端并写受控 Nginx 配置，成功才更新当前指针。SSH 网关仅接受指定 SHA 发布和固定 incoming 路径上传，不提供普通 shell。

- [ ] 写 RED：有效包成功，`../`、绝对路径、符号／硬链接、重复文件、哈希或 SHA 不符被拒绝；拒绝后当前目录和标记不变。
- [ ] 写 RED：候选不健康、Nginx 校验失败、重复／并发发布保留当前健康版本；旧指纹文件仍可访问。
- [ ] 实现 manifest、大小上限、受控提取、SHA 校验、串行锁、候选预热和切换／回退。运维特权脚本位于 root 管理目录，不允许普通发布包替换。必要历史版本保留3个。
- [ ] 运行 `python -m pytest ops/hk/tests/test_release_bundle.py ops/hk/tests/test_deploy_release.py -q`；Expected：PASS，并在服务器 QA 环境核对真实失败回退。
- [ ] 提交该任务。

### Task 4：CI 到香港服务器的自动发布

**Files:** Modify `.github/workflows/ci.yml`; Create `.github/workflows/deploy-hk.yml`, `ops/hk/deploy_client.py`, `ops/hk/tests/test_deploy_events.py`.

**Interfaces:** CI 输出标记同一提交的前端、已测试后端镜像和 manifest。发布消费成功 CI 的产物；密钥保存在部署仓库 Secrets，主机公钥与腾讯控制台指纹匹配。生产开关 `HK_DEPLOY_ENABLED` 在首次迁移验收完成后开启。

- [ ] 写 RED：仅 `EthanLyu30/insong`、main、push、成功 CI、正确产物 SHA 能发布；PR／其他仓库／失败或 SHA 不符全部拒绝。
- [ ] 实现成功 CI 的产物上传和独立串行发布工作流，取消新 CI 不应中断正在执行的部署。
- [ ] 使用专用受限发布密钥与固定主机公钥；不通过忽略 host-key 校验解决连接问题。秘密不出现在 argv、输出或产物中。
- [ ] 运行 `python -m pytest ops/hk/tests -q`、现有前端全套与构建、后端全套和原生 CI；Expected：PASS。
- [ ] 提交该任务；在发版前完成一次独立全分支代码审查，并以一轮 RED→GREEN 修复 Important／Critical。

### Task 5：正式数据、HTTPS、域名与发布验收

**Files:** Create `ops/hk/migrate_database.py`, `ops/hk/tests/test_migration_safety.py`; Modify `docs/DEPLOY.md`; save one final mobile proof.

**Interfaces:** 源 URL 只由用户在明确的受保护目标内输入。导出限定源项目 insong schema，目标为新服务器独立候选库；验证数量、关系、序列、会话与照片哈希，只输出校验结果。

- [ ] RED 安全检查：目标非空、错误源 schema、恢复失败、数据摘要不符时拒绝切换；不打印敏感 URL 或行内容。
- [ ] GREEN 实现导出、恢复和摘要核对；验证一份备份能恢复到隔离库。先检查本地脚本，再由用户安全输入源连接串。
- [ ] 对旧 Render 后端启用写入保护并核对503，生成最终快照并恢复，验证原编号、会话、私密照片和收藏。
- [ ] 通过 DNS 验证获得 insong.me 有效证书，用 host override 在切换前检查新服务器的 HTTPS、注册／登录、多图及撤回、快照、搜索；只使用本次合成 QA 数据。
- [ ] 变更 Cloudflare DNS 前按具体安全变更规则处理确认；使用腾讯优选线路直连，随后验证 TLS、同源 Cookie、深链接和手机布局。
- [ ] 开启个人仓库生产发布，源 lxy 先推、个人 main 后推，核对同一 SHA 的 CI 与真实服务器版本。重启后数据保留，旧代码能回退但不重建数据库。
- [ ] 请持有人关闭 VPN 检查手机；记录实际速度与未测项。Expected：公开站可访问、身份与数据检查通过、至少一次自动部署确实成功。
- [ ] 更新实际部署与恢复说明；核对精确归属后清理本次 QA 与临时副本，保留必要恢复备份及用户原有输入。提交文档后同样按两仓库顺序同步。
