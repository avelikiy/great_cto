# AI Domain Pack

> Extends `ai-system` archetype with domain-specific depth for voice agents, multimodal apps, RAG systems, LLM ops, ML training/serving, and computer vision.
> Loaded when `packs: [ai-pack]` is in PROJECT.md or auto-loaded for `ai-system` archetype.

## QA Extras Reference

Each `qa-extras` value below adds specific checks to qa-engineer's test plan.

### `wer` — Word Error Rate (voice-agent)
- **What**: Measure ASR accuracy on domain-specific vocabulary
- **Tool**: Compare ASR transcript vs reference transcript
- **Threshold**: WER ≤ 5% on domain vocab, WER ≤ 10% on general speech
- **Edge inputs**: accented speech, background noise (cafe, car, street), low-bandwidth audio

### `ttfb` — Time to First Byte (voice-agent)
- **What**: Latency from user speech end to first audio response byte
- **Tool**: Measure via WebSocket timestamp delta or telephony CDR
- **Threshold**: TTFB ≤ 300ms p95, end-to-end turn latency ≤ 800ms p95
- **Edge inputs**: long utterances (>10s), rapid back-to-back turns

### `barge-in` — Interruption Handling (voice-agent)
- **What**: Test that user can interrupt agent mid-response and agent handles gracefully
- **Tool**: Send interrupt signal at random points during agent speech
- **Threshold**: Correct barge-in handling ≥ 95% of interruptions
- **Edge inputs**: partial words, background noise mistaken as interrupt

### `dtmf-fallback` — Touch-tone Fallback (voice-agent)
- **What**: Test DTMF digit recognition for menu navigation fallback
- **Tool**: Send DTMF tones via telephony test harness
- **Threshold**: 100% digit recognition accuracy, menu navigation correct

### `concurrent-calls` — Load Test (voice-agent)
- **What**: Test system under target concurrent call volume × 2
- **Tool**: Load test harness (k6 + WebSocket or SIPp for telephony)
- **Threshold**: No call drops, latency within SLA at 2× target volume

### `retrieval-quality` — RAG Retrieval (rag-system)
- **What**: Measure retrieval relevance and coverage
- **Tool**: Eval suite with known query-document pairs
- **Threshold**: Recall@10 ≥ 0.7, precision@5 ≥ 0.6, no hallucinated sources
- **Edge inputs**: ambiguous queries, out-of-scope queries (should return "I don't know")

### `prompt-regression` — Prompt Quality (llm-ops)
- **What**: Detect quality degradation after prompt changes
- **Tool**: Run eval suite before and after prompt change
- **Threshold**: Score drop ≤ 2% vs baseline on all eval dimensions
- **Compare**: before-prompt eval → after-prompt eval, dimension by dimension

### `cost-cap` — Cost Control (llm-ops, ai-agent)
- **What**: Verify per-request and per-session cost stays within budget
- **Tool**: Log token usage per request, compute cost at model pricing
- **Threshold**: Per-request cost ≤ PROJECT.md `cost-cap:` value, per-session ≤ 10× per-request

### `per-modality-accuracy` — Per-Modality Eval (multimodal-app)
- **What**: Test each input modality independently
- **Tool**: Separate eval sets for text, image, audio inputs
- **Threshold**: Each modality ≥ baseline from PROJECT.md, no modality >10% below others

### `hallucination` — Factual Accuracy (multimodal-app, rag-system, llm-ops)
- **What**: Detect fabricated information in model outputs
- **Tool**: Eval set with known-answer queries + adversarial prompts
- **Threshold**: Hallucination rate ≤ 2% on factual eval set

### `cross-modal` — Cross-Modal Consistency (multimodal-app)
- **What**: Same query via different modalities should produce coherent responses
- **Tool**: Submit identical queries as text, image, and audio; compare outputs
- **Threshold**: Semantic similarity ≥ 0.85 across modalities for equivalent queries

### `tool-injection` — Tool Argument Safety (mcp-server)
- **What**: Test that tool arguments cannot be manipulated via prompt injection
- **Tool**: Adversarial inputs containing shell commands, SQL, path traversal
- **Threshold**: 0 successful injections

### `schema-enforcement` — Schema Validation (mcp-server)
- **What**: Verify all tool calls conform to declared JSON schemas
- **Tool**: Fuzz tool arguments with invalid types, missing fields, extra fields
- **Threshold**: 100% schema violations rejected, 0 false rejections on valid input

### `bias-audit` — Bias/Fairness (ml-training, ml-serving, computer-vision)
- **What**: Check model for disparate impact across protected groups
- **Tool**: Evaluate model predictions across demographic slices
- **Threshold**: Disparate impact ratio ≥ 0.8, equal opportunity difference ≤ 0.1
- **Report**: Include in model card

### `model-card` — Model Documentation (ml-training, ml-serving, computer-vision, recommendation-engine)
- **What**: Mandatory model documentation
- **Required fields**: model details, intended use, training data summary, quantitative analysis, ethical considerations, limitations
- **Where**: `docs/model-cards/MODEL-CARD-<name>.md`

### `drift-monitoring` — Production Drift (ml-serving)
- **What**: Detect data/concept drift in production
- **Tool**: Statistical comparison of input distribution vs training distribution
- **Threshold**: Alert on KL divergence > 0.1 or PSI > 0.2
- **SLA**: Alert within 15 minutes of drift detection

### `data-poisoning` — Training Data Integrity (ml-training)
- **What**: Check training data for poisoning vectors
- **Tool**: Outlier detection on training set, label consistency check
- **Threshold**: 0 known poisoning patterns detected

## Compliance Extras

### `eu-ai-act` — EU AI Act Annex III Check
1. Classify system: is it high-risk per Annex III? (biometric, education, employment, credit, law enforcement, migration, justice)
2. If high-risk: conformity assessment required + register in EU AI database before deploy
3. Document in `docs/compliance/EU-AI-ACT-classification.md`
4. Mandatory regardless of risk level: transparency obligations (users must know they're interacting with AI)

### `tcpa` — Telephone Consumer Protection Act (US)
1. Prior express written consent for recorded/automated calls
2. Opt-out mechanism within 10 days of request
3. No autodial to mobile without consent
4. Call recording notice per jurisdiction (1-party vs 2-party consent states)
5. Document consent flow in `docs/compliance/TCPA-consent.md`

### `gdpr-biometric` — GDPR Article 9 (Voice as Biometric)
1. If voice is used for identification (not just communication): explicit consent required
2. DPIA mandatory before processing
3. Data minimization: don't store voice data longer than needed
4. Right to erasure: must be able to delete all voice recordings per user
5. Document in `docs/compliance/GDPR-biometric-DPIA.md`
