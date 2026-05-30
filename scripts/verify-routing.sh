#!/usr/bin/env bash
#
# verify-routing.sh — Confirm the Worker production routing is live.
#
# Canonical host: www.serhiichernenko.com (the Worker routes are bound to www).
# The bare apex serhiichernenko.com 301-redirects to www via a Cloudflare
# Redirect Rule (dashboard -> Rules -> Redirect Rules).
#
# Checks, in order:
#   1. The canonical host (www) resolves (A and/or AAAA record present).
#   2. www is proxied: resolves to a public Cloudflare edge IP, not 100::.
#   3. www/blog serves the Worker (same-host 308 -> /blog/en/, then 2xx).
#   4. The bare apex /blog 301-redirects to the canonical www host.
#
# Pure dig/curl — no Cloudflare auth required. Prints PASS/FAIL per check
# and a clear final summary. Exit code is non-zero if any check fails.
#
# See docs/DNS-ROUTING.md for what each result means and how to fix failures.

set -euo pipefail

APEX="serhiichernenko.com"
CANON="www.serhiichernenko.com"
BLOG_BARE="https://${CANON}/blog"
BLOG_EN="https://${CANON}/blog/en/"
APEX_BLOG="https://${APEX}/blog"
CURL_TIMEOUT=15

# --- colors (disabled when not a TTY) ---------------------------------------
if [ -t 1 ]; then
  GREEN=$'\033[0;32m'; RED=$'\033[0;31m'; YELLOW=$'\033[0;33m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
else
  GREEN=""; RED=""; YELLOW=""; BOLD=""; RESET=""
fi

PASS_COUNT=0
FAIL_COUNT=0

pass() { printf '%s[PASS]%s %s\n' "$GREEN" "$RESET" "$1"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { printf '%s[FAIL]%s %s\n' "$RED" "$RESET" "$1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
info() { printf '%s[ ?? ]%s %s\n' "$YELLOW" "$RESET" "$1"; }

# curl_code URL [extra-args...] -> prints just the HTTP status (000 on failure).
# curl already emits 000 on connection failure; we swallow its non-zero exit so
# `set -e` does not abort, and avoid double-printing.
curl_code() {
  local url="$1"; shift
  curl -sS -o /dev/null -m "$CURL_TIMEOUT" -w '%{http_code}' "$@" "$url" 2>/dev/null || true
}

# curl_location URL -> prints the single-hop Location header value (empty if none).
curl_location() {
  curl -sS -I -m "$CURL_TIMEOUT" "$1" 2>/dev/null \
    | grep -i '^location:' | head -n1 | awk '{print $2}' | tr -d '\r' || true
}

# host_of URL-or-path -> the hostname (empty for a path-relative Location).
host_of() { printf '%s' "$1" | sed -E 's#^[a-zA-Z]+://##; s#[/:].*$##'; }

# is_cf_ip IPv4 -> 0 if it falls in a common Cloudflare edge range (proxied).
# Covers 104.16.0.0/13 and 172.64.0.0/13 (what CF hands out for proxied hosts,
# e.g. 104.21.x.x / 172.67.x.x). Heuristic, not exhaustive — used only when an
# IPv4-only answer means we can't fall back to the IPv6 discard-address check.
is_cf_ip() {
  case "$1" in
    104.1[6-9].*|104.2[0-7].*|172.6[4-9].*|172.7[01].*) return 0 ;;
    *) return 1 ;;
  esac
}

# --- preflight: required tools ----------------------------------------------
for tool in dig curl; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf '%sMissing required tool: %s%s\n' "$RED" "$tool" "$RESET" >&2
    exit 2
  fi
done

printf '%s== Verifying production routing (canonical host: %s) ==%s\n\n' "$BOLD" "$CANON" "$RESET"

# --- Check 1: canonical host (www) resolves (A and/or AAAA) -----------------
# www is a CNAME -> apex -> proxied placeholder; grep keeps only the final IP,
# dropping the CNAME-target line that +short prints first.
A_REC="$(dig +short "$CANON" A    | grep -E '^[0-9.]+$'        | head -n1 || true)"
AAAA_REC="$(dig +short "$CANON" AAAA | grep -E '^[0-9a-fA-F:]+$' | head -n1 || true)"

if [ -n "$A_REC" ] || [ -n "$AAAA_REC" ]; then
  pass "Canonical host resolves (A='${A_REC:-none}' AAAA='${AAAA_REC:-none}')"
else
  fail "${CANON} does NOT resolve. Ensure the www record (CNAME -> ${APEX}) and the apex AAAA @ -> 100:: are both Proxied. See docs/DNS-ROUTING.md. (If public resolvers DO resolve it, your local DNS cached the old negative — see Troubleshooting #2.)"
fi

# --- Check 2: proxied (resolves to a CF edge IP, not the 100:: discard addr) -
if [ -n "$AAAA_REC" ]; then
  case "$AAAA_REC" in
    100::|0100::*|"::"|::1)
      fail "AAAA resolves to the discard address ($AAAA_REC) — record is DNS-only, not Proxied. Toggle the orange cloud ON."
      ;;
    *)
      pass "Resolves to a Cloudflare edge IP (AAAA='${AAAA_REC}'${A_REC:+ A=\'${A_REC}\'}) — proxied as expected"
      ;;
  esac
elif [ -n "$A_REC" ]; then
  # IPv4-only answer: no IPv6 discard address to test, so confirm the A is in a
  # Cloudflare edge range rather than assuming the record is proxied.
  if is_cf_ip "$A_REC"; then
    pass "Resolves to a Cloudflare edge IPv4 ($A_REC) — proxied as expected"
  else
    fail "Resolves to $A_REC, NOT a known Cloudflare edge range — the record may be DNS-only (not Proxied). Toggle the orange cloud ON."
  fi
else
  fail "No record to evaluate for proxy status (${CANON} unresolved)."
fi

# --- Check 3: www/blog serves the Worker (same-host 308 -> /blog/en/ -> 2xx) -
# The Worker is bound to www. A redirect that leaves the www host means a
# Redirect Rule / route is hijacking the canonical host.
WWW_LOC="$(curl_location "$BLOG_BARE")"
WWW_LOC_HOST="$(host_of "$WWW_LOC")"
if [ -n "$WWW_LOC_HOST" ] && [ "$WWW_LOC_HOST" != "$CANON" ]; then
  fail "Canonical ${BLOG_BARE} redirects OFF-host to ${WWW_LOC_HOST} — the Worker should serve www directly. Check that no Redirect Rule rewrites www, and that routes target ${CANON}. See docs/DNS-ROUTING.md."
else
  EN_CODE="$(curl_code "$BLOG_EN")"
  if printf '%s' "$EN_CODE" | grep -qE '^2[0-9][0-9]$'; then
    pass "GET ${BLOG_EN} -> HTTP ${EN_CODE} (Worker serves canonical www over HTTPS)"
  elif printf '%s' "$EN_CODE" | grep -qE '^3[0-9][0-9]$'; then
    pass "GET ${BLOG_EN} -> HTTP ${EN_CODE} (3xx; Worker reachable on www)"
  else
    # HTTPS failed — maybe Universal SSL not provisioned yet. Probe HTTP.
    EN_HTTP_CODE="$(curl_code "http://${CANON}/blog/en/")"
    if printf '%s' "$EN_HTTP_CODE" | grep -qE '^(2|3)[0-9][0-9]$'; then
      fail "HTTPS returned ${EN_CODE} but HTTP returned ${EN_HTTP_CODE} on www — route works, Universal SSL likely still provisioning (up to 24h). Re-run later."
    else
      fail "GET ${BLOG_EN} -> HTTP ${EN_CODE} (and http:// -> ${EN_HTTP_CODE}). Worker not reachable on www yet."
    fi
  fi
fi

# --- Check 4: bare apex /blog 301-redirects to the canonical www host -------
APEX_LOC="$(curl_location "$APEX_BLOG")"
APEX_LOC_HOST="$(host_of "$APEX_LOC")"
APEX_CODE="$(curl_code "$APEX_BLOG")"
if [ "$APEX_LOC_HOST" = "$CANON" ]; then
  pass "Apex ${APEX_BLOG} -> HTTP ${APEX_CODE} -> ${APEX_LOC} (redirects to canonical www)"
elif [ -z "$APEX_LOC" ]; then
  fail "Apex ${APEX_BLOG} does NOT redirect to www (HTTP ${APEX_CODE}, no Location). Add/keep the apex->www Redirect Rule in Rules -> Redirect Rules. See docs/DNS-ROUTING.md."
elif [ -z "$APEX_LOC_HOST" ]; then
  fail "Apex ${APEX_BLOG} issues a relative/same-host redirect (Location: ${APEX_LOC}) — expected an ABSOLUTE 301 to https://${CANON}. Make the Redirect Rule target absolute, e.g. concat(\"https://${CANON}\", http.request.uri.path)."
else
  fail "Apex ${APEX_BLOG} redirects to '${APEX_LOC_HOST}', expected '${CANON}'. Fix the apex->www Redirect Rule."
fi

# --- informational: email records are a separate concern --------------------
MX_REC="$(dig +short "$APEX" MX | head -n1 || true)"
if [ -n "$MX_REC" ]; then
  info "MX present ('${MX_REC}') — Email Routing DNS looks set (separate from routing)."
else
  info "No apex MX record — Email Routing / MAIL_FROM will not work (separate from this fix; see GO-LIVE step 5)."
fi

# --- summary ----------------------------------------------------------------
printf '\n%s== Summary: %d passed, %d failed ==%s\n' "$BOLD" "$PASS_COUNT" "$FAIL_COUNT" "$RESET"
if [ "$FAIL_COUNT" -eq 0 ]; then
  printf '%sRouting is LIVE on %s.%s\n' "$GREEN" "$CANON" "$RESET"
  exit 0
else
  printf '%sRouting is NOT fully live. See docs/DNS-ROUTING.md.%s\n' "$RED" "$RESET"
  exit 1
fi
