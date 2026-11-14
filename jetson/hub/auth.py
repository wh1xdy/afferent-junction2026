"""Access control for the hub: one bearer token, and it is the patient's.

The hub belongs to the patient. There is no second role: nobody else gets a token, a login or a
view. What a doctor sees is what the patient hands over (the printed handover report, the FHIR file).

The token comes from AFFERENT_PATIENT_TOKEN. Without it the hub makes a random one on first start,
stores it next to the database (file mode 600) and prints it to the log that one time, so the
owner can read it from the device logs.

A token file written by an older hub may still hold a "clinician" entry. It grants nothing any
more: only the patient entry is read, and the old entry is dropped from the file at the next start
(also when the patient token comes from the environment).

A browser opening a report with ?token=... gets an HttpOnly cookie and a redirect to the same URL
without the token. The cookie does not hold the token: it is an expiry time and an HMAC of that
time under the token. It is valid for the report pages only and for COOKIE_MAX_AGE, checked by the
hub itself, so a leaked cookie cannot be used as a bearer token and stops working after 12 hours.
"""
import hashlib
import hmac
import json
import os
import secrets
import time

KEY = "patient"                         # the token's name in the token file
ENV = "AFFERENT_PATIENT_TOKEN"
RETIRED_ENV = "AFFERENT_CLINICIAN_TOKEN"
COOKIE = "afferent_report"
COOKIE_MAX_AGE = 12 * 3600
MIN_LENGTH = 16


def _read(path):
    """(the stored patient token or None, whether the file holds anything else)"""
    try:
        if os.stat(path).st_mode & 0o077:
            os.chmod(path, 0o600)
        with open(path) as f:
            doc = json.load(f)
    except (OSError, ValueError):
        return None, False
    if not isinstance(doc, dict):
        return None, False
    token = doc.get(KEY)
    if not isinstance(token, str) or len(token) < MIN_LENGTH:
        token = None
    return token, any(k != KEY for k in doc)


def _write(path, token):
    """atomically, never readable by others (the mode is set before any byte is written)"""
    tmp = f"{path}.{os.getpid()}.tmp"
    try:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            os.fchmod(fd, 0o600)
            os.write(fd, json.dumps({KEY: token}).encode())
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


def _remove(path):
    try:
        os.unlink(path)
        return True
    except OSError:
        return False


def load_token(path, env=None, log=print):
    """The patient token. Env wins; otherwise the stored token; otherwise a new one, stored and logged once."""
    env = os.environ if env is None else env
    if (env.get(RETIRED_ENV) or "").strip():
        log(f"auth: {RETIRED_ENV} is set but no longer used: the hub has no clinician access")
    stored, leftovers = _read(path)
    if leftovers:                                         # whichever token is used: the old entries go
        if stored and _write(path, stored):
            log(f"auth: dropped the entries of an older hub from {path}; only the patient token is kept")
        elif not stored and _remove(path):
            log(f"auth: removed {path}: it held only entries of an older hub")
    token = (env.get(ENV) or "").strip()
    source = "env"
    if not token:
        token, source = stored, "file"
        if not token:
            token = secrets.token_urlsafe(32)             # 256 bits
            source = "generated"
            written = _write(path, token)
            where = (f"stored in {path} (mode 600), shown only this once" if written else
                     f"could NOT be stored in {path}: valid until restart only")
            log(f"afferent-hub access token, {where}:")
            log(f"  PATIENT: {token}")
    if len(token) < MIN_LENGTH:
        log(f"auth: WARNING {ENV} is shorter than {MIN_LENGTH} characters")
    log(f"auth: patient token: {source}")
    return token


def _same(a, b):
    """constant time, and without leaking the length"""
    return hmac.compare_digest(hashlib.sha256(a.encode("utf-8", "replace")).digest(),
                               hashlib.sha256(b.encode("utf-8", "replace")).digest())


def valid(presented, token):
    """whether a presented bearer token is the patient token"""
    return bool(presented and token) and _same(presented, token)


def bearer(header):
    """token from an Authorization header value, or None"""
    scheme, _, value = (header or "").strip().partition(" ")
    if scheme.lower() != "bearer":
        return None
    return value.strip() or None


def _sign(token, expires):
    return hmac.new(token.encode("utf-8", "replace"), f"afferent report session {expires}".encode(),
                    hashlib.sha256).hexdigest()


def session_value(token, expires=None):
    """a report cookie: `<unix time it expires>.<HMAC of that time under the token>`"""
    expires = int(time.time() + COOKIE_MAX_AGE if expires is None else expires)
    return f"{expires}.{_sign(token, expires)}"


def valid_session(value, token, now=None):
    """whether a report cookie was made from the patient token and has not expired"""
    expires, _, mac = (value or "").partition(".")
    if not (token and mac and expires.isascii() and expires.isdigit() and len(expires) <= 12):
        return False
    signed = _same(mac, _sign(token, int(expires)))
    return signed and int(expires) > (time.time() if now is None else now)


def set_cookie(token):
    """Set-Cookie value for the report pages. No Secure flag: the hub is plain HTTP on the mesh / a local
    forward. Lax, not Strict: a link the patient opens from another app must still work after the
    redirect, and the cookie only ever opens the read-only report pages."""
    return (f"{COOKIE}={session_value(token)}; HttpOnly; SameSite=Lax; Path=/report; "
            f"Max-Age={COOKIE_MAX_AGE}")
