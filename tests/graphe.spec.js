// @ts-check
/**
 * Contrat de test pour graphe.html / graphe.js (fonctionnalite H, cote UI).
 *
 * Page absente au moment ou ce fichier est ecrit : ces tests doivent echouer
 * (page introuvable / selecteurs absents), pas passer par accident.
 *
 * ## Forme de la reponse mockee
 *
 * Alignee sur test_graphe.py : GET /api/graphe?projet=X repond
 *   { projet, noeuds: [{ uuid, description, project, estTime, due,
 *                          externe, fige, dans_projet }],
 *     aretes: [{ de, vers }] }
 *
 * ## Choix d'identification d'un noeud
 *
 * On suppose que graphe.js pose un attribut `data-uuid="<uuid>"` sur l'element
 * DOM qui represente chaque noeud (le noeud Mermaid genere porte cet attribut,
 * par exemple via une classe ou un `click` binding qui ajoute l'attribut apres
 * le rendu). Choix documente ici parce que l'enonce laissait deux options
 * (attribut dedie, ou id contenant l'uuid sans tirets a cause des contraintes
 * d'id Mermaid) : `data-uuid` evite tout probleme d'id invalide en cas de
 * tirets ou de caracteres non alphanumeriques dans l'uuid, et se retrouve par
 * un simple `[data-uuid="..."]` sans transformation cote test.
 * Si l'implementation choisit finalement un id sans tirets, ce fichier devra
 * etre ajuste sur ce seul point (fonction `selecteurNoeud`).
 *
 * ## Mecanisme de selection du projet (lu dans nav.js)
 *
 * Le filtre projet est un champ texte `#tw-project` dans la barre de nav.
 * Sa frappe est anti-rebondie (150ms, cf. SAISIE_DELAI) puis appelle
 * `window.twNav.setState({ project: valeur }, { clientOnly: true })`, qui
 * ecrit l'etat dans localStorage (cle `tw-nav-state`) et emet un
 * CustomEvent `tw-filter-change` sur `document`, avec `detail.project` et
 * `detail.clientOnly = true`.
 *
 * Le flag `clientOnly` sert aux pages qui ont deja tout leur jeu de donnees
 * en memoire (liste, kanban) : pas la peine de retaper le serveur, un
 * re-rendu local suffit. graphe.js n'a jamais les donnees d'un projet avant
 * de l'avoir demande : il doit donc re-appeler /api/graphe a chaque
 * changement de state.project, meme quand clientOnly vaut true. C'est une
 * lecture deliberee de l'evenement, differente de celle des autres pages,
 * et testee explicitement (test "changer le projet relance l'appel").
 *
 * Ces tests pilotent le filtre en tapant dans #tw-project (chemin reel),
 * plutot qu'en appelant twNav.setState() directement depuis le test.
 */
const { test, expect } = require('@playwright/test');

const DELAI_SAISIE_NAV = 150; // cf. SAISIE_DELAI dans nav.js

function selecteurNoeud(uuid) {
  return `[data-uuid="${uuid}"]`;
}

/** Jeu de noeuds/aretes construit a la main, projet NPD.Orion. */
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
      // description avec guillemets, crochets, accents : ne doit pas casser
      // le rendu Mermaid (qui utilise lui-meme des guillemets et crochets).
      uuid: 'aaaa2222-0000-0000-0000-000000000002',
      description: 'Tracer plan "carter" [rev B] été',
      project: 'NPD.Orion.plans',
      estTime: null,
      due: '20260901T000000Z',
      externe: true,
      fige: false,
      dans_projet: true,
    },
    {
      uuid: 'aaaa3333-0000-0000-0000-000000000003',
      description: 'Devis fournisseur reducteur',
      project: 'NPD.Orion.achats',
      estTime: null,
      due: null,
      externe: false,
      fige: true,
      dans_projet: true,
    },
    {
      // voisin hors projet
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
    { de: 'aaaa2222-0000-0000-0000-000000000002', vers: 'aaaa3333-0000-0000-0000-000000000003' },
  ];
  return { noeuds, aretes };
}

/** Prepare la page : mocke /api/graphe, laisse le reste au vrai serveur. */
async function preparer(page, { reponsesParProjet = {}, statutHttp = null } = {}) {
  const appels = [];
  await page.route('**/api/graphe**', async route => {
    const url = new URL(route.request().url());
    const projet = url.searchParams.get('projet');
    appels.push(projet);

    if (statutHttp) {
      await route.fulfill({ status: statutHttp, contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'erreur serveur simulee' }) });
      return;
    }

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

/** Tape dans le filtre projet de nav.js et attend l'anti-rebond. */
async function choisirProjet(page, nom) {
  const champ = page.locator('#tw-project');
  await champ.fill(nom);
  await page.waitForTimeout(DELAI_SAISIE_NAV + 100);
}

test.describe('graphe.html — visualisation des dependances', () => {

  test('sans projet selectionne, invite a en choisir un, aucun appel a /api/graphe', async ({ page }) => {
    const appels = await preparer(page);
    await page.goto('/graphe.html');
    await expect(page.locator('body')).toContainText(/choisi(r|ssez).*projet|selectionn.*projet/i);
    await page.waitForTimeout(300);
    expect(appels.length).toBe(0);
  });

  test('avec un projet choisi, appelle /api/graphe et dessine un noeud par tache', async ({ page }) => {
    const { noeuds, aretes } = donneesOrion();
    const appels = await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    await expect.poll(() => appels.filter(p => p === 'NPD.Orion').length).toBeGreaterThan(0);
    for (const n of noeuds) {
      // Un mot du debut de la description suffit : le texte source complet
      // n'a pas a survivre tel quel a travers Mermaid (echappement interne).
      await expect(page.locator(selecteurNoeud(n.uuid)))
        .toContainText(new RegExp(escapeRegExp(n.description.split(' ')[0])));
    }
  });

  test('les classes CSS externe / hors-projet / fige sont posees sur les bons noeuds', async ({ page }) => {
    const { noeuds, aretes } = donneesOrion();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    await expect(page.locator(selecteurNoeud('aaaa2222-0000-0000-0000-000000000002')))
      .toHaveClass(/externe/);
    await expect(page.locator(selecteurNoeud('aaaa3333-0000-0000-0000-000000000003')))
      .toHaveClass(/fige/);
    await expect(page.locator(selecteurNoeud('bbbb4444-0000-0000-0000-000000000004')))
      .toHaveClass(/hors-projet/);
    // Le premier noeud n'a aucune de ces trois proprietes.
    const classeN1 = await page.locator(selecteurNoeud('aaaa1111-0000-0000-0000-000000000001'))
      .getAttribute('class');
    expect(classeN1 || '').not.toMatch(/externe|fige|hors-projet/);
  });

  test('un cadre (subgraph) par sous-projet distinct parmi les noeuds du projet', async ({ page }) => {
    const { noeuds, aretes } = donneesOrion();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    // Un cadre par sous-projet, retrouve par data-cadre (nom complet). Le
    // titre AFFICHE est le dernier segment (voir la section cadres imbriques
    // plus bas, qui remplace l'ancienne attente du nom complet visible).
    const conteneur = page.locator('#graphe-svg, svg').first();
    await expect(conteneur).toBeVisible();
    for (const [complet, affiche] of [['NPD.Orion.plans', 'plans'], ['NPD.Orion.achats', 'achats']]) {
      const cadre = page.locator(`[data-cadre="${complet}"]`);
      await expect(cadre).toHaveCount(1);
      await expect(cadre).toContainText(affiche);
    }
  });

  test('une fleche par arete rendue dans le SVG', async ({ page }) => {
    const { noeuds, aretes } = donneesOrion();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    const svg = page.locator('svg').first();
    await expect(svg).toBeVisible();
    // Mermaid rend chaque arete comme un <path class="...edge...dge..."> (ou
    // un marker de fleche) : on compte les chemins d'arete, pas les traits
    // internes des noeuds (rectangles/texte), qui ne sont pas des <path>.
    const nbFleches = await svg.locator('path.flowchart-link, path[class*="edge"], marker path')
      .count();
    expect(nbFleches).toBeGreaterThanOrEqual(aretes.length);
  });

  test('description avec guillemets, crochets et accents ne casse pas le rendu', async ({ page }) => {
    const { noeuds, aretes } = donneesOrion();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    // La page ne doit pas afficher de bandeau d'erreur, et le SVG doit
    // exister malgre la description a caracteres speciaux.
    await expect(page.locator('svg')).toBeVisible();
    // innerText et non textContent : le <style> que Mermaid embarque dans le
    // SVG contient ses propres noms de classes (.error-text), jamais affiches.
    expect(await page.locator('body').innerText()).not.toMatch(/erreur|error/i);
    await expect(page.locator('svg .error-icon')).toHaveCount(0);
    // Le libelle entier, pas un mot : un echappement qui mange les guillemets,
    // les crochets ou l'accent doit se voir.
    await expect(page.locator(selecteurNoeud('aaaa2222-0000-0000-0000-000000000002')))
      .toContainText('Tracer plan "carter" [rev B] été');
  });

  test('reponse vide : message "aucune tache", pas de SVG', async ({ page }) => {
    await preparer(page, { reponsesParProjet: { 'NPD.Vide': { noeuds: [], aretes: [] } } });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Vide');

    await expect(page.locator('body')).toContainText(/aucune t[aâ]che/i);
    await expect(page.locator('svg')).toHaveCount(0);
  });

  test('erreur HTTP : message d\'erreur visible dans la page', async ({ page }) => {
    await preparer(page, { statutHttp: 500 });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    await expect(page.locator('body')).toContainText(/erreur/i);
    await expect(page.locator('svg')).toHaveCount(0);
  });

  test('changer le projet dans le filtre relance l\'appel et redessine', async ({ page }) => {
    const orion = donneesOrion();
    const triton = {
      noeuds: [{
        uuid: 'cccc5555-0000-0000-0000-000000000005',
        description: 'Tache du projet Triton',
        project: 'NPD.Triton',
        estTime: null, due: null, externe: false, fige: false, dans_projet: true,
      }],
      aretes: [],
    };
    const appels = await preparer(page, {
      reponsesParProjet: { 'NPD.Orion': orion, 'NPD.Triton': triton },
    });
    await page.goto('/graphe.html');

    await choisirProjet(page, 'NPD.Orion');
    await expect(page.locator(selecteurNoeud('aaaa1111-0000-0000-0000-000000000001'))).toBeVisible();
    const appelsAvant = appels.filter(p => p === 'NPD.Triton').length;

    await choisirProjet(page, 'NPD.Triton');
    await expect.poll(() => appels.filter(p => p === 'NPD.Triton').length).toBeGreaterThan(appelsAvant);
    await expect(page.locator(selecteurNoeud('cccc5555-0000-0000-0000-000000000005'))).toBeVisible();
    // L'ancien noeud d'Orion a disparu : le graphe a bien ete redessine, pas
    // seulement complete.
    await expect(page.locator(selecteurNoeud('aaaa1111-0000-0000-0000-000000000001'))).toHaveCount(0);
  });
});

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * ## Complement de contrat — cadres imbriques, mise en page, zoom
 *
 * Nouvelle specification, ajoutee sans toucher aux 9 tests ci-dessus.
 *
 * ### Choix documentes
 *
 * - Selecteur d'un cadre (frame) : `[data-cadre="<nom-complet-du-projet>"]`,
 *   sur le modele de `data-uuid` pour les noeuds. Mermaid ne pose pas
 *   d'attribut dedie sur ses clusters de subgraph ; l'implementation devra
 *   poser cet attribut elle-meme apres rendu (comme elle le fait deja pour
 *   data-uuid via appliquerAttributsNoeuds), quel que soit le mecanisme de
 *   rendu choisi (subgraphs Mermaid imbriques, ou dessin manuel des cadres).
 * - Nom complet d'un cadre : porte soit par l'attribut `title` standard
 *   (tooltip natif), soit par un element `<title>` SVG enfant du cadre. Les
 *   deux formes sont acceptees par ces tests (fonction `titreCadre`).
 * - Cadre du "projet demande" : REVISE le 23/09 (defaut constate : un cadre
 *   autour de tout le projet demande se lisait comme une tache isolee des
 *   qu'on affichait un sous-projet, ex. projet=NPD.Vulcan encadrant
 *   revueA/revueB dans un cadre "Vulcan"). Regle desormais : le projet
 *   demande N'A PAS de cadre. Ses taches directes (cas de NPD.Orion dans
 *   `donneesHierarchie`) sont au premier niveau, hors cadre. Les cadres
 *   commencent aux sous-projets directs du projet demande, qui ne sont donc
 *   contenus dans aucun cadre englobant (voir le describe "le projet demande
 *   n'a pas de cadre"). Les voisins hors projet (dans_projet: false) gardent
 *   leur cadre plat, par leur propre projet — inchange.
 * - Zone du graphe (pour la mise en page et le zoom) : l'element existant
 *   `#graphe-svg`, deja utilise comme conteneur du SVG par graphe.js et par
 *   les tests ci-dessus. Pas de nouveau conteneur introduit.
 * - Jeu de donnees pour les tests de zoom : 25 noeuds generes en boucle
 *   (`donneesGrandProjet`), assez pour que l'ajustement ("Ajuster") reduise
 *   effectivement le rendu par rapport a une vue zoomee.
 *
 * ### Conflit avec un test existant — a signaler, non resolu ici
 *
 * Le test "un cadre (subgraph) par sous-projet" a ete mis a jour par
 * l'architecte : il attend desormais data-cadre + dernier segment affiche.
 */

function contenuDans(interieur, exterieur, marge = 2) {
  return (
    interieur.x >= exterieur.x - marge &&
    interieur.y >= exterieur.y - marge &&
    interieur.x + interieur.width <= exterieur.x + exterieur.width + marge &&
    interieur.y + interieur.height <= exterieur.y + exterieur.height + marge
  );
}

function selecteurCadre(nomComplet) {
  return `[data-cadre="${nomComplet}"]`;
}

function mkTache(uuid, project) {
  return {
    uuid, description: 'Tache ' + uuid, project,
    estTime: null, due: null, externe: false, fige: false, dans_projet: true,
  };
}

/** NPD.Orion avec des enfants a deux niveaux : achats/{devis,commandes}, plans. */
function donneesHierarchie() {
  const noeuds = [
    mkTache('h001-0000-0000-0000-000000000001', 'NPD.Orion'),
    mkTache('h002-0000-0000-0000-000000000002', 'NPD.Orion.achats'),
    mkTache('h003-0000-0000-0000-000000000003', 'NPD.Orion.achats.devis'),
    mkTache('h004-0000-0000-0000-000000000004', 'NPD.Orion.achats.commandes'),
    mkTache('h005-0000-0000-0000-000000000005', 'NPD.Orion.plans'),
  ];
  return { noeuds, aretes: [] };
}

/** Aucune tache directement dans NPD.Orion.achats : le cadre doit exister quand meme. */
function donneesHierarchieSansAchatsPropre() {
  const noeuds = [
    mkTache('h010-0000-0000-0000-000000000010', 'NPD.Orion'),
    mkTache('h011-0000-0000-0000-000000000011', 'NPD.Orion.achats.devis'),
  ];
  return { noeuds, aretes: [] };
}

/** 25 noeuds chaines, projet NPD.Grand, pour les tests de zoom/ajustement. */
function donneesGrandProjet() {
  const noeuds = [];
  const aretes = [];
  for (let i = 0; i < 25; i++) {
    const uuid = 'g' + String(i).padStart(3, '0') + '-0000-0000-0000-000000000000';
    noeuds.push(mkTache(uuid, 'NPD.Grand'));
    if (i > 0) {
      const precedent = 'g' + String(i - 1).padStart(3, '0') + '-0000-0000-0000-000000000000';
      aretes.push({ de: precedent, vers: uuid });
    }
  }
  return { noeuds, aretes };
}

/** true si la boite de chaque noeud est contenue dans la zone du graphe. */
async function tousNoeudsDansZone(page, noeuds, marge = 2) {
  const zone = await page.locator('#graphe-svg').boundingBox();
  if (!zone) return false;
  for (const n of noeuds) {
    const boite = await page.locator(selecteurNoeud(n.uuid)).boundingBox();
    if (!boite) return false;
    if (!contenuDans(boite, zone, marge)) return false;
  }
  return true;
}

/** Nom complet d'un cadre : via l'attribut title, ou a defaut son <title> enfant. */
async function titreCadre(page, nomComplet) {
  const cadre = page.locator(selecteurCadre(nomComplet));
  const attr = await cadre.getAttribute('title');
  if (attr) return attr;
  const enfant = cadre.locator('title').first();
  if (await enfant.count()) return await enfant.textContent();
  return null;
}

/**
 * true si aucun AUTRE cadre du graphe ne contient geometriquement celui-ci.
 * Sert a prouver l'absence de cadre englobant (regle du 23/09 : le projet
 * demande n'a pas de cadre, donc ses cadres de premier niveau ne doivent
 * etre contenus dans rien).
 */
async function estCadreDeTopNiveau(page, nomComplet) {
  const boite = await page.locator(selecteurCadre(nomComplet)).boundingBox();
  if (!boite) return false;
  const tousCadres = await page.locator('[data-cadre]').all();
  for (const c of tousCadres) {
    const nom = await c.getAttribute('data-cadre');
    if (nom === nomComplet) continue;
    const autre = await c.boundingBox();
    if (!autre) continue;
    const aireAutre = autre.width * autre.height;
    const aireBoite = boite.width * boite.height;
    if (contenuDans(boite, autre) && aireAutre > aireBoite) return false;
  }
  return true;
}

test.describe('graphe.html — cadres imbriques selon la hierarchie des projets', () => {

  test('devis et commandes sont geometriquement contenus dans achats', async ({ page }) => {
    const { noeuds, aretes } = donneesHierarchie();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    await expect(page.locator(selecteurCadre('NPD.Orion.achats'))).toBeVisible();
    const achats = await page.locator(selecteurCadre('NPD.Orion.achats')).boundingBox();
    const devis = await page.locator(selecteurCadre('NPD.Orion.achats.devis')).boundingBox();
    const commandes = await page.locator(selecteurCadre('NPD.Orion.achats.commandes')).boundingBox();
    expect(achats).not.toBeNull();
    expect(devis).not.toBeNull();
    expect(commandes).not.toBeNull();
    expect(contenuDans(devis, achats)).toBe(true);
    expect(contenuDans(commandes, achats)).toBe(true);
  });

  // Remplace l'ancien test "achats et plans sont contenus dans le cadre du
  // projet demande" : cette attente contredit la nouvelle regle du 23/09
  // (le projet demande n'a pas de cadre). Voir le describe dedie plus bas
  // pour la couverture complete de cette regle.
  test('le projet demande n\'a pas de cadre ; sa tache directe est hors cadre, achats/plans de premier niveau', async ({ page }) => {
    const { noeuds, aretes } = donneesHierarchie();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    await expect(page.locator(selecteurCadre('NPD.Orion'))).toHaveCount(0);
    // h001 est directement dans NPD.Orion : au premier niveau, hors cadre.
    await expect(page.locator(selecteurNoeud('h001-0000-0000-0000-000000000001'))).toBeVisible();

    const achats = await page.locator(selecteurCadre('NPD.Orion.achats')).boundingBox();
    const plans = await page.locator(selecteurCadre('NPD.Orion.plans')).boundingBox();
    expect(achats).not.toBeNull();
    expect(plans).not.toBeNull();
    expect(await estCadreDeTopNiveau(page, 'NPD.Orion.achats')).toBe(true);
    expect(await estCadreDeTopNiveau(page, 'NPD.Orion.plans')).toBe(true);
  });

  test('un cadre intermediaire sans tache en propre existe s\'il a des enfants', async ({ page }) => {
    const { noeuds, aretes } = donneesHierarchieSansAchatsPropre();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    await expect(page.locator(selecteurCadre('NPD.Orion.achats'))).toBeVisible();
    const achats = await page.locator(selecteurCadre('NPD.Orion.achats')).boundingBox();
    const devis = await page.locator(selecteurCadre('NPD.Orion.achats.devis')).boundingBox();
    expect(achats).not.toBeNull();
    expect(contenuDans(devis, achats)).toBe(true);
  });

  test('le titre d\'un cadre imbrique est son dernier segment, nom complet en tooltip', async ({ page }) => {
    const { noeuds, aretes } = donneesHierarchie();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    const cadre = page.locator(selecteurCadre('NPD.Orion.achats.devis'));
    // innerText() est refuse par Playwright sur un element SVG, et le
    // textContent du cadre entier inclurait son <title> (nom complet) : on lit
    // l'etiquette affichee du cadre.
    const texteVisible = await cadre.locator('.cluster-label').first().textContent();
    expect(texteVisible).toMatch(/\bdevis\b/);
    expect(texteVisible).not.toContain('NPD.Orion.achats.devis');
    expect(await titreCadre(page, 'NPD.Orion.achats.devis')).toBe('NPD.Orion.achats.devis');
  });
});

/**
 * Defaut constate le 23/09 : le projet demande recevait son propre cadre
 * englobant. Vu depuis l'ecran, projet=NPD affichait un cadre "NPD" autour
 * de tout ; projet=NPD.Vulcan affichait un cadre "Vulcan" autour de revueA
 * et revueB, dont le titre isole se lisait comme une tache. Nouvelle regle :
 * le projet demande n'a pas de cadre ; les cadres commencent aux
 * sous-projets directs du projet demande.
 */
test.describe('graphe.html — le projet demande n\'a pas de cadre', () => {

  /** Taches dans NPD.Vulcan.revueA et NPD.Vulcan.revueB, projet demande NPD.Vulcan. */
  function donneesVulcan() {
    const noeuds = [
      mkTache('v001-0000-0000-0000-000000000001', 'NPD.Vulcan.revueA'),
      mkTache('v002-0000-0000-0000-000000000002', 'NPD.Vulcan.revueB'),
    ];
    return { noeuds, aretes: [] };
  }

  /** Taches dans NPD.Orion.plans et NPD.Vulcan.revueA, projet demande NPD. */
  function donneesNpdRacine() {
    const noeuds = [
      mkTache('r001-0000-0000-0000-000000000001', 'NPD.Orion.plans'),
      mkTache('r002-0000-0000-0000-000000000002', 'NPD.Vulcan.revueA'),
    ];
    return { noeuds, aretes: [] };
  }

  test('projet=NPD.Vulcan : exactement deux cadres, aucun cadre "Vulcan"', async ({ page }) => {
    const { noeuds, aretes } = donneesVulcan();
    await preparer(page, { reponsesParProjet: { 'NPD.Vulcan': { noeuds, aretes } } });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Vulcan');

    await expect(page.locator(selecteurNoeud('v001-0000-0000-0000-000000000001'))).toBeVisible();
    await expect(page.locator(selecteurCadre('NPD.Vulcan'))).toHaveCount(0);
    await expect(page.locator('[data-cadre]')).toHaveCount(2);
    await expect(page.locator(selecteurCadre('NPD.Vulcan.revueA'))).toHaveCount(1);
    await expect(page.locator(selecteurCadre('NPD.Vulcan.revueB'))).toHaveCount(1);
    // Aucun texte "Vulcan" visible hors des noeuds (les deux cadres restants
    // affichent leur dernier segment seulement : "revueA" / "revueB").
    for (const nom of ['NPD.Vulcan.revueA', 'NPD.Vulcan.revueB']) {
      const texte = await page.locator(selecteurCadre(nom)).locator('.cluster-label').first().textContent();
      expect(texte).not.toMatch(/Vulcan/);
    }
  });

  test('projet=NPD : pas de cadre "NPD", les cadres Orion et Vulcan ne sont contenus dans rien', async ({ page }) => {
    const { noeuds, aretes } = donneesNpdRacine();
    await preparer(page, { reponsesParProjet: { 'NPD': { noeuds, aretes } } });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD');

    await expect(page.locator(selecteurNoeud('r001-0000-0000-0000-000000000001'))).toBeVisible();
    await expect(page.locator(selecteurCadre('NPD'))).toHaveCount(0);
    await expect(page.locator(selecteurCadre('NPD.Orion'))).toHaveCount(1);
    await expect(page.locator(selecteurCadre('NPD.Vulcan'))).toHaveCount(1);
    expect(await estCadreDeTopNiveau(page, 'NPD.Orion')).toBe(true);
    expect(await estCadreDeTopNiveau(page, 'NPD.Vulcan')).toBe(true);
  });
});

test.describe('graphe.html — mise en page de la zone du graphe', () => {

  // Specification utilisateur (23/09) : une MARGE, pas un pourcentage. Le
  // cadre de la page (#graphe-page, titre + graphe) laisse le meme ecart avec
  // le bas de la barre de navigation, le bas de la fenetre et les deux cotes.
  // Pour prouver qu'il s'agit d'une marge fixe, l'ecart est mesure a deux
  // tailles de fenetre et doit etre le meme.
  async function mesurerEcarts(page, largeur, hauteur) {
    await page.setViewportSize({ width: largeur, height: hauteur });
    await page.waitForTimeout(200);
    return page.evaluate(() => {
      const cadre = document.querySelector('#graphe-page').getBoundingClientRect();
      // bas de la barre de navigation : element de nav.js le plus bas, hors du cadre
      let basNav = 0;
      for (const el of document.querySelectorAll('[id^="tw-"]')) {
        if (el.closest('#graphe-page')) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) basNav = Math.max(basNav, r.bottom);
      }
      return {
        haut: cadre.top - basNav,
        bas: window.innerHeight - cadre.bottom,
        gauche: cadre.left,
        droite: window.innerWidth - cadre.right,
        defilementVertical: document.documentElement.scrollHeight > window.innerHeight + 1,
      };
    });
  }

  test('meme ecart entre le cadre et la nav, le bas et les deux cotes, a deux tailles de fenetre', async ({ page }) => {
    const { noeuds, aretes } = donneesOrion();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    const grand = await mesurerEcarts(page, 1400, 900);
    const petit = await mesurerEcarts(page, 1000, 700);
    for (const m of [grand, petit]) {
      const e = [m.haut, m.bas, m.gauche, m.droite];
      expect(Math.min(...e), JSON.stringify(m)).toBeGreaterThanOrEqual(8);
      expect(Math.max(...e) - Math.min(...e), JSON.stringify(m)).toBeLessThanOrEqual(2);
      expect(m.defilementVertical, JSON.stringify(m)).toBe(false);
    }
    // marge fixe : le meme ecart aux deux tailles
    expect(Math.abs(grand.gauche - petit.gauche)).toBeLessThanOrEqual(2);

    // la zone du graphe occupe le cadre : elle descend jusqu'au bas du cadre
    // (a une marge interieure pres) au lieu de laisser un vide dessous
    const zone = await page.locator('#graphe-svg').boundingBox();
    const cadre = await page.locator('#graphe-page').boundingBox();
    expect(cadre.y + cadre.height - (zone.y + zone.height)).toBeLessThanOrEqual(48);
    expect(zone.width).toBeGreaterThanOrEqual(cadre.width - 96);
  });

  test('a 375px de large, pas de defilement horizontal de la page', async ({ page }) => {
    const { noeuds, aretes } = donneesOrion();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    const mesure = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(mesure.scrollWidth).toBeLessThanOrEqual(mesure.innerWidth);
  });
});

test.describe('graphe.html — zoom et deplacement', () => {

  test('Zoom avant agrandit le rendu d\'un noeud d\'au moins 10%', async ({ page }) => {
    const { noeuds, aretes } = donneesGrandProjet();
    await preparer(page, { reponsesParProjet: { 'NPD.Grand': { noeuds, aretes } } });
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Grand');

    const noeud = page.locator(selecteurNoeud(noeuds[0].uuid));
    await expect(noeud).toBeVisible();
    const avant = await noeud.boundingBox();
    await page.getByRole('button', { name: 'Zoom avant' }).click();
    // svg-pan-zoom applique la transformation a l'image suivante
    // (requestAnimationFrame) : une mesure unique juste apres le clic la rate
    // quand la machine est chargee. On attend le changement.
    await expect.poll(async () => (await noeud.boundingBox()).width)
      .toBeGreaterThanOrEqual(avant.width * 1.1);
  });

  test('Zoom arriere reduit le rendu d\'un noeud', async ({ page }) => {
    const { noeuds, aretes } = donneesGrandProjet();
    await preparer(page, { reponsesParProjet: { 'NPD.Grand': { noeuds, aretes } } });
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Grand');

    const noeud = page.locator(selecteurNoeud(noeuds[0].uuid));
    await expect(noeud).toBeVisible();
    // Zoome d'abord pour avoir de la marge a redonner : sans cela, le
    // rendu ajuste au chargement peut deja etre a la limite basse.
    // svg-pan-zoom applique chaque transformation a l'image suivante : on
    // attend que les deux zooms avant soient appliques avant de mesurer, puis
    // on attend l'effet du zoom arriere.
    // UN seul zoom avant : avec deux clics, l'attente pouvait se conclure
    // apres le premier, le second s'appliquant apres la mesure "avant" et
    // compensant exactement le zoom arriere (echec observe le 23/09).
    const initial = (await noeud.boundingBox()).width;
    await page.getByRole('button', { name: 'Zoom avant' }).click();
    await expect.poll(async () => (await noeud.boundingBox()).width)
      .toBeGreaterThanOrEqual(initial * 1.1);
    const avant = await noeud.boundingBox();
    await page.getByRole('button', { name: 'Zoom arriere' }).click();
    await expect.poll(async () => (await noeud.boundingBox()).width)
      .toBeLessThan(avant.width * 0.95);
  });

  test('Ajuster ramene toute l\'etendue du graphe dans la zone visible', async ({ page }) => {
    const { noeuds, aretes } = donneesGrandProjet();
    await preparer(page, { reponsesParProjet: { 'NPD.Grand': { noeuds, aretes } } });
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Grand');
    await expect(page.locator(selecteurNoeud(noeuds[0].uuid))).toBeVisible();

    const boutonZoomAvant = page.getByRole('button', { name: 'Zoom avant' });
    for (let i = 0; i < 8; i++) {
      await boutonZoomAvant.click();
    }
    await page.getByRole('button', { name: 'Ajuster' }).click();
    expect(await tousNoeudsDansZone(page, noeuds)).toBe(true);
  });

  test('glisser a la souris dans la zone deplace le rendu dans le sens du glisser', async ({ page }) => {
    const { noeuds, aretes } = donneesGrandProjet();
    await preparer(page, { reponsesParProjet: { 'NPD.Grand': { noeuds, aretes } } });
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Grand');

    const noeud = page.locator(selecteurNoeud(noeuds[0].uuid));
    await expect(noeud).toBeVisible();
    const avant = await noeud.boundingBox();
    const zone = await page.locator('#graphe-svg').boundingBox();
    const cx = zone.x + zone.width / 2;
    const cy = zone.y + zone.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 80, cy + 40, { steps: 10 });
    await page.mouse.up();

    const apres = await noeud.boundingBox();
    expect(apres.x - avant.x).toBeGreaterThan(20);
    expect(apres.y - avant.y).toBeGreaterThan(10);
  });

  test('la molette dans la zone zoome sans faire defiler la page', async ({ page }) => {
    const { noeuds, aretes } = donneesGrandProjet();
    await preparer(page, { reponsesParProjet: { 'NPD.Grand': { noeuds, aretes } } });
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Grand');
    await expect(page.locator(selecteurNoeud(noeuds[0].uuid))).toBeVisible();

    const zone = await page.locator('#graphe-svg').boundingBox();
    const avantScroll = await page.evaluate(() => window.scrollY);
    await page.mouse.move(zone.x + zone.width / 2, zone.y + zone.height / 2);
    await page.mouse.wheel(0, -200);
    const apresScroll = await page.evaluate(() => window.scrollY);
    expect(apresScroll).toBe(avantScroll);
  });
});

test.describe('graphe.html — ajustement automatique de la vue', () => {

  test('a l\'ouverture, la vue est deja ajustee', async ({ page }) => {
    const { noeuds, aretes } = donneesGrandProjet();
    await preparer(page, { reponsesParProjet: { 'NPD.Grand': { noeuds, aretes } } });
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Grand');
    await expect(page.locator(selecteurNoeud(noeuds[0].uuid))).toBeVisible();

    expect(await tousNoeudsDansZone(page, noeuds)).toBe(true);
  });

  test('apres changement de projet, la vue est reajustee automatiquement', async ({ page }) => {
    const grand = donneesGrandProjet();
    const petit = donneesOrion();
    await preparer(page, {
      reponsesParProjet: { 'NPD.Grand': grand, 'NPD.Orion': petit },
    });
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Grand');
    await expect(page.locator(selecteurNoeud(grand.noeuds[0].uuid))).toBeVisible();

    // Casse l'ajustement courant avant de changer de projet, pour prouver
    // que le reajustement vient bien du changement, pas d'un etat deja bon.
    const boutonZoomAvant = page.getByRole('button', { name: 'Zoom avant' });
    for (let i = 0; i < 8; i++) {
      await boutonZoomAvant.click();
    }

    await choisirProjet(page, 'NPD.Orion');
    await expect(page.locator(selecteurNoeud(petit.noeuds[0].uuid))).toBeVisible();
    expect(await tousNoeudsDansZone(page, petit.noeuds)).toBe(true);
  });
});

/**
 * Defaut constate le 23/09 : dans une petite fenetre, la zone #graphe-svg
 * tombait a 0 px de haut. svg-pan-zoom levait alors "matrix not invertible",
 * et changer de projet ensuite ne redessinait plus rien (l'exception coupait
 * le rendu en cours de route). Nouvelle regle : #graphe-svg garde une
 * hauteur minimale de 320 px ; quand la fenetre est trop basse pour tenir la
 * nav + le cadre a cote de cette hauteur minimale, c'est la PAGE qui defile
 * verticalement (la regle "pas de defilement vertical" du test des marges ne
 * vaut que pour une fenetre assez haute, cf. plus haut : ce test-la reste
 * inchange car il utilise 900 et 700 px, tous deux >= 700).
 */
test.describe('graphe.html — fenetre basse : hauteur minimale et redessin', () => {

  test('a 375x500, la zone garde >= 320px de haut, les noeuds sont rendus, et changer de projet redessine sans erreur', async ({ page }) => {
    const erreursPage = [];
    page.on('pageerror', e => erreursPage.push(e));

    const orion = donneesOrion();
    const triton = {
      noeuds: [{
        uuid: 'cccc5555-0000-0000-0000-000000000005',
        description: 'Tache du projet Triton',
        project: 'NPD.Triton',
        estTime: null, due: null, externe: false, fige: false, dans_projet: true,
      }],
      aretes: [],
    };
    const appels = await preparer(page, {
      reponsesParProjet: { 'NPD.Orion': orion, 'NPD.Triton': triton },
    });
    await page.setViewportSize({ width: 375, height: 500 });
    await page.goto('/graphe.html');

    await choisirProjet(page, 'NPD.Orion');
    await expect(page.locator(selecteurNoeud(orion.noeuds[0].uuid))).toBeVisible();
    const zone = await page.locator('#graphe-svg').boundingBox();
    expect(zone).not.toBeNull();
    expect(zone.height).toBeGreaterThanOrEqual(320);

    // Changer de projet a cette taille : nouvel appel /api/graphe avec le
    // nouveau projet, ses noeuds affiches, les anciens disparus.
    const appelsTritonAvant = appels.filter(p => p === 'NPD.Triton').length;
    await choisirProjet(page, 'NPD.Triton');
    await expect.poll(() => appels.filter(p => p === 'NPD.Triton').length)
      .toBeGreaterThan(appelsTritonAvant);
    await expect(page.locator(selecteurNoeud('cccc5555-0000-0000-0000-000000000005'))).toBeVisible();
    await expect(page.locator(selecteurNoeud(orion.noeuds[0].uuid))).toHaveCount(0);

    expect(erreursPage.map(e => e.message)).toEqual([]);
  });
});

test.describe('graphe.html — absence d\'erreur de page non capturee', () => {

  test('a 1400x900, aucune erreur de page a l\'ouverture puis sur deux changements de projet', async ({ page }) => {
    const erreursPage = [];
    page.on('pageerror', e => erreursPage.push(e));

    const orion = donneesOrion();
    const triton = {
      noeuds: [{
        uuid: 'cccc5555-0000-0000-0000-000000000005',
        description: 'Tache du projet Triton',
        project: 'NPD.Triton',
        estTime: null, due: null, externe: false, fige: false, dans_projet: true,
      }],
      aretes: [],
    };
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': orion, 'NPD.Triton': triton } });
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/graphe.html');

    await choisirProjet(page, 'NPD.Orion');
    await expect(page.locator(selecteurNoeud(orion.noeuds[0].uuid))).toBeVisible();
    await choisirProjet(page, 'NPD.Triton');
    await expect(page.locator(selecteurNoeud('cccc5555-0000-0000-0000-000000000005'))).toBeVisible();
    await choisirProjet(page, 'NPD.Orion');
    await expect(page.locator(selecteurNoeud(orion.noeuds[0].uuid))).toBeVisible();

    expect(erreursPage.map(e => e.message)).toEqual([]);
  });
});
