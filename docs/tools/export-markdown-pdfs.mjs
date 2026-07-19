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

const defaultPortraitPage = {
  format: 'A4',
  landscape: false,
  cssPageSize: 'A4',
  margin: { top: '14mm', right: '11mm', bottom: '14mm', left: '11mm' }
};

const documentDefinitions = [
  {
    id: 'prd',
    markdownPath: path.resolve(docsRoot, 'product-requirements-document.md'),
    outputName: 'UAIL-IT-Dashboard-PRD.pdf',
    page: defaultPortraitPage,
    bodyClass: 'layout-prd',
    tableRules: [
      { headingText: '6. Primary Users', className: 'table-compact' },
      { headingText: '13. Acceptance Criteria', className: 'table-compact' }
    ]
  },
  {
    id: 'project-documentation',
    markdownPath: path.resolve(docsRoot, 'project-documentation-and-timeline.md'),
    outputName: 'UAIL-IT-Dashboard-Project-Documentation-and-Timeline.pdf',
    page: defaultPortraitPage,
    bodyClass: 'layout-timeline',
    tableRules: [
      { headingText: '3. Delivery Workstreams', className: 'table-compact' },
      { headingText: '4. Timeline Summary', className: 'table-compact' },
      { headingText: '8. Full Commit Ledger', className: 'table-ledger page-break-before' }
    ]
  },
  {
    id: 'system-design',
    markdownPath: path.resolve(docsRoot, 'system-design.md'),
    outputName: 'UAIL-IT-Dashboard-System-Design.pdf',
    page: defaultPortraitPage,
    bodyClass: 'layout-system-design',
    tableRules: [
      { headingText: '3. Runtime Components', className: 'table-compact' },
      { headingText: '10. Deployment Design', className: 'table-compact' }
    ]
  },
  {
    id: 'user-manual',
    markdownPath: path.resolve(docsRoot, 'user-manual.md'),
    outputName: 'UAIL-IT-Dashboard-User-Manual.pdf',
    page: defaultPortraitPage,
    bodyClass: 'layout-user-manual',
    headingRules: [
      { text: '3. Operator Workflow', className: 'page-break-before' },
      { text: '8. Admin Console', className: 'page-break-before' },
      { text: '10. Sessions Tab', className: 'page-break-before' }
    ],
    imageRules: [
      { alt: 'Operator login', figureClassName: 'figure-medium page-break-before' },
      { alt: 'Operator dashboard', figureClassName: 'figure-page page-break-before' },
      { alt: 'Admin overview', figureClassName: 'figure-page page-break-before' },
      { alt: 'Admin sessions', figureClassName: 'figure-page page-break-before' }
    ]
  },
  {
    id: 'developer-handbook',
    markdownPath: path.resolve(docsRoot, 'developer-handbook.md'),
    outputName: 'UAIL-IT-Dashboard-Developer-Handbook.pdf',
    page: defaultPortraitPage,
    bodyClass: 'layout-developer',
    tableRules: [
      { headingText: '2. Repository Structure', className: 'table-compact' }
    ]
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

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

function splitMarkdownTarget(rawTarget) {
  const trimmed = rawTarget.trim();
  const titleMatch = trimmed.match(/^(.+?)\s+(".*")$/);
  if (!titleMatch) {
    return { target: trimmed, suffix: '' };
  }

  return {
    target: titleMatch[1].trim(),
    suffix: ` ${titleMatch[2]}`
  };
}

async function inlineLocalMarkdownImages(markdown, baseDir) {
  const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const replacements = [];

  for (const match of markdown.matchAll(imagePattern)) {
    const [fullMatch, altText, rawTarget] = match;
    const { target, suffix } = splitMarkdownTarget(rawTarget);
    if (!target || /^(https?:|data:|mailto:|#)/i.test(target)) {
      continue;
    }

    const resolvedPath = path.resolve(baseDir, target.replace(/\//g, path.sep));
    try {
      const fileBuffer = await fs.readFile(resolvedPath);
      const mimeType = getMimeType(resolvedPath);
      const dataUri = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
      replacements.push({
        original: fullMatch,
        replacement: `![${altText}](${dataUri}${suffix})`
      });
    } catch {
      // Leave the original markdown unchanged if the local asset is missing.
    }
  }

  let nextMarkdown = markdown;
  for (const replacement of replacements) {
    nextMarkdown = nextMarkdown.replace(replacement.original, replacement.replacement);
  }

  return nextMarkdown;
}

function buildHtml(definition, sourceMarkdown, baseHref, title) {
  const pageSize = definition.page?.cssPageSize ?? 'A4';
  const config = {
    bodyClass: definition.bodyClass ?? '',
    imageRules: definition.imageRules ?? [],
    headingRules: definition.headingRules ?? [],
    tableRules: definition.tableRules ?? []
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <base href="${baseHref}" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page {
      size: ${pageSize};
      margin: ${definition.page.margin.top} ${definition.page.margin.right} ${definition.page.margin.bottom} ${definition.page.margin.left};
    }

    :root {
      --paper: #fffdfa;
      --paper-edge: #f3ede4;
      --text: #342925;
      --muted: #6f625d;
      --line: #d7cabd;
      --line-strong: #bca999;
      --primary: #1565c0;
      --accent: #8d6e63;
      --code: #f4efe7;
      --figure-bg: #fbf8f3;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: var(--text);
      font-family: "Segoe UI", Calibri, Arial, sans-serif;
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      font-size: 10.2pt;
    }

    .sheet {
      width: 100%;
      margin: 0;
      padding: 0;
    }

    h1,
    h2,
    h3,
    h4 {
      color: var(--text);
      line-height: 1.18;
      margin-top: 0;
      break-after: avoid-page;
      page-break-after: avoid;
    }

    h1 {
      font-size: 22pt;
      margin-bottom: 5mm;
      padding-bottom: 2.8mm;
      border-bottom: 2px solid var(--line-strong);
    }

    h2 {
      font-size: 15pt;
      margin-bottom: 3mm;
      margin-top: 7mm;
      padding-bottom: 1.4mm;
      border-bottom: 1px solid var(--line);
    }

    h3 {
      font-size: 12pt;
      margin-bottom: 2.2mm;
      margin-top: 5mm;
    }

    h4 {
      font-size: 10.8pt;
      margin-bottom: 1.8mm;
      margin-top: 4mm;
    }

    p,
    ul,
    ol,
    pre,
    blockquote,
    figure,
    .mermaid {
      margin-top: 0;
      margin-bottom: 3.2mm;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    ul,
    ol {
      padding-left: 1.15em;
    }

    li + li {
      margin-top: 1.2mm;
    }

    a {
      color: var(--primary);
      text-decoration: none;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 9.3pt;
      margin: 0 0 3.8mm;
      break-inside: auto;
      page-break-inside: auto;
    }

    th,
    td {
      border: 1px solid var(--line);
      padding: 7px 8px;
      text-align: left;
      vertical-align: top;
      overflow-wrap: break-word;
      word-break: break-word;
    }

    tr,
    td,
    th {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    th {
      background: #f4eee6;
      font-weight: 700;
    }

    table.table-compact {
      font-size: 8.7pt;
    }

    table.table-compact th,
    table.table-compact td {
      padding: 6px 7px;
    }

    table.table-ledger {
      font-size: 8.1pt;
    }

    table.table-ledger th,
    table.table-ledger td {
      padding: 5px 6px;
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
      border-radius: 9px;
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
      border-left: 4px solid var(--line-strong);
      background: #faf6ef;
      color: var(--muted);
    }

    .doc-figure {
      margin: 0 0 4.5mm;
      padding: 3mm;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--figure-bg);
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .doc-figure img {
      display: block;
      width: 100%;
      max-width: 100%;
      height: auto;
      object-fit: contain;
      margin: 0 auto;
      border-radius: 7px;
      border: 1px solid rgba(188,169,153,0.55);
      background: #ffffff;
    }

    .figure-inline img {
      max-height: 82mm;
    }

    .figure-medium img {
      max-height: 108mm;
    }

    .figure-page img {
      max-height: 160mm;
    }

    figcaption {
      margin-top: 2.5mm;
      font-size: 8.4pt;
      color: var(--muted);
      text-align: center;
    }

    .mermaid {
      text-align: center;
      padding: 2mm 0;
    }

    .mermaid svg {
      max-width: 100%;
      height: auto;
    }

    hr {
      border: 0;
      border-top: 1px solid var(--line);
      margin: 5mm 0;
    }

    .page-break-before {
      break-before: page;
      page-break-before: always;
    }

    .page-break-after {
      break-after: page;
      page-break-after: always;
    }

    body.layout-system-design .mermaid {
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #fbf8f3;
      padding: 4mm;
    }

    body.layout-user-manual h2 {
      margin-top: 6mm;
    }

    body.layout-user-manual .figure-page {
      padding: 2.4mm;
    }

    body.layout-timeline table.table-ledger {
      font-size: 7.85pt;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
</head>
<body class="${escapeHtml(config.bodyClass)}">
  <main class="sheet">
    <article id="content"></article>
  </main>
  <script>
    const markdown = ${JSON.stringify(sourceMarkdown)};
    const content = document.getElementById('content');
    const config = ${JSON.stringify(config)};

    function normalizeText(value) {
      return (value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    }

    function wrapStandaloneImages() {
      const standaloneImages = [...document.querySelectorAll('p > img:only-child')];
      for (const image of standaloneImages) {
        const alt = (image.getAttribute('alt') || '').trim();
        const imageRule = (config.imageRules || []).find((rule) => normalizeText(rule.alt) === normalizeText(alt));
        const figure = document.createElement('figure');
        const classNames = ['doc-figure'];
        if (imageRule?.figureClassName) {
          classNames.push(...imageRule.figureClassName.split(/\\s+/).filter(Boolean));
        } else {
          classNames.push('figure-inline');
        }
        figure.className = classNames.join(' ');
        const parent = image.parentElement;
        parent.replaceWith(figure);
        figure.appendChild(image);
        if (alt) {
          const caption = document.createElement('figcaption');
          caption.textContent = alt;
          figure.appendChild(caption);
        }
      }
    }

    function applyHeadingRules() {
      for (const rule of config.headingRules || []) {
        const heading = [...document.querySelectorAll('h1, h2, h3, h4')]
          .find((element) => normalizeText(element.textContent) === normalizeText(rule.text));
        if (heading && rule.className) {
          heading.classList.add(...rule.className.split(/\\s+/).filter(Boolean));
        }
      }
    }

    function applyTableRules() {
      for (const rule of config.tableRules || []) {
        const heading = [...document.querySelectorAll('h1, h2, h3, h4')]
          .find((element) => normalizeText(element.textContent) === normalizeText(rule.headingText));
        if (!heading) {
          continue;
        }

        let next = heading.nextElementSibling;
        while (next && next.tagName.toLowerCase() !== 'table') {
          next = next.nextElementSibling;
        }

        if (next && rule.className) {
          next.classList.add(...rule.className.split(/\\s+/).filter(Boolean));
        }
      }
    }

    function wrapMermaidBlocks() {
      const mermaidBlocks = [...document.querySelectorAll('pre > code.language-mermaid, pre > code.lang-mermaid')];
      for (const block of mermaidBlocks) {
        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid';
        wrapper.textContent = block.textContent || '';
        block.parentElement.replaceWith(wrapper);
      }
    }

    marked.setOptions({ gfm: true, breaks: false, headerIds: true, mangle: false });
    content.innerHTML = marked.parse(markdown);

    wrapStandaloneImages();
    applyHeadingRules();
    applyTableRules();
    wrapMermaidBlocks();

    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      securityLevel: 'loose',
      themeVariables: {
        primaryColor: '#f4eee6',
        primaryTextColor: '#342925',
        primaryBorderColor: '#bca999',
        lineColor: '#8d6e63',
        textColor: '#342925',
        fontFamily: 'Segoe UI, Calibri, Arial, sans-serif'
      }
    });

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
  const relativeDir = path.dirname(definition.markdownPath);
  const baseHref = pathToFileURL(`${relativeDir}${path.sep}`).href;
  const markdown = await fs.readFile(definition.markdownPath, 'utf8');
  const preparedMarkdown = await inlineLocalMarkdownImages(markdown, relativeDir);
  const title = path.basename(definition.markdownPath, '.md');
  const page = await browser.newPage();
  await page.setContent(buildHtml(definition, preparedMarkdown, baseHref, title), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__renderDone === true, null, { timeout: 60000 });
  await page.emulateMedia({ media: 'screen' });

  const outputPath = path.resolve(outputRoot, definition.outputName);
  await page.pdf({
    path: outputPath,
    format: definition.page.format,
    landscape: definition.page.landscape,
    printBackground: true,
    margin: definition.page.margin,
    preferCSSPageSize: true
  });

  await page.close();
  return outputPath;
}

async function mirrorToAdminHelp(outputPath) {
  const targetPath = path.resolve(adminHelpRoot, path.basename(outputPath));
  await replaceFileWithRetries(outputPath, targetPath);
  return targetPath;
}

async function wait(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function deleteFileWithRetries(filePath, attempts = 8, delayMs = 800) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await fs.unlink(filePath);
      return;
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return;
      }

      if ((error?.code === 'EBUSY' || error?.code === 'EPERM') && attempt < attempts) {
        await wait(delayMs);
        continue;
      }

      throw error;
    }
  }
}

async function replaceFileWithRetries(sourcePath, targetPath, attempts = 8, delayMs = 800) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await fs.copyFile(sourcePath, targetPath);
      return;
    } catch (error) {
      if ((error?.code === 'EBUSY' || error?.code === 'EPERM') && attempt < attempts) {
        await wait(delayMs);
        continue;
      }

      throw error;
    }
  }
}

async function removeExistingPdfOutputs(root) {
  await fs.mkdir(root, { recursive: true });
  const entries = await fs.readdir(root, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'))
      .map((entry) => deleteFileWithRetries(path.join(root, entry.name)))
  );
}

async function main() {
  await removeExistingPdfOutputs(outputRoot);
  await removeExistingPdfOutputs(adminHelpRoot);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  try {
    const outputs = [];
    for (const definition of documentDefinitions) {
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
