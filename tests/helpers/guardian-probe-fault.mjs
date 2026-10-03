// Trusted native fault seam, no browser, caller code or arbitrary command.
process.once('message',()=>{
 process.send(JSON.stringify({kind:'failed',stage:process.argv[2]==='valid'?'browser-launch':'PRIVATE_STAGE_MUST_NOT_LEAK'}));
});
process.on('disconnect',()=>{process.exitCode=7;});
