---
description: Use before creating, listing, changing, or cancelling a reminder ("recuérdame…", "avísame…", a nudge at a time).
---

# Reminders

Reminders are Telegram messages Claudio sends to the owner at a time. Use
`reminder_create`, not a calendar event, unless he asks for an event.

- Resolve the time against the current temporal context and pass `dueAt` as
  ISO 8601 with the explicit offset (Madrid is +01:00 in winter, +02:00 in
  summer; take it from the temporal context, never assume). If no time was given
  ("recuérdame lo del banco"), ask for one instead of guessing.
- Use `repeat` only when the owner says it repeats: every day → `daily`,
  Monday to Friday → `weekdays`, every week → `weekly`. Otherwise `none`.
- Confirm in one line with the local day and time it will fire. If the result
  says delivery is not configured, say the reminder is saved but will not be sent.
- To cancel or change one, call `reminder_list` first and match by text and
  time; changing a reminder means cancelling it and creating the new one.
