# Project2

## Overview

[Add project description here]

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /gstack-office-hours
- Strategy/scope → invoke /gstack-plan-ceo-review
- Architecture → invoke /gstack-plan-eng-review
- Design system/plan review → invoke /gstack-design-consultation or /gstack-plan-design-review
- Full review pipeline → invoke /gstack-autoplan
- Bugs/errors → invoke /gstack-investigate
- QA/testing site behavior → invoke /gstack-qa or /gstack-qa-only
- Code review/diff check → invoke /gstack-review
- Visual polish → invoke /gstack-design-review
- Ship/deploy/PR → invoke /gstack-ship or /gstack-land-and-deploy
- Save progress → invoke /gstack-context-save
- Resume context → invoke /gstack-context-restore
- Security audit → invoke /gstack-cso
- Performance/benchmark → invoke /gstack-benchmark
- Documentation → invoke /gstack-document-generate or /gstack-document-release
- Retrospective → invoke /gstack-retro
- Scrape data → invoke /gstack-scrape
- Make PDF → invoke /gstack-make-pdf
- Browser testing/screenshots → invoke /gstack-browse
- Health check → invoke /gstack-health
- Deploy config → invoke /gstack-setup-deploy
- Post-deploy monitoring → invoke /gstack-canary
