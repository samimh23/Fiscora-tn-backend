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
