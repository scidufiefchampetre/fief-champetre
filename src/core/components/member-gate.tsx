import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRight,
  Users,
  UserPlus,
  RotateCw,
  Search,
  Plus,
  Check,
  X,
  Heart,
} from "lucide-react";
import { toast } from "sonner";
import { FRENCH_BANKS } from "@/lib/french-banks";
import { listMembers, addMember, type Member } from "@/lib/members.functions";
import { addChild } from "@/lib/children.functions";
import { useExpenseStore, type StoredMember } from "@/core/store/expense-store";

type MemberMode = "choose" | "new" | "existing";

export function MemberGate({
  onMember,
  spreadsheetId,
  onConfig,
}: {
  onMember: (m: StoredMember) => void;
  spreadsheetId: string | null;
  onConfig: (spreadsheetId: string) => void;
}) {
  const [mode, setMode] = useState<MemberMode>("choose");
  const list = useServerFn(listMembers);
  const create = useServerFn(addMember);
  const createChild = useServerFn(addChild);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [iban, setIban] = useState("");
  const [bankName, setBankName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [email, setEmail] = useState("");
  const [query, setQuery] = useState("");

  const [spouseId, setSpouseId] = useState("");
  const [pendingChildren, setPendingChildren] = useState<{ firstName: string; birthday: string }[]>(
    [],
  );
  const [newChildFirstName, setNewChildFirstName] = useState("");
  const [newChildBirthday, setNewChildBirthday] = useState("");

  function addPendingChild() {
    if (!newChildFirstName.trim()) {
      toast.error("Prénom de l'enfant requis.");
      return;
    }
    setPendingChildren((prev) => [
      ...prev,
      { firstName: newChildFirstName.trim(), birthday: newChildBirthday },
    ]);
    setNewChildFirstName("");
    setNewChildBirthday("");
  }

  function removePendingChild(index: number) {
    setPendingChildren((prev) => prev.filter((_, i) => i !== index));
  }

  useEffect(() => {
    if (mode !== "new" || members !== null) return;
    refreshMembers(false).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const MEMBERS_CACHE_TTL_MS = 5 * 60 * 1000;
  const MEMBERS_BACKGROUND_REFRESH_MS = 30 * 1000;

  function cacheIsFresh(
    cache: { spreadsheetId: string; fetchedAt: number; members: Member[] } | null,
  ): cache is NonNullable<typeof cache> {
    if (!cache) return false;
    return (
      cache.spreadsheetId === (spreadsheetId ?? "") &&
      cache.members.length > 1 &&
      Date.now() - cache.fetchedAt < MEMBERS_CACHE_TTL_MS
    );
  }

  async function openExisting() {
    setMode("existing");
    // Toujours rafraîchir depuis le Sheet à l'ouverture, mais afficher le cache
    // en attendant pour éviter un écran vide.
    const cache = useExpenseStore.getState().membersCache;
    if (cacheIsFresh(cache)) {
      setMembers(cache.members);
      refreshMembers(false).catch(() => {});
      return;
    }
    await refreshMembers(true);
  }

  async function refreshMembers(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      let res = await list({ data: { spreadsheetId } });
      // Guard against stale localStorage pointing at an empty/orphan spreadsheet:
      // if we asked for a specific id and it returned no members, retry with null
      // to force a fresh Drive lookup by name.
      if (spreadsheetId && res.members.length === 0) {
        const fallback = await list({ data: { spreadsheetId: null } });
        if (fallback.members.length > 0 || fallback.spreadsheetId !== spreadsheetId) {
          res = fallback;
        }
      }
      onConfig(res.spreadsheetId);
      setMembers(res.members);
      useExpenseStore.getState().setMembersCache({
        members: res.members,
        spreadsheetId: res.spreadsheetId,
        fetchedAt: Date.now(),
      });
    } catch (e) {
      console.error("listMembers failed", e);
      const msg = e instanceof Error ? e.message : String(e);
      const friendly =
        msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")
          ? "Google Sheets est saturé. Réessaie dans quelques instants."
          : "Impossible de charger la liste des membres. Réessaie dans un instant.";
      toast.error(friendly);
      if (!members) setMode("choose");
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function submitNew() {
    const cleanIban = iban.replace(/\s/g, "").toUpperCase();
    const cleanBank = bankName.trim();
    const cleanEmail = email.trim().toLocaleLowerCase("fr-FR");
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Prénom et nom sont requis.");
      return;
    }
    if (!birthday) {
      toast.error("Date de naissance requise.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      toast.error("Email invalide.");
      return;
    }
    if (!/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(cleanIban)) {
      toast.error("IBAN invalide. Vérifie le nombre de caractères (ex. FR + 25 chiffres).");
      return;
    }
    if (!cleanBank) {
      toast.error("Sélectionne ta banque.");
      return;
    }
    setLoading(true);
    try {
      const res = await create({
        data: {
          spreadsheetId,
          firstName,
          lastName,
          iban: cleanIban,
          bankName: cleanBank,
          birthday,
          email: cleanEmail,
          spouseId: spouseId || undefined,
        },
      });
      onConfig(res.spreadsheetId);
      for (const child of pendingChildren) {
        try {
          await createChild({
            data: {
              spreadsheetId: res.spreadsheetId,
              parentFirstName: res.member.firstName,
              parentLastName: res.member.lastName,
              firstName: child.firstName,
              birthday: child.birthday,
            },
          });
        } catch (e) {
          console.error("addChild failed", e);
          toast.error(
            `L'ajout de ${child.firstName} a échoué, tu pourras le refaire depuis ton profil.`,
          );
        }
      }
      onMember(res.member);
      toast.success(`Bienvenue ${res.member.firstName}.`);
      const cache = useExpenseStore.getState().membersCache;
      if (cacheIsFresh(cache)) {
        useExpenseStore.getState().setMembersCache({
          ...cache,
          members: [...cache.members, res.member],
        });
      }
    } catch (e) {
      console.error("addMember failed", e);
      const msg = e instanceof Error ? e.message : String(e);
      const friendly =
        msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")
          ? "Google Sheets est saturé. Réessaie dans quelques instants."
          : `L'enregistrement a échoué : ${msg}`;
      toast.error(friendly);
    } finally {
      setLoading(false);
    }
  }

  if (mode === "choose") {
    return (
      <section className="flex flex-1 flex-col animate-rise">
        <div className="py-2">
          <h1 className="text-[2.75rem] xs:text-5xl sm:text-6xl font-black leading-[0.95] tracking-tight break-words">
            Enchanté,
            <br />
            on se connaît&nbsp;?
          </h1>
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <button
            onClick={openExisting}
            className="tap lift group -mx-3 flex min-h-28 items-center justify-between gap-4 rounded-[1.75rem] border border-brand-secondary bg-brand-secondary px-5 py-5 text-left text-brand-secondary-foreground shadow-card"
          >
            <div className="min-w-0">
              <div className="text-xl font-bold leading-tight">J’ai déjà un profil</div>
              <div className="mt-1 text-sm text-brand-secondary-foreground/75">
                Je retrouve mon nom dans la liste
              </div>
            </div>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-secondary-foreground/12 transition-transform group-hover:translate-x-0.5">
              <Users className="h-5 w-5" strokeWidth={2} />
            </span>
          </button>

          <button
            onClick={() => setMode("new")}
            className="tap lift group -mx-3 flex min-h-28 items-center justify-between gap-4 rounded-[1.75rem] border border-border bg-card px-5 py-5 text-left hover-device:hover:border-brand-secondary/50 hover-device:hover:bg-secondary/45"
          >
            <div className="min-w-0">
              <div className="text-xl font-bold leading-tight">C’est ma première fois</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Je crée mon profil une fois pour toutes
              </div>
            </div>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-secondary/10 text-brand-secondary transition-transform group-hover:translate-x-0.5">
              <UserPlus className="h-5 w-5" strokeWidth={2} />
            </span>
          </button>
        </div>
      </section>
    );
  }

  if (mode === "new") {
    return (
      <section className="flex flex-1 flex-col animate-rise">
        <button
          onClick={() => setMode("choose")}
          className="mb-4 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
        <h1 className="text-[2.5rem] xs:text-5xl font-black leading-[0.95] tracking-tight">
          Fais ta fiche.
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          C'est relou d'entrer son IBAN. Mais c'est encore plus relou de ne jamais se faire
          rembourser.
        </p>
        <p className="mt-2 text-xs text-muted-foreground/80">
          PS : si tu l'as déjà donné un jour, merci. Il faut malheureusement recommencer.
        </p>
        <div className="mt-6 space-y-3">
          <Field
            label="Prénom"
            value={firstName}
            onChange={setFirstName}
            placeholder="marie"
            autoCapitalize="words"
          />
          <Field
            label="Nom"
            value={lastName}
            onChange={setLastName}
            placeholder="dupont"
            autoCapitalize="characters"
          />
          <Field label="Date de naissance" value={birthday} onChange={setBirthday} type="date" />
          <Field
            label="Email"
            value={email}
            onChange={setEmail}
            placeholder="marie@exemple.fr"
            type="email"
          />
          <Field
            label="IBAN"
            value={iban}
            onChange={setIban}
            placeholder="FR76 …"
            autoCapitalize="characters"
          />
          <BankPicker value={bankName} onChange={setBankName} />

          <div>
            <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Heart className="h-3 w-3" /> Ma famille (optionnel)
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground/80">
              Conjoint·e et enfants — ça te permettra de les ajouter aux résa et aux chantiers plus rapidement.
            </p>

            <div className="mt-2">
              <div className="text-[10px] font-medium text-muted-foreground mb-1">Conjoint·e</div>
              <select
                value={spouseId}
                onChange={(e) => setSpouseId(e.target.value)}
                className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-base outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
              >
                <option value="">Aucun·e</option>
                {(members ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.firstName} {m.lastName}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 text-[10px] font-medium text-muted-foreground mb-1">Enfants</div>

            {spouseId ? (
              <div className="rounded-xl bg-secondary/60 px-3 py-2.5 text-xs text-muted-foreground">
                Les enfants ont déjà été ajoutés par ton·ta conjoint·e et apparaîtront automatiquement.
              </div>
            ) : (
            <>
            {pendingChildren.length > 0 && (
              <div className="mt-2 space-y-2">
                {pendingChildren.map((c, i) => (
                  <div
                    key={`${c.firstName}-${i}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5"
                  >
                    <div className="text-sm">
                      <span className="font-semibold">{c.firstName}</span>
                      {c.birthday && (
                        <span className="ml-1.5 text-[11px] text-muted-foreground">
                          né(e) le {c.birthday}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removePendingChild(i)}
                      className="p-1 text-muted-foreground hover:text-destructive"
                      aria-label="Retirer cet enfant"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-2 space-y-2">
              <input
                value={newChildFirstName}
                onChange={(e) => setNewChildFirstName(e.target.value.slice(0, 60))}
                placeholder="Prénom de l'enfant"
                className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
              <div className="flex gap-2">
              <input
                type="date"
                value={newChildBirthday}
                onChange={(e) => setNewChildBirthday(e.target.value)}
                className="flex-1 rounded-2xl border border-border bg-card px-3 py-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
              <button
                type="button"
                onClick={addPendingChild}
                className="tap flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-foreground"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
              </button>
              </div>
            </div>
            </>
            )}
          </div>
        </div>
        <button
          onClick={submitNew}
          disabled={loading}
          className="tap lift mt-6 rounded-2xl bg-brand-accent px-4 py-4 text-sm font-semibold text-brand-accent-foreground disabled:opacity-50 shadow-card"
        >
          {loading ? "Enregistrement…" : "C'est parti →"}
        </button>
      </section>
    );
  }

  // existing
  const filtered = (() => {
    if (!members) return [];
    const q = query.trim().toLocaleLowerCase("fr-FR");
    if (!q) return [];
    return members
      .filter((m) => `${m.firstName} ${m.lastName}`.toLocaleLowerCase("fr-FR").includes(q))
      .slice(0, 4);
  })();

  return (
    <section className="flex flex-1 flex-col animate-rise">
      <button
        onClick={() => setMode("choose")}
        className="mb-4 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition"
      >
        <ArrowLeft className="h-4 w-4" /> Retour
      </button>
      <h1 className="text-[2.5rem] xs:text-5xl font-black leading-[0.95] tracking-tight">
        Qui es-tu ?
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Tape les premières lettres de ton prénom, ou choisis directement.
      </p>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {members ? `${members.length} membre${members.length > 1 ? "s" : ""}` : "\u00A0"}
        </span>
        <button
          onClick={() => refreshMembers(true)}
          disabled={loading}
          className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition disabled:opacity-50"
        >
          <RotateCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>
      <div className="relative mt-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher…"
          className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-base placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
        />
      </div>
      <div className="mt-3 max-h-[55vh] space-y-2 overflow-y-auto pr-1 no-scrollbar">
        {loading && (
          <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Chargement…
          </div>
        )}
        {!loading && members && members.length === 0 && (
          <div className="rounded-2xl bg-secondary/50 p-4 text-sm text-muted-foreground">
            Personne pour l'instant. Reviens et choisis « Première fois ».
          </div>
        )}
        {!loading &&
          members &&
          members.length > 0 &&
          query.trim() &&
          (filtered.length === 0 ? (
            <div className="rounded-2xl bg-secondary/50 p-4 text-sm text-muted-foreground">
              Aucun nom ne correspond.
            </div>
          ) : (
            filtered.map((m, i) => (
              <button
                key={`${m.firstName}-${m.lastName}-${i}`}
                onClick={() => onMember(m)}
                onMouseDown={(e) => e.preventDefault()}
                className="tap group flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-left hover-device:hover:bg-secondary hover-device:hover:border-foreground/30 hover-device:hover:translate-x-0.5"
              >
                <div className="text-base font-medium">
                  <span>{m.firstName}</span>{" "}
                  <span className="text-muted-foreground">{m.lastName}</span>
                </div>
                <ArrowRight
                  className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground"
                  strokeWidth={2}
                />
              </button>
            ))
          ))}
      </div>
    </section>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  autoCapitalize,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoCapitalize?: string;
  type?: "text" | "email" | "date";
}) {
  return (
    <label className="block">
      <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoCapitalize={autoCapitalize}
        className="mt-1.5 w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-base placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
      />
    </label>
  );
}

export function BankPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // keep query in sync if parent resets
    if (!value) setQuery("");
  }, [value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = query.trim().toLocaleLowerCase("fr-FR");
  const matches = q
    ? FRENCH_BANKS.filter((b) => b.toLocaleLowerCase("fr-FR").includes(q)).slice(0, 8)
    : FRENCH_BANKS.slice(0, 8);
  const exactMatch = FRENCH_BANKS.some((b) => b.toLocaleLowerCase("fr-FR") === q);

  function pick(bank: string) {
    onChange(bank);
    setQuery(bank);
    setOpen(false);
    setCustomMode(false);
  }

  if (customMode) {
    return (
      <label className="block">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Ta banque
          </div>
          <button
            type="button"
            onClick={() => {
              setCustomMode(false);
              setQuery("");
              onChange("");
            }}
            className="text-[10px] font-semibold text-muted-foreground hover:text-foreground transition"
          >
            ← Choisir dans la liste
          </button>
        </div>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Nom de ta banque"
          autoFocus
          className="mt-1.5 w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-base placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
        />
      </label>
    );
  }

  return (
    <div className="relative" ref={wrapRef}>
      <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        Ta banque
      </div>
      <div className="relative mt-1.5">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (!e.target.value) onChange("");
          }}
          onFocus={() => setOpen(true)}
          placeholder="Tape les premières lettres…"
          className="w-full rounded-2xl border border-border bg-card pl-10 pr-4 py-3.5 text-base placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
        />
      </div>
      {open && (
        <div className="absolute z-20 mt-1.5 max-h-64 w-full overflow-y-auto rounded-2xl border border-border bg-card shadow-lift">
          {matches.map((b) => (
            <button
              key={b}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(b)}
              className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-secondary transition ${value === b ? "bg-secondary/60 font-semibold" : ""}`}
            >
              <span>{b}</span>
              {value === b && <Check className="h-4 w-4 text-foreground" strokeWidth={2.5} />}
            </button>
          ))}
          {matches.length === 0 && (
            <div className="px-4 py-3 text-sm text-muted-foreground">Aucune banque trouvée.</div>
          )}
          {q && !exactMatch && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(query.trim());
                setCustomMode(true);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 border-t border-border px-4 py-3 text-left text-sm font-semibold text-foreground hover:bg-secondary transition"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Ajouter « {query.trim()} »
            </button>
          )}
          {!q && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setCustomMode(true);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 border-t border-border px-4 py-3 text-left text-sm font-semibold text-foreground hover:bg-secondary transition"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Ma banque n'est pas dans la liste
            </button>
          )}
        </div>
      )}
    </div>
  );
}
