#!/usr/bin/env python3
"""Integrite des sources : marqueurs de conflit et commentaires CSS.

Ces controles ne regardent pas le comportement du code mais la forme des
fichiers. Ils existent a cause d'un cas reel : le 2026-03-28, le commit 11566aa
a laisse deux marqueurs de conflit et quatre `/*` manges dans
`calendar-planner.css`. Le bloc `:root` s'est retrouve avale par le parseur, et
les 67 `var(--...)` du fichier n'ont plus rien resolu -- pendant six mois.

Personne ne l'a vu parce qu'une erreur de syntaxe CSS ne leve pas : le
navigateur se resynchronise en silence en jetant ce qu'il ne comprend pas.
Console vide, tests verts, page qui s'affiche, juste degradee.

Un test de bout en bout ne peut pas couvrir ca : il ne verifie que la page
qu'il visite, et que les regles qu'il observe. Ces controles-ci portent sur
*tous* les fichiers du depot, JavaScript et HTML compris, ou un marqueur
provoquerait une erreur de syntaxe et une page blanche.
"""

import os
import subprocess

import pytest

RACINE = os.path.dirname(os.path.abspath(__file__))

# Construits plutot qu'ecrits : ce fichier est lui-meme analyse, et des
# marqueurs litteraux le feraient echouer sur son propre contenu.
MARQUEURS = ('<' * 7, '=' * 7, '>' * 7)

# Extensions traitees comme du texte. Volontairement restrictif : mieux vaut
# oublier un format que de tenter de decoder un binaire.
EXTENSIONS = {
    '.py', '.js', '.css', '.html', '.json', '.md', '.txt',
    '.yml', '.yaml', '.sh', '.ps1', '.svg',
}

EXCLUS = {'venv', 'node_modules', '.git', 'test-results', 'playwright-report'}


def _fichiers_suivis():
    """Chemins suivis par git, avec repli sur un parcours du disque."""
    try:
        sortie = subprocess.run(
            ['git', 'ls-files', '-z'],
            cwd=RACINE, capture_output=True, text=True, timeout=30,
        )
        if sortie.returncode == 0:
            noms = [n for n in sortie.stdout.split('\0') if n]
            if noms:
                return [os.path.join(RACINE, n) for n in noms]
    except (OSError, subprocess.SubprocessError):
        pass

    # Repli : git indisponible (archive sans historique, par exemple).
    trouves = []
    for dossier, sous, fichiers in os.walk(RACINE):
        sous[:] = [d for d in sous if d not in EXCLUS]
        trouves.extend(os.path.join(dossier, f) for f in fichiers)
    return trouves


def _fichiers_texte(extensions=None):
    voulues = extensions or EXTENSIONS
    return [
        chemin for chemin in _fichiers_suivis()
        if os.path.splitext(chemin)[1].lower() in voulues
        and os.path.isfile(chemin)
    ]


def _lire(chemin):
    with open(chemin, encoding='utf-8', errors='replace') as handle:
        return handle.read()


def _relatif(chemin):
    return os.path.relpath(chemin, RACINE).replace('\\', '/')


def test_l_inventaire_n_est_pas_vide():
    """Sans ce controle, un inventaire vide rendrait les autres tests creux.

    C'est le piege classique : si `git ls-files` echouait, les tests suivants
    passeraient au vert en n'analysant rien du tout.
    """
    fichiers = _fichiers_texte()
    assert len(fichiers) > 10, (
        "seulement %d fichier(s) texte trouve(s) : l'inventaire a echoue, "
        "les autres controles de ce module ne verifieraient rien" % len(fichiers)
    )
    assert any(c.endswith('.css') for c in fichiers), "aucune feuille de style trouvee"
    assert any(c.endswith('.js') for c in fichiers), "aucun fichier JavaScript trouve"


def test_aucun_marqueur_de_conflit():
    """Une resolution de conflit bâclee laisse des marqueurs en ligne seule."""
    coupables = []
    for chemin in _fichiers_texte():
        for numero, ligne in enumerate(_lire(chemin).split('\n'), start=1):
            if ligne.strip() in MARQUEURS:
                coupables.append('%s:%d : %s' % (_relatif(chemin), numero, ligne.strip()))

    assert not coupables, (
        "marqueur(s) de conflit non resolu(s) :\n  " + "\n  ".join(coupables)
    )


def _commentaires_orphelins(contenu):
    """Parcourt le texte et renvoie les delimiteurs de commentaire depareilles.

    Compter les `/*` et les `*/` ne suffit pas : c'est leur ordre qui compte,
    et c'est precisement un `*/` sans ouverture qui a casse la feuille du
    calendrier.
    """
    i, ligne = 0, 1
    ouvert_a = None
    anomalies = []
    while i < len(contenu):
        if contenu[i] == '\n':
            ligne += 1
            i += 1
        elif ouvert_a is None and contenu.startswith('/*', i):
            ouvert_a, i = ligne, i + 2
        elif ouvert_a is not None and contenu.startswith('*/', i):
            ouvert_a, i = None, i + 2
        elif ouvert_a is None and contenu.startswith('*/', i):
            anomalies.append("ligne %d : '*/' sans ouverture" % ligne)
            i += 2
        else:
            i += 1
    if ouvert_a is not None:
        anomalies.append("commentaire ouvert ligne %d jamais ferme" % ouvert_a)
    return anomalies


@pytest.mark.parametrize('feuille', sorted(_fichiers_texte({'.css'})), ids=_relatif)
def test_les_commentaires_css_sont_equilibres(feuille):
    """Un `*/` orphelin fait jeter au parseur les regles qui suivent.

    C'est ce qui a avale le bloc `:root` de calendar-planner.css : le navigateur
    n'a rien signale, et la page a simplement perdu ses couleurs.
    """
    anomalies = _commentaires_orphelins(_lire(feuille))
    assert not anomalies, (
        "%s : commentaire(s) mal formes :\n  %s"
        % (_relatif(feuille), "\n  ".join(anomalies))
    )
