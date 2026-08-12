# Windows code signing — Azure Trusted Signing (skeleton)

**Status:** docs + CI skeleton only. No real signing yet.  
**Current SoT:** unsigned portable zip (`Dictaste-Setup-*.zip`). SmartScreen “unknown publisher” is expected until identity + secrets are in place.

SmartScreen disclosure for end users: [INSTALL_WINDOWS.md](./INSTALL_WINDOWS.md) and the download page on [dictaste.vercel.app](https://dictaste.vercel.app/download).

## Why Azure Trusted Signing (preferred)

| Path | Notes |
|------|--------|
| **Azure Trusted Signing** (recommended) | Cloud Authenticode; no `.pfx` in CI; GitHub Actions OIDC; RFC3161 timestamp via Microsoft’s timestamp URL. Lower ops burden than buying/storing an OV/EV cert. |
| OV / EV hardware cert | Still valid industry practice; requires cert purchase, private-key handling, and often a USB token or HSM. Not the preferred next step for Dictaste. |

Non-goals right now: no cert purchase from agents, no Microsoft Store packaging, no `WIN_URL` / `SHA256SUMS` thrash, soft-launch HOLD.

## Required setup checklist (placeholders only)

Complete these **outside** the repo before enabling signing. Never commit secrets, tokens, certs, or real Azure IDs.

### Azure / Entra

1. Azure subscription + identity verification for Trusted Signing (Microsoft’s account verification flow).
2. Create a **Trusted Signing / Artifact Signing** account and **certificate profile** (names are yours; do not invent values in git).
3. Note the regional **endpoint** (example shape only: `https://<region>.codesigning.azure.net/` — use the value from your Azure resource).
4. Create a Microsoft Entra app registration (or managed identity) for GitHub Actions.
5. Add a **federated credential** (OIDC) trusting this GitHub repo (org/repo + entity: environment, branch, or tag — match what the workflow will use).
6. Grant the identity the **Artifact Signing Certificate Profile Signer** role on the Trusted Signing account.

### GitHub Actions secrets / vars (names only)

Configure in the repo (or environment) **Secrets** / **Variables** UI — never in YAML committed values:

| Name | Kind | Purpose |
|------|------|---------|
| `AZURE_CLIENT_ID` | secret | Entra application (client) ID |
| `AZURE_TENANT_ID` | secret | Directory (tenant) ID |
| `AZURE_SUBSCRIPTION_ID` | secret | Azure subscription ID |
| `AZURE_TRUSTED_SIGNING_ACCOUNT` | variable or secret | Trusted Signing account name |
| `AZURE_TRUSTED_SIGNING_PROFILE` | variable or secret | Certificate profile name |
| `AZURE_TRUSTED_SIGNING_ENDPOINT` | variable or secret | Regional codesigning endpoint URI |

Do **not** use or commit `AZURE_CLIENT_SECRET` if OIDC is configured (preferred). Prefer federated credentials over long-lived client secrets.

### Workflow permissions (when signing is enabled)

OIDC + optional release attach need:

```yaml
permissions:
  id-token: write   # federated credential / azure/login
  contents: write   # attach artifacts to a GitHub Release (tags)
```

`id-token: write` is required for OIDC; without it, Azure login fails even if secrets exist.

## How signing will fit the Windows build

Intended spike (later — not active today):

1. Build the app on `windows-latest` (existing verify + package path).
2. **Sign the inner `Dictaste.exe`** (and any other ship binaries) **before** packaging the portable zip / NSIS installer.
3. Use **RFC3161** timestamping (Microsoft Trusted Signing timestamp URL).
4. Run signing on **tag / release** (or explicit `workflow_dispatch` with `enable_trusted_signing=true`) only — not on every push.
5. Publish the **signed** zip together with updated `SHA256SUMS` in the same release step (site `WIN_URL` update is a separate, deliberate change).

CI stub: [`windows/.github/workflows/build-windows.yml`](../windows/.github/workflows/build-windows.yml). Signing steps **no-op** unless `enable_trusted_signing` is true **and** the Azure secrets above are present. Official action pattern: `azure/login` + `azure/artifact-signing-action` (formerly `azure/trusted-signing-action`).

> **Monorepo note:** this workflow currently lives under `windows/.github/workflows/` (same location as the existing Windows build skeleton). GitHub only loads workflows from the repository-root `.github/workflows/`. When Actions billing is restored and signing is wired for real, either move/copy the workflow to the root path or keep a thin root workflow that `uses` / mirrors it — do not leave production signing only under `windows/.github/`.

## Explicit current state

- **Unsigned zip remains the current release artifact** until John completes Azure identity verification and configures the placeholder secrets/vars above.
- This repo must stay free of `.pfx`, private keys, and real Azure resource IDs.
- Soft-launch remains HOLD; signing is not a launch blocker.
