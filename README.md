# RentEase: Blockchain Rental Agreement Platform

A decentralised property management portal with three roles (**Admin**, **Property Owner**, **Tenant**).
Owners create leases, tenants see them in their dashboard, accept them, and pay deposit and rent on-chain.
Built with **Solidity + Truffle + Ganache** (smart contract), **React + Vite + ethers.js** (frontend) and
**Node.js + Express** (off-chain API for PDFs and maintenance requests).

## How it works

```
 Owner ──create lease──▶ ┌──────────────────┐ ◀──accept + deposit── Tenant
                         │  RentEase.sol    │ ◀──pay rent monthly── Tenant
 Admin ──approve owners─▶│  (on Ganache)    │ ──rent minus fee────▶ Owner
 Admin ──resolve dispute▶│  escrow + roles  │ ──deposit refund────▶ Tenant
                         └────────▲─────────┘
                                  │ ethers.js + MetaMask
                         ┌────────┴─────────┐        ┌─────────────────────┐
                         │ React client     │ ◀────▶ │ Express backend     │
                         │ (3 dashboards)   │  /api  │ PDF store + hash,   │
                         └──────────────────┘        │ maintenance tickets │
                                                     └─────────────────────┘
```

### Lease lifecycle
1. **Admin** approves the owner (or the owner requests access from the landing page and the admin approves).
2. **Owner** adds a property and creates a lease for the tenant's wallet address (rent, deposit, months, optional PDF).
   Status: `Created`. The lease appears on the tenant's dashboard.
3. **Tenant** clicks *Accept and pay deposit*. The deposit is locked in the contract. Status: `Active`.
4. **Tenant** pays rent each month. The contract forwards it to the owner minus the platform fee (default 1%).
   Payments more than 5 days late add a 5% late fee automatically.
5. When all rent is paid the **owner** completes the lease and returns the deposit.
   Either party can **terminate early** or **raise a dispute**; the **admin** then splits the deposit.

### Role permissions
| Role | Identified by | Can do |
|---|---|---|
| Admin | Wallet that deployed the contract | Approve/reject owners, resolve disputes, set platform fee, withdraw fees, pause platform, view everything |
| Owner | Wallet approved by admin | Add properties, create/cancel leases, terminate/complete, return deposit, view income, update maintenance status |
| Tenant | Any wallet named in a lease | Accept lease, pay deposit and rent, terminate, raise dispute, submit maintenance requests |

All permissions are enforced in the smart contract with modifiers and `require` checks. The UI only mirrors them.

## Folder structure

```
rentease/
├── contracts/RentEase.sol          Smart contract (roles, escrow, rent, late fees, disputes)
├── migrations/1_deploy_rentease.js Deploys and writes ABI + address to frontend/src/contracts/RentEase.json
├── scripts/seed.js                 Optional demo data (owner, property, one lease)
├── test/rentease.test.js           Truffle tests (11 cases)
├── truffle-config.js               Network: Hardhat on 127.0.0.1:8545, solc 0.8.19
├── package.json                    Root scripts (compile, migrate, test, seed, hardhat...)
├── backend/
│   ├── server.js                   Express API: PDF upload + SHA-256 hash, maintenance requests
│   └── package.json
└── frontend/
    ├── index.html, vite.config.js, package.json
    └── src/
        ├── App.jsx, main.jsx, styles.css
        ├── context/Web3Context.jsx     MetaMask + contract + role detection
        ├── pages/                      Landing, AdminDashboard, OwnerDashboard, TenantDashboard
        ├── components/                 LeaseCard, LeaseActions, CreateLeaseForm, PaymentTable, charts...
        ├── hooks/usePolling.js
        └── utils/                      format.js (parsing, CSV), api.js (backend calls)
```

## Prerequisites
- Node.js 18 or newer
- MetaMask browser extension
- Hardhat local node (included in the project's development dependencies)
- A Firebase project with Google sign-in enabled

## Firebase Google sign-in
1. In the [Firebase Console](https://console.firebase.google.com/), create a project and register a **Web app**.
2. Under **Authentication → Sign-in method**, enable **Google**.
3. Under **Authentication → Settings → Authorized domains**, ensure `localhost` is listed.
4. Copy `frontend/.env.example` to `frontend/.env.local` and fill in the web app values from **Project settings → Your apps**:
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, and `VITE_FIREBASE_APP_ID`.
   The Firebase web config is intended for client applications; do not put Firebase Admin service-account credentials in the frontend.
5. Restart the Vite frontend after changing the environment file.

Users sign in with Google from the selected portal, then connect MetaMask from the portal screen. Firebase verifies the Google account; access to admin and owner actions is still determined by the connected wallet's on-chain role. The admin must use the wallet that deployed the contract, and an owner wallet must be approved by the admin.

## Setup

```bash
# 1. Install everything (root, backend, frontend)
npm run install:all

# 2. Start the Hardhat local blockchain in a separate terminal
npm run hardhat            # port 8545, chain ID 31337; keep this terminal running

# 3. Compile, test and deploy the contract
npm run compile
npm test                    # uses the running Hardhat node; skips migrations
npm run migrate            # also writes frontend/src/contracts/RentEase.json

# 4. (Optional) load demo data: approved owner + property + lease for a tenant
npm run seed

# (Optional) approve the additional owner wallet configured for this demo
npm run approve:owner

# 5. Configure Firebase Google sign-in using the steps above.
# 6. Run the backend and the frontend (two terminals)
npm run backend            # http://localhost:5000
npm run frontend             # http://localhost:5173
```

> Re-run `npm run migrate` whenever you restart the Hardhat node. Each deploy writes a new contract address for the client.

## MetaMask setup
1. Add a network: **RPC URL** `http://127.0.0.1:8545`, **Chain ID** `31337`, symbol `ETH`.
2. Import three Hardhat accounts using the private keys printed by `npm run hardhat`:
   - Account #0 = **Admin** (deployed the contract)
   - Account #1 = **Owner**
   - Account #2 = **Tenant**
3. Switch MetaMask accounts to log in as a different role. The app reloads the role automatically.

## Demo walkthrough
1. Open http://localhost:5173, choose a portal, and sign in with Google. The portal then prompts you to connect the matching MetaMask wallet.
2. For **Administrator**, connect account #0. For **Property Owner**, connect account #1; if it is not approved yet, request access in the owner portal and approve it from the admin's *Owner Approvals* tab. For **Tenant**, connect account #2.
3. As the **owner** (account #1): *My Properties* tab, add a property. *Agreements* tab, create a lease for account #2 (attach a PDF if you like).
4. As the **tenant** (account #2): open *My Leases*, review the offer, click *Accept and pay deposit*, then *Pay rent*.
5. Back as the owner: see income and the transaction list; use *Return deposit* after completing the lease.
6. Try *Raise dispute* as a tenant and resolve it from the admin's *Agreements* tab.

To test late fees quickly, advance Hardhat time:
```bash
curl -X POST http://127.0.0.1:8545 -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"evm_increaseTime","params":[518400],"id":1}'
curl -X POST http://127.0.0.1:8545 -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"evm_mine","params":[],"id":2}'
```

## API (backend)
| Method | Route | Purpose |
|---|---|---|
| POST | `/api/documents` | Upload a lease PDF (multipart `file`). Returns `{ hash }`, the SHA-256 stored on-chain |
| GET | `/api/documents/:hash` | Download the PDF |
| GET | `/api/maintenance?tenant=&owner=&leaseId=` | List maintenance requests |
| POST | `/api/maintenance` | Create a request |
| PATCH | `/api/maintenance/:id` | Update status (Open, In Progress, Resolved) |

The *Verify integrity* button on a lease re-hashes the stored PDF in the browser and compares it with the on-chain hash.

## Design decisions and limitations
- **Native ETH payments** keep the demo simple. For real rent use a stablecoin (ERC-20 `transferFrom`) because ETH is volatile.
- **Personal data stays off-chain.** Only the document hash, wallet addresses and amounts are public.
- **The backend does not authenticate wallets.** For production, sign a message with MetaMask and verify it server-side.
- **List views loop over arrays on-chain.** Fine for a demo; for scale, index events with a subgraph or the backend.
- **Legal validity (India).** A smart contract alone is not a registered rental agreement. In Maharashtra, agreements need stamp duty, and registration if the term exceeds 11 months. Use this as a hybrid: a legal e-stamped agreement plus on-chain payments, escrow and tamper-proof records.
- Truffle is used for compilation, migration and tests; Hardhat provides the local Ethereum node.
- Have the contract reviewed (for example with Slither) before holding real funds.

## Troubleshooting
| Problem | Fix |
|---|---|
| "Contract not deployed yet" | Run `npm run migrate` |
| "No contract found on this network" | MetaMask is on the wrong network, or the Hardhat node was restarted. Switch network and re-run `npm run migrate` |
| MetaMask nonce or "block height" errors after restarting the node | MetaMask, Settings, Advanced, *Clear activity tab data* |
| Role says Tenant for the owner wallet | The admin has not approved that wallet yet |
| PDF upload fails | Backend not running (`npm run backend`) or the file is not a PDF under 10 MB |
