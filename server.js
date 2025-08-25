const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Root directory where unflattened PDF templates live.
 * Override with the ORIG_TEMPLATES_ROOT environment variable.
 */
const ORIG_ROOT = process.env.ORIG_TEMPLATES_ROOT || path.join(__dirname, '..', 'originals');
/**
 * Port for the HTTP server. Defaults to 8087.
 */
const PORT = parseInt(process.env.PORT || '8087', 10);

const app = express();
// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));
// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Attempt to load a mapping of Paperless document IDs to template filenames
let mappings = {};
try {
  const cfgPath = path.join(__dirname, 'config', 'originals.json');
  if (fs.existsSync(cfgPath)) {
    mappings = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  }
} catch (err) {
  console.warn('Warning: could not parse config/originals.json:', err.message);
}

/**
 * Extract the list of AcroForm field names from a given PDF.
 * Uses pdftk and parses the output of `dump_data_fields`.
 *
 * @param {string} templatePath absolute path to the PDF
 * @returns {Promise<string[]>} list of field names
 */
function extractFields(templatePath) {
  return new Promise((resolve, reject) => {
    const pdftk = spawn('pdftk', [templatePath, 'dump_data_fields']);
    let output = '';
    let error = '';
    pdftk.stdout.on('data', (d) => { output += d.toString(); });
    pdftk.stderr.on('data', (d) => { error += d.toString(); });
    pdftk.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`pdftk exited with code ${code}: ${error}`));
      }
      const fields = [];
      output.split(/\r?\n/).forEach((line) => {
        const m = line.match(/^FieldName:\s*(.+)$/);
        if (m) {
          fields.push(m[1]);
        }
      });
      resolve(fields);
    });
  });
}

/**
 * Build an FDF document from a key/value map. Escapes parentheses and backslashes.
 *
 * @param {Object.<string,string>} fieldsObj key/value pairs for each form field
 * @returns {string} FDF document content
 */
function buildFdf(fieldsObj) {
  let body = '';
  for (const key of Object.keys(fieldsObj)) {
    const v = (fieldsObj[key] ?? '').toString();
    const esc = v.replace(/\\/g, '\\\\')
                .replace(/\(/g, '\\(')
                .replace(/\)/g, '\\)')
                .replace(/\r?\n/g, '\\r');
    body += `<< /T (${key}) /V (${esc}) >>\n`;
  }
  return `%FDF-1.2
%����
1 0 obj
<< /FDF << /Fields [
${body}
] >> >>
endobj
trailer
<< /Root 1 0 R >>
%%EOF`;
}

/**
 * Use pdftk to fill a PDF template with the provided data and return the flattened PDF buffer.
 *
 * @param {string} templatePath absolute path to the template
 * @param {Object.<string,string>} data key/value pairs for each field
 * @returns {Promise<Buffer>} buffer containing the filled PDF
 */
function fillPdf(templatePath, data) {
  const os = require('os');
  const tmpdir = os.tmpdir();
  const fdfPath = path.join(tmpdir, `data_${Date.now()}.fdf`);
  const outPath = path.join(tmpdir, `out_${Date.now()}.pdf`);
  fs.writeFileSync(fdfPath, buildFdf(data));
  return new Promise((resolve, reject) => {
    const pdftk = spawn('pdftk', [templatePath, 'fill_form', fdfPath, 'output', outPath, 'flatten']);
    pdftk.on('close', (code) => {
      fs.unlink(fdfPath, () => {});
      if (code !== 0) {
        return reject(new Error(`pdftk fill_form failed with exit code ${code}`));
      }
      fs.readFile(outPath, (err, buf) => {
        fs.unlink(outPath, () => {});
        if (err) return reject(err);
        resolve(buf);
      });
    });
  });
}

/**
 * GET /fields
 * Returns a JSON list of field names for a given template.
 * Query params:
 *   template – relative path of the template under ORIG_ROOT
 */
app.get('/fields', async (req, res) => {
  try {
    const template = req.query.template;
    if (!template) {
      return res.status(400).json({ error: 'template query parameter is required' });
    }
    const p = path.join(ORIG_ROOT, template);
    if (!fs.existsSync(p)) {
      return res.status(404).json({ error: 'template not found' });
    }
    const fields = await extractFields(p);
    res.json({ fields });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /start
 * Redirects to / with a template parameter based on a Paperless doc_id.
 * If doc_id is not known, simply shows the home page.
 */
app.get('/start', (req, res) => {
  const docId = req.query.doc_id;
  if (docId && mappings[docId]) {
    res.redirect('/?template=' + encodeURIComponent(mappings[docId]));
  } else {
    res.redirect('/');
  }
});

/**
 * Fallback for the root path. Serves the front‑end page.
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * POST /submit
 * Accepts JSON body with field values and fills the given template.
 * Query params:
 *   template – relative path of the template under ORIG_ROOT
 */
app.post('/submit', async (req, res) => {
  try {
    const template = req.query.template;
    if (!template) {
      return res.status(400).json({ error: 'template query parameter is required' });
    }
    const p = path.join(ORIG_ROOT, template);
    if (!fs.existsSync(p)) {
      return res.status(404).json({ error: 'template not found' });
    }
    const pdfBuf = await fillPdf(p, req.body || {});
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=report.pdf');
    res.end(pdfBuf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Inspector sidecar listening on port ${PORT}`);
});