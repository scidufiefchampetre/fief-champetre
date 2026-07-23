/**
 * Dictionnaire d'icônes — source de vérité unique.
 * Importer TOUJOURS depuis ici, jamais directement depuis lucide-react.
 *
 * Règle de taille :
 *   h-3 w-3  → micro-labels (9px uppercase)
 *   h-4 w-4  → boutons & texte inline  ← DÉFAUT dans les boutons
 *   h-5 w-5  → cartes & sections
 *   h-6 w-6  → pastilles en-tête
 *   h-8 w-8  → avatars
 *
 * Le compteur/nombre va toujours À CÔTÉ de l'icône, jamais à la place.
 * La taille de l'icône ne change jamais selon le contenu affiché.
 */

// ── Personnes ──────────────────────────────────────────────────────────────
export { User } from "lucide-react"; // 1 personne nommée / identifiée
export { Users } from "lucide-react"; // groupe / effectif / comptage
export { UserPlus } from "lucide-react"; // ajouter une personne
export { UserCheck } from "lucide-react"; // inscrit·e confirmé·e

// ── Dates & Horaires ───────────────────────────────────────────────────────
export { Calendar } from "lucide-react"; // date (générique)
export { CalendarDays } from "lucide-react"; // période multi-jours
export { Clock } from "lucide-react"; // heure / durée
export { Sunrise } from "lucide-react"; // matin
export { Sun } from "lucide-react"; // après-midi / journée
export { Sunset } from "lucide-react"; // soir
export { Moon } from "lucide-react"; // nuit

// ── Tâches & Chantier ──────────────────────────────────────────────────────
export { ClipboardCheck } from "lucide-react"; // tâche / mission à cocher
export { ClipboardList } from "lucide-react"; // liste de tâches (vue admin)
export { Check } from "lucide-react"; // validé / coché
export { Wrench } from "lucide-react"; // chantier / outil
export { Hammer } from "lucide-react"; // travaux / construction

// ── Actions ────────────────────────────────────────────────────────────────
export { Plus } from "lucide-react"; // ajouter
export { Pencil } from "lucide-react"; // modifier
export { Trash2 } from "lucide-react"; // supprimer (destructif)
export { X } from "lucide-react"; // fermer / retirer
export { Send } from "lucide-react"; // envoyer / signaler
export { RefreshCw } from "lucide-react"; // rafraîchir

// ── Navigation ─────────────────────────────────────────────────────────────
export { ChevronLeft } from "lucide-react"; // retour
export { ChevronRight } from "lucide-react"; // suivant / développer
export { ChevronDown } from "lucide-react"; // déplier
export { ArrowLeft } from "lucide-react"; // retour page (header)
export { ArrowRight } from "lucide-react"; // aller vers
export { ExternalLink } from "lucide-react"; // lien externe

// ── Média & Fichiers ───────────────────────────────────────────────────────
export { Camera } from "lucide-react"; // photo avant / après
export { Image } from "lucide-react"; // image existante
export { FileText } from "lucide-react"; // document / facture

// ── Finances ───────────────────────────────────────────────────────────────
export { Euro } from "lucide-react"; // montant / dépense
export { Wallet } from "lucide-react"; // budget / paiement
export { ReceiptText } from "lucide-react"; // facture détaillée

// ── Repas & Intendance ─────────────────────────────────────────────────────
export { ChefHat } from "lucide-react"; // cuisinier / repas
export { Utensils } from "lucide-react"; // repas / table
export { ShoppingCart } from "lucide-react"; // courses / à acheter

// ── Statuts & Alertes ──────────────────────────────────────────────────────
export { AlertTriangle } from "lucide-react"; // alerte / anomalie
export { Info } from "lucide-react"; // info contextuelle
export { HelpCircle } from "lucide-react"; // aide / optionnel
export { Search } from "lucide-react"; // recherche

// ── Autres UI ──────────────────────────────────────────────────────────────
export { Baby } from "lucide-react"; // enfant
export { HardHat } from "lucide-react"; // participant chantier
export { LogIn } from "lucide-react"; // entrée
export { LogOut } from "lucide-react"; // sortie / déconnexion
export { Laptop } from "lucide-react"; // télétravail / en ligne
export { Lock } from "lucide-react"; // verrouillé / admin
export { Menu } from "lucide-react"; // menu burger
export { Building2 } from "lucide-react"; // structure / SCI
export { Heart } from "lucide-react"; // favori
