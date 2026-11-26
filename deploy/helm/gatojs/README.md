# Helm chart

Runs the project on Kubernetes: one Deployment of the app image, a Service on port 3000, an optional Ingress, a
PersistentVolumeClaim for uploads on local storage, and a Job that runs `prisma migrate deploy` before every install
and upgrade. The database is not part of the chart: point `DATABASE_URL` at a managed PostgreSQL or one your cluster
already runs.

The full walk-through (image, Secret, install, first administrator, upgrade) is in the GatoJS self-hosting runbook,
section "Kubernetes (Helm)".

## Values

| Value                                                                                           | Default                                 | Meaning                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `existingSecret`                                                                                | `""` (required)                         | A Secret read with `envFrom` by the app and the migrate Job: `DATABASE_URL`, `BETTER_AUTH_SECRET`, the mail secrets and the module secrets.              |
| `env`                                                                                           | `APP_URL`, `MAIL_PROVIDER`, ...         | Non-secret variables, the same names as in `.env.selfhost.example`. Set `APP_URL` to the address users reach.                                            |
| `image.repository`, `image.tag`                                                                 | project name, `appVersion`              | The image you built and pushed.                                                                                                                          |
| `image.pullSecrets`                                                                             | `[]`                                    | Pull secrets for a private registry.                                                                                                                     |
| `storage.provider`                                                                              | `local`                                 | `local`: uploads on a PVC at `/app/volumes/uploads`, one replica. `s3`: an S3-compatible store (`S3_*` in `env` and the Secret), any number of replicas. |
| `replicaCount`                                                                                  | `1`                                     | More than one needs `storage.provider=s3`.                                                                                                               |
| `persistence.size`, `.storageClass`, `.accessMode`                                              | `5Gi`, cluster default, `ReadWriteOnce` | The uploads PVC (local storage only).                                                                                                                    |
| `ingress.enabled`, `.host`, `.className`, `.annotations`, `.tls`                                | off                                     | One host routed to the Service.                                                                                                                          |
| `migrations.enabled`                                                                            | `true`                                  | Turn off when migrations run elsewhere.                                                                                                                  |
| `resources`, `podSecurityContext`, `securityContext`, `nodeSelector`, `tolerations`, `affinity` | see `values.yaml`                       | Pod settings. The pod runs as UID 1001, the `nextjs` user of the image.                                                                                  |

The chart sets `STORAGE_PROVIDER` (and `STORAGE_LOCAL_PATH` for `local`) itself; setting them in `env` fails the
render. Helm keeps the uploads PVC after `helm uninstall` (`helm.sh/resource-policy: keep`); delete it by hand when the
files are no longer needed.

## Checks

```bash
helm lint deploy/helm/gatojs --strict --set existingSecret=app-env
helm unittest deploy/helm/gatojs
helm template app deploy/helm/gatojs --set existingSecret=app-env | kubeconform -strict -summary
```

`helm unittest` is the [helm-unittest](https://github.com/helm-unittest/helm-unittest) plugin; the cases are in
`tests/`. `.github/workflows/helm.yml` runs all three on every change under `deploy/`.
