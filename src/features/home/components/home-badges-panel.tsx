import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Award,
  Baby,
  Camera,
  ChefHat,
  ChevronRight,
  ClipboardCheck,
  Compass,
  Ghost,
  Hammer,
  HardHat,
  KeyRound,
  Lightbulb,
  NotebookPen,
  ReceiptText,
  Repeat2,
  ShoppingCart,
  Sparkles,
  Timer,
  Trophy,
  TriangleAlert,
  UserPlus,
  Users,
  Utensils,
  type LucideIcon,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  getMemberBadgeStats,
  type BadgeMetric,
  type MemberBadgeStats,
} from "@/lib/member-badges.functions";

interface HomeBadgesPanelProps {
  spreadsheetId: string | null;
  firstName: string;
  lastName: string;
}

interface BadgeLevel {
  threshold: number;
  label: string;
}

interface BadgeDefinition {
  metric: BadgeMetric;
  label: string;
  icon: LucideIcon;
  rule: string;
  levels: BadgeLevel[];
  copy: string[];
  valueLabel: (value: number) => string;
}

const countLabel =
  (singular: string, plural = `${singular}s`) =>
  (value: number) =>
    `${value} ${value > 1 ? plural : singular}`;

const BADGES: BadgeDefinition[] = [
  {
    metric: "personalStays",
    label: "Habitué des lieux",
    icon: KeyRound,
    rule: "Séjours personnels effectués hors chantier pendant la saison.",
    levels: [
      { threshold: 1, label: "Première clé" },
      { threshold: 3, label: "Les habitudes" },
      { threshold: 5, label: "Comme chez toi" },
      { threshold: 8, label: "Clés du Fief" },
    ],
    copy: [
      "Le Fief n’a pas encore mémorisé tes chaussons.",
      "Tu connais maintenant le chemin. C’est un début très officiel.",
      "Tu ne demandes plus où sont les clés.",
      "Ton mug commence à avoir une place attitrée.",
      "À ce rythme, on va finir par t’ajouter à l’inventaire.",
    ],
    valueLabel: countLabel("séjour"),
  },
  {
    metric: "groupGuests",
    label: "Maison pleine",
    icon: UserPlus,
    rule: "Proches, enfants ou invités inscrits avec toi.",
    levels: [
      { threshold: 1, label: "Premier renfort" },
      { threshold: 3, label: "Petite troupe" },
      { threshold: 6, label: "Le convoi" },
      { threshold: 10, label: "Maison pleine" },
    ],
    copy: [
      "Pour l’instant, ton groupe tient encore dans une petite voiture.",
      "Un renfort de plus : la maison gagne une voix et une paire de chaussures.",
      "Ça commence doucement à ressembler à un convoi.",
      "Le groupe WhatsApp mérite maintenant son propre service logistique.",
      "Tu ne réserves plus : tu organises un déplacement de population.",
    ],
    valueLabel: countLabel("personne invitée", "personnes invitées"),
  },
  {
    metric: "consecutiveChantiers",
    label: "Multi-récidiviste",
    icon: Repeat2,
    rule: "Plus longue série de chantiers consécutifs sans en manquer un.",
    levels: [
      { threshold: 2, label: "Bis repetita" },
      { threshold: 3, label: "Récidive" },
      { threshold: 4, label: "Série en cours" },
      { threshold: 5, label: "Multi-récidiviste" },
    ],
    copy: [
      "Une apparition ne fait pas encore une série.",
      "Deux d’affilée : ce n’était donc pas un accident.",
      "Trois chantiers de suite : on commence à compter sur toi.",
      "Quatre d’affilée. Ton agenda a clairement choisi son camp.",
      "Cinq de suite : on a arrêté de demander si tu venais.",
    ],
    valueLabel: countLabel("chantier consécutif", "chantiers consécutifs"),
  },
  {
    metric: "chantierDays",
    label: "Main forte",
    icon: HardHat,
    rule: "Jours de chantier comptabilisés entre juillet et juin.",
    levels: [
      { threshold: 1, label: "Première pierre" },
      { threshold: 5, label: "Main forte" },
      { threshold: 10, label: "Dix sur dix" },
      { threshold: 15, label: "Mur porteur" },
    ],
    copy: [
      "Tes gants attendent encore leur première vraie sortie.",
      "Première journée : les outils savent désormais qui tu es.",
      "Cinq jours. Tu n’es plus venu aider, tu fais partie du plan.",
      "Dix sur dix : objectif annuel officiellement plié.",
      "Quinze jours : le bâtiment te considère comme copropriétaire moral.",
    ],
    valueLabel: countLabel("jour"),
  },
  {
    metric: "missions",
    label: "Finisseur",
    icon: ClipboardCheck,
    rule: "Missions terminées auxquelles tu as participé.",
    levels: [
      { threshold: 1, label: "Ça, c’est fait" },
      { threshold: 5, label: "Finisseur" },
      { threshold: 10, label: "Liste raccourcie" },
      { threshold: 20, label: "Machine de chantier" },
    ],
    copy: [
      "La liste te regarde. Pour l’instant, elle gagne.",
      "Une ligne cochée : petit geste, grande satisfaction.",
      "Cinq missions terminées. La liste commence à te craindre.",
      "Dix missions : tu coches plus vite qu’on ne rédige.",
      "Vingt missions. Le tableau de tâches demande une pause.",
    ],
    valueLabel: countLabel("mission"),
  },
  {
    metric: "missionHours",
    label: "Coup de collier",
    icon: Timer,
    rule: "Temps réellement déclaré sur les missions terminées.",
    levels: [
      { threshold: 2, label: "Deux bonnes heures" },
      { threshold: 10, label: "Coup de collier" },
      { threshold: 25, label: "Grosse semaine" },
      { threshold: 50, label: "Heures supérieures" },
    ],
    copy: [
      "Le chronomètre n’a encore rien d’intéressant à raconter.",
      "Deux heures bien employées valent mieux qu’un grand discours.",
      "Dix heures : le coup de main est devenu un vrai coup de collier.",
      "Vingt-cinq heures. Même le mètre ruban est fatigué.",
      "Cinquante heures : tu peux tutoyer la caisse à outils.",
    ],
    valueLabel: (value) => `${value.toLocaleString("fr-FR")} h déclarée${value > 1 ? "s" : ""}`,
  },
  {
    metric: "teamMissions",
    label: "Chef d’équipe",
    icon: Users,
    rule: "Missions réalisées avec une équipe d’au moins trois personnes.",
    levels: [
      { threshold: 1, label: "Équipe formée" },
      { threshold: 3, label: "Chef d’équipe" },
      { threshold: 6, label: "Brigade rodée" },
      { threshold: 10, label: "Capitaine de chantier" },
    ],
    copy: [
      "Pour diriger une équipe, il faut d’abord réussir à réunir trois personnes.",
      "Une équipe, une mission, et presque aucune discussion sur la méthode.",
      "Trois missions collectives : tu sais distribuer les outils et les compliments.",
      "Six missions : la brigade commence à connaître tes regards.",
      "Dix missions en équipe. Même les pauses sont coordonnées.",
    ],
    valueLabel: countLabel("mission en équipe", "missions en équipe"),
  },
  {
    metric: "domains",
    label: "Légende locale",
    icon: Hammer,
    rule: "Domaines explorés : missions, cuisine, courses et garde d’enfants.",
    levels: [
      { threshold: 1, label: "Premier terrain" },
      { threshold: 2, label: "Double compétence" },
      { threshold: 3, label: "Couteau suisse" },
      { threshold: 4, label: "Légende locale" },
    ],
    copy: [
      "Pour l’instant, ton CV du Fief tient encore sur un Post-it.",
      "Un domaine maîtrisé. Tu as officiellement choisi ton terrain.",
      "Deux compétences : deux fois plus de chances qu’on t’appelle.",
      "Trois domaines. Le couteau suisse commence à faire pâle figure.",
      "Outils, cuisine, courses, enfants : même pas peur. Légende locale.",
    ],
    valueLabel: (value) => `${value} / 4 domaines`,
  },
  {
    metric: "casperMonths",
    label: "Casper",
    icon: Ghost,
    rule: "Mois écoulés depuis ton dernier chantier réalisé.",
    levels: [
      { threshold: 6, label: "Transparent" },
      { threshold: 9, label: "Très discret" },
      { threshold: 12, label: "Fantôme confirmé" },
      { threshold: 18, label: "Casper" },
    ],
    copy: [
      "On te voit encore assez souvent pour écarter l’hypothèse du fantôme.",
      "On a vérifié derrière les rideaux : toujours personne.",
      "Neuf mois. Quelqu’un a proposé de laisser une lumière allumée.",
      "Un an sans chantier : ton casque est officiellement un objet décoratif.",
      "Dix-huit mois. Même Casper trouve que tu exagères.",
    ],
    valueLabel: countLabel("mois sans chantier", "mois sans chantier"),
  },
  {
    metric: "cuisine",
    label: "Coup de feu",
    icon: ChefHat,
    rule: "Créneaux de cuisine pris pendant les chantiers.",
    levels: [
      { threshold: 1, label: "Mise en bouche" },
      { threshold: 3, label: "Coup de feu" },
      { threshold: 5, label: "Grande tablée" },
      { threshold: 10, label: "Toque du Fief" },
    ],
    copy: [
      "La cuisine est calme. Trop calme.",
      "Premier service : personne n’a demandé où était le numéro du traiteur.",
      "Trois créneaux. Tout le monde s’est resservi, ce qui vaut validation.",
      "Cinq créneaux : tu sais désormais cuisiner en comptant par dizaines.",
      "Dix services. La toque est virtuelle, la reconnaissance très réelle.",
    ],
    valueLabel: countLabel("créneau cuisine", "créneaux cuisine"),
  },
  {
    metric: "courses",
    label: "Grand cabas",
    icon: ShoppingCart,
    rule: "Créneaux de courses et ravitaillement pris pendant les chantiers.",
    levels: [
      { threshold: 1, label: "Premier panier" },
      { threshold: 3, label: "Ravitailleur" },
      { threshold: 5, label: "Grand cabas" },
      { threshold: 10, label: "Intendance générale" },
    ],
    copy: [
      "Le coffre est vide et la liste de courses se sent seule.",
      "Premier panier : tu sais désormais combien de café consomme un chantier.",
      "Trois ravitaillements. Tu connais le supermarché par son prénom.",
      "Cinq créneaux : le coffre de la voiture a demandé une médaille.",
      "Dix courses. Tu peux estimer vingt petits-déjeuners sans calculatrice.",
    ],
    valueLabel: countLabel("créneau courses", "créneaux courses"),
  },
  {
    metric: "garde",
    label: "Chef de récré",
    icon: Baby,
    rule: "Créneaux de garde d’enfants pris pendant les chantiers.",
    levels: [
      { threshold: 1, label: "Premier relais" },
      { threshold: 3, label: "Récré assurée" },
      { threshold: 5, label: "Chef de récré" },
      { threshold: 10, label: "Cour royale" },
    ],
    copy: [
      "La cour de récré attend encore son capitaine.",
      "Premier relais : les enfants t’ont adopté avant même de demander ton avis.",
      "Trois créneaux. Les parents t’aiment surtout pour pouvoir finir leur café.",
      "Cinq gardes : tu sais négocier avec des personnes de moins d’un mètre vingt.",
      "Dix créneaux. La cour de récré reconnaît officiellement ton autorité.",
    ],
    valueLabel: countLabel("créneau de garde", "créneaux de garde"),
  },
  {
    metric: "quartermaster",
    label: "Quartier-maître",
    icon: Compass,
    rule: "Polyvalence en cuisine, courses et garde ; le Master demande aussi 10 créneaux.",
    levels: [
      { threshold: 1, label: "Un rôle essayé" },
      { threshold: 2, label: "Double service" },
      { threshold: 3, label: "Quartier-maître" },
      { threshold: 4, label: "Intendance totale" },
    ],
    copy: [
      "L’intendance ne sait pas encore dans quelle case te ranger.",
      "Un rôle essayé : tu as mis un pied dans les coulisses.",
      "Deux rôles. On peut déjà t’appeler en cas de petit chaos.",
      "Cuisine, courses et garde : le week-end peut officiellement compter sur toi.",
      "Les trois rôles et dix créneaux. Tu ne gères plus l’intendance : tu es l’intendance.",
    ],
    valueLabel: (value) =>
      value === 4 ? "3 rôles · 10 créneaux ou plus" : `${Math.min(value, 3)} / 3 rôles`,
  },
  {
    metric: "photos",
    label: "L’Œil du Fief",
    icon: Camera,
    rule: "Photos ajoutées aux missions ou aux signalements.",
    levels: [
      { threshold: 1, label: "La preuve" },
      { threshold: 3, label: "L’Œil du Fief" },
      { threshold: 5, label: "Mémoire vive" },
      { threshold: 10, label: "Grand reporter" },
    ],
    copy: [
      "Sans photo, Internet continuera de penser que rien ne s’est passé.",
      "Une image : le chantier a désormais une preuve recevable.",
      "Trois photos. Tu commences à raconter une vraie histoire.",
      "Cinq résultats en image : la mémoire du Fief te remercie.",
      "Dix photos. Même les travaux ratés ont un excellent cadrage.",
    ],
    valueLabel: countLabel("photo"),
  },
  {
    metric: "issues",
    label: "La Vigie",
    icon: TriangleAlert,
    rule: "Casses ou dysfonctionnements signalés avec précision.",
    levels: [
      { threshold: 1, label: "Bien vu" },
      { threshold: 3, label: "La Vigie" },
      { threshold: 5, label: "Œil de lynx" },
      { threshold: 10, label: "Radar du Fief" },
    ],
    copy: [
      "Tout semble fonctionner. Ou alors personne n’a regardé derrière la gouttière.",
      "Bien vu : un problème signalé vaut mieux qu’une surprise sous la pluie.",
      "Trois alertes utiles. Tu regardes clairement là où les autres passent.",
      "Cinq signalements : rien de bancal ne t’échappe longtemps.",
      "Dix alertes. Le bâtiment se tient mieux quand tu es dans les parages.",
    ],
    valueLabel: countLabel("signalement"),
  },
  {
    metric: "plannedIdeas",
    label: "Bonne pioche",
    icon: Lightbulb,
    rule: "Propositions de tâches ensuite retenues dans un chantier.",
    levels: [
      { threshold: 1, label: "Bonne idée" },
      { threshold: 2, label: "Bonne pioche" },
      { threshold: 4, label: "Boîte à idées" },
      { threshold: 7, label: "Architecte officieux" },
    ],
    copy: [
      "Une bonne idée cherche encore ton nom.",
      "Une proposition retenue : tu n’as pas seulement parlé, quelqu’un l’a planifiée.",
      "Deux bonnes pioches. Le tableau commence à t’écouter.",
      "Quatre idées retenues : tu aides même avant d’avoir pris un outil.",
      "Sept idées planifiées. L’ordre du jour porte discrètement ton empreinte.",
    ],
    valueLabel: countLabel("idée retenue", "idées retenues"),
  },
  {
    metric: "documentedMissions",
    label: "Mémoire du Fief",
    icon: NotebookPen,
    rule: "Missions renseignées avec commentaire, durée et effectif réel.",
    levels: [
      { threshold: 1, label: "Trace écrite" },
      { threshold: 3, label: "Mémoire du Fief" },
      { threshold: 5, label: "Archives propres" },
      { threshold: 10, label: "Chroniqueur officiel" },
    ],
    copy: [
      "La mission est peut-être finie, mais elle n’a laissé aucune trace exploitable.",
      "Une mission bien documentée : le futur toi te remercie déjà.",
      "Trois comptes rendus propres. Les approximations reculent.",
      "Cinq missions documentées : même les chiffres savent ce qui s’est passé.",
      "Dix traces complètes. Les archives pourraient presque raconter le chantier seules.",
    ],
    valueLabel: countLabel("mission documentée", "missions documentées"),
  },
  {
    metric: "expenses",
    label: "Roi du ticket",
    icon: ReceiptText,
    rule: "Factures complètes avec fournisseur, date, montant et justificatif.",
    levels: [
      { threshold: 1, label: "Ticket sauvé" },
      { threshold: 5, label: "Comptes carrés" },
      { threshold: 10, label: "Roi du ticket" },
      { threshold: 20, label: "Grand argentier" },
    ],
    copy: [
      "La compta attend encore le ticket qui changera tout.",
      "Une facture complète. Même la compta a esquissé un sourire.",
      "Cinq justificatifs propres : aucun papier ne traîne au fond d’une poche.",
      "Dix factures. Tu maîtrises l’art rare du ticket encore lisible.",
      "Vingt factures complètes : la comptabilité te doit une standing ovation silencieuse.",
    ],
    valueLabel: countLabel("facture"),
  },
  {
    metric: "mealExpenses",
    label: "Grande tablée",
    icon: Utensils,
    rule: "Factures de repas correctement associées à une fiche chantier.",
    levels: [
      { threshold: 1, label: "Premier couvert" },
      { threshold: 3, label: "Table dressée" },
      { threshold: 5, label: "Grande tablée" },
      { threshold: 10, label: "Banquet du Fief" },
    ],
    copy: [
      "La tablée a mangé, mais le tableur n’en sait encore rien.",
      "Premier repas correctement rattaché : chaque tomate a désormais une destination.",
      "Trois factures repas. Le budget commence à ressembler à la réalité.",
      "Cinq repas bien classés : la tablée et la compta sont enfin réconciliées.",
      "Dix factures associées. Même les lentilles ont une traçabilité.",
    ],
    valueLabel: countLabel("facture repas", "factures repas"),
  },
  {
    metric: "grandSlam",
    label: "Grand Chelem",
    icon: Trophy,
    rule: "Nombre de familles de badges débloquées pendant la même saison.",
    levels: [
      { threshold: 10, label: "Dix familles" },
      { threshold: 15, label: "Grand Chelem" },
      { threshold: 18, label: "Presque partout" },
      { threshold: 19, label: "Saison parfaite" },
    ],
    copy: [
      "Le Grand Chelem ne se gagne pas en restant dans une seule case.",
      "Dix familles débloquées : ta saison a déjà plusieurs chapitres.",
      "Quinze badges actifs. Grand Chelem, sans besoin de classement.",
      "Dix-huit familles : il ne reste presque plus d’endroit où te cacher.",
      "Dix-neuf sur dix-neuf. La saison parfaite existe donc vraiment.",
    ],
    valueLabel: (value) => `${value} / 19 familles`,
  },
];

const LEVEL_STYLES = [
  "border-brand-secondary/25 bg-brand-secondary/15 text-brand-secondary",
  "border-brand-secondary/35 bg-brand-secondary/30 text-foreground",
  "border-brand-secondary/55 bg-brand-secondary/55 text-foreground",
  "border-brand-secondary bg-brand-secondary text-brand-secondary-foreground",
];

function levelIndex(badge: BadgeDefinition, value: number) {
  return badge.levels.reduce(
    (current, level, index) => (value >= level.threshold ? index : current),
    -1,
  );
}

function badgeStyle(level: number) {
  return level < 0
    ? "border-border bg-secondary text-muted-foreground"
    : LEVEL_STYLES[Math.min(level, LEVEL_STYLES.length - 1)];
}

export function HomeBadgesPanel({ spreadsheetId, firstName, lastName }: HomeBadgesPanelProps) {
  const [open, setOpen] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<BadgeMetric>("personalStays");
  const getStats = useServerFn(getMemberBadgeStats);
  const query = useQuery({
    queryKey: ["member-badge-stats", spreadsheetId, firstName, lastName],
    queryFn: () => getStats({ data: { spreadsheetId, firstName, lastName } }),
    enabled: Boolean(firstName),
    staleTime: 5 * 60_000,
  });

  const values = query.data?.season;
  const earnedCount = useMemo(
    () =>
      values ? BADGES.filter((badge) => levelIndex(badge, values[badge.metric]) >= 0).length : 0,
    [values],
  );
  const selectedBadge = BADGES.find((badge) => badge.metric === selectedMetric) ?? BADGES[0];
  const selectedValue = values?.[selectedBadge.metric] ?? 0;
  const selectedLevel = levelIndex(selectedBadge, selectedValue);
  const selectedLevelLabel =
    selectedLevel >= 0 ? selectedBadge.levels[selectedLevel]?.label : "À découvrir";
  const nextLevel = selectedBadge.levels.find((level) => selectedValue < level.threshold);
  const seasonLabel = query.data
    ? `${query.data.seasonStartYear}–${query.data.seasonStartYear + 1}`
    : "Saison en cours";

  function showBadge(metric: BadgeMetric) {
    setSelectedMetric(metric);
    setOpen(true);
  }

  return (
    <section className="mt-3 overflow-hidden rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-3 px-3.5 pb-2 pt-3 text-left transition hover-device:hover:bg-secondary/40"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-secondary text-brand-secondary-foreground">
          <Award className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-black">Tes badges</span>
          <span className="mt-0.5 block truncate text-[9px] text-muted-foreground">
            {query.isLoading
              ? "Calcul de ta saison…"
              : query.isError
                ? "Voir les règles"
                : `${seasonLabel} · ${earnedCount} / 20 débloqués`}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </button>

      <div className="scrollbar-none flex gap-2 overflow-x-auto px-3.5 pb-3 pt-1">
        {BADGES.map((badge) => {
          const value = values?.[badge.metric] ?? 0;
          const level = levelIndex(badge, value);
          const Icon = badge.icon;
          return (
            <button
              key={badge.metric}
              type="button"
              onClick={() => showBadge(badge.metric)}
              aria-label={`${badge.label} · ${level < 0 ? "non obtenu" : badge.levels[level]?.label}`}
              className="group w-14 shrink-0 text-center"
            >
              <span
                className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full border transition group-active:scale-95 ${badgeStyle(level)}`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="mt-1 block truncate text-[7px] font-bold text-muted-foreground">
                {badge.label}
              </span>
            </button>
          );
        })}
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[90dvh] overflow-y-auto rounded-t-[2rem] border-border bg-background px-4 pb-8 pt-5 sm:left-1/2 sm:max-w-xl sm:-translate-x-1/2"
        >
          <SheetHeader className="pr-8 text-left">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-secondary text-brand-secondary-foreground">
                <Award className="h-5 w-5" />
              </span>
              <div>
                <SheetTitle className="text-xl font-black">Tes badges</SheetTitle>
                <SheetDescription>
                  Saison {seasonLabel} · juillet à juin · {earnedCount}/20
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          {query.isLoading ? (
            <div className="mt-6 rounded-2xl bg-secondary/50 p-5 text-sm text-muted-foreground">
              On rassemble tes contributions…
            </div>
          ) : query.isError || !query.data ? (
            <div className="mt-6 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
              Impossible de calculer tes badges pour le moment.
            </div>
          ) : (
            <div className="mt-5">
              <div className="rounded-2xl border border-brand-secondary/25 bg-brand-secondary/5 p-4">
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border ${badgeStyle(selectedLevel)}`}
                  >
                    <selectedBadge.icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-[15px] font-black">{selectedBadge.label}</h3>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-brand-secondary">
                        {selectedLevelLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-snug">
                      « {selectedBadge.copy[Math.max(0, selectedLevel + 1)]} »
                    </p>
                    <p className="mt-2 text-[9px] leading-relaxed text-muted-foreground">
                      {selectedBadge.rule}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-3 text-[9px] font-bold">
                      <span>{selectedBadge.valueLabel(selectedValue)}</span>
                      <span className="text-muted-foreground">
                        {nextLevel
                          ? `Prochain niveau : ${nextLevel.threshold}`
                          : "Niveau maximum atteint"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-secondary">
                    Les 20 badges
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    Appuie sur un badge pour voir sa règle.
                  </div>
                </div>
                <Sparkles className="h-4 w-4 text-brand-secondary" />
              </div>

              <div className="mt-3 grid grid-cols-4 gap-x-2 gap-y-4">
                {BADGES.map((badge) => {
                  const value = query.data!.season[badge.metric];
                  const level = levelIndex(badge, value);
                  const selected = badge.metric === selectedMetric;
                  const Icon = badge.icon;
                  return (
                    <button
                      key={badge.metric}
                      type="button"
                      onClick={() => setSelectedMetric(badge.metric)}
                      aria-pressed={selected}
                      className="min-w-0 text-center"
                    >
                      <span
                        className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 transition active:scale-95 ${badgeStyle(level)} ${selected ? "ring-2 ring-brand-secondary ring-offset-2 ring-offset-background" : ""}`}
                      >
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span
                        className={`mt-1.5 block text-[8px] font-black leading-tight ${level < 0 ? "text-muted-foreground" : "text-foreground"}`}
                      >
                        {badge.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
