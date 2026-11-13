# Revue de l’implémentation Afferent

**Date :** 14 novembre 2026  
**Périmètre :** comparaison du plan [`plan_posture_depression.md`](plan_posture_depression.md) au POC `laptop/posture`, ainsi qu’au dépôt Afferent dans son ensemble.  
**Type de revue :** lecture statique du code et de la documentation. Aucun test ni déploiement n’a été exécuté pour cette revue.

## Synthèse

Le POC laptop constitue une base technique déjà substantielle : capture vidéo, estimation de pose Halpe-26 avec pieds, verrouillage d’identité, lissage, classification activité/orientation, géométrie, variables de marche, expressivité faciale, stockage SQLite agrégé, API et tableau de bord. La documentation présente correctement le système comme un instrument de mesure exploratoire, pas comme un diagnostic.

En revanche, l’implémentation ne réalise pas encore le projet de suivi de l’humeur/dépression défini dans le plan. Elle n’a ni vérité terrain (PHQ-9, humeur, énergie, sommeil, facteurs de confusion), ni flux de questionnaires, ni indice relatif à une ligne de base, ni protocole et résultats de fiabilité/validité. Ces absences sont cohérentes avec un POC d’extraction, mais interdisent toute conclusion clinique ou toute validation du lien annoncé.

**Évaluation :** bon socle de démonstration et d’extraction exploratoire ; pas prêt pour un pilote santé sur une personne ni pour une étude de validité. Les points prioritaires sont la séparation des contextes lors de l’agrégation, la protection des données biométriques et la mise en œuvre du protocole scientifique avant toute collecte longitudinale.

## Constats prioritaires

### P1 — Les agrégats mélangent des situations incompatibles

Le plan demande explicitement de comparer une variable à elle-même dans la même activité et la même orientation ([plan, §16–17](plan_posture_depression.md)). Or `MinuteAggregator` conserve un seul vote majoritaire d’activité et d’orientation par minute, puis agrège les valeurs angulaires de tous les échantillons valides de cette minute ([`aggregator.py`](../laptop/posture/afferent/aggregator.py#L33)). La clé primaire de `minute` est seulement l’horodatage ([`storage.py`](../laptop/posture/afferent/storage.py#L22)). Une minute mêlant, par exemple, assise de profil et marche de face devient donc une seule ligne ; ses angles peuvent provenir de plusieurs contextes alors que l’étiquette affichée n’en décrit que le contexte majoritaire.

**Conséquence :** les tendances journalières par situation promises par le plan ne peuvent pas être reconstruites fidèlement à partir des données actuelles.  
**À faire :** agréger par clé `(minute, activité, orientation)` (ou par épisode/contextes), conserver les comptes d’échantillons par groupe, puis calculer les tendances et la couverture séparément dans chaque contexte.

### P1 — Données biométriques stockées en clair et API sans contrôle d’accès

La galerie d’identité stocke les empreintes faciales dans SQLite comme BLOB sans chiffrement applicatif ([`storage.py`](../laptop/posture/afferent/storage.py#L47), écriture dans [`storage.py`](../laptop/posture/afferent/storage.py#L196)). Le serveur expose les endpoints de galerie, mesures, sessions et vidéo sans authentification visible ([`server.py`](../laptop/posture/afferent/server.py#L43), [`server.py`](../laptop/posture/afferent/server.py#L89)). Le démarrage du serveur utilise `0.0.0.0` par défaut ([`__main__.py`](../laptop/posture/afferent/__main__.py#L8)). Le README décrit les volumes SQLite et modèles, sans mécanisme de chiffrement ([`README.md`](../laptop/posture/README.md#L78)).

Le plan qualifie pourtant la galerie de donnée biométrique devant être protégée et prévoit chiffrement, suppression et arbitrage sur la synchronisation (§6, §16). L’API de suppression de galerie existe, mais elle n’efface que les empreintes, pas les agrégats associés. La vidéo de prévisualisation est également servie par l’API ; l’enregistrement explicite est désactivé par défaut, ce qui est un bon garde-fou, mais ne remplace pas le contrôle d’accès.

**Conséquence :** ne pas exposer ce serveur au réseau partagé ni y placer des données réelles sensibles en l’état.  
**À faire :** décider d’un mode strictement local ou ajouter authentification, transport protégé lorsque nécessaire, chiffrement au repos/gestion de clé, politique de rétention et procédure d’effacement complet (galerie, base, sauvegardes et enregistrements).

### P1 — Le plan scientifique et les garde-fous préalables ne sont pas matérialisés

Le plan §4, §7, §9 et §10 prévoit consentement, information des autres occupants, référent clinique, hypothèses préenregistrées, questionnaire PHQ-9, humeur/énergie quotidienne, sommeil et facteurs de confusion. Aucun schéma, endpoint ou écran correspondant n’apparaît dans le POC. Les tables `session`, `jour` et `config` ne contiennent pas les réponses de questionnaire ou facteurs de confusion ([`storage.py`](../laptop/posture/afferent/storage.py#L72)). Le code ne calcule pas de score de suivi relatif à une ligne de base.

Le README reconnaît qu’une validation nécessiterait vérité terrain et mesures répétées. C’est une limite bien formulée, mais le statut prévu en phase 0 n’est pas atteint. De plus, le plan demande à la fois une tâche standardisée quotidienne (§7 et §15) et indique plus loin que le système doit fonctionner sans tâche quotidienne, avec seulement une calibration initiale et un rappel facultatif (§17–18). Cette décision méthodologique doit être harmonisée avant de figer le protocole.

**Conséquence :** le POC permet d’observer des marqueurs calculés, pas de relier ces marqueurs à l’humeur ou à la dépression.  
**À faire :** résoudre la contradiction de protocole, documenter et faire relire le cadre éthique/clinique et juridique avant toute collecte de cohorte, puis intégrer une source de vérité terrain et les covariables choisies.

### P1 — La cadence observée ne démontre pas les critères de capture du plan

La configuration prévoit 10 images/s en continu et 30 images/s en rafale, mais le pipeline n’utilise pas `continuous_fps` ou `burst_fps` pour réguler sa capture/inférence ([`config.py`](../laptop/posture/afferent/config.py#L33), boucle dans [`pipeline.py`](../laptop/posture/afferent/pipeline.py#L495)). Le README rapporte environ 4 pose-fps sur CPU à 1080p. Le plan exige au moins 25 images/s pour la tâche standardisée (§15), et 25–30 pour les mesures de marche/visage. La session guidée actuelle collecte une référence debout puis une phase de marche libre, sans consigne ni contrôle de parcours, qualité minimale de 12 pas, distance ou cadence réelle ([`pipeline.py`](../laptop/posture/afferent/pipeline.py#L382)).

**Conséquence :** le protocole et les performances de mesure décrits par le plan ne sont pas encore démontrés ; les fréquences de clignement et les variables de marche peuvent être sous-échantillonnées.  
**À faire :** mesurer la cadence réellement traitée et les pertes sur la configuration cible ; afficher/inscrire la qualité par session et invalider les variables lorsque les conditions minimales ne sont pas réunies. Ne présenter la session actuelle que comme une collecte exploratoire.

## Couverture du plan

| Domaine du plan | État observé | Commentaire |
|---|---|---|
| Pose 26 points/pieds, identité, lissage | **Présent** | Pipeline et adaptateurs modèles disponibles ; pile InsightFace indiquée comme recherche uniquement dans le README. |
| Géométrie et orientation | **Partiel** | Angles et classes d’orientation calculés ; validation empirique et robustesse par distance/éclairage non établies. |
| Calibration du sol | **Présent, à valider** | Homographie à quatre points et conversion en unités de sol ; le critère d’erreur inférieur à 5 % reste un objectif, pas un résultat consigné. |
| Marche et transitions | **Partiel** | Cadence, vitesse, longueur de pas et balancement de bras existent ; pas de validation contre chronomètre/référence ni test-retest rapporté. Les pas sont approchés par rebond des hanches. |
| Visage / expressivité | **Partiel** | Blendshapes, pose de tête, émotions et agrégats sont prévus dans le code. Plusieurs variables du plan manquent (durée/intensité et dénominateur de temps visage exploitable) ; les sorties émotionnelles ne sont pas validées. |
| Agrégats minute/jour et couverture | **Partiel** | Agrégats et endpoint jour existent, mais l’agrégat est incorrectement groupé par contexte et la couverture correspond à la part des minutes avec ligne, non à la durée effectivement observée. |
| Questionnaire, humeur, journal | **Absent** | Aucun formulaire, stockage ni API visibles. |
| Indice relatif à la ligne de base | **Absent** | Pas de normalisation longitudinale, intervalle d’incertitude ou seuil de couverture décisionnel. |
| Sécurité, éthique, conformité | **Non matérialisé** | Pas de consentement, politique d’accès/rétention/chiffrement ou procédure clinique dans l’application. |
| Fiabilité et validité | **Non démontré** | Le dépôt contient des tests synthétiques, mais aucun résultat sur sessions réelles, test-retest, ICC, changement minimal détectable ou cohorte. |
| Déploiement Afferent global | **Autre périmètre** | `jetson/vision` et `uno-q/modulino-hub` réalisent une démo de détection de personne et buzzer ; ils ne constituent pas le pipeline de suivi humeur/dépression du laptop. |

## Autres limites techniques à suivre

1. **Agrégat journalier insuffisant pour le plan.** `daily_aggregate` calcule une médiane des médianes minute et une couverture `nombre de lignes / 1440` ([`aggregator.py`](../laptop/posture/afferent/aggregator.py#L193)). Cela ne distingue pas les créneaux de 30 minutes, ne mesure pas les minutes réellement observées et ne fournit pas de seuil minimal par tranche comme demandé au §16.
2. **Ruptures temporelles et contexte incomplets.** Le schéma n’enregistre pas les facteurs de contexte prévus (distance, éclairage, personnes supplémentaires, type de journée) ni des versions/calibrations par segment complet. Cela complique l’interprétation de changements observés.
3. **Persistance de session potentiellement non alignée avec le temps de capture.** Les horodatages sont en secondes/epoch dans plusieurs tables et en millisecondes dans les tables minute ; cette différence est gérable mais mérite une convention documentée et un traitement de fuseau explicite dans l’agrégation jour.
4. **Validation des modèles à distinguer de la validation clinique.** Les scripts de training/évaluation et tests synthétiques sont utiles pour la pose et les variables, mais ne constituent pas une validation du construit « humeur/dépression ».

## Ordre de travail recommandé

1. **Corriger la granularité des agrégats** pour préserver activité × orientation et recalculer les métriques de couverture à partir des mesures réellement valides.
2. **Fixer le protocole** : tâche quotidienne ou mesure passive, variables primaires, conditions de qualité, questionnaires et covariables. Aligner les sections §7/§15 et §17/§18 du plan.
3. **Verrouiller la protection des données avant usage réel** : accès local, chiffrement, rétention et effacement complet ; vérifier séparément l’exposition vidéo et les enregistrements de développement.
4. **Instrumenter la qualité de capture** : cadence réelle, nombre d’échantillons valides par variable/contexte, conditions de rejet, calibrations et versions de modèles.
5. **Réaliser la fiabilité de mesure** selon le plan (§3), puis seulement lancer la collecte longitudinale avec questionnaires et analyse préenregistrée.
6. **Ne produire aucun indicateur de dépression** tant que la validité n’a pas été étudiée sur une cohorte appropriée ; maintenir la sortie comme marqueurs exploratoires individuels.

## Conclusion

L’implémentation est un POC crédible pour explorer un pipeline local de pose et d’extraction. Elle couvre plusieurs briques techniques du plan, mais pas encore le protocole de recherche, la comparabilité contextuelle des agrégats, la protection attendue des données biométriques, ni la validation d’un indicateur d’humeur/dépression. Le jalon réaliste suivant est de fiabiliser les agrégats et le cadre de collecte, puis d’évaluer la reproductibilité des mesures avant toute interprétation clinique.
