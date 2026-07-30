# Observabilité locale Fiscora

La stack locale contient :

- l’API NestJS instrumentée avec `prom-client` ;
- Prometheus pour collecter et conserver les métriques pendant 7 jours ;
- Grafana avec la source Prometheus et le tableau de bord Fiscora déjà
  provisionnés ;
- des règles locales pour l’indisponibilité de l’API ou de PostgreSQL, les
  erreurs HTTP, la latence et la mémoire.

## Démarrage

```powershell
docker compose up -d --build
```

Points d’accès :

- métriques brutes : <http://localhost:3000/metrics>
- Prometheus : <http://localhost:9090>
- règles Prometheus : <http://localhost:9090/rules>
- Grafana : <http://localhost:3001>

En développement, Grafana utilise l’utilisateur `admin`. Le mot de passe par
défaut est `fiscora_dev`. Définissez `GRAFANA_ADMIN_PASSWORD` dans `.env` pour
le remplacer. Cette valeur locale ne doit jamais être réutilisée en staging ou
en production.

Le tableau de bord **Fiscora · Vue opérationnelle** apparaît automatiquement
dans le dossier Grafana **Fiscora**.

## Portée des alertes

Prometheus évalue les règles, mais aucun Alertmanager n’est encore configuré.
Les états `pending` et `firing` sont visibles dans Prometheus. L’envoi vers
e-mail, Slack ou Teams sera ajouté lorsque le canal d’astreinte sera choisi.

## Production AWS

Ne publiez pas `/metrics`, Prometheus ou Grafana directement sur Internet.
Limitez-les à un réseau privé ou remplacez la stack locale par CloudWatch,
Amazon Managed Service for Prometheus et Amazon Managed Grafana selon les
besoins et le budget.

Si l’endpoint doit être accessible hors d’un réseau privé, définissez
`METRICS_TOKEN`. L’API exigera alors l’en-tête
`Authorization: Bearer <token>`. La collecte Prometheus devra utiliser le même
secret.
