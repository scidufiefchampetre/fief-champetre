# Charte graphique — Fief Champêtre

Référence unique pour le style de l'app. Les tokens vivent dans `src/styles.css`,
les composants partagés dans `src/components/ui/`. Ce fichier remplace
`docs/DESIGN_SYSTEM.md` et la section « Design system » de `CLAUDE.md`.

Règle d'or : **on n'écrit jamais une valeur en dur** (hex, `text-[13px]`,
`rounded-[1.75rem]`). On prend un token ou une classe ci-dessous. Si rien ne
convient, on ajoute un token ici et dans `styles.css`, pas dans le composant.

---

## 1. Couleurs

Palette Pantone, répartition **60 – 30 – 10**.

| Rôle | Token Tailwind | Clair | Sombre | Usage |
|---|---|---|---|---|
| Base (60 %) | `bg-background` | Cloud Dancer `#F0EEE9` | Darkest Hour `#242226` | fond de page |
| Surface | `bg-card` | `#F8F7F4` | `#2C2A2F` | cartes, champs, sheets |
| Surface douce | `bg-secondary` / `bg-muted` | gris chaud | gris violet | chips inactifs, états vides, squelettes |
| Texte | `text-foreground` | Darkest Hour | Cloud Dancer | |
| Texte secondaire | `text-muted-foreground` | | | méta, aides, labels |
| Contraste (30 %) | `bg-brand-secondary` | Blue Violet `#685BC7` | idem | **action principale**, sélection active, pastilles icône |
| Accent (10 %) | `bg-brand-accent` | Exuberant Orange `#FF582D` | idem | voir règles ci-dessous |
| Succès | `bg-success` / `text-success-foreground` | vert pâle | vert sombre | « payé », « terminé » |
| Erreur | `bg-destructive` / `text-destructive` | rouge système | | erreurs et actions destructives uniquement |

### Règles d'usage

- **Violet = agir.** Tout bouton qui valide, envoie, réserve, s'inscrit est violet
  plein. Un état « sélectionné » (chip, onglet, case cochée) est violet plein.
- **Orange = regarder ici en premier.** Au plus **un** élément orange dominant
  par écran : le point d'entrée vedette (« Enregistrer une facture » sur
  l'accueil), une alerte (« Prévision à date »), un compteur « à faire ».
  L'orange n'est jamais la couleur d'un bouton de validation.
- **Exception sémantique SCI / Asso.** Dans les dépenses, SCI = violet, Asso =
  orange. C'est une identité, pas une hiérarchie : on la garde telle quelle.
- **Pas d'autres couleurs.** Aucune classe de palette Tailwind brute
  (`text-amber-500`, `bg-green-100`…), aucun dégradé, aucune couleur par module.
- Opacités tolérées sur les tokens : `/10` `/15` pour un fond teinté, `/35` pour
  une bordure au survol, `/70` pour un texte sur fond plein.

### Pastilles icône

Une icône isolée dans un rond/carré est **toujours** violet plein + tracé blanc :
`bg-brand-secondary text-brand-secondary-foreground`. Une pastille teintée
orange (`bg-brand-accent/15 text-brand-accent`) est réservée aux alertes.
Une pastille neutre (`bg-secondary text-muted-foreground`) marque un élément
passé ou inactif (chantier terminé).

---

## 2. Typographie

Police unique : **Inter** (400, 500, 600, 700, 900).

### Échelle

Six tailles seulement. Plancher de lisibilité : **10 px**, réservé aux
overlines et micro-badges ; tout texte qu'on lit fait au moins 12 px.

| Classe | Taille | Usage |
|---|---|---|
| `text-2xs` | 10 px | overline, micro-badge, compteur |
| `text-xs` | 12 px | méta, aide sous un champ, libellé de chip |
| `text-sm` | 14 px | texte courant, boutons, intro de page |
| `text-base` | 16 px | titre de carte, champs de formulaire |
| `text-lg` | 18 px | titre de sheet, chiffre clé secondaire |
| `text-xl` / `text-2xl` | 20 / 24 px | titre d'étape, chiffre clé |

Au-delà : `.page-title` (36 px) et `.hero-title` (44–60 px).

### Classes sémantiques (`styles.css`)

| Classe | Rendu | Où |
|---|---|---|
| `.hero-title` | 44–60 px, 900 | accueil et écran d'identification uniquement |
| `.page-title` | 36 px, 900 | titre H1 de toutes les autres pages |
| `.page-lead` | 14 px, gris, `mt-2` | phrase d'intro sous le H1 |
| `.section-title` | 18 px, 700 | titre de section H2 |
| `.item-title` | 15 px, 600 | titre dans une carte de liste |
| `.eyebrow` (alias `.label-micro`, `<SectionLabel>`) | 10 px, 700, majuscules, interlettrage 0.12em | sur-titre de section ou de carte |
| `.field-label` | 14 px, 600 | libellé de champ de formulaire |
| `.meta-text` | 12 px, gris | info secondaire |

### Titres de page

- Affirmation → point final : « Chantiers. », « Mon profil. ».
- Question → espace insécable + « ? » : « Qui es-tu ? », « SCI ou Asso ? ».
- Pas d'icône au-dessus du H1.

### Graisses

`font-medium` (500) méta · `font-semibold` (600) boutons, labels, titres de
carte · `font-bold` (700) titres de section, chiffres · `font-black` (900)
titres de page et grands chiffres uniquement.

---

## 3. Forme et espace

### Arrondis

| Classe | Rayon | Usage |
|---|---|---|
| `rounded-md` | 18 px* | petits contrôles < 32 px (case à cocher, squelette) |
| `rounded-xl` | 24 px* | bloc intérieur d'une carte, pastille icône carrée |
| `rounded-2xl` | 28 px* | **cartes, boutons, champs** (défaut) |
| `rounded-3xl` | 32 px* | modale, sheet, grande illustration |
| `rounded-full` | — | chips, badges, avatars, pastilles rondes |

\* Valeurs dérivées de `--radius: 1.25rem`. Aucun rayon arbitraire.

### Ombres

`shadow-card` au repos, `shadow-card-hover` au survol (via `.lift`),
`shadow-float` pour une modale. Rien d'autre.

### Mise en page

- Toute page est enveloppée par `<PageShell>` : colonne `max-w-xl`, gouttière
  20 px, `py-5` mobile / `py-10` desktop.
- `<AppHeader>` en tête de chaque page, puis H1 `.page-title` + `.page-lead`.
- Espacements verticaux : `gap-3` entre cartes d'une liste, `mt-6` à `mt-8`
  entre sections.
- Mobile d'abord, aucun défilement horizontal.

---

## 4. Composants

### Boutons

| Variante | Classes | Usage |
|---|---|---|
| Principal | `<Button>` (défaut) ou `bg-brand-secondary text-brand-secondary-foreground rounded-2xl` | valider, envoyer, réserver |
| Secondaire | `<Button variant="outline">` | retour, filtrer, alternative |
| Discret | `<Button variant="ghost">` | annuler, fermer |
| Destructif | `<Button variant="destructive">` | supprimer, toujours après confirmation |

- Cible tactile ≥ 44 px (`min-h-11`), libellé `text-sm font-semibold`,
  icône 16 px.
- Verbe d'action en premier : « Envoyer le rapport », pas « Rapport ».
- Interactions : `.tap` (enfoncement) + `.lift` (survol) sur les boutons pleins.

**CTA pleine largeur en bas de page** (formulaires, fiches) :

```tsx
<div className="sticky bottom-0 bg-background/90 pb-4 pt-3 backdrop-blur-md">
  <button className="tap lift flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-secondary px-4 py-3.5 text-sm font-semibold text-brand-secondary-foreground shadow-card disabled:opacity-50">
    Envoyer le rapport
  </button>
</div>
```

### Cartes de liste — `<ListCard>`

Rangée unique : pastille icône 40 px violette, `.item-title`, une ou deux
lignes de méta en `text-xs`, chevron à droite. Toute la carte est cliquable.

### Overline — `<SectionLabel>`

Sur-titre de section. `color="brand"` pour une section active (« À venir »).

### Badges et chips

`rounded-full px-2.5 py-1 text-2xs font-bold`. Neutre : `bg-secondary
text-muted-foreground`. Actif : violet plein. Alerte : `bg-brand-accent/15
text-brand-accent`. Succès : `bg-success text-success-foreground`.

### Formulaires

- Champ : `.input-field` (48 px, `rounded-2xl`, 16 px pour éviter le zoom iOS).
- Libellé : `.field-label` au-dessus, astérisque `text-destructive` si requis.
- Aide : `text-xs text-muted-foreground mt-1.5`.
- Choix multiples : chips ; choix exclusifs : cartes radio avec cercle.
- Nombres : `<NumberStepper>` ; heures : `<TimePicker>` ; jamais de clavier
  numérique libre.

### États

| État | Rendu |
|---|---|
| Chargement | squelettes `bg-secondary rounded-xl animate-pulse`, ou overline « Chargement… » |
| Vide | `<EmptyState>` : `rounded-2xl bg-secondary/50 p-4 text-sm text-muted-foreground`, phrase directe + lien d'action si utile |
| Erreur | texte `text-destructive` + bouton « Réessayer » |

---

## 5. Ton

Utilisateur : tutoiement, phrases courtes — « Tu viens quand ? ».
Admin : libellés précis, aides didactiques — « Indique ici… ».

---

## 6. Contrôle avant livraison

Mobile 360 px et 375 px, desktop · clair et sombre · survol, focus clavier,
désactivé · chargement, vide, erreur · aucune valeur arbitraire ajoutée
(`grep -rE "text-\[[0-9]|#[0-9a-f]{6}" src --include=*.tsx`).
