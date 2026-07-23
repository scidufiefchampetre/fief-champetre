import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronDown } from "lucide-react";

import { FEATURES } from "@/core/config/features";
import { APP_MODULES, type AppModuleLink } from "@/core/navigation/app-modules";
import { HomeBadgesPanel } from "./home-badges-panel";

interface PersonalHomeDashboardProps {
  firstName: string | null;
  lastName: string | null;
  spreadsheetId: string | null;
  onPickInvoice: () => void;
}

export function PersonalHomeDashboard({
  firstName,
  lastName,
  spreadsheetId,
  onPickInvoice,
}: PersonalHomeDashboardProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const firstNameLength = firstName?.length ?? 0;
  const greetingSize =
    firstNameLength > 12
      ? "text-[clamp(3rem,11vw,5rem)]"
      : firstNameLength > 8
        ? "text-[clamp(3.75rem,13vw,6rem)]"
        : "text-[clamp(4.75rem,16vw,7.5rem)]";

  return (
    <section className="flex flex-1 flex-col animate-rise">
      <div className="py-2">
        <h1 className={`font-black leading-[0.78] tracking-[-0.075em] ${greetingSize}`}>
          <span className="block">Salut</span>
          <span className="mt-[0.08em] block break-words">{firstName || "toi"}.</span>
        </h1>
        <p className="mt-5 text-[12px] text-muted-foreground">Tu veux faire quoi ?</p>
      </div>

      <div className="mt-4 grid gap-2.5">
        {APP_MODULES.map((module) => {
          const ModuleIcon = module.icon;
          const isOpen = expanded === module.key;
          return (
            <section
              key={module.key}
              className="overflow-hidden rounded-2xl border border-border bg-card"
            >
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : module.key)}
                className={`flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover-device:hover:bg-secondary/50 ${isOpen ? "border-b border-border/70" : ""}`}
                aria-expanded={isOpen}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-secondary/15">
                  <ModuleIcon className="h-4 w-4 text-brand-secondary" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-black">{module.label}</span>
                  <span className="mt-0.5 block text-[8px] text-muted-foreground">
                    {module.links.length} actions
                  </span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isOpen && (
                <div className="grid animate-rise sm:grid-cols-2">
                  {module.links.map((link, index) => (
                    <HomeModuleAction
                      key={link.label}
                      link={link}
                      onPickInvoice={onPickInvoice}
                      className={`${index > 0 ? "border-t sm:border-l sm:border-t-0" : ""} hover-device:hover:border-brand-secondary/35`}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {FEATURES.badges && firstName && (
        <HomeBadgesPanel
          spreadsheetId={spreadsheetId}
          firstName={firstName}
          lastName={lastName ?? ""}
        />
      )}
    </section>
  );
}

function HomeModuleAction({
  link,
  onPickInvoice,
  className,
}: {
  link: AppModuleLink;
  onPickInvoice: () => void;
  className: string;
}) {
  const Icon = link.icon;
  const content = (
    <>
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold leading-tight">{link.label}</span>
        <span className="mt-0.5 block text-[8px] leading-snug text-muted-foreground">
          {link.description}
        </span>
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </>
  );
  const styles = `tap group flex min-h-[62px] items-center gap-2.5 border-border px-3.5 py-3 text-left transition-colors hover-device:hover:bg-secondary/50 ${className}`;
  if (link.homeAction === "invoice")
    return (
      <button type="button" onClick={onPickInvoice} className={`w-full ${styles}`}>
        {content}
      </button>
    );
  return (
    <Link to={link.to} className={styles}>
      {content}
    </Link>
  );
}
