# Plan de prises — tests et entraînement

13 novembre 2026 · POC `poc/laptop-markers` · suivi de posture/mouvement/expressivité
(personne cible : Romain, P01 — consentement signé avant toute prise)

Deux usages distincts, deux fichiers de métadonnées :
- **Jeux de test** (fiabilité, phases 1 et 3 du plan) : jamais annotés, servent à
  vérifier l'instrument. Noms `test_*` — pas dans `manifests/sessions.yaml`.
- **Corpus d'entraînement** (phase 4) : annoté dans CVAT puis fine-tuning.
  Déclaré dans `laptop/training/manifests/sessions.yaml` avec `consent: true`.

Convention de nommage : `YYYY-MM-DD_Pxx_situation_xx.mp4`
(`P01` = Romain, `P02`+ = autres volontaires ; `xx` = numéro de prise).
Métadonnées notées à chaque prise : chaussures, vêtements, lunettes, heure,
luminosité, distance caméra, drapeau « simulée ».

## A. Installation (une fois par configuration)

| # | Prise | Durée | Cas d'usage |
| - | ----- | ----- | ----------- |
| A1 | Pièce vide, fond fixe | 30 s | Image de référence du contrôle quotidien d'arrière-plan |
| A2 | Personne avec mètre au sol, 4 repères + règle connue | 60 s | Calibration du sol (homographie) + vérif distance ≤5 % |
| A3 | Visage à 1,5 m, tour de tête lent G/D/H/B | 30 s | Enrôlement : 10–20 empreintes |
| A4 | Debout redressé face puis profil, à 3 m | 10 s | Posture de référence, tronc, épaules |

Total A : 4 prises, ~2 min. À refaire si la caméra bouge.

## B. Fiabilité de l'instrument (test, phase 1/3)

Tout à la ligne de marche standard : caméra 1,2 m, ligne parallèle à 3 m,
repères A–B à 3 m. Une « session » = debout → 6 traversées → retour.

| # | Prise | Nombre | Cas d'usage |
| - | ----- | ------ | ----------- |
| B1 | Marche chronométrée A→B, une personne | 20 traversées | Vitesse caméra vs chronomètre (erreur cible <5 %) |
| B2 | Sessions complètes, même jour, espacées ≥1 h | 5 prises | Variabilité intra-jour de chaque variable |
| B3 | Sessions complètes, 10 jours stables, même heure | 10 prises | Corrélation intra-classe, plus petit changement détectable |
| B4 | Marche volontairement lente et affaissée, étiquetée `simulated:true` | 3 prises | Sensibilité : les 3 prises doivent se détacher des 15 prises B2+B3 |
| B5 | Lever de chaise répété, assis→debout→assis | 10 prises | Durée du lever, vérifiée au chronomètre sur vidéo |
| B6 | Trois personnes dans le champ en même temps (marche + assis) | 3 prises | Taux d'erreur d'identité (verrou cible) |

Total B : 51 prises/traversées. B1–B6 = jeux de test gelés pour l'évaluateur.

## C. Robustesse (test, petit nombre)

| # | Prise | Nombre | Variation testée |
| - | ----- | ------ | ---------------- |
| C1 | Marche normale, éclairage du soir / lampes | 2 | Luminosité |
| C2 | Marche en vêtements amples (pantalon large, veste) | 2 | Morphologie masquée |
| C3 | Marche avec lunettes / casquette | 2 | Visage partiel |
| C4 | Marche à 2 m, puis 4 m de la caméra | 4 | Distance limite utile |
| C5 | Caméra déplacée de ~20 cm puis recalibrée | 2 | Détection de rupture de ligne de base |
| C6 | Vie quotidienne passive (travail, canapé, cuisine) 2×2 h | 4 | Couverture, épisodes spontanés, faux négatifs de verrou |

Total C : 16 prises.

## D. Corpus d'entraînement (annotation → fine-tuning)

Objectif : ~800–1 200 images annotées à 26 points (dont 6 pieds), issues de
prises variées. Prélèvement à ~2 im/s via `make extract`.

| # | Situation manifest | Prises par personne | Personnes | Total images visé |
| - | ------------------ | ------------------- | --------- | ----------------- |
| D1 | `walk` allure normale | 2 × 30 s | P01 + 3 volontaires | ~240 |
| D2 | `walk` lent / rapide | 2 × 30 s | idem | ~240 |
| D3 | `sit_to_stand` ×5 répétitions | 1 × 60 s | idem | ~120 |
| D4 | `turn` demi-tour ×3 | 1 × 30 s | idem | ~60 |
| D5 | `seated` postures variées (droite, avachie, latérale) | 1 × 60 s | idem | ~120 |
| D6 | `posture` debout + dos + trois-quarts | 1 × 60 s | idem | ~120 |

Total D : 36 prises ≈ 900 images candidates (triée après pré-annotation).
Diversité visée : âge, sexe, morphologie, lunettes, barbe — au moins 3
volontaires autres que P01, consentement écrit avant prise.

## E. Démo hackathon (section 14 du plan)

| # | Prise | Nombre | Rôle |
| - | ----- | ------ | ---- |
| E1 | Session guidée normale complète | 5 | Ligne de base tableau de bord |
| E2 | Session « ralentie et affaissée » jouée, `simulated:true` | 3 | Contraste à séparer nettement |
| E3 | Une journée passive enregistrée en continu | 1 (~4 h) | Courbes horaires, couverture |

Total E : 9 prises (E1/E2 recoupent B2/B4, à refaire seulement si l'instrument change).

## Totaux

| Bloc | Prises | Nature |
| ---- | ------ | ------ |
| A Installation | 4 | réglage |
| B Fiabilité | 51 | test gelé |
| C Robustesse | 16 | test |
| D Entraînement | 36 (~900 im) | annotation |
| E Démo | 9 | produit |
| **Total** | **~116 prises** | ~1 journée effective de tournage |

Ordre recommandé : A → B1–B4 (même journée, verrouille l'instrument) →
E → B3 (10 jours) → C → D (volontaires, en fin de POC).
