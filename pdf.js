const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const pa11y = require('pa11y');
const json2csv = require('json2csv');
const pdf2html = require('pdf2html');
const process = require('process');
const puppeteer = require('puppeteer');

const pdfDataNested = require('./cypress/reports/pdf.json');

// Output directory
const outputDir = './cypress/pdf';
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const testResults = [];
const csvData = [];
const csvFields = [
  'url',
  'documentTitle',
  'code',
  'type',
  'typeCode',
  'message',
  'context',
  'selector'
];

// Flatten and extract all PDF URLs from nested structure
const pdfUrls = pdfDataNested.flat().map(obj => obj.pdf).filter(Boolean);

async function downloadPdf(url, outputPath) {
  try {
    console.log(' Downloading file');
    const response = await axios.get(url, { responseType: 'stream' });
    console.log(` Saving file to ${outputPath}`)
    const writer = fs.createWriteStream(outputPath);
    return new Promise((resolve, reject) => {
      response.data.pipe(writer);
      writer.on('finish', () => {
        writer.close(); // ensure it's closed
        resolve();
      });
      writer.on('error', (err) => {
        writer.close();
        reject(err);
      });
    });
  } catch (err) {
    throw new Error(`Failed to download PDF from ${url}: ${err.message}`);
  }
}

async function convertPdf(pdfPath, basePath) {
  return Promise.race([
    (async () => {
      try {
        console.log(` Exporting meta to ${basePath}.json`);
        const meta = await pdf2html.meta(pdfPath);
        fs.writeFileSync(`${basePath}.json`, JSON.stringify(meta, null, 1));

        console.log(` Exporting structure to ${basePath}.html`);
        const html = await pdf2html.html(pdfPath);
        fs.writeFileSync(`${basePath}.html`, html);

        console.log(` Exporting content to ${basePath}.txt`);
        const text = await pdf2html.text(pdfPath);
        fs.writeFileSync(`${basePath}.txt`, text);

        return `${basePath}.html`;
      } catch (err) {
        throw new Error(` PDF conversion failed for ${pdfPath}: ${err.message}`);
      }
    })(),
    new Promise((_, reject) => setTimeout(() => reject(new Error(' Time out!')), 60000))
  ]);
}

async function testAccessibility(htmlPath, url) {
  let browser = null;
  try {
    console.log(' Testing accessibility');
    browser = await puppeteer.launch({ headless: true });
    const results = await pa11y(htmlPath, { browser });
    testResults.push({
      currentUrl: url,
      currentTest: 'accessibility',
      data: results
    });

    console.log(` Found ${results.issues.length} issues`);
    results.issues.forEach((issue) => {
      csvData.push({
        url: url,
        documentTitle: results.documentTitle,
        code: issue.code,
        type: issue.type,
        typeCode: issue.typeCode,
        message: issue.message,
        context: issue.context,
        selector: issue.selector
      });
    });
  } catch (err) {
    console.error(`Accessibility test failed for ${htmlPath}: ${err.message}`);
  } finally {
    if (browser) await browser.close();
  }
}

async function processPdfUrl(url) {
  const basePath = path.join(outputDir, crypto.createHash('md5').update(url).digest('hex').slice(0, 8));
  const pdfPath = `${basePath}.pdf`;

  try {
    await downloadPdf(url, pdfPath);
    console.log(` File size: ${Math.floor(fs.statSync(pdfPath).size / 1048.576) / 1000} MB`);
    const htmlPath = await convertPdf(pdfPath, basePath);
    await testAccessibility(htmlPath, url);
  } catch (err) {
    console.error(`Error processing ${url}: ${err.message}`);
  }
}

(async () => {
  console.log(`Testing ${pdfUrls.length} PDF files`);
  let counter = 1;

  for (const url of pdfUrls) {
    console.log(`\nProcessing: ${counter++}/${pdfUrls.length} ${url}`);
    await processPdfUrl(url);
    console.log(` Memory Usage: ${Math.floor(process.memoryUsage().heapUsed / 1048.576) / 1000} MB`);
  }

  fs.writeFileSync('./cypress/reports/pdf-results.json', JSON.stringify(testResults, null, 1));
  const csvFile = json2csv.parse(csvData, { fields: csvFields });
  fs.writeFileSync('./cypress/reports/pdf-results.csv', csvFile);

  setTimeout(() => process.exit(0), 2000);
})();
