// @ts-check
/**
 * Contrat de test pour S4 (non-regression fonctionnelle du correctif de
 * retrait de tags, cf. test_modify_tags.py) : editer une tache depuis
 * TaskEditor sans changer les tags ne doit jamais faire disparaitre un tag
 * que l'editeur n'affichait pas.
 *
 * ## Ce que montre la lecture de task-editor.js (a la date de ce fichier)
 *
 * `populateForm(task)` (ligne ~344) : si `options.showAllFields` (c'est le
 * cas partout ou TaskEditor est instancie : main.js, calendar-planner.html,
 * graphe.js -- toujours `showAllFields: true`), le champ #task-editor-tags
 * est rempli par `task.tags.join(', ')`, donc TOUS les tags de la tache,
 * sans filtrage.
 *
 * `handleSave()` (ligne ~356) relit ce meme champ et reconstruit
 * `taskData.tags` par `split(',').map(trim).filter(tag => tag)` : a nouveau
 * tous les tags affiches, sans filtrage.
 *
 * Autrement dit, a la date de ce fichier, TaskEditor n'a PAS de notion de
 * "tag cache" : il affiche et renvoie l'integralite de task.tags. Un tag
 * comme +fige, present dans les tags de la tache, apparait dans le champ
 * et repart donc dans le corps du PUT, meme si l'utilisateur n'a touche que
 * la description. CE TEST EST DONC ATTENDU VERT des son ecriture : il
 * documente et verrouille ce comportement, pas un defaut a corriger. Si un
 * jour l'editeur se met a filtrer certains tags a l'affichage (ex: masquer
 * les tags "internes"), ce test rougira et c'est le signal qu'il faut
 * revoir prepareTaskDataForAPI pour ne pas les retirer silencieusement.
 *
 * ## Choix de page pour ce contrat
 *
 * Ecrit contre graphe.html, en copiant les memes helpers que
 * tests/graphe-edition.spec.js (convention de ce depot : un contrat
 * autonome par fichier plutot qu'un import partage -- cf. l'en-tete de ce
 * fichier). Le mecanisme verifie (populateForm / handleSave de
 * task-editor.js) est commun a main.js, calendar-planner.html et graphe.js
 * : le prouver sur l'un des trois suffit, ce n'est pas une specificite du
 * graphe.
 *
 * Mock reseau a la forme reelle des routes (cf. AGENTS.md, PROJECT_MEMORY.md
 * pour la forme de /api/graphe, /api/tasks, PUT /api/task/:uuid/modify) :
 * - GET /api/graphe?projet=... -> { projet, noeuds, aretes }
 * - GET /api/tasks -> { success, tasks: [...] } (export TaskWarrior brut)
 * - PUT /api/task/:uuid/modify -> { success, task }
 */
const { test, expect } = require('@playwright/test');

const DELAI_SAISIE_NAV = 150; // cf. SAISIE_DELAI dans nav.js

const UUID_TACHE = 'aaaa1111-0000-0000-0000-000000000001';

function selecteurNoeud(uuid) {
  return `[data-uuid="${uuid}"]`;
}

/** Bouton stylo a l'interieur d'un noeud donne (role=button, nom accessible "Modifier"). */
function selecteurBoutonEdition(page, uuid) {
  return page.locator(selecteurNoeud(uuid)).getByRole('button', { name: /modifier/i });
}

/** Jeu minimal : un seul noeud dans_projet, pour faire apparaitre le bouton stylo. */
function donneesUnNoeud() {
  return {
    noeuds: [
      {
        uuid: UUID_TACHE,
        description: 'Deplacer le carter avant',
        project: 'NPD.Orion',
        estTime: 'PT1H',
        due: null,
        externe: false,
        fige: false,
        dans_projet: true,
      },
    ],
    aretes: [],
  };
}

/**
 * Tache complete (forme export TaskWarrior), portant +fige et un autre tag
 * -- exactement le cas du defaut mesure : +fige que -TAGS effacerait puis
 * ne recreerait jamais.
 */
function tacheAvecFigeEtAutreTag(uuid) {
  return {
    uuid,
    description: 'Deplacer le carter avant',
    project: 'NPD.Orion',
    priority: 'H',
    tags: ['fige', 'autre'],
    due: null,
    scheduled: '20260901T090000Z',
    estTime: 'PT1H',
    urgency: 5.2,
    status: 'pending',
  };
}

/** Mocke GET /api/graphe?projet=... . */
async function preparerGraphe(page, { noeuds, aretes }) {
  await page.route('**/api/graphe**', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ projet: 'NPD.Orion', noeuds, aretes }),
    });
  });
}

/** Mocke GET /api/tasks (source reelle de showForTask depuis le graphe -- cf. graphe.js). */
async function preparerTaches(page, tasks) {
  await page.route('**/api/tasks*', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, tasks }),
    });
  });
}

/** Mocke PUT /api/task/:uuid/modify et capture chaque requete (corps compris). */
async function preparerEnregistrement(page) {
  const requetes = [];
  await page.route('**/api/task/*/modify', async route => {
    let corps = null;
    try { corps = route.request().postDataJSON(); } catch (e) { corps = null; }
    requetes.push(corps);
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, task: { uuid: UUID_TACHE, ...corps } }),
    });
  });
  return requetes;
}

/** Tape dans le filtre projet de nav.js et attend l'anti-rebond. */
async function choisirProjet(page, nom) {
  const champ = page.locator('#tw-project');
  await champ.fill(nom);
  await page.waitForTimeout(DELAI_SAISIE_NAV + 100);
}

test.describe('TaskEditor -- ne retire pas un tag qu\'il n\'affiche pas (S4)', () => {

  test('editer seulement la description conserve +fige dans le corps du PUT', async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e));

    const { noeuds, aretes } = donneesUnNoeud();
    await preparerGraphe(page, { noeuds, aretes });
    await preparerTaches(page, [tacheAvecFigeEtAutreTag(UUID_TACHE)]);
    const requetes = await preparerEnregistrement(page);

    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    await expect(page.locator(selecteurNoeud(UUID_TACHE))).toBeVisible();

    await selecteurBoutonEdition(page, UUID_TACHE).click();

    const champDescription = page.locator('#task-editor-description');
    await expect(champDescription).toHaveValue('Deplacer le carter avant');

    // Preuve que le formulaire a bien ete pre-rempli avec les DEUX tags,
    // avant de ne toucher que la description : sinon un champ tags vide
    // ferait passer ce test au vert pour la mauvaise raison.
    const champTags = page.locator('#task-editor-tags');
    await expect(champTags).toHaveValue(/fige/);
    await expect(champTags).toHaveValue(/autre/);

    // Seule modification : la description.
    await champDescription.fill('Deplacer le carter avant (revise)');
    await page.locator('#task-editor-save').click();

    await expect.poll(() => requetes.length).toBeGreaterThan(0);
    const corps = requetes[0];

    // Le point du contrat : le corps envoye ne doit jamais faire disparaitre
    // +fige. Soit l'editeur envoie tags et il contient toujours "fige", soit
    // il n'envoie pas du tout tags (les deux sont acceptables ici).
    const neTouchePasFige = !('tags' in corps) || (Array.isArray(corps.tags) && corps.tags.includes('fige'));
    expect(neTouchePasFige, `corps envoye : ${JSON.stringify(corps)}`).toBeTruthy();

    expect(erreurs, `erreurs page : ${erreurs.map(e => e.message).join(', ')}`).toEqual([]);
  });
});
