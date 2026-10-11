# User tests: TEMPLATE, not results

> **Status: NOT RUN.** This file is a template and a checklist for the owner. No participants have been
> recruited, no session has taken place, and nothing below was filled in by an agent. Every quote, table cell
> and fix is blank on purpose. Do not claim that the site was user-tested until you have filled this in from
> real sessions.
>
> Nothing in the build, the budgets or `pnpm check` depends on this file. Run the sessions whenever you like.

## Why this exists

The spec asks for two read-throughs with non-engineers before the board is considered finished (spec 1.3
"Style-frame spike + two non-engineer tests", spec 9 "Style frame and `docs/USER_TESTS.md` exist with two
non-engineer read-throughs and the resulting copy fixes"). An agent cannot do that: the point is a person
who does not already know what a quorum is. So the frame is built (`docs/style-frame.html`) and the
protocol is written. The people and the results are yours.

## What you need

- Two people who are **not engineers** and have not seen the site (a recruiter, a designer, a relative who works in
  something else, a classmate from another department). Two different people, not one person twice.
- `docs/style-frame.html#frame-only` open full screen on a laptop. The `#frame-only` part hides the reference
  sheet, so they see only the first screen. Also have it ready on a phone (the file is one page, no scripts,
  fonts embedded: you can send it to a phone).
- A pen or this file open for notes, 20 minutes per person, and an optional audio recorder (ask first).

Optional second phase, once the site is built and running (`pnpm preview`): the same two people on the real page,
for the interactive parts the still cannot show (tasks T7 to T9 below).

## Script

Read the words in quotes aloud as written. Do not explain the page, do not hint, do not answer questions
until the end; write each question down instead, because a question is a finding.

### 0. Welcome (1 minute)

"Thank you. I am testing a web page, not you, so nothing you say can be wrong. Please say out loud what you
notice and what you expect, even small things. I will not be able to answer while you look, but I will
answer everything at the end. Is it alright if I take notes?"

### 1. Five-second look

Show the frame for five seconds, then hide it (or turn the screen away). Ask, one at a time:

1. "What was that page?"
2. "What does this person do?"
3. "Tell me one thing you remember seeing."

### 2. Read-through (about 5 minutes)

"Imagine this link came in a job application. Take your time and look around. Say what you notice."

Watch, and write down without prompting: where the eyes go first, whether they read the four project rows
and their numbers, whether they look at the board, anything they squint at, anything they ask.

### 3. Tasks

Ask each one separately. Write the answer in their words.

- **T1.** "Pick one of the projects and tell me what it achieved." (The service index and its headline numbers.)
- **T2.** "What do you think the glowing round buttons are?" (The lamps.)
- **T3.** "What do you think the box marked 'In plain words' is for? Did you read it? Did it help?"
- **T4.** "Is there anything on this page that is the person's actual work history, and anything that was built just for this page?" (The authorship line.)
- **T5.** "Where would you click to see their résumé? To get in touch?"
- **T6.** "What do you think the button 'Open this page in a second tab' will do? Would you press it? Why, or why not?"

### 4. Wrap-up (2 minutes)

- "In your own words, in two sentences, what is this website?"
- "What was confusing or unclear?"
- "Was anything too much, or something you would take away?"
- "Anything you want to ask me now?" (Answer fully. Write down what they wanted to know.)

### Phase 2, on the running site (optional)

- **T7.** "Press the button, then look at the page and the tab you came from. What changed? What do you think just happened?"
- **T8.** "Press 'Skip the machine'. What changed? Would you ever use it?"
- **T9.** "Click one of the glowing lamps. Where did it take you? Was that what you expected?"

## Record sheet (copy this block once per person)

| Field | |
|---|---|
| Participant label (P1, P2; no names) | |
| Date | |
| Device and browser | |
| Background, in a few words (no identifying detail) | |
| Seen the site before? | |
| Phase (frame only / live site) | |

**Five-second look.** Q1: _ Q2: _ Q3: _

**Read-through.** First look: _ Found the four projects: yes / no / after _ s. Read the numbers: _ Touched or mentioned the board: _ Questions asked: _

| Task | Their answer, in their words (verbatim quotes) | Understood? (yes / partly / no) | Notes |
|---|---|---|---|
| T1 | | | |
| T2 | | | |
| T3 | | | |
| T4 | | | |
| T5 | | | |
| T6 | | | |
| T7 | | | |
| T8 | | | |
| T9 | | | |

**Two-sentence summary, in their words:** _

**Confusing or unclear:** _

**Too much or to remove:** _

**Questions they wanted answered:** _

## What the sessions should show (tick only from what you actually observed)

- [ ] P1 and P2 can say, without help, that this is a backend or AI engineer's page and name at least one real project.
- [ ] P1 and P2 read a project number and say what it means in plain terms.
- [ ] P1 and P2 give a sensible reason for pressing "Open this page in a second tab", or say what they expect it to do.
- [ ] P1 and P2 describe the lamps as something being "on", "ready" or "working". (The exact words are not important.)
- [ ] P1 and P2 can tell the cluster (built for this site) from the résumé projects (the work), after reading the authorship line.
- [ ] Neither participant needed the plain-language caption explained to them, or both said it helped.

These are suggestions drawn from spec 1.3. Change them if you learn something better. If a line is not
ticked, that is a finding, not a failure: write the fix below.

## Fixes the sessions led to

The spec expects the read-throughs to change the page. Record each change here with the evidence for it.

| # | Evidence (participant, quote or behaviour) | Change made (file and string, before and after) | Date | Checked by |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |

Likely places a fix lands, if the sessions point there: `src/data/copy.ts` (`controlRoom.*`), the plain-language
captions, the lamp nameplates (`src/sections/control-room/`), the label on the prompt button.

## Privacy

Keep participants pseudonymous (P1, P2). Do not store names, faces or voices without written consent; if you
record audio, delete it after you have written the quotes above. Do not put any participant's words in the
repository if they have not agreed to it.

## Sign-off

- [ ] Style frame shown to two non-engineers (dates: _ and _).
- [ ] Quotes recorded verbatim above.
- [ ] Two fixes made and listed in the table.
- [ ] If either fix changed the layout, the frame was shown again to a third person (optional but advised).
