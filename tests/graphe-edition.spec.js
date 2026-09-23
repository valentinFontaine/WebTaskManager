// @ts-check
/**
 * Contrat de test pour H3 : editer une tache depuis le graphe de dependances.
 *
 * Fonctionnalite pas encore implementee au moment ou ce fichier est ecrit :
 * ces tests doivent echouer (selecteurs absents), pas passer par accident.
 *
 * Nouveau fichier separe de tests/graphe.spec.js (un autre agent y travaille
 * en parallele) : les helpers utiles (preparer, choisirProjet, donnees de
 * test, selecteurNoeud) sont copies ici plutot que partages par import, pour
 * ne pas toucher a ce fichier.
 *
 * ## Decision de l'architecte (source de la tache editee)
 *
 * Au clic sur le stylo, graphe.js NE PASSE PAS le noeud de /api/graphe a
 * l'editeur (ce noeud n'expose ni tags, ni priority, ni scheduled -- voir
 * construire_graphe dans main_fastapi.py). Il recupere la liste complete via
 * `GET /api/tasks` (meme source que les taskcards, forme
 * `{ success, tasks: [...] }`, chaque element etant l'export TaskWarrior brut
 * : uuid, description, project, priority, tags, due, scheduled, estTime...),
 * la retrouve par uuid, et appelle `taskEditor.showForTask(tache)` avec CET
 * objet complet. Si la tache est introuvable dans /api/tasks : message
 * d'erreur visible, la modale ne s'ouvre pas.
 *
 * Consequence pour ce contrat : chaque test qui ouvre la modale doit
 * desormais mocker /api/tasks (voir `preparerTaches` ci-dessous), avec un
 * objet tache distinct du libelle du noeud graphe quand on veut prouver que
 * la source est bien /api/tasks et non le noeud Mermaid. Le contrat verifie
 * aussi que les champs non touches par l'edition (tags, priority, scheduled,
 * due, estTime, project) repartent inchanges dans le PUT -- c'est le point
 * que cette decision corrige par rapport a la version precedente du fichier.
 *
 * ## API de l'editeur (lue dans task-editor.js)
 *
 * `taskEditor.showForTask(task)` ouvre la modale et la pre-remplit via
 * `populateForm(task)` : description (#task-editor-description), priority,
 * duration (estTime), et si showAllFields : tags, project, due, scheduled.
 * `handleSave()` lit `this.currentTask.uuid` ; `saveTask()` appelle
 * `PUT /api/task/${taskData.uuid}/modify` -- l'UUID, dans l'URL, est le seul
 * identifiant transmis au serveur (task_id du endpoint FastAPI). Le champ
 * `id` est copie dans taskData.id par handleSave mais jamais mis dans le
 * corps envoye par prepareTaskDataForAPI : mort cote reseau, sans
 * consequence ici.
 *
 * `prepareTaskDataForAPI` encode certains champs differemment de leur forme
 * brute TaskWarrior, parce qu'ils transitent par des champs de formulaire
 * qui les reformatent :
 * - tags : array -> `join(', ')` a l'affichage -> `split(',').map(trim)` a
 *   la sauvegarde. Round-trip stable pour des tags sans espace interne.
 * - due / scheduled : `formatDateForInput` convertit le format TaskWarrior
 *   (`AAAAMMJJTHHMMSSZ`) en `datetime-local` (`AAAA-MM-JJTHH:MM`, UTC, sans
 *   secondes) pour l'affichage, puis `formatDateForTask` rajoute ":00" a la
 *   sauvegarde si la valeur fait 16 caracteres. Le corps envoye n'est donc
 *   PAS egal a la valeur brute d'origine mais a
 *   `formatDateForTask(formatDateForInput(brut))` -- ce contrat calcule
 *   cette valeur attendue avec les memes regles (voir `versDateFormulaire`)
 *   plutot que de comparer a la chaine brute.
 * - estTime : recopie telle quelle du champ duree vers `estTime` (pas de
 *   reformatage dans populateForm), donc round-trip a l'identique.
 * - priority / project : recopies telles quelles.
 *
 * ## Bouton stylo : choix documentes ici (pas encore implemente)
 *
 * - Le bouton porte role=button et un nom accessible contenant "Modifier"
 *   (ex: aria-label="Modifier la tache", ou texte visible "Modifier").
 *   Recherche via getByRole('button', { name: /modifier/i }) a l'interieur
 *   du noeud (selecteurNoeud(uuid)).
 * - Seuls les noeuds `dans_projet: true` en portent un. Un noeud hors-projet
 *   (voisin, dans_projet: false) n'en a pas : on n'edite pas depuis ce
 *   graphe une tache d'un autre projet, choix delibere pour ne pas ouvrir
 *   un editeur sur une tache dont on ne voit qu'un fragment de contexte.
 * - Cliquer le stylo ne doit ni deplacer ni zoomer le graphe (svg-pan-zoom) :
 *   il doit stopper la propagation avant tout gestionnaire de glisser porte
 *   par le noeud ou le SVG.
 * - Message d'erreur "tache introuvable" : choix documente, zone
 *   `#graphe-message` (deja utilisee par graphe.js pour ses messages
 *   d'etat/erreur, cf. definirMessage). Si l'implementation choisit un autre
 *   emplacement, seule la fonction `messageErreur` ci-dessous doit changer.
 *
 * Si l'implementation choisit finalement un autre attribut/texte pour le
 * bouton, seule la fonction `selecteurBoutonEdition` ci-dessous doit changer.
 */
const { test, expect } = require('@playwright/test');

const DELAI_SAISIE_NAV = 150; // cf. SAISIE_DELAI dans nav.js

function selecteurNoeud(uuid) {
  return `[data-uuid="${uuid}"]`;
}

/** Bouton stylo a l'interieur d'un noeud donne. Voir choix documentes en tete de fichier. */
function selecteurBoutonEdition(page, uuid) {
  return page.locator(selecteurNoeud(uuid)).getByRole('button', { name: /modifier/i });
}

/** Zone de message d'etat/erreur de graphe.js. Voir choix documentes en tete de fichier. */
function messageErreur(page) {
  return page.locator('#graphe-message');
}

/**
 * Reproduit formatDateForInput puis formatDateForTask de task-editor.js,
 * pour calculer la valeur attendue dans le corps du PUT a partir d'une date
 * brute au format TaskWarrior (AAAAMMJJTHHMMSSZ), SANS modification du
 * champ correspondant dans le formulaire (round-trip complet).
 */
function versDateFormulaire(dateBrute) {
  if (!dateBrute) return null;
  let entree = dateBrute;
  if (/^\d{8}T\d{6}Z$/.test(dateBrute)) {
    const annee = dateBrute.substring(0, 4);
    const mois = dateBrute.substring(4, 6);
    const jour = dateBrute.substring(6, 8);
    const heure = dateBrute.substring(9, 11);
    const minute = dateBrute.substring(11, 13);
    const seconde = dateBrute.substring(13, 15);
    entree = `${annee}-${mois}-${jour}T${heure}:${minute}:${seconde}Z`;
  }
  const pourFormulaire = new Date(entree).toISOString().slice(0, 16); // formatDateForInput
  return pourFormulaire.length === 16 ? `${pourFormulaire}:00` : pourFormulaire; // formatDateForTask
}

/** Jeu de noeuds/aretes construit a la main, projet NPD.Orion (copie de graphe.spec.js). */
function donneesOrion() {
  const noeuds = [
    {
      uuid: 'aaaa1111-0000-0000-0000-000000000001',
      description: 'Concevoir arbre de transmission',
      project: 'NPD.Orion',
      estTime: 'PT1H',
      due: null,
      externe: false,
      fige: false,
      dans_projet: true,
    },
    {
      uuid: 'aaaa2222-0000-0000-0000-000000000002',
      description: 'Tracer plan carter',
      project: 'NPD.Orion.plans',
      estTime: null,
      due: null,
      externe: false,
      fige: false,
      dans_projet: true,
    },
    {
      // voisin hors projet : pas de bouton stylo attendu
      uuid: 'bbbb4444-0000-0000-0000-000000000004',
      description: 'Fournir la specification amont',
      project: 'NPD.Triton',
      estTime: null,
      due: null,
      externe: false,
      fige: false,
      dans_projet: false,
    },
  ];
  const aretes = [
    { de: 'bbbb4444-0000-0000-0000-000000000004', vers: 'aaaa1111-0000-0000-0000-000000000001' },
    { de: 'aaaa1111-0000-0000-0000-000000000001', vers: 'aaaa2222-0000-0000-0000-000000000002' },
  ];
  return { noeuds, aretes };
}

/**
 * Tache complete (forme export TaskWarrior) pour un uuid de donneesOrion().
 * Description deliberement differente du libelle du noeud graphe pour les
 * tests qui doivent prouver que la modale se remplit depuis /api/tasks et
 * non depuis le noeud Mermaid.
 */
function tacheComplete(uuid, overrides = {}) {
  return {
    uuid,
    description: 'Description venue de /api/tasks (pas du graphe)',
    project: 'NPD.Orion',
    priority: 'H',
    tags: ['pro', 'externe'],
    due: '20260901T103000Z',
    scheduled: '20260815T090000Z',
    estTime: 'PT2H30M',
    urgency: 9.5,
    status: 'pending',
    ...overrides,
  };
}

/** Prepare la page : mocke /api/graphe, laisse le reste au vrai serveur. Renvoie la liste des projets demandes. */
async function preparer(page, { reponsesParProjet = {} } = {}) {
  const appels = [];
  await page.route('**/api/graphe**', async route => {
    const url = new URL(route.request().url());
    const projet = url.searchParams.get('projet');
    appels.push(projet);

    const donnees = reponsesParProjet[projet];
    if (donnees === undefined) {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ projet, noeuds: [], aretes: [] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ projet, noeuds: donnees.noeuds, aretes: donnees.aretes }) });
  });
  return appels;
}

/**
 * Mocke GET /api/tasks (forme { success, tasks: [...] }, cf. get_tasks dans
 * main_fastapi.py et test_fastapi.py). Exclut explicitement /api/tasks/planned
 * (pattern a un seul segment apres "tasks").
 */
async function preparerTaches(page, { tasks = [] } = {}) {
  const appels = [];
  await page.route('**/api/tasks*', async route => {
    appels.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, tasks }) });
  });
  return appels;
}

/** Mocke PUT /api/task/:uuid/modify et capture chaque requete (uuid cible + corps). */
async function preparerEnregistrement(page, { task = {} } = {}) {
  const requetes = [];
  await page.route('**/api/task/*/modify', async route => {
    const url = new URL(route.request().url());
    const segments = url.pathname.split('/');
    const uuidCible = segments[segments.length - 2]; // /api/task/<uuid>/modify
    let corps = null;
    try { corps = route.request().postDataJSON(); } catch (e) { corps = null; }
    requetes.push({ uuid: uuidCible, corps });
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, task: { uuid: uuidCible, ...task } }) });
  });
  return requetes;
}

/** Tape dans le filtre projet de nav.js et attend l'anti-rebond. */
async function choisirProjet(page, nom) {
  const champ = page.locator('#tw-project');
  await champ.fill(nom);
  await page.waitForTimeout(DELAI_SAISIE_NAV + 100);
}

test.describe('graphe.html — edition d\'une tache depuis un noeud (H3)', () => {

  test('un bouton stylo accessible existe sur chaque noeud dans_projet, absent hors-projet', async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e));

    const { noeuds, aretes } = donneesOrion();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await preparerTaches(page, { tasks: noeuds.map(n => tacheComplete(n.uuid)) });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    await expect(page.locator(selecteurNoeud(noeuds[0].uuid))).toBeVisible();

    // Noeuds dans le projet : bouton stylo present et accessible.
    await expect(selecteurBoutonEdition(page, noeuds[0].uuid)).toBeVisible();
    await expect(selecteurBoutonEdition(page, noeuds[1].uuid)).toBeVisible();

    // Noeud hors-projet : pas de bouton stylo (on n'edite pas une tache d'un
    // autre projet depuis ce graphe).
    await expect(selecteurBoutonEdition(page, noeuds[2].uuid)).toHaveCount(0);

    expect(erreurs).toEqual([]);
  });

  test('clic sur le stylo ouvre la modale pre-remplie avec la description de /api/tasks (pas celle du noeud)', async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e));

    const { noeuds, aretes } = donneesOrion();
    const cible = noeuds[1]; // libelle graphe : "Tracer plan carter"
    const tache = tacheComplete(cible.uuid); // description volontairement differente

    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await preparerTaches(page, { tasks: [tacheComplete(noeuds[0].uuid), tache] });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    await selecteurBoutonEdition(page, cible.uuid).click();

    await expect(page.locator('#task-editor-description')).toBeVisible();
    // Preuve que la source est /api/tasks : la valeur n'est pas le libelle
    // du noeud graphe, c'est celui de la tache complete.
    await expect(page.locator('#task-editor-description')).toHaveValue(tache.description);
    await expect(page.locator('#task-editor-description')).not.toHaveValue(cible.description);

    expect(erreurs).toEqual([]);
  });

  test('modifier la description et enregistrer envoie la bonne requete puis redessine le graphe', async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e));

    const { noeuds, aretes } = donneesOrion();
    const cible = noeuds[0];
    const tache = tacheComplete(cible.uuid);
    const nouvelleDescription = tache.description + ' (revise)';

    const noeudsApresModif = noeuds.map(n =>
      n.uuid === cible.uuid ? { ...n, description: nouvelleDescription } : n
    );

    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await preparerTaches(page, { tasks: [tache, tacheComplete(noeuds[1].uuid)] });
    const requetes = await preparerEnregistrement(page, { description: nouvelleDescription });

    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');
    await expect(page.locator(selecteurNoeud(cible.uuid))).toContainText(cible.description);

    // Reroute /api/graphe pour repondre les donnees a jour a partir de
    // maintenant : le prochain appel (declenche par l'enregistrement) doit
    // voir la nouvelle description.
    await page.unroute('**/api/graphe**');
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds: noeudsApresModif, aretes } } });

    await selecteurBoutonEdition(page, cible.uuid).click();
    await expect(page.locator('#task-editor-description')).toHaveValue(tache.description);

    await page.fill('#task-editor-description', nouvelleDescription);
    await page.click('#task-editor-save');

    // La requete d'enregistrement doit cibler l'uuid de la tache editee, avec
    // la nouvelle description dans le corps -- pas une autre tache.
    await expect.poll(() => requetes.length).toBeGreaterThan(0);
    expect(requetes[0].uuid).toBe(cible.uuid);
    expect(requetes[0].corps).toBeTruthy();
    expect(requetes[0].corps.description).toBe(nouvelleDescription);

    // La modale se ferme et le graphe est redessine avec le nouveau libelle.
    await expect(page.locator('#task-editor-description')).toBeHidden();
    await expect(page.locator(selecteurNoeud(cible.uuid))).toContainText(nouvelleDescription, { timeout: 10000 });

    expect(erreurs).toEqual([]);
  });

  test('enregistrer depuis le graphe preserve les champs non edites', async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e));

    const { noeuds, aretes } = donneesOrion();
    const cible = noeuds[0];
    const tache = tacheComplete(cible.uuid, {
      tags: ['pro', 'externe'],
      priority: 'H',
      project: 'NPD.Orion',
      due: '20260901T103000Z',
      scheduled: '20260815T090000Z',
      estTime: 'PT2H30M',
    });
    const nouvelleDescription = tache.description + ' -- seule la description change';

    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await preparerTaches(page, { tasks: [tache, tacheComplete(noeuds[1].uuid)] });
    const requetes = await preparerEnregistrement(page, { description: nouvelleDescription });

    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    await selecteurBoutonEdition(page, cible.uuid).click();
    await expect(page.locator('#task-editor-description')).toHaveValue(tache.description);

    // On ne touche QUE la description.
    await page.fill('#task-editor-description', nouvelleDescription);
    await page.click('#task-editor-save');

    await expect.poll(() => requetes.length).toBeGreaterThan(0);
    const corps = requetes[0].corps;
    expect(requetes[0].uuid).toBe(cible.uuid);
    expect(corps.description).toBe(nouvelleDescription);

    // Champs non edites : doivent repartir inchanges, encodes selon
    // prepareTaskDataForAPI (voir versDateFormulaire pour due/scheduled et
    // l'en-tete du fichier pour le detail de chaque champ).
    expect(corps.tags).toEqual(tache.tags);
    expect(corps.priority).toBe(tache.priority);
    expect(corps.project).toBe(tache.project);
    expect(corps.estTime).toBe(tache.estTime);
    expect(corps.due).toBe(versDateFormulaire(tache.due));
    expect(corps.scheduled).toBe(versDateFormulaire(tache.scheduled));

    expect(erreurs).toEqual([]);
  });

  test('tache introuvable dans /api/tasks : message d\'erreur visible, pas de modale, aucun PUT', async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e));

    const { noeuds, aretes } = donneesOrion();
    const cible = noeuds[0];

    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    // /api/tasks ne contient PAS la tache du noeud clique.
    await preparerTaches(page, { tasks: [tacheComplete(noeuds[1].uuid)] });
    const requetes = await preparerEnregistrement(page);

    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    await selecteurBoutonEdition(page, cible.uuid).click();

    await expect(messageErreur(page)).toBeVisible();
    await expect(messageErreur(page)).toContainText(/introuvable|erreur/i);
    await expect(page.locator('#task-editor-description')).toBeHidden();
    expect(requetes.length).toBe(0);

    expect(erreurs).toEqual([]);
  });

  test('annuler la modale : aucune requete d\'enregistrement, graphe inchange', async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e));

    const { noeuds, aretes } = donneesOrion();
    const cible = noeuds[0];
    const tache = tacheComplete(cible.uuid);

    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await preparerTaches(page, { tasks: [tache, tacheComplete(noeuds[1].uuid)] });
    const requetes = await preparerEnregistrement(page);

    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');
    await expect(page.locator(selecteurNoeud(cible.uuid))).toContainText(cible.description);

    await selecteurBoutonEdition(page, cible.uuid).click();
    await expect(page.locator('#task-editor-description')).toBeVisible();
    await page.fill('#task-editor-description', 'Ce texte ne doit jamais partir');

    // Annuler : bouton #task-editor-cancel (voir task-editor.js, bindEvents).
    await page.click('#task-editor-cancel');

    await expect(page.locator('#task-editor-description')).toBeHidden();
    expect(requetes.length).toBe(0);
    await expect(page.locator(selecteurNoeud(cible.uuid))).toContainText(cible.description);

    expect(erreurs).toEqual([]);
  });

  test('le stylo ne deplace ni ne zoome le graphe ; un glisser sur un noeud pan sans ouvrir la modale', async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e));

    const { noeuds, aretes } = donneesOrion();
    const cible = noeuds[0];
    const autre = noeuds[1];

    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await preparerTaches(page, { tasks: [tacheComplete(cible.uuid), tacheComplete(autre.uuid)] });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');
    await expect(page.locator(selecteurNoeud(autre.uuid))).toBeVisible();

    const positionAvant = await page.locator(selecteurNoeud(autre.uuid)).boundingBox();
    expect(positionAvant).toBeTruthy();

    // Clic sur le stylo d'un autre noeud : ne doit pas deplacer/zoomer le
    // graphe (la position d'un troisieme noeud reste identique).
    await selecteurBoutonEdition(page, cible.uuid).click();
    await expect(page.locator('#task-editor-description')).toBeVisible();
    await page.click('#task-editor-cancel');
    await expect(page.locator('#task-editor-description')).toBeHidden();

    const positionApresClicStylo = await page.locator(selecteurNoeud(autre.uuid)).boundingBox();
    expect(positionApresClicStylo).toBeTruthy();
    expect(Math.round(positionApresClicStylo.x)).toBe(Math.round(positionAvant.x));
    expect(Math.round(positionApresClicStylo.y)).toBe(Math.round(positionAvant.y));

    // Glisser depuis le noeud cible (pas depuis le stylo) : doit deplacer le
    // graphe (svg-pan-zoom) et ne pas ouvrir la modale d'edition.
    const noeudCible = page.locator(selecteurNoeud(cible.uuid));
    const boiteCible = await noeudCible.boundingBox();
    expect(boiteCible).toBeTruthy();
    const depart = { x: boiteCible.x + boiteCible.width / 2, y: boiteCible.y + boiteCible.height / 2 };

    await page.mouse.move(depart.x, depart.y);
    await page.mouse.down();
    await page.mouse.move(depart.x + 80, depart.y + 60, { steps: 10 });
    await page.mouse.up();

    await expect(page.locator('#task-editor-description')).toBeHidden();

    const positionApresGlisser = await page.locator(selecteurNoeud(autre.uuid)).boundingBox();
    expect(positionApresGlisser).toBeTruthy();
    // Le glisser doit avoir deplace le graphe : la position de l'autre noeud
    // (donc du viewport svg-pan-zoom) a change d'au moins quelques pixels.
    const delta = Math.abs(positionApresGlisser.x - positionAvant.x) + Math.abs(positionApresGlisser.y - positionAvant.y);
    expect(delta).toBeGreaterThan(5);

    expect(erreurs).toEqual([]);
  });
});
