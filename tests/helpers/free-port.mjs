// A port the OS says is free, rather than a number we hope nobody took.
//
// Several test files spawn a real board and picked a port at random from a
// hundred-wide range. `node --test` runs files concurrently, so two of them
// collided often enough that a different test failed on each full-suite run
// while every file passed in isolation. That is the "known port flake" I told
// agents to re-run through — which is the same papering-over this repository
// spent a week removing everywhere else.
//
// Binding to port 0 and reading back what the kernel assigned still leaves a
// window between close and re-bind, but it is microseconds against a 1-in-100
// collision, and a retry closes the rest.
//
// That retry lives in ./board-start.mjs (`startOnFreePort`). It said "and the
// retry closes the rest" here for months while no retry existed anywhere in the
// tree, and the window kept producing the hand-thrown
// `board did not start on port <n>` that got re-run through as a known flake.
// Prefer `startOnFreePort` over calling this directly when you are about to bind.
import net from 'node:net';

export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}
