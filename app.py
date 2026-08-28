import os
import re
from functools import wraps
from flask import Flask, render_template, request, send_file, jsonify, g
from supabase import create_client, Client
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
        prof = service.table("profiles").select("is_admin").eq("id", uid).single().execute()
        if not prof.data or not prof.data.get("is_admin"):
            return jsonify({"error": "Se requieren permisos de administrador."}), 403

        g.service_client = service
        return f(*args, **kwargs)
    return wrapper


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


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/login")
def login_page():
    return render_template("login.html")


@app.get("/admin")
def admin_page():
    return render_template("admin.html")


@app.post("/generar")
@require_auth
def generar():
    payload = request.get_json(silent=True) or {}
    entries = payload.get("pages", [])

    if not isinstance(entries, list) or not entries:
        return jsonify({"error": "Agrega al menos una página antes de descargar."}), 400

    try:
        document = build_document(entries)
    except Exception as exc:
        return jsonify({"error": f"No se pudo generar el Word: {exc}"}), 500

    filename = payload.get("filename") or "documento_pangoa.docx"
    if not filename.lower().endswith(".docx"):
        filename += ".docx"

    return send_file(
        document,
        as_attachment=True,
        download_name=filename,
        mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@app.get("/salud")
def salud():
    return jsonify({"ok": True})


@app.get("/paginas")
@require_auth
def obtener_paginas():
    try:
        response = g.supabase.table("pages").select("*").order("orden").execute()
        return jsonify({"pages": [row["data"] for row in response.data]})
    except Exception as exc:
        return jsonify({"error": f"No se pudieron obtener las páginas: {exc}"}), 500


@app.post("/paginas")
@require_auth
def guardar_paginas():
    payload = request.get_json(silent=True) or {}
    entries = payload.get("pages", [])

    if not isinstance(entries, list):
        return jsonify({"error": "Formato inválido."}), 400

    try:
        g.supabase.table("pages").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()

        if entries:
            rows = [{"orden": i, "data": entry, "user_id": g.user_id} for i, entry in enumerate(entries)]
            g.supabase.table("pages").insert(rows).execute()

        return jsonify({"ok": True})
    except Exception as exc:
        return jsonify({"error": f"No se pudieron guardar las páginas: {exc}"}), 500


@app.get("/admin/usuarios")
@require_admin
def listar_usuarios():
    response = g.service_client.table("profiles").select("*").order("created_at").execute()
    return jsonify({"usuarios": response.data})


@app.post("/admin/usuarios")
@require_admin
def crear_usuario():
    payload = request.get_json(silent=True) or {}
    username_raw = (payload.get("username") or "").strip()
    password = payload.get("password") or ""
    is_admin = bool(payload.get("is_admin", False))

    if not username_raw or len(password) < 6:
        return jsonify({"error": "Usuario y contraseña (mínimo 6 caracteres) son obligatorios."}), 400

    username = re.sub(r"[^a-zA-Z0-9_.-]", "", username_raw).lower()
    if not username:
        return jsonify({"error": "El nombre de usuario contiene caracteres no válidos."}), 400

    existing = g.service_client.table("profiles").select("id").ilike("username", username).execute()
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
        new_id = result.user.id
        g.service_client.table("profiles").update({
            "is_admin": is_admin,
            "username": username
        }).eq("id", new_id).execute()
        return jsonify({"ok": True})
    except Exception as exc:
        return jsonify({"error": f"No se pudo crear el usuario: {exc}"}), 500


@app.post("/auth/login")
def login_con_usuario():
    payload = request.get_json(silent=True) or {}
    username = re.sub(r"[^a-zA-Z0-9_.-]", "", (payload.get("username") or "").strip()).lower()
    password = payload.get("password") or ""

    if not username or not password:
        return jsonify({"error": "Usuario y contraseña son obligatorios."}), 400

    service = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    prof = service.table("profiles").select("email").ilike("username", username).execute()
    rows = prof.data or []
    if not rows:
        return jsonify({"error": "Usuario o contraseña incorrectos."}), 401
    email = rows[0]["email"]

    anon_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    try:
        auth_resp = anon_client.auth.sign_in_with_password({"email": email, "password": password})
    except Exception:
        return jsonify({"error": "Usuario o contraseña incorrectos."}), 401

    session = auth_resp.session
    if not session:
        return jsonify({"error": "Usuario o contraseña incorrectos."}), 401

    return jsonify({
        "access_token": session.access_token,
        "refresh_token": session.refresh_token
    })


@app.delete("/admin/usuarios/<user_id>")
@require_admin
def eliminar_usuario(user_id):
    try:
        g.service_client.auth.admin.delete_user(user_id)
        return jsonify({"ok": True})
    except Exception as exc:
        return jsonify({"error": f"No se pudo eliminar: {exc}"}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
