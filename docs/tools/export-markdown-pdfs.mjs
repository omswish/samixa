import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const docsRoot = path.resolve(repoRoot, 'docs');
const outputRoot = path.resolve(docsRoot, 'pdf');
const adminHelpRoot = path.resolve(repoRoot, 'dashboard', 'public', 'help');

const documentDefinitions = [
  {
    markdownPath: path.resolve(docsRoot, 'README.md'),
    outputName: 'UAIL-IT-Dashboard-Documentation-Index.pdf'
  },
  {
    markdownPath: path.resolve(docsRoot, 'system-handbook.md'),
    outputName: 'UAIL-IT-Dashboard-System-Handbook.pdf'
  },
  {
    markdownPath: path.resolve(docsRoot, 'operations-guide.md'),
    outputName: 'UAIL-IT-Dashboard-Operations-Guide.pdf'
  },
  {
    markdownPath: path.resolve(docsRoot, 'project-timeline-2026-07-19.md'),
    outputName: 'UAIL-IT-Dashboard-Project-Timeline-2026-07-19.pdf'
  },
  {
    markdownPath: path.resolve(docsRoot, 'executive-summary-pack.md'),
    outputName: 'UAIL-IT-Dashboard-Executive-Summary.pdf',
    copyOnlyFrom: path.resolve(docsRoot, 'executive-summary-pack.pdf')
  }
];

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildStandardHtml(sourceMarkdown, baseHref, title) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <base href="${baseHref}" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page {
      size: A4;
      margin: 16mm 14mm;
    }
    :root {
      --bg: #f8f4ed;
      --paper: #fffdfa;
      --text: #3d302b;
      --muted: #6f625d;
      --line: #d9cdc1;
      --primary: #1565c0;
      --code: #f4efe7;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Calibri, Arial, sans-serif;
      color: var(--text);
      background: var(--bg);
      line-height: 1.55;
    }
    .page {
      max-width: 210mm;
      margin: 0 auto;
      padding: 12mm;
      background: var(--paper);
    }
    h1, h2, h3, h4 {
      color: var(--text);
      line-height: 1.2;
      margin-top: 1.1em;
      margin-bottom: 0.45em;
      page-break-after: avoid;
    }
    h1 {
      font-size: 24pt;
      border-bottom: 2px solid var(--line);
      padding-bottom: 4mm;
      margin-top: 0;
    }
    h2 {
      font-size: 17pt;
      border-bottom: 1px solid var(--line);
      padding-bottom: 2mm;
    }
    h3 { font-size: 13pt; }
    h4 { font-size: 11pt; }
    p, ul, ol, table, pre, blockquote {
      margin-top: 0;
      margin-bottom: 0.9em;
      page-break-inside: avoid;
    }
    ul, ol {
      padding-left: 1.2em;
    }
    li + li {
      margin-top: 0.22em;
    }
    a {
      color: var(--primary);
      text-decoration: none;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5pt;
    }
    th, td {
      border: 1px solid var(--line);
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #f3ede4;
      font-weight: 700;
    }
    code {
      font-family: Consolas, "Courier New", monospace;
      font-size: 0.92em;
      background: var(--code);
      border-radius: 4px;
      padding: 0.12em 0.3em;
    }
    pre {
      background: var(--code);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px;
      overflow: hidden;
      white-space: pre-wrap;
      word-break: break-word;
    }
    pre code {
      padding: 0;
      background: transparent;
    }
    blockquote {
      margin-left: 0;
      padding: 10px 14px;
      border-left: 4px solid var(--line);
      background: #faf6ef;
      color: var(--muted);
    }
    img {
      display: block;
      max-width: 100%;
      border: 1px solid var(--line);
      border-radius: 10px;
      margin: 8px auto 14px;
      page-break-inside: avoid;
    }
    .mermaid {
      text-align: center;
      margin: 12px 0 18px;
      page-break-inside: avoid;
    }
    hr {
      border: 0;
      border-top: 1px solid var(--line);
      margin: 18px 0;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
</head>
<body>
  <main class="page">
    <div id="content"></div>
  </main>
  <script>
    const markdown = ${JSON.stringify(sourceMarkdown)};
    const content = document.getElementById('content');
    marked.setOptions({ gfm: true, breaks: false, headerIds: true, mangle: false });
    content.innerHTML = marked.parse(markdown);

    const mermaidBlocks = [...document.querySelectorAll('pre > code.language-mermaid, pre > code.lang-mermaid')];
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      securityLevel: 'loose',
      themeVariables: {
        primaryColor: '#f3ede4',
        primaryTextColor: '#3d302b',
        primaryBorderColor: '#bca999',
        lineColor: '#8d6e63',
        textColor: '#3d302b',
        fontFamily: 'Segoe UI, Calibri, Arial, sans-serif'
      }
    });

    for (const block of mermaidBlocks) {
      const wrapper = document.createElement('div');
      wrapper.className = 'mermaid';
      wrapper.textContent = block.textContent || '';
      block.parentElement.replaceWith(wrapper);
    }

    Promise.resolve()
      .then(() => mermaid.run({ querySelector: '.mermaid' }))
      .catch(() => {})
      .finally(() => {
        window.__renderDone = true;
      });
  </script>
</body>
</html>`;
}

async function renderMarkdownPdf(browser, definition) {
  const { markdownPath, outputName } = definition;
  const relativeDir = path.dirname(markdownPath);
  const baseHref = pathToFileURL(`${relativeDir}${path.sep}`).href;
  const markdown = await fs.readFile(markdownPath, 'utf8');
  const title = path.basename(markdownPath, '.md');
  const page = await browser.newPage();
  await page.setContent(buildStandardHtml(markdown, baseHref, title), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__renderDone === true, null, { timeout: 60000 });
  await page.emulateMedia({ media: 'screen' });

  const outputPath = path.resolve(outputRoot, outputName);
  await page.pdf({
    path: outputPath,
    format: 'A4',
    landscape: false,
    printBackground: true,
    margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' },
    preferCSSPageSize: true
  });
  await page.close();
  return outputPath;
}

async function copyPrebuiltPdf(definition) {
  const sourcePath = definition.copyOnlyFrom;
  const outputPath = path.resolve(outputRoot, definition.outputName);
  await fs.copyFile(sourcePath, outputPath);
  return outputPath;
}

async function mirrorToAdminHelp(outputPath) {
  const targetPath = path.resolve(adminHelpRoot, path.basename(outputPath));
  await fs.copyFile(outputPath, targetPath);
  return targetPath;
}

async function main() {
  await fs.mkdir(outputRoot, { recursive: true });
  await fs.mkdir(adminHelpRoot, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  try {
    const outputs = [];
    for (const definition of documentDefinitions) {
      if (definition.copyOnlyFrom) {
        outputs.push(await copyPrebuiltPdf(definition));
        continue;
      }

      outputs.push(await renderMarkdownPdf(browser, definition));
    }

    const mirroredOutputs = [];
    for (const output of outputs) {
      mirroredOutputs.push(await mirrorToAdminHelp(output));
    }

    for (const output of outputs) {
      console.log(path.relative(repoRoot, output));
    }
    for (const output of mirroredOutputs) {
      console.log(path.relative(repoRoot, output));
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
