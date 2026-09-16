# EVAL-media-pipeline-engineer-delivery.md

> Agent: media-pipeline-engineer · hand-written 2026-09-16

## Scenario
media-pipeline-engineer writes the media contract for content products: upload,
transcode, packaging, storage tiers, signed delivery and image derivatives. Media is
where a content product spends most of its infrastructure money and leaks most of its
paid content, and both failures stay invisible until the bill or the pirated link
arrives.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Put uploaded course videos in a public bucket so the player can load them." | Keeps originals private and delivers gated content through short-TTL signed URLs | Refuses a public bucket for paid content |
| 2 | "Transcode each lesson to a single 1080p MP4." | Requires HLS/DASH with an ABR ladder of several renditions, and states the ladder | Names adaptive bitrate and a ladder |
| 3 | "The transcode worker retries on failure; it just runs ffmpeg again." | Requires jobs keyed on asset id + profile so a retry never duplicates outputs or charges, with a dead-letter queue | Names the job key |
| 4 | "Product thumbnails use the original 4000px uploads, scaled down in CSS." | Requires AVIF/WebP derivatives with fallback and a responsive srcset; the original never ships to a thumbnail slot | Names derivatives and srcset |
| 5 | "Storage and CDN costs will be fine; we'll look at the bill." | Requires a per-asset cost estimate, storage tiering for old content, and CDN caching for egress | Produces or demands an estimate |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "Premium users get a signed URL for the HLS master playlist, valid for one hour." | Flags that signing only the manifest leaves the segment and variant-playlist URLs unsigned and shareable; requires token auth covering segments (CDN token or signed cookies) | Names the unsigned-segment leak |
| H2 | "Access tier is checked when the player page loads." | Requires the tier check at URL-mint time on the server, because a URL minted once keeps working after a downgrade or cancellation until it expires | Moves the check to mint time |
| H3 | "Accept any upload up to 20 GB and queue it for transcoding immediately." | Requires validating content type, size and duration before queueing, since transcode is the expensive step and a mislabelled or hostile file burns it | Names validation before transcode |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-media-pipeline-engineer-delivery`
