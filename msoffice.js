const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const pa11y = require('pa11y');
const json2csv = require('json2csv');
const process = require('process');
const puppeteer = require('puppeteer');

// Input: Array of Office document URLs
const officeDataNested = require('./cypress/reports/msoffice.json');

// Output directory
const outputDir = './cypress/msoffice';
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

const officeUrls = officeDataNested.flat().map(obj => obj.msoffice).filter(Boolean);

async function downloadFile(url, outputPath) {
  const axios = require('axios');
  try {
    console.log(' Downloading file');
    const response = await axios.get(url, { responseType: 'stream' });
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
    throw new Error(`Failed to download file from ${url}: ${err.message}`);
  }
}

function convertToHtml(inputPath, outputDir) {
  console.log(' Converting to HTML with LibreOffice');
  try {
    const libreOfficePath = path.join(__dirname, 'LibreOfficePortable', 'App', 'libreoffice', 'program', 'soffice.exe');
    execSync(`${libreOfficePath} --headless --convert-to html --outdir ${outputDir} "${inputPath}"`);
    const fileName = path.basename(inputPath, path.extname(inputPath)) + '.html';
    return path.join(outputDir, fileName);
  } catch (err) {
    throw new Error(`LibreOffice conversion failed: ${err.message}`);
  }
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
    results.issues.forEach(issue => {
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

async function processOfficeUrl(url) {
  const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 8);
  const ext = path.extname(url).split('?')[0]; // remove query string if present
  const inputPath = path.join(outputDir, `${hash}${ext}`);

  try {
    await downloadFile(url, inputPath);
    console.log(` File size: ${Math.floor(fs.statSync(inputPath).size / 1048.576) / 1000} MB`);
    const htmlPath = convertToHtml(inputPath, outputDir);
    await testAccessibility(htmlPath, url);
  } catch (err) {
    console.error(`Error processing ${url}: ${err.message}`);
  }
}

(async () => {
  console.log(`Testing ${officeUrls.length} MS Office files`);
  let counter = 1;
  
  for (const url of officeUrls) {
    console.log(`\nProcessing: ${counter++}/${officeUrls.length} ${url}`);
    await processOfficeUrl(url);
    console.log(` Memory Usage: ${Math.floor(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);
  }

  fs.writeFileSync('./cypress/reports/msoffice-results.json', JSON.stringify(testResults, null, 1));
  const csvFile = json2csv.parse(csvData, { fields: csvFields });
  fs.writeFileSync('./cypress/reports/msoffice-results.csv', csvFile);

  setTimeout(() => process.exit(0), 2000);
})();
