---
id: EVAL-003
title: Discovery guard triggers correctly
archetype: N/A
size: N/A
difficulty: guard-logic
---

## Input — should trigger guard

```
/start "I'm not sure what to build. Maybe explore some auth options?"
```

```
/start "help me figure out the best database for our use case"
```

```
/start "let's experiment with different approaches to caching"
```

## Expected behavior

- Discovery guard: TRIGGERED for all three inputs
- Pipeline does NOT start
- Response shows warning block with options
- Awaits CTO reply

## Input — should NOT trigger guard

```
/start "build a Redis caching layer for our product API, TTL 5 minutes"
```

```
/start "prototype a JWT auth service, keep it simple"
```

```
/start "MVP for a SaaS dashboard: user login, one dashboard page, Stripe billing"
```

## Expected behavior for non-triggers

- Discovery guard: NOT triggered
- Type detection proceeds normally
- "prototype" and "MVP" with clear domain = proceed
- "MVP for SaaS dashboard" → commerce or web-service, medium or small

## Assertions (manual verification)
```
EVAL-003a: vague inputs → guard triggers → pipeline pauses ✓
EVAL-003b: clear inputs with prototype/MVP keyword → guard does NOT trigger ✓
EVAL-003c: CTO says "I know what to build" → pipeline resumes ✓
```

## Edge cases to verify manually
- "I want to explore GraphQL and then build an API" → should NOT trigger (has clear deliverable)
- "MVP" alone with no domain → should trigger
- "research and implement OAuth2" → should NOT trigger (implement is the deliverable)
