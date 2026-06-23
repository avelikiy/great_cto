// Stack detection: scan cwd for technology signals.
// Zero-dependency — pure file reads + JSON parse.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface DetectionResult {
  stack: string[];           // e.g. ["typescript", "next.js", "postgres"]
  languages: string[];       // e.g. ["typescript", "javascript"]
  signals: Record<string, string[]>; // signal name → matched files
  packageManager: "npm" | "pnpm" | "yarn" | "bun" | null;
  hasTests: boolean;
  hasCI: boolean;
  hasExistingGreatCto: boolean;
  // Wave 1: code-structure + scripts hints
  codeStructure: {
    hasRoutesDir: boolean;       // routes/, app/, pages/, src/api/
    hasCliEntry: boolean;        // bin/, src/cli.ts, cmd/
    hasPublicHtml: boolean;      // public/index.html
    hasServerEntry: boolean;     // server.ts/js, app.ts/js, index has http listen
    hasMonorepo: boolean;        // pnpm-workspace.yaml, lerna.json, nx.json, turbo.json
  };
  // Wave 1: npm-scripts heuristics
  scripts: {
    hasStart: boolean;
    hasDev: boolean;
    hasBuild: boolean;
    hasPublish: boolean;
  };
  // Wave 3: project size estimate
  projectSize: "nano" | "small" | "medium" | "large" | "enterprise";
  // Wave 2: README mining (best-effort, optional)
  readmeKeywords: string[];
  // Wave 2b: infra signals — terraform regions, .env, docker-compose TZ, package homepage TLD
  infraKeywords: string[];
}

interface Pkg {
  name?: string;
  homepage?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  private?: boolean;
  main?: string;
  module?: string;
  type?: string;
  exports?: unknown;
  bin?: string | Record<string, string>;
  scripts?: Record<string, string>;
  publishConfig?: { access?: string; registry?: string };
  files?: string[];
}

export function detect(dir: string): DetectionResult {
  const signals: Record<string, string[]> = {};
  const stack = new Set<string>();
  const languages = new Set<string>();

  function sig(name: string, file: string): void {
    if (!signals[name]) signals[name] = [];
    signals[name]!.push(file);
  }

  // ── package.json (Node/TS) ────────────────────────────────
  const pkgPath = join(dir, "package.json");
  let pkg: Pkg = {};
  if (existsSync(pkgPath)) {
    sig("node", "package.json");
    stack.add("nodejs");
    languages.add("javascript");
    try {
      pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Pkg;
      const allDeps = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
        ...(pkg.peerDependencies ?? {}),
      };
      const has = (name: string): boolean => name in allDeps;

      if (has("typescript") || existsSync(join(dir, "tsconfig.json"))) {
        stack.add("typescript");
        languages.add("typescript");
      }

      // Frameworks
      if (has("next")) { stack.add("next.js"); sig("framework-next", "package.json"); }
      if (has("react") || has("react-dom")) stack.add("react");
      if (has("vue") || has("nuxt")) stack.add("vue");
      if (has("@angular/core")) stack.add("angular");
      if (has("svelte") || has("@sveltejs/kit")) stack.add("svelte");
      if (has("astro")) stack.add("astro");
      if (has("express")) stack.add("express");
      if (has("fastify")) stack.add("fastify");
      if (has("@nestjs/core")) stack.add("nestjs");
      if (has("hono")) stack.add("hono");

      // Mobile
      if (has("react-native")) { stack.add("react-native"); sig("mobile", "package.json"); }
      if (has("expo")) stack.add("expo");
      if (has("@tauri-apps/api") || has("@tauri-apps/cli")) {
        stack.add("tauri");
        sig("desktop", "tauri");
      }
      if (has("@capacitor/core")) { stack.add("capacitor"); sig("mobile", "capacitor"); }

      // AI / agents
      if (has("openai")) { stack.add("openai-sdk"); sig("ai", "openai"); }
      if (has("@anthropic-ai/sdk") || has("@anthropic-ai/claude-code")) { stack.add("anthropic-sdk"); sig("ai", "anthropic-sdk"); }
      if (has("langchain") || has("@langchain/core")) { stack.add("langchain"); sig("ai", "langchain"); }
      if (has("@langchain/langgraph")) { stack.add("langgraph"); sig("agent", "langgraph"); }
      if (has("crewai")) { stack.add("crewai"); sig("agent", "crewai"); }
      if (has("llamaindex")) { stack.add("llamaindex"); sig("ai", "llamaindex"); }
      if (has("@modelcontextprotocol/sdk")) { stack.add("mcp"); sig("ai", "mcp"); }
      if (has("ollama")) { stack.add("ollama"); sig("ai", "ollama"); }
      if (has("@mastra/core")) { stack.add("mastra"); sig("agent", "mastra"); }
      if (has("ai")) { stack.add("vercel-ai-sdk"); sig("ai", "vercel-ai-sdk"); }
      // Vector databases (when paired with LLM SDK → agent-product)
      if (has("@pinecone-database/pinecone")) { stack.add("pinecone"); sig("vectordb", "pinecone"); }
      if (has("weaviate-ts-client") || has("weaviate-client")) { stack.add("weaviate"); sig("vectordb", "weaviate"); }
      if (has("chromadb")) { stack.add("chroma"); sig("vectordb", "chroma"); }
      if (has("@qdrant/js-client-rest")) { stack.add("qdrant"); sig("vectordb", "qdrant"); }
      if (has("@google/generative-ai") || has("@google-ai/generativelanguage")) { stack.add("google-ai"); sig("ai", "gemini"); }
      if (has("@aws-sdk/client-bedrock-runtime")) { stack.add("aws-bedrock"); sig("ai", "bedrock"); }
      if (has("cohere-ai")) { stack.add("cohere"); sig("ai", "cohere"); }
      if (has("replicate")) { stack.add("replicate"); sig("ai", "replicate"); }

      // Payments / commerce
      if (has("stripe") || has("@stripe/stripe-js")) { stack.add("stripe"); sig("commerce", "stripe"); }
      if (has("@shopify/shopify-api")) { stack.add("shopify"); sig("commerce", "shopify"); }
      if (has("braintree")) { stack.add("braintree"); sig("commerce", "braintree"); }
      if (has("@adyen/api-library")) { stack.add("adyen"); sig("commerce", "adyen"); }
      if (has("@paddle/paddle-node-sdk")) { stack.add("paddle"); sig("commerce", "paddle"); }
      if (has("@lemonsqueezy/lemonsqueezy.js")) { stack.add("lemonsqueezy"); sig("commerce", "lemonsqueezy"); }
      if (has("polar-sh")) { stack.add("polar"); sig("commerce", "polar"); }

      // Fintech (banking, ACH, regulated payments)
      if (has("plaid")) { stack.add("plaid"); sig("fintech", "plaid"); }
      if (has("@wise-api/api-client") || has("wise")) { stack.add("wise"); sig("fintech", "wise"); }
      if (has("dwolla-v2")) { stack.add("dwolla"); sig("fintech", "dwolla"); }
      if (has("@teller/teller")) { stack.add("teller"); sig("fintech", "teller"); }
      // Emerging-markets payment providers (Wave-1 pack signals)
      if (has("razorpay") || has("razorpay-node")) { stack.add("razorpay"); sig("fintech", "razorpay"); }
      if (has("@paystackhq/paystack-node") || has("paystack")) { stack.add("paystack"); sig("fintech", "paystack"); }
      if (has("@flutterwave/flutterwave-node-v3") || has("flutterwave")) { stack.add("flutterwave"); sig("fintech", "flutterwave"); }
      if (has("mercadopago")) { stack.add("mercadopago"); sig("fintech", "mercadopago"); }
      // Stripe Connect/Issuing → fintech (not just commerce)
      if (has("stripe") && (pkg.name?.includes("bank") || pkg.name?.includes("card"))) {
        sig("fintech", "stripe-connect");
        stack.add("fintech");
      }

      // Healthcare / FHIR
      if (has("fhir") || has("fhir.js") || has("@types/fhir")) { stack.add("fhir"); sig("healthcare", "fhir"); }
      if (has("@smile-cdr/fhirts")) { stack.add("fhir"); sig("healthcare", "smile-cdr"); }
      if (has("hl7")) { stack.add("hl7"); sig("healthcare", "hl7"); }
      if (has("dicom-parser") || has("cornerstone-core") || has("dcmjs")) { stack.add("dicom"); sig("healthcare", "dicom"); }

      // Voice / telephony (Wave-1 pack signals)
      if (has("twilio") || has("@twilio/voice-sdk")) { stack.add("twilio"); sig("voice", "twilio"); }
      if (has("@vonage/server-sdk") || has("nexmo")) { stack.add("vonage"); sig("voice", "vonage"); }
      if (has("livekit-server-sdk") || has("livekit-client")) { stack.add("livekit"); sig("voice", "livekit"); }
      if (has("@deepgram/sdk")) { stack.add("deepgram"); sig("voice", "deepgram"); }
      if (has("elevenlabs") || has("@elevenlabs/elevenlabs-js")) { stack.add("elevenlabs"); sig("voice", "elevenlabs"); }
      if (has("hume") || has("hume-ai")) { stack.add("hume"); sig("voice", "hume"); }

      // HR / recruiting (Wave-1 pack signals)
      if (has("greenhouse-io") || has("@greenhouse/api")) { stack.add("greenhouse"); sig("hr", "greenhouse"); }
      if (has("lever-api")) { stack.add("lever"); sig("hr", "lever"); }
      if (has("ashby-api")) { stack.add("ashby"); sig("hr", "ashby"); }

      // API platform (Wave-1 pack signals)
      if (has("fastify")) stack.add("fastify");
      if (has("@trpc/server") || has("@trpc/client")) stack.add("trpc");
      if (has("@apollo/server") || has("apollo-server")) stack.add("graphql");
      if (has("graphql") || has("graphql-yoga")) stack.add("graphql");
      if (has("openapi3-ts") || has("@apidevtools/swagger-parser")) stack.add("openapi");

      // Auth
      if (has("next-auth") || has("@auth/core")) stack.add("auth");
      if (has("@clerk/nextjs") || has("@clerk/clerk-sdk-node")) stack.add("clerk");
      if (has("@supabase/supabase-js")) stack.add("supabase");
      if (has("lucia")) { stack.add("lucia"); }
      if (has("@workos-inc/node")) { stack.add("workos"); }
      if (has("auth0") || has("@auth0/nextjs-auth0") || has("@auth0/auth0-react")) stack.add("auth0");
      if (has("@okta/okta-auth-js") || has("@okta/oidc-middleware")) stack.add("okta");
      if (has("samlify")) stack.add("samlify");
      if (has("passport-saml") || has("@node-saml/passport-saml")) stack.add("passport-saml");
      if (has("@scim2/core") || has("scim2") || has("scim-patch")) stack.add("scim");

      // Compliance automation (regulated industry — vanta/drata/secureframe are decisive signals)
      if (has("vanta") || has("@vanta/agent")) { stack.add("compliance-automation"); sig("regulated", "vanta"); }
      if (has("drata-cli") || has("@drata/sdk")) { stack.add("compliance-automation"); sig("regulated", "drata"); }
      if (has("secureframe") || has("@secureframe/node")) { stack.add("compliance-automation"); sig("regulated", "secureframe"); }
      if (has("tugboat-logic")) { stack.add("compliance-automation"); sig("regulated", "tugboat-logic"); }
      // Audit log packages
      if (has("audit-log") || has("node-audit-logger") || has("winston-audit")) { stack.add("audit-log"); sig("regulated", "audit-log"); }

      // Marketplace / KYC providers
      if (has("@stripe/connect-iframe-loader") || (has("stripe") && (pkg.name?.includes("market") || pkg.name?.includes("connect")))) {
        stack.add("stripe-connect"); sig("marketplace", "stripe-connect");
      }
      if (has("@adyen/marketpay")) stack.add("adyen-marketpay");
      if (has("persona-react") || has("persona-sdk")) stack.add("persona");
      if (has("@onfido/api") || has("onfido-sdk-ui")) stack.add("onfido");
      if (has("@sumsub/websdk-react")) stack.add("sumsub");

      // CMS / publishing
      if (has("@sanity/client") || has("next-sanity") || has("sanity")) stack.add("sanity");
      if (has("contentful") || has("@contentful/rich-text-react-renderer")) stack.add("contentful");
      if (has("strapi") || has("@strapi/strapi")) stack.add("strapi");
      if (has("payload") || has("@payloadcms/payload")) stack.add("payload");
      if (has("@tryghost/content-api") || has("ghost")) stack.add("ghost");
      if (has("gatsby")) stack.add("gatsby");
      if (has("@11ty/eleventy")) stack.add("eleventy");

      // Streaming / messaging
      if (has("kafkajs") || has("@confluentinc/kafka-javascript")) stack.add("kafkajs");
      if (has("kafka-node")) stack.add("kafka-node");
      if (has("node-rdkafka")) stack.add("rdkafka");
      if (has("@aws-sdk/client-kinesis")) stack.add("kinesis");
      if (has("pulsar-client")) stack.add("pulsar");
      if (has("apache-flink-statefun")) stack.add("flink");
      if (has("@google-cloud/dataflow")) stack.add("beam");
      if (has("debezium")) stack.add("debezium");
      if (has("nats") || has("nats.ws")) stack.add("nats");
      if (has("amqplib") || has("amqp-connection-manager")) stack.add("rabbitmq");

      // MLOps (Python deps detected via pyproject.toml; here we cover Node bridges + Python signal flag)
      // Most MLOps stacks are Python — detected through pyproject.toml block separately.

      // Databases / ORMs
      if (has("prisma") || has("@prisma/client")) stack.add("prisma");
      if (has("drizzle-orm")) stack.add("drizzle");
      if (has("kysely")) stack.add("kysely");
      if (has("typeorm")) stack.add("typeorm");
      if (has("mongodb") || has("mongoose")) stack.add("mongodb");
      if (has("pg") || has("postgres")) stack.add("postgres");
      if (has("@neondatabase/serverless")) { stack.add("neon"); sig("edge", "neon"); }
      if (has("@planetscale/database")) { stack.add("planetscale"); sig("edge", "planetscale"); }
      if (has("@libsql/client")) { stack.add("turso"); sig("edge", "turso"); }
      if (has("mysql") || has("mysql2")) stack.add("mysql");
      if (has("redis") || has("ioredis")) stack.add("redis");
      if (has("duckdb") || has("@duckdb/node-api")) { stack.add("duckdb"); sig("data", "duckdb"); }

      // Testing
      if (has("jest") || has("vitest") || has("mocha") || has("@playwright/test") || has("playwright")) {
        sig("tests", "package.json");
      }

      // Library detection (npm package intended for distribution)
      // Signals: has "main" or "exports", NOT "private:true", NOT a typical app structure
      // Negative signal: any backend framework dep → likely a server, not a library
      const SERVER_FRAMEWORKS = ["express","fastify","nestjs","@nestjs/core","hono","koa","@hapi/hapi","restify","polka"];
      const hasServerFramework = SERVER_FRAMEWORKS.some((f) => has(f));
      const FULLSTACK_FRAMEWORKS = ["next","nuxt","@remix-run/node","@sveltejs/kit","astro","gatsby"];
      const hasFullstack = FULLSTACK_FRAMEWORKS.some((f) => has(f));

      const isPublishable = !pkg.private && (pkg.main || pkg.exports || pkg.module || pkg.type === "module");
      const hasAppStructure = existsSync(join(dir, "pages")) ||
                              existsSync(join(dir, "app")) ||
                              existsSync(join(dir, "src/pages")) ||
                              existsSync(join(dir, "src/app")) ||
                              existsSync(join(dir, "public/index.html")) ||
                              existsSync(join(dir, "routes")) ||
                              existsSync(join(dir, "src/routes")) ||
                              existsSync(join(dir, "api"));
      const hasBin = !!pkg.bin;

      // Strong library signal: explicit publishConfig or files field listing dist
      const hasExplicitLibConfig = !!pkg.publishConfig || (Array.isArray((pkg as Pkg).files) && !hasServerFramework);

      if (isPublishable && !hasAppStructure && !hasServerFramework && !hasFullstack) {
        stack.add("library");
        sig("library", "package.json");
      } else if (hasExplicitLibConfig && !hasServerFramework && !hasFullstack) {
        stack.add("library");
        sig("library", "publishConfig");
      }
      if (hasBin) {
        stack.add("cli");
        sig("library", "bin");
      }
    } catch { /* ignore malformed */ }
  }

  // ── Python ────────────────────────────────────────────────
  if (existsSync(join(dir, "requirements.txt")) ||
      existsSync(join(dir, "pyproject.toml")) ||
      existsSync(join(dir, "setup.py"))) {
    sig("python", "pyproject/requirements/setup");
    stack.add("python");
    languages.add("python");

    try {
      const reqs = existsSync(join(dir, "requirements.txt"))
        ? readFileSync(join(dir, "requirements.txt"), "utf-8")
        : "";
      const pyproject = existsSync(join(dir, "pyproject.toml"))
        ? readFileSync(join(dir, "pyproject.toml"), "utf-8")
        : "";
      const all = reqs + "\n" + pyproject;
      const ihas = (s: string): boolean => all.toLowerCase().includes(s);

      if (ihas("django")) { stack.add("django"); sig("framework-django", "python"); }
      if (ihas("fastapi")) { stack.add("fastapi"); sig("framework-fastapi", "python"); }
      if (ihas("flask")) stack.add("flask");
      if (ihas("openai")) stack.add("openai-sdk");
      if (ihas("anthropic")) stack.add("anthropic-sdk");
      if (ihas("langchain")) { stack.add("langchain"); sig("ai", "langchain"); }
      if (ihas("langgraph")) { stack.add("langgraph"); sig("agent", "langgraph"); }
      if (ihas("crewai")) { stack.add("crewai"); sig("agent", "crewai"); }
      if (ihas("autogen-agentchat") || ihas("pyautogen")) { stack.add("autogen"); sig("agent", "autogen"); }
      if (ihas("dspy-ai")) { stack.add("dspy"); sig("ai", "dspy"); }
      if (ihas("vllm")) { stack.add("vllm"); sig("ai", "vllm"); }
      if (ihas("ollama")) { stack.add("ollama"); sig("ai", "ollama"); }
      if (ihas("ragas") || ihas("deepeval")) { stack.add("llm-eval"); sig("ai", "llm-eval"); }
      if (ihas("llama-index") || ihas("llamaindex")) stack.add("llamaindex");
      if (ihas("torch") || ihas("tensorflow") || ihas("scikit-learn")) {
        stack.add("ml");
        sig("ml", "python");
      }
      // MLOps lifecycle (training / registry / serving)
      if (ihas("mlflow")) { stack.add("mlflow"); sig("mlops", "mlflow"); }
      if (ihas("wandb")) { stack.add("wandb"); sig("mlops", "wandb"); }
      if (ihas("dvc")) { stack.add("dvc"); sig("mlops", "dvc"); }
      if (ihas("kubeflow") || ihas("kfp")) { stack.add("kubeflow"); sig("mlops", "kubeflow"); }
      if (ihas("bentoml")) { stack.add("bentoml"); sig("mlops", "bentoml"); }
      if (ihas("seldon-core")) { stack.add("seldon"); sig("mlops", "seldon"); }
      if (ihas("kserve")) { stack.add("kserve"); sig("mlops", "kserve"); }
      if (ihas("sagemaker")) { stack.add("sagemaker"); sig("mlops", "sagemaker"); }
      if (ihas("google-cloud-aiplatform") || ihas("vertex")) { stack.add("vertex-ai"); sig("mlops", "vertex"); }
      if (ihas("ray[")) { stack.add("ray"); sig("mlops", "ray"); }
      // Streaming (Python)
      if (ihas("confluent-kafka") || ihas("kafka-python")) { stack.add("kafkajs"); sig("streaming", "kafka-py"); }
      if (ihas("pyflink") || ihas("apache-flink")) { stack.add("flink"); sig("streaming", "flink-py"); }
      if (ihas("apache-beam")) { stack.add("beam"); sig("streaming", "beam-py"); }
      if (ihas("nats-py")) { stack.add("nats"); sig("streaming", "nats-py"); }
      if (ihas("debezium")) { stack.add("debezium"); sig("streaming", "debezium"); }
      if (ihas("opencv") || ihas("ultralytics") || ihas("detectron2")) {
        stack.add("computer-vision");
        sig("ai", "computer-vision");
      }
      if (ihas("pandas") || ihas("dask") || ihas("airflow") || ihas("prefect") || ihas("dagster")) {
        stack.add("data-pipeline");
        sig("data", "python");
      }
      if (ihas("polars")) { stack.add("polars"); sig("data", "polars"); }
      if (ihas("duckdb")) { stack.add("duckdb"); sig("data", "duckdb"); }
      if (ihas("pyiceberg")) { stack.add("iceberg"); sig("data", "iceberg"); }
      if (ihas("dbt-core") || ihas("dbt-")) { stack.add("dbt"); sig("data", "dbt"); }
      if (ihas("stripe")) { stack.add("stripe"); sig("commerce", "stripe"); }

      // Library detection — Python package intended for distribution
      // Signal: has setup.py / pyproject.toml [project] or [tool.poetry] without 'private = true'
      const isPyLib = pyproject.includes("[project]") || pyproject.includes("[tool.poetry]") ||
                      existsSync(join(dir, "setup.py"));
      const hasPyApp = existsSync(join(dir, "manage.py")) ||
                       existsSync(join(dir, "main.py")) ||
                       existsSync(join(dir, "app.py")) ||
                       existsSync(join(dir, "wsgi.py"));
      // Python CLI signal: pyproject [project.scripts] OR setup.py with entry_points={'console_scripts'}
      const hasPyCliEntry =
        pyproject.includes("[project.scripts]") ||
        pyproject.includes("[tool.poetry.scripts]") ||
        (existsSync(join(dir, "setup.py")) && readFileSync(join(dir, "setup.py"), "utf-8").includes("console_scripts"));
      if (hasPyCliEntry) {
        stack.add("python-cli");
        sig("cli", "python-script");
      }
      if (isPyLib && !hasPyApp && !hasPyCliEntry) {
        stack.add("library");
        sig("library", "python");
      }
    } catch { /* ignore */ }
  }

  // ── Flutter / Dart ────────────────────────────────────────
  if (existsSync(join(dir, "pubspec.yaml"))) {
    sig("flutter", "pubspec.yaml");
    stack.add("flutter");
    languages.add("dart");
    try {
      const pubspec = readFileSync(join(dir, "pubspec.yaml"), "utf-8").toLowerCase();
      if (pubspec.includes("flutter:")) sig("mobile", "flutter");
      if (pubspec.includes("flutter_bloc")) stack.add("bloc");
      if (pubspec.includes("riverpod")) stack.add("riverpod");
    } catch { /* ignore */ }
  }

  // ── Go ────────────────────────────────────────────────────
  if (existsSync(join(dir, "go.mod"))) {
    sig("go", "go.mod");
    stack.add("go");
    languages.add("go");
    try {
      const gomod = readFileSync(join(dir, "go.mod"), "utf-8");
      if (gomod.includes("stripe-go")) stack.add("stripe");
      if (gomod.includes("openai-go")) stack.add("openai-sdk");
      if (gomod.includes("anthropic-sdk-go")) stack.add("anthropic-sdk");
      if (gomod.includes("gin-gonic/gin")) stack.add("gin");
      if (gomod.includes("labstack/echo")) stack.add("echo");
      if (gomod.includes("go-chi/chi")) stack.add("chi");

      // Library detection: no main package + intended as module
      const hasMainGo = existsSync(join(dir, "main.go")) || existsSync(join(dir, "cmd"));
      if (!hasMainGo) {
        stack.add("library");
        sig("library", "go");
      }
    } catch { /* ignore */ }
  }

  // ── Rust ──────────────────────────────────────────────────
  if (existsSync(join(dir, "Cargo.toml"))) {
    sig("rust", "Cargo.toml");
    stack.add("rust");
    languages.add("rust");
    try {
      const cargo = readFileSync(join(dir, "Cargo.toml"), "utf-8");
      if (cargo.includes("actix-web") || cargo.includes("axum") || cargo.includes("rocket")) {
        sig("web-rust", "Cargo.toml");
      }
      if (cargo.includes("embassy")) { stack.add("embassy"); sig("embedded", "embassy"); }

      // Library detection: [lib] section without [[bin]]
      const hasLib = cargo.includes("[lib]") || (!cargo.includes("[[bin]]") && cargo.includes("[package]"));
      const hasBin = cargo.includes("[[bin]]") || existsSync(join(dir, "src/main.rs"));
      if (hasLib && !hasBin) {
        stack.add("library");
        sig("library", "rust");
      }
    } catch { /* ignore */ }
  }

  // ── Java / Kotlin ─────────────────────────────────────────
  if (existsSync(join(dir, "pom.xml"))) {
    sig("java", "pom.xml");
    stack.add("java");
    languages.add("java");
  }
  if (existsSync(join(dir, "build.gradle")) || existsSync(join(dir, "build.gradle.kts"))) {
    sig("gradle", "build.gradle");
    stack.add("gradle");
    if (existsSync(join(dir, "build.gradle.kts"))) languages.add("kotlin");
    else languages.add("java");
  }

  // ── Swift / iOS ───────────────────────────────────────────
  if (existsSync(join(dir, "Package.swift"))) {
    sig("swift", "Package.swift");
    stack.add("swift");
    languages.add("swift");
  }
  if (safeGlob(dir, /\.xcodeproj$/)) {
    sig("ios", "xcodeproj");
    stack.add("ios");
  }

  // ── Infra ─────────────────────────────────────────────────
  if (safeGlob(dir, /\.tf$/)) {
    sig("infra", "terraform");
    stack.add("terraform");
  }
  if (existsSync(join(dir, "Pulumi.yaml")) || existsSync(join(dir, "Pulumi.yml"))) {
    sig("infra", "pulumi");
    stack.add("pulumi");
  }
  if (existsSync(join(dir, "cdk.json"))) {
    sig("infra", "aws-cdk");
    stack.add("aws-cdk");
  }
  if (existsSync(join(dir, "Chart.yaml")) || existsSync(join(dir, "values.yaml"))) {
    sig("infra", "helm");
    stack.add("helm");
  }
  if (existsSync(join(dir, "helmfile.yaml")) || existsSync(join(dir, "helmfile.yml"))) {
    sig("infra", "helmfile");
    stack.add("helmfile");
  }
  if (safeGlob(dir, /kustomization\.ya?ml$/)) {
    sig("infra", "kustomize");
    stack.add("kubernetes");
  }
  if (existsSync(join(dir, "argocd")) || safeGlob(dir, /argocd-application\.ya?ml$/)) {
    sig("infra", "argocd");
    stack.add("argocd");
  }
  if (existsSync(join(dir, "Dockerfile")) || existsSync(join(dir, "docker-compose.yml"))) {
    sig("docker", "Dockerfile");
    stack.add("docker");
  }
  if (existsSync(join(dir, "dbt_project.yml"))) {
    sig("data", "dbt");
    stack.add("dbt");
    stack.add("data-pipeline");
  }
  if (existsSync(join(dir, "dagster.yaml")) || existsSync(join(dir, "workspace.yaml"))) {
    sig("data", "dagster");
    stack.add("dagster");
    stack.add("data-pipeline");
  }

  // ── Smart contracts ──────────────────────────────────────
  if (existsSync(join(dir, "hardhat.config.js")) ||
      existsSync(join(dir, "hardhat.config.ts")) ||
      existsSync(join(dir, "foundry.toml"))) {
    sig("web3", "smart-contract");
    stack.add("web3");
    stack.add("solidity");
    languages.add("solidity");
  }
  if (safeGlob(dir, /\.sol$/)) {
    sig("web3", "solidity-files");
    stack.add("solidity");
  }

  // ── Browser extension (MV2/MV3) ──────────────────────────
  // manifest.json at repo root with "manifest_version" → Chrome/Firefox/Edge extension
  const manifestPath = join(dir, "manifest.json");
  if (existsSync(manifestPath)) {
    try {
      const m = JSON.parse(readFileSync(manifestPath, "utf-8")) as { manifest_version?: number };
      if (m.manifest_version === 2 || m.manifest_version === 3) {
        sig("browser-extension", `manifest_version=${m.manifest_version}`);
        stack.add("browser-extension");
        if (m.manifest_version === 3) stack.add("mv3");
      }
    } catch { /* not a browser-ext manifest */ }
  }
  // WXT framework signal
  if (existsSync(join(dir, "wxt.config.ts")) || existsSync(join(dir, "wxt.config.js"))) {
    sig("browser-extension", "wxt");
    stack.add("browser-extension");
    stack.add("wxt");
  }
  // Plasmo framework signal
  if (existsSync(join(dir, ".plasmo"))) {
    sig("browser-extension", "plasmo");
    stack.add("browser-extension");
    stack.add("plasmo");
  }

  // ── Game engines ─────────────────────────────────────────
  // Unity: ProjectSettings/ + Assets/
  if (existsSync(join(dir, "ProjectSettings")) && existsSync(join(dir, "Assets"))) {
    sig("game", "unity");
    stack.add("unity");
    stack.add("game");
    languages.add("csharp");
  }
  // Unreal: any .uproject file
  if (safeGlob(dir, /\.uproject$/)) {
    sig("game", "unreal");
    stack.add("unreal");
    stack.add("game");
    languages.add("cpp");
  }
  // Godot: project.godot
  if (existsSync(join(dir, "project.godot"))) {
    sig("game", "godot");
    stack.add("godot");
    stack.add("game");
    languages.add("gdscript");
  }
  // Phaser / Cocos / PlayCanvas (web-game frameworks via package.json deps)
  {
    const allDeps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    };
    if ("phaser" in allDeps) { stack.add("phaser"); stack.add("game"); sig("game", "phaser"); }
    if ("cocos2d" in allDeps) { stack.add("cocos"); stack.add("game"); sig("game", "cocos"); }
    if ("playcanvas" in allDeps) { stack.add("playcanvas"); stack.add("game"); sig("game", "playcanvas"); }
  }

  // ── DevTools / API platform ──────────────────────────────
  // OpenAPI / Swagger spec at root or in api/ dir
  const openapiPaths = ["openapi.yaml", "openapi.yml", "openapi.json", "swagger.yaml", "swagger.json",
                         "api/openapi.yaml", "api/openapi.yml", "api/openapi.json"];
  for (const p of openapiPaths) {
    if (existsSync(join(dir, p))) {
      sig("devtools", `openapi:${p}`);
      stack.add("openapi-spec");
      break;
    }
  }
  // GraphQL schema at root
  if (existsSync(join(dir, "schema.graphql")) || existsSync(join(dir, "schema.gql"))) {
    sig("devtools", "graphql-schema");
    stack.add("graphql-schema");
  }
  // Stainless config (multi-SDK generation)
  if (existsSync(join(dir, "stainless.yml")) || existsSync(join(dir, "stainless.yaml"))) {
    sig("devtools", "stainless");
    stack.add("stainless");
    stack.add("multi-sdk");
  }
  // Multi-language SDK presence: sdks/ or clients/ with multiple language sub-dirs
  const sdkRoots = ["sdks", "clients", "packages/sdk", "packages/clients"];
  for (const root of sdkRoots) {
    const rootPath = join(dir, root);
    if (existsSync(rootPath)) {
      try {
        const sub = readdirSync(rootPath).filter((e) => {
          try { return statSync(join(rootPath, e)).isDirectory(); } catch { return false; }
        });
        // ≥3 sub-dirs that look like language names → multi-SDK platform
        const langPattern = /^(python|node|typescript|javascript|go|ruby|java|kotlin|php|rust|csharp|dotnet|swift|elixir)$/i;
        const hits = sub.filter((s) => langPattern.test(s));
        if (hits.length >= 3) {
          sig("devtools", `multi-sdk:${root}:${hits.join(",")}`);
          stack.add("multi-sdk");
          break;
        }
      } catch { /* ignore */ }
    }
  }
  // Mintlify docs (signal of devtools / API platform docs-as-product)
  if (existsSync(join(dir, "mint.json")) || existsSync(join(dir, "docs.json"))) {
    sig("devtools", "mintlify");
    stack.add("docs-platform");
  }
  // Aggregate signal: OpenAPI + multi-SDK ⇒ explicit devtools-api flag
  if (stack.has("openapi-spec") && stack.has("multi-sdk")) {
    stack.add("devtools-api");
  }

  // ── Embedded ─────────────────────────────────────────────
  if (existsSync(join(dir, "platformio.ini")) ||
      existsSync(join(dir, "sdkconfig")) ||
      existsSync(join(dir, "Kconfig"))) {
    sig("embedded", "platformio/sdk");
    stack.add("embedded");
  }
  if (existsSync(join(dir, "west.yml")) || existsSync(join(dir, "zephyr"))) {
    sig("embedded", "zephyr");
    stack.add("embedded");
    stack.add("zephyr");
  }
  if (existsSync(join(dir, "CMakePresets.json")) && existsSync(join(dir, "components"))) {
    sig("embedded", "esp-idf");
    stack.add("embedded");
    stack.add("esp-idf");
  }

  // ── Package manager ──────────────────────────────────────
  let packageManager: DetectionResult["packageManager"] = null;
  if (existsSync(join(dir, "pnpm-lock.yaml"))) packageManager = "pnpm";
  else if (existsSync(join(dir, "yarn.lock"))) packageManager = "yarn";
  else if (existsSync(join(dir, "bun.lockb")) || existsSync(join(dir, "bun.lock"))) packageManager = "bun";
  else if (existsSync(join(dir, "package-lock.json"))) packageManager = "npm";

  // ── CI / tests ───────────────────────────────────────────
  const hasTests =
    !!signals["tests"] ||
    existsSync(join(dir, "pytest.ini")) ||
    existsSync(join(dir, "tox.ini")) ||
    safeGlob(dir, /^(tests?|spec|__tests__)$/, "dir");

  const hasCI =
    existsSync(join(dir, ".github", "workflows")) ||
    existsSync(join(dir, ".gitlab-ci.yml")) ||
    existsSync(join(dir, ".circleci")) ||
    existsSync(join(dir, "azure-pipelines.yml"));

  const hasExistingGreatCto =
    existsSync(join(dir, ".great_cto", "PROJECT.md")) ||
    existsSync(join(dir, ".great_cto", "SKILL.md"));

  // ── Code-structure signals (Wave 1) ──────────────────────
  const hasRoutesDir =
    existsSync(join(dir, "routes")) ||
    existsSync(join(dir, "app")) ||
    existsSync(join(dir, "pages")) ||
    existsSync(join(dir, "src/api")) ||
    existsSync(join(dir, "src/routes")) ||
    existsSync(join(dir, "src/pages")) ||
    existsSync(join(dir, "src/app")) ||
    existsSync(join(dir, "api"));

  const hasCliEntry =
    existsSync(join(dir, "bin")) ||
    existsSync(join(dir, "src/cli.ts")) ||
    existsSync(join(dir, "src/cli.js")) ||
    existsSync(join(dir, "src/main.ts")) && (pkg as Pkg).bin != null ||
    existsSync(join(dir, "cmd"));

  const hasPublicHtml = existsSync(join(dir, "public/index.html")) ||
                       existsSync(join(dir, "index.html")) ||
                       existsSync(join(dir, "src/index.html"));

  const hasServerEntry =
    existsSync(join(dir, "server.ts")) || existsSync(join(dir, "server.js")) ||
    existsSync(join(dir, "server.mjs")) ||
    existsSync(join(dir, "src/server.ts")) || existsSync(join(dir, "src/server.js")) ||
    existsSync(join(dir, "app.ts")) || existsSync(join(dir, "app.js")) ||
    existsSync(join(dir, "src/app.ts")) || existsSync(join(dir, "src/app.js"));

  const hasMonorepo =
    existsSync(join(dir, "pnpm-workspace.yaml")) ||
    existsSync(join(dir, "lerna.json")) ||
    existsSync(join(dir, "nx.json")) ||
    existsSync(join(dir, "turbo.json")) ||
    existsSync(join(dir, "rush.json"));

  if (hasMonorepo) sig("monorepo", "workspace-config");
  if (hasRoutesDir) sig("structure", "routes-dir");
  if (hasCliEntry) sig("structure", "cli-entry");
  if (hasServerEntry) sig("structure", "server-entry");

  // ── npm-scripts heuristics (Wave 1) ──────────────────────
  const scripts = (pkg as Pkg).scripts || {};
  const scriptHints = {
    hasStart: !!scripts.start,
    hasDev: !!scripts.dev,
    hasBuild: !!scripts.build,
    hasPublish: !!scripts.prepublishOnly || !!scripts.publish,
  };
  if (scriptHints.hasPublish && (pkg as Pkg).publishConfig?.access === "public") {
    sig("library", "publishConfig");
    stack.add("library");
  }
  // server-ish scripts AND server entry → web-service indicator
  if ((scriptHints.hasStart || scriptHints.hasDev) && hasServerEntry) {
    sig("structure", "web-service-shape");
  }

  // ── Project size estimate (Wave 3 lite) ──────────────────
  const projectSize = estimateProjectSize(dir);

  // ── Compliance / regulated-industry docs (Wave 2 supplement) ──
  const complianceFiles = ["ISMS.md", "isms.md", "risk-register.md", "DORA.md", "NIS2.md",
                           "bcp.md", "BCP.md", "control-matrix.md", "security-policy.md"];
  if (complianceFiles.some((f) => existsSync(join(dir, f))) ||
      existsSync(join(dir, "compliance")) ||
      existsSync(join(dir, "controls"))) {
    stack.add("compliance-docs");
    sig("regulated", "compliance-docs");
  }

  // ── README mining (Wave 2) ───────────────────────────────
  const readmeKeywords = mineReadmeKeywords(dir);
  for (const kw of readmeKeywords) sig(`readme:${kw}`, "README");

  // ── Infra signals (Wave 2b) — terraform/env/docker/homepage ──
  const infraKeywords = mineInfraKeywords(dir, pkg);
  for (const kw of infraKeywords) sig(`infra:${kw}`, "infra");

  return {
    stack: Array.from(stack).sort(),
    languages: Array.from(languages).sort(),
    signals,
    packageManager,
    hasTests,
    hasCI,
    hasExistingGreatCto,
    codeStructure: {
      hasRoutesDir,
      hasCliEntry,
      hasPublicHtml,
      hasServerEntry,
      hasMonorepo,
    },
    scripts: scriptHints,
    projectSize,
    readmeKeywords,
    infraKeywords,
  };
}

// ── helpers ──────────────────────────────────────────────────

/**
 * Estimate project size from file count (no LOC, to stay fast).
 * Skips node_modules, .git, dist, build, .next, target, vendor.
 */
function estimateProjectSize(dir: string): DetectionResult["projectSize"] {
  const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", ".nuxt",
                        "target", "vendor", ".venv", "venv", "__pycache__", ".cache",
                        "coverage", ".turbo", ".vercel", ".wrangler"]);
  const SOURCE_EXTS = /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|kt|swift|rb|php|c|cpp|h|hpp|cs|sol|sql|css|scss|html|md)$/;
  let count = 0;
  const MAX = 5000; // hard cap to keep scan O(seconds)
  function walk(d: string, depth: number): void {
    if (count > MAX || depth > 6) return;
    try {
      const entries = readdirSync(d);
      for (const e of entries) {
        if (count > MAX) return;
        if (e.startsWith(".") && depth === 0 && e !== ".github") continue;
        if (SKIP.has(e)) continue;
        const p = join(d, e);
        try {
          const st = statSync(p);
          if (st.isDirectory()) walk(p, depth + 1);
          else if (st.isFile() && SOURCE_EXTS.test(e)) count++;
        } catch { /* unreadable */ }
      }
    } catch { /* unreadable */ }
  }
  walk(dir, 0);
  if (count < 10) return "nano";
  if (count < 50) return "small";
  if (count < 250) return "medium";
  if (count < 1000) return "large";
  return "enterprise";
}

/**
 * Extract a small set of categorical keywords from README.md.
 * Used as a *hint* — not a primary signal.
 */
function mineReadmeKeywords(dir: string): string[] {
  const kws = new Set<string>();
  const path = ["README.md", "readme.md", "README.rst", "README"]
    .map((f) => join(dir, f))
    .find((p) => existsSync(p));
  if (!path) return [];
  let text = "";
  try { text = readFileSync(path, "utf-8").slice(0, 4000).toLowerCase(); } catch { return []; }

  // Categorical hints — broad strokes, intentionally conservative
  const buckets: Record<string, string[]> = {
    "ai":          ["llm", "gpt", "claude", "anthropic", "openai", "embedding", "rag", "agent ", "agentic"],
    "agent":       ["multi-agent", " agent ", "autonomous", "orchestrat"],
    "commerce":    ["payment", "checkout", "stripe", "subscription", "billing"],
    "fintech":     ["bank", "ach", "fintech", "account number", "ledger", "kyc", "aml"],
    "healthcare":  ["health", "patient", "medical", "fhir", "hipaa", "phi", "ehr"],
    "web3":        ["smart contract", "ethereum", "solidity", "defi", "nft", "wallet"],
    "iot":         ["embedded", "firmware", "iot ", "esp32", "esp8266", "arduino"],
    "browser-extension": ["chrome extension", "browser extension", "manifest_version"],
    "library":     ["installation", "## install", "## usage", "publish", "npm install"],
    "cli":         ["command-line", "command line", "cli ", "$ npx ", "subcommand"],
    "data":        ["pipeline", "etl ", "warehouse", "dbt", "airflow", "dataset"],
    "game":        ["game ", "gameplay", "player", "level design"],
    "regulated":   ["dora ict", "nis2", "fedramp", "fisma", "cmmc", "sox compliance",
                    "sarbanes", "regulated entity", "regulated industry",
                    "compliance automation", "audit trail", "iso 27001",
                    "pci compliance", "soc 2 type", "compliance officer"],
    "defense":     ["cmmc", "nist 800-171", "nist sp 800-171", "dfars", "252.204-7012",
                    "controlled unclassified", "cui ", " cui", "itar", "ear99",
                    "section 889", "defense contractor", "dod contract", "govcon",
                    "facility clearance", "fcl ", "sprs", "cui marking"],
  };
  for (const [bucket, terms] of Object.entries(buckets)) {
    if (terms.some((t) => text.includes(t))) kws.add(bucket);
  }

  // Wave 1-4 pack-trigger raw terms — emitted verbatim so packs.ts
  // can substring-match them. Keep in sync with packs.ts SIGNALS.keywords.
  // Single tokens + multi-word phrases supported.
  const packTerms = [
    // voice-pack
    "voice", "telephony", "ivr", "tts", "stt", "speech-to-text", "text-to-speech",
    "outbound call", "inbound call", "voice agent",
    // clinical-pack + clinical-trials-pack
    "clinical", "patient", "ehr", "emr", "phi", "diagnosis", "diagnos", "triage",
    "radiolog", "patholog", "samd", "scribe", "telehealth-ai", "medical record",
    "cds", "clinical decision support",
    "clinical trial", "ctms", "edc", "epro", "econsent", "esource",
    "randomization", "rtsm", "irt", "decentralized trial", "ind submission",
    "21 cfr 11", "cdisc", "sdtm", "adam", "irb",
    // hr-ai-pack
    "recruit", "hiring", "candidate", "resume", "interview", "ats", "talent acquisition",
    "performance review", "workforce scheduling", "employee evaluation", "aedt",
    // api-platform-pack
    "public api", "partner api", "developer portal", "api key", "webhook", "sdk",
    "rest api", "graphql api", "openapi",
    // lending-pack
    "loan", "lending", "credit decision", "underwrit", "bnpl", "buy now pay later",
    "buy-now-pay-later", "payroll advance", "ewa", "line of credit", "fico",
    "credit score", "fcra", "nmls", "financing", "adverse action",
    // robotics-pack
    "robot", "cobot", "manipulator", "end-effector", "amr", "agv", "autonomous mobile",
    "surgical robot", "ros 2", "ros2", "drone", "uav",
    // em-fintech-pack
    "india", "nigeria", "brazil", "indonesia", "philippines", "mexico", "kenya",
    "m-pesa", "mpesa", "upi", "pix", "gcash", "ovo", "dana", "rbi", "cbn", "bsp",
    "ojk", "mas", "bcb", "condusef", "cross-border", "remittance", "local rails",
    // climate-pack
    "carbon", "emission", "ghg", "mrv", "scope 1", "scope 2", "scope 3", "verra",
    "gold standard", "puro", "sbti", "cdp", "csrd", "cbam", "ghgrp", "offset",
    "credit retir", "removal", "biogenic",
    "dna synthesis", "gene synthesis", "oligonucleotide", "protein design",
    "esm", "alphafold", "rfdiffusion", "pathogen", "select agent", "gain-of-function",
    "dual-use", "bsl-3", "bsl-4", "biocontainment", "bwc", "p3co", "igsc", "cloud lab",
    // drug-discovery-pack
    "drug discovery", "binding affinity", "admet", "toxicity prediction",
    "generative chem", "generative protein", "antibody design", "mrna design",
    "virtual screening", "docking", "fep", "chembl", "bindingdb", "pdbbind",
    "glp", "gmp", "gxp", "preclinical", "lims", "eln", "annex 11", "alcoa",
    "lab automation", "robotic biology", "liquid handler", "hamilton", "tecan",
    "beckman", "opentrons", "plate reader", "sequencer", "hplc", "mass spec", "sila",
    // digital-health-pack (Wave 4) — keep in sync with packs.ts SIGNALS.keywords
    "wearable", "apple watch", "apple health", "healthkit", "health connect",
    "garmin", "samsung health", "google fit", "fitbit", "heart rate", "hrv",
    "heart rate variability", "spo2", "sleep tracking", "sleep stages",
    "biometric sensor", "stress score", "activity tracking", "ecg wearable",
    "mental health", "mental wellness", "wellbeing", "mindfulness ai",
    "stress detection", "burnout detection", "mood tracking", "anxiety ai",
    "depression ai", "phq-9", "gad-7", "digital therapeutics", "dtx",
    "cbt app", "dbt app", "therapy ai", "personalised training",
    "personalized training", "fitness ai", "nutrition ai",
    "supplement recommendation", "supplement ai", "diet ai", "meal plan ai",
    "macro ai", "physician review", "physician hitl", "doctor in the loop",
    "clinical review workflow", "remote patient monitoring", "rpm", "teleconsultation",
    // US-market packs — keep in sync with packs.ts SIGNALS.keywords
    // adtech-privacy-pack
    "meta pixel", "facebook pixel", "fbevents", "conversions api", "capi",
    "google analytics", "ga4", "google tag manager", "tiktok pixel", "ad pixel",
    "tracking pixel", "session replay", "session recording", "heatmap",
    "fullstory", "hotjar", "logrocket", "retargeting", "behavioral advertising",
    "vppa", "cipa", "wiretap", "my health my data", "mhmda", "consumer health data",
    // us-ai-pack
    "nist ai rmf", "ai rmf", "ai risk management", "colorado ai act", "sb 205",
    "algorithmic discrimination", "consequential decision", "high-risk ai",
    "automated decision", "ai impact assessment", "utah ai", "traiga",
    "ai transparency", "ab 2013", "sb 942", "training data transparency",
    "ai disclosure", "generative ai disclosure", "deepfake disclosure", "ai governance",
  ];
  for (const term of packTerms) {
    if (text.includes(term)) kws.add(term);
  }
  // Jurisdiction geo/legal terms — emitted verbatim so jurisdictions.ts
  // can exact-match them. Keep in sync with JURISDICTION_SIGNALS in jurisdictions.ts.
  const jurisdictionTerms = [
    // EU
    "gdpr", "dsgvo", "rgpd", "data protection officer", "dpo",
    "right to erasure", "right to be forgotten", "data subject request",
    "article 6", "article 9", "legitimate interest", "lawful basis",
    "privacy by design", "privacy notice", "cookie consent",
    "eu ai act", "eu users", "eu customers", "european union",
    "eu data residency", "eu-west", "eu-central",
    "nis2", "dora ict risk", "dora compliance",
    "german users", "french users", "dutch users", "austrian",
    "italian users", "spanish users", "polish users",
    // US
    "ftc", "ftc act", "us users", "us customers", "united states",
    "american users", "coppa", "hipaa", "us privacy law",
    "virginia cdpa", "texas tdpsa", "florida fdbr",
    "colorado cpa", "connecticut ctdpa", "us state privacy",
    // US-CA
    "ccpa", "cpra", "california consumer privacy",
    "california privacy rights", "cppa", "california residents",
    "california users", "do not sell", "opt-out of sale",
    "data subject rights california", "dsr california",
    // UK
    "uk gdpr", "information commissioner", "dpa 2018",
    "uk users", "uk customers", "united kingdom", "british users",
    "fca consumer duty", "uk ai regulation",
    // IN
    "dpdpa", "digital personal data protection", "india data",
    "india users", "indian users", "bharat", "meity",
    "rbi data localisation", "rbi circular", "npci", "sebi",
    "india data residency",
    // BR
    "lgpd", "lei 13709", "anpd", "brazil users", "brazil customers",
    "brazilian users", "brasil", "data encarregado", "dpo brazil",
    "lgpd compliance",
    // AU
    "privacy act 1988", "australian privacy principles", "app principles",
    "oaic", "australia users", "australian users",
    "consumer data right", "notifiable data breach", "ndb scheme",
    "australia data residency",
    // SG
    "pdpa", "pdpc", "singapore users", "singaporean users",
    "mas guidelines", "mas tpm", "singpass", "myinfo",
    "singapore data residency",
    // CA
    "pipeda", "quebec law 25", "bill 64", "opc canada", "casl",
    "canadian users", "canada users", "canadian customers", "canadian residents",
    "osfi", "fintrac", "ca-central", "ca-west", "canada-central",
    // JP
    "appi", "personal information protection commission", "ppc japan",
    "japan users", "japanese users", "japan customers",
    "fsa japan", "jfsa", "fisc",
    "ap-northeast-1", "ap-northeast-3", "japan east", "japan west",
    // CN
    "pipl", "personal information protection law", "data security law",
    "mlps", "classified protection", "cyberspace administration",
    "china users", "chinese users", "mainland china",
    "pboc", "cn-north", "cn-east", "cn-south", "china-east", "china-north",
    // KR
    "pipa korea", "pipa", "personal information protection act korea",
    "pipc", "isms-p", "kisa", "k-isms",
    "korea users", "korean users", "south korea users",
    "fsc korea", "ap-northeast-2", "korea central", "korea south",
  ];
  for (const term of jurisdictionTerms) {
    if (text.includes(term)) kws.add(term);
  }
  return Array.from(kws).sort();
}

/**
 * Mine infra-level jurisdiction signals that README often omits:
 * - Terraform/Pulumi/CDK region strings (eu-west-1, ap-northeast-2, …)
 * - .env.example / .env.sample / .env.test AWS_REGION / AZURE_LOCATION / GCP_REGION
 * - docker-compose.yml TZ= environment variables
 * - package.json homepage TLD (.de, .fr, .jp, .cn, .kr, .ca, …)
 *
 * Returns a flat list of canonical keyword strings that jurisdiction.ts can match.
 */
function mineInfraKeywords(dir: string, pkg: Pkg | null): string[] {
  const kws = new Set<string>();

  // ── 1. package.json homepage TLD → jurisdiction keyword ──────────────────
  const homepageTldMap: Record<string, string> = {
    ".de": "german users", ".at": "austrian", ".fr": "french users",
    ".nl": "dutch users", ".es": "spanish users", ".it": "italian users",
    ".pl": "polish users", ".eu": "eu users",
    ".co.uk": "uk users", ".uk": "uk users",
    ".ca": "canadian users",
    ".jp": "japan users",
    ".cn": "china users",
    ".kr": "korea users",
    ".com.br": "brazil users", ".br": "brazil users",
    ".com.au": "australia users", ".au": "australia users",
    ".sg": "singapore users",
    ".in": "india users",
  };
  const homepage = (pkg?.homepage ?? "").toLowerCase();
  if (homepage) {
    for (const [tld, kw] of Object.entries(homepageTldMap)) {
      if (homepage.includes(tld)) kws.add(kw);
    }
  }

  // ── 2. .env / docker-compose TZ= → jurisdiction ──────────────────────────
  const tzRegionMap: Array<[RegExp, string]> = [
    [/tz=europe\//i, "eu users"],
    [/tz=america\/toronto|tz=canada/i, "canadian users"],
    [/tz=asia\/tokyo/i, "japan users"],
    [/tz=asia\/shanghai|tz=asia\/beijing|tz=prc|tz=asia\/hong_kong/i, "china users"],
    [/tz=asia\/seoul/i, "korea users"],
    [/tz=asia\/kolkata|tz=asia\/calcutta/i, "india users"],
    [/tz=america\/sao_paulo/i, "brazil users"],
    [/tz=australia\//i, "australia users"],
    [/tz=asia\/singapore/i, "singapore users"],
    [/tz=europe\/london/i, "uk users"],
  ];
  const envFiles = [".env.example", ".env.sample", ".env.test", ".env.local.example",
                    "docker-compose.yml", "docker-compose.yaml",
                    "docker-compose.dev.yml", "docker-compose.prod.yml"];
  for (const f of envFiles) {
    const p = join(dir, f);
    if (!existsSync(p)) continue;
    try {
      const txt = readFileSync(p, "utf-8").slice(0, 8000).toLowerCase();
      // AWS_REGION / AZURE_LOCATION / GCP_REGION / REGION
      const awsRegion = txt.match(/(?:aws_region|region)\s*=\s*["']?([a-z0-9-]+)/g) ?? [];
      for (const m of awsRegion) {
        const val = m.split(/=\s*["']?/)[1] ?? "";
        if (/^eu-/.test(val) || /^europe/.test(val)) kws.add("eu users");
        if (/^ca-/.test(val) || val.includes("canada")) kws.add("canadian users");
        if (/^ap-northeast-1$|^ap-northeast-3$/.test(val)) kws.add("japan users");
        if (/^ap-northeast-2$/.test(val)) kws.add("korea users");
        if (/^cn-/.test(val) || val.includes("china")) kws.add("china users");
        if (/^ap-south-1$/.test(val) || val.includes("india")) kws.add("india users");
        if (/^ap-southeast-1$/.test(val)) kws.add("singapore users");
        if (/^ap-southeast-2$/.test(val)) kws.add("australia users");
        if (/^sa-east/.test(val)) kws.add("brazil users");
        if (/^us-/.test(val) || /^us_/.test(val)) kws.add("us users");
        if (val.includes("uk") || val.includes("europe") && val.includes("west")) kws.add("uk users");
      }
      for (const [re, kw] of tzRegionMap) {
        if (re.test(txt)) kws.add(kw);
      }
    } catch { /* unreadable */ }
  }

  // ── 3. Terraform / Pulumi / CloudFormation region strings ─────────────────
  const tfFiles: string[] = [];
  function collectTf(d: string, depth: number): void {
    if (depth > 4) return;
    const SKIP = new Set(["node_modules", ".git", "dist", ".terraform"]);
    try {
      for (const e of readdirSync(d)) {
        if (SKIP.has(e)) continue;
        const p = join(d, e);
        try {
          const st = statSync(p);
          if (st.isDirectory()) { collectTf(p, depth + 1); continue; }
          if (/\.(tf|yaml|yml|json)$/.test(e) && st.size < 200_000) tfFiles.push(p);
        } catch { /* skip */ }
        if (tfFiles.length > 40) return;
      }
    } catch { /* skip */ }
  }
  collectTf(dir, 0);

  const regionPatterns: Array<[RegExp, string]> = [
    [/\beu-west-\d|eu-central-\d|eu-north-\d|eu-south-\d|europe-west\d|europe-north\d|westeurope|northeurope|germanywestcentral|francecentral\b/i, "eu users"],
    [/\bca-central-\d|canadacentral|canadaeast\b/i, "canadian users"],
    [/\bap-northeast-1\b|\bjapan-east\b|\bjapaneast\b|\bjapanwest\b/i, "japan users"],
    [/\bap-northeast-2\b|\bkoreacentral\b|\bkoreasouth\b/i, "korea users"],
    [/\bcn-north-\d|\bcn-east-\d|\bcn-northwest-\d|\bchinanorth\b|\bchinaeast\b/i, "china users"],
    [/\bap-south-\d|\bcentralindia\b|\bsouthindia\b|\bwestindia\b/i, "india users"],
    [/\bap-southeast-1\b|\bsoutheastasia\b/i, "singapore users"],
    [/\bap-southeast-2\b|\baustralia\b|\baustraliasoutheast\b|\baustraliaeast\b/i, "australia users"],
    [/\bsa-east-\d|\bbrazilsouth\b|\bbrazilsoutheast\b/i, "brazil users"],
    [/\buksouth\b|\bukwest\b|\buk-south\b/i, "uk users"],
    [/\bus-east-\d|\bus-west-\d|\beastus\b|\bwestus\b|\bcentralus\b/i, "us users"],
  ];

  for (const p of tfFiles) {
    try {
      const txt = readFileSync(p, "utf-8").slice(0, 50_000);
      for (const [re, kw] of regionPatterns) {
        if (re.test(txt)) kws.add(kw);
      }
    } catch { /* skip */ }
  }

  return Array.from(kws).sort();
}

function safeGlob(dir: string, pattern: RegExp, kind: "file" | "dir" = "file"): boolean {
  try {
    const entries = readdirSync(dir);
    for (const e of entries) {
      const p = join(dir, e);
      try {
        const st = statSync(p);
        if (kind === "file" && st.isFile() && pattern.test(e)) return true;
        if (kind === "dir" && st.isDirectory() && pattern.test(e)) return true;
      } catch { /* unreadable entry */ }
    }
  } catch { /* unreadable dir */ }
  return false;
}
