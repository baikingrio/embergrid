# EmberGrid 余烬格

Foundry contracts + Nuxt 4 frontend with shared Monad Testnet constants (`@embergrid/shared`). The project was previously named **Monad Place**.

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- [pnpm](https://pnpm.io/installation)
- Node.js ^22.21, ^24.11, or >=26 (Nuxt 4)

## Setup

```bash
cp .env.example .env
pnpm install
```

## Commands

| Script | Description |
|--------|-------------|
| `pnpm build:contracts` | `forge build` in `contracts/` |
| `pnpm test:contracts` | `forge test` in `contracts/` |
| `pnpm dev:web` | Nuxt dev server |
| `pnpm build:web` | Production Nuxt build |

## Layout

- `contracts/` — Solidity (Foundry)
- `packages/shared/` — chain ID, RPC, viem helpers
- `web/` — Nuxt 4 SPA (`ssr: false`)