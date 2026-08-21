# Local prototype UAT

Run with `pnpm prototype`; no account, provider login, or cloud service is required. Mark each applicable line pass/fail and attach a screen recording or screenshot. A P0/P1 failure fails UAT regardless of percentage.

| ID | Role/context | Check | Evidence |
| --- | --- | --- | --- |
| UAT-01 | Manager | Enter, switch persona, sign out, then confirm expired temporary cannot enter protected work. | Pending human run |
| UAT-02 | Manager, keyboard only | Open mobile navigation, search, New, Help, Profile and Notifications; Escape returns focus. | Pending human run |
| UAT-03 | Manager | Capture manual intake, claim it, release it, and confirm refresh persistence. Try offline capture while disconnected. | Pending human run |
| UAT-04 | Manager | Create/open project, inspect stages, create task and record time. | Pending human run |
| UAT-05 | External reviewer, private browser | Open review link; identify, leave feedback and download an allowed file. Check revoked/expired handling. | Pending human run |
| UAT-06 | Manager + external reviewer | Create/share a quote, accept it privately, and verify the invoice state updates. | Pending human run |
| UAT-07 | Manager | Open workload, export reports CSV, mark notifications read, and exercise prototype simulations. | Pending human run |
| UAT-08 | Manager + reviewer | Check 200% zoom, VoiceOver, reduced motion, touch at 375px, validation, retry and unavailable states. | Pending human run |

Acceptance rule: at least 95% of applicable checks pass, with zero P0/P1 issues. Three uninterrupted rehearsals must be recorded separately from automated runs.
