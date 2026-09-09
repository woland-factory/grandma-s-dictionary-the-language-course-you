# VALIDATION — Grandma's Dictionary: the language course your family records

## Verdict: VIABLE

This idea survives every test the factory applies, and it survives them on
substance, not sentiment. It should proceed to planning, with the concerns
below treated as binding design constraints rather than footnotes.

## Core value proposition

A family whose home language is dying between generations opens a link,
answers a field-linguist-style interview in the elder's voice, and leaves
one sitting with a talking dictionary the family owns as a single portable
file. A child then practices against it: hear grandma say the word, say it
back, and the attempt is stored beside the original. Every entry becomes
two voices, decades apart, in one heirloom file that no chatbot, no
big-language course, and no re-recording after the elder's death can ever
recreate. No accounts, nothing leaves the device unless the family exports
it.

The value test the factory asks: would anyone's life be genuinely better?
Yes, and measurably in one afternoon. The pain is documented (heritage
language loss threads on HN are raw and first-person), the incumbents are
checked and named in the dossier, and each covers at most one of the three
pieces this assembles: guided elder elicitation, child record-back with
spaced revisits, and a portable two-voice archive.

## Why it clears the substitution tests

- **Chatbot test:** the scarce input is a specific dying voice, not
  intelligence. A chat window has no microphone ritual, no persistent
  paired audio, no revisit schedule, no exportable artifact. There is no
  LLM in the core loop at all, so "a better model does it free" cannot
  apply.
- **Existing-free-tool test:** Living Dictionaries is documentation
  software for language communities (account-based, manager-run, no
  practice loop shipped). Dialect is a fixed 18-language catalog of other
  people's voices. The closest flashcard app has parent-recorded cards but
  no interview scaffold, no record-back, no artifact, and is Android-only.
  Anki-with-audio is the elder-hostile DIY this replaces. The assembly is
  the product, and nobody ships the assembly.
- **Durability test:** the artifact compounds. Each revisit adds a dated
  child attempt beside the elder's recording, so the file quietly becomes
  a record of a child learning to sound like their great-grandmother. That
  is durable value in the strongest sense the factory recognizes: the day
  the relative dies, it is the most valuable file the family owns.

## Ambition check

- **Obvious-answer test:** the obvious answer here is "flashcard app with
  custom audio", which ships free today. This idea's twist is one
  sentence: the interview turns the relative into the course, and the
  child's answers are archived beside the teacher's voice forever. Passes.
- **Signature moment:** an entry plays grandmother saying the word, then
  the five-year-old saying it back, two voices decades apart in one file.
  It is a mechanic, not an adjective, and it is reachable in the first
  session. Passes.

## Minimal feature set (the smallest product that delivers the value)

1. **Guided interview.** A curated static prompt deck (foods, endearments,
   blessings, commands to children, the family's invented words) with
   one-tap record per answer. One sitting must plausibly yield 20 to 30
   entries. No account, no setup screen before the first recording.
2. **The talking dictionary.** Entry = elder audio + written form +
   meaning. Browse and play instantly.
3. **Record-back practice loop.** Child taps an entry, hears the elder,
   records an attempt; the dated attempt is filed beside the original and
   two-voice playback becomes the entry's default. A simple spaced-revisit
   queue surfaces due words.
4. **The heirloom file.** Export the whole dictionary (all audio plus
   metadata) as one archive file; import it on any device to continue.
   This is also the cross-device story, since there are no accounts.
5. **Data-safety ritual.** Persistent-storage request, quota awareness,
   and a prominent export nudge at the end of every recording session.
   Given what the audio is, silent eviction would be a betrayal, so this
   is core scope, not polish.

Everything else (LLM-suggested follow-up prompts, sharing surfaces,
multi-family anything) is out of the minimal set.

## Main risks

1. **Irreplaceable audio in evictable browser storage.** The single worst
   failure this product can have is losing grandma's voice to a cleared
   cache. Mitigation is architectural: `navigator.storage.persist()`,
   export-as-ritual after every session, and honest UI about where the
   data lives. This risk is why feature 5 is in the minimal set.
2. **The recording afternoon never happens, or stalls at a dozen entries.**
   The premortem is right that activation energy is the bottleneck. The
   mitigation is the product itself: the interview must make one sitting
   produce a complete, playable, exportable dictionary, so the family wins
   even if they never return. Design for one great afternoon first,
   retention second.
3. **The practice loop underdelivers.** Five-year-olds do not
   self-schedule; the parent is the returning user, and by week three the
   honest advice may be "call grandma". Accept this: the heirloom value
   must not depend on streaks. The two-voice moment has to land in session
   one, and the revisit queue is a gentle surface, not an engagement
   engine.
4. **Mobile browser audio is finicky.** iOS Safari's MediaRecorder output
   formats, permission flows, and autoplay rules are the main technical
   hazard. The recording path must be verified on a real 390px mobile
   viewport and Safari-class constraints early, not in the polish EPIC.
5. **Living Dictionaries grows a practice loop.** Their flashcard view is
   on a public roadmap. The defense is shape, not features: no-account
   family scale, record-back, and a file the family owns are structurally
   against their community-institutional model. Acceptable risk.
6. **A lexicon is not fluency.** The product must never claim it is. Words,
   sounds, and the voice survive; grammar and conversation live outside.
   Any copy promising fluency is a defect.

## What would make me reject it

None of these hold today, which is why the verdict is viable:

- If browsers could not reliably record and durably store hundreds of
  audio clips client-side. They can (MediaRecorder plus IndexedDB/OPFS,
  persistent storage on all modern engines).
- If the export/import archive could not round-trip on ordinary devices,
  since the heirloom claim would then be false.
- If the build drifted account-based or cloud-stored, which would forfeit
  the differentiator against Living Dictionaries and the privacy story
  that makes the no-paperwork school use case work.
- If delivering the first sitting required a runtime LLM, gating first
  value behind a key wall. It does not; the prompt deck is static curated
  content.

## Note for planning

The dossier's bolder sibling ("The Littlest Field Linguist", where the
child runs the interview) is a real option but riskier: it requires a
live, willing elder for every session and cannot do capture-now,
practice-later, which is the mode families facing a relative's decline
actually need. Recommend building the handed capture-first shape and
letting the child-as-interviewer framing flavor the prompt deck's voice
rather than the architecture.
