# BEpusdt 管理后台

React 版管理后台，替代原 SnowAdmin（Vue）后台。生产构建产物由 Go 程序嵌入（`static/secure`），通过安全入口访问。

## 技术栈
Vite 7 + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui，React Router（hash 路由），TanStack Query，Zustand，i18next（中/英），sonner。

## 命令
- `pnpm install`
- `pnpm dev`：开发服务，`/api` 与安全入口路径代理到 `VITE_APP_BASE_URL`（默认 `http://127.0.0.1:8080`）。
- `pnpm run build:prod`：产物为 `dist/secure.html` + `dist/assets/`，资源前缀 `/secure/`。
- `pnpm test`：纯函数单元测试。

## 打包与嵌入
Dockerfile 与 `.github/workflows/release.yml` 在 `web/` 目录执行 `pnpm install --frozen-lockfile --shamefully-hoist` 和 `pnpm run build:prod`，再把 `web/dist` 复制到 `static/secure/`，由 `static/embep.go` 的 `//go:embed secure/*` 打进二进制。`vite.config.ts` 的 `rename-index` 插件会在构建结束时把 `dist/index.html` 改名为 `dist/secure.html`，后端只认这个文件名。

## 后端约定
- 先访问安全入口路径取得 session，再到 `/#/login`；未带 session 时 `/api/*` 返回 403 `unauthorized access`。
- 登录后请求头 `Authorization: <token>`，不加 `Bearer`。
- 响应结构 `{code, msg, data, total}`，统一读 `msg`。
- 菜单由 `src/router/routes.ts` 写死，不调用 `/api/auth/menu`。
