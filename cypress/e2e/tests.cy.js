const options = require('../support/options');
let currentUrl;
let visitOptions = {};
let errorLog = [];
let pdfUrls = [];
let msOfficeUrls = [];
let testStartTime = Date.now();
let lastTestTime = Date.now();
let testsRun = 0;
if ('httpUser' in options && options.httpUser != '') visitOptions.auth = {
	username: options.httpUser,
	password: options.httpPassword
};

function appendToJSON(fileName, data, logHeading, logData) {
	if (logHeading) cy.task('log', logHeading);
	cy.task('log', logData ? logData : data);
	cy.writeFile(`./cypress/reports/${fileName}.json`, JSON.stringify(data, '\t', 1) + ',\n', { flag: 'a+' });
}

function addToResultsLog(data) {
	appendToJSON('results', { currentUrl, data }, 'Accessibility Errors', data.map(i => `${i.id}: ${i.description}`));
}

Cypress.config('numTestsKeptInMemory', 0);

Cypress.on('uncaught:exception', (err, runnable) => {
	const match = (err.message || err.toString()).match(/>\s*(.*)/);
	if (match) {
		errorLog.push({ url: currentUrl, error: match[1].trim() });
	} else {
		errorLog.push({ url: currentUrl, error: err.message || err.toString() });
	}
	return false;
});

describe('Testing', () => {
	options.testUrls
		.forEach(testUrl => {
			describe(`URL: ${testUrl}`, () => {
				beforeEach(() => {
					if ('wpLogin' in options) {
						cy.session('wp-login-session', () => {
							cy.visit(options.wpLogin.url);
							cy.get('#user_login').type(options.wpLogin.username);
							cy.get('#user_pass').type(options.wpLogin.password, { log: false });
							cy.get('#wp-submit').click();
							cy.url().should('not.include', 'wp-login.php');
						});
					}

					currentUrl = testUrl;
					errorLog = [];
					pdfUrls = [];
					msOfficeUrls = [];
					cy.visit(testUrl, visitOptions);
					cy.injectAxe();
					cy.configureAxe({
						runOnly: {
							type: 'tag',
							values: [
								'wcag2a', 'wcag2aa', 'wcag2aaa',
								'wcag21a', 'wcag21aa', 'wcag21aaa',
								'wcag22a', 'wcag22aa', 'wcag22aaa',
								'section508',
								'best-practice', 'ACT', 'experimental'
							]
						}
					});
				});

				it('Accessibility', () => {
					cy.get('a, img, script, link').each(($el) => {
						const href = $el.prop('href') || $el.prop('src');
						if (href) {
							const fileUrl = new URL(href, currentUrl).pathname;
							if (fileUrl.toLowerCase().endsWith('.pdf') && !pdfUrls.some(e => e.pdf === fileUrl)) {
								pdfUrls.push({ url: currentUrl, pdf: fileUrl });
							}
							if (
								/\.(doc|docx|docm|dotx|dotm|xls|xlsx|xlsm|xltx|xltm|xlsb|ppt|pptx|pptm|potx|potm|ppsx)$/i.test(fileUrl) && 
								!msOfficeUrls.some(e => e.msoffice === fileUrl)
							) {
								msOfficeUrls.push({ url: currentUrl, msoffice: fileUrl });
							}
						}
					});
					cy.checkA11y(null, null, addToResultsLog);
				});

				afterEach(() => {
					cy.url().then(finalUrl => {
						if (finalUrl !== currentUrl) {
							appendToJSON('redirects', { from: currentUrl, to: finalUrl }, 'Redirected', finalUrl);
						}
					});
					if (errorLog.length) {
						appendToJSON('exceptions', errorLog, 'JS Errors');
					}
					if (pdfUrls.length) {
						appendToJSON('pdf', pdfUrls, 'PDF Files');
					}
					if (msOfficeUrls.length) {
						appendToJSON('msoffice', msOfficeUrls, 'MS Office Files');
					}
					testsRun++;
					cy.task('log', `Test Time: ${(Date.now() - lastTestTime) / 1000}sec (Avg: ${Math.floor((Date.now() - testStartTime) / testsRun) / 1000}sec)`);
					lastTestTime = Date.now();
				});
			});
		});
});
