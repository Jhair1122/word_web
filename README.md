# Generador de Word - Municipalidad Distrital de Pangoa

Aplicación web para rellenar formularios y generar un documento `.docx` utilizando como base una plantilla Word existente.

## Qué hace

- Permite crear muchas páginas desde un formulario.
- Cada página puede tener datos diferentes.
- Conserva el diseño de la plantilla Word.
- Permite avanzar y retroceder entre páginas.
- Guarda automáticamente el trabajo en el navegador.
- Permite guardar un respaldo `.json` para continuar otro día.
- Permite cargar ese respaldo.
- Genera un único archivo Word con todas las páginas.

## Estructura

```text
pangoa-word-web/
├── app.py
├── plantilla.docx
├── requirements.txt
├── README.md
├── .gitignore
├── templates/
│   └── index.html
└── static/
    ├── app.js
    └── style.css
```

## Ejecutar en Windows

Abre CMD o PowerShell dentro de esta carpeta:

```bash
python -m venv venv
```

Activar:

### CMD

```bash
venv\Scripts\activate
```

### PowerShell

```powershell
venv\Scripts\Activate.ps1
```

Instalar dependencias:

```bash
pip install -r requirements.txt
```

Ejecutar:

```bash
python app.py
```

Luego abre:

```text
http://127.0.0.1:5000
```

## Subir a GitHub

Puedes subir toda esta carpeta a un repositorio de GitHub.

No subas la carpeta `venv/`; está excluida mediante `.gitignore`.

## Publicar en internet

GitHub sirve para almacenar el código, pero `app.py` necesita un servidor Python para funcionar.

Una opción sencilla es conectar este repositorio a un servicio de hosting que ejecute Flask/Gunicorn.

Comando de inicio:

```bash
gunicorn app:app
```

## Importante sobre la plantilla

`plantilla.docx` es una versión de una sola página basada en el documento Word proporcionado. La aplicación utiliza esa página como molde y la duplica para cada registro.

Si modificas visualmente la plantilla, reemplaza `plantilla.docx` manteniendo una sola página de plantilla.
