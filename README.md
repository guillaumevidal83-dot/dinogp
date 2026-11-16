# 🦖 Dino Grand Prix

Jeu de course multijoueur 3D (navigateur, téléphone ou ordinateur) : esquive les dinosaures, ramasse des caisses d'objets et envoie-les à tes adversaires façon Mario Kart.

## Contenu
- **6 circuits** : Jungle du Jurassique, Vallée du Volcan, Canyon du Crétacé, Toundra Glaciaire (route qui glisse), Côte des Fossiles et **Lagon des Abysses** (piste de bois sur l'océan)
- **5 véhicules** (Jeep, Buggy, Monster Truck, Quad, Pierrafeu Mobile) × **6 pilotes** × 10 peintures, avec des statistiques différentes
- **9 dinosaures** sur la piste (dont **Mosasaure, Plésiosaure, Ichtyosaure et Spinosaure** sur le lagon) : Tricératops, Stégosaure, Ankylosaure (traversent la route), Vélociraptor (patrouille à toute vitesse), T-Rex (embuscade quand tu approches)
- **7 objets** : Rocher, Fléchettes ×3, Œuf chercheur, Piège à os (se pose sur la route : qui roule dessus tourne sur lui-même), Turbo, Bouclier, Météorite (pour les derniers, vise le premier). Ils étourdissent les dinos **et** touchent les autres joueurs. Tir en arrière en tenant frein.
- Dérapage + mini-turbo, bots (IA), salons avec code et lien d'invitation, jusqu'à 8 pilotes

## Lancer en local
```
node server.js
```
puis ouvrir http://localhost:3000 (aucune installation npm nécessaire : le serveur n'a aucune dépendance).
Three.js est chargé depuis le CDN jsDelivr par le navigateur : il faut donc une connexion internet.

## Mettre en ligne sur Render (comme tes autres jeux)
1. Crée un dépôt GitHub (ex. `dino-grand-prix`) et envoie-y tout ce dossier.
2. Sur Render : **New → Web Service**, choisis le dépôt.
3. Runtime **Node**, Build Command : `npm install` (ou vide), Start Command : `node server.js`.
4. Une fois en ligne, envoie le lien à tes amis, ou utilise le bouton « Inviter des amis » dans le salon (lien `?room=CODE`).

## Commandes
Clavier : ← → (ou Q/D) tourner • ↑ (ou Z/W) accélérer • ↓ (ou S) freiner/marche arrière • Espace dérapage (relâche pour un turbo) • E ou Entrée utiliser l'objet (avec ↓ : tirer derrière) • R remettre sur la piste • H klaxon.
Tactile : stick à gauche pour tourner, bouton cadeau = objet, DÉRAPE, FREIN (accélération automatique réglable).
