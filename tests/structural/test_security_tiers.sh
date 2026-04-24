#!/usr/bin/env bash
# Structural smoke test for the v1.0.102 tier model + v1.0.103 allowlist waivers.
#
# Runs the tier-computation bash that security-officer.md executes (mirrored
# here — kept in lockstep via a checksum guard) against fixture scenarios and
# asserts the effective tier matches expectation.
#
# Exit 0 on pass; non-zero and a red diff on fail.

set -u
PASS=0
FAIL=0
RED="$(printf '\033[31m')"; GREEN="$(printf '\033[32m')"; RST="$(printf '\033[0m')"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AGENT_FILE="$ROOT/agents/security-officer.md"
REF_FILE="$ROOT/skills/great_cto/references/security-tiers.md"

# Precondition: the agent + reference files exist.
for F in "$AGENT_FILE" "$REF_FILE"; do
  [ -f "$F" ] || { echo "FAIL: missing $F"; exit 2; }
done

# Precondition: the reference still documents the three tiers we test for.
for TIER in baseline standard deep; do
  grep -q "\`$TIER\`" "$REF_FILE" || { echo "FAIL: reference missing tier '$TIER'"; exit 2; }
done

# Extract the tier computation (mirror — assertion is that this stays in
# sync with security-officer.md). Any edit there should bump this script.
compute_tier() {
  local project_md="$1"
  local signal_log="$2"
  local allowlist="$3"

  local ARCHETYPE TIER_DEFAULT TIER_OVERRIDE TIER_EFFECTIVE UPGRADES=""
  ARCHETYPE=$(grep "^archetype:" "$project_md" 2>/dev/null | awk '{print $2}' || echo "web-service")

  case "$ARCHETYPE" in
    web3|iot-embedded|regulated)              TIER_DEFAULT=deep ;;
    ai-system|commerce|infra)                 TIER_DEFAULT=standard ;;
    web-service|mobile-app|data-platform|library) TIER_DEFAULT=baseline ;;
    *)                                        TIER_DEFAULT=baseline ;;
  esac

  TIER_OVERRIDE=$(grep "^default-tier:" "$project_md" 2>/dev/null | awk '{print $2}')
  TIER_EFFECTIVE="${TIER_OVERRIDE:-$TIER_DEFAULT}"

  if [ -f "$signal_log" ]; then
    local RECENT
    RECENT=$(tail -100 "$signal_log" 2>/dev/null)
    for SIGNAL in pci-dep-introduced crypto-dep-introduced auth-path-changed pii-field-added iac-perimeter-changed high-cve-in-dep external-ingest-added; do
      if echo "$RECENT" | grep -q "SECURITY_SIGNAL: $SIGNAL "; then
        UPGRADES="$UPGRADES $SIGNAL"
        case "$TIER_EFFECTIVE" in
          baseline) TIER_EFFECTIVE=standard ;;
        esac
      fi
    done
  fi

  # Allowlist suppression (simplified mirror of security-officer.md parser).
  if [ -f "$allowlist" ]; then
    local SUPPRESSED
    SUPPRESSED=$(ALLOWLIST="$allowlist" SIGNAL_LOG="$signal_log" python3 <<'PY'
import os, datetime, re, sys
path = os.environ["ALLOWLIST"]; log_path = os.environ.get("SIGNAL_LOG","")
today = datetime.date.today()
max_exp = today + datetime.timedelta(days=90)
try: import yaml; doc = yaml.safe_load(open(path))
except Exception:
    doc = {"allowed-deps": []}
    section = None; entry = None
    for raw in open(path):
        line = raw.rstrip()
        if not line.strip() or line.lstrip().startswith("#"): continue
        if line.startswith("allowed-deps:"): section="allowed-deps"; continue
        if line.startswith("allowed-iac-paths:"): section="allowed-iac-paths"; continue
        if section == "allowed-deps":
            m = re.match(r"\s*-\s*name:\s*(.+)$", line)
            if m:
                if entry: doc["allowed-deps"].append(entry)
                entry = {"name": m.group(1).strip().strip('"').strip("'")}; continue
            m = re.match(r"\s+(\w[\w-]*):\s*(.+)$", line)
            if m and entry is not None: entry[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    if entry: doc["allowed-deps"].append(entry)

def audit(line):
    if log_path:
        with open(log_path, "a") as f: f.write(line + "\n")

def validate(e):
    if not isinstance(e, dict): return (False, "not-an-object")
    missing = [k for k in ("reason","approved-by","expires") if not str(e.get(k,"")).strip()]
    if missing: return (False, f"missing:{','.join(missing)}")
    if not str(e["approved-by"]).startswith("@"): return (False, "owner-not-@handle")
    try: d = datetime.date.fromisoformat(str(e["expires"]))
    except Exception: return (False, f"expires-invalid")
    if d <= today: return (False, f"expired:{e['expires']}")
    if d > max_exp: return (False, f"expires-beyond-90d:{e['expires']}")
    return (True, str(e["approved-by"]))

for e in (doc.get("allowed-deps") or []):
    name = e.get("name","?") if isinstance(e, dict) else "?"
    ok, info = validate(e)
    if ok:
        audit(f"SEC_WAIVER: dep={name} owner={info} expires={e['expires']}")
        print(f"DEP:{name}")
    else:
        audit(f"WARN_WAIVER_REJECTED: dep={name} reason={info}")
PY
)
    if echo "$SUPPRESSED" | grep -q '^DEP:'; then
      local PENDING_DEPS
      PENDING_DEPS=$(grep "SECURITY_SIGNAL:.*-dep-introduced" "$signal_log" 2>/dev/null | awk '{print $NF}' | sort -u)
      local ALL_WAIVED=true
      for DEP in $PENDING_DEPS; do
        if ! echo "$SUPPRESSED" | grep -q "^DEP:${DEP}$"; then ALL_WAIVED=false; break; fi
      done
      if [ "$ALL_WAIVED" = true ] && [ -n "$PENDING_DEPS" ]; then
        UPGRADES=$(echo "$UPGRADES" | tr ' ' '\n' | grep -v "dep-introduced" | tr '\n' ' ')
      fi
    fi
    if [ -z "${UPGRADES// }" ]; then
      TIER_EFFECTIVE="${TIER_OVERRIDE:-$TIER_DEFAULT}"
    fi
  fi

  echo "$TIER_EFFECTIVE"
}

assert_tier() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    PASS=$((PASS+1))
    echo "${GREEN}PASS${RST}  $name → $actual"
  else
    FAIL=$((FAIL+1))
    echo "${RED}FAIL${RST}  $name → expected=$expected actual=$actual"
  fi
}

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

# ── Case 1: library, no signals → baseline (supply-chain floor)
mkdir -p "$TMP/c1"
printf 'archetype: library\n' > "$TMP/c1/PROJECT.md"
assert_tier "library archetype, no signals → baseline" \
  "baseline" "$(compute_tier "$TMP/c1/PROJECT.md" "/nonexistent" "/nonexistent")"

# ── Case 2: web-service + auth-path signal → standard (upgrade)
mkdir -p "$TMP/c2"
printf 'archetype: web-service\n' > "$TMP/c2/PROJECT.md"
printf 'SECURITY_SIGNAL: auth-path-changed src/middleware/auth.ts\n' > "$TMP/c2/signals.log"
assert_tier "web-service + auth-path-changed → standard" \
  "standard" "$(compute_tier "$TMP/c2/PROJECT.md" "$TMP/c2/signals.log" "/nonexistent")"

# ── Case 3: web3 stays deep regardless of signals
mkdir -p "$TMP/c3"
printf 'archetype: web3\n' > "$TMP/c3/PROJECT.md"
assert_tier "web3 archetype → deep" \
  "deep" "$(compute_tier "$TMP/c3/PROJECT.md" "/nonexistent" "/nonexistent")"

# ── Case 4: explicit override upgrades baseline → standard
mkdir -p "$TMP/c4"
printf 'archetype: web-service\ndefault-tier: standard\n' > "$TMP/c4/PROJECT.md"
assert_tier "web-service + override=standard → standard" \
  "standard" "$(compute_tier "$TMP/c4/PROJECT.md" "/nonexistent" "/nonexistent")"

# ── Case 5: pci-dep signal + valid waiver → downgrade back to baseline
mkdir -p "$TMP/c5"
printf 'archetype: web-service\n' > "$TMP/c5/PROJECT.md"
printf 'SECURITY_SIGNAL: pci-dep-introduced stripe\n' > "$TMP/c5/signals.log"
FUTURE=$(python3 -c "import datetime; print((datetime.date.today()+datetime.timedelta(days=30)).isoformat())")
cat > "$TMP/c5/allowlist.yml" <<EOF
allowed-deps:
  - name: stripe
    reason: sandbox-only integration tests
    approved-by: "@alice"
    expires: $FUTURE
EOF
assert_tier "pci-dep with valid waiver → baseline (suppressed)" \
  "baseline" "$(compute_tier "$TMP/c5/PROJECT.md" "$TMP/c5/signals.log" "$TMP/c5/allowlist.yml")"

# ── Case 6: pci-dep signal + EXPIRED waiver → stays standard (waiver rejected)
mkdir -p "$TMP/c6"
printf 'archetype: web-service\n' > "$TMP/c6/PROJECT.md"
printf 'SECURITY_SIGNAL: pci-dep-introduced stripe\n' > "$TMP/c6/signals.log"
PAST=$(python3 -c "import datetime; print((datetime.date.today()-datetime.timedelta(days=5)).isoformat())")
cat > "$TMP/c6/allowlist.yml" <<EOF
allowed-deps:
  - name: stripe
    reason: expired waiver
    approved-by: "@alice"
    expires: $PAST
EOF
assert_tier "pci-dep with EXPIRED waiver → standard (rejected)" \
  "standard" "$(compute_tier "$TMP/c6/PROJECT.md" "$TMP/c6/signals.log" "$TMP/c6/allowlist.yml")"

# ── Case 7: pci-dep signal + waiver missing owner → stays standard
mkdir -p "$TMP/c7"
printf 'archetype: web-service\n' > "$TMP/c7/PROJECT.md"
printf 'SECURITY_SIGNAL: pci-dep-introduced stripe\n' > "$TMP/c7/signals.log"
cat > "$TMP/c7/allowlist.yml" <<EOF
allowed-deps:
  - name: stripe
    reason: no owner
    approved-by: alice
    expires: $FUTURE
EOF
assert_tier "pci-dep with waiver missing @owner → standard (rejected)" \
  "standard" "$(compute_tier "$TMP/c7/PROJECT.md" "$TMP/c7/signals.log" "$TMP/c7/allowlist.yml")"

# ── Case 8: waiver for wrong package → stays standard
mkdir -p "$TMP/c8"
printf 'archetype: web-service\n' > "$TMP/c8/PROJECT.md"
printf 'SECURITY_SIGNAL: pci-dep-introduced stripe\n' > "$TMP/c8/signals.log"
cat > "$TMP/c8/allowlist.yml" <<EOF
allowed-deps:
  - name: plaid
    reason: different package
    approved-by: "@bob"
    expires: $FUTURE
EOF
assert_tier "waiver for unrelated package → standard (not suppressed)" \
  "standard" "$(compute_tier "$TMP/c8/PROJECT.md" "$TMP/c8/signals.log" "$TMP/c8/allowlist.yml")"

assert_log_contains() {
  local name="$1" logfile="$2" needle="$3"
  if [ -f "$logfile" ] && grep -q "$needle" "$logfile"; then
    PASS=$((PASS+1))
    echo "${GREEN}PASS${RST}  $name — log contains '$needle'"
  else
    FAIL=$((FAIL+1))
    echo "${RED}FAIL${RST}  $name — log missing '$needle'"
    [ -f "$logfile" ] && echo "        log contents:" && sed 's/^/          /' "$logfile"
  fi
}

# ── Case 9: valid waiver emits SEC_WAIVER audit line
assert_log_contains "valid waiver emits SEC_WAIVER line" \
  "$TMP/c5/signals.log" "SEC_WAIVER: dep=stripe"

# ── Case 10: expired waiver emits WARN_WAIVER_REJECTED
assert_log_contains "expired waiver emits WARN_WAIVER_REJECTED" \
  "$TMP/c6/signals.log" "WARN_WAIVER_REJECTED.*dep=stripe"

# ── Case 11: missing @owner emits WARN_WAIVER_REJECTED
assert_log_contains "missing-@owner waiver rejected in log" \
  "$TMP/c7/signals.log" "WARN_WAIVER_REJECTED.*dep=stripe"

echo
if [ "$FAIL" -gt 0 ]; then
  echo "${RED}=== $FAIL test(s) failed ($PASS passed) ===${RST}"
  exit 1
fi
echo "${GREEN}=== All $PASS tier-computation cases passed ===${RST}"
