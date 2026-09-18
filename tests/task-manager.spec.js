const { test, expect } = require('@playwright/test');

// Désactiver le parallélisme pour éviter les interférences entre les tests
test.describe.configure({ mode: 'serial' });

test.describe('Task Manager', () => {
  let page;
  let browser;
  let serverProcess;

  test.beforeAll(async ({ browser: testBrowser }) => {
    // Démarrer le serveur local
    const { spawn } = require('child_process');
    serverProcess = spawn('python3', ['app.py'], {
      cwd: process.cwd(),
      stdio: 'pipe'
    });

    // Attendre que le serveur démarre
    await new Promise(resolve => setTimeout(resolve, 3000));
    
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
    
    // Arrêter le serveur après les tests
    if (serverProcess) {
      serverProcess.kill();
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

  test('devrait pouvoir ajouter une nouvelle tâche', async () => {
    console.log('Test: Ajout d\'une nouvelle tâche');
    
    // Remplir le formulaire d'ajout de tâche
    const testDescription = `Tâche de test ${Date.now()}`;
    console.log(`Ajout de la tâche: ${testDescription}`);
    
    await page.fill('#task-description', testDescription);
    await page.fill('#task-tags', 'test, automatique');
    await page.fill('#task-project', 'TestProject');
    await page.selectOption('#task-priority', 'M');
    
    // Prendre une capture d'écran avant la soumission
    await page.screenshot({ path: 'before-submit.png' });
    
    // Soumettre le formulaire
    await page.click('button[type="submit"]');
    
    console.log('Formulaire soumis, attente de la mise à jour...');
    
    // Attendre que la page se mette à jour
    await page.waitForTimeout(2000);
    
    // Vérifier que la tâche a été ajoutée
    const taskCards = await page.$$('.task-card');
    let taskFound = false;
    
    for (const card of taskCards) {
      const text = await card.textContent();
      if (text.includes(testDescription)) {
        taskFound = true;
        console.log('Tâche trouvée dans la liste');
        break;
      }
    }
    
    expect(taskFound).toBe(true);
    
    // Prendre une capture d'écran après l'ajout
    await page.screenshot({ path: 'after-add.png' });
    console.log('Test d\'ajout de tâche réussi');
  });

  test('devrait pouvoir marquer une tâche comme terminée', async () => {
    console.log('Test: Marquage d\'une tâche comme terminée');
    
    // Ajouter d'abord une tâche
    const taskDescription = `Tâche à compléter ${Date.now()}`;
    console.log(`Ajout de la tâche: ${taskDescription}`);
    
    await page.fill('#task-description', taskDescription);
    await page.click('button[type="submit"]');
    
    // Attendre que la tâche soit ajoutée
    await page.waitForTimeout(2000);
    
    // Trouver la tâche et la marquer comme terminée
    const taskCards = await page.$$('.task-card');
    let taskFound = false;
    
    for (const card of taskCards) {
      const text = await card.textContent();
      if (text.includes(taskDescription)) {
        taskFound = true;
        console.log('Tâche trouvée, clic sur le bouton Done');
        
        // Compter les tâches avant suppression
        const beforeDeleteCount = taskCards.length;
        
        // Cliquer sur le bouton Done
        const doneButton = await card.$('button:has-text("Done")');
        if (doneButton) {
          await doneButton.click();
          
          // Attendre que la tâche soit supprimée
          await page.waitForTimeout(2000);
          
          // Vérifier que le nombre de tâches a diminué
          const afterDeleteCount = (await page.$$('.task-card')).length;
          expect(afterDeleteCount).toBe(beforeDeleteCount - 1);
          console.log('Tâche marquée comme terminée avec succès');
        }
        break;
      }
    }
    
    expect(taskFound).toBe(true);
  });
});
