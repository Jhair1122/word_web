import os
import re
import time
import uuid
import hmac
import hashlib
import secrets
import threading
import urllib.request
from collections import defaultdict, deque
from functools import wraps
from flask import Flask, render_template, request, send_file, jsonify, g, redirect
from supabase import create_client
from postgrest.exceptions import APIError
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from copy import deepcopy
from io import BytesIO
from pathlib import Path
from datetime import datetime

app = Flask(__name__)
BASE_DIR = Path(__file__).resolve().parent
TEMPLATE_PATH = BASE_DIR / "plantilla.docx"

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

# ---------------------------------------------------------------------------
# Configuración de seguridad
# ---------------------------------------------------------------------------
# Cantidad de proxies de confianza delante de la app (Render = 1 por defecto).
# Si ves que todas las IP en los logs son iguales, ajusta TRUSTED_PROXIES.
TRUSTED_PROXIES = int(os.environ.get("TRUSTED_PROXIES", "1"))
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=TRUSTED_PROXIES, x_proto=1, x_host=1)

# Tamaño máximo de cualquier petición (los respaldos JSON grandes caben de sobra).
app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024

# Política de contraseñas (NIST SP 800-63B-4): 15 si la contraseña es el único factor.
# Se puede bajar con la variable de entorno MIN_PASSWORD_LENGTH si la institución lo requiere.
MIN_PASSWORD_LENGTH = int(os.environ.get("MIN_PASSWORD_LENGTH", "15"))
MAX_PASSWORD_LENGTH = 128

# Límites de datos de las páginas
MAX_PAGES = 500
MAX_ITEMS_PER_PAGE = 200
MAX_SHORT_FIELD = 200
MAX_DESCRIPTION = 3000

# "enforce" aplica la CSP; "report-only" solo la reporta en la consola del navegador.
CSP_MODE = os.environ.get("CSP_MODE", "report-only").lower()


# ---------------------------------------------------------------------------
# Limitador de solicitudes en memoria (por proceso)
# ---------------------------------------------------------------------------
class RateLimiter:
    """Ventana deslizante simple. Es por proceso: si gunicorn usa varios workers,
    cada uno cuenta por separado (usa --workers 1 o un almacén compartido como Redis)."""

    def __init__(self):
        self._hits = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, q, now, window):
        while q and now - q[0] >= window:
            q.popleft()

    def blocked(self, key, limit, window):
        """Devuelve 0 si se puede continuar o los segundos que faltan para reintentar."""
        now = time.monotonic()
        with self._lock:
            q = self._hits.get(key)
            if not q:
                return 0
            self._prune(q, now, window)
            if not q:
                self._hits.pop(key, None)
                return 0
            if len(q) >= limit:
                return int(window - (now - q[0])) + 1
            return 0

    def hit(self, key):
        with self._lock:
            if len(self._hits) > 20000:
                self._hits = defaultdict(deque, {k: v for k, v in self._hits.items() if v})
            self._hits[key].append(time.monotonic())

    def reset(self, key):
        with self._lock:
            self._hits.pop(key, None)


limiter = RateLimiter()


def too_many(retry_after):
    if retry_after >= 60:
        minutes = (retry_after + 59) // 60
        wait_text = f"{minutes} minuto" + ("s" if minutes != 1 else "")
    else:
        wait_text = f"{retry_after} segundos"
    resp = jsonify({"error": f"Demasiados intentos. Intenta de nuevo en {wait_text}."})
    resp.status_code = 429
    resp.headers["Retry-After"] = str(retry_after)
    return resp


def rate_limit(scope, limit, window):
    """Limita por usuario autenticado (g.user_id) o por admin (g.admin_id). Cuenta cada solicitud."""
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            ident = getattr(g, "user_id", None) or getattr(g, "admin_id", None) or request.remote_addr
            key = f"{scope}:{ident}"
            wait = limiter.blocked(key, limit, window)
            if wait:
                return too_many(wait)
            limiter.hit(key)
            return f(*args, **kwargs)
        return wrapper
    return decorator


# ---------------------------------------------------------------------------
# Errores: siempre JSON, mensajes genéricos; el detalle va al log del servidor
# ---------------------------------------------------------------------------
HTTP_MESSAGES = {
    400: "Solicitud inválida.",
    401: "No autorizado.",
    403: "No tienes permiso para esta acción.",
    404: "Ruta no encontrada.",
    405: "Método no permitido.",
    413: "La solicitud es demasiado grande.",
    415: "Tipo de contenido no soportado.",
    429: "Demasiadas solicitudes. Intenta de nuevo en unos segundos.",
}


@app.errorhandler(HTTPException)
def handle_http_error(e):
    code = e.code or 500
    return jsonify({"error": HTTP_MESSAGES.get(code, "Error en la solicitud.")}), code


@app.errorhandler(Exception)
def handle_unexpected_error(e):
    app.logger.exception("Error no manejado")
    return jsonify({"error": "Error interno del servidor."}), 500


# ---------------------------------------------------------------------------
# Cabeceras de seguridad
# ---------------------------------------------------------------------------
def build_csp():
    supabase_origin = (SUPABASE_URL or "").rstrip("/")
    ws_origin = supabase_origin.replace("https://", "wss://", 1) if supabase_origin else ""
    connect = " ".join(x for x in ["'self'", supabase_origin, ws_origin] if x)
    return "; ".join([
        "default-src 'self'",
        "script-src 'self' https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        f"connect-src {connect}",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ])


@app.after_request
def add_security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "same-origin")
    resp.headers.setdefault("X-Robots-Tag", "noindex, nofollow")
    resp.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    header = "Content-Security-Policy" if CSP_MODE == "enforce" else "Content-Security-Policy-Report-Only"
    resp.headers.setdefault(header, build_csp())
    if request.is_secure:
        resp.headers.setdefault("Strict-Transport-Security", "max-age=31536000")
    if not request.path.startswith("/static/"):
        resp.headers.setdefault("Cache-Control", "no-store")
    return resp


# ---------------------------------------------------------------------------
# Autenticación y autorización
# ---------------------------------------------------------------------------
def require_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "No autorizado. Inicia sesión."}), 401

        token = auth_header.split(" ", 1)[1]
        anon_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
        try:
            user_resp = anon_client.auth.get_user(token)
            if not user_resp or not user_resp.user:
                return jsonify({"error": "Sesión inválida o expirada."}), 401
        except Exception:
            return jsonify({"error": "Sesión inválida o expirada."}), 401

        user_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
        user_client.postgrest.auth(token)
        g.supabase = user_client
        g.user_id = user_resp.user.id
        return f(*args, **kwargs)
    return wrapper


def require_admin(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "No autorizado."}), 401
        token = auth_header.split(" ", 1)[1]

        anon_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
        try:
            user_resp = anon_client.auth.get_user(token)
            if not user_resp or not user_resp.user:
                return jsonify({"error": "Sesión inválida."}), 401
        except Exception:
            return jsonify({"error": "Sesión inválida."}), 401

        uid = user_resp.user.id
        service = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        prof_resp = service.table("profiles").select("is_admin").eq("id", uid).execute()
        rows = prof_resp.data or []
        if not rows or not rows[0].get("is_admin"):
            return jsonify({"error": "Se requieren permisos de administrador."}), 403

        g.service_client = service
        g.admin_id = uid
        return f(*args, **kwargs)
    return wrapper


def is_request_from_admin_cookie():
    """
    Verifica, a partir de la cookie sb_access_token (reflejo de la sesión de
    Supabase mantenido por static/auth-sync.js), si quien hace la petición
    de navegación (GET) es un administrador. Se usa para bloquear el render
    de páginas HTML completas, no solo las llamadas a la API.
    """
    token = request.cookies.get("sb_access_token")
    if not token:
        return False

    anon_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    try:
        user_resp = anon_client.auth.get_user(token)
        if not user_resp or not user_resp.user:
            return False
    except Exception:
        return False

    service = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    try:
        prof_resp = service.table("profiles").select("is_admin").eq("id", user_resp.user.id).execute()
    except Exception:
        return False

    rows = prof_resp.data or []
    return bool(rows and rows[0].get("is_admin"))


# ---------------------------------------------------------------------------
# Validación de entradas
# ---------------------------------------------------------------------------
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
PAGE_FIELDS = ("id", "caja", "cod_serie", "sobre", "codigo", "seccion",
               "serie_doc", "fecha_inicio", "fecha_final", "anio")


def _text(value, max_len):
    """Convierte a texto, quita caracteres de control (rompen el XML del Word) y limita el largo."""
    text = "" if value is None else str(value)
    text = _CONTROL_CHARS.sub("", text)
    if len(text) > max_len:
        raise ValueError("Uno de los campos supera el largo permitido.")
    return text


def clean_pages(entries):
    """Valida y limpia la lista de páginas recibida del cliente. Lanza ValueError si es inválida."""
    if not isinstance(entries, list):
        raise ValueError("Formato inválido.")
    if len(entries) > MAX_PAGES:
        raise ValueError(f"Máximo {MAX_PAGES} páginas por documento.")

    cleaned = []
    for raw in entries:
        if not isinstance(raw, dict):
            raise ValueError("Formato inválido.")
        page = {field: _text(raw.get(field), MAX_SHORT_FIELD) for field in PAGE_FIELDS}

        raw_items = raw.get("items")
        if isinstance(raw_items, list) and raw_items:
            if len(raw_items) > MAX_ITEMS_PER_PAGE:
                raise ValueError(f"Máximo {MAX_ITEMS_PER_PAGE} cuadros por página.")
            items = []
            for it in raw_items:
                if not isinstance(it, dict):
                    raise ValueError("Formato inválido.")
                items.append({
                    "subserie": _text(it.get("subserie"), MAX_SHORT_FIELD),
                    "descripcion": _text(it.get("descripcion"), MAX_DESCRIPTION),
                    "folio": _text(it.get("folio"), MAX_SHORT_FIELD),
                })
        else:
            # Formato antiguo: un solo cuadro con campos sueltos
            items = [{
                "subserie": _text(raw.get("subserie"), MAX_SHORT_FIELD),
                "descripcion": _text(raw.get("descripcion"), MAX_DESCRIPTION),
                "folio": _text(raw.get("folio"), MAX_SHORT_FIELD),
            }]
        page["items"] = items
        cleaned.append(page)
    return cleaned


def safe_filename(name):
    name = re.sub(r"[^\w .\-]", "", str(name or ""), flags=re.UNICODE).strip()[:100]
    if not name:
        name = "documento_pangoa"
    if not name.lower().endswith(".docx"):
        name += ".docx"
    return name


def ilike_exact(value):
    """Escapa los comodines de LIKE para que ilike se comporte como igualdad sin distinguir mayúsculas."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


COMMON_PASSWORDS = {
    "password", "password1", "contrasena", "contraseña", "123456789", "1234567890",
    "12345678901234", "123456789012345", "qwertyuiop", "qwertyuiopasdf", "abcdefghijklmno",
    "iloveyou", "administrador", "administrator", "municipalidad", "pangoa", "pangoa2024",
    "pangoa2025", "pangoa2026", "bienvenido", "bienvenida", "letmein", "welcome",
}


PWNED_CHECK = os.environ.get("PWNED_CHECK", "on").lower() != "off"


def password_is_pwned(password):
    """Consulta Have I Been Pwned por rangos (k-anonimato): solo se envían los 5 primeros caracteres
    del hash SHA-1, nunca la contraseña. Si el servicio no responde, no bloquea (falla abierta)."""
    if not PWNED_CHECK:
        return False
    try:
        digest = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
        prefix, suffix = digest[:5], digest[5:]
        req = urllib.request.Request(
            f"https://api.pwnedpasswords.com/range/{prefix}",
            headers={"Add-Padding": "true", "User-Agent": "pangoa-generador-sobres"},
        )
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            body = resp.read(200000).decode("utf-8", "ignore")
        for line in body.splitlines():
            tail, _, count = line.partition(":")
            if tail.strip() == suffix and count.strip() not in ("", "0"):
                return True
    except Exception:
        return False
    return False


def validate_password(password, username=""):
    """Devuelve un mensaje de error o None si la contraseña es aceptable."""
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres. Puedes usar una frase con espacios."
    if len(password) > MAX_PASSWORD_LENGTH:
        return f"La contraseña no puede superar {MAX_PASSWORD_LENGTH} caracteres."
    low = password.lower()
    plain = re.sub(r"[^a-z0-9ñ]", "", low)
    if low in COMMON_PASSWORDS or plain in COMMON_PASSWORDS or len(set(password)) <= 3:
        return "Esa contraseña es demasiado común o predecible. Elige otra."
    if username and len(username) >= 3 and username in low:
        return "La contraseña no debe contener el nombre de usuario."
    if password_is_pwned(password):
        return "Esa contraseña apareció en filtraciones de datos conocidas. Elige otra distinta."
    return None


def set_cell_value(cell, value, bold=None):
    value = "" if value is None else str(value)
    paragraphs = cell._tc.xpath(".//w:p")
    if not paragraphs:
        p = OxmlElement("w:p")
        cell._tc.append(p)
        paragraphs = [p]

    p = paragraphs[0]
    runs = p.xpath("./w:r")

    for run in runs:
        for t in run.xpath("./w:t"):
            run.remove(t)

    if runs:
        run = runs[0]
    else:
        run = OxmlElement("w:r")
        p.append(run)

    if bold is not None:
        rpr = run.find(qn("w:rPr"))
        if rpr is None:
            rpr = OxmlElement("w:rPr")
            run.insert(0, rpr)
        old_b = rpr.find(qn("w:b"))
        if old_b is not None:
            rpr.remove(old_b)
        if bold:
            rpr.append(OxmlElement("w:b"))

    t = OxmlElement("w:t")
    if value.startswith(" ") or value.endswith(" ") or "  " in value:
        t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    t.text = value
    run.append(t)


def format_date(date_value):
    if not date_value:
        return "", ""
    try:
        d = datetime.strptime(date_value, "%Y-%m-%d")
        return d.strftime("%d"), d.strftime("/%m/%Y")
    except ValueError:
        try:
            d = datetime.strptime(date_value, "%d/%m/%Y")
            return d.strftime("%d"), d.strftime("/%m/%Y")
        except ValueError:
            return str(date_value), ""


def set_date_paragraph(paragraph_element, start_date, final_date):
    text_nodes = paragraph_element.xpath(".//w:t")
    if len(text_nodes) < 12:
        return

    start_day, start_rest = format_date(start_date)
    final_day, final_rest = format_date(final_date)

    replacements = {
        1: final_day, 2: final_rest,
        4: final_day, 5: final_rest,
        7: start_day, 8: start_rest,
        10: start_day, 11: start_rest,
    }
    for index, value in replacements.items():
        text_nodes[index].text = value


def set_year_paragraph(paragraph_element, year):
    year = str(year or "")
    if len(year) >= 4:
        first = year[:2]
        second = year[2:4]
    else:
        first = year
        second = ""
    text_nodes = paragraph_element.xpath(".//w:t")
    if len(text_nodes) >= 4:
        text_nodes[0].text = first
        text_nodes[1].text = second
        text_nodes[2].text = first
        text_nodes[3].text = second


def set_text_nodes_in_cell(tc, value):
    value = "" if value is None else str(value)
    text_nodes = tc.xpath(".//w:t")
    paragraphs = tc.xpath(".//w:p")
    if not paragraphs:
        return
    if not text_nodes:
        run = OxmlElement("w:r")
        paragraphs[0].append(run)
        t = OxmlElement("w:t")
        run.append(t)
        text_nodes = [t]
    text_nodes[0].text = value
    if value.startswith(" ") or value.endswith(" ") or "  " in value:
        text_nodes[0].set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    for extra in text_nodes[1:]:
        extra.text = ""


def set_row_values(row, subserie, descripcion, folio):
    cells = row.xpath("./w:tc")
    if len(cells) < 3:
        return
    set_text_nodes_in_cell(cells[0], subserie)
    set_text_nodes_in_cell(cells[1], descripcion)
    set_text_nodes_in_cell(cells[2], folio)


def normalize_items(data):
    items = data.get("items")
    if isinstance(items, list) and items:
        return [
            {
                "subserie": str(item.get("subserie", "") or ""),
                "descripcion": str(item.get("descripcion", "") or ""),
                "folio": str(item.get("folio", "") or ""),
            }
            for item in items
        ]
    return [{
        "subserie": str(data.get("subserie", "") or ""),
        "descripcion": str(data.get("descripcion", "") or ""),
        "folio": str(data.get("folio", "") or ""),
    }]


def apply_data(page_nodes, data):
    table_element = page_nodes[5]
    rows = table_element.xpath("./w:tr")

    def cell(row_index, col_index):
        cells = rows[row_index].xpath("./w:tc")
        return cells[col_index]

    values = {
        (0, 1): (data.get("id", ""), True),
        (1, 1): (data.get("caja", ""), True),
        (2, 1): (data.get("cod_serie", ""), True),
        (3, 1): (data.get("sobre", ""), True),
        (4, 1): (data.get("codigo", ""), True),
        (5, 1): (data.get("seccion", ""), True),
        (6, 1): (data.get("serie_doc", ""), True),
    }

    for (r, c), (value, bold) in values.items():
        tc = cell(r, c)
        set_text_nodes_in_cell(tc, value)
        text_nodes = tc.xpath(".//w:t")
        if text_nodes and bold is not None:
            first_run = text_nodes[0].getparent()
            if first_run is not None:
                rpr = first_run.find(qn("w:rPr"))
                if rpr is None:
                    rpr = OxmlElement("w:rPr")
                    first_run.insert(0, rpr)
                old_b = rpr.find(qn("w:b"))
                if old_b is not None:
                    rpr.remove(old_b)
                if bold:
                    rpr.append(OxmlElement("w:b"))

    base_row = rows[8]
    items = normalize_items(data)
    while len(rows) < 8 + len(items):
        new_row = deepcopy(base_row)
        table_element.append(new_row)
        rows = table_element.xpath("./w:tr")

    for index, item in enumerate(items):
        set_row_values(rows[8 + index], item["subserie"], item["descripcion"], item["folio"])

    desired_rows = 8 + len(items)
    rows = table_element.xpath("./w:tr")
    for row in rows[desired_rows:]:
        table_element.remove(row)

    set_date_paragraph(page_nodes[10], data.get("fecha_inicio", ""), data.get("fecha_final", ""))
    set_year_paragraph(page_nodes[11], data.get("anio", ""))


def add_page_break(document):
    p = OxmlElement("w:p")
    r = OxmlElement("w:r")
    br = OxmlElement("w:br")
    br.set(qn("w:type"), "page")
    r.append(br)
    p.append(r)
    document._element.body.append(p)


def build_document(entries):
    if not entries:
        raise ValueError("No hay páginas para generar.")

    template = Document(str(TEMPLATE_PATH))
    template_body = template._element.body

    sectPr = template_body.sectPr
    original_nodes = [deepcopy(child) for child in list(template_body) if child is not sectPr]

    for child in list(template_body):
        if child is not sectPr:
            template_body.remove(child)

    for index, data in enumerate(entries):
        page_nodes = [deepcopy(node) for node in original_nodes]
        apply_data(page_nodes, data)

        for node in page_nodes:
            template_body.append(node)

        if index < len(entries) - 1:
            add_page_break(template)

    output = BytesIO()
    template.save(output)
    output.seek(0)
    return output


# ---------------------------------------------------------------------------
# Rutas
# ---------------------------------------------------------------------------
@app.get("/")
def index():
    return render_template("index.html")


@app.get("/login")
def login_page():
    return render_template("login.html", min_password=MIN_PASSWORD_LENGTH)


@app.get("/admin")
def admin_page():
    if not is_request_from_admin_cookie():
        return redirect("/")
    return render_template("admin.html", min_password=MIN_PASSWORD_LENGTH)


@app.post("/generar")
@require_auth
@rate_limit("generar", 10, 60)
def generar():
    payload = request.get_json(silent=True) or {}
    try:
        entries = clean_pages(payload.get("pages", []))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if not entries:
        return jsonify({"error": "Agrega al menos una página antes de descargar."}), 400

    try:
        document = build_document(entries)
    except Exception:
        app.logger.exception("Error al generar el Word")
        return jsonify({"error": "No se pudo generar el documento."}), 500

    return send_file(
        document,
        as_attachment=True,
        download_name=safe_filename(payload.get("filename")),
        mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@app.get("/salud")
def salud():
    return jsonify({"ok": True})


@app.get("/paginas")
@require_auth
def obtener_paginas():
    try:
        response = (
            g.supabase.table("pages").select("data")
            .eq("user_id", g.user_id).order("orden").execute()
        )
        return jsonify({"pages": [row["data"] for row in response.data]})
    except Exception:
        app.logger.exception("Error al obtener las páginas")
        return jsonify({"error": "No se pudieron obtener las páginas."}), 500


def replace_user_pages(client, user_id, entries):
    """Reemplaza todas las páginas del usuario. Usa la función SQL atómica si existe
    (ver supabase_seguridad.sql); si no, cae al método anterior pero acotado al usuario."""
    try:
        client.rpc("replace_user_pages", {"p_pages": entries}).execute()
        return
    except APIError as exc:
        if getattr(exc, "code", None) not in ("PGRST202", "42883"):
            raise
        app.logger.warning("replace_user_pages no existe en Supabase; usando guardado no atómico")

    client.table("pages").delete().eq("user_id", user_id).execute()
    if entries:
        rows = [{"orden": i, "data": entry, "user_id": user_id} for i, entry in enumerate(entries)]
        client.table("pages").insert(rows).execute()


@app.post("/paginas")
@require_auth
@rate_limit("paginas", 300, 60)
def guardar_paginas():
    payload = request.get_json(silent=True)
    # Sin una lista "pages" explícita no se guarda nada: evita borrar todo por un cuerpo vacío o mal formado.
    if not isinstance(payload, dict) or not isinstance(payload.get("pages"), list):
        return jsonify({"error": "Formato inválido."}), 400
    try:
        entries = clean_pages(payload["pages"])
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    try:
        replace_user_pages(g.supabase, g.user_id, entries)
        return jsonify({"ok": True})
    except Exception:
        app.logger.exception("Error al guardar las páginas")
        return jsonify({"error": "No se pudieron guardar las páginas."}), 500


@app.get("/admin/usuarios")
@require_admin
def listar_usuarios():
    response = (
        g.service_client.table("profiles")
        .select("id,username,is_admin,created_at").order("created_at").execute()
    )
    return jsonify({"usuarios": response.data})


@app.post("/admin/usuarios")
@require_admin
@rate_limit("crear-usuario", 20, 600)
def crear_usuario():
    payload = request.get_json(silent=True) or {}
    username_raw = str(payload.get("username") or "").strip()
    password = str(payload.get("password") or "")
    is_admin = bool(payload.get("is_admin", False))

    username = re.sub(r"[^a-zA-Z0-9_.-]", "", username_raw).lower()
    if not 3 <= len(username) <= 40:
        return jsonify({"error": "El usuario debe tener entre 3 y 40 caracteres (letras, números, punto, guion o guion bajo)."}), 400

    problem = validate_password(password, username)
    if problem:
        return jsonify({"error": problem}), 400

    existing = g.service_client.table("profiles").select("id").ilike("username", ilike_exact(username)).execute()
    if existing.data:
        return jsonify({"error": "Ese nombre de usuario ya existe."}), 400

    synthetic_email = f"{username}@pangoa.local"

    try:
        result = g.service_client.auth.admin.create_user({
            "email": synthetic_email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"username": username}
        })
    except Exception:
        app.logger.exception("Error al crear el usuario en Supabase Auth")
        return jsonify({"error": "No se pudo crear el usuario."}), 500

    new_id = result.user.id
    try:
        g.service_client.table("profiles").update({
            "is_admin": is_admin,
            "username": username
        }).eq("id", new_id).execute()
    except Exception:
        app.logger.exception("Error al completar el perfil; se revierte la creación")
        try:
            g.service_client.auth.admin.delete_user(new_id)
        except Exception:
            app.logger.exception("No se pudo revertir el usuario %s", new_id)
        return jsonify({"error": "No se pudo crear el usuario."}), 500

    app.logger.info("ADMIN %s creó al usuario %s (admin=%s)", g.admin_id, username, is_admin)
    return jsonify({"ok": True})


@app.post("/auth/login")
def login_con_usuario():
    payload = request.get_json(silent=True) or {}
    username = re.sub(r"[^a-zA-Z0-9_.-]", "", str(payload.get("username") or "").strip()).lower()
    password = str(payload.get("password") or "")

    if not username or not password:
        return jsonify({"error": "Usuario y contraseña son obligatorios."}), 400
    if len(username) > 40 or len(password) > MAX_PASSWORD_LENGTH:
        return jsonify({"error": "Usuario o contraseña incorrectos."}), 401

    ip = request.remote_addr or "?"
    k_pair = f"login-pair:{username}:{ip}"   # 5 fallos por usuario desde la misma IP
    k_user = f"login-user:{username}"        # 25 fallos por usuario desde cualquier IP
    k_ip = f"login-ip:{ip}"                  # 60 fallos por IP (alto: varias personas pueden compartir IP)
    wait = max(
        limiter.blocked(k_pair, 5, 900),
        limiter.blocked(k_user, 25, 900),
        limiter.blocked(k_ip, 60, 900),
    )
    if wait:
        app.logger.warning("Login bloqueado por demasiados intentos: usuario=%s ip=%s", username, ip)
        return too_many(wait)

    def fail():
        for key in (k_pair, k_user, k_ip):
            limiter.hit(key)
        return jsonify({"error": "Usuario o contraseña incorrectos."}), 401

    service = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    prof = service.table("profiles").select("email").ilike("username", ilike_exact(username)).execute()
    rows = prof.data or []

    anon_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    if not rows:
        # Intento ficticio para que la respuesta tarde parecido y no delate qué usuarios existen
        try:
            anon_client.auth.sign_in_with_password({"email": "no-existe@pangoa.local", "password": password})
        except Exception:
            pass
        return fail()

    try:
        auth_resp = anon_client.auth.sign_in_with_password({"email": rows[0]["email"], "password": password})
    except Exception:
        return fail()

    session = auth_resp.session
    if not session:
        return fail()

    limiter.reset(k_pair)
    limiter.reset(k_user)
    return jsonify({
        "access_token": session.access_token,
        "refresh_token": session.refresh_token
    })


@app.post("/admin/usuarios/<user_id>/password")
@require_admin
@rate_limit("reset-password", 20, 600)
def restablecer_password(user_id):
    try:
        uid = str(uuid.UUID(user_id))
    except ValueError:
        return jsonify({"error": "Identificador inválido."}), 400

    payload = request.get_json(silent=True) or {}
    password = str(payload.get("password") or "")

    target = g.service_client.table("profiles").select("username").eq("id", uid).execute()
    if not target.data:
        return jsonify({"error": "Usuario no encontrado."}), 404

    problem = validate_password(password, str(target.data[0].get("username") or ""))
    if problem:
        return jsonify({"error": problem}), 400

    try:
        g.service_client.auth.admin.update_user_by_id(uid, {"password": password})
    except Exception:
        app.logger.exception("Error al restablecer la contraseña")
        return jsonify({"error": "No se pudo restablecer la contraseña."}), 500

    app.logger.info("ADMIN %s restableció la contraseña del usuario %s", g.admin_id, uid)
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Recuperación de contraseña con códigos de un solo uso
# ---------------------------------------------------------------------------
# Los usuarios no tienen correo real (se usa usuario@pangoa.local), así que no se puede
# enviar un enlace por email. Cada usuario genera 8 códigos de recuperación estando
# conectado (pidiendo su contraseña actual), los guarda, y si la olvida usa uno para
# poner una contraseña nueva. Solo se guarda un hash (PBKDF2) de cada código y la
# tabla recovery_codes solo la lee el servidor (service role). Ver supabase_recuperacion.sql.
RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"   # sin 0/O/1/I/L para evitar confusiones
RECOVERY_CODE_COUNT = 8
RECOVERY_ID_LEN = 4        # parte pública que identifica el código (no aporta secreto)
RECOVERY_SECRET_LEN = 12   # ~59 bits de entropía
RECOVERY_PBKDF2_ITER = 120_000
RECOVERY_UNAVAILABLE = "La recuperación de contraseña aún no está disponible. Pide al administrador que la restablezca."


def _service_client():
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def _hash_recovery_code(code, salt_hex):
    return hashlib.pbkdf2_hmac("sha256", code.encode(), bytes.fromhex(salt_hex), RECOVERY_PBKDF2_ITER).hex()


def _normalize_recovery_code(raw):
    code = re.sub(r"[^A-Z0-9]", "", str(raw or "").upper())
    if len(code) != RECOVERY_ID_LEN + RECOVERY_SECRET_LEN or any(c not in RECOVERY_ALPHABET for c in code):
        return None
    return code


def _format_recovery_code(code):
    return "-".join(code[i:i + 4] for i in range(0, len(code), 4))


def _new_recovery_codes():
    codes, ids = [], set()
    while len(codes) < RECOVERY_CODE_COUNT:
        code = "".join(secrets.choice(RECOVERY_ALPHABET) for _ in range(RECOVERY_ID_LEN + RECOVERY_SECRET_LEN))
        if code[:RECOVERY_ID_LEN] in ids:
            continue
        ids.add(code[:RECOVERY_ID_LEN])
        codes.append(code)
    return codes


@app.get("/auth/recovery-status")
@require_auth
def recovery_status():
    try:
        rows = (_service_client().table("recovery_codes").select("id")
                .eq("user_id", g.user_id).is_("used_at", "null").execute().data or [])
    except APIError:
        app.logger.warning("Tabla recovery_codes no disponible")
        return jsonify({"available": False, "remaining": 0})
    return jsonify({"available": True, "remaining": len(rows)})


@app.post("/auth/recovery-codes")
@require_auth
@rate_limit("recovery-gen", 5, 3600)
def generar_codigos_recuperacion():
    payload = request.get_json(silent=True) or {}
    password = str(payload.get("password") or "")
    if not password or len(password) > MAX_PASSWORD_LENGTH:
        return jsonify({"error": "Escribe tu contraseña actual para generar los códigos."}), 400

    k_reauth = f"recovery-reauth:{g.user_id}"
    wait = limiter.blocked(k_reauth, 5, 900)
    if wait:
        return too_many(wait)

    service = _service_client()
    try:
        prof = service.table("profiles").select("email").eq("id", g.user_id).execute().data or []
        if not prof:
            return jsonify({"error": "Usuario no encontrado."}), 404
        create_client(SUPABASE_URL, SUPABASE_ANON_KEY).auth.sign_in_with_password(
            {"email": prof[0]["email"], "password": password})
    except APIError:
        app.logger.exception("Error leyendo el perfil")
        return jsonify({"error": "No se pudieron generar los códigos."}), 500
    except Exception:
        limiter.hit(k_reauth)
        # 403 (no 401): el front trata 401 como sesión vencida y cerraría la sesión por un simple error de tecleo
        return jsonify({"error": "La contraseña actual no es correcta."}), 403
    limiter.reset(k_reauth)

    codes = _new_recovery_codes()
    rows = []
    for code in codes:
        salt = secrets.token_hex(16)
        rows.append({
            "user_id": g.user_id,
            "lookup": code[:RECOVERY_ID_LEN],
            "salt": salt,
            "code_hash": _hash_recovery_code(code, salt),
        })
    try:
        old = service.table("recovery_codes").select("id").eq("user_id", g.user_id).execute().data or []
        service.table("recovery_codes").insert(rows).execute()
        for row in old:  # se borran los anteriores solo después de guardar los nuevos
            service.table("recovery_codes").delete().eq("id", row["id"]).execute()
    except APIError:
        app.logger.exception("Error guardando los códigos de recuperación")
        return jsonify({"error": RECOVERY_UNAVAILABLE}), 503

    app.logger.info("Usuario %s generó nuevos códigos de recuperación", g.user_id)
    return jsonify({"codes": [_format_recovery_code(c) for c in codes], "remaining": len(codes)})


@app.post("/auth/recover")
def recuperar_con_codigo():
    payload = request.get_json(silent=True) or {}
    username = re.sub(r"[^a-zA-Z0-9_.-]", "", str(payload.get("username") or "").strip()).lower()
    code = _normalize_recovery_code(payload.get("code"))
    password = str(payload.get("password") or "")

    if not username or not payload.get("code") or not password:
        return jsonify({"error": "Completa el usuario, el código de recuperación y la contraseña nueva."}), 400
    if len(username) > 40 or len(password) > MAX_PASSWORD_LENGTH:
        return jsonify({"error": "Usuario o código de recuperación incorrectos."}), 401

    ip = request.remote_addr or "?"
    k_pair = f"recover-pair:{username}:{ip}"
    k_user = f"recover-user:{username}"
    k_ip = f"recover-ip:{ip}"
    wait = max(limiter.blocked(k_pair, 5, 900), limiter.blocked(k_user, 10, 900), limiter.blocked(k_ip, 30, 900))
    if wait:
        app.logger.warning("Recuperación bloqueada por demasiados intentos: usuario=%s ip=%s", username, ip)
        return too_many(wait)

    def fail():
        for key in (k_pair, k_user, k_ip):
            limiter.hit(key)
        return jsonify({"error": "Usuario o código de recuperación incorrectos."}), 401

    service = _service_client()
    try:
        prof = service.table("profiles").select("id").ilike("username", ilike_exact(username)).execute().data or []
        row = None
        if prof and code:
            cands = (service.table("recovery_codes").select("id,salt,code_hash,used_at")
                     .eq("user_id", prof[0]["id"]).eq("lookup", code[:RECOVERY_ID_LEN]).execute().data or [])
            cands = [c for c in cands if not c.get("used_at")]
            row = cands[0] if cands else None
    except APIError:
        app.logger.exception("Error en la recuperación de contraseña")
        return jsonify({"error": RECOVERY_UNAVAILABLE}), 503

    # Siempre se calcula un hash para que la respuesta tarde parecido exista o no el usuario/código
    salt = row["salt"] if row else "00" * 16
    candidate = _hash_recovery_code(code or ("A" * 16), salt)
    if not row or not code or not hmac.compare_digest(candidate, row["code_hash"]):
        return fail()

    problem = validate_password(password, username)
    if problem:
        return jsonify({"error": problem}), 400

    uid = prof[0]["id"]
    try:
        claimed = (service.table("recovery_codes")
                   .update({"used_at": datetime.utcnow().isoformat() + "Z"})
                   .eq("id", row["id"]).is_("used_at", "null").execute().data or [])
        if not claimed:  # otro intento lo usó justo antes
            return fail()
        try:
            service.auth.admin.update_user_by_id(uid, {"password": password})
        except Exception:
            service.table("recovery_codes").update({"used_at": None}).eq("id", row["id"]).execute()
            raise
    except Exception:
        app.logger.exception("No se pudo cambiar la contraseña con código de recuperación")
        return jsonify({"error": "No se pudo cambiar la contraseña. Intenta de nuevo."}), 500

    for key in (k_pair, k_user):
        limiter.reset(key)
    left = len([1 for c in (service.table("recovery_codes").select("id")
                            .eq("user_id", uid).is_("used_at", "null").execute().data or [])])
    app.logger.info("Usuario %s cambió su contraseña con un código de recuperación (quedan %s)", uid, left)
    return jsonify({"ok": True, "remaining": left})


@app.delete("/admin/usuarios/<user_id>")
@require_admin
@rate_limit("eliminar-usuario", 20, 600)
def eliminar_usuario(user_id):
    try:
        uid = str(uuid.UUID(user_id))
    except ValueError:
        return jsonify({"error": "Identificador inválido."}), 400

    if uid == str(g.admin_id):
        return jsonify({"error": "No puedes eliminar tu propia cuenta."}), 400

    target = g.service_client.table("profiles").select("is_admin").eq("id", uid).execute()
    if target.data and target.data[0].get("is_admin"):
        admins = g.service_client.table("profiles").select("id").eq("is_admin", True).execute()
        if len(admins.data or []) <= 1:
            return jsonify({"error": "No se puede eliminar al último administrador."}), 400

    try:
        g.service_client.auth.admin.delete_user(uid)
    except Exception:
        app.logger.exception("Error al eliminar el usuario")
        return jsonify({"error": "No se pudo eliminar el usuario."}), 500

    app.logger.info("ADMIN %s eliminó al usuario %s", g.admin_id, uid)
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=os.environ.get("FLASK_DEBUG") == "1")
