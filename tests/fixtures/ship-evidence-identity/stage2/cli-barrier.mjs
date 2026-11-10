// Each child enters the actual CLI only after both independent processes are ready.
import {pathToFileURL} from 'node:url';
process.send({ready: true});
process.once('message', async message => {
  if (message?.action !== 'go') process.exit(9);
  process.argv = [process.execPath, process.env.SHIP_FIXTURE_CONTROLLER, ...message.args];
  try {await import(pathToFileURL(process.env.SHIP_FIXTURE_CONTROLLER));}
  catch (error) {console.error(error.message); process.exitCode = 2;}
  finally {process.disconnect();}
});
