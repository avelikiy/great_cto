# Canvas focus for controlled execution

Approved direction: Canvas focus. This change is a browser layout and navigation projection. It adds no controller transition, provider call, backend endpoint, evidence claim or approval authority.

Work is a project-scoped list. Selecting a task opens a separate view inside the existing work panel. Overview, Execution and Evidence remain distinct. Execution uses a compact desktop navigation rail, one graph canvas and an on-demand inspector. The mobile navigation drawer remains the existing accessible drawer. Task switching uses a project-scoped picker, not a permanently pinned master list.

## Navigation and state

Hash routes use `work/task/<encoded-key>/<tab>` with bounded category/search parameters. Project scope stays in the existing query parameter. Unknown explicit task identifiers show unavailable; they never select the first readable task. A task detail is resolved against all readable project entries, independent of the list filter. Browser replay must not create new history entries. Work return preserves list filter and scroll within the current project. Project changes synchronously discard selection, dialogs and prior snapshots.

## Evidence and accessibility

Graph coordinates may change to left-to-right, but node identity, recorded edges, validation limits and refusal behavior stay authoritative. The inspector is read-only. Overview retains existing publication preflight and confirmation controls; observation tabs do not duplicate them. Missing, partial and truncated states stay visible outside collapsed technical sections. A keyboard node list remains available. Inspection does not change the task route; closing returns focus to its initiating node. The canvas has local scrolling and explicit fit/zoom controls, not automatic unreadable downscaling.

Visual references: Refero Ui style `c14c0a94-1037-449e-bf5b-4cb972656ac7`, Memotron graph screen `1944873f-c52a-4529-a551-41c2c74806d5`, Linear task screen `1a493a2c-7d09-4143-b0dd-745781ea7991` and Weights & Biases run screen `1141e627-682d-4219-a1bd-9efc6e15fcee`. Existing semantic theme tokens and icons remain the product source; no third-party UI assets or analytics are loaded.

## Acceptance boundary

Regression coverage includes legacy renderers, encoded/invalid routes, missing explicit tasks, tasks outside the active filter, history replay and project isolation. Browser checks cover navigation, picker and inspector focus, node/edge parity, themes, narrow and wide layouts and unchanged controller state. The canonical repository gate and independent review are required before ship approval. Layout approval does not authorize merge, release, installation or activation of a candidate. Public screenshots must come from the implemented product with isolated sample data; design diagrams are not runtime evidence.
