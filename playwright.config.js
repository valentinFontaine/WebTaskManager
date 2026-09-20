// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/*
 * Cible des tests.
 *
 * Par defaut : backend FastAPI local sur le port 8000 (cf. main_fastapi.py).
 * Surchargeable par variables d'environnement, pour couvrir les 3 etages de test :
 *
 *   dev-pc    (defaut)                      -> demarre main_fastapi.py sur 8000
 *   staging   PW_BASE_URL=http://localhost:8000 PW_NO_SERVER=1
 *   telephone PW_BASE_URL=http://localhost:1875 PW_NO_SERVER=1   (via adb forward)
 *
 * PW_NO_SERVER=1 empeche Playwright de lancer un backend local quand on cible
 * un serveur deja demarre (telephone, staging).
 */
const PORT = process.env.PW_PORT || '8000';
const BASE_URL = process.env.PW_BASE_URL || `http://localhost:${PORT}`;
const START_SERVER = !process.env.PW_NO_SERVER;

/*
 * Garde-fou : les tests executent de vraies commandes Taskwarrior des lors que
 * DEVELOPER_MODE est desactive. Sans TASKRC explicite, Taskwarrior ecrirait dans
 * la base de PRODUCTION (~/.task, synchronisee par Syncthing).
 * Retire ce bloc si tu preferes gerer l'isolation autrement.
 */
if (START_SERVER && !process.env.TASKRC && !process.env.TASKDATA) {
  throw new Error(
    "TASKRC (ou TASKDATA) n'est pas defini : refus de lancer les tests pour ne pas " +
    "ecrire dans la base Taskwarrior de production.\n" +
    "  PC      : $env:TASKRC='C:/Users/irpaui/taskwarrior-dev/taskrc'\n" +
    "  Termux  : export TASKRC=~/taskwarrior-staging/taskrc"
  );
}

module.exports = defineConfig({
  testDir: './tests',
  /* Maximum time one test can run for. */
  timeout: 30 * 1000,
  expect: {
    timeout: 5000
  },
  /*
   * Volontairement a false : les describes d'un meme fichier tournent alors
   * dans un seul worker, sauf ceux qui declarent `mode: 'parallel'`.
   *
   * Deux blocs creent de vraies taches via l'API, et le backend serialise ses
   * sous-processus TaskWarrior. A true, ils tombaient dans deux workers
   * differents et se disputaient une seule base : le plus lourd depassait son
   * delai environ une fois sur trois. Seul le bloc entierement stubbe reclame
   * le parallelisme, et lui n'a rien a se disputer.
   */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use */
  reporter: 'html',
  /* Shared settings for all the projects below. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: BASE_URL,

    /* Collect trace when retrying the failed test. */
    trace: 'on-first-retry',
    /* Capture screenshot after each test failure */
    screenshot: 'only-on-failure',
    /* Record video of test execution */
    video: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run your local dev server before starting the tests.
   * `python` et non `python3` : portable Windows + Termux. */
  ...(START_SERVER
    ? {
        webServer: {
          command: process.env.PW_SERVER_CMD || 'python main_fastapi.py',
          url: BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 60 * 1000,
        },
      }
    : {}),
});
