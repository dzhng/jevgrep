# Task cost, time and solve rate

The required outcome is equal or better official task solve rate with lower cost
and elapsed time. Compare matched tasks within each engine before aggregating.
A cheaper attempt is not a win if it lowers solve rate.

Task cost includes coding-agent and Jev costs by default. Report each component
and their sum. Native TypeSafe Jev is estimated from recorded input usage at the
public rate retained with the frozen runner; output is free under the current
Jev 1.13 rate. Missing usage leaves the total unknown. Record Jev requests, bytes,
tokens and latency separately; never add Jev tokens to coding-agent token totals. The context consumed by the coding agent still contributes to
that agent's usage, and retrieval latency remains inside task wall time.

Report native task-cost telemetry when available, labelled as telemetry rather
than an invoice. Any token-priced estimate must identify its source, rates,
model, cache categories, service tier and long-context treatment. Missing usage
or cost is unknown, not zero. Keep estimates distinct from actual reported cost.

Measure agent execution through terminal completion, including its research,
Jev calls, implementation and self-verification. Report environment preparation
and official grading separately. Both arms receive equivalent prepared runtimes.

Preserve unsuccessful attempts, timeouts and repairs. Report cost and time per
attempt, official solve rate, and total spend divided by solved tasks. Cost per
solved task is undefined when none solve. Repair policies must be fixed in
advance and symmetric; include initial and repair work rather than selecting
the best attempt. Distinguish first-pass and repaired outcomes.

Freeze selection before inspecting solutions. Keep gold patches and hidden
grading material outside the coding agents' workspaces. Infrastructure failures
must remain visible and cannot be replaced with easier tasks or counted as
behavioral success.
