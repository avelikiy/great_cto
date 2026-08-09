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
// collision, and the retry closes the rest.
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
