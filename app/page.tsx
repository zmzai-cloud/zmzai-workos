import Link from "next/link";

import { Logo, Navbar } from "@zmzai/theme";

import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const PRODUCTS = [
  { name: "Agent", desc: "智能体任务与工具执行", href: "https://a.zmzai.cloud" },
  { name: "Relay", desc: "模型网关与计费", href: "https://m.zmzai.cloud" },
  { name: "教程课", desc: "从零造 Coding Agent 框架", href: "https://muzhi.zmzai.cloud" },
  { name: "主站", desc: "产品矩阵与文档", href: "https://zmzai.cloud" },
];

export default async function HomePage() {
  const user = await getCurrentUser();
  const ctaHref = user ? "/dashboard" : "https://auth.zmzai.cloud/login?next=" + encodeURIComponent("https://i.zmzai.cloud/dashboard");

  return (
    <main className="page-shell flex min-h-dvh flex-col">
      <Navbar
        sublabel="workos"
        brandHref="/"
        badge={<span className="rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-ink-3">i.zmzai.cloud</span>}
      />

      <section className="flex flex-1 flex-col justify-center gap-8 py-20">
        <div className="flex items-center gap-6">
          <Logo size={88} />
          <div className="flex flex-col gap-2">
            <p className="eyebrow">zmzai cloud · I</p>
            <h1 className="headline text-5xl sm:text-6xl">工作台</h1>
          </div>
        </div>
        <p className="max-w-xl text-xl leading-9 text-ink/80">面向个人创作者的一体化 AI 工作台：任务、知识、产品入口一窗收齐。</p>
        <div className="flex items-center gap-4">
          <Link href={ctaHref} className="btn-primary h-10">{user ? "进入工作台" : "登录"}</Link>
          <span className="font-mono text-sm text-muted">牧之 的一件 AI 工程 · 知末智云</span>
        </div>
      </section>

      <section className="rule-top grid gap-3 pb-16 sm:grid-cols-2 lg:grid-cols-4">
        {PRODUCTS.map((product) => (
          <Link key={product.href} href={product.href} className="entry">
            <strong>{product.name}</strong>
            <span>{product.desc}</span>
            <span className="font-mono text-[11px] text-muted">{product.href.replace("https://", "")}</span>
          </Link>
        ))}
      </section>

      <footer className="flex items-center justify-between border-t-2 border-rule py-5 font-mono text-xs text-muted">
        <span>牧之 署名 · zmzai cloud</span>
        <Link href="https://zmzai.cloud" className="transition-colors hover:text-accent">← 回产品矩阵</Link>
      </footer>
    </main>
  );
}
