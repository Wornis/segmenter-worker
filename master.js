const { v1 } = require('@google-cloud/pubsub');
const cluster = require('cluster');

const subClient = new v1.SubscriberClient();
const projectId = 'ad4screen-us';
const subscriptionName = 'segmenter-worker-djtxk38k4';
const formattedSubscription = subClient.subscriptionPath(projectId, subscriptionName);

const NB_RANGES = 95;

/*
 * PubSub pull method is not guaranteed
 * to return the exact number of messages of the maximum specified
 * @param pulledMessages {Array} Messages already pulled
 */
const pullMessages = async (pulledMessages = []) => {
  const request = {
    subscription: formattedSubscription,
    maxMessages: pulledMessages.length ? NB_RANGES - pulledMessages.length : NB_RANGES,
    returnImmediately: true,
  };
  const [response] = await subClient.pull(request);
  const messages = [...pulledMessages, ...response.receivedMessages];
  if (messages.length > NB_RANGES) { return messages.slice(0, NB_RANGES); }
  if (messages.length < NB_RANGES) { return pullMessages(messages); }
  return messages;
};

const getData = async (messages) => messages.map(({ message: { data } }) => data.toString());

const forkWorkers = async (datas) => Promise.all(datas.map((data) => cluster.fork({ data })));


const acknowledge = async (ackIds) => subClient.acknowledge({
  subscription: formattedSubscription,
  ackIds,
});

const resetAckRequest = (ackIds) => subClient.modifyAckDeadline({
  subscription: formattedSubscription,
  ackIds,
  ackDeadlineSeconds: 20,
});

const handleChildExit = ({ id }, code, messages) => {
  if (code === 0) {
    messages.splice(id - 1, 1);
    if (!messages.length) { return process.exit(0); }
  } else {
    const data = messages[id - 1].message.data.toString();
    throw new Error(`A worker failed his job: ${data}`);
  }
};

const sleep = async (timeout) => new Promise((resolve) => setTimeout(resolve, 5000));

module.exports = async () => {
  const messages = await pullMessages();
  const data = await getData(messages);
  await forkWorkers(data.slice(0, 4));
  cluster.on('exit', (worker, code) => handleChildExit(worker, code, messages));
  while (messages.length) {
    resetAckRequest(messages.map(({ ackId }) => ackId));
    // eslint-disable-next-line no-await-in-loop
    await sleep(10000);
  }
};
