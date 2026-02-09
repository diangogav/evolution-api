import { chromium, type Browser, type Page } from "playwright";
import type { SeasonWrapped } from "../domain/SeasonWrapped";
import type { IThemeStrategy, GenerateOptions } from "../domain/IThemeStrategy";
import { renderTemplate, renderSinglePageTemplate } from "./templates/templateRenderer";

export class PdfGenerator {
    private static browser: Browser | null = null;
    private static pagePool: Page[] = [];
    private static readonly MAX_POOL_SIZE = 4;
    private static waitingQueue: ((page: Page) => void)[] = [];
    private static isInitializing = false;

    /**
     * Initializes the shared browser instance and pre-warms the page pool.
     */
    static async init(): Promise<void> {
        if (this.browser || this.isInitializing) return;

        this.isInitializing = true;
        try {
            this.browser = await chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            // Pre-warm initial pages
            for (let i = 0; i < this.MAX_POOL_SIZE; i++) {
                const page = await this.browser.newPage();
                this.pagePool.push(page);
            }
        } finally {
            this.isInitializing = false;
        }
    }

    /**
     * Gracefully closes the browser and clears the pool.
     */
    static async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.pagePool = [];
        }
    }

    private async acquirePage(): Promise<Page> {
        if (!PdfGenerator.browser) {
            await PdfGenerator.init();
        }

        if (PdfGenerator.pagePool.length > 0) {
            return PdfGenerator.pagePool.shift()!;
        }

        return new Promise((resolve) => {
            PdfGenerator.waitingQueue.push(resolve);
        });
    }

    private releasePage(page: Page) {
        if (PdfGenerator.waitingQueue.length > 0) {
            const nextResolver = PdfGenerator.waitingQueue.shift()!;
            nextResolver(page);
        } else {
            PdfGenerator.pagePool.push(page);
        }
    }

    async generate(data: SeasonWrapped, options: GenerateOptions, themeStrategy: IThemeStrategy): Promise<Buffer> {
        const html = options.singlePage
            ? renderSinglePageTemplate(data, options, themeStrategy)
            : renderTemplate(data, options, themeStrategy);

        const page = await this.acquirePage();

        try {
            await page.setContent(html, {
                waitUntil: "networkidle",
            });

            const pdf = await page.pdf({
                format: "A4",
                printBackground: true,
                margin: {
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: 0,
                },
                preferCSSPageSize: true,
            });

            return Buffer.from(pdf);
        } finally {
            this.releasePage(page);
        }
    }
}
