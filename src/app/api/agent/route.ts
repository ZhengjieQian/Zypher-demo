import { NextRequest, NextResponse } from "next/server";
// We will dynamic-import zypher after setting a Deno polyfill to avoid ReferenceError in Node.
// Temporary debugging: remove before production
const debug = (...args: any[]) => {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("[agent-api]", ...args);
  }
};

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const prompt = typeof body?.prompt === "string" ? body.prompt : "Hello";
    const model = typeof body?.model === "string" ? body.model : "gpt-4o-mini";
    const maxTokensRaw = body?.maxTokens;
    const timeoutRaw = body?.timeoutMs;
    const maxTokens =
      typeof maxTokensRaw === "number"
        ? Math.min(Math.max(maxTokensRaw, 16), 4096) // clamp basic range
        : undefined;
    const taskTimeoutMs =
      typeof timeoutRaw === "number"
        ? Math.min(Math.max(timeoutRaw, 5_000), 300_000) // allow 5s - 5min
        : 60_000; // default 60s

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY in environment" },
        { status: 500 }
      );
    }

    debug("Using model", model, "maxTokens", maxTokens, "timeout", taskTimeoutMs);

    // Minimal Deno polyfill for packages expecting Deno global (JSR often compiled for Deno).
    if (typeof (globalThis as any).Deno === "undefined") {
      const fsPromises = await import("node:fs/promises");
      const pathMod = await import("node:path");
      const osMod = await import("node:os");
      class NotFoundError extends Error { constructor(msg?: string){ super(msg||"NotFound"); this.name="NotFound"; } }
      class PermissionDeniedError extends Error { constructor(msg?: string){ super(msg||"PermissionDenied"); this.name="PermissionDenied"; } }
      class AlreadyExistsError extends Error { constructor(msg?: string){ super(msg||"AlreadyExists"); this.name="AlreadyExists"; } }
      class InvalidDataError extends Error { constructor(msg?: string){ super(msg||"InvalidData"); this.name="InvalidData"; } }
      const statWrapper = async (p: string) => {
        try {
          const s = await fsPromises.stat(p);
          return {
            ...s,
            isDirectory: () => s.isDirectory(),
            isFile: () => s.isFile(),
            isSymlink: () => s.isSymbolicLink?.() || false,
          } as any;
        } catch (e: any) {
          if (e?.code === "ENOENT") throw new NotFoundError();
          throw e;
        }
      };
      const readDirWrapper = async function* (dir: string) {
        try {
          const entries = await fsPromises.readdir(dir, { withFileTypes: true } as any);
          for (const de of entries as any[]) {
            yield {
              name: de.name,
              isFile: () => de.isFile(),
              isDirectory: () => de.isDirectory(),
              isSymlink: () => de.isSymbolicLink?.() || false,
            } as any;
          }
        } catch (e: any) {
          if (e?.code === "ENOENT") throw new NotFoundError();
          throw e;
        }
      };
      const mapOs = (p: NodeJS.Platform) => (p === "win32" ? "windows" : p === "darwin" ? "darwin" : "linux");
      (globalThis as any).Deno = {
        env: { get: (k: string) => process.env[k] },
        version: process.versions ?? {},
        build: { os: mapOs(process.platform) },
        args: [],
        cwd: () => process.cwd(),
        chdir: (d: string) => process.chdir(d),
        readTextFile: (p: string) => fsPromises.readFile(p, "utf8"),
        writeTextFile: (p: string, data: string) => fsPromises.writeFile(p, data, "utf8" as any),
        readFile: (p: string) => fsPromises.readFile(p),
        writeFile: (p: string, data: Uint8Array | string) => fsPromises.writeFile(p, data as any),
        mkdir: (p: string, opts?: any) => fsPromises.mkdir(p, { recursive: !!(opts && (opts.recursive ?? true)) }),
        rename: (oldp: string, newp: string) => fsPromises.rename(oldp, newp),
        remove: (p: string) => fsPromises.rm(p, { recursive: true, force: true }),
        stat: statWrapper,
        lstat: statWrapper,
        readDir: readDirWrapper,
        makeTempDir: async (opts?: any) => {
          const dir = await fsPromises.mkdtemp(pathMod.join(osMod.tmpdir(), opts?.prefix || "deno-"));
          return dir;
        },
        osRelease: () => osMod.release(),
        hostname: () => osMod.hostname(),
        homeDir: () => osMod.homedir(),
        execPath: () => process.execPath,
        osUptime: () => osMod.uptime?.() ?? 0,
        errors: {
          NotFound: NotFoundError,
          PermissionDenied: PermissionDeniedError,
          AlreadyExists: AlreadyExistsError,
          InvalidData: InvalidDataError,
        },
      };
      debug("Applied Deno polyfill (fs)");
    }

    // Dynamic import to ensure polyfill in place before evaluation.
    const zypherMod = await import("@corespeed/zypher");
    const { ZypherAgent, OpenAIModelProvider, createZypherContext } = zypherMod as any;
    const provider = new OpenAIModelProvider({ apiKey });
    const context = await createZypherContext(process.cwd());
    let agent: any;
    try {
      agent = new ZypherAgent(context, provider, {
        config: {
          taskTimeoutMs,
          ...(maxTokens ? { maxTokens } : {}),
        },
      });
    } catch (ctorErr: any) {
      debug("constructor error", ctorErr?.message || ctorErr);
      return NextResponse.json({ error: ctorErr?.message || "Agent construction failed" }, { status: 500 });
    }

    // Some versions expose init(); ignore if not present
    if (typeof agent.init === "function") {
      await agent.init();
    }

    // Start task and collect events (Zypher returns an observable-like stream)
    let streamError: any = null;
    let finalText = "";
    try {
      const event$ = agent.runTask(prompt, model);
      // The documentation pattern uses eachValueFrom(event$); fall back to simple subscription form
      const maybeSubscribe = (eventStream: any) => {
        if (eventStream && typeof eventStream.subscribe === "function") {
          eventStream.subscribe({
            next: (evt: any) => {
              if (evt?.type === "task_text" && typeof evt.content === "string") {
                finalText += evt.content;
              }
              if (evt?.type === "task_message" && evt?.message?.content) {
                // overwrite with assembled message if available
                const blocks = evt.message.content;
                if (Array.isArray(blocks)) {
                  const txt = blocks
                    .filter((b: any) => b?.type === "text" && typeof b.text === "string")
                    .map((b: any) => b.text)
                    .join("\n");
                  if (txt) finalText = txt;
                }
              }
            },
            error: (e: any) => {
              streamError = e;
              debug("stream error", e?.message || e);
            },
          });
        } else {
          debug("event$ not subscribable; messages will rely on agent.messages after wait()");
        }
      };
      maybeSubscribe(event$);
    } catch (e: any) {
      streamError = e;
      debug("runTask threw", e?.message || e);
    }

    // Wait for completion if available.
    if (typeof agent.wait === "function") {
      await agent.wait();
    }

    // Extract last assistant message text safely (fallback if streaming not captured).
    const messages: any[] = Array.isArray(agent.messages) ? agent.messages : [];
    const assistantTexts: string[] = [];
    for (const msg of messages) {
      if (msg?.role === "assistant" && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block?.type === "text" && typeof block.text === "string") {
            assistantTexts.push(block.text);
          }
        }
      }
    }
    let reply = assistantTexts.length ? assistantTexts[assistantTexts.length - 1].trim() : finalText.trim();
    if (!reply && streamError) {
      throw streamError;
    }
    return NextResponse.json({ reply, model, maxTokens: maxTokens ?? null, timeoutMs: taskTimeoutMs });
  } catch (err: any) {
    // Attempt to surface provider-specific info
    const status = err?.status || err?.response?.status || 500;
    let message = err?.message || "Agent error";
    // OpenAI-like error shape
    if (err?.response?.data?.error?.message) {
      message = err.response.data.error.message;
    } else if (err?.error?.message) {
      message = err.error.message;
    }
    // Common invalid key clarification
    if (status === 401) {
      message = "Unauthorized: Invalid or expired OPENAI_API_KEY";
    }
    debug("final error", { status, message });

    // Fallback: direct OpenAI API call if Zypher provider rejects with 401
    if (status === 401) {
      try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
        }
        const body = await req.json().catch(() => ({}));
        const prompt = typeof body?.prompt === "string" ? body.prompt : "Hello";
        const model = typeof body?.model === "string" ? body.model : "gpt-4o-mini";
        const completionResp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: "You are a helpful assistant." },
              { role: "user", content: prompt },
            ],
            temperature: 0.7,
          }),
        });
        if (!completionResp.ok) {
          const errJson = await completionResp.json().catch(() => ({}));
          return NextResponse.json(
            { error: errJson?.error?.message || `OpenAI fallback failed (${completionResp.status})` },
            { status: completionResp.status }
          );
        }
        const data = await completionResp.json();
        const reply = data?.choices?.[0]?.message?.content?.trim() || "";
        return NextResponse.json({ reply, model, fallback: true });
      } catch (fbErr: any) {
        return NextResponse.json({ error: fbErr?.message || "Fallback error" }, { status: 500 });
      }
    }
    return NextResponse.json({ error: message }, { status });
  }
}
