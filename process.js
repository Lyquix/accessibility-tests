const fs = require('fs');
const json2csv = require('json2csv');

// Process accessibility test results
// Read the JSON file
const axeData = JSON.parse(fs.readFileSync('./cypress/reports/results.json'));

// Cycle through all the keys in data.results using for
// and push the data into an array
let fields = [
	'url',
	'id',
	'impact',
	'tags',
	'help',
	'description',
	'helpUrl',
	'html',
	'target',
	'failureSummary'
];
let csvData = [];

// sort the keys in axeData.results alphabetically
axeData.forEach((page) => {
	if ('currentUrl' in page && 'data' in page) {
		page.data.forEach((test) => {
			test.nodes.forEach((node) => {
				csvData.push({
					url: page.currentUrl,
					id: test.id,
					impact: test.impact,
					tags: test.tags.join('\n'),
					help: test.help,
					description: test.description,
					helpUrl: test.helpUrl,
					html: node.html,
					target: node.target.join('\n'),
					failureSummary: node.failureSummary
				});
			});
		});
	}
});

let csvFile = json2csv.parse(csvData, fields);
fs.writeFileSync('./cypress/reports/results.csv', csvFile);

fields = ['url', 'total'];
csvData = [];

axeData.forEach((page) => {
	let errorCounter = {
		url: page.currentUrl,
		total: 0
	};

	if ('currentUrl' in page && 'data' in page) {
		page.data.forEach((test) => {
			if (!(test.id in errorCounter)) errorCounter[test.id] = test.nodes.length;
			else errorCounter[test.id] += test.nodes.length;

			errorCounter.total++;

			if (!fields.includes(test.id)) fields.push(test.id);
		});
	}

	csvData.push(errorCounter);

});

csvFile = json2csv.parse(csvData, fields);
fs.writeFileSync('cypress/reports/summary.csv', csvFile);

// Process failures
const failuresData = JSON.parse(fs.readFileSync('./cypress/reports/exceptions.json'));
fields = ['url', 'error'];
csvData = [];

failuresData.forEach((page) => {
	page.forEach((data) => {
		csvData.push(data);
	});
});

if (csvData.length) {
	csvFile = json2csv.parse(csvData, fields);
	fs.writeFileSync('./cypress/reports/exceptions.csv', csvFile);
}

// Process PDFs
const pdfFiles = JSON.parse(fs.readFileSync('./cypress/reports/pdf.json'));
fields = ['url', 'pdf'];
csvData = [];

pdfFiles.forEach((page) => {
	page.forEach((data) => {
		csvData.push(data);
	});
});

if (csvData.length) {
	csvFile = json2csv.parse(csvData, fields);
	fs.writeFileSync('./cypress/reports/pdf.csv', csvFile);
}

// Process MS Office
const msOfficeFiles = JSON.parse(fs.readFileSync('./cypress/reports/msoffice.json'));
fields = ['url', 'msoffice'];
csvData = [];

msOfficeFiles.forEach((page) => {
	page.forEach((data) => {
		csvData.push(data);
	});
});

if (csvData.length) {
	csvFile = json2csv.parse(csvData, fields);
	fs.writeFileSync('./cypress/reports/msoffice.csv', csvFile);
}

// Process Redirects
const redirects = JSON.parse(fs.readFileSync('./cypress/reports/redirects.json'));
fields = ['from', 'to'];
csvData = [];

redirects.forEach((row) => {
	if ('from' in row && 'to' in row) csvData.push(row);
});

if (csvData.length) {
	csvFile = json2csv.parse(csvData, fields);
	fs.writeFileSync('./cypress/reports/redirects.csv', csvFile);
}