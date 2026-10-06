import { useState } from "react";
import { X, UserPlus, Baby, Users, Search } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { WizardPerson } from "./types";
import type { Child } from "@/lib/children.functions";
import type { Member } from "@/lib/members.functions";
import { isChildPersonType, initials } from "./utils";

interface Props {
  people: WizardPerson[];
  currentUserName: string;
  myChildren: Child[];
  availableMembers: Member[];
  onChange: (people: WizardPerson[]) => void;
}

function PersonChip({
  person,
  isMe,
  onRemove,
}: {
  person: WizardPerson;
  isMe: boolean;
  onRemove?: () => void;
}) {
  const isChild = isChildPersonType(person.personType);
  const isGuest = person.personType.startsWith("guest");

  const bg = isMe
    ? "bg-brand-secondary text-brand-secondary-foreground"
    : isChild
      ? "bg-secondary text-foreground"
      : isGuest
        ? "border border-border bg-card text-foreground"
        : "bg-brand-secondary/15 text-brand-secondary";

  return (
    <div className={`flex items-center gap-2 rounded-2xl px-3.5 py-2.5 ${bg}`}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-black">
        {initials(person.name)}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-bold leading-tight">{person.name}</div>
        <div className={`text-2xs font-semibold uppercase tracking-wide ${isMe ? "text-white/60" : "text-muted-foreground"}`}>
          {isMe ? "Toi" : isChild ? "Enfant" : isGuest ? "Woofer" : "Membre"}
        </div>
      </div>
      {!isMe && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Retirer ${person.name}`}
          className="tap -mr-1 ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/10 transition hover:bg-black/20"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

type AddMode = "member" | "woofer";

export function Step1Participants({ people, currentUserName, myChildren, availableMembers, onChange }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>("member");
  const [search, setSearch] = useState("");
  const [wooferName, setWooferName] = useState("");
  const [wooferIsChild, setWooferIsChild] = useState(false);

  const addedNames = new Set(people.map((p) => p.name));
  const unaddedChildren = myChildren.filter((c) => !addedNames.has(c.firstName));
  const filteredMembers = availableMembers.filter(
    (m) =>
      !addedNames.has(m.firstName) &&
      m.firstName !== currentUserName &&
      (search === "" || m.firstName.toLowerCase().includes(search.toLowerCase())),
  );

  function addPerson(name: string, type: WizardPerson["personType"]) {
    onChange([
      ...people,
      { key: `${type}-${name}-${Date.now()}`, name, personType: type, teletravail: false },
    ]);
  }

  function removePerson(key: string) {
    onChange(people.filter((p) => p.key !== key));
  }

  function openSheet() {
    setAddMode("member");
    setSearch("");
    setWooferName("");
    setWooferIsChild(false);
    setSheetOpen(true);
  }

  function selectMember(firstName: string) {
    addPerson(firstName, "member");
    setSheetOpen(false);
  }

  function confirmWoofer() {
    const name = wooferName.trim();
    if (!name) return;
    addPerson(name, wooferIsChild ? "guest_child" : "guest_adult");
    setWooferName("");
    setWooferIsChild(false);
    setSheetOpen(false);
  }

  return (
    <div className="space-y-6 py-2">
      {/* Selected participants */}
      <div>
        <div className="label-micro mb-3">Participants sélectionnés</div>
        <div className="flex flex-wrap gap-2">
          {people.map((p) => (
            <PersonChip
              key={p.key}
              person={p}
              isMe={p.name === currentUserName && p.key === people[0]?.key}
              onRemove={() => removePerson(p.key)}
            />
          ))}
        </div>
      </div>

      {/* Children quick-add */}
      {unaddedChildren.length > 0 && (
        <div>
          <div className="label-micro mb-3">Ta famille</div>
          <div className="flex flex-wrap gap-2">
            {unaddedChildren.map((c) => (
              <button
                key={c.firstName}
                type="button"
                onClick={() => addPerson(c.firstName, "child")}
                className="tap flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-brand-secondary/40 hover:text-brand-secondary"
              >
                <Baby className="h-3.5 w-3.5" />
                {c.firstName}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add member or woofer */}
      <button
        type="button"
        onClick={openSheet}
        className="tap flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3.5 text-sm font-semibold text-muted-foreground transition hover:border-brand-secondary/30 hover:text-brand-secondary"
      >
        <UserPlus className="h-4 w-4" />
        Ajouter un membre ou un woofer
      </button>

      {/* Add sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[75dvh] rounded-t-3xl px-5 pb-10 pt-6">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-left text-lg font-black">Ajouter un participant</SheetTitle>
          </SheetHeader>

          {/* Mode toggle */}
          <div className="mb-5 flex gap-1 rounded-xl bg-secondary p-1">
            <button
              type="button"
              onClick={() => setAddMode("member")}
              className={`tap flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition ${
                addMode === "member"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              <Users className="h-3.5 w-3.5" /> Membre
            </button>
            <button
              type="button"
              onClick={() => setAddMode("woofer")}
              className={`tap flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition ${
                addMode === "woofer"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              <UserPlus className="h-3.5 w-3.5" /> Woofer
            </button>
          </div>

          {addMode === "member" ? (
            <div className="space-y-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un membre…"
                  className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-4 text-sm outline-none focus:border-brand-secondary/50 focus:ring-2 focus:ring-brand-secondary/10"
                />
              </div>
              {/* Member list */}
              <div className="no-scrollbar max-h-[40vh] space-y-1.5 overflow-y-auto">
                {filteredMembers.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    {search ? "Aucun résultat" : "Tous les membres sont déjà ajoutés"}
                  </p>
                ) : (
                  filteredMembers.map((m) => (
                    <button
                      key={m.firstName}
                      type="button"
                      onClick={() => selectMember(m.firstName)}
                      className="tap flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition hover:border-brand-secondary/40 hover:bg-brand-secondary/5"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-secondary/10 text-xs font-black text-brand-secondary">
                        {initials(m.firstName)}
                      </span>
                      <span className="text-sm font-bold">{m.firstName}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <input
                value={wooferName}
                onChange={(e) => setWooferName(e.target.value.slice(0, 60))}
                placeholder="Prénom du woofer…"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && confirmWoofer()}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-brand-secondary/50 focus:ring-2 focus:ring-brand-secondary/10"
              />
              <button
                type="button"
                onClick={() => setWooferIsChild((v) => !v)}
                className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition ${
                  wooferIsChild
                    ? "border-brand-secondary bg-brand-secondary/10 text-brand-secondary"
                    : "border-border text-muted-foreground"
                }`}
              >
                <Baby className="h-3.5 w-3.5" />
                C'est un enfant
              </button>
              <button
                type="button"
                onClick={confirmWoofer}
                disabled={!wooferName.trim()}
                className="tap w-full rounded-xl bg-brand-secondary py-3.5 text-sm font-bold text-white transition disabled:opacity-40"
              >
                Ajouter
              </button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
