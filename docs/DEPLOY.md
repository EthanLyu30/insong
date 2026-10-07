# 公网部署

## 服务与数据

| 部分 | 平台与配置 | 地址 |
| --- | --- | --- |
| 前端 | Vercel Hobby，项目 `insong`，根目录 `frontend` | https://insong.vercel.app |
| 后端 | Render Free，`insong-backend`，Singapore，Docker 单进程 | https://insong-backend.onrender.com |
| 数据库 | Supabase Free，项目 `insong`，Mumbai，私有 `insong` schema | 仅后端连接 |
| 域名 | Cloudflare 注册与 DNS | https://insong.me |

浏览器的 `/api` 请求由 Vercel 转发至 Render。数据库密码只保存在 Render 的 `DATABASE_URL`，前端不需要 Supabase 密钥。账号、会话、记忆、收藏与处理后的照片存入 PostgreSQL；本机 SQLite 的私人数据没有上传。草稿仍保存在当前浏览器，不同步服务器。

E5 模型在 Render 后端运行，固定版本的量化权重在镜像构建时下载。查询不发送给外部模型 API。后端忙碌或匹配超时会回退关键词搜索；模式与模型状态可在 `/api/search/status` 查看。

## 推送与自动发布

源仓库是 `Saskia-1/TME`，开发分支为 `lxy`；部署仓库是 `EthanLyu30/insong`，生产分支为 `main`。原仓库的 `main` 不参与这次发布。

```powershell
# 在已提交所需改动的开发分支执行；两个推送必须是同一个 HEAD。
git push origin HEAD:lxy
git push deploy HEAD:main
```

第二个推送触发 Vercel 构建，以及 GitHub Actions 的前端、PostgreSQL 后端和受限容器检查。Render 设置为检查通过后自动部署。无需每次手动上传构建产物。

两次推送是独立操作：第一个成功不代表第二个成功。检查两端部署所示提交与 GitHub `main` 一致，再查看线上页面。Vercel 与 Render 的部署时长不同，新版本不会同时就绪；改动接口时需兼容短暂的新旧版本组合。

如果新电脑缺少部署远程：

```powershell
git remote add deploy https://github.com/EthanLyu30/insong.git
```

## 构建与环境

### Vercel

- 连接 `EthanLyu30/insong`，Production Branch 为 `main`。
- Framework 为 Vite，Root Directory 为 `frontend`，Node.js 为 24.x。
- `ENABLE_EXPERIMENTAL_COREPACK=1`，使用仓库指定的 pnpm 11.19.0。
- 安装命令：`corepack pnpm install --frozen-lockfile`。
- 构建命令：`corepack pnpm test && corepack pnpm build`；输出目录 `dist`。
- `frontend/vercel.json` 先转发 `/api`，再对页面路径回退 `index.html`。
- `VITE_API_BASE_URL` 保持未设置，浏览器使用同源接口与 Cookie。

### Render

`render.yaml` 保存非秘密配置：

| 环境变量 | 值 |
| --- | --- |
| `APP_ENV` | `production` |
| `DATABASE_SCHEMA` | `insong` |
| `CORS_ORIGINS` | `https://insong.me,https://insong.vercel.app` |
| `DATABASE_SSLROOTCERT` | `/app/certs/prod-ca-2021.crt` |
| `DATABASE_URL` | 在 Render Environment 私下填写完整的 Supabase Session pooler 连接串 |

连接使用 Session pooler 的 5432 端口，密码中的特殊字符须 URL 编码。不要把完整连接串发到聊天、提交到 Git 或填进 Vercel。更换密码时由账号持有人在 Supabase 完成重设，再更新 Render 并重新部署。

PostgreSQL 使用 `sslmode=verify-full`，镜像内包含 Supabase 官方 CA。CA 来源：[Supabase 公开证书](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt)。如果供应商轮换 CA，应更新证书并重新验证连接；不要关闭证书验证。

Supabase Data API 未启用，`insong` schema 不公开给前端。应用负责账号和照片权限。不要将该 schema 加入 Data API 的暴露列表。

## 域名配置

Vercel 项目添加 `insong.me` 为 Production 域名。当前控制台提供的解析目标为：

| 类型 | 名称 | 目标 |
| --- | --- | --- |
| CNAME | `@` | `a22a72922a2c1edd.vercel-dns-017.com` |

迁移前先移除 `insong-access-test` 对根域名的绑定，再按 Vercel 提示设置 DNS。首次校验用 DNS only，等待域名配置和 HTTPS 证书就绪。若之后启用 Cloudflare 代理，使用 Full (strict)，并重新检查接口、Cookie 和私密照片。不要启用针对 `/api` 的强制缓存。

域名切换及国内无 VPN 访问的最终验收尚在执行；`insong.vercel.app` 是已通过功能验证的备用地址。国内可用性需要实际运营商网络复测，不能从代理环境的检查推断。

## 免费方案与启动等待

Render Free 空闲 15 分钟会休眠，下一次请求通常需要约一分钟唤醒。页面静态资源与后端由不同平台提供，所以可能出现页面能打开、数据暂时未加载的情况。首次访问可先打开 `/api/health`，待返回 JSON 后再使用页面；保存超时先核对记录是否写入，再重试，避免重复创建。[Render 免费服务说明](https://render.com/docs/free)

免费运行时数按 Render workspace 共享；现有 `spoken` 也在同一 workspace，需要一并查看用量。免费套餐并非无限资源，当前未启用任何付费升级或自动保活。Supabase Free 的容量和暂停规则也需定期在控制台查看。[Supabase 上线说明](https://supabase.com/docs/guides/deployment/going-into-prod)

镜像已在 0.1 CPU / 512 MiB 限制下验证真实 E5 与最大允许像素的图片处理。并发上传会收到可重试的忙碌响应；这不是高并发或所有图片格式组合都可用的保证。

## 排查与恢复

1. **静态页面正常、数据失败**：查看 `/api/health`。检查 Render 是否唤醒、部署是否成功、Supabase 是否暂停。
2. **数据库连接失败**：先检查 Render 启动日志中的错误类别。核对 Session pooler、URL 编码及 CA 路径；不要把环境变量明文写进日志。
3. **登录失败或保存返回 403**：核对访问域名是否在允许来源内。私人接口与照片不应被 CDN 缓存。
4. **新版本异常**：优先回退代码到已验证版本，再按两个仓库的顺序推送；或分别使用平台的历史部署恢复。代码回退不能恢复已删除的数据。
5. **数据恢复**：迁移没有删除本地数据库。云端数据库备份应由持有人使用 Supabase 支持的导出方式私下保存；当前没有配置定时备份。恢复前先备份现有云端库，在独立库验证导出与照片字节，再切换连接。

## 已验证与待验证

最新功能验证提交：`c71d57a`。GitHub CI 与 Vercel、Render 的自动部署均成功。

- 注册、登录、Secure / HttpOnly / SameSite=Lax Cookie。
- 两张私密照片的匿名访问拒绝、记录编辑、公开多图、撤回后的访问拒绝。
- 场次快照、歌手关注、场次收藏及歌单。
- 真实 E5 语义模式与关键词回退的回归检查。
- 重新部署后记录、照片字节与收藏保留。
- 创建页直接进入与刷新保留路径，手机宽度下首页无横向溢出。

待完成：根域名切换、正式域名上的手机与国内无 VPN 复测、实际空闲休眠后的恢复检查，以及清理生成的部署验收数据。
