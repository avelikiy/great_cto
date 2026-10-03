// Fixed native process faults for a trusted test-only ps seam; never a guardian.
const mode=process.argv[2];
if(mode==='nonzero'){process.stderr.write('PRIVATE_PAYLOAD_MUST_NOT_LEAK');process.exitCode=7;}
else if(mode==='timeout')setInterval(()=>{},1000);
else if(mode==='output-limit'){process.stdout.write('PRIVATE_PAYLOAD_MUST_NOT_LEAK'.repeat(100000));setInterval(()=>{},1000);}
else if(mode==='invalid-rows')process.stdout.write('PRIVATE_PAYLOAD_MUST_NOT_LEAK');
else if(mode==='signal')process.kill(process.pid,'SIGKILL');
else process.exitCode=9;
