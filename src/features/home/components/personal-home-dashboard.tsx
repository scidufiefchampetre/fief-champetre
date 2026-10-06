import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, ChevronDown, HardHat } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { FEATURES } from "@/core/config/features";
import { APP_MODULES, type AppModuleLink } from "@/core/navigation/app-modules";
import { HomeBadgesPanel } from "./home-badges-panel";
import { listChantiers } from "@/lib/chantier.functions";
import { listReservations } from "@/lib/reservations.functions";
import { chantierTitle, fmtChantierDate } from "@/features/chantiers/components/chantier-list-card";
import { getPaymentStatus, PAYMENT_BADGE_STYLE } from "@/lib/pricing";

interface PersonalHomeDashboardProps {
  firstName: string | null;
  lastName: string | null;
  spreadsheetId: string | null;
  onPickInvoice: () => void;
}

function fmtDateShort(iso: string) {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function daysUntil(iso: string) {
  const d = Math.ceil((new Date(`${iso}T00:00:00`).getTime() - Date.now()) / 86_400_000);
  return d;
}

function normalize(v: string) {
  return v.trim().toLocaleLowerCase("fr-FR");
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

  const enabled = !!firstName && !!spreadsheetId;

  const loadChantiers = useServerFn(listChantiers);
  const loadReservations = useServerFn(listReservations);

  const chantierRange = useMemo(() => {
    const now = new Date();
    const min = new Date(now);
    min.setDate(min.getDate() - 1);
    const max = new Date(now);
    max.setFullYear(max.getFullYear() + 2);
    return { timeMin: min.toISOString(), timeMax: max.toISOString() };
  }, []);

  const reservationRange = useMemo(() => {
    const now = new Date();
    const min = new Date(now);
    min.setDate(min.getDate() - 1);
    const max = new Date(now);
    max.setMonth(max.getMonth() + 12);
    return { timeMin: min.toISOString(), timeMax: max.toISOString() };
  }, []);

  const { data: chantiersData } = useQuery({
    queryKey: ["chantiers-home", chantierRange.timeMin, chantierRange.timeMax],
    queryFn: () => loadChantiers({ data: chantierRange }),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const { data: reservationsData } = useQuery({
    queryKey: ["reservations", "mine", reservationRange.timeMin, reservationRange.timeMax],
    queryFn: () => loadReservations({ data: { spreadsheetId: spreadsheetId!, timeMin: reservationRange.timeMin, timeMax: reservationRange.timeMax } }),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const todayIso = new Date().toISOString().slice(0, 10);

  const nextChantier = useMemo(() => {
    const all = chantiersData?.chantiers ?? [];
    return all
      .filter((c) => !c.cancelledAt && c.endDate >= todayIso)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null;
  }, [chantiersData, todayIso]);

  const nextReservation = useMemo(() => {
    if (!firstName) return null;
    const all = reservationsData?.reservations ?? [];
    return all
      .filter(
        (r) =>
          r.type === "personal" &&
          r.status === "confirmed" &&
          r.endDate >= todayIso &&
          normalize(r.reservedBy) === normalize(firstName),
      )
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null;
  }, [reservationsData, firstName, todayIso]);

  const showContextCards = enabled && (nextChantier !== null || nextReservation !== null);

  return (
    <section className="flex flex-1 flex-col animate-rise">
      <div className="py-2">
        <h1 className={`font-black leading-[0.78] tracking-[-0.075em] ${greetingSize}`}>
          <span className="block">Salut</span>
          <span className="mt-[0.08em] block break-words">{firstName || "toi"}.</span>
        </h1>
        <p className="mt-5 text-xs text-muted-foreground">Tu veux faire quoi ?</p>
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
                  <span className="block text-sm font-black">{module.label}</span>
                  <span className="mt-0.5 block text-2xs text-muted-foreground">
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
        <span className="block text-xs font-bold leading-tight">{link.label}</span>
        <span className="mt-0.5 block text-2xs leading-snug text-muted-foreground">
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
