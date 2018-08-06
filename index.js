const puppeteer = require('puppeteer');
const consola = require('consola');
const config = require('./config.json');

process.on('uncaughtException', (err) => {
    consola.error(err);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    consola.error(reason);
    process.exit(1);
});

// graceful shutdown
process.on('SIGINT', () => {
    consola.warn('Starting shutdown');
    process.exit(0);
});

const errorCollection = [];
async function collectError(err) {
    return new Promise((resolve) => {
        errorCollection.push(
            // depulicate the error string to make it more readable
            err
                .split(',')
                .filter((item, pos, self) => self.indexOf(item) === pos)
                .join("\n")
        );
        resolve(true);
    });
}

async function displayErrors() {
    return new Promise((resolve) => {
        if (errorCollection.length < 1) {
            consola.success('Finished successfully!');
            resolve(true);
        }

        errorCollection.forEach(consola.error);
        resolve(false);
    });
}

async function handlePage(browser, uri) {
    consola.info(`Visiting: ${uri}`);
    const page = await browser.newPage();

    page.setDefaultNavigationTimeout(config.timeout);
    page.setViewport({width: 1200, height: 700});

    page.on('pageerror', (error) => {
        consola.warn(`Found an error on ${uri}. Continuing...`);
        collectError(`Page error on ${uri}: ${error.message}`);
    });

    page.on('requestfailed', (request) => {
        consola.warn(`Found an error on ${uri}. Continuing...`);
        collectError(`Request failed on ${uri}: ${request.failure().errorText}`);
    });

    page.goto(`${config.baseUrl}${uri}`);

    // wait for either of events to trigger
    await Promise.race([
        page.waitForNavigation({waitUntil: 'domcontentloaded'}),
        page.waitForNavigation({waitUntil: 'load'})
    ]);

    await page.waitFor(config.additionalDelay); // wait even more after the page is loaded

    return page.close();
}

(async function () {
    consola.start('Starting tests...');
    const browser = await puppeteer.launch(config.launchOptions);

    const pageArray = config.pages;

    for (let i = 0, l = pageArray.length; i < l; i += config.concurrentPages) {
        let pageSlice = pageArray.slice(i, i + config.concurrentPages);

        // visit all the pages and test for errors
        await Promise.all(pageSlice.map(async (uri) => {
            await handlePage(browser, uri);
        }));
    }

    consola.info('Finished page crawling...');

    await browser.close();

    const check = await displayErrors();
    if (!check) {
        process.exit(1);
    }

    process.exit(0);
})();
