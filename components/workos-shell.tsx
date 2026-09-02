"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AppShell, Badge, Button, type AppShellLink, type AppNavSection } from "@zmzai/theme";

const sections: AppNavSection[] = [
  { label: "工作", items: [{ label: "今日工作", href: "/dashboard", icon: "gauge" }] },
  { label: "上下文", items: [
    { label: "项目", href: "/dashboard#projects", icon: "folder" },
    { label: "知识", href: "/dashboard#knowledge", icon: "book" },
  ] },
  { label: "服务", items: [
    { label: "用量", href: "https://m.zmzai.cloud", icon: "trend-up" },
    { label: "Agent", href: "https://a.zmzai.cloud", icon: "sparkle" },
  ] },
];

const WorkosLink: AppShellLink = ({ href, className, children, onClick, "aria-current": ariaCurrent }) => (
  <Link href={href} className={className} onClick={onClick} aria-current={ariaCurrent}>{children}</Link>
);

export function WorkosShell({
  userName,
  email,
  children,
}: {
  userName: string;
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/dashboard";
  return (
    <AppShell
      brand={{ label: "Index", suffix: "i.zmzai.cloud", href: "/" }}
      sections={sections}
      pathname={pathname}
      link={WorkosLink}
      account={(
        <div className="mt-auto border-t border-line px-2 pt-4">
          <p className="truncate text-sm font-medium text-ink">{userName}</p>
          <p className="mt-0.5 truncate font-mono text-[10px] text-ink-3">{email}</p>
          <form action="/logout" method="post" className="mt-3">
            <Button type="submit" variant="ghost" size="sm">退出登录</Button>
          </form>
        </div>
      )}
      headerExtras={<Badge variant="outline" size="sm">用量待接入</Badge>}
    >
      {children}
    </AppShell>
  );
}
