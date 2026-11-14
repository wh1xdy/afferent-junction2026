# Quotes after each session

Data: `demo/data/quotes.json` has 100 quotes from 61 authors and sources. Each entry has the fields `{id, text, author, work, year, translator, source_url, tags}`.

## Display rule

- After every session, exactly one quote appears **alone on its own screen**. No buttons, numbers, streaks or score go on that screen. Behind it is the dawn sky, or the night sky if the session was played at night.
- **No repeats** until all 100 quotes have been shown. Keep a shown-set per player; once all 100 are used, clear the set and start a new shuffled cycle. The last quote of one cycle must not be the first of the next.
- **Choosing a quote:** start from the quotes that have not been shown yet in the current cycle.
  1. If the session's end mood is 1 or 2, or the session was flagged a bad day, prefer quotes tagged `after_hard_day`.
  2. Otherwise, if the session is at night (local night or the night-sky variant), prefer quotes tagged `night`.
  3. Otherwise, in the morning or the daytime dawn variant, prefer quotes tagged `morning`. If none of those are left, use quotes tagged `any`.
  4. A night session that is also a hard day uses quotes tagged both `after_hard_day` and `night` first, then `after_hard_day`.
  5. If the preferred pool has no unseen quotes left, fall back to any unseen quote. Never repeat a quote to satisfy a mood tag.
- **Reading time:** every text is about 25 words or fewer (the longest has 27) so it reads in about 5 s. Keep the quote on screen for at least 6 s and let the player dismiss it with a tap. Do not auto-advance into anything that asks for input.
- **Layout:** `text` uses `\n` for poem line breaks, so render it with `white-space: pre-line`. Show `author` beneath the text in a smaller size. The work, year and translator go in an "about this quote" detail or the credits screen, not on the quote screen itself.
- **Safety:** if a crisis or safety offer is shown, show no quote. The existing `quote.js` already hides the quote on `crisisOffer`.
- Note for implementation: the current `demo/js/quote.js` picks a quote by day of year, leaves out quotes tagged `night`, and shows nothing on night sessions. It must be changed to follow the rule above, using the shown-set, mood preference, and a night-sky quote for night sessions.

## Mood tags

| Tag | Meaning | Count |
|---|---|---|
| `any` | Fits any session and time of day | 52 |
| `after_hard_day` | Very gentle. It allows rest or lets the player off the hook, has no imperative, and asks for nothing | 43 |
| `morning` | Dawn, sunrise, spring or morning images, for the dawn sky | 29 |
| `night` | Quiet, rest, stars, sleep, for the night sky | 30 |

A quote can have more than one tag.

## Selection rules

1. **Verified source only.** Each quote was checked against the primary text or a reliable attribution source: Project Gutenberg or Wikisource full texts, which were searched word for word; sourced sections of Wikiquote that give the work and page; the poet's publisher or Poets.org; Letters of Note and The Marginalian for letters and quoted book passages. `source_url` points to where it was checked.
2. **Translations name the translator**, or they use a public-domain translation, for example Legge (Laozi), Long (Marcus Aurelius), Butler (Homer), Longfellow (Dante), Crawford (Kalevala), and Maude (Tolstoy). Tagore's Fireflies and Gibran's The Prophet were written in English by the authors themselves. For Andersen, the anonymous 19th-century translation on Project Gutenberg (#27200) is used.
3. **Length:** about 25 words at most, so a quote reads in 5 s on a phone.
4. **Tone:** gentle, hopeful, quiet and honest. The themes are light, dawn, seasons, rest, small steps, patience, being enough, connection and nature. Winter and night are allowed when they are shown as passing, never as permanent.
5. **Balance:** at most 4 quotes per author (only Dickinson, Thoreau, Wordsworth, Montgomery and Tagore reach 4). The authors come from many cultures, including Nordic and Finnish (Kalevala, Jansson, Hammarskjöld, Andersen), Japanese (Sei Shōnagon, Bashō), Chinese (Laozi), Indian and Lebanese (Tagore, Gibran), Nigerian (Achebe), African American (Angelou, Hughes), Muscogee (Harjo), Spanish (Machado), Russian (Tolstoy), Italian (Dante), Ancient Greek and Roman (Homer, Marcus Aurelius), and Vietnamese (Thich Nhat Hanh). The texts range from about the 8th century BCE to 2015.
6. **Clinical read:** each quote was read as if by someone in bed, weeks after TMS, on a bad day. Anything that could land as a demand, as blame, or as a reminder of death was cut or trimmed out.
7. **Copyright:** public-domain texts are preferred. In-copyright works appear only as short quotations under quotation rules, with full attribution. These are Borland, Carson (1954 speech and The Sense of Wonder), Camus (Kennedy translation), Oliver, Berry, Jansson, Saint-Exupéry (Woods translation), Rilke (Herter Norton translation), Angelou, Harjo, Rogers, Lamott, Tolkien, Cohen, Sagan, Leopold, Shepherd, E. B. White, Thich Nhat Hanh, Shōnagon (Morris translation), Machado (Craige translation), Bashō (Lewis translation), Achebe and Hammarskjöld (Sjöberg and Auden translation). Check the publishers' rules before any commercial release. Milne's The House at Pooh Corner (1928) is public domain in the US but not yet in the UK and EU.

## Edits to quoted text

The wording is never paraphrased. The only changes are these:

- **Em dashes replaced:** Carson q001 and Hammarskjöld use a spaced hyphen. Grahame uses hyphens. Burnett uses commas. Andersen's ",--" and Dickinson's "--" become a comma.
- **Cuts marked with "...":** Carson q003, Laozi ch. 64, Oliver (two quotes), Montgomery (Avonlea), and Jansson q074 (the ellipsis is in the quoted source). Jansson q075 ends before the end of its sentence.
- **Cuts without an ellipsis:** these were only trimmed at the start or end of a sentence.
  - Leading words were dropped: "Marilla," and "Oh, Marilla," (Montgomery), "But" (Muir), "Yet" (Shepherd), "Leave this military hurry and" (Emerson), and "Believe me, my young friend," (Grahame).
  - Some quotes end before the end of the source sentence: Emerson q015, Carson q002, Sei Shōnagon, Whitman, Hopkins and Coleridge.
- **Punctuation:**
  - A final colon, semicolon or dash was changed to a full stop where a line was cut (Keats, and Dickinson's "Dawn").
  - Legge's editorial parentheses were removed: "(make) ... (clear)" became "make ... clear".
  - The parentheses in Shakespeare's Sonnet 29 were removed.
- **Lines left out on purpose:**
  - Thoreau's "Only that day dawns to which we are awake", because it reads as a demand.
  - The death and storm stanzas of Shelley, Keats and Hardy.
  - Burnett's "being strong is the Magic".
  - Cather's next sentence, which mentions dying.
  - The second half of Lorde's line about self-care, so the line itself was not used.
- Jansson q074 is Too-ticky speaking about the returning sun. It reads that way over the dawn sky, and `work` notes it.
- Dante's line is the last line of the Inferno, coming out of the dark to see the stars again. Hell is not named in the quote.

## Attribution note

The quote screen shows `author` only. A credits or "about this quote" view lists the work, year, translator and source for all 100 quotes. Example: "Rabindranath Tagore, Fireflies (1928)". Translators are always named there.

## Rejected categories

- **Misattributed internet quotes**, including:
  - Most "Rumi" lines (Coleman Barks versions are interpretations), and Hafiz "The sun never says to the earth, you owe me", which is an original poem by Daniel Ladinsky.
  - Many "Buddha" and "Confucius" lines: "It does not matter how slowly you go" is not in the Analects.
  - Many "Einstein" and "Marcus Aurelius" lines in modern rewordings.
  - "Keep your face to the sunshine" (attributed to Keller and to Whitman, with no source).
  - "Even the darkest night will end and the sun will rise" (attributed to Hugo, with no source).
  - "It always seems impossible until it's done" (Mandela, no evidence).
  - "Our deepest fear" (Marianne Williamson, not Mandela).
  - "It is never too late to be what you might have been" (not George Eliot).
  - The Chief Seattle speech (a 1970s script).
  - "Whatever you can do, or dream you can, begin it" (not Goethe).
  - "If you look the right way, you can see that the whole world is a garden" (not in The Secret Garden).
  - Pooh lines from the films ("What day is it?" "It's today").
  - The viral "In the midst of winter, I found there was, within me, an invincible summer" (a paraphrase of Camus).
  - The loose "journey of a thousand miles begins with a single step".
- **Unverifiable wording:** for these the exact English could not be confirmed, so they were left out. They include Tolkien's "Dawn is ever the hope of men", Issa's cricket haiku (Hirshfield), Bynner's Meng Haoran, Olav H. Hauge's "It is that dream", and Mary Oliver's "Sleeping in the Forest".
- **Toxic positivity:** "just be happy", "choose joy", "all's right with the world" (the Browning lines are cut before this), and "we should all be as happy as kings".
- **Guilt or pressure:** "no excuses", "hustle", "one wild and precious life" (reads as a demand), "you become responsible forever", "Live the questions now" (only Rilke's gentler first clause is kept), "Climb the mountains" (the imperative is cut from Muir), and "Pay attention. Be astonished." used as instructions.
- **Death, suicide, ending, drowning, darkness as permanent:** these were rejected even when beautiful, for example Tagore's "death like autumn leaves", Keats's "Pass into nothingness", Andersen's pinned butterfly, and Heaney's "this side of the grave". Authors whose life is publicly defined by suicide (Woolf, Plath, van Gogh, Karin Boye, Sara Teasdale) were left out so that the context cannot follow the quote.
- **Illness metaphors that blame**, and pain shown as a lesson: "Your pain is the breaking of the shell", "the cure for anything is salt water", and suffering that makes one grateful (Andersen's Ugly Duckling ending).
- **Religious proselytising:** scripture and devotional lines (Psalms, Julian of Norwich, Hopkins's "Glory be to God", Pippa's "God's in His heaven") were not used. Laozi, Marcus Aurelius and Thich Nhat Hanh are used only for secular, nature-based lines.
- **People widely known for harmful conduct:** for example Neruda (his memoir admits assaulting a maid), Knut Hamsun and Ezra Pound (support for fascism), Roald Dahl (antisemitism), Neil Gaiman (abuse allegations), and J. K. Rowling (ongoing public controversy over harm to trans people).
