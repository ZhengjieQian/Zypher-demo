## Zypher Agent + Next.js

A minimal AI Agent web demo built with [Zypher](https://zypher.corespeed.io/) (Next.js App Router + TypeScript). The frontend has a single input box calling `/api/agent`; the backend runs a Zypher agent task. If the Zypher OpenAI provider rejects a project key, the endpoint automatically falls back to a direct OpenAI API call so functionality remains available.

---

### 1. Environment Variable

Create or edit `.env.local` (ignored by Git by default) in the project root:

```
OPENAI_API_KEY=sk-your-real-key
```

Notes:
- Supports classic user keys `sk-...`. Project keys `sk-proj-...` may produce 401 with the provider; this project implements a fallback to direct OpenAI.
- Never commit your key or paste it in logs/chats.

### 2. Install & Run

```powershell
cd D:\Zypher\zypher-next
npm install
npm run dev
```

Open `http://localhost:3000` (if the port is busy it may switch to 3002; check the console output).

### 3. Usage

- Enter any question (English or Chinese) in the page and send.
- Or call from PowerShell directly:

```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/agent -Method POST -Body (@{prompt='Give me three todo items';timeoutMs=120000} | ConvertTo-Json) -ContentType 'application/json'
```

Request body parameters:
- `prompt`: User input (required)
- `model`: Model name (default `gpt-4o-mini`)
- `maxTokens`: Generation upper bound (range 16–4096)
- `timeoutMs`: Task timeout (default 60000, supported 5000–300000)

Response fields:
- `reply`: Text answer
- `model`: Actual model used
- `maxTokens`, `timeoutMs`: Effective configuration
- `fallback`: `true` when direct OpenAI fallback path was used

### 4. Key Files

- Page: `src/app/page.tsx`
- API Route: `src/app/api/agent/route.ts`

### 5. Implementation (Node Compatibility)

- Zypher targets Deno by default (JSR). To run under Next.js/Node, `route.ts` injects a minimal `Deno` polyfill (fs/os) before dynamically importing Zypher.
- If Zypher's `OpenAIModelProvider` returns 401 for a project key, the route falls back to `https://api.openai.com/v1/chat/completions` to keep responses working.

### 6. FAQ / Troubleshooting

- 401 / Unauthorized: Usually a bad key (placeholder) or a project key not accepted by the provider. Clear the temporary PowerShell variable and restart:

```powershell
Remove-Item Env:OPENAI_API_KEY
cd D:\Zypher\zypher-next
npm run dev
```

- HTML error page instead of JSON: Open browser DevTools → Network, inspect `POST /api/agent` response body & status code; share the JSON error for diagnosis.

### 7. Git Commit & Push

`.env.local` is cleared and `.env*` patterns are ignored. Confirm no secrets before pushing.

```powershell
cd D:\Zypher\zypher-next
git add .
git commit -m "docs: usage guide; chore: clear env placeholder"
git remote add origin https://github.com/<your-username>/<your-repo>.git
git branch -M main
git push -u origin main
```

If you want me to configure and push to a remote for you, provide the GitHub repository URL.

