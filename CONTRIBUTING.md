# Contribuer

Ce dépôt est public parce que les conducteurs qui installent CTS Dashboard
doivent pouvoir lire ce qui tourne sur leur iPhone. Il n'est pas ouvert aux
contributions de code : un seul mainteneur le tient, et tout ce qui y est
publié part sur des téléphones consultés avant une prise de service.

Ce fichier dit donc surtout où aller.

## Vous êtes conducteur, et quelque chose ne marche pas

N'ouvrez pas d'issue ici. Le chemin est plus court et plus sûr :

1. le **dépannage rapide** du [README](README.md#en-cas-de-problème) règle
   la plupart des cas ;
2. sinon, **CTS Installer → Diagnostic**, puis copier le rapport ;
3. transmettre ce rapport dans le groupe WhatsApp du projet.

Le rapport de diagnostic est conçu pour ne contenir ni votre nom, ni votre
matricule, ni vos horaires, ni le contenu de vos PDF. Il se transmet tel
quel, sans relecture.

## Vous passez par là, et vous avez vu quelque chose

Une issue est bienvenue. Dites ce que vous avez vu et où, plutôt que ce
qu'il faudrait faire : le contexte du projet — un widget Scriptable, des
cartes d'agent HASTUS, vingt-quatre utilisateurs — décide souvent de la
réponse.

Une pull request non annoncée a peu de chances d'être fusionnée telle
quelle. Ouvrez une issue d'abord.

## Vous avez trouvé une faille

Elle ne s'écrit pas dans une issue. [`SECURITY.md`](SECURITY.md) dit par où
la signaler.

## Si une pull request est ouverte quand même

Elle part du [gabarit du dépôt](.github/pull_request_template.md), et la
validation doit passer au vert : les commandes sont listées dans la section
**Vérifications automatiques** du [README](README.md#vérifications-automatiques).

Deux règles ne se négocient pas, et la validation les fait respecter :
aucun secret n'entre dans le dépôt, et aucun outil de maintenance du
mainteneur n'y réapparaît. Un dépôt public publie définitivement ce qu'on y
met, l'historique Git compris.
