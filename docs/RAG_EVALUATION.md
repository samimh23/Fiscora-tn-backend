# Évaluation de l’Assistant Fiscora

L’évaluation appelle la même route authentifiée que l’interface et échoue avec
un code non nul dès qu’un cas ne retrouve pas tous les termes, montants ou
citations attendus.

Variables requises :

- `FISCORA_API_URL`
- `FISCORA_API_TOKEN`
- `FISCORA_ORGANIZATION_ID`
- `FISCORA_DOSSIER_ID`

Exécution :

```powershell
npm run assistant:eval -- docs/rag-evaluation.example.json
```

Le jeu fourni est un modèle. Chaque dossier de référence doit disposer de son
propre fichier de cas avec des réponses vérifiées par un comptable. Les mesures
produites sont le taux de réussite, le rappel des termes, le rappel des montants
et la couverture des citations.

Remplacez aussi les UUID `REPLACE_WITH_REFERENCE_INVOICE_UUID` et les montants du
cas de suivi par ceux de votre facture de référence ; ils ne sont pas des mesures
obtenues sur la production.

## Contrôles supplémentaires

- `expectedScope` vérifie le routage : `DOCUMENT`, `LIVE_FINANCIAL`,
  `ACCOUNTING_CALCULATION`, `PRODUCT_HELP` ou `CLARIFICATION`.
- `expectedSourceIds` exige les vraies pièces/factures attendues ;
  `allowedSourceIds` interdit les sources d’un autre dossier ou d’une autre pièce.
- `requireInlineCitations` exige des labels `[S1]` connus dans la réponse.
- `forbiddenTerms` et `forbiddenNumbers` détectent une affirmation ou un montant
  incorrect connu. Les montants attendus sont comparés comme nombres entiers de
  texte, pas comme sous-chaînes d’un montant plus grand.
- `setupQuestions` permet de préparer une conversation avant une question de
  suivi, par exemple une facture précise puis « Et son solde restant ? ».

Chaque cas dispose d’une nouvelle fenêtre de conversation ; les questions de
préparation et la question évaluée passent par la route contextuelle authentifiée
utilisée par le chat. Les appels peuvent entraîner des coûts Vertex AI et créer
des tours d’historique ; utilisez un dossier de référence autorisé.

Ces contrôles sont des tests de régression, pas une preuve automatique que toutes
les affirmations sont justifiées par leurs sources. Une revue comptable des
réponses et une vérification d’isolation/permissions restent nécessaires. Les
tests unitaires et les tests navigateur mockés ne mesurent pas la qualité réelle
du modèle déployé.

## Jeu d’évaluation intégré (dossier synthétique)

Un dossier fictif et déterministe est fourni dans `src/dev/rag-eval/` : 37 pièces
validées (achats, ventes, un avoir, relevés BIAT de janvier à juin 2026) et
123 questions réparties par catégorie : référence exacte, tiers, accents et
casse, lignes de facture, période, fautes de frappe, banque, questions de suivi,
plusieurs documents et 15 questions sans réponse (refus attendu). Toutes les
sociétés et tous les montants sont inventés. Un test unitaire vérifie que chaque
montant attendu figure réellement dans les extraits indexés.

1. Créez un dossier **vide**, réservé à l’évaluation (le script refuse un
   dossier qui contient d’autres pièces).
2. Chargez les pièces validées ; l’indexation se lance en arrière-plan :

   ```powershell
   $env:FISCORA_ORGANIZATION_ID="..."; $env:FISCORA_DOSSIER_ID="..."
   npm run assistant:eval:seed
   ```

3. Lancez l’évaluation et gardez le résultat pour comparer avant/après :

   ```powershell
   npm run assistant:eval -- --builtin --out rag-eval-results/baseline.json
   npm run assistant:eval -- --builtin --only bank,refusal
   ```

4. Pour retirer les données : `npm run assistant:eval:seed -- --clean`.

Mesures ajoutées au résumé : `retrievalRecall` (part des pièces attendues
effectivement citées), `refusalAccuracy` (questions sans réponse correctement
refusées, par HTTP 400 ou par une réponse « les sources ne permettent pas »),
`latencyP50Ms` / `latencyP95Ms`, et `byCategory` (taux de réussite par
catégorie). Les montants sont comparés en acceptant l’écriture française
(`1 190,500`) et les zéros finaux omis (`120.5`, `120`).

## Évaluer en local avec les vrais modèles

Sans identité managée Azure, le backend local peut appeler Vertex AI avec votre
propre connexion `gcloud` (refusé si `NODE_ENV=production`) :

```powershell
gcloud auth login
$env:GCP_LOCAL_GCLOUD_AUTH="true"; $env:AI_ASSISTANT_ENABLED="true"
$env:GCP_PROJECT_ID="fiscora-ai"; $env:RAG_RERANKER="vertex"
npm run start:dev
```

Chargez ensuite le dossier synthétique dans un dossier vide de la base locale
(`npm run assistant:eval:seed`), attendez l’indexation, puis lancez
`npm run assistant:eval -- --builtin --out rag-eval-results/local.json` avec un
compte de test local.

## Recherche documentaire (phase 1)

- Recherche plein texte en français, sans accents (`search_vector_fr`), où un
  seul mot correct suffit à faire remonter une pièce ; l’ancienne colonne
  `search_vector` reste utilisée pour les références exactes (numéros de
  pièce, codes produits).
- Correspondance approximative (`pg_trgm`) sur les meilleurs candidats, pour les
  fautes de frappe (« abonement », « tonner »).
- Les quatre classements (sens, mots, codes, fautes) sont fusionnés (RRF).
- Indices lus dans la question (mois, année, achats/ventes/banque) appliqués
  comme filtres souples : sans résultat, la recherche repart sur tout le dossier.
- Une question qui nomme une pièce (« total TTC du document FV-2026-013 »)
  lit cette pièce au lieu de calculer un total de tout le dossier.
- « Et en mars ? » réutilise la question précédente pour la recherche
  uniquement ; le calcul et le routage gardent la question telle qu’elle est.
- Reclassement optionnel par l’API Vertex AI Ranking (`RAG_RERANKER=vertex`),
  avec repli automatique sur l’ordre hybride en cas d’erreur ou au-delà de
  `RAG_RERANK_TIMEOUT_MS`.
- Au plus 3 extraits par pièce dans le contexte (sauf pièce ciblée), pour
  pouvoir comparer plusieurs documents.

### Retour arrière

- Désactiver le reclassement : `RAG_RERANKER=none` puis redémarrer l’API, sans
  redéploiement.
- Annuler le code : revert du merge ; l’ancien code ignore la nouvelle colonne.
- Annuler le schéma si nécessaire : `npm run migration:revert` (supprime
  l’index, la colonne et la fonction ; les extensions `unaccent` et `pg_trgm`
  restent installées, sans effet).
- Ordre de déploiement : autoriser `unaccent,pg_trgm` sur Azure PostgreSQL et
  activer l’API Discovery Engine côté GCP **avant** de déployer ce code, sinon
  la migration échoue au démarrage.

## Réponses (phase 2)

- Avec un dossier ouvert, seules les questions explicitement « comment faire »
  (comment, où se trouve, à quoi sert cette page, bouton, menu…) vont aux
  guides Fiscora ; « quelle est la date du document X » interroge le dossier.
- « Combien de fournisseurs / liste des clients » : décompte exact sur toutes
  les pièces validées (fournisseurs = achats, clients = ventes), noms
  regroupés malgré les variantes (« S.A.R.L. », majuscules).
- Les montants de chaque réponse générée sont comparés aux extraits fournis ;
  un montant absent est signalé (« Montant non retrouvé tel quel… »).
- Citations normalisées : « [S1, S2] » devient « [S1] [S2] » pour rester
  cliquables.
- Gemini 2.5 Flash sans « thinking » pour les réponses sourcées : les jetons de
  réflexion consommaient le budget de sortie et tronquaient les réponses.
