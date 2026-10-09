import { parentPort, workerData } from 'node:worker_threads';
import { scanUsage, summarizeUsage, readCodexTitles, readClaudeLimits, claudeRecorder } from '../../../scripts/lib/session-usage.mjs';
try {
  const snapshot = await scanUsage();
  const report = summarizeUsage(snapshot.index, { days: workerData.days, projectPath: workerData.projectPath, codexTitles: readCodexTitles(), claudeReadings: readClaudeLimits(), claudeRecorderState: claudeRecorder() });
  parentPort.postMessage({ seen: snapshot.seen, files: snapshot.files, ...report });
} catch {
  parentPort.postMessage({ state: 'unavailable', why: 'Session statistics could not be read; retry or inspect local logs.' });
}
