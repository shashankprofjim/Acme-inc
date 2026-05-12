# Connector Service — Upgrade Runbook

**Audience:** Customer ops / SRE running the connector-service Helm
release. You should already have a working install (see
[`README.md`](./README.md)) and `kubectl` access to the cluster
where it's installed.

This runbook is the canonical "we shipped a new version, here's how
to apply it" procedure. Pair with [`ROLLBACK.md`](./ROLLBACK.md) for
the recovery path if an upgrade goes wrong.

---

## Versioning model

The chart uses Semantic Versioning. The `Chart.yaml` `version` field
tracks the chart itself; `appVersion` tracks the connector-service
container image. They evolve independently so we can ship template
fixes without changing the running service.

```
0.3.0 ── chart version
   ↑
0.0.1 ── appVersion (image tag)
```

| What changed                                 | Bumps                   |
| -------------------------------------------- | ----------------------- |
| Template-only fix (e.g. NetworkPolicy tweak) | chart `version` only    |
| Service code change (e.g. new connector)     | both                    |
| Breaking values-schema change                | chart `version` (MAJOR) |
| Breaking API change in connector-service     | both (MAJOR)            |

We **never** ship a breaking change without:

1. A deprecation cycle of at least one minor release with the old
   shape still working
2. A `BREAKING CHANGES` section at the top of the release notes
3. Step-by-step migration instructions in this runbook

---

## Pre-flight checks

Before running `helm upgrade`, verify:

```bash
# 1. The release is healthy now (don't upgrade a sick install).
bash chart/scripts/verify.sh \
  --namespace creatium \
  --release creatium-connectors

# 2. You have a recent backup of the connector-service Postgres.
#    For external-managed Postgres: trigger your normal backup.
#    For bundled Postgres: it's emptyDir — there IS no backup.
#    Do not upgrade with bundled Postgres in production.

# 3. Read the release notes for the version you're moving to.
#    Specifically look for "BREAKING CHANGES" sections.

# 4. Take a snapshot of current values (for rollback parity):
helm get values creatium-connectors -n creatium > values-pre-upgrade.yaml
```

---

## The standard upgrade

Three forms depending on where the chart lives.

### Form A — Released chart on `ghcr.io` (recommended)

```bash
helm upgrade creatium-connectors \
  oci://ghcr.io/creatium-ai/charts/connector-service \
  --version 0.4.0 \
  --namespace creatium \
  -f my-values.yaml \
  --wait --timeout 5m
```

### Form B — Local tarball (air-gapped, sneakernet)

```bash
# Customer received a tarball from us via secure channel.
helm upgrade creatium-connectors ./connector-service-0.4.0.tgz \
  --namespace creatium \
  -f my-values.yaml \
  --wait --timeout 5m
```

### Form C — Mirrored to internal registry (corporate air-gap)

```bash
helm upgrade creatium-connectors \
  oci://registry.internal.example.com/creatium/charts/connector-service \
  --version 0.4.0 \
  --namespace creatium \
  -f my-values.yaml \
  --wait --timeout 5m
```

`--wait` is important: Helm blocks until every Deployment is Ready
**and** the migration Job has succeeded (it's a `pre-upgrade` hook).
Without `--wait` the command returns immediately and you can't tell
if the upgrade actually rolled out cleanly.

---

## What happens during an upgrade

In order:

1. **Helm renders the new templates** with your `my-values.yaml`.
2. **Pre-upgrade hook fires** — runs `db/migrate.js` against the
   connector-service Postgres. The migration Job must finish 0
   exit-code before any further step happens.
3. **Helm diffs** the rendered manifests against what's currently in
   the cluster and applies the delta. Specifically:
   - ConfigMap + Secret get updated
   - The connector-service Deployment's pod template hash changes (new
     image tag + new checksum/config + new checksum/secret annotations
     on the pod template), triggering a rolling restart.
   - Bundled Postgres StatefulSet generally stays unchanged unless we
     bumped the Postgres image.
   - In embedded mode, the nango-server Deployment may also restart
     if Nango image / env changed.
4. **`--wait` blocks** until all pods are Ready (passing
   `/healthz` + `/healthz/db`).

If any step fails, Helm marks the release as `failed` and **does not
roll back automatically**. You decide whether to fix-forward (run
upgrade again with corrected values) or roll back (see ROLLBACK.md).

---

## Verifying the upgrade landed cleanly

```bash
# 1. Helm thinks it's deployed.
helm status creatium-connectors -n creatium
# Expect: STATUS: deployed, REVISION: N+1

# 2. Pods are all 1/1 Running on the new image tag.
kubectl -n creatium get pods -l app.kubernetes.io/instance=creatium-connectors
kubectl -n creatium get deploy creatium-connectors-connector-service \
  -o jsonpath='{.spec.template.spec.containers[0].image}'

# 3. /healthz + /healthz/db pass.
bash chart/scripts/verify.sh \
  --namespace creatium \
  --release creatium-connectors

# 4. Sanity-check a tool call from your forge-admin (or whatever
#    consumes connector-service). Run a known-working flow end-to-end
#    once; if it works, the upgrade is good.
```

---

## Common upgrade scenarios

### 4a. Patch upgrade (0.3.0 → 0.3.1) — service bug fix

Should be the most common case. No values changes needed; just bump
the chart version on the upgrade command. Rolling restart with zero
downtime if `replicaCount > 1`.

### 4b. Minor upgrade (0.3.0 → 0.4.0) — new feature, new values

Read release notes for any new values that have defaults you want to
override. Add them to `my-values.yaml` before running upgrade. New
values typically default off so doing nothing is safe.

### 4c. Embedded-mode upgrade — Nango image bumped

Same `helm upgrade` command. The chart re-renders the nango-server
Deployment with the new image; init containers re-block on Postgres +
Redis, then nango-server rolls. Connect-UI URL doesn't change so
in-flight OAuth flows complete normally.

### 4d. Major upgrade with schema migration (0.x → 1.0)

Read the release notes. If the migration is destructive, the release
notes will tell you to take a manual database backup first. Run the
upgrade with extra caution; verify migration Job logs explicitly:

```bash
kubectl -n creatium logs job/creatium-connectors-connector-service-migrate-N
```

### 4e. Replacing bundled Postgres with managed Postgres mid-life

```yaml
# my-values.yaml — switch from bundled to external
database:
  bundled:
    enabled: false # was: true
  external:
    url: 'postgres://user:pass@managed-db-host:5432/connector_service?sslmode=require'
```

`helm upgrade` will tear down the bundled StatefulSet. **You will
lose all data in the bundled Postgres.** Migrate the data first using
your normal Postgres dump/restore process (`pg_dump` from the bundled
pod, `pg_restore` to the new managed instance) before flipping the
flag.

---

## Upgrade order when running multiple Creatium services

If you run other Creatium components (forge, forge-admin, coaching
apps) that talk to connector-service, **upgrade connector-service
first**. Our API contract is forward-compatible across one major
version: forge built against connector-service v0.3.x will continue
to work against v0.4.x without forge changes.

The reverse is NOT guaranteed: if you upgrade forge first, it might
call new endpoints v0.4.x exposes that connector-service v0.3.x
doesn't yet have.

---

## When something goes wrong

Three failure modes, in order of likelihood:

### Pod goes CrashLoopBackOff after upgrade

The pod read its env vars and Zod validation rejected something.

```bash
kubectl -n creatium logs deploy/creatium-connectors-connector-service \
  --tail=50
# Look for "Environment validation failed" — the message names
# the variable that's wrong.
```

Likely causes:

- A new required env var landed in this version that isn't in your
  values file. Read the release notes; add the value; re-run
  `helm upgrade`.
- A value type changed (e.g. string → enum). Same fix.

### Migration Job fails

```bash
kubectl -n creatium get jobs
kubectl -n creatium logs job/creatium-connectors-connector-service-migrate-N
```

Common causes:

- DB user lacks privileges for the new migration (e.g. `CREATE INDEX
CONCURRENTLY` requires more grants).
- The migration is a long-running operation that exceeded the Job's
  timeout. Bump `migrations.activeDeadlineSeconds` in values.

### `helm upgrade` hangs at `--wait`

```bash
# In another terminal:
kubectl -n creatium get pods --watch
```

If you see a pod stuck in `Pending` or `ContainerCreating` for >2
min, describe it for events:

```bash
kubectl -n creatium describe pod <pod-name>
```

Common: the new image isn't pullable (registry creds expired, image
tag typo). Fix `imagePullSecrets` in values, run `helm upgrade`
again.

When in doubt, **roll back** (see ROLLBACK.md). Helm's rollback path
is fast and reliable; recovering from a partial upgrade is harder
than rolling back and retrying.

---

## Pre-upgrade checklist (for production releases)

Print + tick before you hit Enter on a production upgrade:

- [ ] Read release notes end to end
- [ ] Identified any breaking changes; planned migration steps
- [ ] Took a fresh Postgres backup (external-managed)
- [ ] Snapshot of current values exported (`helm get values`)
- [ ] Verified current install is healthy (verify.sh passes)
- [ ] In a maintenance window OR have a rollback runbook ready
- [ ] Have a way to monitor the rollout (kubectl get pods, logs,
      Prometheus)
- [ ] Have communicated planned downtime if `replicaCount: 1`
- [ ] Have access to take it back to old version if needed

---

## Reference

- [`README.md`](./README.md) — first-time install
- [`ROLLBACK.md`](./ROLLBACK.md) — recovery from a failed upgrade
- [`Chart.yaml`](../../../apps/connector-service/charts/connector-service/Chart.yaml)
  — current chart + app versions
- Release notes — published with each chart version on GitHub
  Releases.
