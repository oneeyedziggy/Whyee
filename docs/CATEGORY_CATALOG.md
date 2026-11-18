# Comprehensive Category Catalog

This catalog proposes reusable tracking categories for the React Native app. It intentionally repeats categories across groups when the same observation is useful in different contexts. A user should choose a focused subset rather than enable everything: excessive tracking increases burden, missing entries, and spurious correlations.

This is a configuration reference, not medical advice or a diagnostic system. Clinical measurements need suitable devices, units, interpretation, and professional review. Free-text health data may be sensitive even when stored locally.

## Supported configuration vocabulary

All recommendations use the current React Native `CategoryDefinition` model.

| Short form | App category kind | Configuration shown below |
| --- | --- | --- |
| `Choice` | `multiple-choice` | Ordered options with numeric values; `multiSelect` when several options may coexist |
| `Number` | `number` | `min / max / step`; put the unit in the category name because units are not a separate field |
| `Duration` | `duration` | `resetEnabled / cumulative / animate / splitEnabled / showMilliseconds / timeSinceCategoryIds`; entries are anchored at their first start time and can emit per-period minutes-since-source series |
| `Counter` | `counter` | `steps / resetEnabled / editable / splitEnabled` |
| `Notes` | `notes` | Free text with optional local sentiment analysis |
| `EventTime` | `event-time` | The entry's clock time is the datum; `use24HourClock / timeSinceCategoryIds`; series for minute of day, four dayparts, a single hourly-breakdown toggle (24 fanned-out 0/1 series), count/day, and minutes-since-source |

Unless a row says otherwise, use these base settings:

- `enabled: true`
- `notesEnabled: false`
- `sentimentEnabled: false`
- `correlateWithinGroup: false`
- `allowMultiplePerDay: false`
- `mainAggregation: mean` for Choice and Number, `sum` for Duration and Counter
- `weeklyEffectEnabled: false` for Choice and Number
- `multiSelect: false` for Choice
- Duration: `resetEnabled: true`, `cumulative: false`, `animate: true`, `splitEnabled: false`, `showMilliseconds: false`
- Counter: `steps: [-1, 1]`, `resetEnabled: false`, `editable: true`, `splitEnabled: false`
- Leave the default main virtual series enabled. Enable additional virtual series only when they answer a real question; every extra series increases the number of correlations tested.

Common compact overrides used below:

- `notes` enables attached notes. `sentiment` enables local sentiment for those notes.
- `multi/day; sum`, `multi/day; mean`, or `multi/day; max` enables multiple entries and sets `mainAggregation`.
- `weekly` enables weekly-effect calculation.
- `multi-select` allows multiple Choice options in one entry.
- `group-only` enables `correlateWithinGroup`; use it when a category should not participate outside its named group.
- `splits` enables split/lap and therefore should not also use `allowMultiplePerDay`.
- Ordered Choice scales use the numeric values shown. Nominal choices without a natural order are marked `descriptive`; their numeric correlation is not semantically reliable with the current model.

## 1. General health and daily condition

| Category | Type and configuration | Tracking intent |
| --- | --- | --- |
| Overall health | Choice: Very poor `0`, Poor `1`, Fair `2`, Good `3`, Excellent `4`; notes | Broad daily state |
| Energy | Number: `0 / 10 / 1`; notes; weekly | Subjective energy |
| Fatigue | Number: `0 / 10 / 1`; notes; weekly | Severity, not the inverse of energy |
| Pain overall | Number: `0 / 10 / 1`; notes; `multi/day; max` | Peak burden when sampled repeatedly |
| Stress | Number: `0 / 10 / 1`; notes; sentiment; `multi/day; mean`; weekly | Perceived stress |
| Mood | Choice: Very low `0`, Low `1`, Neutral `2`, Good `3`, Very good `4`; notes; sentiment; `multi/day; mean`; weekly | Daily or momentary mood |
| Functional capacity | Choice: Bedbound `0`, Limited self-care `1`, Light activity `2`, Normal activity `3`, Strenuous activity `4`; notes | Effect on daily function |
| Body temperature (C) | Number: `34 / 43 / 0.1`; notes; `multi/day; max` | Measured temperature; create a Fahrenheit alternative if needed |
| Resting heart rate (bpm) | Number: `25 / 220 / 1`; notes; `multi/day; mean` | Resting pulse samples |
| Respiratory rate (breaths/min) | Number: `5 / 60 / 1`; notes; `multi/day; mean` | Resting respiratory rate |
| Blood oxygen (%) | Number: `50 / 100 / 1`; notes; `multi/day; min` | Pulse oximeter readings |
| Systolic blood pressure (mmHg) | Number: `50 / 250 / 1`; notes; `multi/day; mean` | Pair with diastolic at the same times |
| Diastolic blood pressure (mmHg) | Number: `30 / 150 / 1`; notes; `multi/day; mean` | Pair with systolic at the same times |
| Blood glucose (mg/dL) | Number: `20 / 600 / 1`; notes; `multi/day; mean` | Use mmol/L as a separate category when appropriate |
| Weight (kg) | Number: `20 / 350 / 0.1`; notes | Consistent-time body weight |
| Hydration impression | Choice: Very dehydrated `0`, Dehydrated `1`, Adequate `2`, Well hydrated `3`; notes | Subjective hydration context |
| Health events | Notes: sentiment off | Illness, injury, appointments, unusual context |

## 2. Symptoms and medical observations

Use one category per symptom when severity, timing, or frequency matters. Add clinician-directed variables for a specific condition rather than treating this list as diagnostic criteria.

| Category | Type and configuration | Tracking intent |
| --- | --- | --- |
| Headache severity | Number: `0 / 10 / 1`; notes; `multi/day; max` | Worst daily headache |
| Headache duration | Duration: defaults; `multi/day; sum`; notes | Total headache time |
| Migraine features | Choice: Aura `0`, Light sensitivity `1`, Sound sensitivity `2`, Nausea `3`, Vomiting `4`, One-sided pain `5`; multi-select; notes; descriptive | Co-occurring features |
| Dizziness severity | Number: `0 / 10 / 1`; notes; `multi/day; max` | Subjective intensity |
| Nausea severity | Number: `0 / 10 / 1`; notes; `multi/day; max` | Subjective intensity |
| Vomiting episodes | Counter: steps `[-1, 1]`; editable; notes | Daily event count |
| Cough episodes | Counter: steps `[-5, -1, 1, 5]`; editable; notes | Approximate event count |
| Cough severity | Number: `0 / 10 / 1`; notes; `multi/day; max` | Burden independent of count |
| Breathlessness | Number: `0 / 10 / 1`; notes; `multi/day; max` | Subjective intensity |
| Congestion | Number: `0 / 10 / 1`; notes | Daily severity |
| Sore throat | Number: `0 / 10 / 1`; notes | Daily severity |
| Itch severity | Number: `0 / 10 / 1`; notes; `multi/day; max` | Worst daily itch |
| Bowel movements | Counter: steps `[-1, 1]`; editable; notes | Frequency |
| Stool form | Choice: Bristol types 1 through 7 mapped to `1` through `7`; notes; `multi/day; median` | Standardized form; values are ordered, not equal clinical intervals |
| Reflux severity | Number: `0 / 10 / 1`; notes; `multi/day; max` | Worst daily reflux |
| Abdominal pain | Number: `0 / 10 / 1`; notes; `multi/day; max` | Worst daily pain |
| Urination frequency | Counter: steps `[-1, 1]`; editable; notes | Daily frequency |
| Symptom interference | Number: `0 / 10 / 1`; notes | Impact on normal activity |
| Symptom location | Notes: sentiment off | Current model has no body-map type |
| Suspected triggers | Choice: Food `0`, Exertion `1`, Stress `2`, Sleep loss `3`, Environment `4`, Medication `5`, Unknown `6`; multi-select; notes; descriptive | Hypotheses, not confirmed causes |

## 3. Medication, treatment, and care adherence

Medication names and dose ranges should be user-created or clinician-directed. A counter can approximate doses but does not safely model strength, units, schedules, or interactions.

| Category | Type and configuration | Tracking intent |
| --- | --- | --- |
| Medication taken as planned | Choice: No `0`, Partly `1`, Yes `2`; notes | Daily adherence summary |
| Scheduled doses taken | Counter: steps `[-1, 1]`; reset; editable; notes | Count completed doses |
| Scheduled doses missed | Counter: steps `[-1, 1]`; reset; editable; notes | Count omissions |
| As-needed medication doses | Counter: steps `[-1, 1]`; editable; notes; `multi/day; sum` | Use one category per medicine |
| Dose amount (user unit) | Number: user-defined safe bounds and step; notes; `multi/day; sum` | Only when the unit is included in the name |
| Time since dose response | Duration: defaults; `multi/day; mean`; notes | Observed onset timing |
| Treatment benefit | Number: `0 / 10 / 1`; notes; `multi/day; mean` | Subjective benefit |
| Side-effect severity | Number: `0 / 10 / 1`; notes; `multi/day; max` | Worst burden |
| Side-effect type | Choice: Drowsiness `0`, Dizziness `1`, Nausea `2`, GI upset `3`, Headache `4`, Other `5`; multi-select; notes; descriptive | Customize per treatment |
| Physical therapy | Duration: defaults; `multi/day; sum`; notes | Time spent on prescribed work |
| Home exercise sessions | Counter: steps `[-1, 1]`; editable; notes | Completion count |
| Therapy or care session | Duration: defaults; `multi/day; sum`; notes | Appointment/session time |
| Treatment notes | Notes: sentiment off | Changes, instructions, and context |

## 4. Mental health, emotion, and regulation

These are self-observations, not diagnostic scales. Validated questionnaires need dedicated questionnaire support to preserve wording, scoring, and cadence.

| Category | Type and configuration | Tracking intent |
| --- | --- | --- |
| Mood | Choice: Very low `0`, Low `1`, Neutral `2`, Good `3`, Very good `4`; notes; sentiment; `multi/day; mean`; weekly | Repeated affect snapshots |
| Anxiety | Number: `0 / 10 / 1`; notes; sentiment; `multi/day; max`; weekly | Peak daily anxiety |
| Stress | Number: `0 / 10 / 1`; notes; sentiment; `multi/day; mean`; weekly | Average perceived stress |
| Irritability | Number: `0 / 10 / 1`; notes; `multi/day; max` | Peak irritability |
| Motivation | Number: `0 / 10 / 1`; notes; weekly | Willingness to initiate activity |
| Focus | Number: `0 / 10 / 1`; notes; `multi/day; mean`; weekly | Ability to sustain attention |
| Rumination duration | Duration: defaults; `multi/day; sum`; notes | Approximate time, not exact diagnosis |
| Panic episodes | Counter: steps `[-1, 1]`; editable; notes | Episode count |
| Panic episode duration | Duration: defaults; `multi/day; sum`; notes | Total episode time |
| Coping strategies used | Choice: Breathing `0`, Grounding `1`, Exercise `2`, Social support `3`, Creative activity `4`, Rest `5`, Other `6`; multi-select; notes; descriptive | Strategy use |
| Meditation | Duration: defaults; `multi/day; sum`; notes | Practice duration |
| Breathwork | Duration: defaults; `multi/day; sum`; notes | Practice duration |
| Gratitude entries | Counter: steps `[-1, 1]`; reset; editable | Practice frequency |
| Emotional notes | Notes: sentiment | Narrative context |
| Sense of connection | Number: `0 / 10 / 1`; notes; weekly | Subjective social connection |
| Day satisfaction | Number: `0 / 10 / 1`; notes; sentiment; weekly | End-of-day appraisal |

## 5. Sleep and circadian habits

| Category | Type and configuration | Tracking intent |
| --- | --- | --- |
| Sleep period | Duration: cumulative, reset, animate, no splits; notes; enable average start, average stop, and total duration virtual series | Main overnight sleep |
| Time in bed | Duration: cumulative, reset, animate, no splits; notes; enable average start/stop | Bed interval, distinct from sleep |
| Nap | Duration: defaults; `multi/day; sum`; notes | Total nap time and count |
| Sleep quality | Number: `0 / 10 / 1`; notes; weekly | Subjective quality |
| Rested on waking | Number: `0 / 10 / 1`; notes; weekly | Restoration |
| Sleep onset difficulty | Number: `0 / 10 / 1`; notes | Subjective difficulty |
| Estimated sleep latency (min) | Number: `0 / 240 / 5`; notes | Approximate time to sleep |
| Night awakenings | Counter: steps `[-1, 1]`; editable; notes | Awakenings remembered |
| Awake during night (min) | Number: `0 / 480 / 5`; notes | Wake after sleep onset |
| Snoring report | Choice: None `0`, Mild `1`, Moderate `2`, Loud `3`, Unknown `4`; notes | Self/partner/device observation |
| Nightmare episodes | Counter: steps `[-1, 1]`; editable; notes | Remembered episodes |
| Sleep environment | Choice: Quiet `0`, Noise `1`, Light `2`, Too warm `3`, Too cold `4`, Interrupted `5`; multi-select; notes; descriptive | Environmental context |
| Screen before bed (min) | Number: `0 / 360 / 5`; notes | Pre-sleep exposure duration |
| Caffeine after cutoff | Counter: steps `[-1, 1]`; editable; notes | Servings after personal cutoff |
| Alcohol near bedtime | Number: `0 / 20 / 1`; notes | Standard drinks; use local guidance |
| Sleep aid used | Choice: No `0`, Yes `1`; notes | Customize notes with product and timing |
| Wake consistency deviation (min) | Number: `0 / 360 / 5`; notes; weekly | Difference from target wake time |
| Morning light exposure | Duration: defaults; `multi/day; sum`; notes | Outdoor/bright-light time |

## 6. Fitness, movement, and recovery

| Category | Type and configuration | Tracking intent |
| --- | --- | --- |
| Workout type | Choice: Strength `0`, Run `1`, Walk `2`, Cycle `3`, Swim `4`, Mobility `5`, Sport `6`, Other `7`; notes; `multi/day; mean`; descriptive | Session classification |
| Workout duration | Duration: defaults; `multi/day; sum`; notes | Total training time |
| Workout effort (RPE) | Number: `0 / 10 / 1`; notes; `multi/day; mean` | Session effort |
| Workout enjoyment | Number: `0 / 10 / 1`; notes; `multi/day; mean` | Adherence-related experience |
| Distance (km) | Number: `0 / 500 / 0.1`; notes; `multi/day; sum` | Session distance |
| Steps | Counter: steps `[-1000, -100, 100, 1000]`; editable; reset | Daily step total or manual adjustment |
| Active minutes | Number: `0 / 1440 / 5`; notes | Device or manual total |
| Exercises completed | Counter: steps `[-1, 1]`; editable; splits; notes | Exercise/lap count within a workout |
| Sets completed | Counter: steps `[-1, 1, 5]`; editable; reset; notes | Session total |
| Repetitions | Counter: steps `[-5, -1, 1, 5]`; editable; splits; notes | Set/lap tracking |
| Training load (user scale) | Number: `0 / 1000 / 1`; notes; `multi/day; sum` | Only if user has a consistent method |
| Mobility work | Duration: defaults; `multi/day; sum`; notes | Mobility/flexibility time |
| Sedentary time | Duration: cumulative, reset, animate, splits; notes | Accumulated sitting periods |
| Soreness | Number: `0 / 10 / 1`; notes; weekly | General recovery state |
| Readiness | Number: `0 / 10 / 1`; notes; weekly | Subjective readiness |
| Resting heart rate (bpm) | Number: `25 / 220 / 1`; notes | Recovery marker |
| Body weight (kg) | Number: `20 / 350 / 0.1`; notes | Context for training changes |
| Injury pain | Number: `0 / 10 / 1`; notes; `multi/day; max`; group-only | Symptom burden within fitness group |
| Recovery method | Choice: Rest `0`, Walk `1`, Mobility `2`, Massage `3`, Heat `4`, Cold `5`, Compression `6`, Other `7`; multi-select; notes; descriptive | Recovery context |

## 7. Diet, nutrition, and hydration

The current schema cannot represent a meal with several nutrients as one structured event. Use separate numeric categories when precision matters and a Notes category for meal context.

| Category | Type and configuration | Tracking intent |
| --- | --- | --- |
| Meal | Choice: Breakfast `0`, Lunch `1`, Dinner `2`, Snack `3`; notes; `multi/day; mean`; descriptive | Meal events and notes |
| Meal quality | Number: `0 / 10 / 1`; notes; `multi/day; mean` | Personal consistency/quality rating |
| Hunger before meal | Number: `0 / 10 / 1`; notes; `multi/day; mean` | Pre-meal hunger |
| Fullness after meal | Number: `0 / 10 / 1`; notes; `multi/day; mean` | Post-meal satiety |
| Eating pace | Choice: Very fast `0`, Fast `1`, Moderate `2`, Slow `3`; notes; `multi/day; mean` | Meal pace |
| Calories (kcal) | Number: `0 / 10000 / 10`; notes; `multi/day; sum` | Estimated intake |
| Protein (g) | Number: `0 / 500 / 1`; `multi/day; sum` | Daily total |
| Carbohydrate (g) | Number: `0 / 1000 / 1`; `multi/day; sum` | Daily total |
| Fat (g) | Number: `0 / 500 / 1`; `multi/day; sum` | Daily total |
| Fiber (g) | Number: `0 / 150 / 1`; `multi/day; sum` | Daily total |
| Added sugar (g) | Number: `0 / 500 / 1`; `multi/day; sum` | Daily total |
| Sodium (mg) | Number: `0 / 15000 / 10`; `multi/day; sum` | Daily total |
| Water (mL) | Counter: steps `[-500, -250, 250, 500]`; editable; reset | Running daily intake |
| Fruit servings | Counter: steps `[-1, 1]`; editable; reset | Daily servings |
| Vegetable servings | Counter: steps `[-1, 1]`; editable; reset | Daily servings |
| Caffeine (mg) | Number: `0 / 1500 / 5`; notes; `multi/day; sum` | Intake amount and timing |
| Alcohol (standard drinks) | Number: `0 / 30 / 0.5`; notes; `multi/day; sum` | Standardized servings |
| Supplements taken | Choice: user-defined supplement list; multi-select; notes; descriptive | Daily supplement set |
| Dietary pattern | Choice: Usual `0`, Vegetarian `1`, Vegan `2`, Low carbohydrate `3`, High protein `4`, Fasting `5`, Other `6`; notes; descriptive | Broad context, not quality scoring |
| Eating window | Duration: cumulative, reset, animate, no splits; notes; enable average start/stop | First-to-last intake interval |
| Food reaction severity | Number: `0 / 10 / 1`; notes; `multi/day; max` | Possible reaction; do not infer causality |
| Food and meal notes | Notes: sentiment off | Ingredients, portions, setting |

## 8. Baby and infant care

Use separate categories per child. Medical measurements and feeding plans should follow pediatric guidance. `multi/day` is important because most infant events repeat frequently.

| Category | Type and configuration | Tracking intent |
| --- | --- | --- |
| Breastfeeding side | Choice: Left `0`, Right `1`, Both `2`; notes; `multi/day; mean`; descriptive | Feed-side context |
| Breastfeeding duration | Duration: defaults; `multi/day; sum`; notes | Total nursing time and feed count |
| Bottle feed volume (mL) | Number: `0 / 500 / 5`; notes; `multi/day; sum` | Total bottle intake |
| Bottle contents | Choice: Breast milk `0`, Formula `1`, Mixed `2`, Other `3`; notes; `multi/day; mean`; descriptive | Feed composition |
| Solid food meal | Choice: Breakfast `0`, Lunch `1`, Dinner `2`, Snack `3`; notes; `multi/day; mean`; descriptive | Solid-food events |
| Feeding response | Choice: Refused `0`, Little `1`, Some `2`, Most `3`, All `4`; notes; `multi/day; mean` | Intake response |
| Wet diapers | Counter: steps `[-1, 1]`; editable; notes | Daily count |
| Dirty diapers | Counter: steps `[-1, 1]`; editable; notes | Daily count |
| Stool form/color | Notes: sentiment off | Current types cannot model structured infant stool attributes well |
| Baby sleep | Duration: defaults; `multi/day; sum`; notes; enable duration per entry and count | Total sleep and nap count |
| Night sleep period | Duration: cumulative, reset, animate, no splits; notes; enable start/stop series | Main overnight interval |
| Night wakings | Counter: steps `[-1, 1]`; editable; notes | Daily count |
| Tummy time | Duration: defaults; `multi/day; sum`; notes | Total daily practice |
| Pumping duration | Duration: defaults; `multi/day; sum`; notes | Total pumping time |
| Pumped volume (mL) | Number: `0 / 1000 / 5`; notes; `multi/day; sum` | Total expressed milk |
| Crying duration | Duration: defaults; `multi/day; sum`; notes | Total crying time |
| Fussiness | Number: `0 / 10 / 1`; notes; `multi/day; max` | Peak daily fussiness |
| Temperature (C) | Number: `34 / 43 / 0.1`; notes; `multi/day; max` | Measured temperature |
| Medicine doses | Counter: steps `[-1, 1]`; editable; notes | One category per medicine |
| Growth weight (kg) | Number: `0 / 40 / 0.01`; notes | Periodic measurement |
| Growth length (cm) | Number: `30 / 150 / 0.1`; notes | Periodic measurement |
| Head circumference (cm) | Number: `20 / 70 / 0.1`; notes | Periodic measurement |
| Milestones and caregiver notes | Notes: sentiment off | Development and context |
| Caregiver stress | Number: `0 / 10 / 1`; notes; sentiment; weekly | Caregiver wellbeing |

## 9. Reproductive, menstrual, and sexual health

| Category | Type and configuration | Tracking intent |
| --- | --- | --- |
| Menstrual flow | Choice: None `0`, Spotting `1`, Light `2`, Medium `3`, Heavy `4`; notes; `multi/day; max` | Daily/episodic flow |
| Cramps | Number: `0 / 10 / 1`; notes; `multi/day; max` | Peak severity |
| Pelvic pain | Number: `0 / 10 / 1`; notes; `multi/day; max` | Peak severity |
| PMS symptoms | Choice: Mood change `0`, Bloating `1`, Headache `2`, Breast tenderness `3`, Fatigue `4`, Cravings `5`, Other `6`; multi-select; notes; descriptive | Symptom set |
| Cervical mucus | Choice: Dry `0`, Sticky `1`, Creamy `2`, Watery `3`, Egg-white `4`; notes | Ordered observation with imperfect interval meaning |
| Basal body temperature (C) | Number: `34 / 39 / 0.01`; notes | Consistent waking measurement |
| Ovulation test | Choice: Negative `0`, Unclear `1`, Positive `2`; notes | Test result |
| Libido | Number: `0 / 10 / 1`; notes; weekly | Subjective level |
| Sexual activity | Counter: steps `[-1, 1]`; editable; notes | Event count; privacy-sensitive |
| Contraception taken/used | Choice: No `0`, Yes `1`; notes | Adherence/context |
| Pregnancy symptom severity | Number: `0 / 10 / 1`; notes; `multi/day; max` | Create one category per symptom |
| Fetal movement count | Counter: steps `[-1, 1, 5]`; editable; reset; notes | Use only according to clinical guidance |
| Contraction duration | Duration: defaults; `multi/day; sum`; notes | Individual contraction timing |
| Contraction count | Counter: steps `[-1, 1]`; editable; notes | Event count |
| Reproductive health notes | Notes: sentiment off | Context and observations |

## 10. Work, study, productivity, and digital habits

| Category | Type and configuration | Tracking intent |
| --- | --- | --- |
| Focused work | Duration: defaults; `multi/day; sum`; notes | Total deep-work time |
| Study | Duration: defaults; `multi/day; sum`; notes | Total study time |
| Task type | Choice: Creative `0`, Analytical `1`, Administrative `2`, Learning `3`, Meetings `4`, Communication `5`; notes; `multi/day; mean`; descriptive | Work context |
| Tasks completed | Counter: steps `[-1, 1, 5]`; editable; reset | Daily throughput |
| Interruptions | Counter: steps `[-1, 1]`; editable; notes | Distraction count |
| Pomodoro/focus sessions | Counter: steps `[-1, 1]`; editable; reset | Session count |
| Meeting duration | Duration: defaults; `multi/day; sum`; notes | Total meeting time |
| Workload | Number: `0 / 10 / 1`; notes; weekly | Perceived load |
| Productivity | Number: `0 / 10 / 1`; notes; weekly | Subjective outcome |
| Focus quality | Number: `0 / 10 / 1`; notes; `multi/day; mean`; weekly | Session/day quality |
| Procrastination duration | Duration: defaults; `multi/day; sum`; notes | Approximate lost time |
| Screen time (min) | Number: `0 / 1440 / 5`; notes | Device-reported total |
| Social media time (min) | Number: `0 / 1440 / 5`; notes | Device-reported total |
| Context switches | Counter: steps `[-1, 1, 5]`; editable; notes | Approximate count |
| Work setting | Choice: Home `0`, Office `1`, School `2`, Coworking `3`, Travel `4`, Other `5`; notes; descriptive | Nominal context |
| End-of-day accomplishment | Number: `0 / 10 / 1`; notes; sentiment; weekly | Subjective completion |

## 11. Habits, routines, and personal care

| Category | Type and configuration | Tracking intent |
| --- | --- | --- |
| Habit completed | Choice: No `0`, Partial `1`, Yes `2`; notes; weekly | Create one category per habit |
| Morning routine | Duration: defaults; notes; weekly not available for Duration | Routine time |
| Evening routine | Duration: defaults; notes | Routine time |
| Habit repetitions | Counter: steps `[-1, 1]`; editable; reset; notes | Repetition total |
| Reading | Duration: defaults; `multi/day; sum`; notes | Reading time |
| Pages read | Counter: steps `[-10, -1, 1, 10]`; editable; reset | Daily pages |
| Learning/practice | Duration: defaults; `multi/day; sum`; notes | Skill practice time |
| Outdoor time | Duration: defaults; `multi/day; sum`; notes | Total time outside |
| Sun protection | Choice: None `0`, Partial `1`, Full `2`; notes | Daily use |
| Dental brushing | Counter: steps `[-1, 1]`; editable; reset | Daily count |
| Flossing | Choice: No `0`, Yes `1`; notes | Daily completion |
| Shower/bath | Counter: steps `[-1, 1]`; editable | Frequency when relevant |
| Skin care | Choice: Skipped `0`, Partial `1`, Complete `2`; notes | Routine completion |
| Chores | Duration: defaults; `multi/day; sum`; notes | Time spent |
| Decluttering items | Counter: steps `[-5, -1, 1, 5]`; editable; reset | Item count |
| Habit reflection | Notes: sentiment | Barriers, cues, rewards |

## 12. Social life, relationships, and caregiving

| Category | Type and configuration | Tracking intent |
| --- | --- | --- |
| In-person social time | Duration: defaults; `multi/day; sum`; notes | Total time |
| Calls/video chats | Duration: defaults; `multi/day; sum`; notes | Remote connection time |
| Meaningful interactions | Counter: steps `[-1, 1]`; editable; notes | Daily count |
| Interaction quality | Number: `0 / 10 / 1`; notes; sentiment; `multi/day; mean` | Subjective quality |
| Loneliness | Number: `0 / 10 / 1`; notes; weekly | Subjective isolation |
| Sense of support | Number: `0 / 10 / 1`; notes; weekly | Perceived support |
| Conflict intensity | Number: `0 / 10 / 1`; notes; `multi/day; max` | Peak intensity |
| Conflict duration | Duration: defaults; `multi/day; sum`; notes | Total conflict time |
| Affection/connection | Number: `0 / 10 / 1`; notes; weekly | Relationship connection |
| Caregiving duration | Duration: defaults; `multi/day; sum`; notes | Total caregiving time |
| Caregiving tasks | Counter: steps `[-1, 1, 5]`; editable; reset; notes | Task count |
| Social context | Choice: Alone `0`, Partner `1`, Family `2`, Friends `3`, Coworkers `4`, Group/community `5`; multi-select; notes; descriptive | Nominal context |
| Relationship notes | Notes: sentiment | Narrative context |

## 13. Substance use and reduction goals

Use neutral language and configurable units. Correlations are observational and should not be presented as evidence that a substance caused an outcome.

| Category | Type and configuration | Tracking intent |
| --- | --- | --- |
| Alcohol (standard drinks) | Number: `0 / 30 / 0.5`; notes; `multi/day; sum` | Daily total and timing |
| Caffeine (mg) | Number: `0 / 1500 / 5`; notes; `multi/day; sum` | Daily total and timing |
| Nicotine uses | Counter: steps `[-1, 1, 5]`; editable; notes | Daily events |
| Tobacco cigarettes | Counter: steps `[-1, 1, 5]`; editable; notes | Daily count |
| Cannabis use episodes | Counter: steps `[-1, 1]`; editable; notes | Daily episodes where legal/relevant |
| Other substance amount (user unit) | Number: user-defined bounds and step; notes; `multi/day; sum` | Unit must be in category name |
| Craving intensity | Number: `0 / 10 / 1`; notes; sentiment; `multi/day; max` | Peak craving |
| Craving duration | Duration: defaults; `multi/day; sum`; notes | Total craving time |
| Trigger context | Choice: Stress `0`, Social `1`, Habit/cue `2`, Withdrawal `3`, Boredom `4`, Celebration `5`, Other `6`; multi-select; notes; descriptive | Trigger hypotheses |
| Urges resisted | Counter: steps `[-1, 1]`; editable; notes | Coping events |
| Abstinent today | Choice: No `0`, Yes `1`; notes; weekly | Simple daily goal |
| Reduction-plan adherence | Choice: No `0`, Partial `1`, Yes `2`; notes; weekly | Plan adherence |
| Support activity | Duration: defaults; `multi/day; sum`; notes | Meeting, counseling, peer support |
| Use/recovery notes | Notes: sentiment | Context and reflection |

## 14. Environment, exposure, and context

Many of these values are better imported automatically in a future version. Manual tracking is useful only when entry burden remains acceptable.

| Category | Type and configuration | Tracking intent |
| --- | --- | --- |
| Outdoor temperature (C) | Number: `-60 / 60 / 0.5`; `multi/day; mean` | Environmental context |
| Humidity (%) | Number: `0 / 100 / 1`; `multi/day; mean` | Environmental context |
| Air quality index | Number: `0 / 500 / 1`; `multi/day; max` | Worst exposure |
| Pollen level | Choice: None `0`, Low `1`, Moderate `2`, High `3`, Very high `4`; notes | Environmental exposure |
| Weather | Choice: Clear `0`, Cloudy `1`, Rain `2`, Snow `3`, Storm `4`, Windy `5`; multi-select; descriptive | Nominal context |
| Daylight exposure | Duration: defaults; `multi/day; sum`; notes | Outdoor/light time |
| Noise exposure | Number: `0 / 10 / 1`; notes; `multi/day; max` | Subjective burden unless measured |
| Allergen exposure | Choice: Dust `0`, Pollen `1`, Mold `2`, Pet `3`, Food `4`, Chemical `5`, Unknown `6`; multi-select; notes; descriptive | Suspected exposure |
| Smoke exposure | Duration: defaults; `multi/day; sum`; notes | Approximate exposure time |
| Travel duration | Duration: defaults; `multi/day; sum`; notes | Transit time |
| Time-zone shift (hours) | Number: `-14 / 14 / 0.5`; notes | Circadian context |
| Location context | Choice: Home `0`, Work/school `1`, Outdoors `2`, Transit `3`, Healthcare `4`, Other `5`; notes; `multi/day; mean`; descriptive | Nominal context |
| Crowding | Number: `0 / 10 / 1`; notes; `multi/day; max` | Subjective density/stimulation |
| Environment notes | Notes: sentiment off | Unusual conditions |

## 15. Pain, rehabilitation, and physical function

This group deliberately overlaps with Health, Medication, and Fitness so a rehabilitation-focused setup can stand alone.

| Category | Type and configuration | Tracking intent |
| --- | --- | --- |
| Pain at rest | Number: `0 / 10 / 1`; notes; `multi/day; max`; group-only | Peak resting pain |
| Pain with activity | Number: `0 / 10 / 1`; notes; `multi/day; max`; group-only | Peak activity pain |
| Pain quality | Choice: Aching `0`, Burning `1`, Sharp `2`, Throbbing `3`, Tingling `4`, Numb `5`, Other `6`; multi-select; notes; descriptive; group-only | Symptom descriptors |
| Stiffness | Number: `0 / 10 / 1`; notes; `multi/day; max`; group-only | Peak stiffness |
| Swelling | Choice: None `0`, Mild `1`, Moderate `2`, Severe `3`; notes; group-only | Observed severity |
| Range of motion (degrees) | Number: `0 / 360 / 1`; notes; `multi/day; max`; group-only | One category per joint/movement |
| Walking duration | Duration: defaults; `multi/day; sum`; notes; group-only | Tolerated/total walking |
| Standing tolerance | Duration: defaults; `multi/day; max`; notes; group-only | Longest tolerated interval |
| Exercise repetitions | Counter: steps `[-5, -1, 1, 5]`; editable; splits; notes; group-only | Prescribed repetitions |
| Rehabilitation session | Duration: defaults; `multi/day; sum`; notes; group-only | Total practice time |
| Functional difficulty | Number: `0 / 10 / 1`; notes; group-only | Difficulty of a specific task |
| Assistive device used | Choice: None `0`, Brace `1`, Cane `2`, Crutches `3`, Walker `4`, Wheelchair `5`, Other `6`; notes; descriptive; group-only | Daily context |
| Medication benefit | Number: `0 / 10 / 1`; notes; `multi/day; mean`; group-only | Subjective response |
| Rehabilitation notes | Notes: sentiment off; group-only | Technique, flare, clinician instructions |

## 16. Household, finance, and life context

These variables can explain changes in health, mood, sleep, and productivity without being health categories themselves.

| Category | Type and configuration | Tracking intent |
| --- | --- | --- |
| Financial stress | Number: `0 / 10 / 1`; notes; weekly | Perceived strain |
| Unplanned spending (currency) | Number: `0 / 100000 / 1`; notes; `multi/day; sum` | Use currency in the name |
| No-spend day | Choice: No `0`, Yes `1`; notes; weekly | Daily goal |
| Paid work duration | Duration: defaults; `multi/day; sum`; notes | Total work time |
| Commute duration | Duration: defaults; `multi/day; sum`; notes | Total commute time |
| Household work | Duration: defaults; `multi/day; sum`; notes | Chore time |
| Major life event | Choice: Positive `0`, Mixed `1`, Negative `2`; notes; sentiment; descriptive | Event context; do not interpret numeric direction |
| Schedule disruption | Number: `0 / 10 / 1`; notes | Degree of disruption |
| Free time | Duration: defaults; `multi/day; sum`; notes | Uncommitted time |
| Daily demands | Number: `0 / 10 / 1`; notes; weekly | Subjective burden |
| Household/life notes | Notes: sentiment | Context not captured elsewhere |

## Cross-group duplicates worth preserving

The following categories should remain independently configurable in multiple groups when users want self-contained dashboards or group-limited correlations:

| Repeated category | Useful groups | Why duplication is meaningful |
| --- | --- | --- |
| Sleep quality and sleep duration | Sleep, Health, Fitness, Mental health, Baby/caregiver | Same observation supports different workflows and hypotheses |
| Stress and mood | Health, Mental health, Work, Caregiving, Substance reduction | Context and desired note prompts differ |
| Diet and hydration | Diet, Fitness, Health, Baby/caregiver | Intake may be an outcome, exposure, or recovery variable |
| Pain and soreness | Health, Symptoms, Fitness, Rehabilitation | General symptoms differ from activity-specific observations |
| Medication use and benefit | Medication, Symptoms, Rehabilitation, Reproductive health | One treatment may be evaluated in several condition contexts |
| Screen time | Sleep, Productivity, Mental health | Timing and interpretation differ |
| Outdoor/light exposure | Sleep, Fitness, Environment, Mental health | Can represent circadian input, activity, or context |
| Social connection | Mental health, Relationships, Substance reduction | Support may be both an exposure and an intervention |
| Weight and heart rate | Health, Fitness, Reproductive/postpartum | Measurement is shared but the surrounding question differs |
| Notes | Every group | Group-specific prompts produce more useful context than one undifferentiated diary |

When duplicates are created, either give them distinct names such as "Sleep - quality" and "Fitness recovery - sleep quality", or keep one shared category with `correlateWithinGroup: false`. Do not enter the same real-world observation twice unless the app later supports linked aliases; duplicated entries can falsely inflate confidence.

## Suggested starter bundles

A broad catalog is useful for discovery, but a practical first-run bundle should stay small.

### General wellbeing

- Mood: Choice, five ordered levels, notes and sentiment, weekly
- Energy: Number `0 / 10 / 1`, notes, weekly
- Stress: Number `0 / 10 / 1`, notes, weekly
- Sleep quality: Number `0 / 10 / 1`, notes, weekly
- Sleep period: Duration, cumulative, start/stop series enabled
- Exercise duration: Duration, multiple per day, sum
- Water: Counter with `250` and `500` mL steps
- Daily notes: Notes with sentiment

### Fitness and recovery

- Workout duration, Workout type, RPE, Distance, Soreness, Readiness, Sleep period, Protein, Water, Resting heart rate, and Recovery notes

### Symptom investigation

- One severity Number per symptom, one Duration or Counter for frequency/burden, Medication doses, Treatment benefit, Sleep quality, Stress, Meal notes, and Symptom notes

### Infant care

- Breastfeeding duration and side, Bottle volume and contents, Wet diapers, Dirty diapers, Baby sleep, Night wakings, Tummy time, Temperature, and Caregiver notes

## Category types and capabilities to add

The following data shapes are not well represented by the current five kinds. They should be modeled explicitly rather than encoded as fragile naming conventions.

### 1. Boolean / completion

**Need:** A true/false value with one-tap entry, optional default, and no implied intermediate state.

**Examples:** Medication taken, flossed, contraception used, fever present, abstinent today.

**Why Choice is insufficient:** A two-option Choice works numerically but adds unnecessary UI and does not distinguish unanswered from false unless the input flow is very careful.

**Suggested config:** `trueLabel`, `falseLabel`, `defaultValue`, `allowUnknown`, `weeklyEffectEnabled`.

### 2. Timestamp / time of day

**Status: implemented as the `event-time` kind.** Each entry's editable `localTime` is the datum; "Log now" stamps the current time. Derived series cover the minute of day, four daypart indicators, a single hourly-breakdown toggle that fans out into 24 per-hour 0/1 series, a per-day count, and `timeSinceCategoryIds`-driven "minutes since the most recent prior entry" series with unlimited lookback. Durations also carry `timeSinceCategoryIds` (one datapoint per recorded period, anchored at the period's start), and duration *sources* contribute each recorded period's start as an event.

**Remaining gaps:** circular statistics (a linear minute-of-day mean mishandles midnight-spanning times — prefer the daypart series near midnight), a `dateTime` mode, and an explicit time-zone policy.

### 3. Structured interval / episode

**Need:** Start, stop, optional pauses, label, and concurrent episodes as one event.

**Examples:** Sleep episode, fasting window, migraine, contraction, medication effect window, work session.

**Why Duration is insufficient:** Duration is timer-oriented and cannot clearly represent planned/manual intervals, overlapping episodes, or episode attributes.

**Suggested config:** `manualEntry`, `timerEnabled`, `pauseEnabled`, `overlapPolicy`, `attributes`, and duration/start/stop/count series.

### 4. Measurement with unit and validation

**Need:** A numeric value whose unit, display precision, conversion, and plausible bounds are first-class.

**Examples:** Weight, temperature, glucose, blood pressure components, distance, fluid volume, nutrient intake.

**Why Number is insufficient:** Units currently live in names, conversions are manual, and min/max are UI bounds rather than clinical plausibility or validation rules.

**Suggested config:** `unit`, `unitFamily`, `displayUnit`, `precision`, `softMin`, `softMax`, `hardMin`, `hardMax`.

### 5. Paired or compound measurement

**Need:** Two or more synchronized values stored as one observation.

**Examples:** Systolic/diastolic blood pressure, height/weight, latitude/longitude, exercise weight/repetitions, baby feed amount/type.

**Why separate Numbers are insufficient:** Separate timestamps can drift and the relationship between fields is lost.

**Suggested config:** Named component fields, per-component units/ranges, atomic timestamp, and component virtual series.

### 6. Medication / dose event

**Need:** Medication identity, strength, amount, unit, route, scheduled time, actual time, and as-needed reason.

**Examples:** Scheduled tablet, insulin dose, inhaler puffs, infant medicine.

**Why Counter/Number is insufficient:** A count does not safely capture dose, concentration, route, schedule, or missed-dose status.

**Suggested config:** Medication definition plus dose events, reminders, adherence state, and explicit safeguards against dosing recommendations.

### 7. Nominal choice

**Need:** Labels that have no mathematical order and should be dummy/one-hot encoded for analysis.

**Examples:** Workout type, weather, location, medication identity, baby bottle contents.

**Why Choice is insufficient:** Current Choice options have numeric values, so Pearson/Spearman calculations may infer a false ordering or distance.

**Suggested config:** `encoding: ordinal | nominal`; nominal options generate one binary virtual series per option.

### 8. Anchored rating scale

**Need:** A rating with labels at defined points and optional validated wording.

**Examples:** Pain `0-10`, RPE, mood, sleep quality, hunger/fullness.

**Why Number is incomplete:** A bare slider does not preserve anchors such as "no pain" and "worst imaginable," and Choice becomes cumbersome for 11 points.

**Suggested config:** Numeric range plus `anchors`, `displayMode: slider | buttons | faces`, and optional questionnaire provenance.

### 9. Checklist / routine

**Need:** A stable set of independently completed sub-items with completion percentage and item-level history.

**Examples:** Morning routine, rehabilitation exercises, baby bedtime routine, medication checklist.

**Why multi-select Choice is insufficient:** Unselected can mean either incomplete or not applicable, and repeated daily sub-item history is hard to analyze.

**Suggested config:** Items with `required`, `notApplicable`, order, completion timestamps, and total/item virtual series.

### 10. Questionnaire / scored instrument

**Need:** Multiple questions, answer scales, scoring rules, cadence, versions, and interpretation metadata.

**Examples:** Clinician-selected screening tools, readiness questionnaires, symptom inventories.

**Why independent categories are insufficient:** They lose instrument version, reverse scoring, completeness rules, and score provenance.

**Suggested config:** Versioned item definitions, scoring expressions, missing-answer policy, schedule, and clear non-diagnostic labeling. Only include instrument text when licensing permits it.

### 11. Body location / body map

**Need:** Anatomical region, side, and optionally a marked area or intensity overlay.

**Examples:** Pain, rash, swelling, injection site, injury.

**Why Notes is insufficient:** Free text is inconsistent and cannot produce reliable region-specific series.

**Suggested config:** Standard region IDs, laterality, front/back map, intensity, and multi-region support.

### 12. Structured event with tags

**Need:** A timestamped event with zero or more tags and optional numeric attributes.

**Examples:** Symptom episode, meal, workout, social interaction, baby diaper, craving.

**Why existing types are insufficient:** Multiple Choice can capture tags but not a reusable event entity with several typed attributes.

**Suggested config:** Event templates, typed fields, tags, time, notes, and per-field virtual series.

### 13. Text with tags and extracted entities

**Need:** Notes plus user-controlled labels without forcing sentiment as the only numeric derivation.

**Examples:** Food diary, symptom triggers, dream journal, therapy notes, milestone log.

**Why Notes is incomplete:** Sentiment is often irrelevant or misleading for clinical and factual notes.

**Suggested config:** Tags, templates/prompts, local-only entity extraction opt-in, and exact privacy controls.

### 14. Photo / attachment

**Need:** A locally stored image or file linked to an entry, with consent-aware export/deletion.

**Examples:** Meal photo, rash progression, medication label, baby diaper reference, rehabilitation posture.

**Why Notes is insufficient:** Visual evidence cannot be represented reliably as text.

**Suggested config:** Media type, local URI, capture time, caption, encryption/export policy, and no automatic medical interpretation by default.

### 15. Imported or calculated series

**Need:** Read-only observations from device APIs, files, wearables, weather services, or formulas.

**Examples:** Steps, heart rate, screen time, sleep stages, weather, BMI, rolling average, adherence percentage.

**Why manual categories are insufficient:** Re-entry is burdensome and error-prone; calculated values should retain provenance and should not be edited as raw observations.

**Suggested config:** `source`, `sourceId`, `unit`, synchronization policy, formula, dependencies, provenance, and missing-data policy.

### 16. Goal / target / threshold

**Need:** A category paired with a changing target, target range, or limit and a derived adherence series.

**Examples:** Water goal, bedtime window, medication schedule, workout target, caffeine ceiling.

**Why a Number alone is insufficient:** The observed value and desired target are different data, and targets can change over time.

**Suggested config:** `targetType: minimum | maximum | range | exact`, effective dates, reminders, and percent/boolean adherence series.

### 17. Cycle / phase

**Need:** Repeating phases or an event-defined cycle with phase-aware analysis.

**Examples:** Menstrual cycle, rotating shift, treatment cycle, training block.

**Why weekly effects are insufficient:** Not all cycles are seven days or fixed-length, and some begin with a recorded event.

**Suggested config:** Cycle start event, expected/variable length, named phases, phase confidence, and sine/cosine phase series.

### 18. Location and environmental sample

**Need:** Privacy-aware location or automatically sampled environmental context.

**Examples:** Home/work context, travel, altitude, air quality, pollen, temperature, daylight.

**Why Choice/Number is insufficient:** Manual values lack provenance, time alignment, and location privacy controls.

**Suggested config:** Coarse/fine precision, retention policy, permission state, provider provenance, sampling interval, and derived exposure series.

## Modeling and analysis cautions

- Correlation does not establish causation. Reverse causality, common causes, trends, seasonality, repeated testing, and missing data can all produce convincing but misleading relationships.
- Numeric Choice values should represent a real order. Nominal choices such as workout type or location should not be treated as continuous numeric scales.
- A `0-10` rating is ordinal in practice even if analyzed numerically. Keep labels and entry habits consistent.
- Use `sum` for additive quantities such as total water, repetitions, and duration; `mean` for repeated ratings; `max` for worst daily symptom severity; and `count` virtual series for event frequency.
- Avoid enabling both highly redundant raw and derived series unless the distinction is intentional.
- Keep timestamps and local dates intact. Sleep and travel commonly cross midnight and time zones.
- Track "not measured," "not applicable," and true zero separately in a future missing-value model. Absence of an entry must not silently become zero.
- Sentiment analysis is most useful for reflective mood notes. Disable it for factual logs, medical terminology, terse baby logs, and other text where lexical tone is not the intended construct.
- Prefer a short baseline set, add categories when a concrete question arises, and periodically retire categories that are not used.

## Worked example: default User workspace

These are the categories seeded into a fresh "User" workspace (`src/lib/defaultCategories.ts`), a headache / stomach-pain tracking setup for a hybrid home-office worker with a young child and a partner. "Restore defaults" re-adds any of them (matched by name) into these named groups. "Items mode" means `optionSeriesMode: 'items'` with `capped` occurrences: one 0/1 series per option per day.

### Group: Headache

| Category | Type and configuration | Tracking intent |
| --- | --- | --- |
| Headache episode | Duration: multi/day; notes; sum primary; `timeSinceCategoryIds: [Meals, Stomach pain onset]` | One timed entry per headache; start-time series cover onset times, and each recorded period emits "minutes since last meal / stomach pain" datapoints |
| Headache severity | Number: `0 / 10 / 1`; notes; multi/day; max primary | Worst daily headache |
| Headache pain type | Choice: Throbbing/pulsating, Pressure/band-like, Stabbing/sharp, Dull ache, Behind the eyes, One-sided, Sinus/facial pressure, Neck/shoulder-related; multi-select; items mode; multi/day; notes; descriptive | Pain-quality descriptors as independent series |
| Activity at headache onset | Choice: Desk work (screen), Video meetings, Commuting, Childcare/play, Chores/housework, Cooking/eating, Exercise, Relaxing/screen leisure, Just woke up; multi-select; items mode; multi/day; notes; descriptive | Onset context; identical option list to the stomach group |
| Worked from | Choice: Home, Office, Datacenter; single-select; items mode; descriptive | One 0/1 series per work location per day |

### Group: Stomach

| Category | Type and configuration | Tracking intent |
| --- | --- | --- |
| Stomach pain onset | EventTime: multi/day; `timeSinceCategoryIds: [Meals, Caffeine, Headache episode]` | Onset times plus automatic "minutes since last meal / caffeine / headache at pain" series |
| Stomach pain severity | Number: `0 / 10 / 1`; notes; multi/day; max primary | Worst daily pain |
| Stomach pain area | Choice: Upper middle (epigastric), Upper right (under ribs), Upper left, Around navel, Lower right, Lower left, Lower middle (pelvic), Whole abdomen/diffuse; multi-select; items mode; multi/day; notes; descriptive | Per-region series as a body-map stand-in |
| Stomach pain type | Choice: Cramping, Burning, Sharp/stabbing, Dull ache, Bloating/pressure, Gnawing/hunger-like, Nausea-accompanied; multi-select; items mode; multi/day; notes; descriptive | GI pain descriptors |
| Activity at stomach pain onset | Choice: same nine options as the headache activity list; multi-select; items mode; multi/day; notes; descriptive | Kept identical so activity series align across both groups |

### Group: Lifestyle

| Category | Type and configuration | Tracking intent |
| --- | --- | --- |
| Meals | Choice: Olive-oil salad/vegetables, Whole grains, Legumes, Fish/seafood, Poultry, Eggs, Yogurt/cheese, Nuts/seeds, Fruit, Tomato-based dish, Garlic/onion-heavy dish, Off-plan/processed; multi-select; items mode; multi/day; notes | What and when: entry times anchor the time-since series for both symptom categories; per-food 0/1 series cover composition |
| Caffeine | Choice: Coffee `95`, Tea `47`, Espresso `63`, Double espresso `126` (typical mg/serving, values shown); single-select; intensity mode; multi/day; sum primary; inverse off | Daily caffeine mg as one series; entry times double as the time-since caffeine source |
| Sleep duration (h) | Number: `0 / 14 / 0.25`; notes | Short sleep is the top headache confounder with a young child |
| Night wakings | Counter: steps `[-1, 1]`; editable | Sleep fragmentation independent of total hours |
| Water intake (glasses) | Counter: steps `[-1, 1]`; editable | Dehydration headaches |
| Screen time | Duration: defaults; multi/day; sum | Eye strain / tension headaches |
| Pain med doses | EventTime: multi/day; notes | Per-dose times plus a count/day series; frequent use flags medication-overuse (rebound) headache |
| Household illness | Choice: None, Child sick, Partner sick, Self sick; multi-select; items mode; descriptive | Daycare-borne infections explain symptom clusters |
| Stress | Number: `0 / 10 / 1`; notes; sentiment; multi/day; mean; weekly | Perceived stress |
| Stool form (Bristol) | Choice: Type 1 through Type 7 mapped to values `1`-`7`; multi/day; median primary; notes; count series enabled | Standardized GI context; the entries-count series doubles as bowel-movement frequency |

Deliberately omitted from the defaults: an alcohol counter and a posture rating, a manual "time since last meal" number (the automatic time-since series supersedes it), and a separate bowel-movement counter (Stool form's entries-count series covers it).