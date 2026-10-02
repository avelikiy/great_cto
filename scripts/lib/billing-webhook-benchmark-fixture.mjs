import { createHash, randomBytes, createHmac } from 'node:crypto';
import { scenarios } from './adaptive-benchmark-protocol.mjs';

export function billingWebhookBenchmarkFixture() {
  const files = {
    '.gitignore': '.great_cto/\n', '.great_cto/PROJECT.md': 'archetype: commerce\n',
    'package.json': '{"name":"billing-webhook-benchmark","private":true,"type":"module"}\n',
    'README.md': '# Billing event handler\n\nRepair src/billing/webhook.mjs. Export async handle({state,rawBody,signature,signingSecret,charge}). Validate HMAC-SHA256 over exact rawBody before mutation. Invalid signatures return401. Duplicate event IDs and stale subscription versions must not mutate state or charge. New event IDs sharing an invoice must not charge twice. Return200 for accepted/duplicate/stale deliveries. State has seen[], versions{} storing {version,status}, charged[]. charge({invoiceId,amount}) is the injected gateway. Valid paid/cancelled events have id,subscriptionId,positive integer version,status; paid events include invoiceId and positive integer amount.\n',
    'src/billing/webhook.mjs': `export async function handle({state,rawBody,charge}) {
  const e=JSON.parse(rawBody);
  state.seen.push(e.id);
  state.versions[e.subscriptionId]={version:e.version,status:e.status};
  if(e.status==='paid') {await charge({invoiceId:e.invoiceId,amount:e.amount});state.charged.push(e.invoiceId);}
  return {status:200};
}\n`,
  };
  const sha = bytes => createHash('sha256').update(bytes).digest('hex'), signingSecret = randomBytes(32).toString('hex');
  const suffix=randomBytes(8).toString('hex'), subscriptionId=`subscription-${suffix}`;
  const event = (id,version,status='paid',invoiceId='invoice-a') => ({id:`${id}-${suffix}`,subscriptionId,version,status,
    ...(status==='paid'?{invoiceId:`${invoiceId}-${suffix}`,amount:1200}:{})});
  const delivery = (e,valid=true) => {
    const rawBody=JSON.stringify(e);return {rawBody,signature:createHmac('sha256',signingSecret).update(valid?rawBody:rawBody+' ').digest('hex')};
  };
  const groups = [
    {kind:'signature',deliveries:[delivery(event('bad',1),false)],statuses:[401],latest:null,charges:0},
    {kind:'signature',deliveries:[{rawBody:'{',signature:'z'.repeat(64)}],statuses:[401],latest:null,charges:0},
    {kind:'duplicate',deliveries:[delivery(event('dup',1)),delivery(event('dup',1)),delivery(event('dup',1))],statuses:[200,200,200],latest:{version:1,status:'paid'},charges:1},
    {kind:'out-of-order',deliveries:[delivery(event('new',3,'cancelled')),delivery(event('old',1)),delivery(event('middle',2))],statuses:[200,200,200],latest:{version:3,status:'cancelled'},charges:0},
    {kind:'double-charge',deliveries:[delivery(event('first',1)),delivery(event('second',2))],statuses:[200,200],latest:{version:2,status:'paid'},charges:1},
    {kind:'double-charge',deliveries:[delivery(event('one',1)),delivery(event('two',2,'paid','invoice-b'))],statuses:[200,200],latest:{version:2,status:'paid'},charges:2},
  ];
  const scenario=scenarios.find(s=>s.id==='billing-webhook');
  return {files,oracle:{version:1,scenario:scenario.id,criteria:scenario.checks,
    baseline:Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,sha(bytes)])),
    protected:Object.keys(files).filter(name=>name!=='src/billing/webhook.mjs'),signingSecret,subscriptionId,groups,
    execution:'macOS isolated candidate subprocess; no unsandboxed fallback',
  }};
}
