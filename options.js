const fs = require('fs');
const axios = require('axios');
const xml2js = require('xml2js');
const cheerio = require('cheerio');
const readline = require('readline');
const { URL } = require('url');

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

const config = {};

function questionAsync(question) {
	return new Promise(resolve => rl.question(question, resolve));
}

function isAbsoluteUrl(url) {
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
}

function normalizeUrl(url) {
	try {
		const u = new URL(url);
		u.hash = '';
		return u.toString();
	} catch {
		return url;
	}
}

function uniqueSortedUrls(urls) {
	return Array.from(new Set(urls.map(normalizeUrl))).sort();
}

async function promptForSitemaps() {
	const urls = [];
	while (true) {
		const url = await questionAsync(`Sitemap URL (leave empty to finish): `);
		if (!url) break;
		if (!isAbsoluteUrl(url)) {
			console.log('Invalid URL. Please enter an absolute URL.');
			continue;
		}
		urls.push(url);
	}
	return urls;
}

async function parseSitemap(sitemapUrl) {
	console.log(`Parsing sitemap ${sitemapUrl}`);
	const urls = [];
	try {
		const { data } = await axios.get(sitemapUrl);
		const result = await xml2js.parseStringPromise(data);
		if (result.urlset?.url) {
			for (const url of result.urlset.url) {
				const normalized = normalizeUrl(url.loc[0]);
				if (!urls.includes(normalized)) urls.push(normalized);
			}
		} else if (result.sitemapindex?.sitemap) {
			for (const sitemap of result.sitemapindex.sitemap) {
				const nestedUrls = await parseSitemap(sitemap.loc[0]);
				urls.push(...nestedUrls);
			}
		}
	} catch (err) {
		console.error(`Error parsing sitemap at ${sitemapUrl}:`, err.message);
	}
	return urls;
}

async function crawlSite(startUrl, visited = new Set()) {
	const baseDomain = new URL(startUrl).hostname;
	const queue = [startUrl];
	const htmlUrls = [];
	const pdfUrls = [];
	const msOfficeUrls = [];
	const otherNonHtmlUrls = [];

	const officeFileRegex = /\.(doc|docx|docm|dotx|dotm|xls|xlsx|xlsm|xltx|xltm|xlsb|ppt|pptx|pptm|potx|potm|ppsx)(\?.*)?$/i;

	while (queue.length > 0) {
		const currentUrl = normalizeUrl(queue.shift());
		if (visited.has(currentUrl)) continue;
		visited.add(currentUrl);
		console.log(`Crawling ${currentUrl}`);

		try {
			const response = await axios.get(currentUrl, {
				timeout: 5000,
				responseType: 'arraybuffer' // allows checking file type even if content-type is ambiguous
			});

			const contentType = response.headers['content-type'] || '';
			const contentDisposition = response.headers['content-disposition'] || '';
			const urlPath = new URL(currentUrl).pathname;

			const isHtml = contentType.includes('text/html');
			const isPdf = contentType.includes('application/pdf') ||
				contentDisposition.includes('.pdf') ||
				urlPath.endsWith('.pdf');

			const isOffice = officeFileRegex.test(contentDisposition) || officeFileRegex.test(urlPath);

			if (isHtml) {
				htmlUrls.push(currentUrl);
				const $ = cheerio.load(response.data.toString());
				$('a[href]').each((_, el) => {
					const href = $(el).attr('href');
					try {
						const fullUrl = normalizeUrl(new URL(href, currentUrl).toString());
						if (new URL(fullUrl).hostname === baseDomain && !visited.has(fullUrl)) {
							queue.push(fullUrl);
						}
					} catch {
						// Skip invalid or relative-only URLs
					}
				});
			} else if (isPdf) {
				pdfUrls.push(currentUrl);
			} else if (isOffice) {
				msOfficeUrls.push(currentUrl);
			} else {
				otherNonHtmlUrls.push({ url: currentUrl, contentType });
			}
		} catch (err) {
			console.warn(`Failed to fetch ${currentUrl}: ${err.message}`);
		}
	}

	return {
		htmlUrls,
		pdfUrls,
		msOfficeUrls,
		otherNonHtmlUrls
	};
}

async function promptUser() {
	config.baseUrl = await questionAsync('Base URL: ');
	while (!isAbsoluteUrl(config.baseUrl)) {
		console.log('Invalid URL. Please enter an absolute URL.');
		config.baseUrl = await questionAsync('Base URL: ');
	}

	config.sitemapUrls = await promptForSitemaps();

	config.httpUser = await questionAsync('HTTP user: ');
	config.httpPassword = await questionAsync('HTTP password: ');

	config.wpLogin = {
		url: await questionAsync('WordPress Login URL: '),
		username: await questionAsync('WordPress username: '),
		password: await questionAsync('WordPress password: ')
	};

	if (!(config.wpLogin.url && config.wpLogin.username && config.wpLogin.password)) {
		delete config.wpLogin;
	}

	config.testUrls = [config.baseUrl];
	for (const sitemapUrl of config.sitemapUrls) {
		const urls = await parseSitemap(sitemapUrl);
		config.testUrls.push(...urls);
	}

	const doCrawl = (await questionAsync('Would you like to crawl the site to find more URLs? (yes/no): '))
		.toLowerCase().startsWith('y');
	if (doCrawl) {
		const { htmlUrls, pdfUrls, msOfficeUrls, otherNonHtmlUrls } = await crawlSite(config.baseUrl);
		config.testUrls.push(...htmlUrls);
		config.pdfUrls = pdfUrls;
		config.msOfficeUrls = msOfficeUrls;
		config.otherNonHtmlUrls = otherNonHtmlUrls;
	}

	['htmlUrls', 'pdfUrls', 'msOfficeUrls', 'otherNonHtmlUrls'].forEach((s) => {
		if (s in config && config[s].length) config[s] = uniqueSortedUrls(config[s]);
	})

	rl.close();
}

(async () => {
	await promptUser();
	fs.writeFileSync('cypress/support/options.json', JSON.stringify(config, null, 2));
	console.log(`\nSaved ${config.testUrls.length} HTML URLs to ./cypress/support/options.json`);
	if (config.nonHtmlUrls) {
		console.log(`Also found ${config.nonHtmlUrls.length} non-HTML URLs`);
	}
})();
