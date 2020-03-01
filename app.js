const cluster = require('cluster');

const NB_RANGES = 95;

const doJobs = async () => {
  if (cluster.isMaster) {
    const { PubSub } = require('@google-cloud/pubsub');
    const pubsub = new PubSub();
    const subOpts = { flowControl: { allowExcessMessages: false, maxMessages: NB_RANGES } };
    const subscription = pubsub.subscription('test', subOpts);

    let messageCount = 0;
    const messages = [];
    const messageHandler = async (message) => {
      messages.push(message);
      messageCount += 1;
      cluster.fork({ data: message.data, msgId: messageCount });
    };

    subscription.on('message', messageHandler);

    const handleChildExit = (worker, code) => {
      if (code === 0) {
        const msgId = worker.id - 1;
        console.log(worker.id, code);
      } else {
        throw new Error('A worker failed his job, will retry');
      }
    };

    cluster.on('exit', handleChildExit);

    await new Promise((resolve) => {
      setTimeout(async () => {
        subscription.removeListener('message', messageHandler);
        console.log(`${messageCount} message(s) received.`);
        return resolve();
      }, 6000);
    });
  } else {
    return process.exit(1);
  }
};

doJobs()
  .then(() => process.exit(0))
  .catch((e) => {
   // console.error(e);
    return process.exit(1);
  });
