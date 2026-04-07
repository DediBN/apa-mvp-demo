# APA MVP Demo - Next.js Skeleton

This project provides a build-ready skeleton for the APA Command Center MVP.

## Includes

- Next.js (App Router) + TypeScript foundation
- Tailwind CSS theme tuned for the Command Center visual direction
- Core state machine implementation for the 4-step APA flow
- Starter UI panel to simulate transitions and validate guardrails

## Quick Start

1. Install dependencies
2. Run dev server

```bash
npm install
npm run dev
```

Open http://localhost:3000

## State Flow

IDLE -> INTAKE -> RESEARCH -> EVALUATING -> COMPLETE -> SCORECARD

Global paths:
- Any state -> ERROR (FAIL event)
- ERROR -> IDLE (RESET event)

Core machine code:
- src/lib/state-machine/machine.ts
- src/lib/state-machine/types.ts

## Theme Entry Points

- tailwind.config.ts
- src/app/globals.css
