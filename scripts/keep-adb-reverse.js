// Dev helper, started with Metro (`npm start` / `npm run android`).
//
// The app calls the API at http://localhost:4000 — on a USB phone that only
// reaches this PC through `adb reverse`, which Android forgets on every
// replug, PC sleep or adb restart ("Can't reach the server"). This watches
// for devices and re-applies the reverse ports whenever one connects.

const { execFile, spawn } = require('child_process');

/** Metro and the OPD backend. */
const DEFAULT_PORTS = [8081, 4000];

function reverseAll(ports) {
  for (const port of ports) {
    execFile('adb', ['reverse', `tcp:${port}`, `tcp:${port}`], () => {});
  }
}

function keepAdbReverse(ports = DEFAULT_PORTS) {
  let child;
  let stopped = false;

  const start = () => {
    child = spawn('adb', ['track-devices'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    child.on('error', () => {
      stopped = true; // adb isn't installed / on PATH: nothing to do
    });
    child.stdout.on('data', chunk => {
      // A line like "10MF86FHB4000HQ\tdevice": a device is ready.
      if (/\tdevice\b/.test(chunk.toString())) {
        // Right after connecting it can still refuse commands: try twice.
        setTimeout(() => reverseAll(ports), 500);
        setTimeout(() => reverseAll(ports), 2500);
      }
    });
    // The adb server was restarted: watch again.
    child.on('exit', () => {
      if (!stopped) {
        setTimeout(start, 5000).unref();
      }
    });
  };

  start();
  process.on('exit', () => {
    stopped = true;
    child?.kill();
  });
  return () => {
    stopped = true;
    child?.kill();
  };
}

module.exports = keepAdbReverse;
