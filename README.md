# CTS Dashboard

Widget Scriptable pour iPhone permettant aux conducteurs CTS de consulter leur service depuis l’écran d’accueil.

**Développé et maintenu par Emilio IPPOLITO.**

> CTS Dashboard est un projet indépendant. Les documents de service officiels restent la référence.

## Compatibilité

CTS Dashboard est conçu exclusivement pour **iPhone** et pour le **widget grand format de Scriptable**.

Cible de validation actuelle :

- **iOS 18** sur les iPhone encore compatibles avec cette branche, notamment iPhone XR, XS et XS Max ;
- **iOS 26 et versions majeures Apple suivantes prises en charge par le même matériel**, à partir de l’iPhone 11 et de l’iPhone SE 2e génération ;
- Scriptable à jour, qui nécessite iOS 15.5 ou ultérieur ;
- iCloud Drive activé pour Scriptable ;
- connexion Internet requise pour l’installation, les mises à jour et la réparation des ressources.

Les versions bêta d’iOS ne constituent pas une cible de garantie. Elles peuvent être testées, mais la compatibilité officielle du projet vise les versions publiques récentes.

Le rendu du widget adapte automatiquement ses espacements aux écrans iPhone plus étroits et réduit les textes longs avant toute troncature.

## Installation recommandée

1. Installer **Scriptable** depuis l’App Store et l’ouvrir une première fois.
2. Recevoir le fichier **`CTS Installer.scriptable`** fourni par le mainteneur.
3. Ouvrir le fichier puis utiliser **Partager → Scriptable → Add to My Scripts**.
4. Dans Scriptable, exécuter **CTS Installer**.
5. Choisir **Installer la version disponible** et attendre la validation complète.
6. Sur l’écran d’accueil, ajouter un widget **Scriptable grand format**.
7. Configurer le widget avec **Script : CTS Dashboard** et **When Interacting / Open App : Run Script**.

Si CTS Installer annonce une version plus récente, choisir **Installer la version proposée**, puis relancer CTS Installer une seconde fois : l’installateur se met à jour lui-même avant d’installer le Dashboard.

Selon la version d’iOS, le bouton de modification de l’écran d’accueil peut être affiché avec un libellé ou une icône différente. La procédure compatible à retenir est **Modifier → Ajouter un widget**. Pour reconfigurer un widget existant, utiliser **appui long sur le widget → Modifier le widget**.

Les trois tutoriels dédiés Safari, Google et Brave détaillent ensuite le dépôt quotidien des cartes d’agent.

## Déposer un service

Enregistrer la carte d’agent PDF dans :

```text
iCloud Drive
└── Scriptable
    └── CTS Dashboard
        └── Services
```

Plusieurs cartes peuvent être déposées à l’avance. CTS Dashboard importe et sélectionne automatiquement le service correspondant à la date utile.

## Mises à jour

Relancer **CTS Installer** puis choisir **Mettre à jour** ou **Vérifier les fichiers**. L’Installer compare les 22 fichiers distribués au snapshot GitHub courant et conserve les PDF, les archives et les données protégées.

## Diagnostic

En cas de problème :

1. exécuter **CTS Installer** ;
2. ouvrir **Diagnostic** ;
3. copier le rapport technique ;
4. transmettre ce rapport dans le canal d’assistance prévu.

Le rapport est conçu pour exclure le nom du conducteur, le matricule, les horaires, le numéro de service et le contenu des PDF.

## Fonctions principales

- import automatique des cartes agent PDF HASTUS ;
- sélection automatique du service selon la date et les horaires après minuit ;
- états Avant le service / En service / Pause / Coupure / Service terminé ;
- affichage des tranches, directions, dépôts et mises en ligne ;
- archivage automatique et rétention des archives ;
- récupération iCloud avec nouvelles tentatives ;
- réparation et vérification automatiques des fichiers ;
- diagnostic anonymisé.

## Structure créée automatiquement

```text
CTS Dashboard
├── Cache
├── Data
├── Database
├── Libraries
└── Services
    ├── Archive
    └── Rejected
```

## Développeur

**Emilio IPPOLITO**

Projet développé et maintenu indépendamment.
