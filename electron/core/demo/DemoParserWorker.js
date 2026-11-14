import { parentPort, workerData } from 'node:worker_threads';
import demoparser from '@laihoe/demoparser2';
import { DemoAnalyzer } from './DemoAnalyzer.js';
import { ParserVersion } from './ParserVersion.js';

try {
  const analyzer = new DemoAnalyzer(demoparser, (stage, percent) => parentPort.postMessage({ type: 'progress', stage, percent }), ParserVersion.read());
  parentPort.postMessage({ type: 'done', result: analyzer.analyze(workerData.filePath) });
} catch (error) {
  parentPort.postMessage({ type: 'error', message: error?.message ?? String(error) });
}
