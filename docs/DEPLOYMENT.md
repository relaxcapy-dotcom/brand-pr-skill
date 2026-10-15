# 部署与配置

本页是操作清单，不会自动创建云项目、开启付费服务或发布到生产环境。先在本地或受限预览环境验证，再由项目所有者决定正式域名、预算和数据保留策略。

## 1. Supabase

1. 新建由你管理的 Supabase 项目，保存 Project URL、publishable key 和 **service-role key**。前两者供浏览器使用；service-role key 只能放在服务端环境变量。
2. 在 Auth 中启用邮箱/密码登录，建议开启邮箱验证。设置 Site URL 为应用地址，例如本地 `http://localhost:3000`，并把 `http://localhost:3000/auth/callback` 加入允许的 Redirect URLs。预览和正式域名各自加入对应回调。
3. 使用 Supabase CLI 的 `supabase db push` 或项目 SQL Editor，以迁移管理员身份执行 `supabase/migrations/20261015000100_brand_pr_core.sql`。先在新项目验证；此迁移面向首次安装，并未设计为对已有同名表的无损升级。
4. 以两个普通用户注册，确认各自自动得到个人工作空间。由一个 owner 在「服务连接」里按另一个人的注册邮箱添加成员。验证不同成员看不到彼此的私人会话。

需要可重复的本地数据库测试时，安装 Supabase CLI 与 Docker 后运行 `supabase start`、`supabase db reset` 和 `supabase test db`；详见 [`supabase/README.md`](../supabase/README.md)。

## 2. 环境变量

复制 `.env.example` 为 `.env.local`，只填写本地文件或托管平台的加密环境变量，不要提交文件、粘贴到聊天或放进 `NEXT_PUBLIC_` 变量。生产环境的 `APP_URL` 必须是你控制的 HTTPS 站点根域名，且需与用户实际访问的来源一致。

| 变量 | 位置与用途 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 公共；Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 公共；Supabase publishable key，**不是** service-role key |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端；仅用于受控的 AI 消息、审计与加密连接器数据写入 |
| `OPENAI_API_KEY` | 服务端；OpenAI Platform 项目 API key；缺失时咨询返回配置提示 |
| `OPENAI_MODEL` | 服务端；默认为 `gpt-6-luna`，部署前确认项目可用模型和预算 |
| `CONNECTOR_ENCRYPTION_KEY` | 服务端；32 字节随机值的 Base64 表示，例如本机执行 `openssl rand -base64 32` |
| `APP_URL` | 服务端；单一应用来源，例如 `http://localhost:3000` 或 `https://pr.example.com` |
| `NOTION_CLIENT_ID` / `NOTION_CLIENT_SECRET` | 服务端；仅启用 Notion OAuth 时需要 |

加密密钥丢失将使已保存的 Notion/Tavily 凭证无法解密，需重新授权；更换密钥需要专门的数据迁移。不要把 `.env.local`、service-role key、OAuth secret 或 API key 打包到静态资源。

## 3. 外部服务授权

- Tavily：工作空间 owner/admin 可以在网页输入团队自己的 API key。应用通过 HTTPS 接收后用 AES-256-GCM 加密，持久化到服务端可访问的 `connector_credentials`。后台只返回连接状态，不回显密钥。连接并不会自动启动任何搜索；顾问仅在相关咨询时调用。使用前确认 Tavily 账户的计费和配额。
- Notion：创建由你管理的 Notion 公共 OAuth 集成，按最小权限选择读取页面能力，把精确回调 URL `APP_URL/api/connectors/notion/callback` 加入集成配置。由工作空间 owner/admin 发起授权，授权时只选业务必需的页面。MVP 仅调用搜索和读取部分页面块的 API；授权状态使用 10 分钟有效期的加密、HttpOnly、SameSite=Lax Cookie，凭证在服务端加密保存并在必要时刷新。Notion 页面标题和最多三个页面的有限摘录可能随咨询发送到 OpenAI；请先取得资料持有者许可。
- 新增连接器：把 provider 加入 `lib/connectors/store.ts` 的允许列表，增加服务端鉴权、凭证存取、输入/输出过滤和超时，再在 `lib/connectors/tools.ts` 注册只读模型工具；对应添加权限、限速与模拟上游失败测试。模型不能自行指定任意 URL 或执行写操作。

## 4. 应用构建和预览

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run start
```

部署到支持 Next.js 16 Node.js 运行时和至少 60 秒 API 请求的托管平台时，设置同样的环境变量并重新部署。不要选择纯静态导出：本产品依赖服务端 Route Handlers、Auth Cookie 和数据库。每个预览域名若与 `APP_URL` 不同，需要独立的环境配置与 Supabase Redirect URL；单一 `APP_URL` 配置不支持同时从多个来源进行写操作或 OAuth。

正式开放注册前，请完成 [安全边界](SECURITY.md) 中的上线前项目，尤其是邮箱验证/CAPTCHA、全局配额、日志保留、备份恢复、预算告警和真实数据库端到端测试。本仓库不包含托管平台项目 ID，也没有已发布的线上链接。
