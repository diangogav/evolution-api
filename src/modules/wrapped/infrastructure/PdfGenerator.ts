import { chromium } from "playwright";
import type { SeasonWrapped } from "../domain/SeasonWrapped";
import { renderTemplate, renderSinglePageTemplate } from "./templates/templateRenderer";

export interface GenerateOptions {
    locale: string;
    theme: "dark" | "light";
    includeMatchList: boolean;
    singlePage?: boolean;
}

export class PdfGenerator {
    async generate(data: SeasonWrapped, options: GenerateOptions): Promise<Buffer> {
        const html = options.singlePage
            ? renderSinglePageTemplate(data, options)
            : renderTemplate(data, options);

        const browser = await chromium.launch({
            headless: true,
        });

        const page = await browser.newPage();

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

        await browser.close();

        return Buffer.from(pdf);
    }
}
