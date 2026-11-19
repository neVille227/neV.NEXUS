# neV.NEXUS — LIFE DIGITAL (V3, plateforme connectée)

*Connecting People, Creating Opportunities* — pilote Bénin (Abomey-Calavi).

Plateforme de mise en relation entre personnes, organisations, ressources et opportunités.
Cette version transforme le prototype statique V2 en application fonctionnelle : API, base PostgreSQL, comptes, espaces, modération.

## État réel
- **Mode pilote** : inscriptions **sur code d'invitation** (`REGISTRATION_MODE=invite`), bandeau « version pilote » affiché, site non indexé.
- Aucune donnée réelle ni ouverture publique avant validation juridique, sécurité et supervision par des adultes légalement habilités (voir le dossier opérationnel).
- Aucun contenu de démonstration n'est injecté en base : le répertoire public reste vide tant que des organisations n'ont pas été **vérifiées** par la modération.

## Fonctionnalités
| Module | Contenu |
|---|---|
| SEARCH / RESOURCES | Recherche et filtres sur les ressources **publiées** d'organisations **vérifiées** |
| HELP | Dépôt d'un besoin **privé** (compte requis), suivi, suppression, orientation par la modération |
| OPPORTUNITIES | Opportunités publiées, avec date limite (expirées masquées) |
| LEARN | Contenus publiés par la modération |
| COMMUNITY | Répertoire et fiches d'organisations (fiche complète du Dossier §4.6) |
| Comptes | Inscription, connexion, changement de mot de passe, **suppression du compte** |
| Espace organisation | Soumission de fiche, ressources et opportunités (relues avant publication) |
| Modération | File d'attente, vérification, signalements, besoins, journal d'audit, gestion des rôles |

### Statuts de vérification (Dossier §4.7)
`pending` En attente · `verified` Vérifiée · `renewal_due` À renouveler (automatique après 180 jours) · `flagged` Signalée (dès 2 signalements ouverts) · `suspended` Suspendue.
Une organisation n'est jamais vérifiée du seul fait d'avoir un compte ; modifier une fiche vérifiée relance la vérification.

## Sécurité
Mots de passe hachés (bcrypt) · jetons de session hachés en base, cookie `HttpOnly` `SameSite=Lax` `Secure` · protection CSRF (en-tête obligatoire) · limitation de débit · validation stricte (zod) · contrôle d'accès **côté serveur** par rôle · CSP et en-têtes (helmet) · échappement systématique côté interface · journal d'audit · besoins supprimés après 12 mois (valeur provisoire à valider) · aucune requête SQL concaténée.

## Lancer en local
```bash
npm install
cp .env.example .env   # puis adapter, ou exporter les variables
npm start              # applique les migrations puis démarre
npm test               # nécessite un PostgreSQL local de test (voir test/helpers.js)
```
Les tests **vident** le schéma `public` de la base de test : ne jamais les pointer vers une base réelle.

## Déploiement (Render)
Service web Node (`npm install` / `npm start`) + base PostgreSQL. Variables : `DATABASE_URL`, `NODE_ENV=production`, `REGISTRATION_MODE`, `INVITE_CODE`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`. Santé : `/api/health`.

## Reste à faire avant ouverture publique
1. Validation juridique (statuts, règlement intérieur, Code du numérique, déclaration APDP) et textes de confidentialité définitifs.
2. Vérification d'adresse e-mail et récupération de mot de passe (fournisseur d'e-mail à choisir).
3. Hébergement de production (base payante avec sauvegardes) et surveillance.
4. Revue de sécurité indépendante, tests d'accessibilité et de charge.
5. Test supervisé avec un petit groupe, puis ouverture progressive.
