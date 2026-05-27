# MATA Plateforme — Du champ à l'assiette

Maquette PMV (Produit Minimum Viable) de la plateforme MATA qui connecte producteurs alimentaires, clients (pros et particuliers), équipes logistiques et back-office MATA au Sénégal.

## Aperçu

Plateforme web mobile-first qui permet à MATA d'orchestrer collecte, stockage, livraison, paiements et reversements, sans s'enfermer dans une logique unique de marketplace ouverte. Le business model n'est pas figé : pricing décomposé en 7 composantes pour tester plusieurs hypothèses (commission %, marge fixe, mixte, gros volume négocié).

## Lancer la maquette

Cette version est une maquette HTML statique (mock-up cliquable), pas une vraie application.

```bash
# Ouvrir directement dans un navigateur
open mockup/index.html
```

Ou pour un serveur local (utile pour le mode PWA installable) :

```bash
cd mockup
python -m http.server 8080
# puis ouvrir http://localhost:8080
```

## Ce qu'il y a dedans

- **3 espaces** : Producteur (mobile-first), Client (mobile + desktop), Back-office MATA (desktop)
- **26 écrans** couvrant l'ensemble du backlog P0 du PMV
- **3 parcours guidés** end-to-end :
  - Cycle de vie d'une commande (8 étapes, traverse les 3 espaces)
  - Onboarding producteur (6 étapes)
  - Assistance téléconseiller sécurisée (6 étapes)
- **Commande client anonyme** (sans inscription) pour les particuliers
- **Guide utilisateur** complet (statuts, rôles, glossaire, règles téléconseiller)
- **PWA-ready** (manifest installable)

## Stack maquette

- HTML statique unique
- Tailwind CSS (CDN)
- Inter (Google Fonts)
- Lucide (icônes SVG)
- Vanilla JS pour le routing hash-based

Aucun build, aucune dépendance NPM. Le fichier `mockup/index.html` est autonome.

## Direction visuelle

- Couleur primaire : `#9B1C1C` (rouge boeuf — identité MATA)
- Fond : `#FAFAF9` (off-white chaud, évoque le terroir)
- Style sobre et institutionnel (crédibilité partenaires type BOA)
- Mobile-first, gros boutons côté producteur (UX adaptée aux producteurs peu à l'aise avec le digital)

## Prochaines étapes

1. Tester la maquette sur le terrain (3-4 producteurs, 2-3 clients pros, équipe MATA)
2. Itérer selon les retours
3. Préparer les supports partenaires (BOA, investisseurs) à partir des parcours guidés
4. Définir le stack tech (front, back, hébergement)
5. Construire le vrai PMV

## Statut

Maquette v0.2 — pas encore de code applicatif ni de backend. Pour démonstration et validation utilisateur.
