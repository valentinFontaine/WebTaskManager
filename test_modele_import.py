#!/usr/bin/env python3
"""
Contrat de test pour le modele CSV telechargeable (spec import.html, point 7).

Route NON ECRITE a la date de ce fichier : ce test doit echouer avec un 404
(route ou fichier statique absent), pas avec une erreur d'import -- c'est le
seul rouge attendu avant implementation.

Contrat suppose :
    GET /modele-import.csv -> 200, Content-Type text/csv (ou commencant par
    text/csv, un ";charset=" eventuel etant tolere).

Le contenu doit etre un CSV valide au sens de import_csv.analyser : entete
    ref;description;projet;tags;estTime;due;scheduled;priorite;depend_de
et l'exemple devis/attente/choix/cde/plan (voir EXEMPLE_CSV dans
test_import_routes.py) -- 5 taches, 0 erreur. Le modele doit rester valide en
permanence : ce test sert de garde-fou si son contenu est modifie plus tard.
"""

import pytest
from fastapi.testclient import TestClient

import import_csv
from main_fastapi import app

client = TestClient(app)


def test_modele_200_content_type_csv():
    reponse = client.get("/modele-import.csv")
    assert reponse.status_code == 200, reponse.text
    content_type = reponse.headers.get("content-type", "")
    assert content_type.startswith("text/csv"), content_type


def test_modele_valide_par_analyser_0_erreur_5_taches():
    reponse = client.get("/modele-import.csv")
    assert reponse.status_code == 200, reponse.text

    resultat = import_csv.analyser(reponse.text, [])

    assert resultat.erreurs == []
    assert len(resultat.taches) >= 5


def test_modele_montre_une_tache_a_plusieurs_tags():
    """Le modele doit montrer, sur au moins une tache, comment ecrire plusieurs
    tags dans la cellule tags (ex. "pro,revue"), pas seulement un tag par ligne.
    """
    reponse = client.get("/modele-import.csv")
    assert reponse.status_code == 200, reponse.text

    # Verification sur le texte brut : une cellule de la colonne tags contient
    # une virgule (donc plusieurs tags), separement des cellules depend_de qui
    # peuvent elles aussi contenir des virgules.
    lignes = reponse.text.strip("\r\n").splitlines()
    entete = lignes[0].split(";")
    index_tags = entete.index("tags")
    cellules_tags = [ligne.split(";")[index_tags] for ligne in lignes[1:] if ligne.strip()]
    assert any("," in cellule for cellule in cellules_tags), cellules_tags

    resultat = import_csv.analyser(reponse.text, [])
    assert resultat.erreurs == []
    assert any(len(tache.get("tags", [])) >= 2 for tache in resultat.taches)
