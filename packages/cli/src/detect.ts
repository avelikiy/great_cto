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
}

interface Pkg {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
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

      // AI / agents
      if (has("openai")) { stack.add("openai-sdk"); sig("ai", "openai"); }
      if (has("@anthropic-ai/sdk")) { stack.add("anthropic-sdk"); sig("ai", "anthropic-sdk"); }
      if (has("langchain") || has("@langchain/core")) { stack.add("langchain"); sig("ai", "langchain"); }
      if (has("llamaindex")) { stack.add("llamaindex"); sig("ai", "llamaindex"); }
      if (has("@modelcontextprotocol/sdk")) { stack.add("mcp"); sig("ai", "mcp"); }

      // Payments / commerce
      if (has("stripe") || has("@stripe/stripe-js")) { stack.add("stripe"); sig("commerce", "stripe"); }
      if (has("@shopify/shopify-api")) { stack.add("shopify"); sig("commerce", "shopify"); }
      if (has("braintree")) { stack.add("braintree"); sig("commerce", "braintree"); }

      // Auth
      if (has("next-auth") || has("@auth/core")) stack.add("auth");
      if (has("@clerk/nextjs") || has("@clerk/clerk-sdk-node")) stack.add("clerk");
      if (has("@supabase/supabase-js")) stack.add("supabase");

      // Databases / ORMs
      if (has("prisma") || has("@prisma/client")) stack.add("prisma");
      if (has("drizzle-orm")) stack.add("drizzle");
      if (has("typeorm")) stack.add("typeorm");
      if (has("mongodb") || has("mongoose")) stack.add("mongodb");
      if (has("pg") || has("postgres")) stack.add("postgres");
      if (has("mysql") || has("mysql2")) stack.add("mysql");
      if (has("redis") || has("ioredis")) stack.add("redis");

      // Testing
      if (has("jest") || has("vitest") || has("mocha") || has("@playwright/test") || has("playwright")) {
        sig("tests", "package.json");
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
      if (ihas("llama-index") || ihas("llamaindex")) stack.add("llamaindex");
      if (ihas("torch") || ihas("tensorflow") || ihas("scikit-learn")) {
        stack.add("ml");
        sig("ml", "python");
      }
      if (ihas("pandas") || ihas("dask") || ihas("airflow") || ihas("prefect")) {
        stack.add("data-pipeline");
        sig("data", "python");
      }
      if (ihas("stripe")) { stack.add("stripe"); sig("commerce", "stripe"); }
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
  if (existsSync(join(dir, "Chart.yaml")) || existsSync(join(dir, "values.yaml"))) {
    sig("infra", "helm");
    stack.add("helm");
  }
  if (safeGlob(dir, /kustomization\.ya?ml$/)) {
    sig("infra", "kustomize");
    stack.add("kubernetes");
  }
  if (existsSync(join(dir, "Dockerfile")) || existsSync(join(dir, "docker-compose.yml"))) {
    sig("docker", "Dockerfile");
    stack.add("docker");
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

  // ── Embedded ─────────────────────────────────────────────
  if (existsSync(join(dir, "platformio.ini")) ||
      existsSync(join(dir, "sdkconfig")) ||
      existsSync(join(dir, "Kconfig"))) {
    sig("embedded", "platformio/sdk");
    stack.add("embedded");
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

  return {
    stack: Array.from(stack).sort(),
    languages: Array.from(languages).sort(),
    signals,
    packageManager,
    hasTests,
    hasCI,
    hasExistingGreatCto,
  };
}

// ── helpers ──────────────────────────────────────────────────

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
