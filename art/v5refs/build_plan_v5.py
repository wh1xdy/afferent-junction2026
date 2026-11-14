import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "art" / "plan_v5.json"
MODEL = "gpt-image-2.6-sunburst"
R = "art/v5refs/"
C = "art/raw/concept/"
E = "art/experiments/"
CUR = "demo/assets/"
TASK = "art/v5refs/current_task/"

LEAD = "Create a new image using the reference images as described."
LEAD_KEEPER = LEAD + " Do not redesign the character."

PALETTE = ("birch white #F2EEE6, birch ply #E2C79C, ply edge #B48E5C, kaamos blue #1E3150, fjord #0E1A2E, frost #9DB9CC, "
           "lilac haze #B4A6CE, ice #8FC6E0, spring green #9DBE8C, spruce #2F4A48, granite #8A8F9C, ceiling green #C8D6BE")

RENDER = ("RENDERING: Premium flat 2D game illustration, the look of the approved key art, never a 3D render or a toy: strict orthographic "
          "side view with no perspective. Large simple shapes with clean, smooth, soft-edged silhouettes and no outlines. Every surface is "
          "flat matte colour with exactly one soft, wide gradient that models its form: lighter where a soft neutral light from the upper left "
          "reaches, deepening smoothly into a cool kaamos-blue #1E3150 shadow side. Wherever a landform, roof, shelf or object has a cut edge, "
          "that edge is laminated like bent birch plywood: two to four thin, even, parallel layers that follow the curve exactly. A very fine, "
          "even felt-like micro-texture is allowed on cloth, wool and snow only, barely visible. Feels like matte felt, painted plaster and bent "
          "birch plywood, designed with the restraint of Nordic functionalist design.")

LIGHT = ("LIGHT AND COLOUR: Local colours at middle value under soft neutral overcast light. No cast shadow, no glow, no rim light, no light "
         "source of any kind, no lit windows, no fire, no night, sunset or warm tint: the game adds darkness, glow and colour grading in code. "
         "Use only these colours: " + PALETTE + ".")

AVOID = ("AVOID: 3D render, clay, plush toy, vinyl figure, glossy or plastic highlights, specular shine, metallic reflections, hard cel "
         "shading, outlines or black strokes, brush strokes, watercolour blooms, paper grain on the background, photorealism, any face or "
         "eyes, any person other than the Keeper, red, orange-red, orange, pink, coral, magenta, text, letters, numbers, logo, watermark, "
         "signature, frame, border, checkerboard pattern, background scenery, drop shadow.")

RENDER_PLATE = ("RENDERING: Premium flat 2D key art in exactly the look of the approved concept plates: large calm shapes, smooth soft "
                "gradients, a big quiet sky that is a perfectly smooth gradient with no banding, no scanlines and no noise. Every landform, "
                "snowdrift and shoreline is one long unhurried free curve, and its cut edge is laminated like bent birch plywood (two to "
                "four thin parallel layers in birch white, birch ply and ply edge). A very fine felt-like micro-texture on snow and cloth "
                "only. The world reads in layers like a paper diorama with "
                "atmospheric depth: each farther layer lighter and bluer. Never a 3D render, never photoreal, never painterly brush work.")

LIGHT_PLATE_RULE = ("Exactly one warm light in the frame (Principle: one light per screen), everything else cool; warm light is only "
                    "honey #FFD58A, sun yellow #F2C230 and dawn apricot #F3A57A, never orange-red, pink or coral.")

AVOID_PLATE = ("AVOID: text, letters, numbers, logo, watermark, user interface, buttons, frame, border, vignette, faces or eyes, any other "
               "person or animal, red, pink, coral, magenta, neon, 3D render, plastic or glossy look, photorealism, brush texture, "
               "paper grain, sky banding, lens flare, white sun.")

KEEPER = ("A small, round, child-sized figure about half as wide as it is tall. A thick felted wool cloak in birch ply #E2C79C. A smooth "
          "dome-shaped hood, perfectly round on top like an egg (no point, no tip, no ears, no pompom, no fur trim), flows straight into the "
          "cloak, which flares gently into a bell shape. The hood is seen in strict profile: its opening points right and is seen edge-on, "
          "so only a thin dark kaamos-blue #1E3150 crescent shows along the right edge of the hood; nothing visible inside, no face. Near "
          "the bottom of the cloak runs a hem band of two thin parallel stripes in ply edge #B48E5C. Two small dark boot tips. One small "
          "mitten in ply edge #B48E5C holds a small dark iron lantern with a ring handle, its glass dark and unlit. No scarf, no staff, no "
          "pole, no backpack.")

KEEPER_ID = {"path": E + "d2_keeper_26sunburst_refs_v1.png",
             "role": "the approved Keeper sprite, the identity reference. Match exactly: silhouette, proportions, felt cloak colour and "
                     "texture, the egg-round hood seen in strict profile with only a thin dark crescent at its right edge, the two hem "
                     "stripes, the mitten and the small dark iron ring-handle lantern. Change only the pose."}

def style(path, what="rendering"):
    return {"path": path, "role": f"style reference, an approved concept plate. Take only the {what}: soft matte shapes, smooth "
                                  "gradients, fine felt texture on snow and cloth, laminated birch edges and the palette. Do not copy its "
                                  "composition, sky, landscape, characters or night lighting."}

def layout(path, what):
    return {"path": path, "role": f"layout reference only, the current in-game asset that this image replaces. Match its footprint, "
                                  f"aspect and placement of parts ({what}). Ignore its style, colours and rendering entirely."}

def ref(path, role):
    return {"path": path, "role": role}

def sprite(asset, subject, framing, extra_avoid="", lead=LEAD):
    return "\n\n".join([lead, "ASSET: " + asset, "SUBJECT: " + subject, framing, RENDER, LIGHT, AVOID + extra_avoid])

def plate(asset, subject, framing, light):
    return "\n\n".join([LEAD, "ASSET: " + asset, "SUBJECT: " + subject, framing, RENDER_PLATE,
                        "LIGHT AND COLOUR: " + light + " " + LIGHT_PLATE_RULE, AVOID_PLATE])

GAME = "for a calm, wordless 2D side-scrolling mobile game set in kaamos, the Finnish blue polar night"
CUT = "It is cut out on a fully transparent background and placed over a painted landscape in code."
STRIP_CUT = "Cut out on a fully transparent background; the game tiles copies side by side and scrolls them in parallax."

def tiling(band):
    return (f"TILING: The band runs off the left and right image borders; both ends are cut straight and vertically by the borders at "
            f"exactly the same heights, so the right end continues seamlessly into the left end of the next copy. {band} Everything above "
            f"the band is empty transparent space.")

ASSETS = []

def add(batch, rank, prio, name, size, transparent, refs, prompt, use, checks, final_edge, why, step=1, n=3, quality="xhigh"):
    ASSETS.append(dict(name=name, batch=batch, step=step, rank=rank, prio=prio, model=MODEL, size=size, quality=quality, n=n,
                       transparent=transparent, raw=True, refs=refs, prompt=prompt, code_use=use, checks=checks,
                       final_max_edge=final_edge, why=why))

GROUND_BODY = ("Directly under the snow crust the cut edge of the ground is laminated like bent birch plywood: three thin, even, parallel "
               "layers that follow the top curve exactly, in birch white #F2EEE6, birch ply #E2C79C and ply edge #B48E5C. Below the "
               "lamination the body is fully opaque and solid all the way down to the bottom border, with no fade to transparency. The "
               "body shows three or four very wide, very soft, low-contrast strata that follow the top curve, stepping from frost #9DB9CC "
               "through a lilac-tinted blue to kaamos blue #1E3150 at the bottom border, like layers of light laminated deep in the ground; "
               "the strata are smooth gradients with soft edges, never hard stripes.")

GROUNDS = {
    "ground_sauna": ("the sauna clearing", 0.06, "two low snow-capped birch stumps and one tiny stack of split birch logs under snow",
                     R + "ribbon_ride.png", "bent birch plywood ribbon from the concept: match the lamination thickness and colours"),
    "ground_forest": ("the birch and spruce forest", 0.36, "a loose, widely spaced row of small young spruces and thin bare birch saplings "
                      "half buried in the snow, the tallest reaching the top of the band, with generous gaps between them",
                      R + "fells_ride.png", "forest edge reference: match the tapered spruce shapes and the bare birch trunks"),
    "ground_lake": ("the frozen lake", 0.03, "the snow cushion is thin here and the walking surface is clear lake ice in ice #8FC6E0 fading "
                    "to frost, with two faint long hairline cracks and a few small flat snow patches", R + "ice_bite.png",
                    "frozen lake ice from the concept: match the ice colour and its fine frosted surface"),
    "ground_shore": ("the bright shore", 0.16, "tufts of dry winter grass in birch ply #E2C79C poking through the snow and two round granite "
                     "#8A8F9C stones half buried", R + "ribbon_ride.png",
                     "bent birch plywood ribbon from the concept: match the lamination thickness and colours"),
    "ground_harbour": ("the harbour quay", 0.03, "a row of low, rounded granite #8A8F9C edge stones under snow and one snow-covered mooring "
                       "bollard in ply edge #B48E5C", R + "ribbon_ride.png",
                       "bent birch plywood ribbon from the concept: match the lamination thickness and colours"),
}
for i, (name, (biome, top, details, ref2, role2)) in enumerate(GROUNDS.items()):
    feat = round(60 - top / (1 - top) * 40)
    subj = (f"A long band of ground seen exactly from the side. Its walking surface is a thick, soft, rounded cushion of snow in birch "
            f"white #F2EEE6, almost flat, with one or two very gentle, long, low swells, its top at 60 percent of the image height from "
            f"the top. The snow cushion has real volume: brightest along its top, turning smoothly into pale frost #9DB9CC on its rounded "
            f"front face, like the snow in Image 1. {GROUND_BODY} On the snow sit a few small, widely spaced details: {details}. "
            f"Nothing rises above {feat} percent of the image height from the top.")
    add("b1_world", 3, "A", name, "3072x1024", True,
        [ref(E + "d3_ground_26sunburst_wide_v1.png", "the approved ground strip, the identity reference for every biome. Match its snow "
             "cushion, lamination, proportions and rendering exactly; change only the surface details and the strata in the body."),
         ref(ref2, role2), style(C + "concept_final_ride.png")],
        sprite(f"One horizontal ground tile {GAME}: the snowy floor of {biome} that the Keeper walks on. {STRIP_CUT}", subj,
               tiling("The band fills the image from 60 percent height down to the bottom border.")),
        "world.js groundArt: 'ground_' + chunk type, drawn from the walk line to the screen bottom; GTOP[" + name[7:] + "] = " + str(top)
        + " is the share of the trimmed height above the walk line",
        [f"After trim, (walk line row) / (trimmed height) within 0.04 of GTOP {top}", "left and right top-edge heights within 2 px",
         "body opaque to the bottom row (alpha 255 after clamp)", "no hard stripes in the strata"],
        2048, "Bottom 40 percent of every Ride frame is thin grey procedural or 1.5 strips that do not tile; the concept's thick "
              "laminated snow is the brand signature")

FAR = [
    ("far_mountains", "a long low range of rounded Finnish fells (tunturi): three or four overlapping ridges, each one a single unhurried "
     "free curve; the farthest ridge palest in lilac haze #B4A6CE, the nearest in frost #9DB9CC with soft snow on its crest; each crest "
     "carries two thin pale laminated ply lines that follow its curve", "lower 32 percent", R + "fells_ride.png",
     "fell shapes and layering from the concept", R + "fells_joutsen.png", 12),
    ("far_islands", "a chain of low, flat, snow-covered skerries and a distant forested far shore with a fringe of tiny tapered spruces, "
     "three tiny dark wooden cabins and a small boat shed at the water; the cabins' windows are small dark squares (the game lights them "
     "in code); the shore edges are laminated with thin pale ply lines", "lower 22 percent", R + "far_shore_start.png",
     "far shore from the concept: match the scale and spacing of the tiny shoreline buildings and spruce fringe, but no lights",
     R + "far_bite.png", 12),
    ("mid_hills_spruce", "rolling mid-distance snow hills with loose stands of narrow, tapered spruces in spruce #2F4A48 on their slopes "
     "and crests; each hill crest is one long free curve laminated with three thin ply lines", "lower 36 percent", R + "fells_joutsen.png",
     "mid hills and spruce stands from the concept", R + "fells_ride.png", 50),
]
for name, subj, band, r1, role1, r2, factor in FAR:
    add("b1_world", 4, "A", name, "3072x1024", True,
        [ref(r1, role1 + ". Ignore its sky, water reflections and lights."), ref(r2, "second landscape reference for the same layer"),
         style(C + "concept_final_start.png")],
        sprite(f"One horizontal parallax layer {GAME}: {name.replace('_', ' ')}. {STRIP_CUT}", subj + ". The base of the band is a "
               "straight horizontal line filled solid to the bottom of the band; no water, no reflections, no sky.",
               tiling(f"The band occupies the {band} of the image.")),
        f"world.js parallax strip (factor 0.{factor:02d}), drawn at the horizon and tiled", ["seam heights within 2 px",
         "after trim the aspect is at least 8:1", "reads as one silhouette at 32 px height in greyscale"], 2048,
        "Horizon layers are 97 px tall slivers stretched across a 390 pt screen: blurry and without the laminated crests")

add("b1_world", 5, "A", "mid_birch_grove", "2560x1024", True,
    [ref(R + "birches_ride.png", "birch grove from the concept: match the slender white trunks with dark kaamos-blue bark marks and the "
         "fine bare branches; keep only a few small leaves"), ref(R + "prop_birches.png", "birch prop from the approved props sheet: match "
         "its flat rendering"), style(C + "concept_final_joutsen.png")],
    sprite(f"One mid-ground parallax layer {GAME}: a grove of white birches. {STRIP_CUT}",
           "Seven to nine slender Finnish birches of varied height in a loose row, white trunks #F2EEE6 with small dark horizontal bark "
           "marks, fine bare branches with a sparse scatter of tiny leaves in birch ply #E2C79C (the game turns them gold), standing on "
           "two or three low, soft snow mounds whose cut edges are laminated with thin ply lines. Wide gaps between trees.",
           tiling("The grove fills the full image height; the snow mounds touch the bottom border.")),
    "world.js prop('mid_birch_grove') in forest chunks", ["trunks read as individual shapes at 50 percent scale", "no orange leaves"], 2048,
    "Current grove is a flat row of white sticks, no lamination, no depth")

add("b2_keeper_props", 5, "B", "birch_cluster", "1024x1536", True,
    [ref(R + "prop_birches.png", "identity reference from the approved props sheet: match the birch trunks and bare branches"),
     ref(R + "birch_joutsen.png", "concept birch with a few golden leaves"), style(C + "concept_final_joutsen.png")],
    sprite(f"One prop sprite {GAME}: a small cluster of three birches on a snow mound. {CUT}",
           "Three slender birches of different heights growing from one rounded snow mound in birch white whose cut edge shows three "
           "thin laminated ply lines; white trunks with small dark kaamos-blue bark marks, fine bare branches with a sparse scatter of "
           "tiny birch ply #E2C79C leaves.", "FRAMING: Full prop, centred, about 85 percent of the image height, transparent margin on "
           "every side, nothing cropped, no ground beyond the mound."),
    "world.js birch_cluster prop", ["silhouette reads at 32 px"], 1024, "Flat language; align with the grove")

add("b1_world", 6, "B", "sky_aurora", "2304x1536", False,
    [ref(R + "aurora_joutsen.png", "aurora from the concept: match its soft vertical rays and green-to-ice colour"),
     ref(R + "ribbon_ride.png", "bent birch plywood ribbon: the aurora ribbons should have this same laminated, parallel-layer structure"),
     style(C + "concept_final_joutsen.png")],
    "\n\n".join([LEAD, f"ASSET: One additive sky layer {GAME}: the aurora. The game adds this image with additive blending, so pure black "
                 "stays invisible.", "SUBJECT: Three long, gently waving aurora ribbons drifting from lower left to upper right, each "
                 "made of thin parallel layers like a ribbon of bent birch veneer, every layer following the same free curve; soft "
                 "vertical light rays hang from each ribbon. Colour: spring green #5FE3A1 at the lower hem, fading through #9DBE8C to ice "
                 "#8FC6E0 at the tips. Bright but soft, never neon.", "FRAMING: The ribbons span the full width and the middle 70 percent "
                 "of the height; the background everywhere else is pure black #000000, flat, with no stars, no landscape and no noise.",
                 "AVOID: stars, landscape, horizon, text, logo, banding, noise, purple, pink, red, white clipping."]),
    "world.js draws sky_aurora with sat/light on the sky (additive)", ["background RGB max below 6", "no clipping to 255"], 2048,
    "Current aurora is a generic photo-like curtain; the laminated veneer aurora is a signature element (concept 3.4 s3)")

for k, desc in enumerate(["one long, flat, calm cloud bank that thins out at both ends",
                          "two thin stacked cloud streaks, the upper one shorter",
                          "a broken line of four or five small flat cloud wisps"], 1):
    add("b1_world", 6, "A", f"sky_dawn_cloud_{k}", "3072x1024", True,
        [ref(R + "sun_dawn.png", "dawn sky from the concept: match its honey and lilac colours and the soft flat cloud shapes"),
         ref(R + "lake_end.png", "second dawn reference"), style(C + "concept_final_dawn.png")],
        sprite(f"One dawn cloud sprite {GAME}. {CUT}",
               f"{desc.capitalize()}, seen from the side, flat and horizontal, laminated like thin layers of bent birch veneer along its "
               "length. Tops in lilac haze #B4A6CE and pale birch white, undersides lit in honey #FFD58A blending to dawn apricot #F3A57A. "
               "Soft edges, matte, no outlines.",
               "FRAMING: The cloud sits in the middle 30 percent of the image height and spans about 90 percent of the width, transparent "
               "margin on every side.", " Cloud undersides must never be pink, rose, salmon or coral."),
        "world.js CLOUDS at dawn", ["no pixel with hue between 330 and 20 degrees and saturation above 0.35"], 2048,
        "Current dawn clouds have pink undersides (retired dawn-coral range)")

for name, size, which in [("fog_band", "3072x1024", "a long soft fog band, slightly thicker"),
                          ("fog_band_b", "3072x1024", "a thinner, more broken fog band")]:
    add("b1_world", 8, "B", name, size, True,
        [ref(R + "fells_joutsen.png", "valley mist between the fells in the concept: match its softness and frost colour"),
         style(C + "concept_final_start.png")],
        sprite(f"One drifting fog layer {GAME}. {STRIP_CUT}",
               f"{which.capitalize()} of mist in birch white #F2EEE6 and frost #9DB9CC, semi-transparent: its opacity peaks at about 60 "
               "percent along a soft horizontal centre line and fades smoothly to fully transparent at its top and bottom edges. Faint, "
               "long, parallel laminated wisps inside the band, very subtle.",
               tiling("The band occupies the middle 25 percent of the image height.")),
        "world.js fog layers (feathered at both ends by art.js)", ["alpha never above 170", "no grain"], 2048,
        "Old watercolour fog with grain")

FG = [
    ("fg_reeds", "2304x768", "a dense clump of tall frozen reeds and dry grass, some stems bent, small snow caps on the seed heads; colours "
     "spruce #2F4A48 and kaamos blue, seed heads in birch ply", "reed clump, wide and low, rooted along the bottom border", "green"),
    ("fg_rocks", "2048x768", "three rounded granite boulders of different sizes huddled together, each with a soft snow cap whose cut edge "
     "shows two thin laminated ply lines; granite #8A8F9C deepening to kaamos blue", "rocks rooted on the bottom border", "blue"),
    ("fg_branch", "1024x1024", "a spruce bough entering from the top-left corner and hanging down and to the right, with soft snow lying "
     "on its needle layers; spruce #2F4A48 deepening to fjord #0E1A2E", "the bough's base is cut by the top-left corner of the image",
     "green"),
]
for name, size, subj, frame, grp in FG:
    add("b1_world", 3, "A" if name != "fg_branch" else "B", name, size, True,
        [layout(CUR + name + ".png", frame), ref(R + "prop_cairn.png", "approved props sheet: match the flat matte rendering of stone "
                                                       "and snow"), style(C + "concept_final_ride.png")],
        sprite(f"One foreground silhouette sprite {GAME}: it passes in front of the camera and the game darkens it to a soft silhouette. "
               f"{CUT}", subj + ". Big, simple, readable shapes; detail only at the edges.",
               f"FRAMING: {frame}; nothing else in the image."),
        f"world.js foreArt ({grp} group, drawn at light 0.42)", ["reads as a clean shape when darkened to 40 percent"], 1536,
        "Foreground rocks and reeds read as dark blobs; branch is a flat vector cut-out")

POSES = [
    ("figure_stand", "A", 2, "standing still, facing right, body centre at about one third of the image width from the left, the "
     "mitten reaching forward at hip height so the lantern hangs at the right edge of the figure",
     R + "keeper_sheet_stand.png", "FIGS.stand anchors: feet centre x 0.33, hand x 0.90 y 0.40 of the trimmed sprite"),
    ("figure_walk", "A", 2, "walking to the right mid-stride, the cloak hem swinging slightly back, one boot tip forward, the mitten "
     "reaching forward so the lantern leads the way at the right edge of the figure", R + "keeper_sheet_stand.png",
     "FIGS.walk anchors: feet centre x 0.48, hand x 0.93 y 0.44 of the trimmed sprite"),
    ("figure_ride", "A", 2, "riding downhill on two short wooden skis in bent birch ply, leaning forward, the cloak opening out "
     "behind like a bell catching the wind, the lantern held forward", R + "keeper_skis_ride.png",
     "Not drawn by the game yet; its presence in the manifest switches on all raster world art (world.js ART gate)"),
    ("figure_crouch", "B", 7, "crouching low on two short wooden skis, pressing into the slope, the cloak gathered tight, the lantern "
     "held low and forward", R + "keeper_sheet_crouch.png", "Not read by game code; Ride hold pose for pitch and the future Ride"),
    ("figure_sit", "B", 7, "sitting on the ground with legs tucked under the cloak, seen from the side facing right, the lantern set "
     "down on the ground just right of the hem", R + "keeper_sit_start.png",
     "Not read by game code; start-screen and sauna pose for pitch"),
]
for name, prio, rank, pose, poseref, use in POSES:
    add("b2_keeper_props", rank, prio, name, "1024x1024", True,
        [KEEPER_ID, ref(poseref, "pose reference only. Take the pose and gesture; ignore its rendering, its hood opening (it must stay "
                        "edge-on as in Image 1), its lighting and its background."), style(C + "concept_final_ride.png")],
        sprite(f"One character sprite {GAME}: the Keeper, the only character, {pose.split(',')[0]}. {CUT}",
               KEEPER + " Pose: " + pose + ". Seen exactly from the side, facing right.",
               "FRAMING: Full body, about 60 percent of the image height, feet on an invisible ground line, generous empty transparent "
               "margin on every side, nothing cropped. No ground, no snow, no shadow under the feet.", lead=LEAD_KEEPER),
        use, ["same character as Image 1 at thumbnail size", "hood shows only an edge-on crescent, no opening", "lantern unlit",
              "lantern hand position matches the anchors in code_use (measure on the trimmed sprite)"], 768,
        "The Keeper is on screen the whole session; current poses are flat vector cut-outs with a visible hood opening and do not "
        "match each other; the default build shows a white procedural ghost")

PROPS = [
    ("sauna_hut", "1536x1024", 4, "A", R + "prop_sauna.png", "a small Finnish log sauna seen exactly from the side: walls of round "
     "birch-grey logs with ply-edge #B48E5C log ends, a thick soft snow roof whose cut edge is laminated with three ply lines, a short "
     "dark stove pipe, one small square window (dark glass; the game lights it), a plank door and a tiny bench by the wall, standing on "
     "a low snow mound with a laminated edge", "the window and door positions"),
    ("lighthouse", "1024x1536", 4, "A", R + "prop_tower.png", "a plain day-mark tower: a slender tapering white tower #F2EEE6 with no "
     "bands and no stripes, a dark kaamos-blue lantern room with a small domed cap, a narrow gallery rail, standing on rounded granite "
     "rocks with a little snow; the lantern room glass is dark (the game lights it)", "the tower proportions and lamp height"),
    ("pier_boat", "3072x1024", 5, "A", CUR + "pier_boat.png", "a long, low timber jetty on round posts running across the image, its "
     "deck edge laminated like bent ply, a light snow layer on the deck, and a small wooden rowing boat with a birch ply hull and a ply "
     "edge #B48E5C gunwale moored at the right end; no coloured stripes", "the jetty runs the full width in the lower 30 percent"),
    ("boathouse", "1536x1024", 6, "B", CUR + "boathouse.png", "a Finnish lakeside boathouse seen from the gable end: vertical board walls "
     "in muted birch ply #E2C79C, tall double doors in kaamos blue, a steep snow roof whose cut edge is laminated with ply lines, on a "
     "low granite footing", "the gable, doors and footing"),
]
for name, size, rank, prio, r1, subj, keep in PROPS:
    refs = [ref(r1, "identity reference: match this object's design and proportions" if r1.startswith(R) else
                "layout reference only, the current in-game asset: match its footprint and aspect; ignore its style and colours"),
            ref(R + "prop_sauna.png" if name != "sauna_hut" else R + "window_loyly.png",
                "approved props sheet: match its flat matte rendering of wood and snow" if name != "sauna_hut" else
                "detail reference for the sauna's birch-ply joinery; take only the material"),
            style(C + "concept_final_start.png")]
    add("b2_keeper_props", rank, prio, name, size, True, refs,
        sprite(f"One world prop sprite {GAME}: {name.replace('_', ' ')}. {CUT}", subj + ".",
               f"FRAMING: Full prop, centred, transparent margin on every side, nothing cropped; keep {keep} close to the current asset."),
        "world.js prop", ["no lit window or lamp painted", "no red or coral"], 1024,
        "Props must share the Keeper's rendering; old versions are vector-flat or carry coral")

def task(name, rank, prio, size, transparent, refs, asset, subj, framing, use, checks, edge, why, extra_avoid=""):
    add("b3_tasks", rank, prio, name, size, transparent, refs,
        sprite(f"{asset} for a task that opens in an arch window (the Opening) in {GAME[4:]}. {CUT if transparent else ''}".strip(),
               subj, framing, extra_avoid) if transparent else
        plate(asset + f" for a task that opens in an arch window in {GAME[4:]}. It fills its frame edge to edge.", subj, framing,
              "Painted light is allowed here but stays soft."),
        use, checks, edge, why)

TCUR = TASK
task("task_beacon_lighthouse", 1, "A", "1024x1664", True,
     [ref(R + "prop_tower.png", "identity reference: the approved plain day-mark tower; match it exactly, no stripes"),
      layout(TCUR + "task_beacon_lighthouse.png", "tower on its rock base, lamp room near the top"), style(C + "concept_final_bite.png")],
     "One tall sprite: the day-mark tower on its rock island",
     "The same plain day-mark tower as Image 1: slender, tapering, white #F2EEE6 with no bands and no stripes, a dark kaamos-blue lantern "
     "room with a small domed cap and a gallery rail, its glass dark (the game sweeps the beam in code); it stands on a cluster of rounded "
     "granite rocks with snow caps whose cut edges show thin laminated ply lines.",
     "FRAMING: Full tower and rocks, about 92 percent of the image height, centred, nothing cropped.",
     "beacon.js lighthouse in the task and traverse.js station prop", ["no stripes or bands", "lamp room dark"], 1024,
     "Striped lighthouse is explicitly retired (Decisions L3) and it is the biggest object in the beacon task and its station")
task("task_bells_tower", 1, "A", "1024x2048", True,
     [layout(TCUR + "task_bells_tower.png", "a tall narrow tower on rocks with a stack of small windows"),
      ref(R + "prop_sauna.png", "approved props sheet: match the flat matte wood and snow rendering"), style(C + "concept_final_joutsen.png")],
     "One tall sprite: a Finnish wooden bell tower (kellotapuli)",
     "A slender Finnish wooden bell tower: vertical board cladding in birch ply #E2C79C with ply edge corner boards, a tall narrow "
     "belfry opening with louvres, a steep shingled roof in kaamos blue topped by a small onion-free pointed cap, soft snow on the roof "
     "ledges laminated with ply lines, standing on a base of rounded granite rocks with snow. A column of five small square windows down "
     "the front, all dark glass (the game lights them).",
     "FRAMING: Full tower, about 92 percent of the image height, centred, nothing cropped.",
     "bells.js tower and traverse.js station prop", ["windows dark", "no metal shine"], 1024,
     "Current tower is a grey stone spire with a dark render look")
task("task_bells_trio", 1, "A", "2560x1024", True,
     [layout(TCUR + "task_bells_trio.png", "three bells side by side, large, medium, small, separated by clear gaps"),
      ref(R + "kiuas_loyly.png", "matte material reference: take only the soft matte rendering of the dark iron"), style(C + "concept_final_loyly.png")],
     "One sprite sheet: three bells",
     "Three bells side by side from left to right, large, medium and small, each hanging from a short bent birch ply yoke. The bells are "
     "matte, light neutral warm grey, like unglazed ceramic or brushed pewter with clear soft value modelling (light upper left, deeper "
     "lower right), a thin laminated rim band near the mouth and a small dark clapper. The game recolours each bell, so keep them neutral "
     "and evenly lit.",
     "FRAMING: The three bells sit in one row in the middle of the image, each separated from the next by a clear transparent gap of at "
     "least 8 percent of the image width, nothing touching, nothing cropped.",
     "bells.js scan(): auto-slices exactly three alpha runs, then tints with 'color' blending", ["exactly three separate alpha runs",
     "neutral hue, mid-light value"], 1536, "Glossy gold 3D bells are the strongest off-style object in any task")
task("task_lanterns_lantern", 1, "A", "768x2048", True,
     [ref(E + "d2_keeper_26sunburst_refs_v1.png", "the Keeper's lantern in the approved sprite: match its iron, ring handle and shape, "
          "but larger and in full detail; ignore the character"),
      layout(TCUR + "task_lanterns_lantern.png", "a hook at the top, ring handle, tall glass chamber in the middle, base"),
      style(C + "concept_final_bite.png")],
     "One tall sprite: a hanging lantern",
     "A hanging lantern in the same design family as the Keeper's lantern: dark matte iron frame in kaamos blue, a small ring handle on a "
     "short hook at the top, a domed cap with a laminated birch ply band, a tall glass chamber with four slender bars, the glass clear and "
     "pale frost with nothing inside (the game draws the flame), and a small round base.",
     "FRAMING: Full lantern including hook, about 92 percent of the image height, centred, nothing cropped.",
     "lanterns.js lantern (masked with its own alpha; flame drawn on top by code)", ["glass empty and pale", "no flame"], 1024,
     "Victorian brass lanterns with painted flames break the one-light rule")
task("task_lanterns_pier_rope", 2, "A", "2560x1024", True,
     [layout(TCUR + "task_lanterns_pier_rope.png", "two posts at the left and right ends with a sagging rope between them on a deck"),
      ref(R + "ribbon_ride.png", "bent birch plywood: the deck edge should be laminated like this"), style(C + "concept_final_start.png")],
     "One wide sprite: two mooring posts with a rope",
     "A short stretch of snowy jetty deck with a laminated ply edge, two stout round timber posts in ply edge #B48E5C with soft snow caps at "
     "the far left and far right, and one thick felted rope in birch ply sagging in a gentle curve between their tops.",
     "FRAMING: Posts at the left and right edges of the content, the deck along the bottom, transparent margin on every side.",
     "traverse.js lanterns station prop", ["rope curve is one smooth catenary"], 1536, "Brown posts and plain rope are off-style")
task("task_loyly_kiuas", 1, "A", "1536x1024", True,
     [ref(R + "kiuas_loyly.png", "identity reference from the concept: match this round dark sauna stove with its heap of stones"),
      layout(TCUR + "task_loyly_kiuas.png", "the stove body with a small firebox door low on its left half"), style(C + "concept_final_loyly.png")],
     "One sprite: the sauna stove (kiuas)",
     "A round, matte dark iron sauna stove in fjord #0E1A2E and kaamos blue, seen from the side, with a heap of rounded dark granite "
     "stones on top, and a small closed firebox door low on its left half at about one third of its width and 60 percent of its height; "
     "the door is dark and closed (the game draws the embers). Two thin laminated birch ply bands wrap the stove body.",
     "FRAMING: Full stove, about 85 percent of the image height, centred, nothing cropped, no floor.",
     "loyly.js kiuas (code draws fire at x 0.33, y 0.60 of the sprite)", ["no fire, no orange", "door near x 0.33, y 0.60"], 1024,
     "Current stove is a 3D box with painted orange fire")
task("task_loyly_ladle", 2, "A", "3072x1024", True,
     [ref(R + "ladle_loyly.png", "identity reference from the concept: match this bent birch ladle"),
      layout(TCUR + "task_loyly_ladle.png", "horizontal ladle, bowl at the left end, long handle to the right"), style(C + "concept_final_loyly.png")],
     "One sprite: the sauna ladle", "A Finnish sauna ladle carved from birch: a deep round bowl at the left end and a long, slightly "
     "curved handle running to the right, its edge laminated like bent ply. Empty, dry.",
     "FRAMING: Horizontal, about 90 percent of the image width, centred vertically, nothing cropped.", "loyly.js ladle",
     ["bowl at the left"], 1024, "Current ladle is a glossy brass-coloured spoon")
task("task_loyly_bucket", 2, "A", "1024x1152", True,
     [layout(TCUR + "task_loyly_bucket.png", "a sauna bucket with a handle and water inside"),
      ref(R + "ladle_loyly.png", "material reference: the same birch wood"), style(C + "concept_final_loyly.png")],
     "One sprite: the sauna water bucket", "A Finnish sauna bucket of birch ply staves held by two thin ply edge #B48E5C hoops, a bent "
     "birch handle, filled with still water in ice #8FC6E0 seen just over the rim.",
     "FRAMING: Full bucket, about 85 percent of the image height, centred, nothing cropped.", "loyly.js bucket", [], 768,
     "Current bucket is a 3D barrel with metal bands")
task("task_threads_loom_frame", 2, "A", "1024x1024", True,
     [ref(R + "ribbon_ride.png", "bent birch plywood: the frame is made of exactly this laminated ply"),
      layout(TCUR + "task_threads_loom_frame.png", "square frame with an empty square opening"), style(C + "concept_final_loyly.png")],
     "One sprite: a square loom frame of bent birch plywood",
     "A square frame bent from one continuous strip of laminated birch plywood with softly rounded corners, its cut faces showing five "
     "thin parallel layers in birch white, birch ply and ply edge. The frame band is about 8 percent of the image width. The opening inside "
     "is completely empty and transparent.",
     "FRAMING: The frame's outer edge sits about 2 percent inside the image borders on all four sides; nothing inside the opening.",
     "threads.js board frame (board + 12 percent padding each side) and traverse.js station prop",
     ["inner opening alpha 0", "band width 7 to 10 percent"], 1024, "Plain cream square; the bent-ply frame is the most on-brand object possible")
task("task_fork_cairn", 2, "A", "1024x1280", True,
     [ref(R + "prop_cairn.png", "identity reference: the approved cairn from the props sheet"),
      layout(TCUR + "task_fork_cairn.png", "a tall stacked cairn"), style(C + "concept_final_ride.png")],
     "One sprite: a waymark cairn", "A tall cairn of five rounded, flat granite stones stacked in a gently leaning column, granite #8A8F9C "
     "with soft snow on each ledge whose cut edges show thin laminated ply lines, and a small wrap of birch ply felt cord around the "
     "middle stone.", "FRAMING: Full cairn, about 88 percent of the image height, centred, nothing cropped.",
     "fork.js and traverse.js fork station prop", [], 768, "Current cairn is a mossy photographic rock pile")
task("task_fork_waymarker_sheet", 3, "A", "2048x1024", True,
     [ref(R + "prop_cairn.png", "identity reference: the approved cairn stones"), style(C + "concept_final_ride.png")],
     "One two-cell sprite sheet: a cold and a warm waymarker",
     "Two small three-stone waymarkers side by side. Left cell: bare granite stones with snow, cold frost tones. Right cell: the same "
     "waymarker wrapped with a felted band in birch ply #E2C79C and a ply edge stripe, the warm version. No candle, no light.",
     "FRAMING: Each waymarker is centred in its own half of the image, about 70 percent of the image height, with a wide transparent gap "
     "between them.", "fork.js marks(): splits the trimmed sheet into two equal halves (cold, warm)",
     ["after trim the two markers sit in equal halves (repack if not)"], 512, "Current markers are igloos with candles")
task("task_fireflies_jar", 2, "A", "1280x1024", True,
     [layout(TCUR + "task_fireflies_jar.png", "a glass jar with a hinged lid"), ref(R + "window_loyly.png", "material reference: birch ply lid"),
      style(C + "concept_final_joutsen.png")],
     "One sprite: a preserving jar", "A Finnish glass preserving jar lying slightly tilted, matte pale frost glass with soft frosted "
     "highlights only as flat shapes, a round birch ply lid with laminated edge and a thin wire clasp. Empty (the game draws the "
     "fireflies inside).", "FRAMING: Full jar, about 80 percent of the image width, centred, nothing cropped.",
     "fireflies.js jar and traverse.js station prop", ["glass reads over a dark backdrop", "empty"], 768,
     "Current jar is a glossy 3D render")
task("task_fireflies_reeds", 3, "A", "3072x1024", True,
     [layout(TCUR + "task_fireflies_reeds.png", "a wide strip of reeds along frozen water"), style(C + "concept_final_joutsen.png")],
     "One wide strip: reeds along a frozen shore", "A long, low bank of frozen reeds and dry grass along the edge of frozen water: reeds in "
     "spruce and kaamos tones with birch ply seed heads, a laminated snow bank along the bottom, the ice a thin frost band.",
     tiling("The band occupies the lower 35 percent of the image."), "fireflies.js reeds", [], 2048, "Off-style painterly strip")
task("task_beacon_boat", 3, "A", "1536x864", True,
     [layout(TCUR + "task_beacon_boat.png", "a small fishing boat seen from the side, bow to the right"),
      ref(R + "prop_sauna.png", "approved props sheet: match the flat wood rendering"), style(C + "concept_final_bite.png")],
     "One sprite: a small wooden fishing boat", "A small Finnish wooden fishing boat seen exactly from the side, bow to the right: hull in "
     "kaamos blue with a birch ply gunwale laminated like bent ply, a tiny wheelhouse in birch white with a dark window, a short mast. No "
     "stripes in any warm colour.", "FRAMING: Full boat, about 80 percent of the image width, centred, waterline flat, no water.",
     "beacon.js boat", ["no red or coral"], 768, "Dark 3D render boat")
task("task_beacon_ferry", 3, "A", "2048x800", True,
     [layout(TCUR + "task_beacon_ferry.png", "a small passenger ferry seen from the side, bow to the right"),
      ref(R + "prop_sauna.png", "approved props sheet: match the flat rendering"), style(C + "concept_final_bite.png")],
     "One sprite: a small archipelago ferry", "A small Finnish archipelago ferry seen exactly from the side, bow to the right: white "
     "#F2EEE6 superstructure with a row of small dark windows, kaamos blue hull with a laminated ply rubbing strake, one short funnel in "
     "frost. No red or orange band anywhere.", "FRAMING: Full ferry, about 85 percent of the image width, centred, no water.",
     "beacon.js ferry", ["no red funnel"], 1024, "Current ferry has a red stripe")
task("task_beacon_pier_lanterns", 3, "A", "3072x1024", True,
     [layout(TCUR + "task_beacon_pier_lanterns.png", "a long jetty with lantern posts"), ref(E + "d2_keeper_26sunburst_refs_v1.png",
      "the Keeper's lantern: the post lanterns use this same design; ignore the character"), style(C + "concept_final_start.png")],
     "One wide strip: a jetty with lantern posts", "A long low timber jetty with a laminated ply deck edge and light snow, and five evenly "
     "spaced short posts each carrying a small dark iron ring-handle lantern, all unlit.",
     tiling("The jetty occupies the lower 30 percent of the image."), "beacon.js pier", ["lanterns unlit"], 2048,
     "Painted lit lanterns and photographic planks")
task("task_beacon_sea", 4, "B", "3072x1024", True,
     [layout(TCUR + "task_beacon_sea.png", "a thin strip of dark sea"), style(C + "concept_final_bite.png")],
     "One wide strip: calm night sea", "A calm band of sea in kaamos blue and fjord with long, flat, gently curving laminated swell lines "
     "in frost, like layered veneer, darker toward the bottom.", tiling("The band fills the lower 25 percent of the image."),
     "beacon.js sea", [], 2048, "Generic strip")
task("task_reaction_light_fish", 2, "A", "1536x512", True,
     [ref(R + "icehole_bite.png", "concept Bite task: match the calm palette around the ice hole"), style(C + "concept_final_bite.png")],
     "One sprite: a fish seen from the side", "A small, plump, rounded Arctic char seen exactly from the side, facing right, in pale frost "
     "and birch white with a soft ice-blue back and a few tiny dots, its fins laminated like thin veneer. Calm and friendly, no visible eye "
     "detail beyond a tiny dark dot. The game makes it glow in code.",
     "FRAMING: Full fish, about 70 percent of the image width, centred, nothing cropped.", "reaction.js fish (Bite)",
     ["not orange"], 512, "Current fish is a bright orange glowing goldfish", extra_avoid=" No glow, no trail.")
task("task_reaction_splash_sheet", 3, "A", "3072x1024", True,
     [ref(R + "icehole_bite.png", "concept Bite task: match the water ring and ice colours"), style(C + "concept_final_bite.png")],
     "One four-frame sprite sheet: a small splash", "Four frames of one small water splash rising out of an ice hole, left to right: a "
     "ring forming, a crown rising, the crown at its peak with a few droplets, the droplets falling back. Water in ice #8FC6E0 and frost "
     "with birch white crests, flat matte shapes.", "FRAMING: Four frames in four equal columns across the full width, each splash centred "
     "in its column on the same baseline at 65 percent height, a clear transparent gap between frames.",
     "reaction.js splash (aspect/4 per frame)", ["four equal columns after trim (repack if not)"], 1536, "Generic white splashes")
task("task_fireflies_firefly_sheet", 5, "B", "3072x1024", True,
     [style(C + "concept_final_joutsen.png")], "One four-frame sprite sheet: a firefly",
     "Four frames of one tiny round felted firefly seen from the side, facing right, wings beating: wings up, wings level, wings down, "
     "wings level. Body in kaamos blue, wings in pale frost, a soft honey-coloured abdomen tip (the game adds the glow).",
     "FRAMING: Four frames in four equal columns across the full width, each firefly centred at mid height, same size.",
     "fireflies.js (aspect/4 per frame)", ["four equal columns (repack if not)"], 1024, "Cartoon bugs")
task("task_stars_sky", 3, "A", "1536x1024", False,
     [ref(C + "concept_final_joutsen.png", "concept Joutsen frame: match its blue-hour sky, the lilac band and the low fells"),
      ref(R + "fells_joutsen.png", "fells and lake from the concept")],
     "One full-bleed backdrop: the night sky behind the swan constellation",
     "A calm blue-hour sky over a quiet Finnish lake: a perfectly smooth gradient from fjord #0E1A2E at the top through kaamos blue to a "
     "soft lilac haze #B4A6CE band at the horizon, a few faint pin-point stars only in the upper half, low laminated fells and a thin "
     "spruce fringe across the bottom 15 percent. No constellation (the game draws it).",
     "FRAMING: Full bleed, the horizon at 85 percent height, the sky empty and calm.",
     "stars.js sky", ["no banding", "no constellation lines"], 1536, "Painterly sky with a busy landscape")
task("task_shutters_facade", 2, "A", "2560x1024", True,
     [layout(TCUR + "task_shutters_facade.png", "a row of small wooden houses with windows"),
      ref(R + "prop_sauna.png", "approved props sheet: match the flat wood and snow rendering"), style(C + "concept_final_end.png")],
     "One wide sprite: a row of Finnish wooden houses",
     "A row of four small Finnish wooden houses side by side, vertical board walls in muted birch ply, frost and ceiling green #C8D6BE "
     "(no red, no orange, no yellow walls), white window frames with closed pale shutters, steep snow roofs with laminated ply edges, two "
     "bare birches between them.",
     "FRAMING: The houses fill the full width and the lower 85 percent of the image; above the roofs is transparent.",
     "shutters.js facade backdrop and traverse.js station prop", ["check in the task that the panel reads behind the roofs; current file is opaque"],
     2048, "Opaque photo-like red and yellow houses sit in the world as a hard rectangle")
task("task_shutters_dawn_view", 3, "A", "1536x1024", False,
     [ref(C + "concept_final_dawn.png", "concept dawn: match its sun, lilac sky and laminated snow hills"), ref(R + "lake_end.png", "dawn lake")],
     "One full-bleed backdrop: the dawn view out of a window",
     "A wide dawn view over a frozen Finnish lake: honey #FFD58A sun just above laminated snow fells, a smooth lilac-to-apricot sky, a "
     "line of tiny spruces, soft reflections on the ice.", "FRAMING: Full bleed, horizon at 55 percent height, the sun right of centre.",
     "shutters.js dawn view behind the window", ["sun never white"], 1536, "Painterly window scene with frame painted in")

KEEP = [
    ("task_stars_swan_line", "stars.js maps star anchors to fixed pixel positions (IW 835, IH 387); a regenerated line would misalign them"),
    ("task_lanterns_flame", "light sprite, emissive by design (concept 3.2); recolour to honey in code if needed"),
    ("task_lanterns_sky_bloom", "light sprite; recolour to honey in code"),
    ("task_bells_lamp_glow", "light sprite; recolour to honey in code"),
    ("task_bells_comet", "light sprite"),
    ("task_fireflies_light_column", "light sprite"),
    ("task_stars_star", "light sprite"),
    ("task_loyly_panel_fog", "soft gradient, reads fine"),
    ("task_threads_knot_glyphs", "flat white glyphs auto-sliced by alpha; fine as is"),
]

PORTRAIT = "1184x2560"
SERIES_ROLE = ("composition reference, the approved first image of this series. Keep its exact composition: the same bay, shoreline, fells, "
               "laminated snow ledge, far shore and camera. Change only what the prompt names.")
BAY = ("A wide northern Finnish bay seen from a laminated snow ledge in the lower left: the ledge is one long free curve of deep snow whose "
       "cut edge shows four laminated ply lines; beyond it calm water, a far shore of low rounded fells with a thin spruce fringe, a tiny "
       "village of cabins along the far shore and a small plain white day-mark tower at the right end of the far shore. The Keeper sits small "
       "on the ledge, seen from behind and slightly to the side, under 6 percent of the frame height. The upper 40 percent is open sky with "
       "room for a caption.")
KEEPER_PLATE = ("The Keeper, never facing the viewer: " + KEEPER.replace("One small mitten in ply edge #B48E5C holds a small dark iron lantern with a ring handle, its glass dark and unlit.", "Its lantern is a small dark iron lantern with a ring handle whose flame glows softly in honey #FFD58A.").replace(" The hood is seen in strict profile: its opening points right and is seen edge-on, so "
                                                "only a thin dark kaamos-blue #1E3150 crescent shows along the right edge of the hood; "
                                                "nothing visible inside, no face.", " The hood is seen from behind, no face visible."))
KA_REFS1 = [ref(C + "concept_final_start.png", "composition and mood reference: the approved start plate; take its bay, ledge and far "
                "shore layout, re-staged for a taller frame"),
            ref(E + "d2_keeper_26sunburst_refs_v1.png", "the Keeper identity reference: match the character exactly, shown small"),
            style(C + "concept_final_ride.png")]
FIRST = "art/final2/keyart/keyart_store_1_kaamos.png"
KA = [
    ("keyart_store_1_kaamos", 1, KA_REFS1, "kaamos, the blue polar night: the whole frame in cyanotype blues from fjord #0E1A2E to frost, the "
     "only warm light the Keeper's small lantern on the ledge (honey #FFD58A), a faint thin aurora veil high in the sky, a few pin-point stars",
     "The first image of a five-image store series that performs the colour return. Night."),
    ("keyart_store_2_first_light", 2, None, "first light: the Keeper now rides down the ledge on short birch-ply skis toward the water, lantern "
     "forward; the birches on the near shore and the ply edges have turned warm birch ply and gold; the sky lifts to kaamos blue with a "
     "soft lilac horizon", "Colour group yellow returns."),
    ("keyart_store_3_blue_hour", 2, None, "blue hour: the water and ice turn ice blue #8FC6E0, a lilac haze band sits on the horizon, and in "
     "the open sky a swan constellation is drawn as one continuous fine honey line linking eight small stars; the Keeper stands on the ledge "
     "looking up", "Colour group blue returns; Joutsen."),
    ("keyart_store_4_first_green", 2, None, "first green: an aurora unfurls across the sky as long ribbons of laminated veneer in spring "
     "green to ice, the spruce fringe turns deep spruce green, the Keeper stands on the ledge holding the lantern up", "Colour group green returns."),
    ("keyart_store_5_dawn", 2, None, "dawn: a honey #FFD58A sun (never white) rises just above the far fell right of centre, the sky turns "
     "from lilac to dawn apricot at the horizon, the snow glows in honey and lilac shadows, a long soft sun path on the water; the Keeper "
     "stands on the ledge raising the lantern toward the sun", "Full colour; the handover to morning."),
]
for name, step, refs, stage, note in KA:
    r = refs or [ref(FIRST, SERIES_ROLE), ref(E + "d2_keeper_26sunburst_refs_v1.png", "the Keeper identity reference, shown small"),
                 ref(C + {"keyart_store_2_first_light": "concept_final_ride.png", "keyart_store_3_blue_hour": "concept_final_joutsen.png",
                          "keyart_store_4_first_green": "concept_final_joutsen.png", "keyart_store_5_dawn": "concept_final_dawn.png"}[name],
                     "light and colour reference for this stage; take only its light, palette and sky, not its composition")]
    add("b4_backdrops_keyart", 0, "A", name, PORTRAIT, False, r,
        plate("One portrait store screenshot and pitch hero plate for Afferent, a calm two-minute morning game played lying in bed. " + note,
              BAY + " " + KEEPER_PLATE, "FRAMING: Portrait, full bleed, the Keeper and ledge in the lower third, the far shore at about 58 "
              "percent height, the sky above calm and uncluttered for a caption set later in code.", "Stage: " + stage + "."),
        "Not in the game. Store page (5 portrait screenshots, captions set in code) and pitch deck colour-return sequence (concept 13)",
        ["same composition across the five", "Keeper under 6 percent of frame height", "one warm light only (dawn: the sun)"], 2560,
        "Pitch and store key art", step=step)

add("b4_backdrops_keyart", 0, "A", "keyart_hero_panorama", "2560x1280", False,
    [ref(C + "concept_final_start.png", "night half reference: kaamos bay and far shore"),
     ref(C + "concept_final_dawn.png", "dawn half reference: sun over the fells"),
     ref(E + "d2_keeper_26sunburst_refs_v1.png", "the Keeper identity reference, shown very small")],
    plate("One landscape hero image for Afferent (store feature graphic and the pitch title slide). The colour return in one frame.",
          "A single continuous Finnish winter panorama read from left to right as the passage from night to morning: at the far left "
          "kaamos night in cyanotype blues with a few stars and a faint aurora; moving right the land picks up birch gold, then ice blue "
          "water and a lilac band, then spruce green, and at the far right a honey sun rising over a laminated fell. One long laminated snow "
          "ribbon, a free curve like bent birch plywood, runs the full width in the foreground as the path. The Keeper walks on it at "
          "about 40 percent of the width, tiny (under 5 percent of the frame height), lantern forward. " + KEEPER_PLATE,
          "FRAMING: 2:1 landscape, full bleed, horizon at 60 percent height, generous empty sky across the top 45 percent for a wordmark "
          "set in code.", "The single warm focal light is the rising sun at the right; the Keeper's lantern is a small honey point."),
    "Not in the game. Store feature graphic and pitch title slide (concept 13: header with the Keeper under 5 percent and the sun as focal light)",
    ["gradient across the frame reads night to dawn", "no visible seams between the stages"], 2560, "Pitch hero")

BG = [
    ("bg_start", "1600x2400", C + "concept_final_start.png", "Night start: the Keeper sits on a laminated snow ledge in the lower left, lantern "
     "beside it as the only warm light, calm bay, far shore with a tiny village and a plain day-mark tower, a big quiet kaamos sky.",
     "kaamos night, cyanotype blues, the lantern the only warm light"),
    ("bg_end_dawn", "1600x2400", C + "concept_final_end.png", "Morning end: the Keeper stands on a laminated snow ledge at the left of the "
     "frame, lantern at the side, looking over a frozen lake at a honey sun over the fells, a long sun path on the ice.",
     "full dawn: honey sun, lilac and apricot sky, honey snow with lilac shadows"),
    ("bg_end_night", "1600x2400", C + "concept_final_start.png", "Night end (sessions that end in the evening): the Keeper sits on the ledge "
     "beside the lantern, the bay is still, the far-shore village has small honey window lights.",
     "late night in dusk lilac #6E6590 and kaamos blues, very dim, the lantern and the far windows the only warm points"),
    ("bg_patient", "2400x1600", C + "concept_final_patient.png", "Daylight shore for the patient view header: a bright shore with birches "
     "at the left, calm water, low fells, the Keeper small at the right edge of the water looking out, lantern in hand.",
     "clear winter morning, birch white, ice blue, spring green grass at the edge, honey sun low on the horizon"),
]
for name, size, r1, subj, light in BG:
    add("b4_backdrops_keyart", 8, "B", name, size, False,
        [ref(r1, "the approved concept plate for this backdrop: keep its composition and content; render it again at higher fidelity"),
         ref(E + "d2_keeper_26sunburst_refs_v1.png", "the Keeper identity reference"), style(C + "concept_final_ride.png")],
        plate(f"One full-bleed backdrop for Afferent ({name}).", subj + " " + KEEPER_PLATE, "FRAMING: Full bleed, the Keeper small in "
              "the lower third, generous calm sky.", light + "."),
        "Not read by the game (only demo/js/shaders/light-reveal.lab.js reads bg_start and bg_end_dawn); pitch, store and future start "
        "and end screens", ["matches the concept plate", "no UI, no text"], 2400, "Pitch plates at 2.4x the resolution of the 1.5 plates")

BATCHES = {
    "b1_world": "World layers (ground, horizon, sky, foreground)",
    "b2_keeper_props": "Keeper and world props",
    "b3_tasks": "Task art for the Opening (only names the task code reads)",
    "b4_backdrops_keyart": "Backdrops and pitch key art",
}

def est(a):
    w, h = map(int, a["size"].split("x"))
    return round(a["n"] * (0.125 * w * h / 2**20 + 0.012 * len(a["refs"])), 2)

plan = {
    "name": "v5 production set (Layers of Light, gpt-image-2.6-sunburst)",
    "layout": "sections",
    "style": "Unused: every asset in this plan is raw and carries its full sectioned prompt.",
    "model": MODEL,
    "n": 3,
    "notes": [
        "Built by art/v5refs/build_plan_v5.py; reference crops by art/v5refs/make_refs_v5.py (UI-free concept rasters only).",
        "Recipe: design/image-prompting.md section 5. Every asset is raw (prompt verbatim) with numbered reference roles.",
        "Finalise every pick: clamp alpha >= 248 to 255, judge over a dark backdrop, trim, downscale to final_max_edge, copy to "
        "art/final2/<batch>/<name>.png. Swap into demo/assets (world, Keeper, props) or the minigame demo/assets (task_*) only in Select.",
        "Raster world art is only drawn with ?art=v3 or when figure_ride is in demo/assets/manifest.json (world.js ART gate).",
        "Fields batch, step, rank, code_use, checks, final_max_edge, why and est_usd are documentation; generate.py ignores them.",
    ],
    "batches": {},
    "assets": [],
    "keep": [{"name": n, "action": "keep", "why": w} for n, w in KEEP],
}
for a in ASSETS:
    a["est_usd"] = est(a)
plan["assets"] = sorted(ASSETS, key=lambda a: (list(BATCHES).index(a["batch"]), a["step"], a["rank"], a["name"]))
for b, title in BATCHES.items():
    items = [a for a in plan["assets"] if a["batch"] == b]
    steps = sorted({a["step"] for a in items})
    plan["batches"][b] = {
        "title": title,
        "images": sum(a["n"] for a in items),
        "est_usd": round(sum(a["est_usd"] for a in items), 2),
        "steps": {str(s): [a["name"] for a in items if a["step"] == s] for s in steps},
        "commands": [f"uv run art/generate.py --plan art/plan_v5.json --out art/final2/raw/{b} --jobs 1 --sheet --only "
                     + " ".join(a["name"] for a in items if a["step"] == s) for s in steps],
    }
plan["est_total_usd"] = round(sum(a["est_usd"] for a in ASSETS), 2)
OUT.write_text(json.dumps(plan, indent=1, ensure_ascii=False) + "\n")
print(len(ASSETS), "assets,", sum(a["n"] for a in ASSETS), "images, est", plan["est_total_usd"])
for b, v in plan["batches"].items():
    print(b, v["images"], v["est_usd"], {k: len(x) for k, x in v["steps"].items()})
