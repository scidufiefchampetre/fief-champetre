import { CalendarDays, ClipboardCheck, FileText, HardHat, Megaphone, Wallet } from "lucide-react";

export const MODULE_COLOR_STYLES = {
  sun: {
    bg: "bg-brand-accent/15",
    text: "text-brand-accent",
    border: "hover-device:hover:border-brand-accent/35",
  },
  asso: {
    bg: "bg-brand-secondary/15",
    text: "text-brand-secondary",
    border: "hover-device:hover:border-brand-secondary/35",
  },
  sci: {
    bg: "bg-brand-secondary/15",
    text: "text-brand-secondary",
    border: "hover-device:hover:border-brand-secondary/35",
  },
} as const;

export interface AppModuleLink {
  to: string;
  icon: typeof FileText;
  label: string;
  description: string;
  homeAction?: "invoice";
}

export interface AppModule {
  key: string;
  label: string;
  icon: typeof FileText;
  color: keyof typeof MODULE_COLOR_STYLES;
  links: AppModuleLink[];
}

export const APP_MODULES: AppModule[] = [
  {
    key: "facture",
    label: "Gérer mes dépenses",
    icon: FileText,
    color: "sun",
    links: [
      {
        to: "/",
        icon: FileText,
        label: "Enregistrer une facture",
        description: "Photo ou fichier, l’IA fait le tri",
        homeAction: "invoice",
      },
      {
        to: "/depenses",
        icon: Wallet,
        label: "Suivre mes dépenses",
        description: "Voir les avances, remboursements et attentes",
      },
    ],
  },
  {
    key: "sejour",
    label: "Gérer mes réservations",
    icon: CalendarDays,
    color: "sci",
    links: [
      {
        to: "/agenda",
        icon: CalendarDays,
        label: "Réserver un séjour",
        description: "Voir l’agenda, bloquer tes dates",
      },
      {
        to: "/mes-reservations",
        icon: Wallet,
        label: "Gérer mes réservations",
        description: "Voir ce que tu dois et ce qui est réglé",
      },
    ],
  },
  {
    key: "chantier",
    label: "Gérer mes chantiers",
    icon: HardHat,
    color: "asso",
    links: [
      {
        to: "/chantiers",
        icon: HardHat,
        label: "S’inscrire à un chantier",
        description: "Choisir une date, qui vient et les repas",
      },
      {
        to: "/mes-chantiers",
        icon: ClipboardCheck,
        label: "Gérer mes chantiers",
        description: "Voir tes inscriptions, ton groupe et ton intendance",
      },
      {
        to: "/signaler",
        icon: Megaphone,
        label: "Signaler ou proposer une tâche",
        description: "Dysfonctionnement, casse ou nouvelle idée",
      },
    ],
  },
];
