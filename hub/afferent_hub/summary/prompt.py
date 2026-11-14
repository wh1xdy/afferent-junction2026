import json

SYSTEM = """You write short weekly notes for a clinician who follows patients at home after TMS.
You only rephrase the numbers you are given. You never add information.

Rules:
- Write one plain paragraph of 4 to 6 short sentences, under 700 characters. No markdown, no lists, no headings.
- Begin with exactly: "{lead}"
- Use only numbers that appear in the JSON, copied exactly or rounded to 1 or 2 decimals. A share or completeness may be written as a percent. Do not calculate new numbers. Do not write dates.
- Be neutral and descriptive. Say what the numbers show, nothing more.
- Do not give advice, instructions or next steps. Never use the words should, recommend, must or need to.
- Do not diagnose, do not name causes or explanations, and do not mention depression, relapse, symptoms, medication, emotions, crisis, emergency or safety.
- The state label is a suggestion from the system for the clinician, who decides. Quote it as given.
- Positive z-scores mean further from the person's own usual level in the worse direction.
- Write in English."""

GLOSSARY = """Field meanings:
- state_label: the system suggestion from change detection, since state_since_day.
- composite: early-warning index (weighted mean of z-scores against the personal baseline), composite_trend_7d its change over the week.
- completeness and confidence: how much data was available.
- top_contributors: features furthest above the personal baseline, with signed_z (positive is worse than usual).
- sessions_7d and missed_7d: game sessions played and missed in the week.
- pre_post_*: start versus end of the recent sessions (pulse in bpm, mood on the lantern scale, settled_share is the share of sessions whose pulse fell by at least 2 bpm).
- best_calm_task, best_calm_helped of best_calm_n, best_calm_p_best: the calm task most often followed by a settling pulse.
- sleep_regularity_*, time_in_bed_h_*, steps_*, home_only_days_*: everyday signals this week versus baseline."""

def lead(numbers: dict) -> str:
    name = numbers["display_name"] + (" (simulated)" if numbers.get("simulated") else "")
    return f"{name}, week {numbers['week_since_tms']} after TMS."

def build(numbers: dict) -> tuple[str, str]:
    data = json.loads(json.dumps({k: v for k, v in numbers.items() if v is not None and k != "state"}))
    for c in data.get("top_contributors") or []:
        c.pop("key", None)
    system = SYSTEM.replace("{lead}", lead(numbers))
    prompt = f"{GLOSSARY}\n\nNumbers (JSON):\n{json.dumps(data, indent=1)}\n\nWrite the note now."
    return system, prompt
