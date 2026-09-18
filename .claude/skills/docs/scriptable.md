# Scriptable — contraintes vérifiées

Chaque entrée porte sa citation, son adresse et la date de lecture. Ce
qui est ici a déjà été vérifié : n'y retourne que si la date est vieille
ou si le doute porte sur autre chose.

## Le dossier local est invisible dans l'app Fichiers

> « Files stored in the local documents directory will not appear in the
> Files app. »

`docs.scriptable.app/filemanager` · lu le 18/09/2026

C'est ce qui interdit au dossier `Services` de quitter iCloud : le
collègue doit pouvoir y glisser sa carte agent depuis Fichiers. Voir
l'entrée du 18 septembre dans `DECISIONS.md`.

`documentsDirectory()` rend le dossier iCloud de Scriptable quand iCloud
Drive est activé pour l'app, et le dossier local sinon. C'est Scriptable
qui décide, pas le projet.

## Un signet de dossier ne sert pas dans un widget

> « bookmarks created from Scriptables settings only can be used when
> running a script in the app and not from the Share Sheet, Siri and
> Shortcuts. »

`docs.scriptable.app/filemanager` · lu le 18/09/2026

Donc `bookmarkedPath()` ne permet pas au widget de lire un dossier hors
du territoire de Scriptable. Aucun contournement de ce côté.

## Les appels iCloud sont inoffensifs sur un fichier local

> `downloadFileFromiCloud` : « the returned promise will be resolved
> immediately » pour un fichier qui n'est pas dans iCloud.

`docs.scriptable.app/filemanager` · lu le 18/09/2026

Conséquence pratique : basculer `fm` de `FileManager.iCloud()` à
`FileManager.local()` ne casserait aucun appel existant — ils
deviendraient des passe-plats. Ce n'est pas la technique qui s'y oppose,
c'est le geste du collègue.

## Les autres répertoires ne conviennent pas au stockage durable

`libraryDirectory()` : durable, mais « cannot be accessed using the Files
app ». `cacheDirectory()` et `temporaryDirectory()` : « The operating
system may at any time delete files stored in this directory ».

`docs.scriptable.app/filemanager` · lu le 18/09/2026

## iCloud saturé, du côté d'Apple

> « If you run out of iCloud storage, your device won't back up to
> iCloud, new photos and videos won't upload to iCloud Photos, and iCloud
> Drive and other iCloud apps won't stay up to date across your
> devices. »

`support.apple.com/en-us/108922` · lu le 18/09/2026

> « If you can't move or save a document to iCloud Drive, your iCloud
> storage space may be full. The document stays on your Mac, and is
> uploaded to iCloud Drive when space becomes available. »

`support.apple.com/guide/mac-help/store-files-in-icloud-drive-mchle5a61431/mac`
· lu le 18/09/2026

Cette phrase ne figure pas à `support.apple.com/en-us/102563`, où elle
était rangée jusqu'ici : cette page-là traite des sauvegardes. Et c'est
une documentation Mac ; Apple ne dit nulle part la même chose pour iOS.
Le raisonnement ci-dessous vaut donc par analogie, pas par citation.

Ce que ça implique pour le widget : un fichier enregistré sur l'appareil
y reste, donc `isFileDownloaded` faux signifie que le fichier n'est pas
là — et si la synchronisation est arrêtée faute de place, il n'arrivera
pas. Attendre plus longtemps n'y change rien. Allonger la patience du
widget aide un iCloud lent, jamais un iCloud arrêté.
