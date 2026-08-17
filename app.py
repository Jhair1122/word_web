from flask import Flask, render_template, request, send_file, jsonify
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


def set_cell_value(cell, value, bold=None):
    """Replace the visible text in a cell while keeping its table/paragraph layout."""
    value = "" if value is None else str(value)
    paragraphs = cell._tc.xpath(".//w:p")
    if not paragraphs:
        p = OxmlElement("w:p")
        cell._tc.append(p)
        paragraphs = [p]

    p = paragraphs[0]
    runs = p.xpath("./w:r")

    # Remove text from all existing runs.
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
        # Also accept DD/MM/YYYY if the client sends it.
        try:
            d = datetime.strptime(date_value, "%d/%m/%Y")
            return d.strftime("%d"), d.strftime("/%m/%Y")
        except ValueError:
            return str(date_value), ""


def set_date_paragraph(paragraph_element, start_date, final_date):
    """
    The original Word uses positioned text boxes for the dates.
    The first page contains four duplicated text-box representations:
    two for the start date and two for the final date.
    """
    text_nodes = paragraph_element.xpath(".//w:t")
    if len(text_nodes) < 12:
        return

    start_day, start_rest = format_date(start_date)
    final_day, final_rest = format_date(final_date)

    # Keep the original spacing nodes; change only the date text.
    replacements = {
        1: start_day, 2: start_rest,
        4: start_day, 5: start_rest,
        7: final_day, 8: final_rest,
        10: final_day, 11: final_rest,
    }
    for index, value in replacements.items():
        text_nodes[index].text = value


def set_year_paragraph(paragraph_element, year):
    """The year in the original document is represented by duplicated text boxes."""
    year = str(year or "")
    if len(year) >= 4:
        first = year[:2]
        second = year[2:4]
    else:
        first = year
        second = ""
    text_nodes = paragraph_element.xpath(".//w:t")
    # First page normally has: 20, 19, 20, 19.
    if len(text_nodes) >= 4:
        text_nodes[0].text = first
        text_nodes[1].text = second
        text_nodes[2].text = first
        text_nodes[3].text = second


def set_text_nodes_in_cell(tc, value):
    """Write text into the first run of a Word table cell while preserving formatting."""
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
    """Support the new multiple-row format and migrate pages from the old format."""
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

    # Backwards compatibility with the previous single description/folio fields.
    return [{
        "subserie": str(data.get("subserie", "") or ""),
        "descripcion": str(data.get("descripcion", "") or ""),
        "folio": str(data.get("folio", "") or ""),
    }]


def apply_data(page_nodes, data):
    # In the original one-page template:
    # node 5 = main data table
    # node 10 = date text boxes
    # node 11 = FECHAS EXTREMAS year text boxes
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

    # Row 7 is the header: SUB SERIE | DESCRIPCIÓN | FOLIO.
    # Row 8 is the original data row. Duplicate that row for every extra item,
    # preserving the exact borders, widths, fonts and cell formatting of the template.
    base_row = rows[8]
    items = normalize_items(data)
    while len(rows) < 8 + len(items):
        new_row = deepcopy(base_row)
        table_element.append(new_row)
        rows = table_element.xpath("./w:tr")

    for index, item in enumerate(items):
        set_row_values(rows[8 + index], item["subserie"], item["descripcion"], item["folio"])

    # Remove any template rows beyond the generated item rows (normally none).
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

    # Keep the section properties and remove the original page.
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


@app.get("/salud")
def salud():
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
