const { test, expect } = require('@playwright/test');

// Le mode serial est declare dans le describe qui en a besoin, et non au
// niveau du fichier : sinon il s'applique aussi aux blocs suivants, et
// Playwright refuse alors tout describe parallele.
test.describe('Task Manager', () => {
  // Ces tests partagent une meme page, dans cet ordre.
  test.describe.configure({ mode: 'serial' });

  let page;

  test.beforeAll(async ({ browser: testBrowser }) => {
    // Le backend est demarre par playwright.config.js (webServer), pas ici.
    const context = await testBrowser.newContext();
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
    // Fermer le **contexte**, pas le navigateur. Le navigateur est une fixture
    // de worker, partagee avec les tests paralleles du meme worker : le fermer
    // ici les faisait echouer par intermittence sur « Target page, context or
    // browser has been closed ». Playwright gere lui-meme sa duree de vie.
    if (page) {
      await page.context().close();
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

// ---------------------------------------------------------------------------
// Parcours qui touchent la vraie base de dev.
//
// Serial, et ce n'est pas un detail : ces tests creent de vraies taches via
// l'API, et le backend serialise ses sous-processus TaskWarrior. Les faire
// tourner en parallele les met en concurrence sur une seule base, et le plus
// lourd d'entre eux depassait alors son delai une fois sur trois.
//
// `fullyParallel` est desactive dans playwright.config.js pour que ce bloc et
// « Task Manager » -- l'autre ecrivain -- ne tombent pas non plus en meme
// temps dans deux workers differents.
test.describe('Parcours sur la base de dev', () => {
  test.describe.configure({ mode: 'serial' });

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

  // ── Integrite de la feuille de style du calendrier ─────────────────────────
  //
  // Bug du 2026-09-20 : un marqueur de conflit Git (`=======`) et un commentaire
  // casse avaient avale le bloc `:root` de calendar-planner.css. Les 67 `var(--…)`
  // du fichier ne resolvaient plus rien -- le compteur s'affichait en blanc sur
  // fond transparent, donc invisible.
  //
  // Une erreur de syntaxe CSS ne leve pas : elle se rattrape en silence, en
  // avalant ce qui suit. Rien dans la console, rien dans les autres tests. D'ou
  // ce controle, qui verifie le resultat calcule plutot que le fichier source.

  test('les variables CSS du calendrier sont definies', async ({ browser }) => {
    const context = await browser.newContext();
    const p = await context.newPage();

    try {
      await p.goto('/calendar-planner.html');
      await expect(p.locator('#task-count')).toBeVisible({ timeout: 15000 });

      const variables = await p.evaluate(() => {
        const racine = getComputedStyle(document.documentElement);
        const noms = ['--primary-color', '--secondary-color', '--border-color',
                      '--light-bg', '--danger-color'];
        return Object.fromEntries(
          noms.map(n => [n, racine.getPropertyValue(n).trim()]));
      });

      for (const [nom, valeur] of Object.entries(variables)) {
        expect(valeur, `${nom} doit etre definie dans :root`).not.toBe('');
      }

      // Et le symptome visible : le compteur doit se detacher de son fond.
      const rendu = await p.locator('#task-count').evaluate(el => {
        const st = getComputedStyle(el);
        return { couleur: st.color, fond: st.backgroundColor };
      });
      expect(rendu.fond, 'le badge du compteur ne doit pas etre transparent')
        .not.toBe('rgba(0, 0, 0, 0)');
      expect(rendu.couleur, 'texte et fond ne doivent pas etre identiques')
        .not.toBe(rendu.fond);
    } finally {
      await context.close();
    }
  });

  // ---------------------------------------------------------------------------
  // Autocompletion des projets (lot 0)
  //
  // Deux mecanismes concurrents alimentaient la meme fonctionnalite :
  //
  //   - `updateProjectDatalist()` (main.js), nourri par `/api/projects` -- la
  //     liste faisant autorite, projets des taches terminees compris -- mais qui
  //     ecrit dans `project-options`, un identifiant qui n'existe nulle part.
  //     `if (!datalist) return;` avalait l'echec en silence. Code mort.
  //   - `updateProjectSuggestions()`, nourri par `this.projects`, un Set
  //     reconstruit a partir des seules taches **actuellement affichees**.
  //
  // C'est le second qui gagne, donc la reponse de `/api/projects` est recuperee
  // a chaque chargement puis jetee. Consequence : un projet dont toutes les
  // taches sont terminees -- ou simplement exclues par le filtre en cours -- est
  // introuvable dans la saisie semi-automatique. On ne peut pas filtrer vers ce
  // qu'on ne voit pas deja.
  //
  // Le defaut devient bloquant au lot 1 : des que le contexte filtrera cote
  // serveur, `this.projects` se reduira au contexte courant.
  //
  // Le test stubbe donc `/api/projects` avec un projet volontairement absent des
  // taches chargees. Dependre du contenu de la base de dev ne prouverait rien.

  test('la liste de projets alimente la saisie semi-automatique', async ({ browser }) => {
    const context = await browser.newContext();
    const p = await context.newPage();
    // Un nom qu'aucune tache ne porte : il ne peut venir que de /api/projects.
    const FANTOME = 'ProjetSansTacheVisible';
    let stubs = 0;

    await p.route('**/api/projects', async route => {
      stubs++;
      const reponse = await route.fetch();
      const donnees = await reponse.json();
      const projets = (donnees.projects || []).concat([FANTOME]);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, projects: projets }),
      });
    });

    try {
      await p.goto('/');
      await expect(p.locator('#error-message')).toBeHidden();

      // Le champ doit pointer vers une datalist qui existe reellement.
      // Depuis le lot 1 il vit dans la barre nav, partagee par les trois pages.
      const champ = p.locator('#tw-project');
      const idListe = await champ.getAttribute('list');
      expect(idListe, 'le champ projet doit referencer une datalist').toBeTruthy();
      await expect(p.locator(`datalist#${idListe}`)).toHaveCount(1);

      // Et un projet connu du seul backend doit y figurer.
      const options = p.locator(`datalist#${idListe} option`);
      await expect(options.first()).toBeAttached({ timeout: 10000 });
      const valeurs = await options.evaluateAll(els => els.map(e => e.value));
      expect(valeurs,
        'la datalist doit refleter /api/projects, pas les seules taches affichees')
        .toContain(FANTOME);

      // Auto-verification : sans interception, le test ne prouverait rien.
      expect(stubs, '/api/projects aurait du etre intercepte').toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });

});


// ---------------------------------------------------------------------------
// Tests entierement stubbes : aucun appel ne sort vers TaskWarrior, donc
// aucune contention. Ils peuvent tourner en parallele sans rien se disputer.
test.describe('Filtres partages', () => {
  test.describe.configure({ mode: 'parallel' });


  // ---------------------------------------------------------------------------
  // La barre nav comme source unique des filtres (lot 1)
  //
  // Le contexte et le statut filtrent cote serveur ; le projet et les tags
  // filtrent cote client, a la frappe. Ces tests stubbent les trois endpoints :
  // dependre du contenu de la base de dev rendrait les assertions fragiles et,
  // pire, ferait passer un test au vert sur une base vide.

  const TACHES_STUB = [
    { id: 1, uuid: 'aaaaaaaa-0000-0000-0000-000000000001', description: 'Poser le carrelage',
      status: 'pending', project: 'Maison.Cuisine', tags: ['perso', 'bricolage'],
      estTime: 'PT2H', urgency: 9, entry: '20260101T080000Z' },
    { id: 2, uuid: 'aaaaaaaa-0000-0000-0000-000000000002', description: 'Relire la spec',
      status: 'pending', project: 'WebTaskManager', tags: ['pro'],
      estTime: 'PT1H', urgency: 7, entry: '20260101T080000Z' },
    { id: 3, uuid: 'aaaaaaaa-0000-0000-0000-000000000003', description: 'Courir 10 km',
      status: 'pending', tags: ['perso', 'sport'],
      estTime: 'PT45M', urgency: 5, entry: '20260101T080000Z' },
  ];

  const PROJETS_STUB = ['Maison.Cuisine', 'WebTaskManager', 'ProjetTermine'];

  // Date de planification du jour, a une heure locale donnee, au format
  // TaskWarrior. Construite relativement a maintenant : une date en dur
  // sortirait de la semaine affichee des le lendemain.
  function planifieAujourdHui(heureLocale) {
    const d = new Date();
    d.setHours(heureLocale, 0, 0, 0);
    const n = v => String(v).padStart(2, '0');
    return `${d.getUTCFullYear()}${n(d.getUTCMonth() + 1)}${n(d.getUTCDate())}`
         + `T${n(d.getUTCHours())}${n(d.getUTCMinutes())}00Z`;
  }

  async function pageAvecDonnees(browser, options = {}) {
    const contextes = options.contextes || ['pro', 'perso'];
    const taches = options.taches || TACHES_STUB;
    const etatInitial = options.etatInitial || null;
    const context = await browser.newContext();

    if (etatInitial) {
      await context.addInitScript(etat => {
        try { localStorage.setItem('tw-nav-state', JSON.stringify(etat)); } catch (e) {}
      }, etatInitial);
    }

    const p = await context.newPage();
    const vus = { taches: 0, planifiees: 0, contextes: 0, projets: 0 };

    await p.route('**/api/tasks**', async route => {
      vus.taches++;
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, tasks: taches }),
      });
    });
    await p.route('**/api/contexts', async route => {
      vus.contextes++;
      const filtres = {};
      contextes.forEach(c => { filtres[c] = '+' + c; });
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, contexts: contextes, filters: filtres, active: '' }),
      });
    });
    // Enregistree apres la route des taches : Playwright donne la priorite a
    // la derniere posee, et le motif ci-dessus matcherait aussi cette URL.
    await p.route('**/api/tasks/planned', async route => {
      vus.planifiees++;
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, data: options.planifiees || [] }),
      });
    });
    await p.route('**/api/projects', async route => {
      vus.projets++;
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, projects: PROJETS_STUB }),
      });
    });

    return { context, page: p, vus };
  }

  test('le champ projet de la barre nav filtre la liste et met le compteur a jour', async ({ browser }) => {
    const { context, page: p, vus } = await pageAvecDonnees(browser);
    try {
      await p.goto('/');
      await expect(p.locator('#error-message')).toBeHidden();
      await expect(p.locator('.task-card')).toHaveCount(3, { timeout: 10000 });

      const champ = p.locator('#tw-project');
      await expect(champ).toBeVisible();
      await champ.fill('Maison.Cuisine');

      // Filtrage cote client : une seule carte, et le compteur le dit.
      await expect(p.locator('.task-card')).toHaveCount(1, { timeout: 5000 });
      await expect(p.locator('#tw-count')).toHaveText('1/3');

      // Et aucun aller-retour supplementaire : le filtre projet est client.
      const requetesApresFiltre = vus.taches;
      await p.waitForTimeout(500);
      expect(vus.taches,
        'filtrer par projet ne doit pas relancer /api/tasks').toBe(requetesApresFiltre);

      // Vider le champ restaure tout.
      await champ.fill('');
      await expect(p.locator('.task-card')).toHaveCount(3, { timeout: 5000 });
      await expect(p.locator('#tw-count')).toHaveText('3');

      expect(vus.contextes, '/api/contexts aurait du etre appele').toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });

  test('le champ tags de la barre nav filtre la liste', async ({ browser }) => {
    const { context, page: p } = await pageAvecDonnees(browser);
    try {
      await p.goto('/');
      await expect(p.locator('.task-card')).toHaveCount(3, { timeout: 10000 });

      await p.locator('#tw-tags').fill('perso');
      await expect(p.locator('.task-card')).toHaveCount(2, { timeout: 5000 });

      // Plusieurs tags : conjonction, pas disjonction.
      await p.locator('#tw-tags').fill('perso, sport');
      await expect(p.locator('.task-card')).toHaveCount(1, { timeout: 5000 });
      await expect(p.locator('#tw-count')).toHaveText('1/3');
    } finally {
      await context.close();
    }
  });

  test('les contextes passent en liste deroulante au-dela de cinq', async ({ browser }) => {
    // Trois contextes : des boutons.
    const peu = await pageAvecDonnees(browser, { contextes: ['pro', 'perso', 'asso'] });
    try {
      await peu.page.goto('/');
      await expect(peu.page.locator('#tw-ctx-btns .tw-ctx-btn')).toHaveCount(4, { timeout: 10000 });
      await expect(peu.page.locator('#tw-ctx-select')).toHaveCount(0);
    } finally {
      await peu.context.close();
    }

    // Six : une liste deroulante, et plus aucun bouton de contexte.
    const beaucoup = await pageAvecDonnees(browser, {
      contextes: ['pro', 'perso', 'asso', 'sport', 'maison', 'lecture'],
    });
    try {
      await beaucoup.page.goto('/');
      const liste = beaucoup.page.locator('#tw-ctx-select');
      await expect(liste).toBeVisible({ timeout: 10000 });
      await expect(beaucoup.page.locator('#tw-ctx-btns .tw-ctx-btn')).toHaveCount(0);
      // « All » plus les six contextes.
      await expect(liste.locator('option')).toHaveCount(7);
    } finally {
      await beaucoup.context.close();
    }
  });

  test('un filtre restaure du localStorage est annonce, et effacable', async ({ browser }) => {
    // Le piege que ce test couvre : l'etat de nav survit a la fermeture de
    // l'onglet. Un filtre pose la veille tronquerait la liste le lendemain sans
    // la moindre trace visible.
    const { context, page: p } = await pageAvecDonnees(browser, {
      etatInitial: { statuses: ['pending'], context: '', filter: '',
                     priority: '', project: 'WebTaskManager', tags: '' },
    });
    try {
      await p.goto('/');
      await expect(p.locator('.task-card')).toHaveCount(1, { timeout: 10000 });

      // Le champ est repeuple, et le resume dit pourquoi la liste est courte.
      await expect(p.locator('#tw-project')).toHaveValue('WebTaskManager');
      const resume = p.locator('#tw-filter-summary');
      await expect(resume).toBeVisible();
      await expect(resume).toContainText('WebTaskManager');

      // « Tout effacer » remet tout a zero.
      await p.locator('#tw-clear-filters').click();
      await expect(p.locator('#tw-project')).toHaveValue('');
      await expect(p.locator('.task-card')).toHaveCount(3, { timeout: 5000 });
      await expect(resume).toBeHidden();
    } finally {
      await context.close();
    }
  });

  test('la section « Advanced Filters » a laisse place aux deux vues', async ({ browser }) => {
    const { context, page: p } = await pageAvecDonnees(browser);
    try {
      await p.goto('/');
      await expect(p.locator('.task-card').first()).toBeVisible({ timeout: 10000 });

      // Les champs dupliques ont disparu...
      await expect(p.locator('#filter-project')).toHaveCount(0);
      await expect(p.locator('#filter-tags')).toHaveCount(0);
      await expect(p.locator('#apply-filters')).toHaveCount(0);

      // ...mais les deux vues sur `scheduled` sont restees.
      await expect(p.locator('#filter-planned-incomplete-btn')).toBeVisible();
      await expect(p.locator('#filter-today-btn')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('le kanban applique lui aussi le filtre projet de la barre nav', async ({ browser }) => {
    // Le kanban rechargeait sur chaque `tw-filter-change`. Sans ce test, poser
    // le drapeau `clientOnly` sur la saisie l'aurait fait relancer une commande
    // TaskWarrior a chaque touche, tout en ignorant le filtre.
    const { context, page: p, vus } = await pageAvecDonnees(browser);
    try {
      await p.goto('/kanban.html');
      await expect(p.locator('.kanban-card')).toHaveCount(3, { timeout: 10000 });

      const avant = vus.taches;
      await p.locator('#tw-project').fill('WebTaskManager');
      await expect(p.locator('.kanban-card')).toHaveCount(1, { timeout: 5000 });
      await expect(p.locator('#tw-count')).toHaveText('1/3');

      await p.waitForTimeout(500);
      expect(vus.taches,
        'filtrer par projet ne doit pas relancer /api/tasks').toBe(avant);
    } finally {
      await context.close();
    }
  });

  test('le calendrier suit les filtres de la barre nav', async ({ browser }) => {
    // La page calendrier appelait `/api/tasks` sans le moindre parametre :
    // ni contexte, ni statut, ni projet, ni tags. Elle ignorait donc
    // entierement l'etat partage par les deux autres pages.
    const { context, page: p, vus } = await pageAvecDonnees(browser);
    try {
      await p.goto('/calendar-planner.html');
      await expect(p.locator('#unplanned-tasks .task-card')).toHaveCount(3, { timeout: 15000 });

      // Tags : filtrage client, sans nouvel appel au backend.
      const avant = vus.taches;
      await p.locator('#tw-tags').fill('sport');
      await expect(p.locator('#unplanned-tasks .task-card')).toHaveCount(1, { timeout: 5000 });
      await p.waitForTimeout(500);
      expect(vus.taches,
        'filtrer par tag ne doit pas relancer /api/tasks').toBe(avant);

      // Projet : prefixe sur la hierarchie pointee.
      await p.locator('#tw-tags').fill('');
      await p.locator('#tw-project').fill('Maison');
      await expect(p.locator('#unplanned-tasks .task-card')).toHaveCount(1, { timeout: 5000 });

      // Le contexte, lui, filtre cote serveur : la page doit recharger.
      await p.locator('#tw-project').fill('');
      await expect(p.locator('#unplanned-tasks .task-card')).toHaveCount(3, { timeout: 5000 });
      const avantContexte = vus.taches;
      await p.locator('.tw-ctx-btn[data-ctx="pro"]').click();
      await expect.poll(() => vus.taches, { timeout: 5000 }).toBeGreaterThan(avantContexte);
    } finally {
      await context.close();
    }
  });

  test('le menu des pools a disparu du calendrier', async ({ browser }) => {
    // Le pool etait une recopie manuelle, sur chaque tache, d'une information
    // deja portee par ses tags -- et le menu mentait : `task.pool || 'pro'`
    // declarait « pro » toute tache sans pool.
    const { context, page: p } = await pageAvecDonnees(browser);
    try {
      await p.goto('/calendar-planner.html');
      await expect(p.locator('#task-count')).toBeVisible({ timeout: 15000 });
      await expect(p.locator('#filter-pool')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  // ---------------------------------------------------------------------------
  // Blocs hors filtre (lot 3)
  //
  // Filtrer le calendrier par contexte ne doit pas faire disparaitre les
  // creneaux deja occupes : on planifierait deux choses en meme temps. Les
  // blocs hors filtre restent donc visibles, hachures et sans titre -- assez
  // pour savoir que le creneau est pris, pas assez pour lire ce qu'il contient.

  const PLANIFIEE_HORS = {
    id: 9, uuid: 'bbbbbbbb-0000-0000-0000-000000000009',
    description: 'Reunion perso confidentielle', status: 'pending',
    tags: ['perso'], estTime: 'PT1H', urgency: 4, entry: '20260101T080000Z',
  };

  test('un bloc hors filtre reste visible, hachure et sans titre', async ({ browser }) => {
    const planifiee = { ...PLANIFIEE_HORS, scheduled: planifieAujourdHui(10) };
    // La tache planifiee est **absente** de la reponse de /api/tasks : c'est
    // exactement ce que produit un filtre de contexte applique cote serveur.
    const { context, page: p } = await pageAvecDonnees(browser, {
      planifiees: [planifiee],
      etatInitial: { statuses: ['pending'], context: 'pro', filter: '',
                     priority: '', project: '', tags: '' },
    });
    try {
      await p.goto('/calendar-planner.html');
      await expect(p.locator('#task-count')).toBeVisible({ timeout: 15000 });

      // Le creneau est occupe, et ca se voit.
      const hachure = p.locator('.calendar-event-hors-filtre');
      await expect(hachure.first()).toBeVisible({ timeout: 10000 });

      // Mais son contenu ne fuite pas.
      await expect(p.locator('#calendar'))
        .not.toContainText('Reunion perso confidentielle');
    } finally {
      await context.close();
    }
  });

  test('la bascule cache les blocs hors filtre, et est cochee par defaut', async ({ browser }) => {
    const planifiee = { ...PLANIFIEE_HORS, scheduled: planifieAujourdHui(10) };
    const { context, page: p } = await pageAvecDonnees(browser, {
      planifiees: [planifiee],
      etatInitial: { statuses: ['pending'], context: 'pro', filter: '',
                     priority: '', project: '', tags: '' },
    });
    try {
      await p.goto('/calendar-planner.html');
      await expect(p.locator('#task-count')).toBeVisible({ timeout: 15000 });

      // Le defaut sur : on voit ce qui est deja pris.
      const bascule = p.locator('#filter-hors-filtre');
      await expect(bascule).toBeChecked();
      await expect(p.locator('.calendar-event-hors-filtre').first())
        .toBeVisible({ timeout: 10000 });

      await bascule.uncheck();
      await expect(p.locator('.calendar-event-hors-filtre')).toHaveCount(0, { timeout: 5000 });
    } finally {
      await context.close();
    }
  });

  test('un bloc dans le filtre garde son titre', async ({ browser }) => {
    // Le pendant du test precedent : sans lui, masquer *tous* les titres
    // passerait pour un succes.
    const dansLeFiltre = { ...TACHES_STUB[1], scheduled: planifieAujourdHui(14) };
    const { context, page: p } = await pageAvecDonnees(browser, {
      taches: [TACHES_STUB[0], dansLeFiltre, TACHES_STUB[2]],
      planifiees: [dansLeFiltre],
    });
    try {
      await p.goto('/calendar-planner.html');
      await expect(p.locator('#task-count')).toBeVisible({ timeout: 15000 });

      await expect(p.locator('#calendar')).toContainText('Relire la spec', { timeout: 10000 });
      await expect(p.locator('.calendar-event-hors-filtre')).toHaveCount(0);

      // Et il a quitte la colonne de gauche, puisqu'il est planifie.
      await expect(p.locator('#unplanned-tasks .task-card')).toHaveCount(2);
    } finally {
      await context.close();
    }
  });

  test('une tache sans pool n\'affiche pas de pool invente', async ({ browser }) => {
    // `task.pool || 'pro'` affichait « pro » sur la totalite des taches : en
    // production, 277 taches en attente, dont **zero** ne portait l'attribut.
    // L'UDA a ete supprimee, le badge avec.
    const { context, page: p } = await pageAvecDonnees(browser);
    try {
      await p.goto('/');
      await expect(p.locator('#error-message')).toBeHidden();
      await expect(p.locator('.task-card').first()).toBeVisible({ timeout: 15000 });
      await expect(p.locator('[name="pool"]')).toHaveCount(0);
      await expect(p.getByText('pro', { exact: true })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
