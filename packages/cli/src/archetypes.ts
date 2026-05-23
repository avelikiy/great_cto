// Archetype decision: detected stack → archetype recommendation.
// Mirrors great_cto's 13 archetypes in skills/great_cto/ARCHETYPES.md.

import type { DetectionResult } from "./detect.js";

export type Archetype =
  | "web-service"
  | "mobile-app"
  | "ai-system"
  | "agent-product"
  | "mlops"
  | "data-platform"
  | "streaming"
  | "infra"
  | "library"
  | "cli-tool"
  | "commerce"
  | "marketplace"
  | "fintech"
  | "healthcare"
  | "web3"
  | "iot-embedded"
  | "regulated"
  | "devtools"
  | "browser-extension"
  | "game"
  | "cms"
  | "enterprise-saas"
  | "edtech"
  | "gov-public"
  | "insurance"
  | "greenfield";

export interface ArchetypePick {
  primary: Archetype;
  confidence: "high" | "medium" | "low";
  rationale: string;
  alternatives: Archetype[];
  /** Suggested packs inferred from README/infra keywords when confidence is low/medium */
  suggestedPacks?: string[];
}

interface Rule {
  archetype: Archetype;
  score: (d: DetectionResult) => number;
  reason: (d: DetectionResult) => string;
}

// Rules are evaluated; highest score wins.
const RULES: Rule[] = [
  // ── browser-extension ─────────────────────────────
  // High priority: explicit MV3 manifest signal beats web-service / library
  {
    archetype: "browser-extension",
    score: (d) => (d.stack.includes("browser-extension") ? 8 : 0),
    reason: (_d) => "manifest.json with manifest_version detected — Chrome/Firefox/Edge extension",
  },

  // ── game ─────────────────────────────────────────
  // High priority: Unity / Unreal / Godot signals beat library
  {
    archetype: "game",
    score: (d) => {
      let s = 0;
      if (d.stack.includes("unity")) s += 8;
      if (d.stack.includes("unreal")) s += 8;
      if (d.stack.includes("godot")) s += 8;
      if (d.stack.includes("phaser")) s += 6;
      if (d.stack.includes("cocos")) s += 6;
      return s;
    },
    reason: (d) => {
      const bits: string[] = [];
      if (d.stack.includes("unity")) bits.push("Unity");
      if (d.stack.includes("unreal")) bits.push("Unreal");
      if (d.stack.includes("godot")) bits.push("Godot");
      if (d.stack.includes("phaser")) bits.push("Phaser");
      if (d.stack.includes("cocos")) bits.push("Cocos");
      return `game engine detected: ${bits.join(", ")} — netcode/anti-cheat/age-rating gates`;
    },
  },

  // ── devtools ─────────────────────────────────────
  // High priority: OpenAPI + multi-language SDK presence beats library
  {
    archetype: "devtools",
    score: (d) => {
      let s = 0;
      if (d.stack.includes("devtools-api")) s += 7;
      if (d.stack.includes("openapi-spec")) s += 8;
      if (d.stack.includes("graphql-schema")) s += 6;
      if (d.stack.includes("multi-sdk")) s += 4;
      if (d.stack.includes("stainless")) s += 4;
      if (d.stack.includes("docs-platform")) s += 2;
      return s;
    },
    reason: (d) => {
      const bits: string[] = [];
      if (d.stack.includes("openapi-spec")) bits.push("OpenAPI spec");
      if (d.stack.includes("graphql-schema")) bits.push("GraphQL schema");
      if (d.stack.includes("multi-sdk")) bits.push("multi-language SDKs");
      if (d.stack.includes("stainless")) bits.push("Stainless");
      return `developer-tools platform detected (${bits.join(", ")}) — API stability + SDK quality gates`;
    },
  },

  // ── commerce ─────────────────────────────────────
  {
    archetype: "commerce",
    score: (d) => {
      let s = 0;
      // Don't score commerce if fintech signals are stronger (Plaid etc.)
      if (d.stack.includes("plaid") || d.stack.includes("dwolla") || d.stack.includes("teller")) return 0;
      if (d.stack.includes("stripe")) s += 7;
      if (d.stack.includes("shopify")) s += 7;
      if (d.stack.includes("braintree")) s += 6;
      if (d.stack.includes("adyen")) s += 6;
      if (d.stack.includes("paddle")) s += 5;
      if (d.stack.includes("lemonsqueezy")) s += 5;
      // Add small bonus when paired with web framework (real e-commerce, not just SDK)
      if (s > 0 && (d.stack.includes("next.js") || d.stack.includes("nuxt") ||
                    d.stack.includes("remix") || d.stack.includes("sveltekit"))) s += 1;
      return s;
    },
    reason: (d) => {
      const payments: string[] = [];
      if (d.stack.includes("stripe")) payments.push("Stripe");
      if (d.stack.includes("shopify")) payments.push("Shopify");
      if (d.stack.includes("braintree")) payments.push("Braintree");
      if (d.stack.includes("adyen")) payments.push("Adyen");
      if (d.stack.includes("paddle")) payments.push("Paddle");
      return `payments SDK detected: ${payments.join(", ")} — PCI-DSS gate mandatory`;
    },
  },

  // ── web3 ─────────────────────────────────────────
  {
    archetype: "web3",
    score: (d) => {
      let s = 0;
      if (d.stack.includes("solidity")) s += 6;
      if (d.stack.includes("web3")) s += 4;
      return s;
    },
    reason: (_d) => "Solidity / smart-contract tooling detected — formal verification gate",
  },

  // ── iot-embedded ─────────────────────────────────
  {
    archetype: "iot-embedded",
    score: (d) => (d.stack.includes("embedded") ? 6 : 0),
    reason: (_d) => "platformio.ini / sdkconfig detected — embedded firmware archetype",
  },

  // ── agent-product (LLM + vector DB OR multi-agent framework) ────
  // Higher score than ai-system: this is an autonomous-agent product, not a wrapper
  {
    archetype: "agent-product",
    score: (d) => {
      const llms = ["anthropic-sdk", "openai-sdk", "google-ai", "aws-bedrock", "cohere"];
      const llmFrameworks = ["langchain", "llamaindex"];   // RAG-capable LLM frameworks
      const vdbs = ["pinecone", "weaviate", "chroma", "qdrant"];
      const agents = ["langgraph", "crewai", "autogen", "mastra", "mcp"];
      const hasLlm = llms.some((s) => d.stack.includes(s));
      const hasLlmFw = llmFrameworks.some((s) => d.stack.includes(s));
      const hasVdb = vdbs.some((s) => d.stack.includes(s));
      const hasAgentFw = agents.some((s) => d.stack.includes(s));
      let s = 0;
      // RAG-style agent: any LLM (raw SDK or framework) + vector DB
      if ((hasLlm || hasLlmFw) && hasVdb) s += 7;
      if (hasAgentFw) s += 6;                        // explicit agent framework
      if ((hasLlm || hasLlmFw) && hasAgentFw) s += 2; // bonus

      // Project-shape signals (agent-runtime archetypes that don't depend
      // on a specific framework — e.g. a deterministic local agent runtime
      // built from scratch). Each signal is weak; multiple together strong.
      const kws = d.readmeKeywords.map((k) => k.toLowerCase());
      const agentRuntimeKws = [
        "agent", "agent-runtime", "agent_runtime", "agentic",
        "tool-calling", "tool-use", "tool_use", "tool-registry",
        "planner", "agent-loop", "agent-runtime", "deterministic-agent",
        "plan-step", "planstep", "tool-allowlist", "agent-budget",
        "mcp-server", "mcp-client", "mcp",
      ];
      const matchedAgentKws = agentRuntimeKws.filter((k) => kws.includes(k));
      if (matchedAgentKws.length >= 3) s += 5;     // strong shape signal
      else if (matchedAgentKws.length === 2) s += 3;
      else if (matchedAgentKws.length === 1) s += 1;

      // Stack-name patterns: agent-runtime / agent-product (the user
      // explicitly named their library/package after agent or runtime).
      // Detected via signals — d.stack includes the package name as a token.
      const stackJoined = d.stack.join(" ").toLowerCase();
      if (/(?:^| )agent[-_](?:runtime|product|loop|kit|sdk)/.test(stackJoined)) s += 2;

      // Voice-AI agent: telephony provider + STT + TTS + LLM = autonomous voice agent
      const voiceProviders = ["twilio", "vonage", "livekit"];
      const sttProviders = ["deepgram"];
      const ttsProviders = ["elevenlabs", "hume"];
      const hasVoice = voiceProviders.some((s) => d.stack.includes(s));
      const hasStt = sttProviders.some((s) => d.stack.includes(s));
      const hasTts = ttsProviders.some((s) => d.stack.includes(s));
      if (hasVoice && hasLlm && (hasStt || hasTts)) s += 7;   // strong: full voice-agent stack
      else if (hasVoice && hasLlm) s += 4;                     // medium: voice + LLM

      return s;
    },
    reason: (d) => {
      const bits: string[] = [];
      if (d.stack.includes("langgraph")) bits.push("LangGraph");
      if (d.stack.includes("crewai")) bits.push("CrewAI");
      if (d.stack.includes("autogen")) bits.push("AutoGen");
      if (d.stack.includes("mastra")) bits.push("Mastra");
      if (d.stack.includes("mcp")) bits.push("MCP SDK");
      const vdb = ["pinecone","weaviate","chroma","qdrant"].filter((s) => d.stack.includes(s));
      if (vdb.length) bits.push(`vector DB (${vdb.join(",")})`);
      const voice = ["twilio","vonage","livekit","deepgram","elevenlabs","hume"].filter((s) => d.stack.includes(s));
      if (voice.length) bits.push(`voice stack (${voice.join(",")})`);
      return `agent-product detected — ${bits.join(", ") || "agent signals"} — agent-eval + isolation + prompt-injection gates required`;
    },
  },

  // ── ai-system ────────────────────────────────────
  // Lower score than agent-product: an LLM-using app without vector DB / agent FW
  {
    archetype: "ai-system",
    score: (d) => {
      let s = 0;
      if (d.stack.includes("anthropic-sdk")) s += 6;
      if (d.stack.includes("openai-sdk")) s += 5;
      if (d.stack.includes("google-ai")) s += 5;
      if (d.stack.includes("aws-bedrock")) s += 5;
      if (d.stack.includes("cohere")) s += 4;
      if (d.stack.includes("replicate")) s += 4;
      if (d.stack.includes("langchain")) s += 5;
      if (d.stack.includes("llamaindex")) s += 5;
      if (d.stack.includes("vercel-ai-sdk")) s += 5;
      if (d.stack.includes("ml")) s += 2;
      // Combo bonus: using multiple AI providers/frameworks together
      const aiCount = ["anthropic-sdk","openai-sdk","google-ai","aws-bedrock","cohere","replicate","langchain","llamaindex","vercel-ai-sdk"]
        .filter(x => d.stack.includes(x)).length;
      if (aiCount >= 2) s += 3;
      // Don't double-score if already an agent-product
      const agents = ["langgraph", "crewai", "autogen", "mastra", "mcp"];
      if (agents.some((a) => d.stack.includes(a))) s = Math.max(0, s - 2);
      const vdbs = ["pinecone","weaviate","chroma","qdrant"];
      const hasVdb = vdbs.some((v) => d.stack.includes(v));
      if (hasVdb) s = Math.max(0, s - 2);
      // Strong RAG signal — LangChain/LlamaIndex + VDB is almost certainly
      // an agent-product (RAG-style), not a generic ai-system. The +5 score
      // these frameworks contribute (above) is appropriate when there's no
      // VDB; with a VDB it overcounts. Apply an additional deduction so
      // agent-product wins the tie. See test "LangChain + Pinecone → agent-product".
      const hasLlmFw = ["langchain", "llamaindex"].some((s) => d.stack.includes(s));
      if (hasVdb && hasLlmFw) s = Math.max(0, s - 5);
      return s;
    },
    reason: (d) => {
      const bits: string[] = [];
      if (d.stack.includes("anthropic-sdk")) bits.push("Anthropic SDK");
      if (d.stack.includes("openai-sdk")) bits.push("OpenAI SDK");
      if (d.stack.includes("google-ai")) bits.push("Gemini");
      if (d.stack.includes("aws-bedrock")) bits.push("AWS Bedrock");
      if (d.stack.includes("langchain")) bits.push("LangChain");
      if (d.stack.includes("llamaindex")) bits.push("LlamaIndex");
      if (d.stack.includes("vercel-ai-sdk")) bits.push("Vercel AI SDK");
      if (d.stack.includes("ml")) bits.push("ML stack");
      return `AI/LLM tooling detected (${bits.join(", ")}) — prompt injection + output sanitization gates`;
    },
  },

  // ── fintech (Plaid, banking integrations) ────────
  {
    archetype: "fintech",
    score: (d) => {
      let s = 0;
      if (d.stack.includes("plaid")) s += 10;
      if (d.stack.includes("wise")) s += 9;
      if (d.stack.includes("dwolla")) s += 9;
      if (d.stack.includes("teller")) s += 9;
      if (d.stack.includes("fintech")) s += 7;
      // Emerging-markets payment providers
      if (d.stack.includes("razorpay")) s += 9;
      if (d.stack.includes("paystack")) s += 9;
      if (d.stack.includes("flutterwave")) s += 9;
      if (d.stack.includes("mercadopago")) s += 9;
      if (d.readmeKeywords.includes("fintech")) s += 2;
      return s;
    },
    reason: (d) => {
      const bits: string[] = [];
      if (d.stack.includes("plaid")) bits.push("Plaid");
      if (d.stack.includes("wise")) bits.push("Wise");
      if (d.stack.includes("dwolla")) bits.push("Dwolla");
      if (d.stack.includes("teller")) bits.push("Teller");
      if (d.stack.includes("razorpay")) bits.push("Razorpay (India)");
      if (d.stack.includes("paystack")) bits.push("Paystack (Nigeria)");
      if (d.stack.includes("flutterwave")) bits.push("Flutterwave (Africa)");
      if (d.stack.includes("mercadopago")) bits.push("MercadoPago (LATAM)");
      return `fintech integration: ${bits.join(", ")} — SOX, PCI, KYC/AML compliance gates`;
    },
  },

  // ── marketplace (two-sided platform — Stripe Connect / KYC) ────
  // Stronger than commerce when payouts to sellers + KYC providers detected
  {
    archetype: "marketplace",
    score: (d) => {
      let s = 0;
      if (d.stack.includes("stripe-connect")) s += 9;
      if (d.stack.includes("adyen-marketpay")) s += 9;
      if (d.stack.includes("persona")) s += 5;
      if (d.stack.includes("onfido")) s += 5;
      if (d.stack.includes("sumsub")) s += 5;
      if (d.readmeKeywords.includes("marketplace") || d.readmeKeywords.includes("two-sided")) s += 4;
      if (d.readmeKeywords.includes("seller") && d.readmeKeywords.includes("buyer")) s += 3;
      // Don't score if pure single-merchant commerce
      if (s > 0 && d.stack.includes("stripe") && !d.stack.includes("stripe-connect")) s += 1;
      return s;
    },
    reason: (d) => {
      const bits: string[] = [];
      if (d.stack.includes("stripe-connect")) bits.push("Stripe Connect");
      if (d.stack.includes("adyen-marketpay")) bits.push("Adyen MarketPay");
      if (d.stack.includes("persona") || d.stack.includes("onfido") || d.stack.includes("sumsub")) bits.push("KYC vendor");
      return `marketplace / two-sided platform (${bits.join(", ")}) — multi-party payouts + seller KYC + 1099-K + DSA`;
    },
  },

  // ── enterprise-saas (B2B multi-tenant, SSO/SAML/SCIM, audit) ──
  {
    archetype: "enterprise-saas",
    score: (d) => {
      let s = 0;
      if (d.stack.includes("workos")) s += 8;        // SSO/SCIM-as-a-service
      if (d.stack.includes("auth0")) s += 6;
      if (d.stack.includes("okta")) s += 6;
      if (d.stack.includes("clerk")) s += 4;
      if (d.stack.includes("samlify")) s += 6;
      if (d.stack.includes("passport-saml")) s += 6;
      if (d.stack.includes("scim")) s += 5;
      if (d.readmeKeywords.includes("multi-tenant") || d.readmeKeywords.includes("multitenant")) s += 4;
      if (d.readmeKeywords.includes("enterprise") || d.readmeKeywords.includes("b2b")) s += 3;
      if (d.readmeKeywords.includes("sso") || d.readmeKeywords.includes("saml")) s += 3;
      // Stripe billing + multi-tenant signals = SaaS
      if (s > 0 && d.stack.includes("stripe")) s += 1;
      return s;
    },
    reason: (d) => {
      const bits: string[] = [];
      if (d.stack.includes("workos")) bits.push("WorkOS");
      if (d.stack.includes("auth0")) bits.push("Auth0");
      if (d.stack.includes("okta")) bits.push("Okta");
      if (d.stack.includes("samlify") || d.stack.includes("passport-saml")) bits.push("SAML lib");
      if (d.stack.includes("scim")) bits.push("SCIM");
      return `enterprise B2B SaaS (${bits.join(", ")}) — multi-tenant isolation + SSO + audit log + SOC2 mandatory`;
    },
  },

  // ── mlops (model training & lifecycle, distinct from inference) ─
  {
    archetype: "mlops",
    score: (d) => {
      let s = 0;
      if (d.stack.includes("mlflow")) s += 7;
      if (d.stack.includes("wandb")) s += 6;
      if (d.stack.includes("dvc")) s += 6;
      if (d.stack.includes("kubeflow")) s += 7;
      if (d.stack.includes("bentoml")) s += 5;
      if (d.stack.includes("seldon")) s += 5;
      if (d.stack.includes("kserve")) s += 5;
      if (d.stack.includes("sagemaker")) s += 5;
      if (d.stack.includes("vertex-ai")) s += 5;
      if (d.stack.includes("ray")) s += 4;
      if (d.stack.includes("torch") || d.stack.includes("tensorflow")) s += 2;
      if (d.readmeKeywords.includes("training") && d.readmeKeywords.includes("model")) s += 3;
      // De-prioritize if pure inference (LLM API only)
      if (s > 0 && d.stack.includes("anthropic-sdk") && !d.stack.includes("torch") && !d.stack.includes("mlflow")) s -= 2;
      return s;
    },
    reason: (d) => {
      const bits: string[] = [];
      if (d.stack.includes("mlflow")) bits.push("MLflow");
      if (d.stack.includes("wandb")) bits.push("W&B");
      if (d.stack.includes("dvc")) bits.push("DVC");
      if (d.stack.includes("kubeflow")) bits.push("Kubeflow");
      if (d.stack.includes("bentoml")) bits.push("BentoML");
      if (d.stack.includes("torch")) bits.push("PyTorch");
      if (d.stack.includes("tensorflow")) bits.push("TensorFlow");
      return `MLOps stack detected (${bits.join(", ")}) — dataset versioning + drift detection + model registry + EU AI Act high-risk gates`;
    },
  },

  // ── streaming (event-driven / Kafka / Flink — distinct from batch data-platform) ─
  {
    archetype: "streaming",
    score: (d) => {
      let s = 0;
      if (d.stack.includes("kafkajs")) s += 7;
      if (d.stack.includes("kafka-node")) s += 6;
      if (d.stack.includes("rdkafka")) s += 7;
      if (d.stack.includes("kinesis")) s += 6;
      if (d.stack.includes("pulsar")) s += 6;
      if (d.stack.includes("flink")) s += 7;
      if (d.stack.includes("beam")) s += 6;
      if (d.stack.includes("debezium")) s += 7;
      if (d.stack.includes("nats")) s += 5;
      if (d.stack.includes("rabbitmq")) s += 4;
      if (d.readmeKeywords.includes("streaming") || d.readmeKeywords.includes("event-driven")) s += 2;
      if (d.readmeKeywords.includes("cdc") || d.readmeKeywords.includes("real-time")) s += 2;
      return s;
    },
    reason: (d) => {
      const bits: string[] = [];
      if (d.stack.includes("kafkajs") || d.stack.includes("rdkafka") || d.stack.includes("kafka-node")) bits.push("Kafka");
      if (d.stack.includes("kinesis")) bits.push("Kinesis");
      if (d.stack.includes("pulsar")) bits.push("Pulsar");
      if (d.stack.includes("flink")) bits.push("Flink");
      if (d.stack.includes("beam")) bits.push("Beam");
      if (d.stack.includes("debezium")) bits.push("Debezium CDC");
      return `streaming / event-driven stack (${bits.join(", ")}) — exactly-once + backpressure + DLQ + schema evolution gates`;
    },
  },

  // ── cms / content platform (headless CMS, publishing, SEO) ────
  {
    archetype: "cms",
    score: (d) => {
      let s = 0;
      if (d.stack.includes("sanity")) s += 9;
      if (d.stack.includes("contentful")) s += 9;
      if (d.stack.includes("strapi")) s += 9;
      if (d.stack.includes("payload")) s += 8;
      if (d.stack.includes("ghost")) s += 8;
      if (d.stack.includes("gatsby")) s += 5;
      if (d.stack.includes("eleventy")) s += 5;
      if (d.stack.includes("hugo")) s += 5;
      if (d.stack.includes("astro") && d.readmeKeywords.includes("blog")) s += 4;
      if (d.stack.includes("next.js") && d.readmeKeywords.includes("blog")) s += 3;
      if (d.readmeKeywords.includes("cms") || d.readmeKeywords.includes("publishing") || d.readmeKeywords.includes("blog")) s += 2;
      // De-prioritize if it's clearly an enterprise SaaS app
      if (s > 0 && (d.stack.includes("workos") || d.stack.includes("samlify"))) s -= 3;
      return s;
    },
    reason: (d) => {
      const bits: string[] = [];
      if (d.stack.includes("sanity")) bits.push("Sanity");
      if (d.stack.includes("contentful")) bits.push("Contentful");
      if (d.stack.includes("strapi")) bits.push("Strapi");
      if (d.stack.includes("payload")) bits.push("Payload");
      if (d.stack.includes("ghost")) bits.push("Ghost");
      if (d.stack.includes("gatsby")) bits.push("Gatsby");
      if (d.stack.includes("eleventy")) bits.push("Eleventy");
      if (d.stack.includes("hugo")) bits.push("Hugo");
      return `CMS / publishing stack (${bits.join(", ")}) — schema.org + Core Web Vitals + DMCA + UGC moderation gates`;
    },
  },

  // ── healthcare (FHIR/HL7/PHI) ───────────────────
  {
    archetype: "healthcare",
    score: (d) => {
      let s = 0;
      if (d.stack.includes("fhir")) s += 7;
      if (d.stack.includes("hl7")) s += 6;
      if (d.readmeKeywords.includes("healthcare")) s += 3;
      return s;
    },
    reason: (d) => {
      const bits: string[] = [];
      if (d.stack.includes("fhir")) bits.push("FHIR");
      if (d.stack.includes("hl7")) bits.push("HL7");
      return `healthcare data tooling: ${bits.join(", ")} — HIPAA/PHI handling gates required`;
    },
  },

  // ── regulated (compliance-first: DORA/NIS2/SOX/FedRAMP — not fintech/healthcare) ──
  {
    archetype: "regulated",
    score: (d) => {
      let s = 0;
      // Compliance automation SaaS installed → near-certain regulated industry
      if (d.stack.includes("compliance-automation")) s += 10;
      // Compliance documentation structure
      if (d.stack.includes("compliance-docs")) s += 7;
      // Audit log package
      if (d.stack.includes("audit-log")) s += 5;
      // README regulatory signals
      const kws = d.readmeKeywords;
      if (kws.includes("regulated")) s += 5;
      // FedRAMP / FISMA / CMMC → US federal regulated
      const fedSignals = ["fedramp", "fisma", "cmmc"];
      if (fedSignals.some((k) => kws.includes(k))) s += 8;
      // DORA ICT / NIS2 → EU regulated
      if (kws.includes("dora ict") || kws.includes("nis2")) s += 6;
      // SOX compliance (non-fintech context)
      if (kws.includes("sox compliance") || kws.includes("sarbanes")) {
        if (!d.stack.includes("plaid") && !d.stack.includes("fintech")) s += 5;
      }
      // Generic compliance/audit signals without stronger domain archetype
      if (kws.includes("compliance automation") || kws.includes("audit trail")) s += 4;
      if (kws.includes("iso 27001") || kws.includes("soc 2 type")) s += 3;
      // Hard exclude: fintech and healthcare have their own dedicated archetypes
      if (d.stack.includes("plaid") || d.stack.includes("wise") || d.stack.includes("fhir")) s = 0;
      return s;
    },
    reason: (d) => {
      const bits: string[] = [];
      if (d.stack.includes("compliance-automation")) bits.push("compliance automation (Vanta/Drata/Secureframe)");
      if (d.stack.includes("compliance-docs")) bits.push("ISMS/risk-register/compliance docs");
      if (d.stack.includes("audit-log")) bits.push("audit log package");
      const kws = d.readmeKeywords;
      if (kws.includes("regulated")) bits.push("regulated-industry README");
      if (kws.includes("fedramp")) bits.push("FedRAMP");
      if (kws.includes("fisma")) bits.push("FISMA");
      if (kws.includes("cmmc")) bits.push("CMMC");
      if (kws.includes("dora ict")) bits.push("DORA ICT");
      if (kws.includes("nis2")) bits.push("NIS2");
      if (kws.includes("sox compliance") || kws.includes("sarbanes")) bits.push("SOX");
      return `regulated-industry signals (${bits.join(", ")}) — DORA/NIS2/SOX/FedRAMP compliance gates required`;
    },
  },

  // ── cli-tool (explicit CLI: bin field + cli entry) ─
  {
    archetype: "cli-tool",
    score: (d) => {
      let s = 0;
      // Explicit cli marker from detect.ts (bin field present)
      if (d.stack.includes("cli")) s += 6;
      // Python CLI via [project.scripts] / console_scripts entry
      if (d.stack.includes("python-cli")) s += 7;
      if (d.codeStructure.hasCliEntry) s += 2;
      if (d.readmeKeywords.includes("cli")) s += 1;
      // Penalize if web framework present (CLI + web is rare)
      const webFw = ["next.js","express","fastify","nestjs","django","fastapi","flask","hono","koa"];
      if (webFw.some((w) => d.stack.includes(w))) s = Math.max(0, s - 4);
      return s;
    },
    reason: (_d) => "package.json bin field + CLI entry detected — argument-parsing, exit-code, --help gates",
  },

  // ── mobile-app ───────────────────────────────────
  {
    archetype: "mobile-app",
    score: (d) => {
      let s = 0;
      if (d.stack.includes("react-native")) s += 5;
      if (d.stack.includes("expo")) s += 5;
      if (d.stack.includes("ios")) s += 5;
      if (d.stack.includes("swift")) s += 3;
      return s;
    },
    reason: (d) => {
      const bits: string[] = [];
      if (d.stack.includes("react-native")) bits.push("React Native");
      if (d.stack.includes("expo")) bits.push("Expo");
      if (d.stack.includes("ios")) bits.push("iOS project");
      return `mobile framework detected: ${bits.join(", ")}`;
    },
  },

  // ── data-platform ────────────────────────────────
  {
    archetype: "data-platform",
    score: (d) => {
      let s = 0;
      if (d.stack.includes("data-pipeline")) s += 6;
      if (d.stack.includes("dbt")) s += 3;
      if (d.stack.includes("dagster")) s += 3;
      if (d.stack.includes("polars")) s += 2;
      if (d.stack.includes("iceberg")) s += 3;
      if (d.stack.includes("duckdb")) s += 2;
      if (d.readmeKeywords.includes("data")) s += 1;
      return s;
    },
    reason: (d) => {
      const bits: string[] = [];
      if (d.stack.includes("data-pipeline")) bits.push("pandas/airflow/prefect");
      if (d.stack.includes("dbt")) bits.push("dbt");
      if (d.stack.includes("dagster")) bits.push("dagster");
      return `data pipeline tooling: ${bits.join(", ") || "detected"}`;
    },
  },

  // ── infra ────────────────────────────────────────
  {
    archetype: "infra",
    score: (d) => {
      const hasTerraform = d.stack.includes("terraform");
      const hasHelm = d.stack.includes("helm");
      const hasK8s = d.stack.includes("kubernetes");
      // Require at least one explicit infra signal
      if (!hasTerraform && !hasHelm && !hasK8s) return 0;
      let s = 0;
      if (hasTerraform) s += 4;
      if (hasHelm) s += 4;
      if (hasK8s) s += 4;
      // Pure-infra repo (no app code) gets a small bonus
      if (!d.stack.includes("nodejs") && !d.stack.includes("python") && !d.stack.includes("go")) s += 2;
      return s;
    },
    reason: (d) => {
      const bits: string[] = [];
      if (d.stack.includes("terraform")) bits.push("Terraform");
      if (d.stack.includes("helm")) bits.push("Helm");
      if (d.stack.includes("kubernetes")) bits.push("Kustomize/K8s");
      return `infrastructure-as-code detected: ${bits.join(", ")}`;
    },
  },

  // ── web-service (default for web frameworks) ─────
  {
    archetype: "web-service",
    score: (d) => {
      let s = 0;
      const serverFrameworks = ["express", "fastify", "nestjs", "hono", "koa",
                                 "django", "fastapi", "flask", "gin", "echo", "chi"];
      const fullstackFw = ["next.js", "nuxt", "remix", "sveltekit", "astro"];
      const uiOnly = ["react", "vue", "angular", "svelte"];
      for (const fw of serverFrameworks) if (d.stack.includes(fw)) s += 3;
      for (const fw of fullstackFw) if (d.stack.includes(fw)) s += 4;
      // UI-only: weaker signal (could be a library)
      for (const fw of uiOnly) if (d.stack.includes(fw)) s += 1;
      if (s > 0) s += 1; // baseline web bonus

      // Code-structure boost
      if (d.codeStructure.hasRoutesDir) s += 2;
      if (d.codeStructure.hasServerEntry) s += 2;
      if (d.scripts.hasStart || d.scripts.hasDev) s += 1;

      // Penalize if explicitly a library (publishConfig/cli)
      if (d.stack.includes("library") && !d.codeStructure.hasRoutesDir && !d.codeStructure.hasServerEntry) {
        s = Math.max(0, s - 3);
      }
      return s;
    },
    reason: (d) => {
      const fw = d.stack.find((t) =>
        ["next.js", "express", "fastify", "nestjs", "hono", "koa",
         "django", "fastapi", "flask", "gin", "echo"].includes(t),
      );
      const extras: string[] = [];
      if (d.codeStructure.hasRoutesDir) extras.push("routes/");
      if (d.codeStructure.hasServerEntry) extras.push("server entry");
      return `web framework detected: ${fw ?? "unknown"}${extras.length ? " + " + extras.join(", ") : ""}`;
    },
  },

  // ── library (no app framework, just code) ────────
  // Strong signal: detect.ts marked "library" + no web/server structure
  {
    archetype: "library",
    score: (d) => {
      const isExplicitLib = d.stack.includes("library");
      const isExplicitCli = d.stack.includes("cli");
      // Don't claim library if web-service shape is obvious
      const looksLikeWebService = d.codeStructure.hasRoutesDir || d.codeStructure.hasServerEntry;
      if (looksLikeWebService) return 0;
      // Don't claim library if data-pipeline / ml signals dominate
      if (d.stack.includes("data-pipeline") || d.stack.includes("ml")) return 0;
      // Don't claim library if a domain-specific archetype is clearly present
      const domainSignals = ["plaid","wise","dwolla","fhir","hl7","stripe","shopify","solidity",
                              "embedded","unity","unreal","godot","react-native","expo"];
      if (domainSignals.some((s) => d.stack.includes(s))) return 0;

      if (isExplicitLib && !isExplicitCli) return 7;
      if (isExplicitLib && isExplicitCli) return 4; // cli-tool rule will outscore

      // Weaker signal: plain runtime + no app framework
      const hasApp = d.stack.some((t) =>
        ["next.js", "django", "fastapi", "flask", "express", "fastify", "nestjs", "hono",
         "react-native", "expo", "tauri", "capacitor", "flutter",
         "terraform", "pulumi", "aws-cdk", "helm",
         "embedded", "zephyr", "esp-idf",
         "browser-extension", "unity", "unreal", "godot", "phaser", "cocos"].includes(t),
      );
      if (hasApp) return 0;
      if (d.stack.includes("nodejs") || d.stack.includes("python") || d.stack.includes("go") || d.stack.includes("rust")) {
        return 2;
      }
      return 0;
    },
    reason: (d) => {
      if (d.stack.includes("library")) {
        return "package.json/pyproject/Cargo.toml indicates a publishable library";
      }
      return "no web/mobile/infra framework detected — looks like a library/SDK";
    },
  },

  // ── edtech (education technology — COPPA / FERPA / WCAG-AA child safety) ──
  // Distinct from cms (general content) and healthcare (PHI). Drives age-gate,
  // parental-consent, and accessibility patterns.
  {
    archetype: "edtech",
    score: (d) => {
      let s = 0;
      const lmsLibs = ["canvas-lms", "moodle-api", "schoology-sdk", "blackboard-rest",
                       "google-classroom", "khan-academy-cli", "learnosity",
                       "kahoot-api", "h5p", "scorm", "lti", "lti-1.3"];
      lmsLibs.forEach((l) => { if (d.stack.includes(l)) s += 6; });

      // Auth/identity providers commonly used in edtech
      if (d.stack.includes("clever-sdk")) s += 6;
      if (d.stack.includes("classlink-sso")) s += 4;

      const kws = d.readmeKeywords;
      const eduKeywords = ["student", "classroom", "teacher", "k-12", "k12",
                           "lms", "learning management", "grade book", "gradebook",
                           "enrollment", "transcript", "pupil", "tutoring", "edtech"];
      const matchedKws = eduKeywords.filter((k) => kws.includes(k));
      if (matchedKws.length >= 2) s += 5;
      else if (matchedKws.length === 1) s += 2;

      // Strong signal: COPPA / FERPA explicitly mentioned
      if (kws.includes("coppa") || kws.includes("ferpa")) s += 6;
      if (kws.includes("parental consent") || kws.includes("age gate")) s += 4;

      return s;
    },
    reason: (d) => {
      const kws = d.readmeKeywords;
      const bits: string[] = [];
      const lmsLibs = ["canvas-lms", "moodle-api", "schoology-sdk", "google-classroom", "lti", "scorm"];
      lmsLibs.forEach((l) => { if (d.stack.includes(l)) bits.push(l); });
      if (kws.includes("coppa")) bits.push("COPPA mention");
      if (kws.includes("ferpa")) bits.push("FERPA mention");
      if (kws.includes("k-12") || kws.includes("k12")) bits.push("K-12 keyword");
      if (kws.includes("student")) bits.push("student-data keyword");
      return `edtech detected (${bits.join(", ") || "education domain signals"}) — COPPA/FERPA/WCAG-AA child-safety gates required`;
    },
  },

  // ── gov-public (government / civic-tech — FedRAMP / NIST 800-53 / Section 508) ──
  // Severe regulatory burden. Distinct from regulated (which is more EU-focused
  // DORA/NIS2). gov-public targets US federal/state + UK gov.uk patterns.
  {
    archetype: "gov-public",
    score: (d) => {
      let s = 0;
      const govLibs = ["login-gov-sdk", "id-me-sdk", "idme-sdk",
                       "usds-design-system", "uswds", "uk-gov-design-system",
                       "gov-uk-frontend", "verify-gov-uk",
                       "usajobs-sdk", "data-gov", "irs-modernized-efile"];
      govLibs.forEach((l) => { if (d.stack.includes(l)) s += 6; });

      const kws = d.readmeKeywords;
      const govKeywords = ["fedramp", "fisma", "nist 800-53", "nist-800-53",
                           "section 508", "section-508", "ato", "civic tech",
                           "government", "municipal", "federal", "agency",
                           "gov.uk", "usds", "data.gov", "usa.gov", "irs", "ssa",
                           "department of", "stateramp", "cjis"];
      const matchedKws = govKeywords.filter((k) => kws.includes(k));
      if (matchedKws.length >= 2) s += 6;
      else if (matchedKws.length === 1) s += 3;

      // Very strong signals
      if (kws.includes("fedramp") || kws.includes("fisma")) s += 4;
      if (kws.includes("section 508") || kws.includes("section-508")) s += 3;
      if (kws.includes("ato")) s += 3;

      return s;
    },
    reason: (d) => {
      const kws = d.readmeKeywords;
      const bits: string[] = [];
      if (d.stack.includes("login-gov-sdk")) bits.push("login.gov");
      if (d.stack.includes("usds-design-system") || d.stack.includes("uswds")) bits.push("USWDS");
      if (d.stack.includes("uk-gov-design-system") || d.stack.includes("gov-uk-frontend")) bits.push("gov.uk Design System");
      if (kws.includes("fedramp")) bits.push("FedRAMP mention");
      if (kws.includes("nist-800-53") || kws.includes("nist 800-53")) bits.push("NIST 800-53 mention");
      if (kws.includes("section 508") || kws.includes("section-508")) bits.push("Section 508 mention");
      return `gov-public detected (${bits.join(", ") || "government domain signals"}) — FedRAMP/NIST 800-53/Section 508 gates required`;
    },
  },

  // ── insurance (insurtech — NAIC / Solvency II / actuarial / claims fraud) ──
  // Fintech-adjacent but distinct: multi-state filings, anti-discrimination
  // pricing, actuarial model auditability, claims fraud detection.
  {
    archetype: "insurance",
    score: (d) => {
      let s = 0;
      const insuranceLibs = ["acord-standards", "naic-schemas", "drools-rules",
                             "solvency2-calc", "openexposure", "ms-actuarial",
                             "lloyds-vendor-api", "verisk-sdk", "ccc-one-sdk",
                             "guidewire-cloud", "duck-creek", "majesco-sdk",
                             "ebix", "aplus-pas"];
      insuranceLibs.forEach((l) => { if (d.stack.includes(l)) s += 6; });

      const kws = d.readmeKeywords;
      const insuranceKeywords = ["policy", "underwriting", "premium", "claim",
                                 "actuarial", "reinsurance", "naic", "solvency",
                                 "broker", "carrier", "mga", "mgu", "tpa",
                                 "insurance", "insurtech", "insurer", "insured",
                                 "deductible", "coverage", "bordereau"];
      const matchedKws = insuranceKeywords.filter((k) => kws.includes(k));
      if (matchedKws.length >= 3) s += 6;
      else if (matchedKws.length === 2) s += 3;
      else if (matchedKws.length === 1) s += 1;

      // Very strong signals — NAIC/Solvency/IFRS 17 explicit
      if (kws.includes("naic") || kws.includes("solvency ii") || kws.includes("solvency-ii")) s += 5;
      if (kws.includes("ifrs 17") || kws.includes("ifrs-17")) s += 4;
      if (kws.includes("insurtech")) s += 4;

      // Don't double-score: if also matches commerce/fintech, subtract
      // since insurance is distinct domain (not generic fintech)
      if (d.stack.includes("stripe") && !insuranceLibs.some((l) => d.stack.includes(l))) {
        s = Math.max(0, s - 2);
      }

      return s;
    },
    reason: (d) => {
      const kws = d.readmeKeywords;
      const bits: string[] = [];
      const insuranceLibs = ["acord-standards", "naic-schemas", "guidewire-cloud", "duck-creek", "majesco-sdk"];
      insuranceLibs.forEach((l) => { if (d.stack.includes(l)) bits.push(l); });
      if (kws.includes("naic")) bits.push("NAIC mention");
      if (kws.includes("solvency ii") || kws.includes("solvency-ii")) bits.push("Solvency II mention");
      if (kws.includes("actuarial")) bits.push("actuarial keyword");
      if (kws.includes("underwriting")) bits.push("underwriting keyword");
      if (kws.includes("insurtech")) bits.push("insurtech keyword");
      return `insurance detected (${bits.join(", ") || "insurance domain signals"}) — NAIC/Solvency II/actuarial-audit gates required`;
    },
  },
];

// Tie-break priority — when two rules score equally, prefer the one
// higher in this list (more specific / domain-bound first).
const TIE_BREAK_PRIORITY: Archetype[] = [
  "browser-extension", "iot-embedded", "web3", "game",
  "agent-product", "fintech", "insurance", "healthcare", "edtech", "gov-public", "marketplace",
  "mlops", "streaming",
  "commerce", "enterprise-saas", "ai-system", "devtools",
  "data-platform", "cms", "infra", "mobile-app",
  "regulated", "cli-tool", "web-service", "library", "greenfield",
];

function priorityIndex(a: Archetype): number {
  const i = TIE_BREAK_PRIORITY.indexOf(a);
  return i < 0 ? TIE_BREAK_PRIORITY.length : i;
}

export function pickArchetype(d: DetectionResult): ArchetypePick {
  const scored = RULES
    .map((r) => ({ archetype: r.archetype, score: r.score(d), reason: r.reason(d) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return priorityIndex(a.archetype) - priorityIndex(b.archetype);
    });

  if (scored.length === 0) {
    return {
      primary: "greenfield",
      confidence: "low",
      rationale: "no strong signals detected — treating as greenfield project",
      alternatives: [],
    };
  }

  const top = scored[0]!;
  const nextBest = scored[1]?.score ?? 0;
  const gap = top.score - nextBest;
  // Confidence: high when score≥6 and gap≥3; medium ≥4; else low
  const confidence: ArchetypePick["confidence"] =
    top.score >= 6 && gap >= 3 ? "high" :
    top.score >= 4 && gap >= 1 ? "medium" : "low";

  // Dedupe alternatives, keep top 3
  const seen = new Set<Archetype>([top.archetype]);
  const alternatives: Archetype[] = [];
  for (const r of scored.slice(1)) {
    if (!seen.has(r.archetype)) {
      seen.add(r.archetype);
      alternatives.push(r.archetype);
      if (alternatives.length >= 3) break;
    }
  }

  // ── Pack hints for low/medium confidence or niche stacks ────────────────
  // Surfaces domain-specific packs that the archetype alone doesn't capture.
  const suggestedPacks = confidence !== "high"
    ? inferPackHints(d)
    : inferPackHints(d).filter((p) => isNichePack(p)); // always surface niche packs

  return {
    primary: top.archetype,
    confidence,
    rationale: top.reason,
    alternatives,
    ...(suggestedPacks.length > 0 ? { suggestedPacks } : {}),
  };
}

/** Niche packs that should surface even at high confidence */
function isNichePack(pack: string): boolean {
  return ["robotics-pack", "climate-pack", "drug-discovery-pack",
          "clinical-trials-pack", "em-fintech-pack"].includes(pack);
}

/**
 * Infer likely domain packs from README/infra keywords when the archetype
 * scorer doesn't have a dedicated high-confidence rule for the domain.
 */
function inferPackHints(d: DetectionResult): string[] {
  const hints: string[] = [];
  const kws = new Set([...d.readmeKeywords, ...(d.infraKeywords ?? [])]);
  const has = (...terms: string[]) => terms.some((t) => kws.has(t));

  if (has("robot", "ros2", "ros 2", "cobot", "drone", "uav")) hints.push("robotics-pack");
  if (has("carbon", "ghg", "mrv", "emission", "verra", "sbti")) hints.push("climate-pack");
  if (has("clinical", "ctms", "edc", "cdisc", "randomization", "irb")) hints.push("clinical-trials-pack");
  if (has("drug discovery", "binding affinity", "admet", "chembl", "alphafold")) hints.push("drug-discovery-pack");
  if (has("recruit", "hiring", "candidate", "ats", "aedt")) hints.push("hr-ai-pack");
  if (has("loan", "lending", "bnpl", "underwrit", "fcra")) hints.push("lending-pack");
  if (has("voice", "telephony", "ivr", "stt", "tts", "outbound call")) hints.push("voice-pack");
  if (has("india", "upi", "rbi", "mpesa", "gcash", "pix", "cross-border", "remittance")) hints.push("em-fintech-pack");
  if (has("public api", "api key", "developer portal", "openapi")) hints.push("api-platform-pack");

  return hints;
}

// Compliance hints — auto-suggested based on stack and README.
export function suggestCompliance(d: DetectionResult, archetype: Archetype): string[] {
  const c = new Set<string>();

  // ── archetype defaults ───────────────────────────
  if (archetype === "commerce") { c.add("pci-dss"); c.add("gdpr"); }
  if (archetype === "fintech") { c.add("pci-dss"); c.add("sox"); c.add("kyc-aml"); c.add("gdpr"); }
  if (archetype === "healthcare") { c.add("hipaa"); c.add("gdpr"); c.add("hitech"); }
  if (archetype === "ai-system" || archetype === "agent-product") {
    c.add("eu-ai-act");
    // Add OWASP LLM only if it's truly an agent product
    if (archetype === "agent-product") c.add("owasp-llm-top-10");
  }
  if (archetype === "web3") { c.add("soc2"); }
  if (archetype === "iot-embedded") { c.add("iso27001"); c.add("etsi-en-303-645"); }
  if (archetype === "browser-extension") { c.add("csp"); c.add("mv3-security"); c.add("gdpr"); }
  if (archetype === "game") { c.add("coppa"); c.add("age-rating"); c.add("accessibility"); }
  if (archetype === "devtools") { c.add("openssf"); c.add("api-stability"); c.add("soc2-type-2"); c.add("gdpr"); }
  if (archetype === "regulated") {
    c.add("iso27001"); c.add("gdpr"); c.add("compliance-required");
    // FedRAMP/CMMC if US federal signals present
    const kws = d.readmeKeywords;
    if (kws.includes("fedramp") || kws.includes("fisma") || kws.includes("cmmc")) c.add("fedramp");
    if (kws.includes("dora ict") || kws.includes("nis2")) { c.add("dora-ict"); c.add("nis2"); }
    if (kws.includes("sox compliance") || kws.includes("sarbanes")) c.add("sox");
  }
  if (archetype === "web-service") c.add("gdpr"); // baseline for user data
  if (archetype === "cli-tool") { /* CLI tools usually don't have compliance load */ }
  if (archetype === "marketplace") {
    c.add("pci-dss"); c.add("kyc-aml"); c.add("gdpr");
    c.add("dsa-eu"); c.add("p2b-eu"); c.add("1099-k");
  }
  if (archetype === "enterprise-saas") {
    c.add("soc2-type-2"); c.add("iso27001"); c.add("gdpr"); c.add("ccpa");
  }
  if (archetype === "mlops") {
    c.add("eu-ai-act"); c.add("nist-ai-rmf"); c.add("iso42001");
  }
  if (archetype === "streaming") {
    c.add("gdpr"); // event retention rules
  }
  if (archetype === "cms") {
    c.add("dmca"); c.add("wcag-2.2"); c.add("gdpr"); c.add("dsa-eu");
  }
  if (archetype === "edtech") {
    c.add("coppa"); c.add("ferpa"); c.add("gdpr-k");
    c.add("wcag-2.2-aa"); c.add("section-508");
    // State student-privacy laws
    c.add("sopipa-ca");
  }
  if (archetype === "gov-public") {
    c.add("fedramp"); c.add("nist-800-53"); c.add("fisma");
    c.add("section-508"); c.add("pia");
    // CJIS only if law-enforcement keywords present
    const kws = d.readmeKeywords;
    if (kws.includes("cjis") || kws.includes("law enforcement") || kws.includes("criminal justice")) {
      c.add("cjis");
    }
    // StateRAMP if state-level
    if (kws.includes("stateramp") || kws.includes("state government")) c.add("stateramp");
    c.add("ato"); // Authority to Operate
  }
  if (archetype === "insurance") {
    c.add("naic"); c.add("solvency-ii"); c.add("ifrs-17");
    c.add("gdpr"); c.add("ccpa");
    c.add("anti-discrimination-pricing"); c.add("actuarial-asops");
    c.add("state-doi"); // Department of Insurance per US state
  }

  // ── stack-derived (cross-archetype) ──────────────
  if (d.stack.includes("stripe") || d.stack.includes("braintree") ||
      d.stack.includes("adyen") || d.stack.includes("paddle")) {
    c.add("pci-dss");
  }
  if (d.stack.includes("plaid") || d.stack.includes("dwolla") ||
      d.stack.includes("teller") || d.stack.includes("wise")) {
    c.add("kyc-aml");
    c.add("sox");
  }
  if (d.stack.includes("fhir") || d.stack.includes("hl7")) {
    c.add("hipaa");
    c.add("hitech");
  }

  // ── README-derived ───────────────────────────────
  if (d.readmeKeywords.includes("regulated")) c.add("compliance-required");
  if (d.readmeKeywords.includes("healthcare")) c.add("hipaa");
  if (d.readmeKeywords.includes("fintech")) c.add("sox");

  return Array.from(c).sort();
}

// ─────────────────────────────────────────────────────────────────────────
// Typed archetype → pipeline configuration
// ─────────────────────────────────────────────────────────────────────────
//
// Single source of truth for "which agents review which archetype" and
// "which human gates fire for which archetype at which project size".
// Previously this lived only in agent prompts — making the connection
// invisible to code and impossible to verify in tests. See
// docs/analysis/2026-05-14-pipeline-gaps.md (gaps A3 + G4) for the
// rationale.

export type ProjectSize = "nano" | "small" | "medium" | "large" | "enterprise";

export type StandardGate =
  | "plan"        // after architect, before senior-dev
  | "arch"        // alt to plan (strict mode)
  | "code"        // after senior-dev (rare)
  | "qa"          // after qa-engineer
  | "security"    // after security-officer
  | "compliance"  // for regulated/fintech/healthcare
  | "ship"        // final go/no-go
  | "cost"        // AI archetypes — forecast burn approval (gap G2 closure)
  | "oracle-review"     // web3 — added per gap G1
  | "edtech-review"     // edtech
  | "gov-review"        // gov-public
  | "insurance-review"; // insurance

/**
 * Which review agents fire for each archetype. The reviewer name maps to
 * `agents/<name>.md` in the great_cto plugin. Naming aliases exist for
 * historical reasons (pci-reviewer covers fintech, firmware-reviewer
 * covers iot-embedded, etc.) — documented in
 * docs/agents/REVIEWER-NAMING.md (gap A2 closure).
 *
 * `greenfield` has no reviewers — pipeline runs in nano mode only.
 */
export const REVIEWERS_BY_ARCHETYPE: Record<Archetype, string[]> = {
  "web-service":       ["security-officer"],
  "mobile-app":        ["mobile-store-reviewer", "security-officer"],
  "ai-system":         ["ai-security-reviewer", "ai-prompt-architect", "ai-eval-engineer"],
  "agent-product":     ["ai-security-reviewer", "ai-prompt-architect", "ai-eval-engineer"],
  "mlops":             ["mlops-reviewer", "ai-security-reviewer"],
  "data-platform":     ["data-platform-reviewer"],
  "streaming":         ["streaming-reviewer"],
  "infra":             ["infra-reviewer"],
  "library":           ["library-reviewer"],
  "cli-tool":          ["cli-reviewer"],
  "commerce":          ["pci-reviewer", "security-officer"],
  "marketplace":       ["marketplace-reviewer", "pci-reviewer"],
  "fintech":           ["pci-reviewer", "regulated-reviewer"],
  "healthcare":        ["healthcare-reviewer", "security-officer"],
  "web3":              ["oracle-reviewer"],
  "iot-embedded":      ["firmware-reviewer"],
  "regulated":         ["regulated-reviewer"],
  "devtools":          ["devtools-reviewer"],
  "browser-extension": ["web-store-reviewer"],
  "game":              ["game-reviewer"],
  "cms":               ["cms-reviewer"],
  "enterprise-saas":   ["enterprise-saas-reviewer"],
  "edtech":            ["edtech-reviewer"],
  "gov-public":        ["gov-reviewer", "security-officer"],
  "insurance":         ["insurance-reviewer", "regulated-reviewer"],
  "greenfield":        [],
};

/**
 * Which human gates the pipeline opens for each archetype at the medium
 * project_size. Smaller sizes skip gates (see `gatesFor()` below); larger
 * sizes may add compliance.
 *
 * NOTE: nano → only [plan]. Enterprise → always adds compliance.
 */
export const GATES_BY_ARCHETYPE: Record<Archetype, StandardGate[]> = {
  "web-service":       ["plan", "qa", "ship"],
  "mobile-app":        ["plan", "qa", "ship"],
  "ai-system":         ["plan", "cost", "qa", "security", "ship"],
  "agent-product":     ["plan", "cost", "qa", "security", "ship"],
  "mlops":             ["plan", "cost", "qa", "security", "ship"],
  "data-platform":     ["plan", "qa", "ship"],
  "streaming":         ["plan", "qa", "ship"],
  "infra":             ["plan", "qa", "ship"],
  "library":           ["plan", "qa", "ship"],
  "cli-tool":          ["plan", "qa", "ship"],
  "commerce":          ["plan", "qa", "security", "ship", "compliance"],
  "marketplace":       ["plan", "qa", "security", "ship", "compliance"],
  "fintech":           ["plan", "qa", "security", "ship", "compliance"],
  "healthcare":        ["plan", "qa", "security", "ship", "compliance"],
  "web3":              ["plan", "qa", "oracle-review", "security", "ship"],
  "iot-embedded":      ["plan", "qa", "security", "ship"],
  "regulated":         ["plan", "qa", "security", "ship", "compliance"],
  "devtools":          ["plan", "qa", "ship"],
  "browser-extension": ["plan", "qa", "ship"],
  "game":              ["plan", "qa", "ship"],
  "cms":               ["plan", "qa", "ship"],
  "enterprise-saas":   ["plan", "qa", "security", "ship", "compliance"],
  "edtech":            ["plan", "qa", "edtech-review", "security", "ship", "compliance"],
  "gov-public":        ["plan", "qa", "gov-review", "security", "ship", "compliance"],
  "insurance":         ["plan", "qa", "insurance-review", "security", "ship", "compliance"],
  "greenfield":        ["plan"],
};

/**
 * Returns the subset of gates the pipeline will actually open for a
 * given archetype + project_size. Used by the orchestrator before
 * opening any gate to skip unnecessary human checkpoints on smaller
 * projects (e.g. nano always skips QA).
 */
export function gatesFor(archetype: Archetype, size: ProjectSize): StandardGate[] {
  const all = GATES_BY_ARCHETYPE[archetype] ?? [];
  if (size === "nano") return all.filter((g) => g === "plan");
  if (size === "small") return all.filter((g) => g === "plan" || g === "ship");
  if (size === "medium") return all;
  // large + enterprise → ensure compliance is included
  return all.includes("compliance") ? all : [...all, "compliance"];
}

/**
 * Returns the ordered list of reviewers for an archetype. Empty for
 * `greenfield`. Used by the orchestrator to spawn the right
 * archetype-specific review stages after senior-dev.
 */
export function reviewersFor(archetype: Archetype): string[] {
  return REVIEWERS_BY_ARCHETYPE[archetype] ?? [];
}
