---
id: SCHED-4515
title: Ack moves from the row into an incident panel
status: done
plan: R2 (changed), R1 (unchanged)
---

Product's decision after the step-1 report: "New incidents stay live at the top. Ack leaves the row: a row
opens its incident panel, and Ack lives there."

Why: in the step-1 recording (00:37) on-call aimed at INC-4913's Ack; INC-2564 landed at the top mid-aim,
every row moved down one place, and the click acked INC-3830 instead.

- Rows have no Ack button. Clicking a row (or Enter / Space on a focused row) opens the incident panel
  (`data-testid="incident-panel"`, `data-id="<id>"`) beside the list, naming the incident.
- The panel's Ack (`data-testid="panel-ack"`, labelled "Ack <id>") acks the incident the panel names, by id.
  A row moving under the pointer can only open the wrong panel, which names the wrong id — never send an ack.
- After the ack the row shows its `acked` mark; the panel says "<id> acked".
- New incidents keep landing live at the top (R1); rows are never removed or re-created on refresh.

Acceptance: a click that lands on a shifted row opens that row's panel, not an ack; Ack in the panel acks the
incident the panel names.
