// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake/js/Printer').default;
import { TDocumentDefinitions } from "pdfmake/interfaces";
import { IPdfGenerator, WrappedReportData } from "../domain/IPdfGenerator";

export class PdfMakeGenerator implements IPdfGenerator {
    async generate(data: WrappedReportData): Promise<Buffer> {
        const fonts = {
            Roboto: {
                normal: "node_modules/pdfmake/fonts/Roboto/Roboto-Regular.ttf",
                bold: "node_modules/pdfmake/fonts/Roboto/Roboto-Medium.ttf",
                italics: "node_modules/pdfmake/fonts/Roboto/Roboto-Italic.ttf",
                bolditalics: "node_modules/pdfmake/fonts/Roboto/Roboto-MediumItalic.ttf"
            }
        };

        const printer = new PdfPrinter(fonts);

        const docDefinition: TDocumentDefinitions = {
            pageMargins: [40, 60, 40, 60],
            defaultStyle: {
                font: 'Roboto',
                fontSize: 12,
                color: '#333333'
            },
            background: [
                {
                    canvas: [
                        { type: 'rect', x: 0, y: 0, w: 595.28, h: 841.89, color: '#f8f9fa' } // Light gray background
                    ]
                }
            ],
            content: [
                {
                    text: "✨ YOUR EVOLUTION WRAPPED ✨",
                    style: "header",
                    alignment: "center",
                    margin: [0, 20, 0, 40]
                },
                {
                    columns: [
                        { width: '*', text: '' },
                        {
                            width: 'auto',
                            stack: [
                                { text: "🏆 ALL TIME STATS (S3-S5)", style: "subheader", alignment: "center" },
                                {
                                    table: {
                                        body: [
                                            [
                                                { text: "🔥 Matches", style: "statLabel" },
                                                { text: data.totalMatches.toString(), style: "statVal" },
                                                { text: "✅ Wins", style: "statLabel" },
                                                { text: data.totalWins.toString(), style: "statVal" }
                                            ],
                                            [
                                                { text: "❌ Losses", style: "statLabel" },
                                                { text: data.totalLosses.toString(), style: "statVal" },
                                                { text: "📈 Win Rate", style: "statLabel" },
                                                { text: data.totalWinRate, style: "statVal" }
                                            ]
                                        ]
                                    },
                                    layout: 'noBorders',
                                    style: "statTable"
                                }
                            ]
                        },
                        { width: '*', text: '' }
                    ]
                },
                { text: "", margin: [0, 20] },
                // Season Breakdown
                ...data.seasons.map(seasonData => {
                    const stats = seasonData.stats;
                    const rival = seasonData.rival;

                    if (!stats) return null;

                    return [
                        {
                            canvas: [
                                { type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#e0e0e0' }
                            ],
                            margin: [0, 20, 0, 20]
                        },
                        {
                            text: `📅 SEASON ${seasonData.season}`,
                            style: "seasonHeader",
                            margin: [0, 0, 0, 10]
                        },
                        {
                            columns: [
                                {
                                    width: '50%',
                                    stack: [
                                        { text: `Points: ${stats.points} 💎`, margin: [0, 2, 0, 2] },
                                        { text: `Record: ${stats.wins}W - ${stats.losses}L`, margin: [0, 2, 0, 2] },
                                        { text: `Win Rate: ${stats.winRate}`, margin: [0, 2, 0, 2] }
                                    ],
                                    style: "seasonStats"
                                },
                                {
                                    width: '50%',
                                    stack: [
                                        { text: "💀 Top Rival:", bold: true, color: '#555' },
                                        rival ? { text: `${rival.name.toUpperCase()}`, fontSize: 14, bold: true, margin: [0, 2, 0, 0] } : { text: "No matches", italics: true, color: '#999' },
                                        rival ? { text: `${rival.wins} wins in ${rival.matches} games`, fontSize: 10, color: '#777' } : {}
                                    ],
                                    alignment: 'right'
                                }
                            ]
                        }
                    ];
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                }).filter(Boolean) as any[]
            ],
            styles: {
                header: {
                    fontSize: 26,
                    bold: true,
                    color: '#1a1a1a',
                    characterSpacing: 2
                },
                subheader: {
                    fontSize: 16,
                    bold: true,
                    color: '#444444',
                    margin: [0, 0, 0, 10]
                },
                seasonHeader: {
                    fontSize: 18,
                    bold: true,
                    color: '#2c3e50'
                },
                statLabel: {
                    fontSize: 12,
                    color: '#666666',
                    margin: [0, 5, 10, 5]
                },
                statVal: {
                    fontSize: 14,
                    bold: true,
                    color: '#000000',
                    margin: [0, 5, 20, 5]
                },
                statTable: {
                    margin: [0, 10, 0, 10]
                },
                seasonStats: {
                    fontSize: 12,
                    color: '#444'
                }
            }
        };

        return new Promise((resolve, reject) => {
            try {
                const pdfDoc = printer.createPdfKitDocument(docDefinition);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                Promise.resolve(pdfDoc).then((doc: any) => {
                    const chunks: Uint8Array[] = [];
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    doc.on('data', (chunk: any) => chunks.push(chunk));
                    doc.on('end', () => resolve(Buffer.concat(chunks)));
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    doc.on('error', (err: any) => reject(err));
                    doc.end();
                }).catch(reject);
            } catch (err) {
                reject(err);
            }
        });
    }
}
