// @ts-check
/**
 * Fenetre des retards (voir tasks.md / decisions du 26/09).
 *
 * Constat : `plan.json` porte `en_retard` (liste d'uuids, voir
 * `planif/solveur.py::resoudre` et `plan_en_dict` dans
 * `../TaskWarriorPlanner/planif/sortie.py`) et `retard_total`, mais aucune
 * page ne les affiche. L'utilisateur voit "Calcul termine." sans savoir que
 * des echeances ont ete ratees.
 *
 * ATTENTION -- piege trouve en lisant `plan_en_dict` (sortie.py:98-105) et
 * confirme sur un plan reel (`scratchpad/plan.json`, taches
 * 58052fdf.../702aa51c.../85562b7d..., toutes trois dans `en_retard`) :
 * le champ `due` DE CHAQUE TACHE DANS plan.json N'EST PAS l'echeance
 * d'origine. C'est `dues_calculees` -- la valeur qu'`ecrire_due` ecrirait,
 * c'est-a-dire **la fin du dernier bloc planifie lui-meme**. Sur les trois
 * taches en_retard reelles, `entree.due === entree.blocs.at(-1).fin` a
 * l'identique. Calculer un retard comme `fin - entree.due` donnerait donc
 * TOUJOURS ZERO -- exactement le defaut que cette fonctionnalite doit
 * detecter.
 *
 * DECISION D'ARCHITECTE (26/09, remplace une version anterieure de ce
 * fichier qui allait chercher l'echeance dans les taches Taskwarrior
 * connues) : le depot voisin `../TaskWarriorPlanner` porte desormais le
 * calcul cote solveur. Contrat exact : `../TaskWarriorPlanner/tests/
 * test_sortie_retards.py` (lire la docstring de module). Pour chaque uuid de
 * `plan.en_retard`, `plan_en_dict` ajoute dans `taches[uuid]` :
 *   - `limite`            : echeance effective retenue par le solveur pour
 *                           DECIDER du retard (due propre, ou heritee des
 *                           successeurs si la tache n'a pas de due propre),
 *                           meme format ISO local naif que les autres dates ;
 *   - `retard_minutes`    : entier > 0, fin du dernier bloc moins `limite` ;
 *   - `limite_heritee_de` : uuid de la tache DATEE d'ou vient la limite, ou
 *                           `null` si la tache porte sa propre due.
 * Cette page ne doit PLUS lire l'echeance depuis `allTasks` (le champ `due`
 * Taskwarrior d'une tache heritee n'existe d'ailleurs pas forcement) : elle
 * lit `limite`/`retard_minutes`/`limite_heritee_de` directement dans
 * `plan.json`. `TACHES_CONNUES` reste dans ce fichier pour les routes
 * `/api/tasks/planned` qu'il faut bien mocker (l'app les appelle ailleurs),
 * mais son `due` n'est plus la source de l'echeance affichee dans la modale
 * des retards -- ne pas s'y fier pour ecrire les assertions de ce fichier.
 *
 * Description et projet, eux, sont bien lisibles directement dans
 * `plan.json` quand le backend a passe les taches a `serialiser()` (ce que
 * fait le vrai `plan.json` d'exemple) : la mention d'heritage doit d'abord
 * chercher la description du successeur dans `plan.json.taches[...]`, puis
 * dans les taches connues, et sinon afficher l'uuid court (voir le
 * paragraphe "mention d'heritage" plus bas).
 *
 * Mocks de route : meme forme que `tests/plan-statut.spec.js` et
 * `tests/plan-valider.spec.js` (`/api/plan/calculer`, `/api/plan/etat`,
 * `/api/plan/valider`, `/api/tasks`, `/api/tasks/planned`, `/api/projects`,
 * `/api/contexts`, `/plan.json`).
 *
 * Format de l'echeance et du retard dans la modale :
 *   - echeance affichee = `limite` (date locale lisible, meme convention
 *     fr-FR que le reste de l'appli -- voir `calendar-planner.js:1525`) ;
 *   - retard affiche = `retard_minutes` formate "X j Y h" (arrondi a
 *     l'heure) ; en dessous d'un jour, "Y h" seule (pas de "0 j") ;
 *   - si `limite_heritee_de` n'est pas null, une mention supplementaire
 *     "(échéance héritée de « <description> »)" est ajoutee, la description
 *     etant celle de la tache nommee par `limite_heritee_de` ;
 *   - les projets sont tries par plus grand `retard_minutes` d'abord (deja
 *     couvert par le test a, inchange).
 *
 * Selecteurs supposes par ce contrat (aucun n'existe encore cote HTML/CSS/JS
 * -- c'est attendu, voir le rapport) :
 *   #plan-retard-modal        .modal-content / .modal-header / .modal-body
 *                             (suit le patron deja en place pour
 *                             #task-detail-modal dans calendar-planner.html)
 *                             -- TOUJOURS present dans le DOM (cache par CSS
 *                             quand `en_retard` est vide), voir tests c/d.
 *   .retard-projet            un groupe par projet, dans l'ordre d'affichage
 *   .retard-projet-nom        nom du projet affiche ("(sans projet)" sinon)
 *   .retard-tache             une tache en retard, sous son groupe
 *   .retard-tache-description / .retard-tache-echeance / .retard-tache-retard
 *   .retard-tache-heritage    mention d'heritage, absente si
 *                             `limite_heritee_de` est null pour la tache
 *                             (voir test h) -- distincte de
 *                             .retard-tache-description pour ne pas risquer
 *                             de confondre la description propre de la tache
 *                             et celle, citee, du successeur dont vient la
 *                             limite.
 *   bouton texte "Fermer"     ferme la modale
 *   #plan-retard-badge        badge "⚠ N tâche(s) en retard", clic -> rouvre
 *                             -- TOUJOURS present dans le DOM (cache par CSS
 *                             quand `en_retard` est vide), voir test c.
 *   .bloc--retard             sur les blocs (bloc-plan) d'une tache en retard
 */
const { test, expect } = require('@playwright/test');

function fechaLocale(joursDelta, heure) {
  const d = new Date();
  d.setDate(d.getDate() + joursDelta);
  d.setHours(heure, 0, 0, 0);
  return d;
}

/** Chaine ISO locale NAIVE (pas de Z), format attendu des blocs de plan.json. */
function isoLocal(joursDelta, heure) {
  const d = fechaLocale(joursDelta, heure);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00:00`;
}

/** Format export Taskwarrior (AAAAMMJJTHHMMSSZ) pour le `due` des taches
 * connues -- c'est la SEULE source fiable de l'echeance d'origine. */
function isoTW(joursDelta, heure) {
  const d = fechaLocale(joursDelta, heure);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function bloc(indice, joursDelta, h1, h2, extra = {}) {
  return {
    indice, debut: isoLocal(joursDelta, h1), fin: isoLocal(joursDelta, h2),
    externe: false, agrege: false, opportuniste: false, precision: 'heure', ...extra,
  };
}

// Trois taches en_retard dans deux projets, plus une tache a l'heure (temoin
// pour le test g -- ses blocs ne doivent jamais porter .bloc--retard).
const UUID_MONTAGE_1 = 'aaaaaaaa-0000-4000-8000-000000000001'; // retard 4 j 8 h
const UUID_MONTAGE_2 = 'aaaaaaaa-0000-4000-8000-000000000002'; // retard 1 j 0 h
const UUID_PLANS = 'aaaaaaaa-0000-4000-8000-000000000003';     // retard 5 j 5 h (le plus grand)
const UUID_A_LHEURE = 'aaaaaaaa-0000-4000-8000-000000000004';  // pas en retard

function planDeuxProjetsTroisTaches(statut = 'FEASIBLE') {
  return {
    version: 1, statut, retard_total: 999,
    en_retard: [UUID_MONTAGE_1, UUID_MONTAGE_2, UUID_PLANS],
    t0: isoLocal(0, 0), granularite_minutes: 30,
    taches: {
      // `due` ci-dessous reste la due CALCULEE (fin du dernier bloc, voir
      // en-tete) -- l'implementation ne doit jamais s'en servir pour
      // l'echeance ou le retard affiches. `limite`/`retard_minutes` portent
      // la vraie donnee et different volontairement de `due`.
      [UUID_MONTAGE_1]: {
        description: 'Monter assemblage', projet: 'NPD.Orion.montage',
        debut: isoLocal(6, 16), fin: isoLocal(6, 16), due: isoLocal(6, 16),
        limite: isoLocal(2, 8), retard_minutes: 6240, limite_heritee_de: null,
        blocs: [bloc(0, 6, 15, 16)],
      },
      [UUID_MONTAGE_2]: {
        description: 'Assembler prototype', projet: 'NPD.Orion.montage',
        debut: isoLocal(4, 9), fin: isoLocal(4, 9), due: isoLocal(4, 9),
        limite: isoLocal(3, 9), retard_minutes: 1440, limite_heritee_de: null,
        blocs: [bloc(0, 4, 8, 9)],
      },
      [UUID_PLANS]: {
        description: 'Plan de detail bati', projet: 'NPD.Orion.plans',
        debut: isoLocal(6, 15), fin: isoLocal(6, 15), due: isoLocal(6, 15),
        limite: isoLocal(1, 10), retard_minutes: 7500, limite_heritee_de: null,
        blocs: [bloc(0, 6, 14, 15)],
      },
      [UUID_A_LHEURE]: {
        // Pas dans `en_retard` : ne porte aucun des trois champs (voir
        // contrat voisin, test "tache a l'heure n'a pas de champ retard").
        description: 'Tache a l\'heure', projet: 'NPD.Orion.montage',
        debut: isoLocal(1, 9), fin: isoLocal(1, 9), due: isoLocal(1, 9),
        blocs: [bloc(0, 1, 8, 9)],
      },
    },
  };
}

// Taches Taskwarrior connues : necessaires pour mocker /api/tasks/planned
// (l'app les appelle par ailleurs), mais leur `due` n'est PLUS la source de
// l'echeance affichee dans la modale des retards -- voir l'en-tete. On les
// garde volontairement egales aux `limite` ci-dessus pour ne pas induire en
// erreur un lecteur qui comparerait les deux a l'oeil.
const TACHES_CONNUES = [
  { uuid: UUID_MONTAGE_1, description: 'Monter assemblage', project: 'NPD.Orion.montage',
    due: isoTW(2, 8), scheduled: isoTW(6, 15), estTime: 'PT1H' },
  { uuid: UUID_MONTAGE_2, description: 'Assembler prototype', project: 'NPD.Orion.montage',
    due: isoTW(3, 9), scheduled: isoTW(4, 8), estTime: 'PT1H' },
  { uuid: UUID_PLANS, description: 'Plan de detail bati', project: 'NPD.Orion.plans',
    due: isoTW(1, 10), scheduled: isoTW(6, 14), estTime: 'PT1H' },
  { uuid: UUID_A_LHEURE, description: 'Tache a l\'heure', project: 'NPD.Orion.montage',
    due: isoTW(2, 12), scheduled: isoTW(1, 8), estTime: 'PT1H' },
];

async function preparer(page, { plan, tachesConnues = TACHES_CONNUES,
                                 etats = [{ statut: 'en_cours' }, { statut: 'termine' }] } = {}) {
  const vus = { calculer: 0, valider: 0, etat: 0, plan: 0 };
  let rangEtat = 0;

  await page.route('**/plan.json', async route => {
    vus.plan++;
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(plan) });
  });
  await page.route('**/api/plan/calculer', async route => {
    vus.calculer++;
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { statut: 'en_cours' } }) });
  });
  await page.route('**/api/plan/etat', async route => {
    vus.etat++;
    const etat = etats[Math.min(rangEtat, etats.length - 1)];
    rangEtat++;
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: etat }) });
  });
  await page.route('**/api/plan/valider', async route => {
    vus.valider++;
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { scheduled: {}, due: {} } }) });
  });
  // Taches non planifiees : vide, tout est deja `scheduled` dans ce contrat.
  await page.route('**/api/tasks?**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, tasks: [] }) }));
  await page.route('**/api/tasks/planned', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, data: tachesConnues }) }));
  await page.route('**/api/contexts', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) }));
  await page.route('**/api/projects', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) }));
  return vus;
}

async function ouvrirEtCalculer(page, opts) {
  await preparer(page, opts);
  await page.goto('/calendar-planner.html');
  await expect.poll(() => page.locator('.bloc-plan').count(), { timeout: 15000 })
    .toBeGreaterThan(0);
  await page.locator('#calculer-plan-btn').click();
  await expect(page.locator('#plan-etat')).not.toHaveText('Lancement du calcul...',
    { timeout: 15000 });
}

test.describe('a -- calcul termine, en_retard non vide : la modale liste les projets en peril', () => {
  test('titre exact, deux groupes ordonnes par retard, trois taches detaillees', async ({ page }) => {
    await ouvrirEtCalculer(page, { plan: planDeuxProjetsTroisTaches('FEASIBLE') });

    const modale = page.locator('#plan-retard-modal');
    await expect(modale).toBeVisible({ timeout: 15000 });
    await expect(modale).toContainText('Toutes les échéances n\'ont pas pu être respectées');

    const groupes = modale.locator('.retard-projet');
    await expect(groupes).toHaveCount(2);

    // "Plan de detail bati" (retard 5 j 5 h) doit passer devant le groupe
    // montage (retard max 4 j 8 h) : le plus grand retard d'abord.
    await expect(groupes.nth(0).locator('.retard-projet-nom')).toContainText('NPD.Orion.plans');
    await expect(groupes.nth(1).locator('.retard-projet-nom')).toContainText('NPD.Orion.montage');

    const taches = modale.locator('.retard-tache');
    await expect(taches).toHaveCount(3);
    await expect(modale).toContainText('Monter assemblage');
    await expect(modale).toContainText('Assembler prototype');
    await expect(modale).toContainText('Plan de detail bati');

    // Chaque tache montre une echeance ET un retard au format "j / h".
    await expect(modale.locator('.retard-tache-echeance').first()).not.toBeEmpty();
    const retardTexte = await modale.locator('.retard-tache-retard').allTextContents();
    for (const texte of retardTexte) {
      expect(texte).toMatch(/\d+\s*j.*\d+\s*h/i);
    }

    // L'echeance affichee doit venir de `limite` (isoLocal(2, 8) pour
    // "Monter assemblage"), jamais de la due CALCULEE de plan.json
    // (isoLocal(6, 16), voir l'en-tete) : les deux tombent volontairement a
    // des jours differents dans ce mock, donc confondre les deux se voit.
    // fr-FR est la convention deja utilisee ailleurs dans l'appli pour les
    // dates (calendar-planner.js:1525).
    const echeanceMontage1 = modale.locator('.retard-tache', { hasText: 'Monter assemblage' })
      .locator('.retard-tache-echeance');
    await expect(echeanceMontage1).toContainText(fechaLocale(2, 8).toLocaleDateString('fr-FR'));
    await expect(echeanceMontage1).not.toContainText(fechaLocale(6, 16).toLocaleDateString('fr-FR'));
  });
});

test.describe('b -- fermeture', () => {
  test('le bouton Fermer et Echap ferment la modale', async ({ page }) => {
    await ouvrirEtCalculer(page, { plan: planDeuxProjetsTroisTaches('FEASIBLE') });
    const modale = page.locator('#plan-retard-modal');
    await expect(modale).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Fermer' }).click();
    await expect(modale).toBeHidden();

    // Rouvre via le badge pour tester Echap independamment du bouton.
    await page.locator('#plan-retard-badge').click();
    await expect(modale).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(modale).toBeHidden();
  });
});

test.describe('c -- temoin : en_retard vide', () => {
  test('pas de modale, pas de badge', async ({ page }) => {
    const plan = planDeuxProjetsTroisTaches('FEASIBLE');
    plan.en_retard = [];
    await ouvrirEtCalculer(page, { plan });

    await expect(page.locator('#plan-etat')).toHaveText('Calcul termine.', { timeout: 15000 });

    // toBeHidden() seul serait vrai aussi si l'element n'existait pas du
    // tout dans le DOM : toHaveCount(1) force l'implementeur a toujours
    // rendre #plan-retard-modal et #plan-retard-badge (juste caches par
    // CSS quand `en_retard` est vide), pas a les omettre.
    await expect(page.locator('#plan-retard-modal')).toHaveCount(1);
    await expect(page.locator('#plan-retard-modal')).toBeHidden();
    await expect(page.locator('#plan-retard-badge')).toHaveCount(1);
    await expect(page.locator('#plan-retard-badge')).toBeHidden();
  });
});

test.describe('d -- temoin : statut rate', () => {
  test('INFEASIBLE avec en_retard non vide : pas de modale retard', async ({ page }) => {
    await ouvrirEtCalculer(page, { plan: planDeuxProjetsTroisTaches('INFEASIBLE') });

    // Le message de statut existant suffit ; c'est lui qui doit s'afficher.
    await expect(page.locator('#plan-etat')).toContainText(/INFEASIBLE/i, { timeout: 15000 });

    // toHaveCount(1) + toBeHidden() : voir le commentaire du test c, meme
    // piege (toBeHidden seul passerait aussi si l'element n'existait pas).
    await expect(page.locator('#plan-retard-modal')).toHaveCount(1);
    await expect(page.locator('#plan-retard-modal')).toBeHidden();

    // Le badge aussi doit rester cache (clic -> modale sinon) : present dans
    // le DOM, mais invisible.
    await expect(page.locator('#plan-retard-badge')).toHaveCount(1);
    await expect(page.locator('#plan-retard-badge')).toBeHidden();
  });

  test('chargement de page, plan INFEASIBLE avec en_retard : ni badge ni modale', async ({ page }) => {
    await preparer(page, { plan: planDeuxProjetsTroisTaches('INFEASIBLE') });
    await page.goto('/calendar-planner.html');
    await expect.poll(() => page.locator('.bloc-plan').count(), { timeout: 15000 })
      .toBeGreaterThan(0);

    await expect(page.locator('#plan-retard-badge')).toHaveCount(1);
    await expect(page.locator('#plan-retard-badge')).toBeHidden();
    await expect(page.locator('#plan-retard-modal')).toHaveCount(1);
    await expect(page.locator('#plan-retard-modal')).toBeHidden();
  });
});

test.describe('e --chargement de page avec un plan a retards deja present', () => {
  test('pas d\'ouverture automatique ; badge "3 tâche(s) en retard" ; le clic rouvre la modale',
    async ({ page }) => {
      await preparer(page, { plan: planDeuxProjetsTroisTaches('FEASIBLE') });
      await page.goto('/calendar-planner.html');
      await expect.poll(() => page.locator('.bloc-plan').count(), { timeout: 15000 })
        .toBeGreaterThan(0);

      // Pas de calcul declenche ici : la modale ne doit PAS s'ouvrir d'elle-meme.
      await expect(page.locator('#plan-retard-modal')).toBeHidden();

      const badge = page.locator('#plan-retard-badge');
      await expect(badge).toBeVisible();
      await expect(badge).toContainText('3 tâche(s) en retard');

      await badge.click();
      await expect(page.locator('#plan-retard-modal')).toBeVisible();
    });
});

test.describe('f -- injection HTML dans la description', () => {
  test('une description hostile ne s\'execute jamais, mais reste lisible', async ({ page }) => {
    const CHARGE = '<img src=x onerror="window.__xss=1">';
    const plan = planDeuxProjetsTroisTaches('FEASIBLE');
    plan.taches[UUID_PLANS].description = CHARGE;
    const tachesConnues = TACHES_CONNUES.map(t => t.uuid === UUID_PLANS
      ? { ...t, description: CHARGE } : t);

    await preparer(page, { plan, tachesConnues });
    await page.goto('/calendar-planner.html');
    await expect.poll(() => page.locator('.bloc-plan').count(), { timeout: 15000 })
      .toBeGreaterThan(0);

    await page.locator('#plan-retard-badge').click();
    const modale = page.locator('#plan-retard-modal');
    await expect(modale).toBeVisible();

    // Le texte brut de la charge est visible tel quel...
    await expect(modale).toContainText(CHARGE);
    // ...mais jamais interprete comme balise : aucun <img> injecte, et le
    // gestionnaire onerror n'a jamais tourne.
    await expect(modale.locator('img[src="x"]')).toHaveCount(0);
    const xss = await page.evaluate(() => window.__xss);
    expect(xss).toBeUndefined();
  });
});

test.describe('g -- blocs rouges dans le calendrier', () => {
  test('un bloc d\'une tache en retard porte .bloc--retard et une couleur a dominante rouge ; ' +
       'un bloc d\'une tache a l\'heure ne l\'a pas', async ({ page }) => {
    await preparer(page, { plan: planDeuxProjetsTroisTaches('FEASIBLE') });
    await page.goto('/calendar-planner.html');
    await expect.poll(() => page.locator('.bloc-plan').count(), { timeout: 15000 })
      .toBeGreaterThan(0);

    const blocsRetard = page.locator('.bloc-plan.bloc--retard');
    await expect(blocsRetard).not.toHaveCount(0);

    // Le bloc temoin existe et n'est PAS marque en retard.
    await expect(page.locator('.bloc-plan:has-text("Tache a l\'heure")')).not.toHaveCount(0);
    await expect(page.locator('.bloc-plan.bloc--retard:has-text("Tache a l\'heure")')).toHaveCount(0);

    const couleurDominanteRouge = async (locator) => {
      return locator.evaluate(el => {
        const style = getComputedStyle(el);
        const parse = (s) => {
          const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
        };
        const candidats = [style.backgroundColor, style.borderColor, style.borderTopColor]
          .map(parse).filter(Boolean);
        return candidats.some(([r, g, b]) => r > g && r > b);
      });
    };

    expect(await couleurDominanteRouge(blocsRetard.first())).toBe(true);

    const blocNormal = page.locator('.bloc-plan.bloc--contraint:not(.bloc--retard)').first();
    await expect(blocNormal).toHaveCount(1);
    expect(await couleurDominanteRouge(blocNormal)).toBe(false);
  });
});

// Plan dedie a l'heritage de limite : un predecesseur sans due propre (par
// exemple une tache d'attente/livraison) dont la limite vient d'un
// successeur date. Plan separe de planDeuxProjetsTroisTaches pour ne pas
// changer les comptages (3 taches, 2 groupes, badge "3 tache(s)") que les
// tests a/e/g verifient deja.
const UUID_HERITAGE_SUCC = 'aaaaaaaa-0000-4000-8000-000000000006';
const UUID_HERITAGE_PRED = 'aaaaaaaa-0000-4000-8000-000000000007';

function planAvecHeritage() {
  return {
    version: 1, statut: 'FEASIBLE', retard_total: 999,
    en_retard: [UUID_HERITAGE_PRED, UUID_HERITAGE_SUCC],
    t0: isoLocal(0, 0), granularite_minutes: 30,
    taches: {
      // joursDelta(1) comme le temoin UUID_A_LHEURE de l'autre fixture :
      // reste dans la semaine affichee par defaut par le calendrier, sinon
      // .bloc-plan ne rend rien du tout et le poll d'ouvrirEtCalculer expire
      // (piege trouve en executant ce test : voir le rapport).
      [UUID_HERITAGE_SUCC]: {
        description: 'Recevoir piece critique', projet: 'NPD.Orion.reception',
        debut: isoLocal(1, 11), fin: isoLocal(1, 11), due: isoLocal(1, 11),
        limite: isoLocal(1, 9), retard_minutes: 120, limite_heritee_de: null,
        blocs: [bloc(0, 1, 10, 11)],
      },
      // Pred n'a pas de due propre (ex. attente livraison) : sa limite est
      // celle du successeur, et limite_heritee_de le nomme.
      [UUID_HERITAGE_PRED]: {
        description: 'Preparer materiel avant reception', projet: 'NPD.Orion.reception',
        debut: isoLocal(1, 10), fin: isoLocal(1, 10), due: isoLocal(1, 10),
        limite: isoLocal(1, 9), retard_minutes: 60, limite_heritee_de: UUID_HERITAGE_SUCC,
        blocs: [bloc(0, 1, 9, 10)],
      },
    },
  };
}

// Taches connues necessaires au rendu des blocs (meme raison que
// TACHES_CONNUES plus haut -- /api/tasks/planned doit connaitre chaque uuid
// du plan pour que le calendrier affiche ses blocs, independamment de la
// fonctionnalite retard elle-meme).
const TACHES_CONNUES_HERITAGE = [
  { uuid: UUID_HERITAGE_SUCC, description: 'Recevoir piece critique', project: 'NPD.Orion.reception',
    due: isoTW(1, 9), scheduled: isoTW(1, 10), estTime: 'PT1H' },
  { uuid: UUID_HERITAGE_PRED, description: 'Preparer materiel avant reception', project: 'NPD.Orion.reception',
    scheduled: isoTW(1, 9), estTime: 'PT1H' },
];

test.describe('h -- heritage de limite : mention de la tache dont vient l\'echeance', () => {
  test('la tache heritee affiche la description du successeur, la tache datee non', async ({ page }) => {
    await ouvrirEtCalculer(page, { plan: planAvecHeritage(), tachesConnues: TACHES_CONNUES_HERITAGE });
    const modale = page.locator('#plan-retard-modal');
    await expect(modale).toBeVisible({ timeout: 15000 });

    // `.retard-tache-heritage` : selecteur suppose pour la mention
    // d'heritage, absent quand `limite_heritee_de` est null (voir l'en-tete)
    // -- distinct de `.retard-tache-description` pour eviter qu'un texte
    // partage (la description du successeur cite dans la mention) ne fasse
    // matcher les deux taches par erreur.
    const tachePred = modale.locator('.retard-tache')
      .filter({ has: page.locator('.retard-tache-description', { hasText: 'Preparer materiel avant reception' }) });
    await expect(tachePred.locator('.retard-tache-heritage'))
      .toContainText('(échéance héritée de « Recevoir piece critique »)');

    // La tache datee (successeur), elle, ne porte aucune mention d'heritage :
    // limite_heritee_de est null pour elle.
    const tacheSucc = modale.locator('.retard-tache')
      .filter({ has: page.locator('.retard-tache-description', { hasText: 'Recevoir piece critique' }) });
    await expect(tacheSucc.locator('.retard-tache-heritage')).toHaveCount(0);
  });
});
