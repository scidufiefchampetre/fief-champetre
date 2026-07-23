# Direction artistique et UX

## Palette

- Fond : Cloud Dancer `#F0EEE9`.
- Fond sombre et texte : Darkest Hour `#242226`.
- Contraste secondaire : Blue Violet `#685BC7`.
- Accent : Exuberant Orange `#FF582D`.

Les variables de référence sont dans `src/styles.css`. Ne pas recopier les hex
dans les composants.

## Règle principale

Toutes les pages appliquent la règle 60–30–10 :

- 60 % de Cloud Dancer en thème clair ou Darkest Hour en thème sombre pour la base ;
- 30 % de Blue Violet pour structurer, sélectionner et créer le contraste ;
- 10 % maximum d’Exuberant Orange pour l’action ou l’information à regarder en premier.

Utiliser les utilitaires `brand-secondary` et `brand-accent`. Ne jamais
réintroduire de couleur par module, de jaune fluorescent ou de dégradé.

## Hiérarchie

- Titre de page : `.page-title`, fort et éditorial.
- Titre de carte : compact, lisible, sans surdimensionnement.
- Sous-information : gris et plus petite, jamais concurrente avec l’action.
- Détail secondaire : replié par défaut quand il allonge la page.
- Bouton principal : fond plein Exuberant Orange.
- Bouton secondaire : neutre, bordé ou texte ; pas une seconde couleur.
- Pastille pictogramme : fond Blue Violet plein et pictogramme blanc. Ne pas
  utiliser un pictogramme violet sur un fond violet pâle.

## Composants et interactions

- Utiliser `AppHeader` sur toutes les pages. Le nom « Fief Champêtre » retourne
  toujours à `/` et le retour garde la même forme.
- Boutons : verbe d’action en premier, cible tactile d’au moins 44 px, animations
  courtes via `.tap` et `.lift`.
- Personnes : même pastille compacte partout, troncature si nécessaire.
- Choix binaires : cercle avec point/couleur, identique dans tout le produit.
- Accordéons : toute la ligne est cliquable ; une seule grande section ouverte
  à la fois lorsqu’il y en a plusieurs.
- États : distinguer `Chargement…`, résultat vide explicite et erreur avec une
  possibilité de réessayer.
- Responsive : aucune frise ne doit imposer un défilement horizontal.

## Ton rédactionnel

Utilisateur : phrases courtes, directes et familières — « Tu viens quand ? ».
Admin : libellés précis et aides didactiques — « Indique ici… ».

## Contrôle avant livraison

Vérifier mobile étroit, mobile standard et desktop ; thème clair et sombre ;
hover, focus clavier, état désactivé, chargement, vide et erreur.
