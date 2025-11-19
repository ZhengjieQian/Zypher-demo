## Zypher Agent + Next.js

一个使用 [Zypher](https://zypher.corespeed.io/) 打造的最简 AI Agent Web 示例（Next.js App Router + TypeScript）。前端一个输入框，调用 `/api/agent`，后端用 Zypher 运行任务；当 Zypher 的 OpenAI 提供者不接受项目密钥时，会自动回退到直连 OpenAI API，确保功能可用。

---

### 一、准备环境变量

在项目根目录创建或编辑 `.env.local`（默认不纳入 Git）：

```
OPENAI_API_KEY=sk-你的真实密钥
```

说明：
- 支持传统用户密钥 `sk-...`；项目密钥 `sk-proj-...` 在部分提供者上可能 401，本项目已做 fallback 直连 OpenAI。
- 请不要把密钥提交到仓库或贴到聊天/日志中。

### 二、安装与启动

```powershell
cd D:\Zypher\zypher-next
npm install
npm run dev
```

打开浏览器访问 `http://localhost:3000`（如端口被占用会切换到 3002，以控制台为准）。

### 三、使用方法

- 页面输入任意中文/英文问题并发送；
- 或命令行（PowerShell）直接调用：

```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/agent -Method POST -Body (@{prompt='给我三个代办事项';timeoutMs=120000} | ConvertTo-Json) -ContentType 'application/json'
```

请求体参数：
- `prompt`：用户输入（必填）
- `model`：模型名（默认 `gpt-4o-mini`）
- `maxTokens`：生成上限，范围 16~4096
- `timeoutMs`：任务超时（默认 60000，支持 5000~300000）

响应字段：
- `reply`：文本答案
- `model`：使用的模型
- `maxTokens`、`timeoutMs`：实际配置
- `fallback`：当为 `true` 时表示本次使用了直连 OpenAI 的回退逻辑

### 四、关键文件

- 页面：`src/app/page.tsx`
- API 路由：`src/app/api/agent/route.ts`

### 五、实现说明（Node 兼容）

- Zypher 来自 JSR，默认面向 Deno 运行时。为在 Next.js/Node 中使用，`route.ts` 在动态导入之前注入了一个最小可用的 `Deno` polyfill（基于 Node 的 fs/os 实现）。
- 当 Zypher 的 `OpenAIModelProvider` 因项目密钥返回 401 时，路由会自动回退到 `https://api.openai.com/v1/chat/completions`，保证功能不中断。

### 六、常见问题

- 401 / Unauthorized：通常是读取到错误的 Key（如之前的占位符），或项目密钥在提供者不被接受。清理 PowerShell 临时环境变量并重启服务：

```powershell
Remove-Item Env:OPENAI_API_KEY
cd D:\Zypher\zypher-next
npm run dev
```

- 仍是 HTML 错误页：请打开浏览器 DevTools → Network，查看 `POST /api/agent` 的响应内容和状态码，把 JSON 错误发出来排查。

### 七、Git 提交与推送

已在本仓库清空 `.env.local` 内容并默认忽略 `.env*` 文件。推送前请确认没有泄露密钥。

```powershell
cd D:\Zypher\zypher-next
git add .
git commit -m "docs: usage guide; chore: clear env placeholder"
# 首次推送需设置远程：
git remote add origin https://github.com/<your-username>/<your-repo>.git
git branch -M main
git push -u origin main
```

需要我把远程地址配置好并直接推送，请提供 GitHub 仓库地址。 

