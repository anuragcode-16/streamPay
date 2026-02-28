import { chromium } from 'playwright';

(async () => {
    try {
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();

        let foundErrors = false;

        page.on('console', msg => {
            if (msg.type() === 'error') {
                console.log('BROWSER CONSOLE ERROR:', msg.text());
                foundErrors = true;
            }
        });

        page.on('pageerror', err => {
            console.log('BROWSER PAGE ERROR:', err.message);
            foundErrors = true;
        });

        console.log('Navigating to http://localhost:8080...');
        await page.goto('http://localhost:8080', { waitUntil: 'domcontentloaded', timeout: 10000 });

        await new Promise(r => setTimeout(r, 2000));

        if (!foundErrors) {
            console.log('No errors found! Page title:', await page.title());
        }

        await browser.close();
    } catch (e) {
        console.error('SCRIPT ERROR:', e);
    }
})();
