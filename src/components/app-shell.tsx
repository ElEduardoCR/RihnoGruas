"use client";

import { usePathname } from "next/navigation";
import { cx } from "./ui";

export function AppMain({ children }: { children: React.ReactNode }) {
  return <AppMainView chat={usePathname() === "/"}>{children}</AppMainView>;
}

export function AppMainView({ children, chat = false }: { children: React.ReactNode; chat?: boolean }) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={cx(
        "w-full outline-none",
        chat
          ? "flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col overflow-hidden bg-white lg:h-dvh"
          : "mx-auto max-w-[1400px] px-4 pt-6 pb-12 sm:px-6 lg:px-10 lg:pt-10",
      )}
    >
      {children}
    </main>
  );
}
