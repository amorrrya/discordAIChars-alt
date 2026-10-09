
import cluster from 'cluster'

import { startBot, stopBot } from './src/bot.js'
import { color } from './src/utils/consolecolors.js';

// Ctrl+C and closing the window stop the bot instead of restarting it
const stopSignals = ['SIGINT', 'SIGTERM', 'SIGHUP'];

if (cluster.isPrimary) {
    let stopping = false;

    cluster.fork();

    cluster.on('exit', function(_, code, signal) {
        if (stopping) process.exit(0);

        console.log(`${color.Red}Bot restarting!`, code, signal);

        cluster.fork();
    });

    for (const signal of stopSignals) {
        process.on(signal, () => {
            stopping = true;
            setTimeout(() => process.exit(0), 25000);
        });
    }
}

if (cluster.isWorker) {
	startBot();

	for (const signal of stopSignals) process.on(signal, stopBot);
}
