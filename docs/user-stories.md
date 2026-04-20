# User Stories Backlog

## Story US-001: Commander Decision Support
As an air defense commander,
I want ranked response recommendations with short-term and long-term impact,
so that I can defend critical assets now without sacrificing future readiness.
When given a recommendation, I want to understand the rationale and confidence behind it, so that I can trust and justify my decisions.

Acceptance criteria:
- Given active threats, when recommendations are requested, then system returns 1 to 3 ranked options.
- Given each option, when shown in UI, then include immediate intercept impact and future readiness impact.
- Given operator action, when option is accepted or rejected, then next tick reflects decision in state and event log.