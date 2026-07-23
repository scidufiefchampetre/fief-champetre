import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  Pencil,
  FileText,
  ArrowRight,
  ArrowLeft,
  Camera,
  Image as ImageIcon,
  Plus,
  CalendarDays,
  Send,
  HardHat,
} from "lucide-react";
import { toast } from "sonner";
import { analyzeInvoice } from "@/lib/analyze-invoice.functions";
import { exportExpense } from "@/lib/export-expense.functions";
import { useExpenseStore } from "@/core/store/expense-store";
import type { Expense, Side, ClarificationOption, TopCategory, Place } from "@/lib/expense-types";
import { PLACES } from "@/lib/expense-types";
import { ExpenseCard } from "@/components/expense-card";
import { AppHeader } from "@/core/components/app-header";
import { PersonalHomeDashboard } from "@/features/home/components/personal-home-dashboard";
import { listChantiers } from "@/lib/chantier.functions";
import { chantierDisplayName, type Chantier } from "@/lib/chantier-types";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/")({
  component: Home,
});

type Phase = "idle" | "analyzing" | "card" | "exporting" | "done";

const ANALYSIS_MESSAGES = [
  "Lecture de la facture…",
  "On repère le fournisseur…",
  "On classe la dépense…",
  "SCI ou Asso ? On tranche…",
];

// Les photos prises au téléphone peuvent peser plusieurs Mo (souvent 3000x4000px+).
// Une fois encodées en base64 pour l'envoi au serveur, ça peut dépasser la limite de
// taille de requête acceptée et provoquer un "Bad Request" — sans rapport avec la
// lisibilité réelle de la facture. On redimensionne/recompresse côté navigateur avant
// l'envoi pour éliminer cette cause à la racine (les PDF ne sont pas concernés).
async function compressImageIfNeeded(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });

  const MAX_DIM = 1800;
  const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
  // Image déjà petite : pas besoin de compresser, on repart du fichier original.
  if (scale >= 1 && file.size < 1_500_000) return file;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.82),
  );
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
}

function fileToBase64(
  file: File,
): Promise<{ mimeType: string; dataBase64: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1] ?? "";
      resolve({ mimeType: file.type || "application/pdf", dataBase64: base64, dataUrl });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Home() {
  const navigate = useNavigate();
  const store = useExpenseStore();
  const analyze = useServerFn(analyzeInvoice);
  const doExport = useServerFn(exportExpense);
  const loadChantiers = useServerFn(listChantiers);
  const [phase, setPhase] = useState<Phase>("idle");
  const [msgIdx, setMsgIdx] = useState(0);
  const [flying, setFlying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [analysisErrorOpen, setAnalysisErrorOpen] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [techError, setTechError] = useState<string | null>(null);
  const [personalNote, setPersonalNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [heroPicked, setHeroPicked] = useState(false);
  const chantierRange = useMemo(() => {
    const start = new Date();
    start.setFullYear(start.getFullYear() - 2);
    const end = new Date();
    end.setFullYear(end.getFullYear() + 2);
    return { timeMin: start.toISOString(), timeMax: end.toISOString() };
  }, []);
  const { data: chantiersData, isLoading: chantiersLoading } = useQuery({
    queryKey: ["invoice-chantiers", chantierRange.timeMin, chantierRange.timeMax],
    queryFn: () => loadChantiers({ data: chantierRange }),
    enabled: phase === "card",
  });

  useEffect(() => {
    useExpenseStore.getState().hydrateConfig();
    useExpenseStore.getState().hydrateMember();
    useExpenseStore.getState().hydrateMembersCache();
  }, []);

  useEffect(() => {
    if (phase !== "analyzing") return;
    const t = setInterval(() => setMsgIdx((i) => (i + 1) % ANALYSIS_MESSAGES.length), 1600);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (store.expense && phase === "idle") setPhase("card");
  }, [store.expense, phase]);

  async function handleFile(rawFile: File) {
    try {
      setPhase("analyzing");
      setMsgIdx(0);
      const file = await compressImageIfNeeded(rawFile);
      const { mimeType, dataBase64, dataUrl } = await fileToBase64(file);
      store.setFile({ name: file.name, mimeType, dataUrl });
      const result = await analyze({
        data: { fileName: file.name, mimeType, dataBase64 },
      });
      const expense = result as unknown as Expense;
      const member = useExpenseStore.getState().member;
      if (expense.paidBy === "Membre" && !expense.memberName && member) {
        expense.memberName = `${member.firstName} ${member.lastName}`;
      }
      const missing: string[] = [];
      if (!expense.supplier?.trim()) missing.push("le fournisseur");
      if (!expense.amountTTC || expense.amountTTC <= 0) missing.push("le montant");
      if (!expense.invoiceDate?.trim()) missing.push("la date");
      if (missing.length >= 2) {
        setMissingFields(missing);
        setAnalysisErrorOpen(true);
        setPhase("idle");
        return;
      }
      if (missing.length === 1) {
        setMissingFields(missing);
      } else {
        setMissingFields([]);
      }
      store.setExpense(expense);
      setPhase("card");
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("MANUAL:")) {
        // Les deux fournisseurs IA ont échoué : plutôt qu'un mur d'erreur qui
        // bloque complètement la personne, on la fait atterrir directement
        // sur la saisie manuelle avec une fiche vierge à compléter.
        const blank: Expense = {
          supplier: "",
          invoiceDate: "",
          amountTTC: 0,
          vat: null,
          detectedObject: "",
          topCategory: "Divers / Exceptionnel",
          purchaseDetail: "",
          place: "Autre",
          paidBy: "Membre",
          paymentMethod: "Carte",
          finalSide: "SCI",
          comment: "",
          needsClarification: false,
          needsPlaceChoice: false,
        };
        store.setExpense(blank);
        toast.error(
          "L'IA est indisponible pour l'instant. Remplis les infos toi-même, ça prend 30 secondes.",
        );
        navigate({ to: "/modifier" });
        setPhase("idle");
        return;
      }
      // "TECH:" = erreur technique (API, réseau, quota...), pas un vrai souci
      // de lisibilité de la photo — on l'affiche telle quelle plutôt que le
      // message générique, sinon impossible de savoir ce qui cloche vraiment.
      setTechError(msg.startsWith("TECH:") ? msg.slice(5) : null);
      setMissingFields([]);
      setAnalysisErrorOpen(true);
      setPhase("idle");
    }
  }

  async function handleValidate() {
    if (!store.expense || !store.file) return;
    if (store.expense.topCategory === "Repas chantier" && !store.expense.chantierId) {
      toast.error("Choisis le chantier concerné avant de valider.");
      return;
    }
    setFlying(true);
    setPhase("exporting");
    try {
      const base64 = store.file.dataUrl.split(",")[1] ?? "";
      const trimmedNote = personalNote.trim();
      const isAsso = store.expense.finalSide?.toLowerCase().includes("asso");
      const expense = isAsso
        ? store.expense
        : { ...store.expense, chantierId: undefined, chantierStartDate: undefined, chantierLabel: undefined };
      const result = await doExport({
        data: {
          expense,
          file: { name: store.file.name, mimeType: store.file.mimeType, dataBase64: base64 },
          spreadsheetId: store.spreadsheetId,
          personalNote: trimmedNote,
          memberIban: store.member?.iban ?? null,
          depositor: store.member
            ? { firstName: store.member.firstName, lastName: store.member.lastName }
            : null,
        },
      });

      store.setConfig({ spreadsheetId: result.spreadsheetId });
      setPhase("done");
    } catch (e) {
      console.error(e);
      toast.error("L'enregistrement a échoué. Réessaie.");
      setFlying(false);
      setPhase("card");
    }
  }

  function reset() {
    store.setFile(null);
    store.setExpense(null);
    setFlying(false);
    setPersonalNote("");
    setNoteOpen(false);
    setPhase("idle");
  }

  function returnToHome() {
    reset();
    setHeroPicked(false);
  }

  function returnToPreviousStep() {
    if (phase !== "idle") {
      reset();
      return;
    }
    setHeroPicked(false);
  }

  const homeIsVisible = phase === "idle" && !heroPicked;

  return (
    <main className="min-h-dvh w-full bg-background">
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-6 py-6 sm:py-10">
        <AppHeader
          variant={homeIsVisible ? "home" : "back"}
          backLabel={phase === "idle" ? "Accueil" : "Ajouter une facture"}
          onBack={homeIsVisible ? undefined : returnToPreviousStep}
          onHome={returnToHome}
        />

        {!heroPicked && phase === "idle" ? (
          <PersonalHomeDashboard
            firstName={store.member?.firstName ?? null}
            lastName={store.member?.lastName ?? null}
            spreadsheetId={store.spreadsheetId}
            onPickInvoice={() => setHeroPicked(true)}
          />
        ) : (
          phase === "idle" && (
            <IdleView
              dragOver={dragOver}
              setDragOver={setDragOver}
              onCamera={() => cameraInputRef.current?.click()}
              onPick={() => inputRef.current?.click()}
              onFile={handleFile}
              memberName={store.member?.firstName ?? ""}
            />
          )
        )}

        {phase === "analyzing" && (
          <AnalyzingView message={ANALYSIS_MESSAGES[msgIdx]} onCancel={reset} />
        )}

        {phase === "card" && store.expense && (
          <div className={flying ? "animate-fly" : "animate-rise space-y-3"}>
            <ExpenseCard expense={store.expense} fileName={store.file?.name} />
            {missingFields.length > 0 && (
              <div className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[12px] text-destructive">
                <span className="mt-0.5">⚠️</span>
                <span>
                  Il manque <strong>{missingFields.join(" et ")}</strong>. Vérifie et complète en
                  appuyant sur <em>Modifier</em>, ou reprends une photo plus nette.
                </span>
              </div>
            )}

            {store.expense.needsClarification ? (
              <ClarificationPrompt
                question={
                  store.expense.clarificationQuestion || "C'est pour l'Airbnb ou pour l'asso ?"
                }
                options={buildClarificationOptions(store.expense)}
                onPick={(opt) =>
                  store.updateExpense({
                    finalSide: opt.side,
                    topCategory: opt.topCategory,
                    comment: opt.comment,
                    needsClarification: false,
                    clarificationQuestion: "",
                    clarificationOptions: [],
                  })
                }
              />
            ) : store.expense.needsPlaceChoice ? (
              <PlacePrompt
                onPick={(place) => store.updateExpense({ place, needsPlaceChoice: false })}
              />
            ) : (
              <ChantierExpenseAssociation
                expense={store.expense}
                chantiers={chantiersData?.chantiers ?? []}
                loading={chantiersLoading}
                onChange={store.updateExpense}
              />
            )}
            {!store.expense.needsPlaceChoice && !store.expense.needsClarification && (
              <div className="rounded-2xl border border-border bg-card">
                {!noteOpen && !personalNote ? (
                  <button
                    type="button"
                    onClick={() => setNoteOpen(true)}
                    className="flex w-full items-center gap-2 px-3.5 py-2.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Ajouter une note perso
                  </button>
                ) : (
                  <div className="p-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <label
                        htmlFor="personal-note"
                        className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground"
                      >
                        Ma note
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setPersonalNote("");
                          setNoteOpen(false);
                        }}
                        className="text-[10px] font-semibold text-muted-foreground hover:text-foreground transition"
                      >
                        Retirer
                      </button>
                    </div>
                    <textarea
                      id="personal-note"
                      autoFocus={noteOpen && !personalNote}
                      value={personalNote}
                      onChange={(e) => setPersonalNote(e.target.value.slice(0, 300))}
                      onBlur={() => {
                        if (!personalNote.trim()) setNoteOpen(false);
                      }}
                      placeholder="Ex : pour la chambre du fond, à ranger côté Airbnb."
                      rows={2}
                      className="w-full resize-none rounded-xl bg-secondary/50 px-3 py-2 text-[12px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring/40"
                    />
                    <div className="mt-1 text-right text-[9px] font-medium text-muted-foreground tabular-nums">
                      {personalNote.length}/300
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-[1fr_2fr] gap-2">
              <button
                onClick={() => navigate({ to: "/modifier" })}
                className="tap lift flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3 text-[13px] font-semibold text-foreground hover-device:hover:bg-secondary hover-device:hover:border-foreground/30"
              >
                <Pencil className="h-3.5 w-3.5" /> Modifier
              </button>
              <button
                onClick={handleValidate}
                disabled={
                  store.expense.needsClarification ||
                  store.expense.needsPlaceChoice ||
                  (store.expense.topCategory === "Repas chantier" && !store.expense.chantierId)
                }
                className={`tap lift flex items-center justify-center gap-2 rounded-2xl py-3 text-[13px] font-semibold shadow-card disabled:opacity-40 disabled:cursor-not-allowed ${
                  store.expense.finalSide === "SCI"
                    ? "bg-brand-secondary text-brand-secondary-foreground"
                    : "bg-brand-accent text-brand-accent-foreground"
                }`}
              >
                Valider <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>
          </div>
        )}

        {phase === "exporting" && (
          <ExportingView side={store.expense?.finalSide ?? "SCI"} onCancel={reset} />
        )}

        {phase === "done" && store.expense && (
          <DoneView
            expense={store.expense}
            onAgain={reset}
            onHome={() => {
              returnToHome();
            }}
          />
        )}

        <AlertDialog open={analysisErrorOpen} onOpenChange={setAnalysisErrorOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <Camera className="h-6 w-6" />
              </div>
              <AlertDialogTitle className="text-center">
                {missingFields.length > 0
                  ? "Facture incomplète"
                  : techError
                    ? "Erreur technique"
                    : "Impossible de lire la facture"}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-center">
                {missingFields.length > 0
                  ? `Il manque ${missingFields.join(" et ")} sur cette facture. Reprends une photo bien nette (toute la facture visible, pas de flou, bon éclairage).`
                  : techError
                    ? `${techError} Ce n'est pas un souci avec ta photo, réessaie dans une minute. Si ça persiste, préviens l'admin.`
                    : "La photo ou le PDF est illisible. Vérifie que l'image n'est pas floue, trop sombre ou coupée, puis réessaie."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => setAnalysisErrorOpen(false)}>
                J'ai compris
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf,.pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </div>
    </main>
  );
}

function buildClarificationOptions(exp: Expense): ClarificationOption[] {
  if (exp.clarificationOptions && exp.clarificationOptions.length >= 2) {
    return exp.clarificationOptions;
  }
  const base = exp.detectedObject?.trim() || exp.purchaseDetail?.trim() || "Achats";
  const supplierPart = exp.supplier?.trim() ? ` chez ${exp.supplier.trim()}` : "";
  const sciCategory: TopCategory = "Activité locative — Revenus + dépenses";
  const assoCategory: TopCategory = "Vie quotidienne & Accueil — Courses, événements…";
  return [
    {
      label: "Pour l'Airbnb",
      side: "SCI",
      topCategory: sciCategory,
      comment: `${base}${supplierPart}. Destinés à équiper l'Airbnb (activité locative de la SCI).`,
    },
    {
      label: "Pour l'asso",
      side: "Association",
      topCategory: assoCategory,
      comment: `${base}${supplierPart}. Destinés à la vie quotidienne de l'Association.`,
    },
  ];
}

function ClarificationPrompt({
  question,
  options,
  onPick,
}: {
  question: string;
  options: ClarificationOption[];
  onPick: (opt: ClarificationOption) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 animate-rise">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-secondary/80 animate-soft-pulse" />
        <span className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
          Une précision
        </span>
      </div>
      <div className="text-[15px] font-semibold leading-snug text-foreground">{question}</div>
      <div className="mt-3 grid grid-cols-1 gap-1.5">
        {options.map((opt, i) => (
          <button
            key={i}
            onClick={() => onPick(opt)}
            className="tap lift w-full rounded-xl bg-secondary text-left px-3 py-2.5 text-[13px] font-medium flex items-center justify-between gap-3 hover:bg-secondary/80"
          >
            <span className="text-foreground leading-tight">{opt.label}</span>
            <span className="shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {opt.side === "Association" ? "Asso" : "SCI"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PlacePrompt({ onPick }: { onPick: (place: Place) => void }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 animate-rise">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-secondary/80 animate-soft-pulse" />
        <span className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
          Une précision
        </span>
      </div>
      <div className="text-[15px] font-semibold leading-snug text-foreground">Pour quel lieu&nbsp;?</div>
      <div className="mt-3 grid grid-cols-3 auto-rows-fr gap-1.5">
        {PLACES.map((p) => (
          <button
            key={p}
            onClick={() => onPick(p)}
            className="tap lift rounded-xl bg-secondary px-2.5 py-2.5 text-[12px] font-semibold text-foreground text-center leading-tight hover:bg-secondary/80"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChantierExpenseAssociation({
  expense,
  chantiers,
  loading,
  onChange,
}: {
  expense: Expense;
  chantiers: Chantier[];
  loading: boolean;
  onChange: (patch: Partial<Expense>) => void;
}) {
  const isChantierMeal = expense.topCategory === "Repas chantier";
  const [dismissed, setDismissed] = useState(false);
  const foodSignals = [
    expense.supplier,
    expense.detectedObject,
    expense.purchaseDetail,
    expense.comment,
  ]
    .join(" ")
    .toLocaleLowerCase("fr-FR");
  const looksLikeFood =
    isChantierMeal ||
    /repas|aliment|course|supermarch|restaurant|traiteur|boulanger|épicer|boisson|déjeuner|d[iî]ner|cuisine|marché|carrefour|leclerc|auchan|intermarché|monoprix|lidl|aldi|casino|picard|biocoop/.test(
      foodSignals,
    );
  const allAvailable = chantiers
    .filter((chantier) => !chantier.cancelledAt)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const today = new Date().toISOString().slice(0, 10);
  const previous = allAvailable.filter((chantier) => chantier.startDate < today).slice(-3);
  const next = allAvailable.find((chantier) => chantier.startDate >= today);
  const selected = allAvailable.find((chantier) => chantier.id === expense.chantierId);
  const available = [
    ...previous,
    ...(next && !previous.some((item) => item.id === next.id) ? [next] : []),
    ...(selected && !previous.some((item) => item.id === selected.id) && selected.id !== next?.id
      ? [selected]
      : []),
  ];

  if (!looksLikeFood || (dismissed && !isChantierMeal)) return null;

  function chooseChantierMeal() {
    onChange({
      topCategory: "Repas chantier",
      finalSide: "Association",
      reimbursementSide: "Association",
      chantierId: undefined,
      chantierStartDate: undefined,
      chantierLabel: undefined,
    });
  }

  function dismiss() {
    if (isChantierMeal) {
      onChange({
        topCategory: "Vie quotidienne & Accueil — Courses, événements…",
        chantierId: undefined,
        chantierStartDate: undefined,
        chantierLabel: undefined,
      });
    }
    setDismissed(true);
  }

  function selectChantier(id: string) {
    const selected = available.find((chantier) => chantier.id === id);
    onChange(
      selected
        ? {
            chantierId: selected.id,
            chantierStartDate: selected.startDate,
            chantierLabel: chantierDisplayName(selected.startDate, selected.endDate),
          }
        : { chantierId: undefined, chantierStartDate: undefined, chantierLabel: undefined },
    );
  }

  return (
    <section className="animate-rise rounded-2xl border border-border bg-card p-4">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 animate-soft-pulse rounded-full bg-brand-secondary/80" />
        <span className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
          Une précision
        </span>
      </div>
      <div className="text-[15px] font-semibold leading-snug text-foreground">
        Est-ce que la facture correspond à un repas chantier&nbsp;?
      </div>

      {!isChantierMeal && (
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={chooseChantierMeal}
            className="tap lift rounded-xl bg-secondary px-3 py-2.5 text-[12px] font-semibold text-foreground hover:bg-secondary/80"
          >
            Oui, chantier
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="tap lift rounded-xl bg-secondary px-3 py-2.5 text-[12px] font-semibold text-foreground hover:bg-secondary/80"
          >
            Non
          </button>
        </div>
      )}

      {isChantierMeal && (
        <div className="mt-3 border-t border-border pt-3">
          <label
            htmlFor="expense-chantier"
            className="mb-1.5 block text-[9px] font-medium uppercase tracking-widest text-muted-foreground"
          >
            Chantier concerné
          </label>
          <select
            id="expense-chantier"
            value={expense.chantierId ?? ""}
            onChange={(event) => selectChantier(event.target.value)}
            disabled={loading}
            className="h-10 w-full rounded-xl border border-border bg-secondary px-3 text-[11px] font-semibold text-foreground outline-none focus:ring-2 focus:ring-brand-accent/40 disabled:opacity-50"
          >
            <option value="">{loading ? "Chargement…" : "Choisir un chantier"}</option>
            {available.map((chantier) => (
              <option key={chantier.id} value={chantier.id}>
                {chantierDisplayName(chantier.startDate, chantier.endDate)} ·{" "}
                {formatShortDate(chantier.startDate)}
              </option>
            ))}
          </select>
          {!loading && !expense.chantierId && (
            <p className="mt-1.5 text-[9px] font-semibold text-muted-foreground">
              Choisis le chantier avant de valider.
            </p>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="mt-2 text-[9px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
          >
            Ce n’est pas un repas chantier
          </button>
        </div>
      )}
    </section>
  );
}

function formatShortDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function HeroHub({
  memberName,
  onPickInvoice,
  onPickReservation,
  onPickChantier,
}: {
  memberName: string | null;
  onPickInvoice: () => void;
  onPickReservation: () => void;
  onPickChantier: () => void;
}) {
  return (
    <section className="flex flex-1 flex-col animate-rise">
      <div className="py-2">
        <h1 className="hero-title">
          {memberName ? (
            <>
              Salut,
              <br />
              {memberName}&nbsp;!
            </>
          ) : (
            <>
              Fief
              <br />
              Champêtre
            </>
          )}
        </h1>
        <p className="text-muted-foreground font-medium mt-3 text-sm">
          Qu'est-ce que tu veux faire&nbsp;?
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <button
          onClick={onPickInvoice}
          className="tap lift group -mx-3 flex items-center justify-between rounded-2xl border border-brand-accent bg-brand-accent px-3 py-5 text-left text-brand-accent-foreground shadow-card"
        >
          <div>
            <div className="text-sm font-semibold opacity-80 uppercase tracking-wider">Facture</div>
            <div className="text-lg font-bold mt-1">Enregistrer une facture</div>
            <div className="text-xs opacity-70 mt-0.5">Photo ou fichier, l'IA fait le tri</div>
          </div>
          <FileText
            className="h-5 w-5 shrink-0 transition group-hover:translate-x-0.5"
            strokeWidth={2}
          />
        </button>

        <button
          onClick={onPickReservation}
          className="tap lift group -mx-3 flex items-center justify-between rounded-2xl border border-border bg-card px-3 py-5 text-left hover-device:hover:bg-secondary hover-device:hover:border-foreground/30"
        >
          <div>
            <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Séjour
            </div>
            <div className="text-lg font-bold mt-1">Réserver un séjour</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Voir l'agenda, bloquer tes dates
            </div>
          </div>
          <CalendarDays
            className="h-5 w-5 text-muted-foreground shrink-0 transition group-hover:translate-x-0.5 group-hover:text-foreground"
            strokeWidth={2}
          />
        </button>

        <button
          onClick={onPickChantier}
          className="tap lift group -mx-3 flex items-center justify-between rounded-2xl border border-border bg-card px-3 py-5 text-left hover-device:hover:bg-secondary hover-device:hover:border-foreground/30"
        >
          <div>
            <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Chantier
            </div>
            <div className="text-lg font-bold mt-1">S'inscrire à un chantier</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Choisir une date, qui vient, repas
            </div>
          </div>
          <HardHat
            className="h-5 w-5 text-muted-foreground shrink-0 transition group-hover:translate-x-0.5 group-hover:text-foreground"
            strokeWidth={2}
          />
        </button>
      </div>
    </section>
  );
}

function IdleView({
  dragOver,
  setDragOver,
  onCamera,
  onPick,
  onFile,
  memberName,
}: {
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onCamera: () => void;
  onPick: () => void;
  onFile: (f: File) => void;
  memberName: string;
}) {
  return (
    <section className="flex flex-1 flex-col animate-rise">
      <div className="py-2">
        <h1 className="hero-title">
          Salut {memberName || "toi"},<br />
          <span className="text-brand-accent">tu as une facture ?</span>
        </h1>
        <p className="text-muted-foreground font-medium mt-3 text-sm leading-relaxed">
          Photo ou PDF, on s'occupe du reste.
          <br />
          On te rembourse. Un jour.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <button
          onClick={onCamera}
          className="tap lift group -mx-3 flex items-center gap-3 rounded-2xl border border-brand-accent bg-brand-accent px-3 py-4 text-brand-accent-foreground shadow-card"
        >
          <Camera className="h-6 w-6 shrink-0" strokeWidth={2} />
          <div className="min-w-0 flex-1 text-left">
            <h2 className="text-base font-bold leading-tight">Prendre une photo</h2>
            <p className="text-[12px] opacity-70 mt-0.5">Ouvre la caméra</p>
          </div>
          <ArrowRight
            className="h-5 w-5 opacity-60 shrink-0 transition group-hover:translate-x-0.5 group-hover:opacity-100"
            strokeWidth={2.5}
          />
        </button>

        <button
          onClick={onPick}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
          className={`tap lift group -mx-3 flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-4 hover-device:hover:bg-secondary hover-device:hover:border-foreground/30 ${dragOver ? "bg-secondary border-foreground/30" : ""}`}
        >
          <ImageIcon
            className="h-6 w-6 text-muted-foreground shrink-0 transition group-hover:text-foreground"
            strokeWidth={2}
          />
          <div className="min-w-0 flex-1 text-left">
            <h2 className="text-base font-bold leading-tight">Choisir un fichier</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Photo ou PDF depuis ton téléphone
            </p>
          </div>
          <ArrowRight
            className="h-5 w-5 text-muted-foreground shrink-0 transition group-hover:translate-x-0.5 group-hover:text-foreground"
            strokeWidth={2.5}
          />
        </button>
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        On lit, on classe côté Asso ou SCI, et on enregistre.
      </p>
    </section>
  );
}

function AnalyzingView({ message, onCancel }: { message: string; onCancel: () => void }) {
  return (
    <section className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 animate-rise bg-background text-foreground text-center">
      <button
        onClick={onCancel}
        className="absolute left-6 top-6 flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground transition"
      >
        <ArrowLeft className="h-4 w-4" /> Retour
      </button>
      <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl bg-brand-accent text-brand-accent-foreground shadow-card">
        <FileText className="h-10 w-10" strokeWidth={1.75} />
        <span className="absolute inset-0 rounded-3xl bg-brand-accent/30 animate-soft-pulse -z-10 blur-xl" />
      </div>
      <div>
        <div className="label-micro mb-2">On regarde</div>
        <h2
          key={message}
          className="animate-rise text-4xl font-bold tracking-tight leading-none max-w-xs text-center"
        >
          {message}
        </h2>
      </div>
      <div className="flex gap-1.5">
        <span className="h-1.5 w-1.5 animate-soft-pulse rounded-full bg-brand-accent" />
        <span className="h-1.5 w-1.5 animate-soft-pulse rounded-full bg-brand-accent [animation-delay:200ms]" />
        <span className="h-1.5 w-1.5 animate-soft-pulse rounded-full bg-brand-accent [animation-delay:400ms]" />
      </div>
    </section>
  );
}

function ExportingView({ side, onCancel }: { side: Side; onCancel: () => void }) {
  const isAsso = side === "Association";
  const sideColor = isAsso
    ? "bg-brand-accent text-brand-accent-foreground"
    : "bg-brand-secondary text-brand-secondary-foreground";
  const sideLabel = isAsso ? "l'Association" : "la SCI";
  return (
    <section className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 animate-rise bg-background text-foreground text-center">
      <button
        onClick={onCancel}
        className="absolute left-6 top-6 flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground transition"
      >
        <ArrowLeft className="h-4 w-4" /> Retour
      </button>
      <div
        className={`relative flex h-28 w-28 items-center justify-center rounded-3xl shadow-card ${sideColor}`}
      >
        <Send className="h-14 w-14 animate-fly-bounce" strokeWidth={1.75} />
        <span className="absolute inset-0 rounded-3xl bg-current/20 animate-soft-pulse -z-10 blur-xl" />
      </div>
      <div>
        <div className="label-micro mb-2">Enregistrement</div>
        <h2 className="text-balance text-4xl font-bold tracking-tight leading-none max-w-xs text-center">
          Envoi à{" "}
          <span
            className={`inline-block whitespace-nowrap align-middle px-3 py-1 rounded-2xl text-[0.85em] ${sideColor}`}
          >
            {sideLabel}
          </span>
        </h2>
        <div className="mt-3 text-sm max-w-xs text-center text-muted-foreground">
          Ne quitte pas l'app, ça prend quelques secondes.
        </div>
      </div>
      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-border">
        <div
          className={`h-full w-1/3 rounded-full animate-loading-bar ${isAsso ? "bg-brand-accent" : "bg-brand-secondary"}`}
        />
      </div>
    </section>
  );
}

function DoneView({
  expense,
  onAgain,
  onHome,
}: {
  expense: Expense;
  onAgain: () => void;
  onHome: () => void;
}) {
  const member = useExpenseStore((s) => s.member);
  const sideLabel = expense.finalSide === "Association" ? "Asso" : "SCI";
  const category = expense.topCategory.split(" — ")[0];

  const memberName =
    expense.memberName ?? (member ? `${member.firstName} ${member.lastName}` : "…");

  const isPaidByMember = expense.paidBy === "Membre";
  const reimburserLabel = expense.finalSide === "Association" ? "l'Asso" : "la SCI";
  const paidByLabel = isPaidByMember ? "A rembourser par" : "Payé par";
  const paidByValue = isPaidByMember ? reimburserLabel : `Directement par ${sideLabel}`;

  const isAsso = expense.finalSide === "Association";
  const sideBg = isAsso ? "bg-brand-accent" : "bg-brand-secondary";
  const sideFg = isAsso ? "text-brand-accent-foreground" : "text-brand-secondary-foreground";

  return (
    <section className="flex flex-1 flex-col gap-6 animate-rise">
      <div className="flex items-center gap-4">
        <div
          className={`h-16 w-16 rounded-full flex items-center justify-center animate-check-pop ${sideBg}`}
        >
          <Check className={`h-8 w-8 ${sideFg}`} strokeWidth={3} />
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            C'est fait
          </div>
          <h2 className="text-4xl font-bold tracking-tight leading-none">Rangé.</h2>
        </div>
      </div>

      <div className="rounded-[2rem] bg-card border border-border shadow-card overflow-hidden">
        <div className={`flex items-center justify-between gap-4 px-6 py-4 ${sideBg}`}>
          <span className={`text-sm font-bold ${sideFg}`}>Dépense {sideLabel}</span>
          <span className={`text-2xl font-black tracking-tight ${sideFg}`}>
            {expense.amountTTC.toFixed(2).replace(".", ",")} €
          </span>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1">
              Fournisseur
            </div>
            <div className="text-2xl font-bold leading-tight tracking-tight break-words">
              {expense.supplier || "…"}
            </div>
          </div>
          <div className="grid gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Catégorie
              </span>
              <span className="text-right text-sm font-medium">{category}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Membre
              </span>
              <span className="text-right text-sm font-medium">{memberName}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                {paidByLabel}
              </span>
              <span className="text-right text-sm font-medium">{paidByValue}</span>
            </div>
            {expense.chantierId && (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  Chantier
                </span>
                <span className="text-right text-sm font-medium">
                  {expense.chantierLabel || expense.chantierStartDate}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onHome}
          className="tap lift rounded-2xl border border-border bg-card px-4 py-3.5 text-sm font-semibold text-foreground hover-device:hover:bg-secondary hover-device:hover:border-foreground/30 flex items-center justify-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.5} /> Retour
        </button>
        <button
          onClick={onAgain}
          className="tap lift group rounded-2xl bg-brand-accent px-4 py-3.5 text-sm font-semibold text-brand-accent-foreground flex items-center justify-center gap-2 shadow-card"
        >
          Autre facture{" "}
          <ArrowRight
            className="h-4 w-4 transition group-hover:translate-x-0.5"
            strokeWidth={2.5}
          />
        </button>
      </div>
    </section>
  );
}
