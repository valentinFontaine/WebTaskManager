const { test, expect } = require('@playwright/test');

// Désactiver le parallélisme pour éviter les interférences entre les tests
test.describe.configure({ mode: 'serial' });

test.describe('Task Manager', () => {
  let page;
  let browser;

  test.beforeAll(async ({ browser: testBrowser }) => {
    // Le backend est demarre par playwright.config.js (webServer), pas ici.
    // Créer une nouvelle instance de navigateur
    browser = testBrowser;
    const context = await browser.newContext();
    page = await context.newPage();

    // Activer les logs pour le débogage
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.error('PAGE ERROR:', error));

    // Aller à la page d'accueil
    await page.goto('/'); // baseURL depuis playwright.config.js

    // Attendre que la page soit chargée
    await page.waitForLoadState('networkidle');

    console.log('Page chargée avec succès');
  });

  test.afterAll(async () => {
    // Fermer le navigateur
    if (browser) {
      await browser.close();
    }
  });

  test('devrait afficher la page d\'accueil', async () => {
    console.log('Test: Vérification de la page d\'accueil');
    await expect(page).toHaveTitle('TaskWarrior Web UI');
    await expect(page.locator('h1')).toHaveText('TaskWarrior Web UI');

    // Prendre une capture d'écran de la page d'accueil
    await page.screenshot({ path: 'homepage.png' });
    console.log('Page d\'accueil vérifiée avec succès');
  });

  test('ne devrait afficher aucune erreur au chargement', async () => {
    // Ce test existe parce que les autres ne l'auraient pas vu : `loadTasks`
    // attrape ses exceptions et les affiche dans un bandeau, sans jamais rien
    // ecrire dans la console. Une page entierement cassee passait donc pour
    // saine. Cas reel : les cartes n'etaient pas encore chargees au premier
    // rendu, et `appendChild(null)` levait.
    const bandeau = page.locator('#error-message');
    await expect(bandeau).toBeHidden();

    // Et la liste doit etre reellement peuplee : un bandeau masque ne prouve
    // rien si rien ne s'affiche.
    await expect(page.locator('.task-card').first()).toBeVisible({ timeout: 10000 });
    console.log('Chargement sans erreur, cartes presentes');
  });

  test('devrait pouvoir ajouter une nouvelle tâche', async () => {
    console.log('Test: Ajout d\'une nouvelle tâche');

    const testDescription = `Tâche de test ${Date.now()}`;
    console.log(`Ajout de la tâche: ${testDescription}`);

    // Le formulaire vit dans le composant task-editor : il faut ouvrir la
    // modale, il n'y a plus de formulaire posé à plat dans index.html.
    await page.click('#add-task-btn');
    await expect(page.locator('#task-editor-description')).toBeVisible();

    await page.fill('#task-editor-description', testDescription);
    await page.fill('#task-editor-tags', 'test, automatique');
    await page.fill('#task-editor-project', 'TestProject');
    await page.selectOption('#task-editor-priority', 'M');

    // Prendre une capture d'écran avant la soumission
    await page.screenshot({ path: 'before-submit.png' });

    await page.click('#task-editor-save');
    console.log('Formulaire soumis, attente de la mise à jour...');

    // Vérifier que la tâche a été ajoutée
    const carte = page.locator('.task-card', { hasText: testDescription });
    await expect(carte).toBeVisible({ timeout: 10000 });
    console.log('Tâche trouvée dans la liste');

    // Prendre une capture d'écran après l'ajout
    await page.screenshot({ path: 'after-add.png' });
    console.log('Test d\'ajout de tâche réussi');
  });

  test('devrait pouvoir marquer une tâche comme terminée', async () => {
    console.log('Test: Marquage d\'une tâche comme terminée');

    // Ajouter d'abord une tâche
    const taskDescription = `Tâche à compléter ${Date.now()}`;
    console.log(`Ajout de la tâche: ${taskDescription}`);

    await page.click('#add-task-btn');
    await expect(page.locator('#task-editor-description')).toBeVisible();
    await page.fill('#task-editor-description', taskDescription);
    await page.click('#task-editor-save');

    const carte = page.locator('.task-card', { hasText: taskDescription });
    await expect(carte).toBeVisible({ timeout: 10000 });
    console.log('Tâche trouvée, dépliage de la carte');

    // Le pied de carte est masqué par défaut (.task-footer sans .visible) :
    // le bouton Done n'est cliquable qu'une fois la carte dépliée.
    await carte.locator('.dropdown-expand').click();

    const boutonDone = carte.locator('.task-done');
    await expect(boutonDone).toBeVisible();
    console.log('Clic sur le bouton Done');
    await boutonDone.click();

    // Une tâche terminée quitte la liste des tâches pending.
    await expect(carte).toHaveCount(0, { timeout: 10000 });
    console.log('Tâche marquée comme terminée avec succès');
  });
});
