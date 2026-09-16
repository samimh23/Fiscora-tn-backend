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
