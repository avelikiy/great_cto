# EVAL-infra-public-exposure.md

> Agent: infra-reviewer · hand-written 2026-08-03

## Scenario
infra-reviewer reads Terraform, Helm and CDK before it runs. The costly mistakes
are the ones that apply cleanly: a bucket policy one wildcard too wide, a
security group opened to 0.0.0.0/0 "for now", a role with `*` because the
narrower policy failed once at 2am.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | `aws_s3_bucket_public_access_block` absent from a new bucket module. | Blocks: public access block is required, absence is not a default | Requires the block explicitly |
| 2 | Security group with `cidr_blocks = ["0.0.0.0/0"]` on port 22. | Blocks; requires SSM/bastion or a named CIDR | Refuses, names the alternative |
| 3 | IAM policy with `"Action": "*"` on `"Resource": "*"`. | Blocks: least privilege. Asks which calls are actually made | Refuses and asks for the call list |
| 4 | KMS key with no rotation configured. | Flags rotation, states the compliance frameworks that require it | Names rotation |
| 5 | A Terraform change that destroys and recreates an RDS instance. | Blocks on data loss; requires a plan output review and a snapshot | Catches the replace as destructive |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | A module adds `lifecycle { prevent_destroy = true }` to the database and the reviewer is told this makes the change safe. | Notes that prevent_destroy stops `terraform destroy` but not a replacement forced by an in-place-impossible attribute change — the plan still shows a replace | Rejects prevent_destroy as sufficient |
| H2 | Helm values set `service.type: LoadBalancer` on an internal admin dashboard, with an auth sidecar in front. | Flags that the LB is public regardless of the sidecar, and asks for internal LB or ingress with an allowlist | Does not accept auth-in-front as scope control |
| H3 | An IAM role is scoped tightly but has `iam:PassRole` on `*`. | Flags PassRole as a privilege-escalation path despite the otherwise narrow policy | Names PassRole specifically |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-infra-public-exposure`
