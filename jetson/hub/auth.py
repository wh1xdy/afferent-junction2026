"""Access control for the hub: two bearer tokens, two roles.

  PATIENT    everything: ingest (POST /sessions, POST /phq9) and all reads
  CLINICIAN  reads only: /summary, /report/*, /fhir, POST /ask

Tokens come from AFFERENT_PATIENT_TOKEN / AFFERENT_CLINICIAN_TOKEN. A role without an env token
gets a random one on first start, stored next to the database (file mode 600) and printed to the
log that one time, so the owner can read it from the device logs.

A browser opening a report with ?token=... gets an HttpOnly cookie and a redirect to the same URL
without the token. The cookie does not hold the token: it is an HMAC of it, valid for the report
pages only, so a leaked cookie cannot be used as a bearer token.
"""
import hashlib
import hmac
import json
import os
import secrets

PATIENT, CLINICIAN = "patient", "clinician"
ROLES = (PATIENT, CLINICIAN)
ENV = {PATIENT: "AFFERENT_PATIENT_TOKEN", CLINICIAN: "AFFERENT_CLINICIAN_TOKEN"}
CAN = {PATIENT: "read + write", CLINICIAN: "read only"}
COOKIE = "afferent_report"
COOKIE_MAX_AGE = 12 * 3600
MIN_LENGTH = 16


def _read(path):
    try:
        if os.stat(path).st_mode & 0o077:
            os.chmod(path, 0o600)
        with open(path) as f:
            doc = json.load(f)
    except (OSError, ValueError):
        return {}
    if not isinstance(doc, dict):
        return {}
    return {r: doc[r] for r in ROLES if isinstance(doc.get(r), str) and len(doc[r]) >= MIN_LENGTH}


def _write(path, doc):
    """atomically, never readable by others (the mode is set before any byte is written)"""
    tmp = f"{path}.{os.getpid()}.tmp"
    try:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            os.fchmod(fd, 0o600)
            os.write(fd, json.dumps(doc).encode())
            os.fsync(fd)
        finally:
            os.close(fd)
        os.replace(tmp, path)
        return True
    except OSError:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        return False


def load_tokens(path, env=None, log=print):
    """{role: token}. Env wins; otherwise the stored token; otherwise a new one, stored and logged once."""
    env = os.environ if env is None else env
    tokens = {r: (env.get(ENV[r]) or "").strip() for r in ROLES}
    source = {r: "env" for r in ROLES if tokens[r]}
    missing = [r for r in ROLES if not tokens[r]]
    if missing:
        saved = _read(path)
        new = [r for r in missing if r not in saved]
        for r in new:
            saved[r] = secrets.token_urlsafe(32)          # 256 bits
        for r in missing:
            tokens[r] = saved[r]
            source[r] = "generated" if r in new else "file"
        if new:
            stored = _write(path, saved)
            where = (f"stored in {path} (mode 600), shown only this once" if stored else
                     f"could NOT be stored in {path}: valid until restart only")
            log(f"afferent-hub access tokens, {where}:")
            for r in new:
                log(f"  {r.upper():<9} ({CAN[r]}): {saved[r]}")
    if tokens[PATIENT] == tokens[CLINICIAN]:
        raise ValueError("patient and clinician tokens must differ (a shared token would let the clinician write)")
    for r in ROLES:
        if len(tokens[r]) < MIN_LENGTH:
            log(f"auth: WARNING {ENV[r]} is shorter than {MIN_LENGTH} characters")
    log("auth: " + ", ".join(f"{r} token: {source[r]}" for r in ROLES))
    return tokens


def _same(a, b):
    """constant time, and without leaking the length"""
    return hmac.compare_digest(hashlib.sha256(a.encode("utf-8", "replace")).digest(),
                               hashlib.sha256(b.encode("utf-8", "replace")).digest())


def role_for(presented, tokens):
    """role of a presented bearer token, or None; always compares against both"""
    role = None
    for r in ROLES:
        if presented and tokens.get(r) and _same(presented, tokens[r]):
            role = r
    return role


def bearer(header):
    """token from an Authorization header value, or None"""
    scheme, _, value = (header or "").strip().partition(" ")
    if scheme.lower() != "bearer":
        return None
    return value.strip() or None


def session_value(role, tokens):
    return hmac.new(tokens[role].encode("utf-8", "replace"), b"afferent report session", hashlib.sha256).hexdigest()


def role_for_session(value, tokens):
    """role of a report cookie, or None"""
    role = None
    for r in ROLES:
        if value and tokens.get(r) and _same(value, session_value(r, tokens)):
            role = r
    return role


def set_cookie(role, tokens):
    """Set-Cookie value for the report pages. No Secure flag: the hub is plain HTTP on the mesh / a local
    forward. Lax, not Strict: a link opened from a mail client must still work after the redirect, and the
    cookie only ever opens the read-only report pages."""
    return (f"{COOKIE}={session_value(role, tokens)}; HttpOnly; SameSite=Lax; Path=/report; "
            f"Max-Age={COOKIE_MAX_AGE}")
