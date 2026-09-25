// Evolution brand theme for the Scalar API reference, built on the CSS
// variables of @scalar/themes. The plugin embeds this string inside a
// single-quoted HTML attribute, so it must never contain single quotes.
// Selectors are prefixed with body so they outrank the defaults Scalar
// injects later for .dark-mode and .light-mode.
export const EVOLUTION_SCALAR_CSS = `
body.dark-mode,
body .dark-mode {
  --scalar-color-1: rgba(255, 255, 255, 0.92);
  --scalar-color-2: rgba(224, 204, 250, 0.72);
  --scalar-color-3: rgba(224, 204, 250, 0.46);
  --scalar-color-accent: #883aea;

  --scalar-background-1: #13151a;
  --scalar-background-2: #1b1d25;
  --scalar-background-3: #262833;
  --scalar-background-accent: rgba(136, 58, 234, 0.2);

  --scalar-link-color: color-mix(in srgb, #883aea 65%, #ffffff);
  --scalar-link-color-hover: rgb(224, 204, 250);

  --scalar-sidebar-color-active: color-mix(in srgb, #883aea 65%, #ffffff);
  --scalar-sidebar-item-active-background: rgba(136, 58, 234, 0.2);

  --scalar-border-color: rgba(224, 204, 250, 0.1);

  --scalar-button-1: #883aea;
  --scalar-button-1-color: #ffffff;
  --scalar-button-1-hover: #9d5cef;

  --scalar-color-green: #6ee7a8;
  --scalar-color-red: #ff8a8a;
  --scalar-color-yellow: #f5d76e;
  --scalar-color-blue: #7aa7f2;
  --scalar-color-orange: #f2a66e;
  --scalar-color-purple: #bd24df;

  --scalar-scrollbar-color: rgba(224, 204, 250, 0.18);
  --scalar-scrollbar-color-active: rgba(224, 204, 250, 0.36);
}

body.light-mode,
body .light-mode {
  --scalar-color-1: rgb(49, 10, 101);
  --scalar-color-2: rgba(49, 10, 101, 0.72);
  --scalar-color-3: rgba(49, 10, 101, 0.5);
  --scalar-color-accent: #883aea;

  --scalar-background-1: #ffffff;
  --scalar-background-2: #f7f2fe;
  --scalar-background-3: rgb(224, 204, 250);
  --scalar-background-accent: rgba(136, 58, 234, 0.12);

  --scalar-link-color: #883aea;
  --scalar-link-color-hover: rgb(49, 10, 101);

  --scalar-sidebar-color-active: #883aea;
  --scalar-sidebar-item-active-background: rgba(136, 58, 234, 0.12);

  --scalar-border-color: rgba(49, 10, 101, 0.12);

  --scalar-button-1: #883aea;
  --scalar-button-1-color: #ffffff;
  --scalar-button-1-hover: rgb(49, 10, 101);
}

body.light-mode .t-doc__sidebar,
body.dark-mode .t-doc__sidebar {
  --scalar-sidebar-background-1: var(--scalar-background-1);
  --scalar-sidebar-color-1: var(--scalar-color-1);
  --scalar-sidebar-color-2: var(--scalar-color-2);
  --scalar-sidebar-border-color: var(--scalar-border-color);

  --scalar-sidebar-item-hover-background: var(--scalar-background-2);
  --scalar-sidebar-item-hover-color: currentColor;

  --scalar-sidebar-item-active-background: var(--scalar-background-accent);

  --scalar-sidebar-search-background: var(--scalar-background-2);
  --scalar-sidebar-search-color: var(--scalar-color-3);
  --scalar-sidebar-search-border-color: var(--scalar-border-color);
}

body.dark-mode .t-doc__sidebar {
  --scalar-sidebar-background-1: #111318;
}

.section-flare {
  width: 100%;
  height: 360px;
  position: absolute;
  pointer-events: none;
  background: radial-gradient(ellipse at 100% 0%, rgba(189, 36, 223, 0.22), transparent 60%),
    radial-gradient(ellipse at 70% 0%, rgba(45, 106, 222, 0.18), transparent 55%);
}
`;
