import os
import re
from collections import OrderedDict
from copy import deepcopy
from datetime import date, datetime
from io import BytesIO
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_file
from openpyxl import load_workbook
from openpyxl.utils.datetime import from_ISO8601
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from supabase import create_client, Client

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Faltan SUPABASE_URL y SUPABASE_KEY en las variables de entorno.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = Flask(__name__)
BASE_DIR = Path(__file__).resolve().parent
TEMPLATE_PATH = BASE_DIR / "plantilla.docx"
MAX_EXCEL_SIZE = 25 * 1024 * 1024
ALLOWED_EXTENSIONS = {".xlsx", ".xlsm"}


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

    run = runs[0] if runs else OxmlElement("w:r")
    if not runs:
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
        d = datetime.strptime(str(date_value), "%Y-%m-%d")
        return d.strftime("%d"), d.strftime("/%m/%Y")
    except ValueError:
        try:
            d = datetime.strptime(str(date_value), "%d/%m/%Y")
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
        1: start_day, 2: start_rest,
        4: start_day, 5: start_rest,
        7: final_day, 8: final_rest,
        10: final_day, 11: final_rest,
    }
    for index, value in replacements.items():
        text_nodes[index].text = value


def set_year_paragraph(paragraph_element, year):
    year = str(year or "")
    if len(year) >= 4:
        first, second = year[:2], year[2:4]
    else:
        first, second = year, ""
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
    if not TEMPLATE_PATH.exists():
        raise FileNotFoundError("No se encontró plantilla.docx en el servidor.")

    template = Document(str(TEMPLATE_PATH))
    template_body = template._element.body
    sect_pr = template_body.sectPr
    original_nodes = [deepcopy(child) for child in list(template_body) if child is not sect_pr]

    for child in list(template_body):
        if child is not sect_pr:
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


# ---------------- Excel: importación asistida ----------------

def normalize_header(value):
    if value is None:
        return ""
    text = str(value).strip().upper()
    text = text.replace("\n", " ").replace("\r", " ")
    text = re.sub(r"\s+", " ", text)
    return text


def cell_text(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        return "SI" if value else "NO"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return str(int(value)) if value.is_integer() else str(value)
    return str(value).strip()


def normalize_key(value):
    text = normalize_header(value)
    replacements = {
        "Á": "A", "É": "E", "Í": "I", "Ó": "O", "Ú": "U", "Ü": "U", "Ñ": "N",
        "°": "", ".": "", ":": "", "º": "", "-": " ", "/": " ",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return re.sub(r"\s+", " ", text).strip()


def find_excel_columns(ws):
    aliases = {
        "subserie": ["N DE C P", "N DE CP", "N° DE C P", "N° DE CP", "N DE C.P", "N° DE C.P"],
        "descripcion": ["ASUNTO", "DESCRIPCION DE DOCUMENTOS"],
        "fecha": ["FECHA AÑO", "FECHA/AÑO", "FECHA", "FECHAS EXTREMAS"],
        "folio": ["FOLIOS", "FOLIO"],
        "sobre": ["N DE SOBRE", "N° DE SOBRE", "NUMERO DE SOBRE"],
        "caja": ["N DE CAJA", "N° DE CAJA", "NUMERO DE CAJA"],
        "serie": ["TITULO DE LA SERIE"],
    }
    normalized_aliases = {k: {normalize_key(x) for x in v} for k, v in aliases.items()}

    best = None
    scan_rows = min(ws.max_row, 30)
    scan_cols = min(ws.max_column, 30)
    for r in range(1, scan_rows + 1):
        found = {}
        for c in range(1, scan_cols + 1):
            key = normalize_key(ws.cell(r, c).value)
            if not key:
                continue
            for field, options in normalized_aliases.items():
                if key in options:
                    found[field] = c
        score = len(found)
        if best is None or score > best[0]:
            best = (score, r, found)

    if not best or best[0] < 5:
        # Fallback to the structure of the supplied 2019 workbook:
        # C = C.P, D = Asunto, H = fecha/año, I = folios, J = sobre, L = caja.
        return 4, {"subserie": 3, "descripcion": 4, "fecha": 8, "folio": 9, "sobre": 10, "caja": 12, "serie": 2}
    return best[1], best[2]


def parse_excel_date(value):
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, (int, float)):
        try:
            # Excel date serial.  Workbook dates are 1900-based.
            from openpyxl.utils.datetime import from_excel
            return from_excel(value).date() if isinstance(from_excel(value), datetime) else from_excel(value)
        except Exception:
            return None
    text = str(value).strip()
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%y", "%m/%d/%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            pass
    return None


def format_iso_date(value):
    d = parse_excel_date(value)
    return d.isoformat() if d else ""


def format_folio(value):
    return cell_text(value)


def normalize_group_value(value):
    text = cell_text(value)
    if not text:
        return ""
    # Preserve leading zeros from Excel text such as 01, 02, 07.
    return text


def parse_excel_file(file_storage):
    filename = file_storage.filename or ""
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise ValueError("Solo se aceptan archivos .xlsx o .xlsm.")

    raw = file_storage.read()
    if len(raw) > MAX_EXCEL_SIZE:
        raise ValueError("El archivo Excel supera el límite de 25 MB.")
    if not raw:
        raise ValueError("El archivo Excel está vacío.")

    try:
        wb = load_workbook(BytesIO(raw), data_only=True, read_only=True, keep_links=False)
    except Exception as exc:
        raise ValueError(f"No se pudo leer el Excel: {exc}") from exc

    if not wb.sheetnames:
        raise ValueError("El Excel no contiene hojas.")

    # La primera hoja es la que se usa por defecto, como en el archivo entregado.
    ws = wb[wb.sheetnames[0]]
    header_row, columns = find_excel_columns(ws)
    required = ["subserie", "descripcion", "fecha", "folio", "sobre", "caja"]
    missing = [field for field in required if field not in columns]
    if missing:
        raise ValueError("No se encontraron estas columnas: " + ", ".join(missing))

    groups = OrderedDict()
    warnings = []
    valid_rows = 0

    # En read_only=True se debe recorrer con iter_rows; usar ws.cell() miles de veces
    # puede volver la importación innecesariamente lenta.
    for row_number, row_values in enumerate(
        ws.iter_rows(min_row=header_row + 1, values_only=True),
        start=header_row + 1,
    ):
        def get(field):
            col = columns.get(field)
            if not col:
                return None
            index = col - 1
            return row_values[index] if index < len(row_values) else None

        values = {field: get(field) for field in columns}
        subserie = normalize_group_value(values.get("subserie"))
        descripcion = cell_text(values.get("descripcion"))
        fecha = parse_excel_date(values.get("fecha"))
        folio = format_folio(values.get("folio"))
        sobre = normalize_group_value(values.get("sobre"))
        caja = normalize_group_value(values.get("caja"))

        # Filas completamente vacías no forman registros.
        if not any([subserie, descripcion, values.get("fecha"), folio, sobre, caja]):
            continue

        # Evita tomar títulos/subtotales como registros.
        if not sobre and not caja:
            continue
        if not sobre:
            warnings.append(f"Fila {row_number}: tiene datos pero no tiene N° de sobre; se omitió.")
            continue
        if not caja:
            warnings.append(f"Fila {row_number}: el sobre {sobre} no tiene N° de caja; se omitió.")
            continue
        if not fecha:
            warnings.append(f"Fila {row_number}: el sobre {sobre} no tiene una fecha válida; se omitió ese registro.")
            continue
        if not descripcion and not subserie and not folio:
            warnings.append(f"Fila {row_number}: el sobre {sobre} no tiene contenido; se omitió.")
            continue

        valid_rows += 1
        key = (caja, sobre)
        if key not in groups:
            groups[key] = {
                "caja": caja,
                "sobre": sobre,
                "items": [],
                "dates": [],
                "source_rows": [],
                "anio": str(fecha.year),
            }
        group = groups[key]
        group["items"].append({
            "subserie": subserie,
            "descripcion": descripcion,
            "folio": folio,
        })
        group["dates"].append(fecha)
        group["source_rows"].append(row_number)

    wb.close()

    if not groups:
        raise ValueError("No se encontraron registros válidos con sobre, caja y fecha.")

    pages = []
    for group in groups.values():
        start = min(group["dates"])
        final = max(group["dates"])
        year_values = {d.year for d in group["dates"]}
        if len(year_values) > 1:
            warnings.append(
                f"Caja {group['caja']}, sobre {group['sobre']}: contiene fechas de más de un año "
                f"({', '.join(map(str, sorted(year_values)))}). Se usará {start.year} en Año / fechas extremas."
            )
        if len(group["items"]) > 8:
            warnings.append(
                f"Caja {group['caja']}, sobre {group['sobre']}: tiene {len(group['items'])} registros. "
                "La plantilla original fue pensada para hasta 8 cuadros visibles; revisa este sobre antes de descargar el Word."
            )
        pages.append({
            "id": "",
            "caja": group["caja"],
            "cod_serie": "",
            "sobre": group["sobre"],
            "codigo": "TESO - 01",
            "seccion": "TESORERIA",
            "serie_doc": "COMPROBANTE DE PAGO",
            "items": group["items"],
            "fecha_inicio": start.isoformat(),
            "fecha_final": final.isoformat(),
            "anio": str(start.year),
            "_import_meta": {
                "filas_excel": group["source_rows"],
                "cantidad_registros": len(group["items"]),
            },
        })

    boxes = OrderedDict()
    for page in pages:
        boxes.setdefault(page["caja"], 0)
        boxes[page["caja"]] += 1

    return {
        "filename": filename,
        "sheet": ws.title if 'ws' in locals() else "",
        "header_row": header_row,
        "total_rows": valid_rows,
        "total_pages": len(pages),
        "boxes": [{"caja": caja, "paginas": count} for caja, count in boxes.items()],
        "pages": pages,
        "warnings": warnings,
    }


def strip_import_meta(pages):
    cleaned = []
    for page in pages:
        copy_page = dict(page)
        copy_page.pop("_import_meta", None)
        cleaned.append(copy_page)
    return cleaned


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/generar")
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


@app.post("/excel/analizar")
def analizar_excel():
    if "file" not in request.files:
        return jsonify({"error": "Selecciona un archivo Excel."}), 400
    file = request.files["file"]
    try:
        result = parse_excel_file(file)
        return jsonify(result)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": f"No se pudo analizar el Excel: {exc}"}), 500


@app.get("/salud")
def salud():
    return jsonify({"ok": True})


@app.get("/paginas")
def obtener_paginas():
    try:
        response = supabase.table("pages").select("*").order("orden").execute()
        return jsonify({"pages": [row["data"] for row in response.data]})
    except Exception as exc:
        return jsonify({"error": f"No se pudieron obtener las páginas: {exc}"}), 500


@app.post("/paginas")
def guardar_paginas():
    payload = request.get_json(silent=True) or {}
    entries = payload.get("pages", [])
    if not isinstance(entries, list):
        return jsonify({"error": "Formato inválido."}), 400
    try:
        supabase.table("pages").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        if entries:
            rows = [{"orden": i, "data": entry} for i, entry in enumerate(entries)]
            supabase.table("pages").insert(rows).execute()
        return jsonify({"ok": True})
    except Exception as exc:
        return jsonify({"error": f"No se pudieron guardar las páginas: {exc}"}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
