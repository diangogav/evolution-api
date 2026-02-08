const PdfPrinter = require('pdfmake/js/Printer').default;
import { TDocumentDefinitions } from "pdfmake/interfaces";
import { IReportsRepository } from "../domain/IReportsRepository";
import { ReportsPostgresRepository } from "../infrastructure/ReportsPostgresRepository";

export class GenerateWrappedReport {
    private repository: IReportsRepository;

    constructor(repository?: IReportsRepository) {
        this.repository = repository || new ReportsPostgresRepository();
    }

    async execute(userId: string): Promise<Buffer> {
        const seasons = [3, 4, 5];
        const playerStats = await this.repository.getPlayerStats(userId, seasons);
        const rivals = await this.repository.getTopRivals(userId, seasons);

        // Aggregate stats
        const totalWins = playerStats.reduce((sum, s) => sum + s.wins, 0);
        const totalLosses = playerStats.reduce((sum, s) => sum + s.losses, 0);
        const totalPoints = playerStats.reduce((sum, s) => sum + s.points, 0);
        const totalMatches = totalWins + totalLosses;
        const totalWinRate = totalMatches > 0 ? ((totalWins / totalMatches) * 100).toFixed(1) + "%" : "0%";

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
                                                { text: totalMatches.toString(), style: "statVal" },
                                                { text: "✅ Wins", style: "statLabel" },
                                                { text: totalWins.toString(), style: "statVal" }
                                            ],
                                            [
                                                { text: "❌ Losses", style: "statLabel" },
                                                { text: totalLosses.toString(), style: "statVal" },
                                                { text: "📈 Win Rate", style: "statLabel" },
                                                { text: totalWinRate, style: "statVal" }
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
                ...seasons.map(season => {
                    const stats = playerStats.find(s => s.season === season);
                    const rival = rivals.find(r => r.season === season);

                    if (!stats) return null;

                    const winRate = (stats.wins + stats.losses) > 0
                        ? ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1) + "%"
                        : "0%";

                    return [
                        {
                            canvas: [
                                { type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#e0e0e0' }
                            ],
                            margin: [0, 20, 0, 20]
                        },
                        {
                            text: `📅 SEASON ${season}`,
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
                                        { text: `Win Rate: ${winRate}`, margin: [0, 2, 0, 2] }
                                    ],
                                    style: "seasonStats"
                                },
                                {
                                    width: '50%',
                                    stack: [
                                        { text: "💀 Top Rival:", bold: true, color: '#555' },
                                        rival ? { text: `${rival.rivalName.toUpperCase()}`, fontSize: 14, bold: true, margin: [0, 2, 0, 0] } : { text: "No matches", italics: true, color: '#999' },
                                        rival ? { text: `${rival.wins} wins in ${rival.matches} games`, fontSize: 10, color: '#777' } : {}
                                    ],
                                    alignment: 'right'
                                }
                            ]
                        }
                    ];
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
                // pdfDoc is a Promise in recent pdfmake versions if image URLs need resolving, or just generally async in source
                // Wait, checks showing it is async in source
                Promise.resolve(pdfDoc).then((doc: any) => {
                    const chunks: Uint8Array[] = [];
                    doc.on('data', (chunk: any) => chunks.push(chunk));
                    doc.on('end', () => resolve(Buffer.concat(chunks)));
                    doc.on('error', (err: any) => reject(err));
                    doc.end();
                }).catch(reject);
            } catch (err) {
                reject(err);
            }
        });
    }
}

