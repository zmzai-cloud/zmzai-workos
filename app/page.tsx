import Link from "next/link";

import { Logo, Navbar } from "@zmzai/theme";

export default function HomePage() {
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
        <p className="max-w-xl text-xl leading-9 text-ink/80">面向个人创作者的一体化 AI 工作台：写作、检索、交付、运营一窗收齐。</p>
        <p className="font-mono text-sm text-muted">搭建中 — 知末智云的一件 AI 工程。</p>
      </section>

      <footer className="flex items-center justify-between border-t-2 border-rule py-5 font-mono text-xs text-muted">
        <span>牧之 署名 · zmzai cloud</span>
        <Link href="https://zmzai.cloud" className="transition-colors hover:text-accent">← 回产品矩阵</Link>
      </footer>
    </main>
  );
}
