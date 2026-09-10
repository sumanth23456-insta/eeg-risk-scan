# TrialBridge — Clinical Trial Recruitment & Research Operations MVP

TrialBridge is a demo-ready clinical research operations platform prototype focused on Phase 1 workflows:

- Study setup & site assignment
- Recruitment pipeline tracking
- AI-assisted eligibility scoring with **mandatory human review**
- Digital consent version tracking
- Visit/task coordination
- Coordinator dashboard and participant portal
- Multi-site comparison metrics
- GCP-aligned audit trail views
- 6-role RBAC context (Admin, PI, Coordinator, Monitor, Participant, Sponsor)

## Tech Stack

- React + TypeScript + Vite + Tailwind + shadcn/ui
- In-browser demo data/store for rapid hackathon walkthrough

## Run

```bash
npm install
npm run dev
```

## Route Map

- `/` Coordinator dashboard
- `/patient` Study setup & management
- `/upload` Recruitment workflow
- `/analysis` AI eligibility + human gate
- `/screening` Digital consent management
- `/training` Study visit/task coordination
- `/history` Participant portal
- `/methodology` Site coordination + RBAC + audit trails
- `/unlock` Role selection with sign-in gate

## Notes

- This MVP is an operational prototype for research workflow demonstration.
- It is not a clinical decision system and not a medical device.
