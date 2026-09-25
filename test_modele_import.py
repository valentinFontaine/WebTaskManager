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
    assert len(resultat.taches) == 5
