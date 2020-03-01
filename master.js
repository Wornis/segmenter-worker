const { PubSub } = require('@google-cloud/pubsub');
const cluster = require('cluster');
const pubsub = new PubSub();

const NB_RANGES = 95;
const subOpts = { flowControl: { allowExcessMessages: false, maxMessages: 2 } };
const subscription = pubsub.subscription('test', subOpts);

let messageCount = 0;
const messages = [];

const messageHandler = async (message) => {
  console.log(message.data.toString())
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
module.exports = async () => {
  await new Promise((resolve) => {
    setTimeout(async () => {
      subscription.removeListener('message', messageHandler);
      console.log(`${messageCount} message(s) received.`);
      return resolve();
    }, 10000);
  });
};
