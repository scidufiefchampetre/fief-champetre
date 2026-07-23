import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  Trash2,
  CalendarDays,
  Wallet,
  HardHat,
  Pencil,
  ArrowRight,
  Plus,
  X,
  Heart,
} from "lucide-react";
import { toast } from "sonner";

import { listMembers, updateMember, deleteMember, type Member } from "@/lib/members.functions";
import { listChildren, addChild, deleteChild, type Child } from "@/lib/children.functions";
import { listMyChantierDays } from "@/lib/chantier-contributions.functions";
import { DUTY_ROLE_LABEL, DUTY_SLOT_LABEL } from "@/lib/chantier-duties.functions";
import { useExpenseStore } from "@/core/store/expense-store";
import { useProfileSummary } from "@/core/hooks/use-profile-summary";
import { AppHeader } from "@/core/components/app-header";
import { PageShell } from "@/components/ui/page-shell";
import { Field, BankPicker } from "@/core/components/member-gate";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const CHANTIER_TARGET = 10;

function fmtEur(n: number) {
  return `${n.toFixed(0)} €`;
}

function fmtDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export const Route = createFileRoute("/profil")({
  component: ProfilPage,
  head: () => ({
    meta: [{ title: "Mon profil · Fief Champêtre" }],
  }),
});

function normalize(v: string) {
  return v.trim().toLocaleLowerCase("fr-FR");
}

function ProfilPage() {
  const store = useExpenseStore();
  const navigate = useNavigate();
  const list = useServerFn(listMembers);
  const update = useServerFn(updateMember);
  const remove = useServerFn(deleteMember);
  const listKids = useServerFn(listChildren);
  const createChild = useServerFn(addChild);
  const removeChild = useServerFn(deleteChild);
  const myDays = useServerFn(listMyChantierDays);
  const summary = useProfileSummary(true);

  const [hydrated, setHydrated] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [iban, setIban] = useState("");
  const [bankName, setBankName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [email, setEmail] = useState("");
  const [spouseId, setSpouseId] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const [otherMembers, setOtherMembers] = useState<Member[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [newChildFirstName, setNewChildFirstName] = useState("");
  const [newChildBirthday, setNewChildBirthday] = useState("");
  const [addingChild, setAddingChild] = useState(false);

  const [chantierDays, setChantierDays] = useState<number | null>(null);
  const [chantierDaysError, setChantierDaysError] = useState(false);

  useEffect(() => {
    useExpenseStore.getState().hydrateMember();
    setHydrated(true);
  }, []);

  // On va chercher la fiche complète côté Sheet (IBAN/banque/naissance/email) :
  // le membre stocké localement est minimal et pourrait être périmé, on ne
  // veut surtout pas préremplir avec des champs vides qui écraseraient les
  // vraies valeurs à l'enregistrement.
  useEffect(() => {
    if (!hydrated || !store.member) return;
    setLoadingProfile(true);
    list({ data: { spreadsheetId: store.spreadsheetId } })
      .then((res) => {
        store.setConfig({ spreadsheetId: res.spreadsheetId });
        const mine = res.members.find(
          (m) =>
            normalize(m.firstName) === normalize(store.member!.firstName) &&
            normalize(m.lastName) === normalize(store.member!.lastName),
        );
        if (mine) {
          setIban(mine.iban ?? "");
          setBankName(mine.bankName ?? "");
          setBirthday(mine.birthday ?? "");
          setEmail(mine.email ?? "");
          setSpouseId(mine.spouseId ?? "");
        }
        setOtherMembers(
          res.members.filter(
            (m) =>
              !(
                normalize(m.firstName) === normalize(store.member!.firstName) &&
                normalize(m.lastName) === normalize(store.member!.lastName)
              ),
          ),
        );
      })
      .catch((e) => {
        console.error("listMembers failed", e);
        toast.error("Impossible de charger ta fiche. Réessaie.");
      })
      .finally(() => setLoadingProfile(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, store.member?.firstName, store.member?.lastName]);

  function refreshChildren() {
    if (!store.member) return;
    setLoadingChildren(true);
    listKids({
      data: {
        spreadsheetId: store.spreadsheetId,
        parentFirstName: store.member.firstName,
        parentLastName: store.member.lastName,
      },
    })
      .then((res) => setChildren(res.children))
      .catch((e) => console.error("listChildren failed", e))
      .finally(() => setLoadingChildren(false));
  }

  useEffect(() => {
    if (!hydrated || !store.member) return;
    refreshChildren();
    setChantierDaysError(false);
    myDays({ data: { person: store.member.firstName } })
      .then((res) => setChantierDays(res.days))
      .catch((e) => {
        console.error("listMyChantierDays failed", e);
        setChantierDaysError(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, store.member?.firstName, store.member?.lastName]);

  async function handleAddChild() {
    if (!store.member || !newChildFirstName.trim()) {
      toast.error("Prénom de l'enfant requis.");
      return;
    }
    setAddingChild(true);
    try {
      await createChild({
        data: {
          spreadsheetId: store.spreadsheetId,
          parentFirstName: store.member.firstName,
          parentLastName: store.member.lastName,
          firstName: newChildFirstName.trim(),
          birthday: newChildBirthday,
        },
      });
      setNewChildFirstName("");
      setNewChildBirthday("");
      refreshChildren();
    } catch (e) {
      console.error("addChild failed", e);
      toast.error("Échec de l'ajout.");
    } finally {
      setAddingChild(false);
    }
  }

  async function handleDeleteChild(firstName: string) {
    if (!store.member) return;
    try {
      await removeChild({
        data: {
          spreadsheetId: store.spreadsheetId,
          parentFirstName: store.member.firstName,
          parentLastName: store.member.lastName,
          firstName,
        },
      });
      refreshChildren();
    } catch (e) {
      console.error("deleteChild failed", e);
      toast.error("Échec de la suppression.");
    }
  }

  if (!hydrated) return null;

  if (!store.member) {
    return (
      <PageShell>
        <AppHeader variant="back" className="mb-4" />
        <div className="rounded-2xl bg-secondary/50 p-5 text-sm text-muted-foreground animate-rise">
          Identifie-toi d'abord depuis l'accueil pour voir ton profil.
        </div>
      </PageShell>
    );
  }

  const member = store.member;

  async function handleSave() {
    const cleanIban = iban.replace(/\s/g, "").toUpperCase();
    const cleanBank = bankName.trim();
    const cleanEmail = email.trim().toLocaleLowerCase("fr-FR");
    if (!birthday) {
      toast.error("Date de naissance requise.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      toast.error("Email invalide.");
      return;
    }
    if (!/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(cleanIban)) {
      toast.error("IBAN invalide.");
      return;
    }
    if (!cleanBank) {
      toast.error("Sélectionne ta banque.");
      return;
    }
    setSaving(true);
    try {
      const res = await update({
        data: {
          spreadsheetId: store.spreadsheetId,
          firstName: member.firstName,
          lastName: member.lastName,
          iban: cleanIban,
          bankName: cleanBank,
          birthday,
          email: cleanEmail,
          spouseId,
        },
      });
      store.setConfig({ spreadsheetId: res.spreadsheetId });
      store.setMember({
        firstName: res.member.firstName,
        lastName: res.member.lastName,
        iban: res.member.iban,
        bankName: res.member.bankName,
      });
      // Le cache local de la liste des membres devient obsolète (IBAN changé) — on le vide.
      store.setMembersCache(null);
      toast.success("Profil mis à jour.");
      setEditOpen(false);
    } catch (e) {
      console.error("updateMember failed", e);
      toast.error("La mise à jour a échoué. Réessaie.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await remove({
        data: {
          spreadsheetId: store.spreadsheetId,
          firstName: member.firstName,
          lastName: member.lastName,
        },
      });
      store.setMembersCache(null);
      store.setMember(null);
      toast.success("Profil supprimé.");
      navigate({ to: "/" });
    } catch (e) {
      console.error("deleteMember failed", e);
      toast.error("La suppression a échoué. Réessaie.");
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  }

  return (
    <PageShell>
      <AppHeader variant="back" />

      <div className="animate-rise">
        <h1 className="page-title">Mon profil.</h1>
        <p className="mt-2 text-xs text-muted-foreground">
          {member.firstName} {member.lastName}
        </p>

        <div className="mt-5 grid grid-cols-1 gap-3">
          <Link
            to="/mes-reservations"
            className="group flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-brand-secondary/40 active:scale-[0.99]"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-secondary/15 text-brand-secondary">
                <CalendarDays className="h-5 w-5" strokeWidth={2} />
              </div>
              <div>
                <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  Prochain séjour
                </div>
                <div className="text-sm font-bold mt-0.5">
                  {summary.reservationsLoading
                    ? "Chargement…"
                    : summary.reservationsError
                      ? "Impossible de charger les séjours"
                      : summary.nextReservation
                        ? `${fmtDate(summary.nextReservation.startDate)} → ${fmtDate(summary.nextReservation.endDate)}`
                        : "Aucun séjour prévu"}
                </div>
                {!summary.reservationsLoading &&
                  !summary.reservationsError &&
                  summary.reservationsDueCount > 0 && (
                    <div className="mt-1 text-[10px] font-semibold text-brand-secondary">
                      {fmtEur(summary.reservationsDueAmount)} à régler
                    </div>
                  )}
              </div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-brand-secondary transition-transform group-hover:translate-x-0.5" />
          </Link>

          {summary.chantiersLoading ? (
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-secondary/15 text-brand-secondary">
                <HardHat className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  Prochain chantier
                </div>
                <div className="mt-0.5 text-sm font-bold">Chargement…</div>
              </div>
            </div>
          ) : summary.chantiersError ? (
            <Link
              to="/chantiers"
              className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-brand-secondary/40"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-secondary/15 text-brand-secondary">
                <HardHat className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  Prochain chantier
                </div>
                <div className="mt-0.5 text-sm font-bold">Impossible de charger les chantiers</div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-brand-secondary" />
            </Link>
          ) : summary.nextChantier ? (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <Link
                to="/chantier/$id"
                params={{ id: summary.nextChantier.id }}
                search={{
                  startDate: summary.nextChantier.startDate,
                  demo: false,
                  signupDemo: false,
                  focus: undefined,
                }}
                className="group flex items-center gap-3 p-4 transition hover:bg-secondary/50"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-secondary/15 text-brand-secondary">
                  <HardHat className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Prochain chantier
                  </div>
                  <div className="mt-0.5 text-sm font-bold">
                    {fmtDate(summary.nextChantier.startDate)} →{" "}
                    {fmtDate(summary.nextChantier.endDate)}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-brand-secondary transition-transform group-hover:translate-x-0.5" />
              </Link>
              <div className="border-t border-border/70 px-4 py-3">
                <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  Ton intendance
                </div>
                {summary.nextChantierDuties.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {summary.nextChantierDuties.map((duty) => (
                      <Link
                        key={duty.id}
                        to="/chantier/$id"
                        params={{ id: summary.nextChantier!.id }}
                        search={{
                          startDate: summary.nextChantier!.startDate,
                          demo: false,
                          signupDemo: false,
                          focus: "intendance",
                        }}
                        className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1.5 text-[10px] font-semibold transition hover:bg-secondary"
                      >
                        {DUTY_ROLE_LABEL[duty.role]} · {fmtDate(duty.date)} ·{" "}
                        {DUTY_SLOT_LABEL[duty.role][duty.slot]}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <Link
                    to="/chantier/$id"
                    params={{ id: summary.nextChantier.id }}
                    search={{
                      startDate: summary.nextChantier.startDate,
                      demo: false,
                      signupDemo: false,
                      focus: "intendance",
                    }}
                    className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-brand-secondary"
                  >
                    Aucune mission choisie · voir les créneaux <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <Link
              to="/chantiers"
              className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-brand-secondary/40 hover:bg-secondary/50"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-secondary/15">
                <HardHat className="h-5 w-5 text-brand-secondary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  Prochain chantier
                </div>
                <div className="mt-0.5 text-sm font-bold">Aucune inscription</div>
              </div>
              <ArrowRight className="h-4 w-4 text-brand-secondary transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}

          <Link
            to="/depenses"
            className="group flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-brand-secondary/40 active:scale-[0.99]"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-secondary/15 text-brand-secondary">
                <Wallet className="h-5 w-5" strokeWidth={2} />
              </div>
              <div>
                <div className="text-[10px] font-medium uppercase tracking-widest opacity-70">
                  Dépenses en attente
                </div>
                <div className="text-sm font-bold mt-0.5">
                  {summary.expensesLoading
                    ? "Chargement…"
                    : summary.expensesError
                      ? "Impossible de charger les dépenses"
                      : summary.expensesPendingCount === 0
                        ? "Rien à te rembourser"
                        : `${fmtEur(summary.expensesPendingAmount)} sur ${summary.expensesPendingCount} note${summary.expensesPendingCount > 1 ? "s" : ""}`}
                </div>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-brand-secondary transition-transform group-hover:translate-x-0.5" />
          </Link>

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-secondary/15">
                <HardHat className="h-5 w-5 text-brand-secondary" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  Tes jours de chantier
                </div>
                <div
                  className={`text-sm font-bold mt-0.5 ${(chantierDays ?? 0) >= CHANTIER_TARGET ? "text-success" : ""}`}
                >
                  {chantierDaysError
                    ? "Impossible de charger tes jours"
                    : chantierDays === null
                      ? "Chargement…"
                      : chantierDays === 0
                        ? "Pas encore de jour contribué"
                        : `${chantierDays} jour${chantierDays > 1 ? "s" : ""} contribué${chantierDays > 1 ? "s" : ""}`}
                </div>
              </div>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-brand-secondary"
                style={{
                  width: `${Math.min(100, ((chantierDays ?? 0) / CHANTIER_TARGET) * 100)}%`,
                }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] font-semibold text-muted-foreground">
              <span>
                {chantierDays ?? 0} / {CHANTIER_TARGET}
              </span>
              <span>
                {(chantierDays ?? 0) >= CHANTIER_TARGET
                  ? "Objectif dépassé, bravo ✓"
                  : `Objectif ${CHANTIER_TARGET} jours`}
              </span>
            </div>
            <Link
              to="/chantiers"
              className="mt-2 block text-[10px] font-semibold text-brand-secondary hover:underline"
            >
              Voir les prochains chantiers →
            </Link>
          </div>
        </div>

        <button
          onClick={() => setEditOpen((v) => !v)}
          className="tap mt-8 flex w-full items-center justify-between gap-2 rounded-2xl border border-border bg-card px-4 py-3.5 transition hover:bg-secondary"
        >
          <span className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-muted-foreground" />
            <span className="text-[13px] font-semibold text-foreground">
              Modifier mes informations
            </span>
          </span>
          <ArrowRight
            className={`h-4 w-4 text-muted-foreground transition-transform ${editOpen ? "rotate-90" : ""}`}
          />
        </button>

        {editOpen && (
          <div className="mt-3 animate-rise">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Prénom
                  </div>
                  <div className="mt-1.5 rounded-2xl border border-border bg-secondary/50 px-4 py-3.5 text-base font-semibold">
                    {member.firstName}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Nom
                  </div>
                  <div className="mt-1.5 rounded-2xl border border-border bg-secondary/50 px-4 py-3.5 text-base font-semibold">
                    {member.lastName}
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground/80">
                Prénom et nom ne sont pas modifiables ici : c'est ce qui relie tes réservations et
                dépenses passées.
              </p>

              <Field
                label="Date de naissance"
                value={birthday}
                onChange={setBirthday}
                type="date"
              />
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
                  <Heart className="h-3 w-3" /> Conjoint·e (optionnel)
                </div>
                <select
                  value={spouseId}
                  onChange={(e) => setSpouseId(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-base outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                >
                  <option value="">Aucun</option>
                  {otherMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.firstName} {m.lastName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  Mes enfants (optionnel)
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground/80">
                  Ils apparaîtront dans la liste à cocher quand tu inscriras du monde à un chantier
                  ou un séjour.
                </p>

                <div className="mt-2 space-y-2">
                  {loadingChildren && (
                    <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                      Chargement…
                    </div>
                  )}
                  {!loadingChildren && children.length === 0 && (
                    <div className="rounded-xl bg-secondary/50 px-3 py-2.5 text-xs text-muted-foreground">
                      Aucun enfant déclaré pour l'instant.
                    </div>
                  )}
                  {children.map((c) => (
                    <div
                      key={c.firstName}
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
                        onClick={() => handleDeleteChild(c.firstName)}
                        className="p-1 text-muted-foreground hover:text-destructive"
                        aria-label="Supprimer cet enfant"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-2 flex gap-2">
                  <input
                    value={newChildFirstName}
                    onChange={(e) => setNewChildFirstName(e.target.value.slice(0, 60))}
                    placeholder="Prénom"
                    className="flex-1 rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                  />
                  <input
                    type="date"
                    value={newChildBirthday}
                    onChange={(e) => setNewChildBirthday(e.target.value)}
                    className="w-[9.5rem] shrink-0 rounded-2xl border border-border bg-card px-3 py-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                  />
                  <button
                    onClick={handleAddChild}
                    disabled={addingChild}
                    className="tap flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-secondary text-brand-secondary-foreground disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving || loadingProfile}
              className="tap lift mt-6 w-full rounded-2xl bg-brand-secondary px-4 py-4 text-sm font-semibold text-brand-secondary-foreground disabled:opacity-50 shadow-card"
            >
              {loadingProfile
                ? "Chargement…"
                : saving
                  ? "Enregistrement…"
                  : "Enregistrer les modifications"}
            </button>
          </div>
        )}

        <button
          onClick={() => setConfirmOpen(true)}
          className="tap mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/30 px-4 py-3.5 text-sm font-semibold text-destructive hover:bg-destructive/5 transition"
        >
          <Trash2 className="h-4 w-4" />
          Supprimer mon profil
        </button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ton profil ?</AlertDialogTitle>
            <AlertDialogDescription>
              Ta fiche membre (IBAN, coordonnées) sera définitivement supprimée du classeur Google.
              Tes réservations et dépenses déjà enregistrées restent dans l'historique, sous ton
              nom. Il faudra te réinscrire pour réserver ou te faire rembourser à nouveau.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Suppression…" : "Supprimer définitivement"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
