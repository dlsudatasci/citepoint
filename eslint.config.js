const js = require('@eslint/js');
const globals = require('globals');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');
const prettierConfig = require('eslint-config-prettier');

// `catch (_) {}` is a deliberate "swallow and ignore" idiom used throughout this
// codebase — recognized by name so no-unused-vars/no-empty don't flag it.
const IGNORED_UNUSED = { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' };

module.exports = [
    {
        ignores: [
            '**/node_modules/**',
            'dashboard/dist/**',
            'lib/**',
            'playwright-report/**',
            'test-results/**',
            'backend/coverage/**',
        ],
    },
    js.configs.recommended,
    {
        rules: {
            'no-empty': ['error', { allowEmptyCatch: true }],
        },
    },

    // ── Root-level Node tooling config files ──
    {
        files: ['*.config.js'],
        ignores: ['vite.config.js'],
        languageOptions: {
            sourceType: 'commonjs',
            ecmaVersion: 2022,
            globals: { ...globals.node },
        },
    },
    {
        files: ['vite.config.js'],
        languageOptions: {
            sourceType: 'module',
            ecmaVersion: 2022,
            globals: { ...globals.node },
        },
    },

    // ── Extension content scripts / background / popup / forms ──
    // Loaded as plain <script> tags per manifest.json, not ES modules — each file
    // defines and consumes globals across the others (e.g. CATEGORIES from
    // config/config.js, apiGetCitations from content/api.js). no-undef can't
    // reliably tell a real typo from a cross-file global in this pattern, so it's
    // off here. no-unused-vars is scoped to `vars: 'local'` for the same reason —
    // a top-level function meant to be called from another file isn't dead code.
    {
        files: [
            'content/**/*.js',
            'background/**/*.js',
            'popup/**/*.js',
            'utils/**/*.js',
            'config/**/*.js',
            'forms/**/*.js',
            'discussion/**/*.js',
        ],
        languageOptions: {
            sourceType: 'script',
            ecmaVersion: 2022,
            globals: {
                ...globals.browser,
                ...globals.webextensions,
                // This codebase's own tracked-playback-position variable — the
                // `globals` package's browser set treats `currentTime` as a builtin
                // (relevant to some Web Audio/Media APIs), which isn't applicable
                // to a plain top-level `let currentTime` here.
                currentTime: 'off',
            },
        },
        rules: {
            'no-undef': 'off',
            'no-unused-vars': ['warn', { ...IGNORED_UNUSED, vars: 'local' }],
        },
    },

    // ── React dashboard ──
    {
        files: ['src/dashboard/**/*.{js,jsx}'],
        languageOptions: {
            sourceType: 'module',
            ecmaVersion: 2022,
            parserOptions: { ecmaFeatures: { jsx: true } },
            globals: { ...globals.browser, ...globals.webextensions },
        },
        plugins: { react, 'react-hooks': reactHooks },
        rules: {
            ...react.configs.recommended.rules,
            ...reactHooks.configs.recommended.rules,
            'react/prop-types': 'off',
            'react/react-in-jsx-scope': 'off',
            'no-unused-vars': ['warn', IGNORED_UNUSED],
        },
        settings: { react: { version: 'detect' } },
    },

    // ── Backend (Express, CommonJS) ──
    {
        files: ['backend/**/*.js'],
        languageOptions: {
            sourceType: 'commonjs',
            ecmaVersion: 2022,
            globals: { ...globals.node, ...globals.jest },
        },
        rules: {
            'no-unused-vars': ['warn', IGNORED_UNUSED],
        },
    },

    // ── e2e / selenium specs (Node + real-browser evaluate() callbacks) ──
    // page.evaluate()/sw.evaluate() take a function whose *body* runs inside the
    // extension's own page/service-worker realm, referencing that realm's globals
    // (chrome, API_BASE_URL, content-script internals like _currentUsername) —
    // invisible to static analysis here, so no-undef is off for the same reason as
    // the vanilla content-script block above.
    {
        files: ['e2e/**/*.js', 'selenium/**/*.js'],
        languageOptions: {
            sourceType: 'commonjs',
            ecmaVersion: 2022,
            globals: { ...globals.node, ...globals.browser, ...globals.webextensions },
        },
        rules: {
            'no-undef': 'off',
            'no-unused-vars': ['warn', IGNORED_UNUSED],
        },
    },

    prettierConfig,
];
