# Watchtower

Watchtower is an on-chain regulatory intelligence system built on GenLayer. It monitors trusted public sources, evaluates new material against company-specific risk profiles, and records scans, alerts, keeper activity, and follow-up actions on-chain.

The application combines a Next.js operations dashboard with a GenLayer Intelligent Contract. Signal Sweeps use GenLayer consensus to determine whether source material is relevant to a registered watch profile.

## What It Does

- Registers official regulatory and policy sources
- Creates watch profiles for industries, jurisdictions, products, and risk areas
- Runs scheduled or manual Signal Sweeps
- Produces evidence-backed alerts for relevant source items
- Tracks duplicate findings and scan failures
- Records keeper reputation and scan activity
- Supports alert review, dismissal, and action-item workflows
- Exposes an on-chain ledger for operational verification

## Stack

- Next.js 16 and React 19
- TypeScript and Tailwind CSS
- GenLayer StudioNet
- GenLayer Intelligent Contracts in Python
- `genlayer-js` for contract reads and transactions

## StudioNet Deployment

| Item | Value |
| --- | --- |
| Network | GenLayer StudioNet |
| Chain ID | `61999` |
| Contract | `0x9c8Fdf779Fb2A3C7f943376b54d7357fD19003b8` |
| Explorer | [explorer-studio.genlayer.com](https://explorer-studio.genlayer.com) |

The contract source is located at [`contracts/watchtower.py`](contracts/watchtower.py).

## Getting Started

### Requirements

- Node.js 20 or newer
- npm
- A StudioNet-compatible wallet with test funds

### Installation

```bash
git clone https://github.com/lolaaa00/watchtower.git
cd watchtower
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS=0x9c8Fdf779Fb2A3C7f943376b54d7357fD19003b8
NEXT_PUBLIC_GENLAYER_CHAIN_ID=61999
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_GENLAYER_EXPLORER_BASE_URL=https://explorer-studio.genlayer.com
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Product Workflow

1. Connect a StudioNet wallet.
2. Create a watch profile with relevant jurisdictions, products, risk areas, and keywords.
3. Register an official source from the Sources administration screen.
4. Open **Signal Sweep** and select the profile and source.
5. Submit the sweep and wait for GenLayer consensus.
6. Review the resulting Chain Stamp, scan record, alerts, and keeper statistics.

## Signal Sweep Statuses

| Status | Meaning |
| --- | --- |
| `COMPLETED` | The scan succeeded and created at least one relevant alert. |
| `NO_UPDATES` | The scan succeeded but found no new relevant items for the profile. |
| `DUPLICATE_ONLY` | Relevant material was found but had already been recorded. |
| `FAILED` | Fetching, parsing, validation, or consensus failed. |
| `PENDING`, `FETCHING`, `CONSENSUS` | Intermediate processing states. |

`NO_UPDATES` is a valid successful result. Watchtower does not create an alert unless the source contains material that genuinely matches the selected profile.

### Testing a Positive Result

For the best chance of receiving `COMPLETED`, use a narrowly targeted official source and a strongly matching profile. For example:

- **Source:** Federal Register API filtered for CFPB rules, proposed rules, and notices
- **Industry:** Financial services
- **Products:** Digital lending, consumer credit, payments
- **Risk areas:** Disclosure, consumer protection, reporting, credit risk
- **Keywords:** CFPB, lending, disclosure, consumer credit, digital lending

Use a fresh source or source item when repeating the test. Once an item has produced an alert, later sweeps may correctly classify it as a duplicate rather than creating another alert.

For deterministic StudioNet testing, host a public test JSON or text document containing a clearly dated regulatory notice that matches the test profile. Register that public URL as a test source and change the document identifier or publication data between runs. The contract still performs its normal fetch, relevance evaluation, consensus, and on-chain recording; the scan result is not faked.

## Application Areas

- `/` - observatory overview
- `/profiles` - watch profile management
- `/sources` - registered source monitoring
- `/scan` - Signal Sweep execution
- `/alerts` - regulatory findings
- `/keepers` - keeper performance
- `/tribunal` - review and re-review workflow
- `/ledger` - on-chain activity and contract state
- `/admin/sources` - source registration and health checks

## Development Checks

```bash
npm run lint
npm run build
```

The production build may require network access because Next.js downloads configured Google font assets during compilation.

## Contract Notes

The contract stores collection indexes as pipe-separated strings in `TreeMap[str, str]`. This avoids runtime construction of nested `DynArray` storage values, which GenLayer does not permit inside contract methods.

String-compatible `v2` methods are provided for frontend-facing numeric and address inputs. This keeps browser transaction encoding predictable while preserving the Watchtower product logic.

## Security

- Never commit wallet private keys or seed phrases.
- Keep deployment credentials outside frontend environment variables.
- Only variables prefixed with `NEXT_PUBLIC_` should be treated as public browser configuration.
- Verify the configured contract address before submitting transactions.
