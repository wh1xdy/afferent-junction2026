# Bibliography — Posture, movement and facial expression as indicators of depression

Compiled 13 November 2026 from the references cited in `plan_ameliore_posture_depression.md`. Each entry includes a short summary of what the source contributes to the project.

## Depression and motor behaviour (posture, gait, balance)

**Belvederi Murri M, Triolo F, Coni A, Tacconi C, Nerozzi E, Escelsior A, Respino M, Neviani F, Bertolotti M, Bertakis K, Chiari L, Zanetidou S, Amore M.** "Instrumental assessment of balance and gait in depression: A systematic review." *Psychiatry Research*, 2020;284:112687. DOI: 10.1016/j.psychres.2019.112687.

*Summary:* Systematic review of 33 studies (PRISMA, Newcastle–Ottawa quality rating) on posture, balance and gait in depression, measured with instrumental procedures. Finds that depression in adults is associated with significant impairments of posture, balance and gait, but overall study quality is low to medium; in older adults, motor abnormalities are confounded by physical disease, cognitive impairment and mood. Few intervention studies measured motor symptoms as outcomes. This is the main evidence base for treating posture/gait as depression markers, and the reason the plan calls for its own reliability and validity phases.

**Michalak J, Troje NF, Fischer J, Vollmar P, Heidenreich T, Schulte D.** "Embodiment of sadness and depression — gait patterns associated with dysphoric mood." *Psychosomatic Medicine*, 2009;71(5):580–587. DOI: 10.1097/PSY.0b013e3181a2515c.

*Summary:* Landmark 3D motion-capture study comparing 14 inpatients with major depression against matched never-depressed controls, plus a musical mood-induction experiment in 23 undergraduates. Identifies five gait features of dysphoric mood: reduced walking speed, reduced arm swing, reduced vertical head movements, increased lateral sway of the upper body, and more slumped posture. These five markers directly inspired the variable list in the standardized-task protocol (section 15 of the plan).

**Adolph D, et al.** "Gait patterns and mood in everyday life: a comparison between depressed patients and non-depressed controls." *Cognitive Therapy and Research*, 2021;45:1128–1140. DOI: 10.1007/s10608-021-10215-7.

*Summary:* Replicates the laboratory gait findings in naturalistic, everyday-life settings: 35 patients with major depressive disorder versus 36 age- and gender-matched controls, recorded continuously over 2 days. Depressed patients showed reduced walking speed, reduced vertical up-and-down movements and slumped posture during daily walking episodes. Higher walking speed and larger vertical movement predicted subsequent positive mood independently of diagnosis, supporting the idea that motor displays relate to momentary mood — key justification for passive, in-situ capture rather than only lab tasks.

## Computer vision and digital phenotyping of depression

**Boutaleb F, Pierson E, Daoudi M, Nineuil C, Amad A, D'Hondt F.** "A non-invasive 3D gait analysis framework for quantifying psychomotor retardation in major depressive disorder." arXiv:2601.19526 [cs.CV], 2026.

*Summary:* Proposes a pipeline turning monocular RGB video into clinically relevant 3D gait kinematics using Gravity-View Coordinates and a trajectory-correction algorithm built around an adapted Timed Up and Go protocol. Extracts 297 explicit gait biomechanical biomarkers from a single camera. Validated on the CALYPSO dataset: 83.3% accuracy detecting psychomotor retardation and R² = 0.64 on overall depression severity (Hamilton scale), linking reduced ankle propulsion and restricted pelvic mobility to the depressive motor phenotype. Small clinical sample (42 hospitalized patients) and standardized task — the plan cites it as proof that monocular-video gait analysis is feasible, while noting its results do not directly transfer to home monitoring of mild depression.

**Islam R, Bae SW.** "FacePsy: an open-source affective mobile sensing system — analyzing facial behavior and head gesture for depression detection in naturalistic settings." *Proceedings of the ACM on Human-Computer Interaction*, vol. 8, issue MHCI, article 260, pp. 1–32, 2024. DOI: 10.1145/3676505.

*Summary:* Smartphone-based system that captures facial landmarks, eye movements and head gestures during natural phone use over four weeks in 25 participants. Eye-open states, head gestures, smiles and specific action units (AUs 2, 6, 7, 12, 15, 17) significantly indicated depressive episodes (AUROC = 81%); a regression model predicted PHQ-9 scores with a mean absolute error of 3.08. Companion system PupilSense tracks pupillary responses (reported AUROC ≈ 0.71 for depressive episodes). Relevant because it shows facial dynamics carry depression signal in the wild, but capture was close-range smartphone selfies — not a webcam at 3 m — which is why the plan focuses on expression dynamics rather than emotion labels.

**Cohn JF, Simon T, Matthews I, Yang Y, Nguyen MH, Tejera M, Zhou F, De La Torre F.** "Detecting depression from facial actions and vocal prosody." *Proceedings of the 3rd International Conference on Affective Computing and Intelligent Interaction (ACII)*, 2009. DOI: 10.1109/ACII.2009.5349358.

*Summary:* Early clinical study comparing automated facial and vocal measurement against clinical depression diagnosis in patients undergoing treatment. Manual FACS coding reached 88% accuracy, automated active appearance modeling (AAM) 79%, and vocal prosody 79%. Demonstrates feasibility of automatic depression detection from facial actions and prosody, but in a structured clinical interview setting with a clinical sample — not everyday webcam conditions.

**Busshart L, Petrovic M, Amin R, Hegerl U.** "Distinguishing common digital phenotyping and self-report parameters for monitoring and predicting depression: scoping review." *JMIR mHealth and uHealth*, 2026;14:e70840.

*Summary:* Scoping review (PRISMA-ScR) of 19 studies covering 85,193 participants, using smartphone- or wearable-based passive sensing combined with self-reports. The PHQ-9 was the most common depression measure; five parameter categories emerged — physical activity and location, behavioral patterns, physiological signals, sleep indicators, and self-report/clinical measures. Shows which digital parameters are most used and which show predictive value for depression monitoring, informing the choice of variables and ground-truth instruments in the plan.

**Balliu B, Douglas C, Shenhav L, et al.** "Personalized mood prediction from patterns of behavior collected with smartphones." *npj Digital Medicine*, 2024;7:49. DOI: 10.1038/s41746-024-01035-6. (Preprint: medRxiv 2022.10.12.22281007.)

*Summary:* High-quality longitudinal study: 183 individuals with mild-to-severe depression followed up to 40 weeks, combining computerized adaptive testing (validated mood assessments) with continuous smartphone sensor data. Idiographic models with cubic spline interpolation predicted depression severity up to three weeks ahead (R² ≥ 80%) with a 65.7% reduction in prediction error versus a baseline model using past mood alone. Explicitly notes that most digital-phenotype studies are underpowered, too short, and use unvalidated depression measures — directly motivating the plan's insistence on validated ground truth (PHQ-9) and intra-person baselines.

## Regulatory and legal sources (EU MDR / AI Act)

**OpenRegulatory.** "MDCG 2019-11 explained." Web resource, consulted 13 November 2026. https://openregulatory.com/mdcg/mdcg-2019-11

*Summary:* Plain-language guide to the MDCG 2019-11 guidance on qualification and classification of software under the EU Medical Device Regulation. Used to establish that software computing a depression score can qualify as a medical device — a key risk in the plan's compliance section.

**Sanolabs.** "Wellness app vs medical device under EU MDR." Blog article, consulted 13 November 2026. https://www.sanolabs.eu/blog/wellness-app-vs-medical-device-eu-mdr/

*Summary:* Explains how the intended purpose and claims determine whether a mental-health or wellness app falls under MDR. Supports the plan's distinction between a "wellness tool" and a "clinical monitoring tool" positioning.

**Mason Hayes & Curran.** "Is your mental wellbeing app a medical device?" Legal insight, consulted 13 November 2026. https://www.mhc.ie/latest/insights/is-your-mental-wellbeing-app-a-medical-device

*Summary:* Law-firm analysis of when mental wellbeing apps qualify as medical devices in the EU, including borderline cases and the role of intended purpose. Reinforces the warning against marketing a depression indicator as wellness.

**Osborne Clarke.** "EU confirms app stores and developers are subject to medical device laws" (MDCG 2025 guidelines). Insight, consulted 13 November 2026. https://www.osborneclarke.com/insights/eu-confirms-app-stores-and-developers-are-subject-medical-device-laws

*Summary:* Reports that EU regulators confirmed app stores and developers are subject to medical device legislation, per updated MDCG guidance. Relevant to distribution-channel obligations once the product is positioned as a clinical monitoring tool.

## Supplementary web sources

**Neuroscience News (Stevens Institute of Technology).** "When detecting depression, the eyes have it." News article, consulted 13 November 2026. https://neurosciencenews.com/ai-depression-facial-cue-eyes-27735/

*Summary:* Press coverage of the FacePsy and PupilSense systems from Sang Won Bae's group at Stevens. Secondary source; the underlying papers are Islam & Bae (FacePsy, PACMHCI 2024) and the PupilSense preprint (arXiv:2404.14590).

**bioMotion Laboratory (University of British Columbia).** "Depression gait" demo animation. http://biomotionlab.ca/Demos/BMLdepression.html

*Summary:* Animation visualizing the gait discriminant function from Michalak et al. (2009), showing the depressed versus non-depressed walking pattern side by side. Cited in the plan as a reference animation for staging the hackathon sensitivity demo (link noted as unverified). Not a peer-reviewed source.
