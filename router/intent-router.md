# PR Intent Router

## Purpose

Automatically classify user requests and route them to the right PR workflow.

## Intent Categories

### Brand Strategy
Triggers:
- brand strategy
- communication plan
- positioning
- campaign planning

Route:
commands/pr-plan.md

---

### Newsworthiness Assessment
Triggers:
- should we send a press release?
- is this news?
- media value

Route:
commands/news-score.md

---

### Media Relations
Triggers:
- journalist pitch
- media outreach
- press relations

Route:
commands/media-pitch.md

---

### Crisis Communication
Triggers:
- negative comments
- reputation crisis
- public complaints

Route:
commands/crisis-response.md

---

### Reputation Management
Triggers:
- brand perception
- public sentiment
- reputation audit

Route:
references/reputation-monitoring.md

## Default Rule

Do not generate content immediately.
First identify:

1. Business objective
2. Communication problem
3. Audience
4. Evidence
5. Desired perception change
