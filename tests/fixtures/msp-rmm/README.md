# FleetOps RMM

A multi-tenant RMM/PSA platform built for managed service providers running
IT operations for multiple clients out of one console. FleetOps lets
technicians monitor client endpoints, push patches, and track backup jobs,
with every client MSA and its associated SLA terms enforced per tenant so
one client's data and access never bleed into another's.

Technician access to client environments goes through a credential vault
rather than shared passwords, and every managed-service engagement gets an
audit trail suitable for SOC 2 review. Ticketing and ticket escalation are
scoped per client, and the PSA layer ties billed hours back to the
managed-services contract that authorized the work.

## Installation

npm install
npm run dev
