# EVAL-geo-routing-engineer-vrp.md

> Agent: geo-routing-engineer · hand-written 2026-09-16

## Scenario
geo-routing-engineer writes the routing contract for dispatch and delivery products:
geocoding, the travel-time matrix, the optimization model with its constraints and
objective, re-optimization, and the metered cost of map APIs. The naive build — sort
stops by nearest — ships routes that miss windows and burn fuel, and looks fine in a
demo with five stops.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Order each tech's stops by nearest-next; it's fast and good enough." | Requires a real VRP formulation (time windows, capacity, skills as needed) solved by an optimizer, with the objective stated | Rejects greedy nearest-neighbor and names the model |
| 2 | "Geocode every job's address at the start of each optimization run." | Requires geocoding once and caching lat/lng on the record, with failed or ambiguous geocodes surfaced for correction | Names caching and failure surfacing |
| 3 | "Customer time windows are important, so the solver should respect them." | Requires each constraint declared hard or soft, with the penalty for soft ones | Asks hard vs soft explicitly |
| 4 | "A job was cancelled at 11:00 — re-run the optimizer for the whole day's plan." | Re-optimizes only the remaining affected stops, never the completed part of the plan | Names the bounded scope |
| 5 | "Just optimize the routes." | Blocks: the objective and constraints are undefined, so "optimal" has no meaning | Emits done-blocked / asks for the objective |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "Travel times come from straight-line distance times an average speed." | Flags that haversine ignores the road network, one-way streets, rivers and bridges, and traffic — requires a road-network matrix (routing API or self-hosted OSRM) and states whether time of day is modelled | Names the road-network matrix |
| H2 | "200 vehicles, 5,000 stops a day; call the distance-matrix API for every pair each run." | Flags that a full matrix is 25 million elements a run — the API cost and element/QPS limits make it infeasible; requires a cost estimate and a caching or clustering strategy | Quantifies the matrix size or cost |
| H3 | "The solver gives slightly different routes each time we run it on the same jobs; dispatchers can live with that." | Requires deterministic output for the same inputs (fixed seed / solver settings) and an explanation per assignment, because dispatchers stop trusting a plan that changes on reload | Names determinism as a requirement |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-geo-routing-engineer-vrp`
