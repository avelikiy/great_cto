// Archetype decision: detected stack → archetype recommendation.
// Mirrors great_cto's 13 archetypes in skills/great_cto/ARCHETYPES.md.
// Rules are evaluated; highest score wins.
const RULES = [
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
            if (d.stack.includes("unity"))
                s += 8;
            if (d.stack.includes("unreal"))
                s += 8;
            if (d.stack.includes("godot"))
                s += 8;
            if (d.stack.includes("phaser"))
                s += 6;
            if (d.stack.includes("cocos"))
                s += 6;
            return s;
        },
        reason: (d) => {
            const bits = [];
            if (d.stack.includes("unity"))
                bits.push("Unity");
            if (d.stack.includes("unreal"))
                bits.push("Unreal");
            if (d.stack.includes("godot"))
                bits.push("Godot");
            if (d.stack.includes("phaser"))
                bits.push("Phaser");
            if (d.stack.includes("cocos"))
                bits.push("Cocos");
            return `game engine detected: ${bits.join(", ")} — netcode/anti-cheat/age-rating gates`;
        },
    },
    // ── devtools ─────────────────────────────────────
    // High priority: OpenAPI + multi-language SDK presence beats library
    {
        archetype: "devtools",
        score: (d) => {
            let s = 0;
            if (d.stack.includes("devtools-api"))
                s += 7;
            if (d.stack.includes("openapi-spec"))
                s += 4;
            if (d.stack.includes("graphql-schema"))
                s += 3;
            if (d.stack.includes("multi-sdk"))
                s += 4;
            if (d.stack.includes("stainless"))
                s += 4;
            if (d.stack.includes("docs-platform"))
                s += 2;
            return s;
        },
        reason: (d) => {
            const bits = [];
            if (d.stack.includes("openapi-spec"))
                bits.push("OpenAPI spec");
            if (d.stack.includes("graphql-schema"))
                bits.push("GraphQL schema");
            if (d.stack.includes("multi-sdk"))
                bits.push("multi-language SDKs");
            if (d.stack.includes("stainless"))
                bits.push("Stainless");
            return `developer-tools platform detected (${bits.join(", ")}) — API stability + SDK quality gates`;
        },
    },
    // ── commerce ─────────────────────────────────────
    {
        archetype: "commerce",
        score: (d) => {
            let s = 0;
            if (d.stack.includes("stripe"))
                s += 5;
            if (d.stack.includes("shopify"))
                s += 5;
            if (d.stack.includes("braintree"))
                s += 5;
            return s;
        },
        reason: (d) => {
            const payments = [];
            if (d.stack.includes("stripe"))
                payments.push("Stripe");
            if (d.stack.includes("shopify"))
                payments.push("Shopify");
            if (d.stack.includes("braintree"))
                payments.push("Braintree");
            return `payments SDK detected: ${payments.join(", ")} — PCI-DSS gate mandatory`;
        },
    },
    // ── web3 ─────────────────────────────────────────
    {
        archetype: "web3",
        score: (d) => {
            let s = 0;
            if (d.stack.includes("solidity"))
                s += 6;
            if (d.stack.includes("web3"))
                s += 4;
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
    // ── ai-system ────────────────────────────────────
    {
        archetype: "ai-system",
        score: (d) => {
            let s = 0;
            if (d.stack.includes("anthropic-sdk"))
                s += 4;
            if (d.stack.includes("openai-sdk"))
                s += 3;
            if (d.stack.includes("langchain"))
                s += 4;
            if (d.stack.includes("llamaindex"))
                s += 4;
            if (d.stack.includes("mcp"))
                s += 5;
            if (d.stack.includes("ml"))
                s += 3;
            return s;
        },
        reason: (d) => {
            const bits = [];
            if (d.stack.includes("mcp"))
                bits.push("MCP SDK");
            if (d.stack.includes("anthropic-sdk"))
                bits.push("Anthropic SDK");
            if (d.stack.includes("openai-sdk"))
                bits.push("OpenAI SDK");
            if (d.stack.includes("langchain"))
                bits.push("LangChain");
            if (d.stack.includes("llamaindex"))
                bits.push("LlamaIndex");
            if (d.stack.includes("ml"))
                bits.push("ML stack");
            return `AI/LLM tooling detected (${bits.join(", ")}) — security gate mandatory for prompt injection + output sanitization`;
        },
    },
    // ── mobile-app ───────────────────────────────────
    {
        archetype: "mobile-app",
        score: (d) => {
            let s = 0;
            if (d.stack.includes("react-native"))
                s += 5;
            if (d.stack.includes("expo"))
                s += 5;
            if (d.stack.includes("ios"))
                s += 5;
            if (d.stack.includes("swift"))
                s += 3;
            return s;
        },
        reason: (d) => {
            const bits = [];
            if (d.stack.includes("react-native"))
                bits.push("React Native");
            if (d.stack.includes("expo"))
                bits.push("Expo");
            if (d.stack.includes("ios"))
                bits.push("iOS project");
            return `mobile framework detected: ${bits.join(", ")}`;
        },
    },
    // ── data-platform ────────────────────────────────
    {
        archetype: "data-platform",
        score: (d) => (d.stack.includes("data-pipeline") ? 4 : 0),
        reason: (_d) => "data pipeline tooling detected (pandas/airflow/prefect)",
    },
    // ── infra ────────────────────────────────────────
    {
        archetype: "infra",
        score: (d) => {
            const hasTerraform = d.stack.includes("terraform");
            const hasHelm = d.stack.includes("helm");
            const hasK8s = d.stack.includes("kubernetes");
            // Require at least one explicit infra signal
            if (!hasTerraform && !hasHelm && !hasK8s)
                return 0;
            let s = 0;
            if (hasTerraform)
                s += 4;
            if (hasHelm)
                s += 4;
            if (hasK8s)
                s += 4;
            // Pure-infra repo (no app code) gets a small bonus
            if (!d.stack.includes("nodejs") && !d.stack.includes("python") && !d.stack.includes("go"))
                s += 2;
            return s;
        },
        reason: (d) => {
            const bits = [];
            if (d.stack.includes("terraform"))
                bits.push("Terraform");
            if (d.stack.includes("helm"))
                bits.push("Helm");
            if (d.stack.includes("kubernetes"))
                bits.push("Kustomize/K8s");
            return `infrastructure-as-code detected: ${bits.join(", ")}`;
        },
    },
    // ── web-service (default for web frameworks) ─────
    {
        archetype: "web-service",
        score: (d) => {
            let s = 0;
            const webFrameworks = [
                "next.js", "react", "vue", "angular", "svelte", "astro",
                "express", "fastify", "nestjs", "hono",
                "django", "fastapi", "flask",
            ];
            for (const fw of webFrameworks)
                if (d.stack.includes(fw))
                    s += 1;
            if (s > 0)
                s += 2; // baseline bonus for any web framework
            return s;
        },
        reason: (d) => {
            const fw = d.stack.find((t) => ["next.js", "react", "vue", "angular", "svelte", "astro", "express", "fastify", "nestjs", "hono", "django", "fastapi", "flask"].includes(t));
            return `web framework detected: ${fw ?? "unknown"}`;
        },
    },
    // ── library (no app framework, just code) ────────
    // Detection priority: explicit "library" or "cli" stack signal from detect.ts (high confidence)
    // Fallback: plain runtime + no web/mobile/infra framework (low confidence)
    {
        archetype: "library",
        score: (d) => {
            // Strong signal: detect.ts found library indicators
            if (d.stack.includes("library") || d.stack.includes("cli")) {
                return 7;
            }
            // Weaker signal: no app framework detected
            const hasApp = d.stack.some((t) => ["next.js", "django", "fastapi", "flask", "express", "fastify", "nestjs", "hono",
                "react-native", "expo", "tauri", "capacitor", "flutter",
                "terraform", "pulumi", "aws-cdk", "helm",
                "embedded", "zephyr", "esp-idf",
                "browser-extension", "unity", "unreal", "godot", "phaser", "cocos"].includes(t));
            if (hasApp)
                return 0;
            if (d.stack.includes("nodejs") || d.stack.includes("python") || d.stack.includes("go") || d.stack.includes("rust")) {
                return 2;
            }
            return 0;
        },
        reason: (d) => {
            if (d.stack.includes("library") || d.stack.includes("cli")) {
                return "package.json/pyproject/Cargo.toml indicates a publishable library or CLI";
            }
            return "no web/mobile/infra framework detected — looks like a library/SDK";
        },
    },
];
export function pickArchetype(d) {
    const scored = RULES
        .map((r) => ({ archetype: r.archetype, score: r.score(d), reason: r.reason(d) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score);
    if (scored.length === 0) {
        return {
            primary: "greenfield",
            confidence: "low",
            rationale: "no strong signals detected — treating as greenfield project",
            alternatives: [],
        };
    }
    const top = scored[0];
    const nextBest = scored[1]?.score ?? 0;
    const gap = top.score - nextBest;
    const confidence = top.score >= 5 && gap >= 2 ? "high" :
        top.score >= 3 ? "medium" : "low";
    return {
        primary: top.archetype,
        confidence,
        rationale: top.reason,
        alternatives: scored.slice(1, 4).map((r) => r.archetype),
    };
}
// Compliance hints — auto-suggested based on stack.
export function suggestCompliance(d, archetype) {
    const c = new Set();
    if (archetype === "commerce") {
        c.add("pci-dss");
        c.add("gdpr");
    }
    if (archetype === "ai-system") {
        c.add("eu-ai-act");
    }
    if (archetype === "web3") {
        c.add("soc2");
    }
    if (archetype === "iot-embedded") {
        c.add("iso27001");
    }
    if (archetype === "browser-extension") {
        c.add("csp");
        c.add("mv3-security");
        c.add("gdpr");
    }
    if (archetype === "game") {
        c.add("coppa");
        c.add("age-rating");
        c.add("accessibility");
    }
    if (archetype === "devtools") {
        c.add("openssf");
        c.add("api-stability");
        c.add("soc2-type-2");
        c.add("gdpr");
    }
    if (d.stack.includes("stripe"))
        c.add("pci-dss");
    // Reasonable default for any web service storing user data
    if (archetype === "web-service")
        c.add("gdpr");
    return Array.from(c).sort();
}
