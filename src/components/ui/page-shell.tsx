import type { ReactNode } from "react";

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh w-full bg-background">
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 py-4 sm:py-10">
        {children}
      </div>
    </main>
  );
}
