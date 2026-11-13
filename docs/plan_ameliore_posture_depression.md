# Plan amélioré — Posture, mouvement et expressions comme indicateur de dépression

13 novembre 2026 · Revue et extension du « Plan de conception — Suivi de posture d'une personne ciblée (Jetson + laptop) »

## 1. Verdict en une page

Le plan d'origine est solide sur l'ingénierie (ONNX, deux piles de modèles, licences, identité par le visage, déploiement). Il a un défaut de fond : **l'objectif final, un indicateur de dépression, n'y figure nulle part.** Il n'y a ni vérité terrain, ni variables choisies pour leur lien avec la dépression, ni étape de validation. Tel quel, le projet produira des angles de posture fiables, mais aucun moyen de savoir s'ils disent quelque chose de l'humeur.

Les huit changements principaux :

1. **Ajouter une vérité terrain dès la phase 0.** Questionnaire PHQ-9 toutes les deux semaines, humeur quotidienne en deux questions, journal des facteurs de confusion. Sans cela, rien n'est validable.
2. **Passer de la posture statique au mouvement.** La littérature relie la dépression au ralentissement psychomoteur : vitesse de marche, amplitude des gestes, mobilité du tronc et de la tête, plus qu'à un angle de cou.
3. **Ajouter une tâche standardisée quotidienne de 60 secondes.** Se lever, marcher 3 m, revenir, s'asseoir, puis 30 secondes face à la caméra. C'est ce qui rend les jours comparables.
4. **Monter la cadence par rafales.** 5 à 10 images par seconde suffisent pour la posture assise, pas pour la marche ni pour le visage. Viser 25 à 30 images par seconde pendant la tâche standardisée et les séquences de marche.
5. **Recentrer le module visage sur la dynamique d'expressivité.** Fréquence et durée des sourires, mobilité de la tête, ouverture des yeux. L'étiquette « joie / tristesse » apporte peu et coûte cher en droit.
6. **Valider en deux temps.** D'abord la fiabilité de la mesure (une personne, POC), ensuite le lien avec la dépression (cohorte avec des scores PHQ-9 variés). Une seule personne ne peut pas valider un indicateur de dépression.
7. **Nommer honnêtement la sortie.** « Indice d'activité psychomotrice et d'expressivité, relatif à la ligne de base de la personne », jamais « score de dépression » ni diagnostic.
8. **Traiter le changement de statut réglementaire.** Viser la dépression fait basculer le projet vers les données de santé, potentiellement le dispositif médical et la recherche sur la personne humaine.

## 2. Ce que dit la littérature, et ce qu'elle ne dit pas

| Signal | Ce qui est établi | Limite | Source |
| --- | --- | --- | --- |
| Posture, équilibre, marche | Une revue systématique de 33 études associe la dépression de l'adulte à des altérations de la posture, de l'équilibre et de la marche | Qualité des études jugée faible à moyenne. Chez les personnes âgées, maladies physiques et cognition se mêlent à l'humeur | [Belvederi Murri et al., 2020](https://iris.unimore.it/handle/11380/1208435) |
| Marche en vidéo monoculaire | 83,3 % d'exactitude pour détecter le ralentissement psychomoteur et R² de 0,64 sur la sévérité (échelle de Hamilton) | 42 patients hospitalisés seulement, tâche standardisée de type « lever-marcher », reconstruction 3D du corps | [Boutaleb et al., 2026](https://arxiv.org/abs/2601.19526) |
| Visage en conditions naturelles | Ouverture des yeux, gestes de la tête, sourire et quelques unités d'action signalent les épisodes dépressifs (AUROC 81 %), erreur moyenne de 3,08 points sur le PHQ-9 | Capture par smartphone, visage proche et de face, pas par webcam à 3 m | [FacePsy, Stevens Institute](https://neurosciencenews.com/ai-depression-facial-cue-eyes-27735/) |
| Visage en entretien clinique | 79 % d'exactitude avec une analyse automatique du visage, 88 % avec un codage manuel | Échantillon clinique en entretien structuré, pas en vie quotidienne | [Cohn et al.](https://www3.cs.stonybrook.edu/~minhhoai/papers/acii-paper_final.pdf) |
| Phénotypage numérique en général | Le PHQ-9 est la mesure de référence la plus utilisée ; activité physique et sommeil sont les paramètres les plus fréquents | La plupart des études se reproduisent mal et manquent les événements cliniquement utiles | [JMIR mHealth, 2026](https://mhealth.jmir.org/2026/1/e70840/PDF), [npj Digital Medicine, 2024](https://medrxiv.org/content/10.1101/2022.10.12.22281007v3.full.pdf) |

Trois conséquences pour la conception :

- **Les bons résultats viennent de tâches standardisées**, pas d'une observation passive de la vie quotidienne. D'où la tâche quotidienne de 60 secondes.
- **Les effectifs publiés sont petits.** Un résultat sur 42 patients hospitalisés ne se transpose pas à une personne à domicile avec une dépression légère.
- **Le suivi d'une personne par rapport à elle-même est plus réaliste que le dépistage.** Détecter un changement chez une personne connue est plus accessible que classer un inconnu.

Ce que l'indicateur ne pourra pas faire : poser un diagnostic, distinguer la dépression de la fatigue, de la douleur, d'une grippe, d'un effet de médicament ou d'une maladie neurologique. Il peut au mieux signaler un changement à explorer.

## 3. Faiblesses du plan d'origine

| # | Constat | Correction |
| --- | --- | --- |
| 1 | L'objectif « dépression » est absent | Section 4 : définir la cible, la sortie et la vérité terrain |
| 2 | Indicateurs uniquement statiques (4 angles et l'activité) | Section 5 : ajout des variables de mouvement et de rythme |
| 3 | 17 points COCO : pas de pieds, visage sommaire | Squelette à 26 points (pieds) ou corps entier à 133 points, licence et données à vérifier |
| 4 | 5 à 10 images par seconde | Deux régimes : 10 en continu, 25 à 30 en rafale |
| 5 | Module d'émotions centré sur des catégories | Dynamique d'expressivité de niveau 1, catégories en option |
| 6 | Critères de réussite purement techniques (erreur d'angle, débit) | Critères de fiabilité test-retest, puis de validité face au PHQ-9 |
| 7 | Capture passive seule, situations non comparables | Tâche standardisée quotidienne |
| 8 | « Aucun sous-traitant cloud en production » contredit par la synchronisation des mesures vers le VPS | Les mesures deviennent des données de santé : chiffrement de bout en bout ou pas de synchronisation |
| 9 | Aucune gestion des facteurs de confusion | Journal quotidien et variables de contrôle |
| 10 | Aucun protocole de sécurité pour la personne suivie | Section 9 |
| 11 | Revue juridique repoussée à la commercialisation | Qualification à faire avant la collecte sur cohorte |
| 12 | Ligne de base d'une semaine | Quatre semaines au minimum, avec effet du jour de la semaine |

## 4. Définir la cible

### 4.1 Ce que l'on cherche à estimer

- **Cible primaire.** Le changement du score PHQ-9 d'une personne par rapport à sa propre ligne de base.
- **Cible secondaire.** L'humeur quotidienne déclarée (échelle de 0 à 10).
- **Cible exploratoire.** Le ralentissement psychomoteur seul, plus proche de ce que la caméra voit réellement.

### 4.2 Vérité terrain à collecter

| Mesure | Fréquence | Durée | Rôle |
| --- | --- | --- | --- |
| PHQ-9 | Toutes les 2 semaines (sa période de référence) | 3 min | Cible primaire |
| Humeur et énergie, 2 curseurs | Chaque soir | 20 s | Cible secondaire, résolution quotidienne |
| Sommeil : heure de coucher, de lever, qualité | Chaque matin | 20 s | Facteur de confusion et covariable |
| Journal : maladie, douleur, alcool, sport, médicament, télétravail, événement marquant | Chaque soir, cases à cocher | 30 s | Facteurs de confusion |
| Échelle remplie par un clinicien (Hamilton ou MADRS) | Début et fin, cohorte uniquement | 20 min | Référence indépendante de l'auto-déclaration |

Les conditions d'utilisation du PHQ-9 et de sa traduction française validée sont à vérifier avant usage.

### 4.3 Forme de la sortie

- Un indice continu, exprimé en écart à la ligne de base de la personne, avec un intervalle d'incertitude.
- Trois sous-indices lisibles séparément : mouvement, posture, expressivité.
- Un indicateur de couverture : part de la journée réellement mesurée. Pas d'indice si la couverture est trop faible.
- Aucune étiquette « déprimé / non déprimé » en phase POC.

## 5. Variables à extraire

### 5.1 Mouvement et psychomotricité (priorité 1)

| Variable | Calcul | Source |
| --- | --- | --- |
| Vitesse de marche | Déplacement du bassin en m/s, après calibration du sol | Tâche standardisée, marche spontanée |
| Longueur et cadence des pas | Détection des appuis par les points des pieds | Tâche standardisée |
| Balancement des bras | Amplitude angulaire épaule–poignet pendant la marche | Tâche standardisée |
| Durée du lever de chaise | Temps entre assis stable et debout stable | Tâche standardisée, transitions spontanées |
| Durée du demi-tour | Temps de rotation du tronc de 180° | Tâche standardisée |
| Quantité de mouvement | Énergie cinétique approchée des points clés, par minute | Continu |
| Micro-mouvements assis | Variance des points du haut du corps hors déplacements | Continu |
| Mobilité de la tête | Vitesse et amplitude angulaires de la tête | Continu et face caméra |
| Temps sédentaire, nombre de transitions | Durées par activité, comptage assis ↔ debout | Continu |
| Rythme de la journée | Heure de première apparition, répartition horaire de l'activité | Continu |

### 5.2 Posture (priorité 2)

Les quatre angles du plan d'origine sont conservés. S'y ajoutent :

- Affaissement : rapport entre la hauteur épaules–hanches et la longueur du tronc au repos de référence.
- Inclinaison de la tête vers le bas (tangage), mesurée par les repères du visage quand il est visible.
- Variabilité posturale : nombre de changements de posture par heure assise.
- Part du temps passée dans chaque classe de posture, plutôt que la seule médiane.

### 5.3 Expressivité du visage (priorité 2, niveau 1 du plan d'origine)

- Sourires : fréquence par heure de visage visible, durée, intensité, part des sourires avec plissement des yeux.
- Froncement des sourcils et abaissement des coins de la bouche : part du temps.
- Expressivité globale : variance des coefficients d'expression sur des fenêtres de 10 secondes.
- Ouverture des yeux et fréquence des clignements (nécessite 25 à 30 images par seconde).
- Direction du regard et de la tête vers le bas : part du temps.

Le niveau 2 (émotion déduite) reste une sortie optionnelle. Il n'entre pas dans l'indice tant que le niveau 1 n'a pas montré sa valeur.

### 5.4 Contexte et qualité

- Présence d'autres personnes dans le champ (compte seulement, aucune identité).
- Luminosité de la scène, distance de la cible, orientation du corps.
- Score de confiance moyen des points clés, part d'images rejetées.
- Type de journée déduit du journal : travail, repos, malade.

## 6. Architecture révisée

### 6.1 Deux modes de capture

| | Mode continu | Mode tâche standardisée |
| --- | --- | --- |
| Déclenchement | Permanent quand la cible est verrouillée | Une fois par jour, à heure fixe, lancé par la personne |
| Cadence | 10 images par seconde | 25 à 30 images par seconde |
| Durée | Toute la journée | 60 à 90 secondes |
| Contenu | Vie quotidienne | Lever, marche de 3 m, demi-tour, retour, assise, 30 s face caméra |
| Variables | Quantité de mouvement, posture, rythme, sourires spontanés | Marche, lever de chaise, expressivité de face |
| Comparabilité entre jours | Faible, dépend de ce que fait la personne | Forte |

### 6.2 Briques ajoutées au pipeline

1. **Calibration du sol.** Une mire ou quatre points au sol mesurés une fois, pour convertir les pixels en mètres. Sans elle, pas de vitesse de marche.
2. **Squelette enrichi.** Points des pieds indispensables pour les pas. Modèle à 26 points ou corps entier ; licence du code et des données d'entraînement à vérifier comme pour le reste de la pile.
3. **Relèvement 3D (option, phase ultérieure).** L'étude de référence sur la marche reconstruit le corps en 3D. Les modèles de ce type sont souvent sous licence de recherche : à vérifier avant tout usage commercial. La deuxième caméra prévue en version 2 reste l'autre voie.
4. **Segmenteur d'épisodes.** Découpe le flux en épisodes : marche, lever, assise stable, face caméra. Les variables sont calculées par épisode, puis agrégées.
5. **Magasin de variables.** Table SQLite par épisode, puis table journalière. Schéma versionné, chaque ligne porte la version du modèle et de l'extracteur.
6. **Application de saisie.** Page web locale sur Wendy Net ou sur le laptop pour le PHQ-9, l'humeur et le journal. Stockée dans la même base, chiffrée.
7. **Module d'indice.** Normalisation par la ligne de base, combinaison, incertitude. Séparé du pipeline temps réel, exécuté une fois par jour.

### 6.3 Ce qui ne change pas

Identité par le visage et ses trois états, pile de modèles et licences, ONNX comme source unique, images Docker, rôle du VPS pour l'entraînement, absence de stockage vidéo en production.

Décision du 13 novembre 2026 : les points clés bruts ne sont pas conservés. Seuls les angles et grandeurs dérivées sont écrits (section 16). Contrepartie : un changement de formule ne peut pas être appliqué aux jours passés.

## 7. Feuille de route détaillée

Aucune phase ne commence avant que le critère de la précédente soit tenu.

### Phase 0 — Cadrage scientifique et éthique (2 à 3 semaines)

1. Rédiger en une phrase l'usage prévu : « suivre l'évolution d'indices psychomoteurs d'un adulte consentant, à domicile, par rapport à sa propre ligne de base ».
2. Lister ce que le système ne fait pas : diagnostic, dépistage de tiers, alerte automatique à un tiers.
3. Choisir les cibles (section 4.1) et les figer par écrit.
4. Écrire la liste des hypothèses avant de voir les données : par exemple « la vitesse de marche baisse quand le PHQ-9 monte ».
5. Limiter cette liste à 5 à 8 variables primaires ; les autres sont exploratoires.
6. Fixer les seuils de réussite de chaque phase (voir critères ci-dessous).
7. Vérifier les conditions d'usage du PHQ-9 et choisir sa version française validée.
8. Rédiger le consentement de la personne cible : visage, données de santé, questionnaires, durée de conservation, droit de retrait.
9. Rédiger l'information des autres occupants et des visiteurs.
10. Rédiger le protocole de sécurité (section 9).
11. Trouver un référent clinique (psychiatre ou psychologue) pour relire le protocole.
12. *(Reporté après le POC.)* Faire qualifier le projet par un juriste : données de santé, AI Act, dispositif médical, recherche sur la personne.
13. *(Reporté après le POC.)* Faire l'analyse d'impact sur la protection des données.
14. Décider du sort des mesures sur le VPS : chiffrement côté laptop ou pas de synchronisation.
15. Ouvrir le dépôt, y pousser le dossier jetson/vision et ce plan.

**Critère de passage :** protocole écrit, consentements signés, hypothèses datées dans le dépôt.

### Phase 1 — Démo du pipeline (2 à 3 semaines)

16. Monter le pipeline du plan d'origine avec la pile démo, dans Docker sur le laptop.
17. Enrôler la personne cible : 10 à 20 empreintes de visage.
18. Mesurer le débit réel à 10 et à 30 images par seconde.
19. Mesurer le taux d'erreur d'identité sur une séquence avec deux ou trois personnes.
20. Ajouter le squelette avec les pieds et vérifier la détection des appuis à l'œil.
21. Calibrer le sol et vérifier une distance connue à 5 % près.
22. Écrire la table SQLite par image, puis par épisode.
23. Implémenter le filtrage, le lissage One-Euro et la classification de situation.
24. Implémenter le contrôle quotidien de l'arrière-plan.
25. Enregistrer trois séquences de référence pour les tests automatiques.

**Critère de passage :** identité correcte sur les séquences de test, 30 images par seconde tenues pendant 90 secondes.

### Phase 2 — Extraction des variables (3 à 4 semaines)

26. Écrire le segmenteur d'épisodes : marche, lever, assise, face caméra.
27. Implémenter les variables de marche : vitesse, cadence, longueur de pas, balancement des bras.
28. Implémenter le lever de chaise et le demi-tour.
29. Implémenter la quantité de mouvement et les micro-mouvements assis.
30. Implémenter les variables de posture étendues (section 5.2).
31. Intégrer MediaPipe Face Landmarker et extraire les coefficients d'expression.
32. Implémenter les variables d'expressivité (section 5.3).
33. Implémenter les variables de rythme et de contexte.
34. Écrire un test unitaire par variable, sur des données synthétiques au résultat connu.
35. Définir le protocole de la tâche standardisée : marques au sol, chaise fixe, consigne écrite.
36. Écrire l'interface qui guide la tâche et vérifie qu'elle est complète.
37. Écrire l'application de saisie des questionnaires.
38. Écrire l'agrégation journalière et l'indicateur de couverture.
39. Documenter chaque variable : définition, unité, conditions de validité.

**Critère de passage :** toutes les variables primaires calculées de bout en bout sur une journée réelle.

### Phase 3 — Fiabilité de la mesure (3 à 4 semaines)

C'est la phase qui manque le plus au plan d'origine : savoir si l'instrument mesure la même chose deux fois.

40. Comparer la vitesse de marche à un chronomètre sur 20 passages.
41. Comparer les angles à un goniomètre ou à une seconde caméra sur un sous-ensemble.
42. Répéter la tâche standardisée 5 fois le même jour : calculer la variabilité intra-jour.
43. Répéter sur 10 jours stables : calculer la corrélation intra-classe de chaque variable.
44. Calculer le plus petit changement détectable de chaque variable.
45. Tester la sensibilité : marche volontairement lente, posture volontairement affaissée, visage neutre contre expressif.
46. Tester la robustesse : éclairage du soir, vêtements amples, lunettes, léger déplacement de la caméra.
47. Tester à 2 m, 3 m et 4 m ; fixer la distance maximale utile pour le visage.
48. Écarter les variables dont la fiabilité est insuffisante (corrélation intra-classe sous 0,7 par exemple).
49. Geler la version 1 de l'extracteur et la liste des variables retenues.

**Critère de passage :** au moins cinq variables fiables, dont deux de mouvement, avec leur plus petit changement détectable connu.

### Phase 4 — Données et fine-tuning des modèles (6 à 9 semaines, en parallèle de la phase 3)

50. Reprendre les huit étapes du plan d'origine : collecter, annoter, découper, entraîner, évaluer, exporter, calibrer, boucler.
51. Ajouter à la collecte des séquences de marche et de lever de chaise, pas seulement des postures.
52. Annoter les pieds en plus des 17 points.
53. Ajouter au jeu de test des critères sur les variables finales : erreur sur la vitesse de marche, pas seulement sur les points clés.
54. Diversifier les volontaires : âge, sexe, morphologie, couleur de peau, lunettes, barbe.
55. Rejouer la phase 3 avec la pile commerciale et vérifier que la fiabilité est conservée.

**Critère de passage :** pile commerciale au moins aussi fiable que la pile démo sur les variables retenues.

### Phase 5 — Pilote sur une personne (8 à 12 semaines)

56. Quatre semaines de ligne de base : capture continue, tâche quotidienne, questionnaires.
57. Vérifier chaque semaine l'observance : tâches faites, questionnaires remplis, couverture.
58. Calculer la ligne de base par jour de la semaine et par type de journée.
59. Poursuivre 4 à 8 semaines de suivi.
60. Calculer les corrélations intra-personne entre variables et humeur quotidienne.
61. Corriger pour les comparaisons multiples et l'autocorrélation des séries.
62. Comparer à un modèle de référence simple : l'humeur d'hier prédit l'humeur d'aujourd'hui.
63. Vérifier chaque facteur de confusion du journal : la variable bouge-t-elle les jours de maladie, de mauvais sommeil ?
64. Recueillir le ressenti de la personne : gêne, changement de comportement dû à la caméra.
65. Rédiger un rapport de pilote, résultats négatifs compris.

**Critère de passage :** mesure stable sur la durée, observance supérieure à 80 %. Ce pilote établit la faisabilité, pas la validité : une personne, surtout si son humeur varie peu, ne prouve rien sur la dépression.

### Phase 6 — Étude de validation sur cohorte (6 à 12 mois)

66. Obtenir l'avis du comité d'éthique compétent avant tout recrutement.
67. Calculer l'effectif avec un statisticien ; ordre de grandeur de départ : 40 à 80 personnes, dont au moins la moitié avec des symptômes dépressifs.
68. Recruter avec un partenaire clinique.
69. Définir les critères d'exclusion : troubles neurologiques ou moteurs, par exemple.
70. Enregistrer les médicaments : plusieurs psychotropes modifient la motricité et l'expression.
71. Suivre chaque personne 8 à 12 semaines avec le même protocole.
72. Faire passer une échelle clinicien en début et en fin.
73. Enregistrer le plan d'analyse avant de lever l'aveugle sur les données.
74. Entraîner le modèle d'indice : régression régularisée d'abord, modèles plus riches seulement s'ils font mieux.
75. Valider par personne : aucune personne à la fois dans l'entraînement et dans le test.
76. Rapporter l'erreur sur le PHQ-9, la sensibilité au changement et la calibration de l'incertitude.
77. Comparer à deux références : la ligne de base seule, et l'humeur déclarée seule.
78. Analyser les performances par sous-groupe : âge, sexe, couleur de peau, traitement.
79. Analyser les faux positifs : quelles situations déclenchent l'indice sans dépression ?
80. Décider : poursuivre, restreindre l'usage au suivi intra-personne, ou arrêter.

**Critère de passage :** l'indice fait mieux que les deux références sur des personnes jamais vues, sans écart marqué entre sous-groupes.

### Phase 7 — Portage Jetson et produit (après validation)

81. Porter sur le Jetson : moteurs TensorRT, app WendyOS, test d'équivalence.
82. Vérifier que les variables, pas seulement les points clés, sont équivalentes entre laptop et Jetson.
83. Tenir les deux régimes de cadence sur le Jetson ; mesurer la mémoire.
84. Concevoir la restitution à la personne : tendances, incertitude, pas de chiffre anxiogène.
85. Brancher la sortie Arduino sur la posture seulement, jamais sur l'indice d'humeur.
86. Clore la qualification réglementaire et la revue des licences.
87. Mettre en place la surveillance après déploiement : dérive des variables, mises à jour de modèles, plaintes.

## 8. Analyse statistique et pièges

- **Fuite entre personnes.** Avec des mesures répétées, un découpage aléatoire par jour gonfle les résultats. Toujours découper par personne.
- **Comparaisons multiples.** Des dizaines de variables contre une cible : certaines corrèleront par hasard. D'où la liste courte d'hypothèses écrite à l'avance.
- **Autocorrélation.** L'humeur et le mouvement d'un jour ressemblent à ceux de la veille. Utiliser des modèles mixtes ou des tests par permutation de blocs.
- **Effet de la caméra.** Se savoir filmé modifie le comportement, surtout les premières semaines. Écarter ou marquer la période d'habituation.
- **Biais de sélection de la couverture.** Les mauvais jours, la personne reste peut-être au lit, hors champ. L'absence est elle-même une information : la traiter comme variable, pas comme donnée manquante.
- **Dérive de l'instrument.** Caméra déplacée, mise à jour de modèle, changement de mobilier. Chaque rupture est journalisée et crée un nouveau segment de ligne de base.
- **Saisonnalité.** Lumière et vêtements changent avec la saison et affectent à la fois la mesure et l'humeur.
- **Sur-interprétation.** Une corrélation de 0,3 sur une personne est un signal de recherche, pas un indicateur utilisable.

## 9. Sécurité de la personne suivie

- **Pas de retour en temps réel de l'indice** à la personne pendant le pilote : il n'est pas validé et peut inquiéter à tort ou rassurer à tort.
- **Item 9 du PHQ-9** (idées suicidaires) : toute réponse positive affiche immédiatement des ressources d'aide et la consigne de contacter un professionnel. En France, le 3114 est le numéro national de prévention du suicide.
- **Seuil du PHQ-9** : au-delà d'un score défini avec le référent clinique, recommandation écrite de consulter.
- **Aucune alerte automatique à un tiers** (famille, employeur, assureur) sans accord explicite et révocable de la personne.
- **Droit de pause** : un bouton physique ou logiciel qui coupe la capture, sans justification.
- **Consentement réel.** Le système ne doit jamais servir à évaluer l'état mental de quelqu'un à son insu. L'enrôlement volontaire par le visage est à la fois une fonction technique et la garantie de ce principe.

## 10. Conformité : ce que l'objectif « dépression » change

Le plan d'origine traitait la posture et, en option, les émotions. Viser la dépression modifie quatre points. Je ne suis pas juriste : chacun est à faire trancher.

| Sujet | Ce qui change | Action |
| --- | --- | --- |
| Données de santé | Un indice lié à la dépression est une donnée de santé, pas seulement les « tendances de posture ». Les réponses au PHQ-9 aussi | Consentement explicite dédié, chiffrement, pas de synchronisation en clair vers le VPS |
| Dispositif médical | Le guide européen MDCG 2019-11 donne comme exemple de logiciel dispositif médical un logiciel qui calcule un score de dépression ; les applications de suivi de troubles comme la dépression peuvent être qualifiées ainsi. La finalité déclarée et les allégations commerciales sont déterminantes. Un logiciel qui influence un diagnostic relève en général au moins de la classe IIa | Rédiger la finalité avec soin. Documenter la décision de qualification, même si la réponse est « bien-être » ([OpenRegulatory](https://openregulatory.com/mdcg/mdcg-2019-11), [Sanolabs](https://www.sanolabs.eu/blog/wellness-app-vs-medical-device-eu-mdr/), [Mason Hayes & Curran](https://www.mhc.ie/latest/insights/is-your-mental-wellbeing-app-a-medical-device), [Osborne Clarke](https://www.osborneclarke.com/insights/eu-confirms-app-stores-and-developers-are-subject-medical-device-laws)) |
| AI Act | Un logiciel dispositif médical à base d'IA peut cumuler les obligations du règlement sur les dispositifs médicaux et celles des systèmes à haut risque. La frontière entre « état physique », « émotion » et « état de santé mentale » déduit du visage est incertaine | Question explicite au juriste, avant la phase 6 |
| Recherche sur la personne | Une étude sur cohorte avec questionnaires de santé mentale relève très probablement d'un comité d'éthique | Dépôt du protocole avant tout recrutement |

Deux positions de produit possibles, à choisir tôt car elles ne demandent pas les mêmes preuves :

- **Outil de bien-être.** « Suivez votre niveau d'activité et de posture. » Aucune mention de dépression, aucun score d'humeur. Plus simple, mais ce n'est plus l'objectif annoncé.
- **Outil de suivi clinique.** Indicateur de dépression assumé, utilisé avec un professionnel de santé. Demande la validation de la phase 6 et, probablement, le marquage de dispositif médical.

Présenter un produit comme du bien-être tout en vendant un indicateur de dépression est la position la plus risquée.

**Décision du 13 novembre 2026 : outil de suivi clinique.** Pendant le POC (phases 0 à 5), ce tableau n'entraîne aucune démarche : les étapes 12 et 13 de la phase 0 sont reportées. Il s'applique à partir de la phase 6, dont le comité d'éthique et le partenaire clinique sont les délais les plus longs.

## 11. Risques ajoutés

| Risque | Effet | Parade |
| --- | --- | --- |
| Aucun lien mesurable avec la dépression | Projet sans objet | Phases 3 et 5 peu coûteuses avant la cohorte ; critère d'arrêt écrit |
| Faux positif | Inquiétude, stigmatisation | Pas de restitution avant validation, incertitude affichée, jamais de diagnostic |
| Faux négatif | Fausse réassurance, retard de prise en charge | Mention permanente : l'outil ne remplace pas une évaluation clinique |
| Facteurs de confusion (fatigue, douleur, maladie, médicament) | Indice qui suit autre chose que l'humeur | Journal quotidien, analyse dédiée, exclusions en cohorte |
| Biais entre groupes | Indice moins fiable pour certaines personnes | Diversité de la cohorte, analyse par sous-groupe |
| Abandon de la tâche quotidienne | Perte des variables les plus fiables | Tâche de 60 secondes, rappel, repli sur les transitions spontanées |
| Usage détourné (surveillance d'un proche, d'un salarié) | Atteinte grave aux personnes, pratique interdite au travail | Enrôlement volontaire obligatoire, verrou par type de site, pas d'accès tiers par défaut |
| Fuite des données | Exposition d'un état de santé mentale | Chiffrement, minimisation, durée de conservation courte |
| Effet de la surveillance sur la personne | Anxiété, auto-surveillance excessive | Entretien régulier, droit de pause, arrêt sans condition |

## 12. Décisions à prendre maintenant

- [x] Position de produit : **suivi clinique** (décidé le 13 novembre 2026). Le volet réglementaire est reporté après le POC ; il redevient bloquant avant la phase 6.
- [x] Personne cible du pilote : Romain lui-même. Pas de référent clinique pendant le hackathon (étape 11 reportée).
- [x] Mode principal : **capture passive**, la personne vaque à ses occupations dans la pièce (section 17). La seule séquence standardisée est la **calibration initiale** (section 18), éventuellement refaite une fois par semaine sans que le système en dépende. La tâche quotidienne de la section 15 est abandonnée ; son protocole reste comme référence pour les calculs de marche.
- [x] Conservation : **angles et grandeurs dérivées, empreintes du visage enrôlé, scores d'expression et d'émotion**. Ni image, ni vidéo, ni points clés bruts. Schéma en section 16.
- [x] VPS : aucune mesure n'y est envoyée. Tout le traitement et toutes les données restent en local ; le VPS sert au développement et au lancement des entraînements Modal et Verda.
- [x] Cadre : hackathon, démonstration sans patient. Périmètre réduit en section 14.
- [ ] Partenaire clinique pour la phase 6 : à identifier dès la phase 0, c'est le délai le plus long.
- [ ] Critère d'arrêt : quel résultat de la phase 5 ferait renoncer à la phase 6 ?

## 13. Sources

Pages consultées le 13 novembre 2026. Les éléments techniques repris du plan d'origine gardent leurs sources d'origine.

- [Belvederi Murri et al., « Instrumental assessment of balance and gait in depression: A systematic review », Psychiatry Research, 2020](https://iris.unimore.it/handle/11380/1208435) : résumé
- [Boutaleb et al., « A Non-Invasive 3D Gait Analysis Framework for Quantifying Psychomotor Retardation in Major Depressive Disorder », 2026](https://arxiv.org/abs/2601.19526) : résumé et extraits
- [Neuroscience News, présentation de FacePsy et PupilSense (Stevens Institute of Technology)](https://neurosciencenews.com/ai-depression-facial-cue-eyes-27735/)
- [Cohn et al., « Detecting Depression from Facial Actions and Vocal Prosody »](https://www3.cs.stonybrook.edu/~minhhoai/papers/acii-paper_final.pdf)
- [Busshart et al., revue de cadrage sur le phénotypage numérique de la dépression, JMIR mHealth and uHealth, 2026](https://mhealth.jmir.org/2026/1/e70840/PDF)
- [Étude de phénotypage numérique et prédiction individualisée de l'humeur, npj Digital Medicine, 2024 (prépublication)](https://medrxiv.org/content/10.1101/2022.10.12.22281007v3.full.pdf)
- [OpenRegulatory, MDCG 2019-11 expliqué](https://openregulatory.com/mdcg/mdcg-2019-11)
- [Sanolabs, application de bien-être ou dispositif médical](https://www.sanolabs.eu/blog/wellness-app-vs-medical-device-eu-mdr/)
- [Mason Hayes & Curran, « Is your mental wellbeing app a medical device? »](https://www.mhc.ie/latest/insights/is-your-mental-wellbeing-app-a-medical-device)
- [Osborne Clarke, lignes directrices MDCG de 2025](https://www.osborneclarke.com/insights/eu-confirms-app-stores-and-developers-are-subject-medical-device-laws)

Les sources ont été lues dans les extraits du moteur de recherche, pas en texte intégral. Les ordres de grandeur d'effectifs, de durées et de seuils (corrélation intra-classe de 0,7, observance de 80 %, 40 à 80 participants) sont mes estimations de départ, à faire confirmer par un statisticien et un clinicien.

## 14. Cadrage hackathon

Décisions du 13 novembre 2026 : démonstration de faisabilité, sans patient, avec Romain comme personne cible, tout en local.

Ce que la démo montre : le système mesure de façon répétable les marqueurs de marche et de posture que la littérature associe à la dépression. Ce qu'elle ne montre pas : que ces marqueurs suivent l'humeur de quelqu'un. La formulation honnête pour le jury est « nous mesurons les marqueurs psychomoteurs décrits dans la littérature », pas « nous détectons la dépression ».

### Périmètre minimal

1. Pile démo sur le laptop, 1080p à 30 images par seconde pendant la tâche.
2. Enrôlement du visage et verrouillage de la cible (déjà prévu).
3. Calibration initiale guidée à l'écran (section 18), puis capture passive (section 17).
4. Six variables : vitesse, cadence, rebond vertical, inclinaison du tronc, balancement des bras, indice d'affaissement.
5. Base SQLite locale : une ligne par session.
6. Tableau de bord : session du jour comparée à la ligne de base personnelle.
7. Mode continu : angles de posture au fil de la journée, buzzer Arduino en option.
8. Émotions : expressions observables (niveau 1) et émotion déduite (niveau 2) de la personne cible, avec la pile démo, en mode continu et pendant l'étape 5 de la tâche.

### Démonstration de sensibilité

Sans patient, la seule preuve possible est le contraste joué :

- 5 sessions en marche habituelle, pour établir la ligne de base et la variabilité.
- 3 sessions en marche « ralentie et affaissée », jouées volontairement et étiquetées comme simulées.
- Le tableau de bord doit séparer nettement les deux groupes, au-delà de la variabilité des sessions normales.

Cette animation de référence aide à jouer le contraste : [BioMotion Lab, démonstration de la marche dépressive](http://biomotionlab.ca/Demos/BMLdepression.html) (lien cité par Adolph et al., non vérifié).

### Reporté après le hackathon

Fine-tuning, pile commerciale, PHQ-9, cohorte, portage Jetson, classifieur d'émotion entraîné sur données propres, tout le volet réglementaire.

## 15. Tâche standardisée quotidienne — protocole détaillé

> **Abandonnée comme routine quotidienne** (décision du 13 novembre 2026). Remplacée par la calibration de la section 18. Les définitions de variables ci-dessous restent valables pour les épisodes de marche spontanée.

### Pourquoi ces mesures

L'étude de référence (Michalak et al., 2009, capture de mouvement 3D) décrit la marche associée à la tristesse et à la dépression par cinq traits : vitesse réduite, balancement des bras réduit, mouvements verticaux de la tête réduits, balancement latéral du haut du corps accru, posture plus affaissée. Une étude en vie quotidienne (Adolph et al., 2021) retrouve la vitesse réduite, le rebond vertical réduit et la posture affaissée. L'idée de regarder l'axe vertical et l'affaissement correspond donc exactement aux marqueurs les mieux documentés.

Un point de vigilance : le rebond vertical dépend de la vitesse. Une marche plus lente rebondit moins, même sans changement d'humeur. Il faut toujours afficher les deux, et suivre aussi le rebond rapporté à la vitesse.

### Installation, une fois pour toutes

- Caméra fixe à environ 1,2 m de haut, horizontale, en 1080p à 30 images par seconde.
- Ligne de marche **parallèle au plan de l'image**, à 3 m de la caméra : la personne est vue de profil et garde la même taille à l'écran. Marcher vers la caméra fausserait la mesure verticale par effet de perspective.
- Repères au sol A et B, espacés de 3 m sur cette ligne (à 3 m, la C920 couvre environ 4 m de large). Repère C au milieu. Repère D à 1,5 m de la caméra, face à elle.
- Chaise sans accoudoirs sur le repère A, tournée vers B.
- Éclairage constant et suffisant ; exposition de la webcam fixée manuellement pour limiter le flou de mouvement.
- Calibration : debout bien droit sur C, de profil puis de face, 5 secondes. Elle donne la taille de la personne en pixels et sa posture de référence « redressée ».

Toutes les longueurs sont divisées par cette taille en pixels. Les variables sont donc sans unité et ne demandent pas de calibration du sol. La distance A–B connue (3 m) suffit à convertir la vitesse en m/s.

### Déroulé (environ 80 secondes)

| Étape | Durée | Consigne | Vue | Ce qu'on mesure |
| --- | --- | --- | --- | --- |
| 1. Assis | 5 s | Assis sur la chaise en A, comme d'habitude, sans se redresser exprès | Profil | Affaissement assis, flexion du cou |
| 2. Lever | 3 s | Au signal sonore, se lever sans les mains | Profil | Durée du lever |
| 3. Marche | 25 s | Six traversées A→B→A…, à l'allure habituelle, bras libres | Profil | Vitesse, cadence, rebond vertical, inclinaison du tronc, tête, bras |
| 4. Debout | 10 s | S'arrêter en C, face à la caméra, immobile | Face | Asymétrie des épaules, inclinaison latérale de la tête, oscillation |
| 5. Visage | 20 s | Avancer en D, regarder la caméra, lire à voix haute une phrase neutre affichée | Face, à 1,5 m | Expressivité, inclinaison de la tête, ouverture des yeux |
| 6. Humeur | 15 s | Deux curseurs à l'écran : humeur et énergie, de 0 à 10 | — | Étiquette du jour |

Règles de comparabilité : même heure chaque jour, mêmes chaussures ou pieds nus, rien dans les mains, pas de téléphone, consigne identique. Une session incomplète ou perturbée est marquée et exclue.

### Calcul des variables

On garde les **2 m centraux** de chaque traversée et on écarte les démarrages et les demi-tours. Six traversées donnent environ 15 à 18 pas utiles.

| Variable | Calcul | Sens attendu si ralentissement |
| --- | --- | --- |
| Vitesse | Déplacement horizontal du milieu des hanches sur les 2 m centraux, divisé par le temps | Baisse |
| Cadence | Fréquence dominante du signal vertical du milieu des hanches (un cycle par pas) ; aucun point de pied n'est nécessaire | Baisse |
| Longueur de pas | Vitesse divisée par cadence | Baisse |
| Rebond vertical | Signal vertical du milieu des hanches, tendance retirée ; amplitude crête à crête médiane par pas, divisée par la taille. Même calcul sur la tête | Baisse |
| Rebond rapporté à la vitesse | Rebond divisé par la longueur de pas | Baisse, indépendamment de la vitesse |
| Inclinaison du tronc | Angle moyen entre la verticale et le segment milieu des hanches → milieu des épaules | Hausse (penché en avant) |
| Tête en avant | Angle moyen entre la verticale et le segment épaule → oreille | Hausse |
| Balancement des bras | Amplitude de l'angle épaule → poignet par rapport au tronc, médiane par cycle | Baisse |
| Indice d'affaissement | Distance verticale épaules–hanches divisée par la même distance en posture de référence redressée ; assis (étape 1) et debout (étape 4) | Baisse sous 1 |
| Balancement latéral | Étape 4 seulement : écart-type de la position horizontale du milieu des épaules, divisé par la largeur des épaules | Hausse |

Ordre de grandeur pour vérifier que le signal est mesurable : le rebond vertical d'une marche normale est de quelques centimètres, soit une vingtaine de pixels à 3 m en 1080p, pour un tremblement des points clés de 3 à 4 pixels. C'est mesurable après lissage, mais sans grande marge : c'est mon estimation, à confirmer dès la première session. Si le signal est trop bruité, utiliser le centre de la boîte englobante du torse, plus stable qu'un point isolé.

### Contrôles de qualité par session

- Cible verrouillée par le visage avant l'étape 1.
- Au moins 12 pas utiles et confiance moyenne des points clés au-dessus du seuil.
- Trajectoire restée sur la ligne A–B (taille apparente stable à 5 % près).
- Débit réel d'au moins 25 images par seconde.

### Limites à garder en tête

- **Sujet et concepteur confondus.** Connaître l'hypothèse suffit à modifier sa marche. Acceptable pour une démo, pas pour une preuve.
- **Balancement latéral en marche non mesuré.** Il demande une marche vers la caméra ou une seconde caméra ; l'étape 4 n'en donne qu'un substitut debout.
- **Une caméra, donc 2D.** Une rotation du tronc ou un pas hors de la ligne se lit comme un changement d'angle.

### Sources ajoutées

- [Michalak et al., « Embodiment of Sadness and Depression — Gait Patterns Associated With Dysphoric Mood », Psychosomatic Medicine, 2009](https://mediatum.ub.tum.de/977218) : résumé
- [Adolph et al., « Gait Patterns and Mood in Everyday Life », Cognitive Therapy and Research, 2021](https://link.springer.com/article/10.1007/s10608-021-10215-7)

## 16. Suivi continu : évolution dans la journée et au fil du temps

Deux lectures complètent la tâche standardisée : comment la posture et les expressions évoluent du matin au soir, et comment elles évoluent de jour en jour. Seules des mesures agrégées sont conservées, plus les empreintes du visage enrôlé.

### Ce qui est conservé

Les points clés sont calculés en mémoire, convertis en angles, puis jetés. Le disque ne reçoit qu'une ligne par minute.

| Table | Une ligne par | Colonnes |
| --- | --- | --- |
| `minute` | Minute où la cible est verrouillée | Horodatage, activité (assis, debout, marche), orientation (face, profil, dos), nombre d'images valides, et pour chaque angle : médiane, 10e et 90e percentiles |
| `visage_minute` | Minute où le visage de la cible est exploitable | Horodatage, nombre d'images valides, moyenne et écart-type des coefficients d'expression retenus (sourire, froncement, coins de la bouche, ouverture des yeux), angle de tangage de la tête, part du temps par catégorie d'émotion, valence et activation moyennes |
| `galerie` | Empreinte du visage enrôlé | Vecteur d'empreinte chiffré, date, type (enrôlement ou adaptative). Aucune photo |
| `identite` | Changement d'état | Horodatage, état (recherche, verrouillé, perdu), score de correspondance |
| `session` | Tâche standardisée | Date, vitesse, cadence, longueur de pas, rebond, angles moyens de marche, indices d'affaissement, humeur, énergie, drapeau « simulée », drapeau de qualité |
| `jour` | Jour | Agrégats journaliers, couverture, drapeau « cadrage modifié » |
| `config` | Changement | Version de l'extracteur, calibration, position de la caméra |

Angles suivis en continu : flexion du cou, inclinaison du tronc, asymétrie des épaules, inclinaison latérale de la tête, plus l'indice d'affaissement (un rapport, pas un angle). Environ 1 000 lignes par jour : quelques mégaoctets par an.

Les empreintes des autres personnes sont comparées en mémoire puis jetées, comme dans le plan d'origine. Les empreintes de la cible sont la seule donnée biométrique sur le disque : elles ne permettent pas de reconstituer une photo exploitable à l'œil, mais elles identifient la personne, donc base chiffrée et suppression en une commande.

Une minute n'est écrite que si elle contient assez d'images valides. Un angle n'est renseigné que dans l'orientation où il est valide (tableau du plan d'origine) ; sinon la case reste vide.

### Évolution dans la journée

| Indicateur | Calcul | Lecture |
| --- | --- | --- |
| Courbe horaire | Médiane de chaque angle par tranche de 30 minutes, en position assise | Forme de la journée |
| Dérive journalière | Pente de la flexion du cou et de l'indice d'affaissement entre la première et la dernière heure assise | Affaissement progressif au fil des heures |
| Écart matin–soir | Médiane des 2 dernières heures moins médiane des 2 premières | Un seul chiffre par jour, facile à suivre |
| Dérive par séance assise | Pente de l'affaissement depuis le début de chaque période assise continue | Fatigue posturale, remise à zéro après une pause |
| Durée assise continue | Temps depuis le dernier lever | Contexte de la dérive |
| Variabilité posturale | Nombre de changements de posture par heure assise | Immobilité ou agitation |
| Temps hors seuil | Part des minutes au-delà du seuil d'alerte | Alimente le buzzer |

### Expressions et émotions dans la journée

| Indicateur | Calcul | Lecture |
| --- | --- | --- |
| Sourires par heure | Nombre d'épisodes où le coefficient de sourire dépasse un seuil, rapporté au temps de visage visible | Marqueur le mieux documenté |
| Expressivité | Écart-type des coefficients d'expression par minute, moyenné par tranche de 30 minutes | Visage figé ou mobile |
| Froncement, coins de la bouche abaissés | Part du temps au-dessus d'un seuil | Tension, tristesse apparente |
| Tête baissée | Part du temps où le tangage dépasse un seuil | Recoupe la flexion du cou |
| Répartition des émotions | Part du temps par catégorie, par tranche horaire | Vue de niveau 2 |
| Valence | Moyenne par tranche de 30 minutes | Courbe d'humeur apparente |

Ces indicateurs entrent dans les mêmes vues au long cours que la posture : tendance sur 7 jours, carte heure × jour, profil type.

Trois précautions :

- **Le niveau 2 est le moins fiable.** Devant un écran, presque tout le monde a un visage neutre : la catégorie « neutre » domine, et un visage concentré se lit facilement comme triste ou en colère. Montrer d'abord les expressions observables, l'émotion déduite en second.
- **Le temps de visage visible varie.** Toujours rapporter les comptes au temps où le visage était exploitable, et afficher ce temps.
- **Le visage n'est mesuré que par moments.** Il faut qu'il soit à peu près de face et fasse au moins 60 à 80 pixels, soit environ 3 m de la caméra. Les expressions sont donc un échantillon opportuniste de la journée, pas un suivi continu (section 17).

### Évolution au fil du temps

| Indicateur | Calcul |
| --- | --- |
| Tendance | Médiane journalière de chaque angle, lissée sur 7 jours |
| Carte heure × jour | Une case par tranche horaire et par jour, colorée par l'indice d'affaissement |
| Profil type | Courbe horaire moyenne des 4 dernières semaines, avec sa bande de variabilité ; la journée en cours s'y superpose |
| Évolution de la dérive | Écart matin–soir suivi de jour en jour : la posture se dégrade-t-elle plus vite qu'avant ? |
| Semaine et week-end | Mêmes indicateurs séparés par type de journée |
| Lien avec la tâche | Vitesse et rebond de la session du matin en regard de la posture du reste de la journée |
| Posture et expressions | Affaissement et expressivité sur le même graphique, par jour : évoluent-ils ensemble ? |
| Mesuré et déclaré | Valence mesurée en regard des curseurs d'humeur et d'énergie du jour |

### Conditions pour que ces courbes aient un sens

- **Comparer à situation égale.** Uniquement assis, dans la même orientation, au même poste. Sinon la courbe reflète le changement d'activité, pas la posture.
- **Classer chaque mesure par orientation.** La personne est vue tantôt de face, tantôt de profil ou de dos : chaque angle n'est calculé que dans l'orientation où il est valide, et comparé uniquement à lui-même dans cette orientation (section 17).
- **Exiger une couverture minimale.** Pas de point sur la courbe pour une tranche de 30 minutes avec moins de 10 minutes valides.
- **Marquer les ruptures.** Caméra déplacée, chaise ou bureau changé : nouveau segment de ligne de base.

### Pour la démo

Une demi-journée enregistrée suffit à montrer la courbe horaire et la dérive par séance assise. La carte heure × jour et les tendances demandent au moins une à deux semaines : commencer l'enregistrement le plus tôt possible, ou les présenter comme la vue cible.

## 17. Capture passive en conditions libres

Décision du 13 novembre 2026 : la personne vaque à ses occupations dans la pièce. Elle est vue tantôt de face, tantôt de profil ou de dos, à des distances variables. Le système ne lui demande rien.

### Principe : mesurer ce qui est valide, quand c'est valide

Aucune mesure n'est valable en permanence. Le pipeline classe chaque instant (activité, orientation, distance), ne calcule que les variables valides dans cette situation, et ne compare une variable qu'à elle-même dans la même situation. Le plan d'origine prévoyait déjà une ligne de base par couple activité × orientation : cette logique devient le cœur du système.

### Estimer l'orientation du corps

À partir des 17 points, sans modèle supplémentaire :

- **Points du visage visibles.** Nez et deux yeux : face. Une seule oreille : profil. Oreilles sans nez ni yeux : dos.
- **Ordre gauche–droite des épaules à l'image.** Il s'inverse entre face et dos.
- **Largeur apparente des épaules rapportée à la longueur du tronc.** Maximale de face ou de dos, proche de zéro de profil. Elle donne un angle continu.

Quatre classes sont conservées : face, trois-quarts, profil, dos. Les instants ambigus sont rejetés.

### Ce qui se mesure dans chaque situation

| Variable | Face | Trois-quarts | Profil | Dos |
| --- | --- | --- | --- | --- |
| Flexion du cou, tête en avant | Non | Approché | Oui | Non |
| Inclinaison du tronc vers l'avant | Non | Approché | Oui | Non |
| Asymétrie des épaules, inclinaison latérale du tronc | Oui | Non | Non | Oui |
| Inclinaison latérale de la tête | Oui | Non | Non | Non |
| Balancement latéral en marche | Oui | Non | Non | Oui |
| Balancement des bras en marche | Non | Approché | Oui | Non |
| Expressions et émotions | Oui, si le visage est assez grand | Dégradé | Non | Non |
| Vitesse de marche, cadence | Oui | Oui | Oui | Oui |
| Quantité de mouvement, transitions, temps assis | Oui | Oui | Oui | Oui |
| Hauteur relative (affaissement debout) | Oui | Oui | Oui | Oui |

Les quatre dernières lignes ne dépendent pas de l'orientation : elles forment le socle du suivi passif. Les angles sont un complément, disponible par intermittence.

### Rendre les mesures indépendantes de la distance et de la direction

1. **Calibration du sol, une fois.** Quatre points au sol de positions connues donnent la correspondance image → plan de la pièce. La position des chevilles devient une position en mètres : la vitesse de marche se calcule dans n'importe quelle direction.
2. **Normalisation par la taille apparente.** Toute longueur en pixels est divisée par la longueur du tronc au même instant.
3. **Cadence par le rebond vertical.** La fréquence du mouvement vertical des hanches donne la cadence dans toutes les directions. L'amplitude du rebond n'est comparable qu'après normalisation, et reste plus fiable de profil.
4. **Hauteur relative.** Pendant la première semaine, le système apprend la taille apparente attendue de la personne debout en fonction de la position de ses pieds dans l'image. Ensuite, le rapport taille observée / taille attendue mesure le redressement ou l'affaissement, sous n'importe quel angle. C'est une idée de ma part, simple à coder mais à valider sur les premières données.

### Découper la journée en épisodes

- **Marche.** Déplacement continu d'au moins 2 m ou 3 pas, sans obstacle masquant les jambes. Les démarrages, arrêts et virages sont écartés.
- **Debout immobile.** Au moins 3 secondes sans déplacement.
- **Assis stable.** Au moins 30 secondes, hanches visibles ou non (le haut du corps suffit pour certains angles).
- **Transition.** Lever ou assise, avec sa durée.
- **Visage exploitable.** Visage de face à moins de 30 à 40° et d'au moins 60 à 80 pixels.

Chaque épisode produit une ligne : type, orientation, durée, variables valides. Les tables par minute de la section 16 en sont l'agrégat.

### Option : pose 3D monoculaire

Un modèle qui reconstruit le squelette en 3D à partir d'une seule image permet de calculer les angles dans le repère du corps, donc quelle que soit l'orientation. C'est la réponse de fond au problème, et l'étude de référence sur la marche procède ainsi. Deux réserves : la précision en profondeur d'une seule caméra reste moyenne, et les licences de ces modèles sont souvent non commerciales. Pour la démo, la pile non commerciale suffit ; à tester si le temps le permet, en gardant les angles 2D par orientation comme base.

### Placement de la caméra

- En hauteur, vers 2 m, dans un angle de la pièce, légèrement plongeante : moins d'occlusions par le mobilier, plus de sol visible pour les trajets.
- Orientée de façon à voir de face l'endroit où la personne regarde le plus souvent, pour maximiser le temps de visage exploitable.
- Les trajets habituels (porte, bureau, canapé) dans le champ et à moins de 4 m.
- Ne plus y toucher : la plongée fausse les angles d'une valeur constante, sans effet sur un suivi par rapport à soi-même tant que la caméra ne bouge pas.

### Ce que le passif coûte

- **Couverture inégale.** Certains jours, peu de marche de profil ou peu de visage. Chaque indicateur est affiché avec son nombre d'épisodes ; en dessous d'un minimum, pas de point sur la courbe.
- **Biais de situation.** On ne voit le visage de face que dans certaines activités, toujours les mêmes. Une variation peut refléter un changement d'habitudes, pas d'état.
- **Plus de bruit.** Il faut plus de jours pour voir une tendance qu'avec une tâche standardisée.
- **Démonstration plus lente à constituer.** Les courbes ne prennent forme qu'après plusieurs jours d'enregistrement.

La séquence standardisée se limite donc à la calibration de la section 18.

## 18. Calibration initiale et rappel hebdomadaire facultatif

Décision du 13 novembre 2026 : on ne demande une séquence standardisée à la personne qu'au début. Un rappel hebdomadaire est possible, mais le système doit fonctionner sans lui.

### Calibration de la pièce (sans la personne, une fois)

1. Fixer la caméra et enregistrer l'image de référence de l'arrière-plan.
2. Poser quatre repères au sol de positions mesurées et les pointer dans l'image : correspondance image → plan de la pièce.
3. Vérifier sur une distance connue (erreur visée : moins de 5 %).
4. Tracer la zone utile : là où les chevilles sont visibles et le corps à moins de 4 m.

### Calibration de la personne (environ 4 minutes, guidée à l'écran)

| Étape | Durée | Consigne | Ce que le système en tire |
| --- | --- | --- | --- |
| 1. Visage | 30 s | À 1,5 m, regarder la caméra, tourner lentement la tête à gauche, à droite, en haut, en bas | Galerie d'enrôlement : 10 à 20 empreintes |
| 2. Visage neutre | 10 s | Visage au repos | Valeurs de repos des coefficients d'expression, propres à la personne |
| 3. Amplitude | 20 s | Grand sourire, sourcils froncés, sourcils levés, bouche ouverte | Étendue personnelle de chaque coefficient, pour normaliser l'expressivité |
| 4. Debout redressé | 10 s | Debout bien droit, face à la caméra, à 3 m | Posture de référence, proportions du corps (tronc, jambes, largeur des épaules) |
| 5. Tour complet | 20 s | Tourner lentement sur place, un tour entier | Relation entre largeur apparente des épaules et orientation |
| 6. Debout habituel | 10 s | Se tenir comme d'habitude, de profil | Écart entre posture habituelle et posture redressée |
| 7. Assis | 30 s | S'asseoir à sa place habituelle, redressé 10 s, puis comme d'habitude 20 s | Références assises, durée d'un lever |
| 8. Parcours | 60 s | Marcher à l'allure habituelle le long des trajets courants de la pièce, dans les deux sens | Vitesse et cadence de référence, carte de la taille apparente attendue selon la position |
| 9. Marche de profil | 30 s | Quatre traversées parallèles à l'image | Rebond vertical, balancement des bras et inclinaison du tronc de référence |

À la fin, l'écran affiche un contrôle : nombre d'empreintes, nombre de pas utiles, couverture de la carte de taille. Une étape insuffisante est refaite.

Ces valeurs servent à **paramétrer** les calculs (proportions, repos du visage, orientation). Elles ne sont pas la ligne de base : celle-ci se construit sur les premières semaines de capture passive, situation par situation.

### Rappel hebdomadaire (facultatif, 90 secondes)

Étapes 2, 4, 8 et 9 seulement. Son rôle est de contrôler l'instrument, pas de produire une série de mesures :

- Vérifier que les mesures de référence n'ont pas dérivé (caméra bougée, mise à jour de modèle).
- Fournir quelques points propres pour recouper les tendances passives.

S'il manque, rien ne s'arrête. Trois mécanismes le remplacent :

- **Carte de taille auto-ajustée.** Elle est recalculée en continu à partir des moments où la personne est vue debout, en gardant les valeurs hautes.
- **Galerie adaptative du visage.** Déjà prévue dans le plan d'origine.
- **Contrôle quotidien de l'arrière-plan.** Il signale un déplacement de la caméra et demande alors une recalibration.

### Limite à connaître

Une calibration faite en se sachant observé est souvent plus « tenue » que le naturel. Les références redressées servent de borne haute ; la posture habituelle réelle se lira dans les données passives, pas dans l'étape 6.
