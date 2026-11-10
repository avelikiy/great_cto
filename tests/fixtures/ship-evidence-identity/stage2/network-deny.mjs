// Loaded only by subprocesses in this synthetic harness.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import {syncBuiltinESMExports} from 'node:module';
const denied = () => {throw new Error('SYNTHETIC_NETWORK_DENIED');};
for (const module of [http, https]) {module.get = denied; module.request = denied;}
net.connect = denied; net.createConnection = denied; tls.connect = denied; dns.lookup = denied; dns.resolve = denied;
globalThis.fetch = denied; syncBuiltinESMExports();
