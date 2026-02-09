import { AbstractThemeStrategy } from "./AbstractThemeStrategy";
import type { SeasonWrapped } from "../../domain/SeasonWrapped";
import type { ThemePhrases } from "../../domain/IThemeStrategy";

export class ValentineThemeStrategy extends AbstractThemeStrategy {
    getName(): string {
        return "valentines";
    }

    getStylesheet(): string {
        return `
            :root {
                --bg-base: #0f0506; /* Very dark deep red */
                --bg-card: #1a0a0b; /* Slightly lighter dark red surface */
                --text-primary: #fee2e2; /* Very light pink/near white */
                --text-secondary: #fda4af; /* Soft pink */
                --text-muted: #9f1239; /* Deep rose */
                --color-accent: #e11d48; /* Vibrant red */
                --border-subtle: rgba(225, 29, 72, 0.1);
                --border-medium: rgba(225, 29, 72, 0.3);
                --color-accent-rgb: 225, 29, 72;
            }

            .page {
                background: var(--bg-base) !important;
                color: var(--text-primary);
                page-break-after: always !important;
            }

            .page-bg-decoration {
                opacity: 0.15 !important;
                filter: hue-rotate(340deg) brightness(0.8) saturate(1.5) !important;
                mix-blend-mode: screen !important;
            }

            .card-container {
                background: var(--bg-card) !important;
                border: 1px solid var(--border-subtle) !important;
                box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5);
            }

            .rival-card {
                background: linear-gradient(135deg, rgba(26, 10, 11, 0.9) 0%, rgba(31, 12, 13, 0.9) 100%) !important;
                border: 2px solid rgba(225, 29, 72, 0.4) !important;
                /* Removed backdrop-filter due to PDF generation issues */
            }

            .page-title::after {
                background: var(--color-accent) !important;
                box-shadow: 0 0 15px var(--color-accent);
            }

            .header-bar {
                border-bottom-color: var(--border-subtle) !important;
            }

            .chapter-super {
                color: var(--color-accent) !important;
                text-shadow: 0 0 10px rgba(225, 29, 72, 0.5);
            }

            h1, h2, h3, .page-title {
                color: #fda4af !important; /* Soft light pink for titles on dark bg */
                text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
            }

            .pill {
                background: rgba(225, 29, 72, 0.1) !important;
                color: #fda4af !important;
                border: 1px solid rgba(225, 29, 72, 0.2);
            }

            .progress-track {
                background: rgba(0, 0, 0, 0.3) !important;
            }
        `;
    }

    getBackground(): string {
        return this.getImageAsBase64("black_rose_dragon.png");
    }

    getPhrases(data: SeasonWrapped): ThemePhrases {
        const base = super.getPhrases(data);

        const lovePhrases = [
            "¡Si aún nadie te lo ha dicho, feliz día del amor y la amistad!",
            "Más que un duelista, eres un rompecorazones.",
            "Tu Deck y tú: Una historia de amor mejor que Crepúsculo.",
            "Activaste mi carta trampa: ¡Amor Incondicional!",
            "¿Tu corazón tiene 8000 LP? Porque el mío bajó a 0 al verte jugar.",
            "Ni el Dragón Blanco de Ojos Azules brilla tanto como tu sonrisa (o tu winrate).",
            "Eres el 'Polimerización' de mi vida: nos haces uno solo.",
            "Si fueras una carta, serías Prohibida... por exceso de facha.",
            "Mi Deck late por ti más fuerte que un combo de 20 minutos.",
            "No necesito el Corazón de las Cartas si tengo el tuyo."
        ];

        const statsPhrases = [
            "Tus números enamoran (aunque a los Ban Lists no tanto).",
            "Duelista por fuera, poeta por dentro.",
            "Repartiendo amor y combos por igual.",
            "Tus Life Points bajan, pero mi cariño por tus jugadas sube.",
            "¿Quién necesita Tinder si tienes este Win Rate?",
            "Tus victorias son la flecha de Cupido en mi ranking.",
            "Analizando tu pasión: 50% Skill, 50% Suerte, 100% Amor.",
            "Incluso Exodia envidia lo completo que eres.",
            "Trazando el camino del amor... un duelo a la vez.",
            "Tus estadísticas dicen: ¡CÁSATE CONMIGO! (o al menos jueguen otra)."
        ];

        const rivalPhrases = [
            "Love is a Battlefield... y aquí perdiste contra este.",
            "Tu Archi-Rival o tu 'Enemies to Lovers' arc.",
            "Relación complicada: Se dan con todo en el campo.",
            "Tu media naranja... de destrucción masiva.",
            "Tóxicos, pero apasionados. El duelo nunca termina.",
            "¿Rivalidad o tensión sexual? El log no miente.",
            "Ni el odio ni el amor son tan fuertes como este 2-0.",
            "Tu destino está ligado a este duelista... por los siglos de los siglos.",
            "El roce hace el cariño... y las negaciones hacen el drama.",
            "Tu amor platónico (porque platónicamente lo quieres ver fuera del torneo)."
        ];

        const achievementPhrases = [
            "Coleccionando triunfos y suspiros.",
            "Logros que llegan directo al corazón.",
            "Tu legado es puro amor al arte del duelo.",
            "Brillando más que una carta holográfica en San Valentín.",
            "Desbloqueaste el logro más difícil: ¡Caerle bien a todos!",
            "Tus trofeos son los pétalos de una rosa de victoria.",
            "Logros obtenidos con sudor, lágrimas y mucho cariño.",
            "Cada medalla es un 'te quiero' de la comunidad.",
            "Tu vitrina está llena, pero siempre hay espacio para más amor.",
            "Nivel de Duelista: Enamorado de la victoria."
        ];

        const summaryPhrases = [
            "¡Nos vemos en el próximo duelo, Cupido de las cartas!",
            "Que tus robos sean siempre de corazón.",
            "Duelo terminado, pero el amor por el juego sigue.",
            "Sigue robando corazones (y victorias).",
            "Game Over? No, ¡Love Start!",
            "Gracias por compartir tu pasión con nosotros.",
            "Tu viaje continúa, ¡llénalo de duelos y abrazos!",
            "Recuerda: la mejor jugada es la que se hace con amigos.",
            "Nos vemos en el próximo turno de la vida.",
            "¡Hasta la próxima, leyenda del romance!"
        ];

        const coverTitles = [
            "EVOLUTION VALENTINE",
            "CORAZÓN DE LAS CARTAS (Y DEL MÍO)",
            "8000 LP DE PURA PASIÓN",
            "LOVE IS A BATTLEFIELD (CON TRAPAS)",
            "TÚ, YO Y UN DUELO NOCHE",
            "¡TE ELIJO A TI! (ESPERA, JUEGO EQUIVOCADO)",
            "ROBANDO EL CORAZÓN DE LAS CARTAS",
            "CUPIDO DUELISTA: EDICIÓN LIMITADA",
            "MI DECK DE AMOR: TOP TIER",
            "ROMPECORAZONES EN TURNO 1",
            "AMOR A PRIMERA JUGADA",
            "DIME QUE ME AMAS (O QUE NO TIENES ASH)"
        ];

        const random = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

        return {
            ...base,
            coverTitle: random(coverTitles),
            coverSubtitle: random(lovePhrases),
            statsTitle: "PASIÓN POR EL DUELO",
            statsSubtitle: random(statsPhrases),
            rivalsTitle: "LOVE & WAR",
            rivalsSubtitle: random(rivalPhrases),
            achievementsTitle: "TU LEGADO DE AMOR",
            achievementsSubtitle: random(achievementPhrases),
            summaryTitle: "RESUMEN CON AMOR",
            summarySubtitle: random(summaryPhrases)
        };
    }
}
