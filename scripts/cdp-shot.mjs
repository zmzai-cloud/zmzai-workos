// Chrome headless CDP 截图：先注入 muzhi_session cookie 再打开目标页。
// 用法：node scripts/cdp-shot.mjs <url> <outfile> [cookieToken]
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";

const [, , url, outfile, tokenArg] = process.argv;
const port = 9225;
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const tmpProfile = "/tmp/chrome-cdp-shot-profile";
execFile(chrome, [
  `--remote-debugging-port=${port}`,
  "--headless=new",
  "--user-data-dir=" + tmpProfile,
  "--no-first-run",
  "--window-size=1440,1000",
  "about:blank",
]);

async function waitForEndpoint() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("chrome did not start");
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.onopen = () => resolve({
      send(method, params) {
        return new Promise((res2, rej2) => {
          const mid = ++id;
          pending.set(mid, { res: res2, rej: rej2 });
          ws.send(JSON.stringify({ id: mid, method, params: params ?? {} }));
        });
      },
      close: () => ws.close(),
    });
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      }
    };
    ws.onerror = reject;
  });
}

await waitForEndpoint();
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === "page");
const cdp = await connect(page.webSocketDebuggerUrl);

const token = tokenArg ?? (existsSync("/tmp/workos-token.txt") ? readFileSync("/tmp/workos-token.txt", "utf8").trim() : "");
if (token) {
  await cdp.send("Network.enable");
  const target = new URL(url);
  await cdp.send("Network.setCookie", {
    name: "muzhi_session",
    value: token,
    domain: target.hostname,
    path: "/",
  });
}

await cdp.send("Page.enable");
await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 2, mobile: false });
await cdp.send("Page.navigate", { url });
await new Promise((r) => setTimeout(r, 6000)); // 等 dev server 编译 + 渲染
const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
writeFileSync(outfile, Buffer.from(data, "base64"));
console.log("saved", outfile);
cdp.close();
process.exit(0);
