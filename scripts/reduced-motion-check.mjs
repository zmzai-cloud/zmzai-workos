import { execFile } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:3014/dashboard";
const outfile = process.argv[3] ?? "/tmp/reduced-motion.png";
const port = 9226;
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
execFile(chrome, [
  `--remote-debugging-port=${port}`,
  "--headless=new",
  "--user-data-dir=/tmp/chrome-reduced-motion-profile",
  "--no-first-run",
  "--window-size=1280,900",
  "about:blank",
]);

async function waitForEndpoint() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) return; } catch {}
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

const token = existsSync("/tmp/workos-token.txt") ? readFileSync("/tmp/workos-token.txt", "utf8").trim() : "";
await cdp.send("Network.enable");
const target = new URL(url);
await cdp.send("Network.setCookie", { name: "muzhi_session", value: token, domain: target.hostname, path: "/" });

// 模拟系统开启「减少动态效果」
await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await cdp.send("Page.enable");
await cdp.send("Page.navigate", { url });
await new Promise((r) => setTimeout(r, 6000));

const probe = await cdp.send("Runtime.evaluate", {
  returnByValue: true,
  expression: `(() => {
    const mediaMatch = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mascot = document.querySelector('[data-cloud-state]');
    const floatEl = mascot && mascot.classList.contains('zmz-cloud-float') ? mascot : null;
    const floatAnim = floatEl ? getComputedStyle(floatEl).animationName : null;
    const floatDur = floatEl ? getComputedStyle(floatEl).animationDuration : null;
    const eyes = mascot ? mascot.querySelector('.zmz-cloud-eyes-companion circle') : null;
    const blinkAnim = eyes ? getComputedStyle(eyes).animationName : null;
    const dots = mascot ? mascot.querySelector('.zmz-cloud-dots') : null;
    const dotsTransition = dots ? getComputedStyle(dots).transitionDuration : null;
    return { mediaMatch, mascotState: mascot?.getAttribute('data-cloud-state'), floatAnim, floatDur, blinkAnim, dotsTransition };
  })()`,
});
console.log(JSON.stringify(probe.result.value, null, 2));
const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
writeFileSync(outfile, Buffer.from(data, "base64"));
console.log("saved", outfile);
cdp.close();
process.exit(0);
