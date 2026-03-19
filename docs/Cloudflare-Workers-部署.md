# SeedClaw Web 部署到 Cloudflare Workers

本文档描述 `seedclaw` Web 版本的自动部署方式。

## 部署目标

- 部署平台：Cloudflare Workers + Static Assets
- 自定义域名：`seedclaw.godgodgame.com`
- 自动部署分支：`seedagent`
- 手动部署方式：GitHub Actions `workflow_dispatch`

## 当前仓库内配置

### 1. Wrangler 配置

根目录文件：`wrangler.jsonc`

关键配置：

- `assets.directory = "./dist"`
- `assets.not_found_handling = "single-page-application"`
- `routes.pattern = "seedclaw.godgodgame.com"`
- `routes.custom_domain = true`

说明：

- `single-page-application` 用于兼容 Vue Router 的 `createWebHistory()`，避免刷新深层路由时返回 404。
- `custom_domain = true` 使用 Cloudflare Workers Custom Domain，而不是旧式 Pages 站点配置。
- 根据 Cloudflare 最新文档，Custom Domain 配置应写为精确主机名，例如 `seedclaw.godgodgame.com`，不要写成 `seedclaw.godgodgame.com/*`。

### 2. GitHub Actions 工作流

文件：`.github/workflows/deploy-web.yml`

触发条件：

```yaml
on:
  push:
    branches:
      - seedagent
  workflow_dispatch:
```

执行步骤：

1. `actions/checkout@v4`
2. `actions/setup-node@v4`，Node 20
3. `npm ci`
4. `npm run tcs`
5. `npm run build`
6. `cloudflare/wrangler-action@v3`
7. `wrangler deploy`

## GitHub 需要配置的 Secrets

在仓库的 `Settings -> Secrets and variables -> Actions` 中添加：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

## Cloudflare 侧前置条件

部署前需要满足以下条件：

1. `godgodgame.com` 已接入对应 Cloudflare 账号。
2. `seedclaw.godgodgame.com` 没有冲突的现有 DNS 记录，尤其不要已有冲突的 `CNAME`。
3. API Token 具备 Workers 部署权限，建议使用 Cloudflare 提供的 `Edit Cloudflare Workers` 模板后再按账号范围收紧权限。

## 首次部署流程

### 自动部署

将改动推送到 `seedagent`：

```bash
git push origin seedagent
```

GitHub Actions 会自动执行部署。

### 手动部署

进入 GitHub 仓库的 **Actions** 页面：

1. 选择 `Deploy SeedClaw Web`
2. 点击 **Run workflow**
3. 选择 `seedagent` 分支并执行

## 部署完成后的结果

部署成功后：

- Cloudflare 会为 Worker 上传静态资源
- `seedclaw.godgodgame.com` 会作为 Worker Custom Domain 生效
- SPA 路由会由 `index.html` 承接

## 故障排查

### 1. 路由刷新 404

确认 `wrangler.jsonc` 中存在：

```jsonc
"assets": {
  "directory": "./dist",
  "not_found_handling": "single-page-application"
}
```

### 2. GitHub Actions 部署失败

优先检查：

- `CLOUDFLARE_ACCOUNT_ID` 是否正确
- `CLOUDFLARE_API_TOKEN` 是否有效
- Cloudflare 账号下是否已有冲突域名记录
- workflow 是否由 `seedagent` 分支触发

### 3. Custom Domain 创建失败

优先检查：

- `seedclaw.godgodgame.com` 是否已有冲突 CNAME
- 域名是否属于当前 Cloudflare zone
- 证书签发是否还在处理中

## 备注

本仓库当前的 Web 部署策略是：

- 不使用 Cloudflare Pages
- 使用 Workers + Static Assets
- 通过 GitHub Actions 调用 Wrangler 自动部署
