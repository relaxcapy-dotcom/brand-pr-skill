# Brand PR Agent

面向多人团队的品牌公关咨询顾问网页。访客可以注册、登录，在个人或团队工作空间里提问；服务端按仓库已有的 PR 方法论组织回答，并可在获得团队授权后查询外部资料。

这是可运行的 MVP，尚未配置真实 Supabase 项目、OpenAI 密钥，也未部署到生产环境。无配置时可预览首页和注册页，完整登录及咨询需要按下文配置服务。不会在仓库内保存真实密钥。

## 能力与架构

| 层 | MVP 实现 |
| --- | --- |
| 网页 | Next.js 16 + React 19；中文首页、邮箱注册登录、会话、团队连接设置 |
| 身份与数据 | Supabase Auth + Postgres；注册时创建个人工作空间，成员角色为 owner/admin/member |
| AI | 服务端 OpenAI Responses API；不在浏览器暴露 API Key，`store: false` |
| 方法论 | 按问题选择 `SKILL.md`、`router/`、`commands/`、`workflows/`、`references/` 中的仓库文档 |
| 外部服务 | 可扩展的服务端连接器；Tavily 网页搜索、Notion OAuth 与已共享页面摘录 |
| 安全 | RLS 租户/用户隔离、AES-256-GCM 凭证封装、角色校验、审计日志、数据库原子限速、同源与请求大小校验 |

```text
浏览器 → Next.js API → Supabase Auth / Postgres RLS
                   ├→ 方法论文档 → OpenAI Responses API
                   └→ 已授权的租户连接器 → Notion / Tavily
```

一次咨询的顺序：验证用户和工作空间成员资格 → 扣除限速额度 → 检查会话归属 → 记录审计事件 → 选择公关方法论和可用工具 → 服务端调用模型及只读连接器 → 保存用户与顾问消息。普通成员可使用团队已连接的工具，但不能查看或修改其凭证；会话只对其创建者可见。

## 本地运行

需要 Node.js 20.9+、npm，以及你控制的 Supabase 项目和 OpenAI API 项目。接入这些服务可能产生费用；先检查各服务的计费设置，不需要为了预览首页而开启付费功能。

```sh
npm ci
cp .env.example .env.local
npm run dev
```

打开 `http://localhost:3000`。将 Supabase URL 与 publishable key、服务端 service-role key、OpenAI API key 和连接器加密密钥填入本机的 `.env.local`，不要发到聊天中。生成加密密钥可在本机运行 `openssl rand -base64 32`；仅将输出写入本机环境文件或部署平台的秘密管理界面。`.env*` 已被 Git 忽略，唯独 `.env.example` 是无秘密的模板。

在 Supabase 应用数据库中执行 `supabase/migrations/20261015000100_brand_pr_core.sql`，并将 Auth 的站点 URL 设为 `http://localhost:3000`、允许的重定向 URL 加入 `http://localhost:3000/auth/callback`。建议启用邮箱验证。详细的项目设置、Notion OAuth 回调及部署检查见 [部署说明](docs/DEPLOYMENT.md)。

## 验证

```sh
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

数据库 RLS/角色/限速测试需要 Supabase CLI 和 Docker，按 [数据库说明](supabase/README.md) 执行 `supabase start`、`supabase db reset`、`supabase test db`。没有本地数据库栈时，构建和单元测试通过并不等于跨租户行为已通过端到端验证。

权限、凭证、审计与上线前尚需补足的防滥用控制列在 [安全边界](docs/SECURITY.md)。

## 原有方法论与 Skill

以下内容保留项目最初的定位和使用示例。所有 `commands/`、`workflows/`、`references/`、`agents/`、`templates/` 文档仍在仓库中；MVP 会按问题类型选取其中的核心方法论作为顾问的工作参考，不把文档当作实时事实来源。

---

## 🇨🇳 中文介绍

## 大厂 Brand PR Agent Framework 是什么？

这是一个面向品牌、公关、市场传播团队的 AI Agent 工作框架。

它尝试把互联网大厂品牌公关团队日常工作的经验进行结构化沉淀，让 AI 不只是“写稿工具”，而成为能够辅助完成：

- 品牌传播策略制定
- 新闻价值判断
- 媒体关系规划
- 舆情与品牌声誉管理
- 危机公关响应
- 高管传播
- PR效果评估
- AI时代品牌信息资产建设

的专业工作伙伴。

## 项目来源说明

本项目灵感和方法框架来源于互联网大厂品牌、公关、业务 BP 等岗位的实际工作场景总结。

这些经验经过 AI Agent 化抽象，仅用于品牌传播工作流优化、AI辅助办公探索和行业交流学习。

特别说明：

本项目不是任何公司的官方方法论，不包含任何企业内部机密、数据或未公开流程。

---

## 🇺🇸 English Introduction

## What is Big Brand PR Agent Framework?

Big Brand PR Agent Framework is an AI-powered operating framework designed for enterprise brand, communication and marketing teams.

It helps AI agents work like experienced PR strategists instead of simple content generators.

The framework covers:

- Brand communication strategy
- Newsworthiness assessment
- Media relations
- Reputation intelligence
- Crisis communication
- Executive communication
- PR measurement
- AI-era brand visibility

## Origin & Disclaimer

This project is inspired by practical workflows and accumulated experience from large-scale internet company PR and brand communication teams.

It is designed for reference, learning and workflow optimization only.

It does not represent any company's official methodology, internal process or confidential information.

---

## 使用说明 / Usage Guide

## 适合谁使用？

特别适合以下职场场景：

- 不擅长表达，但需要频繁沟通协作的职场用户
- 习惯深度思考、逻辑分析，希望快速整理表达的人
- 经常需要向老板汇报、向业务解释、向媒体沟通的品牌、公关、市场同学
- 想把“脑中的想法”快速转化成专业表达的 I 人用户

这个 Skill 不要求你变成一个特别外向的人，而是帮助你减少沟通成本，把复杂问题讲清楚。

---

## 场景1：老板让我汇报项目，但不知道怎么说

复制：

```
请作为大厂品牌公关负责人，帮我整理一次向领导汇报的沟通方案。
请先分析领导最关注的问题，再输出：
1. 汇报逻辑；
2. 核心观点；
3. 可能追问；
4. 推荐表达方式。
要求结论先行，避免流水账。
```

---

## 场景2：业务让我发稿，但我觉得价值不足

复制：

```
请帮我判断这个项目是否值得媒体传播。
不要直接写新闻稿。
请分析业务价值、用户价值、新闻价值、媒体兴趣和风险。
如果传播价值不足，请给出如何优化的建议。
```

---

## 场景3：不知道怎么拒绝不合理需求

复制：

```
请帮我优化这段职场沟通。
目标：不直接否定对方，同时表达专业判断，并推动事情继续推进。
请输出：
1. 对方真实诉求；
2. 沟通策略；
3. 可直接发送的话术；
4. 不建议使用的表达。
```

---

## 场景4：危机或敏感问题沟通

复制：

```
请进入危机沟通模式。
先不要写回应稿。
请先判断事实、风险、利益相关方和沟通策略。
最后输出媒体回应口径和FAQ。
```

---

## 场景5：品牌传播方案

适用于：新品、大促、业务项目、品牌升级。

复制：

```
请制定一份大厂级品牌传播方案。
包含：业务目标、传播目标、行业洞察、用户洞察、核心叙事、媒体策略、社交策略、执行节奏、预算和KPI。
要求避免空泛营销语言，优先提供真实业务动作和证据。
```

---

## Core Capabilities

- Business-to-PR Translation
- Newsworthiness Assessment
- PR Strategy Development
- Media Relations
- Reputation Intelligence
- Crisis Communications
- Executive Communications
- Communication Intelligence
- PR Measurement
- AI-era Brand Visibility

## Philosophy

Strategy before content.

Evidence before adjectives.

Action before slogans.

Credibility before attention.

## License

MIT
