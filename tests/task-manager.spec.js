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

  // ── Course entre le chargement des templates et le premier rendu ───────────
  //
  // En service normal, le serveur injecte le template directement dans la page
  // et il n'y a plus de course. Mais le chemin de repli existe toujours : une
  // page sans le marqueur d'injection recupere le template par fetch, et un
  // rendu declenche avant son arrivee faisait lever `appendChild(null)`.
  //
  // Ces tests exercent ce chemin de repli, et ne parient pas sur le hasard :
  // ils retirent le template injecte de la reponse HTML, puis retardent son
  // chargement par fetch. La course est alors perdue a coup sur. Sans attente
  // cote code, ils echouent ; avec, ils passent.
  //
  // Ils ouvrent leur propre contexte : cache vide, et aucune interference avec
  // la page partagee par les tests precedents.

  const RETARD_TEMPLATE = 1200; // ms

  async function pageAvecTemplateLent(browser) {
    const context = await browser.newContext();
    const page = await context.newPage();
    // Compteurs : ils rendent le test auto-verifiant. Si la suppression du
    // template injecte cessait de fonctionner, le fetch n'aurait pas lieu et le
    // test passerait sans rien exercer -- exactement le piege qu'on evite ici.
    const compteurs = { templatesRetires: 0, fetchsRetardes: 0 };

    // Retirer le template injecte pour forcer le repli sur le fetch.
    // Filtrer sur le type de ressource et non sur l'extension : la page liste
    // est servie a `/`, que le motif `**/*.html` ne matche pas.
    await page.route('**/*', async route => {
      if (route.request().resourceType() !== 'document') {
        return route.continue();
      }
      const reponse = await route.fetch();
      const original = await reponse.text();
      const html = original
        .replace(/<template\s+id="task-card-full"[\s\S]*?<\/template>/, '');
      if (html !== original) compteurs.templatesRetires++;
      await route.fulfill({ response: reponse, body: html });
    });

    // Puis retarder ce fetch, pour que le premier rendu arrive avant lui.
    await page.route('**/task-card-templates.html', async route => {
      compteurs.fetchsRetardes++;
      await new Promise(r => setTimeout(r, RETARD_TEMPLATE));
      await route.continue();
    });

    return { context, page, compteurs };
  }

  // A appeler en fin de test : sans ca, un test vert ne prouverait rien.
  function verifierQueLeRepliAEteExerce(compteurs) {
    expect(compteurs.templatesRetires,
      'le template injecte aurait du etre retire de la page').toBeGreaterThan(0);
    expect(compteurs.fetchsRetardes,
      'le chargement de repli par fetch aurait du avoir lieu').toBeGreaterThan(0);
  }

  test('la liste supporte un template qui arrive en retard', async ({ browser }) => {
    const { context, page: p, compteurs } = await pageAvecTemplateLent(browser);
    try {
      await p.goto('/');
      // Le bandeau d'erreur de la page liste ne doit jamais apparaitre.
      await expect(p.locator('#error-message')).toBeHidden();
      await expect(p.locator('.task-card').first()).toBeVisible({ timeout: 15000 });
      verifierQueLeRepliAEteExerce(compteurs);
    } finally {
      await context.close();
    }
  });

  test('le calendrier supporte un template qui arrive en retard', async ({ browser }) => {
    const { context, page: p, compteurs } = await pageAvecTemplateLent(browser);
    // calendar-planner.js signale ses erreurs par alert(), pas par un bandeau.
    const alertes = [];
    p.on('dialog', async d => { alertes.push(d.message); await d.dismiss(); });
    try {
      await p.goto('/calendar-planner.html');
      await expect(p.locator('#unplanned-tasks .task-card').first())
        .toBeVisible({ timeout: 15000 });
      expect(alertes).toEqual([]);
      verifierQueLeRepliAEteExerce(compteurs);
    } finally {
      await context.close();
    }
  });

  // ── Planification depuis le calendrier ─────────────────────────────────────
  //
  // Selectionner une carte puis glisser sur la grille horaire doit ouvrir le
  // formulaire avec la description deja remplie.
  //
  // Bug trouve le 2026-09-19 : tout le bloc qui remplit le titre etait enferme
  // dans `if (duration)`, or `parseEstTime` renvoie null sans estTime -- le cas
  // de 13 taches sur 17 en base. Consequence en cascade : `tempEventData` restait
  // null, `handleBeforeCreateEvent` prenait la branche par defaut, et creait une
  // NOUVELLE tache au titre vide au lieu de planifier celle qui etait selectionnee.

  async function glisserSurLaGrille(p) {
    // Viser le panneau horaire, et pas n'importe quelle `.toastui-calendar-column` :
    // le panneau « journee entiere » en contient aussi, et un glisser dedans
    // n'ouvre pas le formulaire de creation.
    const panneau = p.locator('.toastui-calendar-panel.toastui-calendar-time');
    await expect(panneau).toBeVisible({ timeout: 15000 });
    const pb = await panneau.boundingBox();
    const colonne = panneau.locator('.toastui-calendar-column').nth(1);
    const cb = await colonne.boundingBox();
    const fenetre = p.viewportSize();

    // Les colonnes vivent dans une zone qui defile : leur boite deborde le
    // panneau et depasse la fenetre. Se reperer dessus seule fait viser hors
    // ecran -- c'est ce qui rendait ce test faussement rouge.
    const milieu = (Math.max(pb.y, 0) + Math.min(pb.y + pb.height, fenetre.height)) / 2;
    const x = cb.x + cb.width / 2;

    // TOAST UI n'ouvre son formulaire que sur un vrai glisser : il lui faut des
    // mouvements intermediaires, pas un simple aller-retour.
    await p.mouse.move(x, milieu - 25);
    await p.mouse.down();
    await p.mouse.move(x, milieu + 25, { steps: 15 });
    await p.mouse.up();
  }


  test('planifier une tache sans duree estimee renseigne sa description', async ({ browser }) => {
    const context = await browser.newContext();
    const p = await context.newPage();
    const alertes = [];
    p.on('dialog', async d => { alertes.push(d.message); await d.dismiss(); });

    try {
      // Une tache sans estTime : c'est le cas majoritaire dans la base reelle.
      const description = `Sans duree ${Date.now()}`;
      const creation = await p.request.post('/api/task/add', { data: { description } });
      expect((await creation.json()).success).toBe(true);

      await p.goto('/calendar-planner.html');

      // La bascule « Pretes seulement » masque les taches sans duree estimee,
      // et c'est precisement le cas teste ici : il faut la decocher, comme le
      // ferait l'utilisateur voulant planifier une tache non estimee.
      await p.locator('#filter-ready-only').uncheck();

      const carte = p.locator('#unplanned-tasks .task-card', { hasText: description });
      await expect(carte).toBeVisible({ timeout: 15000 });
      await carte.click();

      await glisserSurLaGrille(p);

      const titre = p.locator('input.toastui-calendar-content[name="title"]');
      await expect(titre).toBeVisible({ timeout: 5000 });
      await expect(titre).toHaveValue(description);

      expect(alertes).toEqual([]);
    } finally {
      await context.close();
    }
  });

  // ── Bascule « pretes a planifier seulement » ───────────────────────────────
  //
  // Une tache n'est planifiable confortablement que si sa duree est connue.
  // La bascule, active par defaut, masque celles qui n'ont pas d'estTime --
  // sans les rendre inaccessibles : la decocher les fait revenir.

  test('la bascule masque les taches sans duree estimee', async ({ browser }) => {
    const context = await browser.newContext();
    const p = await context.newPage();

    try {
      const marqueur = Date.now();
      const avecDuree = `Avec duree ${marqueur}`;
      const sansDuree = `Sans duree ${marqueur}`;

      for (const [description, estTime] of [[avecDuree, '1h'], [sansDuree, null]]) {
        const data = estTime ? { description, estTime } : { description };
        const r = await p.request.post('/api/task/add', { data });
        expect((await r.json()).success).toBe(true);
      }

      await p.goto('/calendar-planner.html');

      const bascule = p.locator('#filter-ready-only');
      await expect(bascule).toBeVisible({ timeout: 15000 });
      await expect(bascule).toBeChecked();

      const carteAvec = p.locator('#unplanned-tasks .task-card', { hasText: avecDuree });
      const carteSans = p.locator('#unplanned-tasks .task-card', { hasText: sansDuree });

      // Bascule active : seule la tache estimee est proposee.
      await expect(carteAvec).toBeVisible({ timeout: 15000 });
      await expect(carteSans).toHaveCount(0);

      // Decochee : les deux reviennent. Cette seconde moitie rend le test
      // auto-verifiant -- sans elle, un test ou AUCUNE carte ne s'affiche
      // passerait au vert.
      await bascule.uncheck();
      await expect(carteSans).toBeVisible({ timeout: 10000 });
      await expect(carteAvec).toBeVisible();

      // Le choix survit a un rechargement.
      await p.reload();
      await expect(p.locator('#filter-ready-only')).not.toBeChecked();
      await expect(p.locator('#unplanned-tasks .task-card', { hasText: sansDuree }))
        .toBeVisible({ timeout: 15000 });
    } finally {
      await context.close();
    }
  });
});
