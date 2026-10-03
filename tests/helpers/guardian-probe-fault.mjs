// Trusted native fault seam, no browser, caller code or arbitrary command.
process.once('message',()=>{
 const mode=process.argv[2];
 process.send(JSON.stringify({kind:'failed',stage:mode==='invalid'?'PRIVATE_STAGE_MUST_NOT_LEAK':mode==='wrong-pair'?'browser-load':'browser-launch',
  reason:mode==='invalid-reason'?'PRIVATE_REASON_MUST_NOT_LEAK':'missing-browser-executable'}));
});
process.on('disconnect',()=>{process.exitCode=7;});
