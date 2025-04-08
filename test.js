const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function prompt(question) {
  return new Promise(resolve => rl.question(question, answer => resolve(answer)));
}

function getDirectories(srcPath) {
  return fs.readdirSync(srcPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory() && dirent.name !== 'mochawesome')
    .map(dirent => dirent.name);
}

async function selectOrCreateProject() {
  const reportDir = './cypress/reports';
  const projects = getDirectories(reportDir);

  if (projects.length === 0) {
    return await createProject(reportDir);
  }

  console.log('Select a project:');
  projects.forEach((name, i) => console.log(`${i + 1}) ${name}`));
  console.log(`${projects.length + 1}) Create a new project`);

  const choice = parseInt(await prompt('Choice: '));
  if (choice === projects.length + 1) return await createProject(reportDir);
  return projects[choice - 1];
}

async function createProject(reportDir) {
  while (true) {
    const name = await prompt('Enter new project name (a-z, 0-9, -, _, .): ');
    if (/^[a-zA-Z0-9_.-]+$/.test(name)) {
      fs.mkdirSync(path.join(reportDir, name), { recursive: true });
      return name;
    }
    console.log('Invalid name. Try again.');
  }
}

async function main() {
  const PROJECT = await selectOrCreateProject();
  const reportDir = `./cypress/reports/${PROJECT}`;
  const optionsPath = './cypress/support/options.json';

  if (fs.existsSync(optionsPath)) fs.unlinkSync(optionsPath);
  if (fs.existsSync(`${reportDir}/options.json`)) {
    fs.copyFileSync(`${reportDir}/options.json`, optionsPath);
  }

  const yn = (await prompt('Do you want to create a new config file? (Y/N) ')).toLowerCase();
  if (yn === 'y') {
    execSync('bash -c "node ./options.js"', { stdio: 'inherit' });
    fs.copyFileSync(optionsPath, `${reportDir}/options.json`);
  }

  const config = JSON.parse(fs.readFileSync(optionsPath));
  const urls = config.testUrls.slice(config.startIndex || 0, config.endIndex || config.testUrls.length);
  const chunkSize = 50;
  const T = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
  const sessionDir = `${reportDir}/${T}`;
  fs.mkdirSync(sessionDir, { recursive: true });

  ['results', 'exceptions', 'pdf', 'msoffice', 'redirects'].forEach(name => {
    fs.writeFileSync(`./cypress/reports/${name}.json`, '[\n');
  });

  for (let i = 0; i < urls.length; i += chunkSize) {
    const chunk = urls.slice(i, i + chunkSize);
    const chunkOptions = { ...config, testUrls: chunk };
    fs.writeFileSync(optionsPath, JSON.stringify(chunkOptions, null, 2));

    console.log(`\nRunning Cypress for URLs ${i} to ${i + chunk.length - 1}`);
    try {
      execSync('bash -c "npx cypress run --browser chrome"', { stdio: 'inherit' });
    } catch (err) {
      console.error(`⚠️ Cypress exited with code ${err.status}. Continuing...`);
    }

    if (!fs.existsSync(`${sessionDir}/screenshots`)) fs.mkdirSync(`${sessionDir}/screenshots`);
    if (fs.existsSync('./cypress/screenshots')) {
      fs.readdirSync('./cypress/screenshots').forEach(file => {
        if (file.toLowerCase().endsWith('.png')) {
          fs.renameSync(`./cypress/screenshots/${file}`, `${sessionDir}/screenshots/${file}`);
        }
      });
    }
  }

  console.log('Close JSON files');
  ['results', 'redirects'].forEach(name => {
    fs.appendFileSync(`./cypress/reports/${name}.json`, '{}]');
  });

  ['exceptions', 'pdf', 'msoffice'].forEach(name => {
    fs.appendFileSync(`./cypress/reports/${name}.json`, '[]]');
  });

  console.log('Test PDF files accessibility');
  execSync(`bash -c "node ./pdf.js"`, { stdio: 'inherit' });
  if (fs.existsSync(`${sessionDir}/pdf`)) fs.rmSync(`${sessionDir}/pdf`, { recursive: true, force: true });
  fs.renameSync('./cypress/pdf', `${sessionDir}/pdf`);

  console.log('Test MS Office files accessibility');
  execSync(`bash -c "node ./msoffice.js"`, { stdio: 'inherit' });
  if (fs.existsSync(`${sessionDir}/msoffice`)) fs.rmSync(`${sessionDir}/msoffice`, { recursive: true, force: true });
  fs.renameSync('./cypress/msoffice', `${sessionDir}/msoffice`);

  console.log('Process JSON files into CSV');
  execSync(`bash -c "node ./process.js"`, { stdio: 'inherit' });

  console.log('Process Accessibility Results JSON into HTML Report')
  execSync(`bash -c "npx mochawesome-merge ./cypress/reports/mochawesome/*.json > ${sessionDir}/mochawesome.json"`, { stdio: 'inherit' });
  execSync(`bash -c "rm -r ./cypress/reports/mochawesome"`, { stdio: 'inherit' });
  execSync(`bash -c "npx mochawesome-report-generator -f mochawesome -o ${sessionDir} --cdn true --charts true ${sessionDir}/mochawesome.json"`, { stdio: 'inherit' });

  fs.readdirSync('./cypress/reports').forEach(file => {
    if (file.endsWith('.json') || file.endsWith('.csv')) fs.renameSync(`./cypress/reports/${file}`, `${sessionDir}/${file}`);
  });

  rl.close();
}

main();