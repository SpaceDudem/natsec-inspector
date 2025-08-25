# National Security & Fire Inspector Sidecar

This repository contains a self‑hosted service and front‑end for generating pre‑filled PDF inspection reports from original unflattened AcroForm templates. It is designed to integrate with Paperless‑ngx and support multiple form types.

## Features

* **Extract fields** – The service uses `pdftk` to dump field names from any AcroForm PDF so you can build a structured form without guessing.
* **Dynamic form generation** – A client‑side page builds a form at runtime based on the template’s fields. Technicians only see the questions that exist in the PDF.
* **Speech‑to‑text** – Each text field in the form has a microphone button that leverages the browser’s Web Speech API for hands‑free input.
* **PDF filling** – Submitted answers are converted to an FDF and merged back into the template using `pdftk`, producing a flattened, filled PDF.
* **Paperless‑ngx integration** – Optional overrides script adds a “New inspection from this” button to document pages in Paperless. Completed reports can be uploaded back into Paperless via its API (manual implementation required).
* **Extensible** – Drop additional templates into the originals directory and map them in `config/originals.json` to support more inspection forms without changing any code.

## Repository structure

* `docker-compose.yml` – Launches the Node.js server inside a container and installs `pdftk` automatically.
* `package.json` / `server.js` – Implementation of the Express server that discovers fields, serves the form, fills the PDF and returns it.
* `public/index.html` – Front‑end form that fetches fields from the server, renders inputs and handles speech‑to‑text.
* `config/originals.json` – Optional map of Paperless document IDs to template filenames. Used when launching a form from Paperless via `/start?doc_id=`.
* `overrides/overrides.js` – JavaScript injection that adds a new button to Paperless‑ngx’s UI, linking back to the sidecar service.

## Prerequisites

* `pdftk` or `pdftk-java` must be available to extract and fill form fields. The provided Docker service installs `pdftk-java` automatically.
* Node.js ≥ 18 is required for local development.

## Running locally

```bash
# Install dependencies
npm install

# Set environment variables
export ORIG_TEMPLATES_ROOT=/path/to/original/forms
export PORT=8087  # optional, defaults to 8087

# Start the server
node server.js
# The service listens on http://localhost:8087 by default.
```

### Using Docker Compose

You can also run the project inside Docker. The provided compose file installs `pdftk-java` and runs the Node.js service automatically.

```bash
docker compose up -d
# The service will be available on http://localhost:8087
```

## How to use

1. Place your **unflattened** template PDFs under the directory specified by `ORIG_TEMPLATES_ROOT` (by default, this is `/mnt/original_forms` in Docker). For example:
   ```
   /mnt/original_forms/Fire_Alarm_Inspection_Report.pdf
   ```
2. If you plan to launch the form from Paperless, update `config/originals.json` to map Paperless document IDs to template filenames:
   ```json
   {
     "19852824": "Fire_Alarm_Inspection_Report.pdf"
   }
   ```
3. Start the server (either via Node or Docker).
4. Open the form in your browser:
   * **Direct:**
     `http://localhost:8087/?template=Fire_Alarm_Inspection_Report.pdf`
   * **Via Paperless:** If the overrides script is installed, a button will appear on the document view. It links to `/start?doc_id=<paperless-id>` and looks up the template name from `config/originals.json`.
5. Fill out the dynamic form. Each text field has a mic icon to dictate answers. Click **Generate Report** to produce the completed PDF. The file downloads to your machine.

## Paperless integration

To add a button in Paperless‑ngx that links to this service:

1. Mount the contents of `overrides/overrides.js` into your Paperless container’s custom overrides directory (see the Paperless docs for how to enable overrides). This script injects a “New inspection from this” button on the document details page.
2. Set the environment variable `INSPECTOR_BASE_URL` in Paperless to the URL of your sidecar (e.g. `http://localhost:8087`). The overrides script uses this to build the link.
3. When the button is clicked, Paperless will redirect to `/start?doc_id=<id>`, and the sidecar will serve a form for the mapped template.

## Starting a Codex project

When you want to explore or modify this repository inside ChatGPT’s **Codex** code editor:

1. Click the **<>** (code) icon in the ChatGPT interface to open the Codex editor.
2. Choose **Open Workspace** and navigate to the `natsec-inspector` folder under the shared files area.
3. Codex will load the repository. You can browse, edit files, and run commands in the integrated terminal (e.g. `npm install` or `node server.js`).
4. Follow the usage instructions above to run and test the service. Add new templates to `ORIG_TEMPLATES_ROOT` and update `config/originals.json` to support more inspection sheets in the future.

---

This project is intentionally open‑ended. By adding additional original templates and mapping them, you can support multiple inspection forms without changing the server code.