# CTS Dashboard — Plan de validation

Ce document définit la validation minimale avant diffusion d’une nouvelle version de CTS Dashboard.

## 1. Matrice iPhone / iOS

Valider au minimum les profils suivants avec une version publique d’iOS encore maintenue :

| Profil | Modèles représentatifs | Objectif |
|---|---|---|
| Ancien écran pris en charge | iPhone XS / XR | Compatibilité branche iOS 18 |
| Écran étroit | iPhone SE 2/3, iPhone 12 mini / 13 mini | Détecter les débordements et troncatures |
| Écran standard | iPhone 11/12/13/14/15/16/17 standard | Référence de rendu |
| Grand écran | modèles Plus / Pro Max / Air | Vérifier proportions et espacements |

Les versions bêta d’iOS sont testables mais ne constituent pas une cible de validation obligatoire.

## 2. Installation vierge

Préconditions : Scriptable à jour, iCloud Drive activé, aucun dossier CTS Dashboard existant.

1. Importer `CTS Installer.scriptable` via la feuille de partage iOS.
2. Exécuter CTS Installer. Vérifier qu'il annonce bien sa version et n'exige aucune étape de migration préalable.
3. Installer la version proposée.
4. Vérifier la création de l’arborescence CTS Dashboard.
5. Vérifier la présence des 17 scripts et 5 ressources distribués.
6. Vérifier que CTS Installer termine sur `22/22 fichiers valides` et `0 erreur`.
7. Ajouter un widget Scriptable grand format et sélectionner `CTS Dashboard`.
8. Régler l’interaction sur `Run Script`.

Résultat attendu : installation sans intervention manuelle dans les dossiers techniques et widget fonctionnel.

## 3. Mise à jour et réparation

1. Relancer CTS Installer sur une installation valide : aucun fichier ne doit être remplacé inutilement.
2. Modifier ou supprimer volontairement un script de test, puis lancer `Vérifier les fichiers` : le fichier doit être réparé.
3. Corrompre une copie locale de `lines.json`, puis vérifier : la ressource doit être restaurée.
4. Refaire une vérification : `22/22 fichiers valides`, `0 erreur`.
5. Contrôler que `Services`, `Data`, `Cache`, les PDF et les archives sont conservés.

## 4. Import PDF par navigateur

Tester au moins une carte agent valide avec chacun des tutoriels :

- Safari : enregistrer dans Fichiers puis `iCloud Drive/Scriptable/CTS Dashboard/Services`.
- Google : `Enregistrer dans Fichiers` puis dossier `Services`.
- Brave : téléchargement, ouverture dans Fichiers puis copie vers `Services`.

Pour chaque navigateur :

1. Un seul PDF.
2. Plusieurs PDF déposés à l’avance.
3. PDF encore marqué comme non téléchargé localement par iCloud.
4. Relance du Dashboard après dépôt.

Résultat attendu : détection, extraction, import, renommage/indexation et sélection du bon service sans manipulation technique supplémentaire.

## 5. États métier

Valider avec le simulateur ou des services réels :

| Cas | Résultat attendu |
|---|---|
| Avant prise de service | `Avant le service`, prochaine tranche correcte |
| Tranche en cours | `En service`, tranche active correcte |
| Pause | `Pause`, prochaine tranche correcte |
| Coupure | `Coupure`, prochaine tranche correcte |
| Fin de service, carte encore présente | `Service terminé`, programme du jour affiché |
| Fin de service, dossier Services vide | message d’information invitant à déposer la carte suivante, sans allure d’erreur |
| Service de demain | service suivant sélectionné au moment prévu |
| Horaires après minuit | continuité correcte jusqu’à 47:59 |
| Aucun PDF | message explicite sans crash |
| PDF invalide | erreur contrôlée et diagnostic exploitable |

Vérifier également les règles d’archivage : +1 h après la fin du service puis rétention de 7 jours avant suppression.

## 6. Rendu du widget

Tester des services comportant 1, 2 et 3 tranches. Trois tranches est le maximum d’un service CTS : 1 et 2 utilisent la densité confortable, 3 la densité standard. La densité compacte n’est atteinte qu’au-delà, en filet de sécurité contre un PDF mal formé, et n’a donc pas à être testée sur un service réel.

Contrôler sur chaque profil d’écran :

- aucun horaire tronqué ou remplacé par `…` ;
- `Début/Prochaine tranche`, heure et lieu alignés ;
- `Fin de tranche`, heure et lieu alignés ;
- flèche correctement centrée entre les deux zones ;
- durée de chaque tranche centrée sous sa plage horaire ;
- `Ligne … · Voiture …` lisible sur une ligne ;
- trajets, directions et noms d’arrêts longs réduits proprement avant troncature ;
- tranche active identifiable sans nuire à la lisibilité ;
- cartes Travail / Amplitude alignées et équilibrées ;
- couleurs BEFORE / WORK / PAUSE / CUT / DONE cohérentes ;
- icône bus ou tram correcte selon le service.

## 7. Résilience iCloud et réseau

1. PDF présent dans iCloud mais non encore téléchargé : CTS doit attendre/réessayer avant lecture.
2. Bases CTS présentes dans iCloud mais non locales : elles doivent être récupérées avant lecture.
3. Couper Internet avec un service déjà importé : le widget doit continuer à afficher les données locales disponibles.
4. Rétablir Internet puis lancer une vérification : aucune donnée ne doit être perdue.
5. Simuler un échec Analytics : le rendu du widget ne doit pas être bloqué.

## 8. Diagnostic et confidentialité

1. Lancer `Diagnostic` sur une installation saine.
2. Vérifier installation, GitHub, dossiers iCloud, écriture iCloud, ressources, Services, index et journal d’import.
3. Copier le rapport.
4. Vérifier qu’il ne contient aucun nom de conducteur, matricule, horaire, numéro de service, contenu PDF ou chemin local sensible.

## 9. Critères de diffusion

Une version est diffusable seulement si :

- CTS Installer affiche `22/22 fichiers valides` et `0 erreur` ;
- aucun test critique d’installation, import, sélection ou archivage n’échoue ;
- aucun débordement/troncature d’horaire n’est visible sur les profils d’écran testés ;
- les données existantes sont conservées pendant mise à jour/réparation ;
- le diagnostic ne révèle aucune erreur ;
- le contrôle GitHub du dépôt est valide.
