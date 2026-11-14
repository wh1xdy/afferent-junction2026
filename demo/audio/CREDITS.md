# Audio credits

Every sound file in `demo/audio/` is listed here with its source, author, license and what was changed. Only CC0 1.0 and public-domain sources are used, so no attribution is legally required; it is given anyway. No CC-BY, no CC BY-SA, no non-commercial and no unclear licenses are in this folder.

Collected and processed on 14 Nov 2026 for Afferent (Junction 2026).

## Licenses used

| License | What it allows | Link |
|---|---|---|
| CC0 1.0 Universal (Freesound) | Any use, including commercial, modification and redistribution, no attribution required | https://creativecommons.org/publicdomain/zero/1.0/ |
| Public domain, PD-self (Wikimedia Commons, released by the author) | Any use, no attribution required | https://commons.wikimedia.org/wiki/Template:PD-self |

Each Freesound page was checked on 14 Nov 2026 and showed "Creative Commons 0". Each Commons file page was checked and carries `{{PD-self}}`.

## Source quality note (action for David)

Freesound serves original files only to logged-in users. These files were built from Freesound's public HQ previews (Ogg Vorbis, 192 kbps, 48 kHz or 44.1 kHz). The license covers the sound itself, so the previews are fine to ship, but the originals (WAV or FLAC, up to 96 kHz) will sound cleaner on headphones after the +15 to +28 dB gain some quiet field recordings needed. Before a store release, log in, download the original from each Freesound URL below and re-run the same recipe (the slice start, loop length, crossfade and target per file are stored in `manifest.json` and in the change notes below).

## Processing recipe (ffmpeg 9, same for every file)

1. Decode, resample to 48 kHz; downmix to mono for point sources and one-shots, keep stereo for beds.
2. Highpass (25 Hz for beds, 40 Hz for one-shots, 60 to 80 Hz for steps and taps, 150 Hz for birds to remove wind rumble).
3. Beds: cut `loop + crossfade` seconds, fold the last `crossfade` seconds onto the start with an equal-power (quarter sine) crossfade, so the loop is seamless. Then add 0.5 s of circular padding on each side (end of loop before, start of loop after), so encoder priming and padding in AAC and Opus never land inside the loop. Play from `loopStart` to `loopEnd` (both in `manifest.json`).
4. One-shots: slice, short fade in, fade out on the tail.
5. Loudness (EBU R128, measured with ffmpeg `loudnorm`): beds to -23 LUFS integrated, a peak limiter at -3 dBFS only where the gain would push true peak above -1 dBTP. One-shots aim for -18 LUFS but are never limited: the gain stops at -1.5 dBTP, so short transients (steps, taps, ice pings, cracks) land quieter in LUFS but keep their attack. The real values are in each line below and in `manifest.json`.
6. Encode: AAC LC in `.m4a` (Apple AudioToolbox encoder, 128 kbps stereo, 80 kbps mono, for iOS) and Opus in `.ogg` (96 kbps stereo, 64 kbps mono, for Android and Chrome).
7. Seams checked by decoding both formats and comparing the sample step across the loop point with the 99.9th percentile step inside the loop: all 16 loops pass in both formats.

## Files

### ambience/
- **amb_night_air** (`.m4a`, `.ogg`)
  - Source: Freesound, "forest light wind through bare trees winter GREAT FOR FALLING SNOW.flac" by kyles, https://freesound.org/people/kyles/sounds/637566/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: 3s to 52.0s, seamless loop 45.0s (equal-power crossfade 4s), 0.5s circular pad each side, stereo, 48 kHz, highpass 25 Hz, gain +28.1 dB to -23.0 LUFS, true peak -1.9 dBTP, AAC 48 kHz and Opus
- **amb_wind_fell** (`.m4a`, `.ogg`)
  - Source: Freesound, "Wind__Artic__Cold.wav" by cobratronik, https://freesound.org/people/cobratronik/sounds/117136/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: 1.5s to 55.5s, seamless loop 50.0s (equal-power crossfade 4s), 0.5s circular pad each side, stereo, 48 kHz, highpass 25 Hz, gain -4.5 dB to -23.0 LUFS, true peak -9.7 dBTP, AAC 48 kHz and Opus
- **amb_forest_birch** (`.m4a`, `.ogg`)
  - Source: Freesound, "winter wind in trees.wav" by lwdickens, https://freesound.org/people/lwdickens/sounds/261226/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: 5s to 59.0s, seamless loop 50.0s (equal-power crossfade 4s), 0.5s circular pad each side, stereo, 48 kHz, highpass 25 Hz, gain +24.2 dB to -23.0 LUFS, true peak -3.6 dBTP, AAC 48 kHz and Opus
- **amb_snowfall** (`.m4a`, `.ogg`)
  - Source: Freesound, "snowing in Dresden-Heide" by krnd, https://freesound.org/people/krnd/sounds/90898/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: 50s to 104.0s, seamless loop 50.0s (equal-power crossfade 4s), 0.5s circular pad each side, stereo, 48 kHz, highpass 25 Hz, gain +14.8 dB to -23.1 LUFS, true peak -1.7 dBTP, AAC 48 kHz and Opus
- **amb_lake_ice_night** (`.m4a`, `.ogg`)
  - Source: Freesound, "frozen lake" by mentos987, https://freesound.org/people/mentos987/sounds/818918/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: 1.5s to 55.5s, seamless loop 50.0s (equal-power crossfade 4s), 0.5s circular pad each side, stereo, 48 kHz, highpass 25 Hz, gain +20.5 dB to -23.0 LUFS, true peak -2.8 dBTP, AAC 48 kHz and Opus
- **amb_lake_under_ice** (`.m4a`, `.ogg`)
  - Source: Freesound, "AMBLake Water moving under ice, lake ambience in a windy forest, Stora Alljungen, Sweden" by vhio, https://freesound.org/people/vhio/sounds/790541/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: 10s to 74.0s, seamless loop 60.0s (equal-power crossfade 4s), 0.5s circular pad each side, stereo, 48 kHz, highpass 25 Hz, gain +27.7 dB to -23.0 LUFS, true peak -1.1 dBTP, AAC 48 kHz and Opus
- **amb_shore_waves** (`.m4a`, `.ogg`)
  - Source: Freesound, "Gentle small waves lapping on shore.wav" by Alex_hears_things, https://freesound.org/people/Alex_hears_things/sounds/352356/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: 5s to 69.0s, seamless loop 60.0s (equal-power crossfade 4s), 0.5s circular pad each side, stereo, 48 kHz, highpass 25 Hz, gain +11.9 dB to -23.0 LUFS, true peak -1.1 dBTP, AAC 48 kHz and Opus
- **amb_lake_lapping** (`.m4a`, `.ogg`)
  - Source: Freesound, "Water_Lapping_River.wav" by ceich93, https://freesound.org/people/ceich93/sounds/318064/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: 2s to 55.0s, seamless loop 50.0s (equal-power crossfade 3s), 0.5s circular pad each side, stereo, 48 kHz, highpass 25 Hz, gain +4.8 dB to -23.0 LUFS, true peak -1.4 dBTP, AAC 48 kHz and Opus
- **amb_harbour_rope** (`.m4a`, `.ogg`)
  - Source: Freesound, "Mooring Rope.wav" by Rmutt, https://freesound.org/people/Rmutt/sounds/145721/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: 1s to 67.0s, seamless loop 62.0s (equal-power crossfade 4s), 0.5s circular pad each side, mono, 48 kHz, highpass 25 Hz, gain +0.9 dB to -26.8 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **amb_sauna_stove** (`.m4a`, `.ogg`)
  - Source: Freesound, "2023-06-18-sauna-oven-noise-drone-002" by ilmari_freesound, https://freesound.org/people/ilmari_freesound/sounds/691498/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: 83.4s to 137.4s, seamless loop 50.0s (equal-power crossfade 4s), 0.5s circular pad each side, stereo, 48 kHz, highpass 25 Hz, gain +0.4 dB to -23.0 LUFS, true peak -4.9 dBTP, AAC 48 kHz and Opus
- **amb_fire_crackle** (`.m4a`, `.ogg`)
  - Source: Freesound, "Lit Fireplace" by lurpsis, https://freesound.org/people/lurpsis/sounds/444127/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: 37.9s to 85.9s, seamless loop 45.0s (equal-power crossfade 3s), 0.5s circular pad each side, mono, 48 kHz, highpass 25 Hz, gain +5.5 dB to -23.2 LUFS, true peak -2.0 dBTP, AAC 48 kHz and Opus
- **amb_boat_far** (`.m4a`, `.ogg`)
  - Source: Freesound, "Boat on the Gulf of Finland" by miklovan, https://freesound.org/people/miklovan/sounds/195892/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: 2s to 46.0s, seamless loop 40.0s (equal-power crossfade 4s), 0.5s circular pad each side, mono, 48 kHz, highpass 25 Hz, lowpass 1400 Hz, gain -4.8 dB to -23.0 LUFS, true peak -4.7 dBTP, AAC 48 kHz and Opus
- **amb_dawn_woodland** (`.m4a`, `.ogg`)
  - Source: Freesound, "Windy UK Woodland in late Winter with European Robin singing" by chris_dagorne, https://freesound.org/people/chris_dagorne/sounds/563153/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: 45.6s to 109.6s, seamless loop 60.0s (equal-power crossfade 4s), 0.5s circular pad each side, stereo, 48 kHz, highpass 25 Hz, gain +14.7 dB to -23.0 LUFS, true peak -4.0 dBTP, AAC 48 kHz and Opus
- **amb_ride_ski** (`.m4a`, `.ogg`)
  - Source: Freesound, "Alpine_ski_POV -  - Stereo Out.wav" by Lydmakeren, https://freesound.org/people/Lydmakeren/sounds/567839/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: 87.2s to 130.2s, seamless loop 40.0s (equal-power crossfade 3s), 0.5s circular pad each side, stereo, 48 kHz, highpass 25 Hz, gain -6.3 dB to -23.0 LUFS, true peak -10.0 dBTP, AAC 48 kHz and Opus
- **amb_ride_drag** (`.m4a`, `.ogg`)
  - Source: Freesound, "sled inuit drag across snow.wav" by kyles, https://freesound.org/people/kyles/sounds/450847/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: 0.8s to 10.8s, seamless loop 8.5s (equal-power crossfade 1.5s), 0.5s circular pad each side, mono, 48 kHz, highpass 25 Hz, gain -0.8 dB to -23.0 LUFS, true peak -7.2 dBTP, AAC 48 kHz and Opus
- **amb_wind_chimes** (`.m4a`, `.ogg`)
  - Source: Freesound, "Wind chimes 1" by giddster, https://freesound.org/people/giddster/sounds/437337/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: 20.2s to 74.2s, seamless loop 50.0s (equal-power crossfade 4s), 0.5s circular pad each side, stereo, 48 kHz, highpass 25 Hz, gain +10.1 dB to -23.1 LUFS, true peak -3.0 dBTP, AAC 48 kHz and Opus

### sfx/
- **sfx_step_snow_01** (`.m4a`, `.ogg`)
  - Source: Freesound, "Footsteps_Mountain_Boots_Snow_Walk_Mono.wav" by Nox_Sound, https://freesound.org/people/Nox_Sound/sounds/613849/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 1.0s + 0.65s, fade in 0.004s, fade out 0.15s, mono, 48 kHz, highpass 60 Hz, gain +17.3 dB to -20.3 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_step_snow_02** (`.m4a`, `.ogg`)
  - Source: Freesound, "Footsteps_Mountain_Boots_Snow_Walk_Mono.wav" by Nox_Sound, https://freesound.org/people/Nox_Sound/sounds/613849/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 2.75s + 0.65s, fade in 0.004s, fade out 0.15s, mono, 48 kHz, highpass 60 Hz, gain +13.2 dB to -21.5 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_step_snow_03** (`.m4a`, `.ogg`)
  - Source: Freesound, "Footsteps_Mountain_Boots_Snow_Walk_Mono.wav" by Nox_Sound, https://freesound.org/people/Nox_Sound/sounds/613849/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 4.48s + 0.65s, fade in 0.004s, fade out 0.15s, mono, 48 kHz, highpass 60 Hz, gain +18.4 dB to -18.8 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_step_snow_04** (`.m4a`, `.ogg`)
  - Source: Freesound, "Footsteps_Mountain_Boots_Snow_Walk_Mono.wav" by Nox_Sound, https://freesound.org/people/Nox_Sound/sounds/613849/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 6.38s + 0.65s, fade in 0.004s, fade out 0.15s, mono, 48 kHz, highpass 60 Hz, gain +16.7 dB to -22.4 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_ski_swish** (`.m4a`, `.ogg`)
  - Source: Freesound, "Ski passby" by cribbler, https://freesound.org/people/cribbler/sounds/592379/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 0.0s + 2.4s, fade in 0.004s, fade out 0.8s, stereo, 48 kHz, highpass 40 Hz, gain -0.3 dB to -18.0 LUFS, true peak -3.5 dBTP, AAC 48 kHz and Opus
- **sfx_land_snow** (`.m4a`, `.ogg`)
  - Source: Freesound, "JM_IMPACT_01c - Snow on cement.wav" by Julien_Matthey, https://freesound.org/people/Julien_Matthey/sounds/167080/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 0.0s + 0.89s, fade in 0.004s, fade out 0.25s, mono, 48 kHz, highpass 40 Hz, gain -1.9 dB to -33.1 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_ice_ping** (`.m4a`, `.ogg`)
  - Source: Freesound, "rock hitting icy lake" by ultraaxvii, https://freesound.org/people/ultraaxvii/sounds/591152/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 0.0s + 0.89s, fade in 0.004s, fade out 0.2s, mono, 48 kHz, highpass 40 Hz, gain -2.0 dB to -38.0 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_ice_crack_01** (`.m4a`, `.ogg`)
  - Source: Freesound, "Ice Cracks" by karlis.stigis, https://freesound.org/people/karlis.stigis/sounds/168712/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 4.2s + 1.8s, fade in 0.004s, fade out 0.6s, mono, 48 kHz, highpass 40 Hz, gain -3.3 dB to -25.5 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_ice_crack_02** (`.m4a`, `.ogg`)
  - Source: Freesound, "Ice Cracks" by karlis.stigis, https://freesound.org/people/karlis.stigis/sounds/168712/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 76.2s + 1.8s, fade in 0.004s, fade out 0.6s, mono, 48 kHz, highpass 40 Hz, gain -1.8 dB to -24.4 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_ice_crack_03** (`.m4a`, `.ogg`)
  - Source: Freesound, "Ice Cracks" by karlis.stigis, https://freesound.org/people/karlis.stigis/sounds/168712/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 89.6s + 1.8s, fade in 0.004s, fade out 0.6s, mono, 48 kHz, highpass 40 Hz, gain -2.0 dB to -22.3 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_ice_boom_01** (`.m4a`, `.ogg`)
  - Source: Freesound, "Ice - Lake fractures" by Vrymaa, https://freesound.org/people/Vrymaa/sounds/737896/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 23.0s + 3.0s, fade in 0.004s, fade out 1.2s, mono, 48 kHz, highpass 25 Hz, gain -6.9 dB to -18.0 LUFS, true peak -6.5 dBTP, AAC 48 kHz and Opus
- **sfx_ice_boom_02** (`.m4a`, `.ogg`)
  - Source: Freesound, "Ice - Lake fractures" by Vrymaa, https://freesound.org/people/Vrymaa/sounds/737896/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 8.9s + 2.5s, fade in 0.004s, fade out 1.0s, mono, 48 kHz, highpass 25 Hz, gain -3.1 dB to -18.0 LUFS, true peak -2.9 dBTP, AAC 48 kHz and Opus
- **sfx_icicle_tinkle_01** (`.m4a`, `.ogg`)
  - Source: Freesound, "Breaking icicles 4" by AugustSandberg, https://freesound.org/people/AugustSandberg/sounds/677718/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 0.0s + 2.2s, fade in 0.004s, fade out 0.8s, mono, 48 kHz, highpass 40 Hz, gain +9.9 dB to -23.5 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_icicle_tinkle_02** (`.m4a`, `.ogg`)
  - Source: Freesound, "Breaking icicles 4" by AugustSandberg, https://freesound.org/people/AugustSandberg/sounds/677718/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 7.6s + 2.4s, fade in 0.004s, fade out 0.8s, mono, 48 kHz, highpass 40 Hz, gain +1.5 dB to -30.4 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_loyly_hiss_01** (`.m4a`, `.ogg`)
  - Source: Freesound, "2023-06-18-sauna-ambience" by ilmari_freesound, https://freesound.org/people/ilmari_freesound/sounds/691496/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 35.2s + 7.5s, fade in 0.05s, fade out 2.5s, mono, 48 kHz, highpass 40 Hz, gain +2.0 dB to -18.8 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_loyly_hiss_02** (`.m4a`, `.ogg`)
  - Source: Freesound, "Sauna hiss / löyly" by tonalt, https://freesound.org/people/tonalt/sounds/361383/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 11.3s + 8.0s, fade in 0.05s, fade out 3.0s, mono, 48 kHz, highpass 40 Hz, gain -4.2 dB to -24.5 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_loyly_hiss_long** (`.m4a`, `.ogg`)
  - Source: Freesound, "Steam.mp3" by Ciuas, https://freesound.org/people/Ciuas/sounds/400623/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 2.5s + 16.0s, fade in 0.1s, fade out 6.0s, mono, 48 kHz, highpass 40 Hz, gain +1.8 dB to -18.0 LUFS, true peak -3.2 dBTP, AAC 48 kHz and Opus
- **sfx_stove_door** (`.m4a`, `.ogg`)
  - Source: Freesound, "2021-09-03-sauna-fire-door-013.wav" by ilmari_freesound, https://freesound.org/people/ilmari_freesound/sounds/585699/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 0.0s + 7.6s, fade in 0.004s, fade out 0.5s, mono, 48 kHz, highpass 40 Hz, gain +6.3 dB to -24.1 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_bell_hand_1** (`.m4a`, `.ogg`)
  - Source: Freesound, "chromatic handbells 12 tones g1.wav" by radwoc, https://freesound.org/people/radwoc/sounds/370007/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 0.15s + 6.2s, fade in 0.004s, fade out 1.5s, mono, 48 kHz, highpass 40 Hz, gain +2.2 dB to -22.7 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_bell_hand_2** (`.m4a`, `.ogg`)
  - Source: Freesound, "chromatic handbells 12 tones g1.wav" by radwoc, https://freesound.org/people/radwoc/sounds/370007/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 6.4s + 7.4s, fade in 0.004s, fade out 1.5s, mono, 48 kHz, highpass 40 Hz, gain +0.8 dB to -27.0 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_bell_hand_3** (`.m4a`, `.ogg`)
  - Source: Freesound, "chromatic handbells 12 tones g1.wav" by radwoc, https://freesound.org/people/radwoc/sounds/370007/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 14.0s + 6.8s, fade in 0.004s, fade out 1.5s, mono, 48 kHz, highpass 40 Hz, gain +1.0 dB to -18.8 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_bell_church_far** (`.m4a`, `.ogg`)
  - Source: Freesound, "enkhuizen catholic church.wav" by odilonmarcenaro, https://freesound.org/people/odilonmarcenaro/sounds/120833/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 0.0s + 6.2s, fade in 0.004s, fade out 1.5s, mono, 48 kHz, highpass 40 Hz, gain +12.7 dB to -23.0 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_chime_single** (`.m4a`, `.ogg`)
  - Source: Freesound, "Wind Chime (G-003) +.wav" by GnoteSoundz, https://freesound.org/people/GnoteSoundz/sounds/169855/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 0.0s + 3.4s, fade in 0.004s, fade out 0.8s, mono, 48 kHz, highpass 40 Hz, gain +5.8 dB to -19.7 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_mote_twinkle_01** (`.m4a`, `.ogg`)
  - Source: Freesound, "MAGShim_Sparkling Twinkle Bleep 1_EM" by newlocknew, https://freesound.org/people/newlocknew/sounds/825544/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 0.0s + 6.0s, fade in 0.004s, fade out 2.0s, mono, 48 kHz, highpass 40 Hz, gain +1.2 dB to -27.9 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_mote_twinkle_02** (`.m4a`, `.ogg`)
  - Source: Freesound, "MAGShim_Sparkling Twinkle Bleep 1_EM" by newlocknew, https://freesound.org/people/newlocknew/sounds/825544/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 14.9s + 6.0s, fade in 0.004s, fade out 2.0s, mono, 48 kHz, highpass 40 Hz, gain +1.8 dB to -23.8 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_mote_gleam** (`.m4a`, `.ogg`)
  - Source: Freesound, "GLEAM-GLOW-SFX-CHIME.wav" by newagesoup, https://freesound.org/people/newagesoup/sounds/351408/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 1.6s + 3.6s, fade in 0.004s, fade out 1.0s, mono, 48 kHz, highpass 40 Hz, gain +10.1 dB to -18.4 LUFS, true peak -4.8 dBTP, AAC 48 kHz and Opus
- **sfx_colour_swell** (`.m4a`, `.ogg`)
  - Source: Freesound, "Magic - Cymbal Swell 2" by Vrymaa, https://freesound.org/people/Vrymaa/sounds/826131/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 22.2s + 10.0s, fade in 0.05s, fade out 4.0s, stereo, 48 kHz, highpass 40 Hz, gain +2.6 dB to -18.0 LUFS, true peak -4.6 dBTP, AAC 48 kHz and Opus
- **sfx_flame_whoosh** (`.m4a`, `.ogg`)
  - Source: Freesound, "burning air" by sergeeo, https://freesound.org/people/sergeeo/sounds/242721/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 0.9s + 4.0s, fade in 0.05s, fade out 1.2s, stereo, 48 kHz, highpass 40 Hz, gain +5.3 dB to -18.9 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_foghorn_far** (`.m4a`, `.ogg`)
  - Source: Freesound, "Long Distant Foghorn.aiff" by Danjocross, https://freesound.org/people/Danjocross/sounds/507471/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 1.0s + 7.2s, fade in 0.05s, fade out 2.5s, mono, 48 kHz, highpass 40 Hz, gain -1.2 dB to -18.0 LUFS, true peak -4.6 dBTP, AAC 48 kHz and Opus
- **sfx_crane_call** (`.m4a`, `.ogg`)
  - Source: Freesound, "Cranes 2.wav" by straget, https://freesound.org/people/straget/sounds/424137/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 0.0s + 11.8s, fade in 0.05s, fade out 1.5s, mono, 48 kHz, highpass 120 Hz, gain +9.1 dB to -18.6 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_ui_tap_soft** (`.m4a`, `.ogg`)
  - Source: Freesound, "Soft UI Button Click" by Jummit, https://freesound.org/people/Jummit/sounds/528561/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 0.0s + 0.2s, fade in 0.001s, fade out 0.05s, mono, 48 kHz, highpass 40 Hz, gain +9.2 dB to -22.4 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_ui_confirm** (`.m4a`, `.ogg`)
  - Source: Freesound, "UI Menu Click Reverb - Soft Confirm Click" by TommasoMotteran, https://freesound.org/people/TommasoMotteran/sounds/851556/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 0.0s + 1.7s, fade in 0.001s, fade out 0.5s, mono, 48 kHz, highpass 40 Hz, gain -2.5 dB to -31.7 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_ui_tap_wood_01** (`.m4a`, `.ogg`)
  - Source: Freesound, "finger tap table counter wood various.wav" by kyles, https://freesound.org/people/kyles/sounds/452621/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 0.6s + 0.35s, fade in 0.002s, fade out 0.12s, mono, 48 kHz, highpass 80 Hz, gain +16.9 dB to -25.9 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_ui_tap_wood_02** (`.m4a`, `.ogg`)
  - Source: Freesound, "finger tap table counter wood various.wav" by kyles, https://freesound.org/people/kyles/sounds/452621/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 5.2s + 0.35s, fade in 0.002s, fade out 0.12s, mono, 48 kHz, highpass 80 Hz, gain +19.1 dB to -25.4 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_ui_tap_wood_03** (`.m4a`, `.ogg`)
  - Source: Freesound, "finger tap table counter wood various.wav" by kyles, https://freesound.org/people/kyles/sounds/452621/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 15.98s + 0.35s, fade in 0.002s, fade out 0.12s, mono, 48 kHz, highpass 80 Hz, gain +18.8 dB to -23.8 LUFS, true peak -1.5 dBTP, AAC 48 kHz and Opus
- **sfx_bird_great_tit_01** (`.m4a`, `.ogg`)
  - Source: Wikimedia Commons, "Great Tit (Parus major) singing in a birch tree in Southern Finland, 2007-05-21" by Oona Räisänen (Mysid), https://commons.wikimedia.org/wiki/File:Parus_major.ogg
  - License: Public domain (PD-self)
  - Used: original Ogg Vorbis file from Commons
  - Changes: slice 0.0s + 2.83s, fade in 0.02s, fade out 0.2s, mono, 48 kHz, highpass 150 Hz, gain -9.2 dB to -18.0 LUFS, true peak -7.9 dBTP, AAC 48 kHz and Opus
- **sfx_bird_great_tit_02** (`.m4a`, `.ogg`)
  - Source: Freesound, "Great Tit At Dawn (Kohlmeise).wav" by pulswelle, https://freesound.org/people/pulswelle/sounds/346066/
  - License: CC0 1.0
  - Used: HQ preview (Ogg Vorbis 192 kbps); original needs a Freesound login
  - Changes: slice 43.2s + 2.6s, fade in 0.02s, fade out 0.3s, mono, 48 kHz, highpass 150 Hz, gain -11.6 dB to -18.0 LUFS, true peak -8.6 dBTP, AAC 48 kHz and Opus
- **sfx_bird_chaffinch_01** (`.m4a`, `.ogg`)
  - Source: Wikimedia Commons, "Chaffinch (Fringilla coelebs) singing in a spruce tree in Southern Finland, 2007-05-19" by Oona Räisänen (Mysid), https://commons.wikimedia.org/wiki/File:Fringilla_coelebs.ogg
  - License: Public domain (PD-self)
  - Used: original Ogg Vorbis file from Commons
  - Changes: slice 1.2s + 3.0s, fade in 0.02s, fade out 0.3s, mono, 48 kHz, highpass 150 Hz, gain -4.8 dB to -18.0 LUFS, true peak -3.3 dBTP, AAC 48 kHz and Opus
- **sfx_bird_chaffinch_02** (`.m4a`, `.ogg`)
  - Source: Wikimedia Commons, "Chaffinch (Fringilla coelebs) singing in a spruce tree in Southern Finland, 2007-05-19" by Oona Räisänen (Mysid), https://commons.wikimedia.org/wiki/File:Fringilla_coelebs.ogg
  - License: Public domain (PD-self)
  - Used: original Ogg Vorbis file from Commons
  - Changes: slice 10.1s + 3.1s, fade in 0.02s, fade out 0.3s, mono, 48 kHz, highpass 150 Hz, gain -3.5 dB to -18.0 LUFS, true peak -5.3 dBTP, AAC 48 kHz and Opus
- **sfx_bird_blackbird_01** (`.m4a`, `.ogg`)
  - Source: Wikimedia Commons, "Common Blackbird (Turdus merula) singing in a forest in Southern Finland, 2007-05-21" by Oona Räisänen (Mysid), https://commons.wikimedia.org/wiki/File:Turdus_merula_2.ogg
  - License: Public domain (PD-self)
  - Used: original Ogg Vorbis file from Commons
  - Changes: slice 1.3s + 2.2s, fade in 0.02s, fade out 0.3s, mono, 48 kHz, highpass 150 Hz, gain -1.5 dB to -18.0 LUFS, true peak -6.7 dBTP, AAC 48 kHz and Opus
- **sfx_bird_blackbird_02** (`.m4a`, `.ogg`)
  - Source: Wikimedia Commons, "Common Blackbird (Turdus merula) singing in a forest in Southern Finland, 2007-05-21" by Oona Räisänen (Mysid), https://commons.wikimedia.org/wiki/File:Turdus_merula_2.ogg
  - License: Public domain (PD-self)
  - Used: original Ogg Vorbis file from Commons
  - Changes: slice 6.7s + 2.6s, fade in 0.02s, fade out 0.3s, mono, 48 kHz, highpass 150 Hz, gain -3.3 dB to -18.0 LUFS, true peak -6.3 dBTP, AAC 48 kHz and Opus
- **sfx_bird_blackbird_03** (`.m4a`, `.ogg`)
  - Source: Wikimedia Commons, "Common Blackbird (Turdus merula) singing in a forest in Southern Finland, 2007-05-21" by Oona Räisänen (Mysid), https://commons.wikimedia.org/wiki/File:Turdus_merula_2.ogg
  - License: Public domain (PD-self)
  - Used: original Ogg Vorbis file from Commons
  - Changes: slice 13.7s + 2.4s, fade in 0.02s, fade out 0.3s, mono, 48 kHz, highpass 150 Hz, gain -4.4 dB to -18.0 LUFS, true peak -6.2 dBTP, AAC 48 kHz and Opus
- **sfx_bird_redstart_01** (`.m4a`, `.ogg`)
  - Source: Wikimedia Commons, "Common Redstart (Phoenicurus phoenicurus) singing at 1:30 am in Southern Finland, 2010-05-26" by Oona Räisänen (Mysid), https://commons.wikimedia.org/wiki/File:Phoenicurus_phoenicurus.ogg
  - License: Public domain (PD-self)
  - Used: original Ogg Vorbis file from Commons
  - Changes: slice 0.6s + 2.5s, fade in 0.02s, fade out 0.3s, mono, 48 kHz, highpass 150 Hz, gain -6.2 dB to -18.0 LUFS, true peak -6.3 dBTP, AAC 48 kHz and Opus
- **sfx_bird_redstart_02** (`.m4a`, `.ogg`)
  - Source: Wikimedia Commons, "Common Redstart (Phoenicurus phoenicurus) singing at 1:30 am in Southern Finland, 2010-05-26" by Oona Räisänen (Mysid), https://commons.wikimedia.org/wiki/File:Phoenicurus_phoenicurus.ogg
  - License: Public domain (PD-self)
  - Used: original Ogg Vorbis file from Commons
  - Changes: slice 12.7s + 1.8s, fade in 0.02s, fade out 0.3s, mono, 48 kHz, highpass 150 Hz, gain -3.2 dB to -18.0 LUFS, true peak -7.7 dBTP, AAC 48 kHz and Opus
- **sfx_bird_willow_warbler** (`.m4a`, `.ogg`)
  - Source: Wikimedia Commons, "Willow Warbler (Phylloscopus trochilus) in Southern Finland, 2007-05-22" by Oona Räisänen (Mysid), https://commons.wikimedia.org/wiki/File:Phylloscopus_trochilus_2.ogg
  - License: Public domain (PD-self)
  - Used: original Ogg Vorbis file from Commons
  - Changes: slice 0.0s + 8.38s, fade in 0.02s, fade out 0.4s, mono, 48 kHz, highpass 150 Hz, gain -8.5 dB to -18.0 LUFS, true peak -7.1 dBTP, AAC 48 kHz and Opus
