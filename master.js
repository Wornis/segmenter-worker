const { v1 } = require('@google-cloud/pubsub');
const cluster = require('cluster');

const subClient = new v1.SubscriberClient();
const projectId = 'ad4screen-us';
const subscriptionName = 'segmenter-worker-djtxk38k4';
const formattedSubscription = subClient.subscriptionPath(projectId, subscriptionName);

const NB_RANGES = 95;
const ACK_DEADLINE_SECONDS = 15;

const pullMessages = async (pulledMessages = [], countRetry) => {
  const request = {
    subscription: formattedSubscription,
    maxMessages: pulledMessages.length ? NB_RANGES - pulledMessages.length : NB_RANGES,
    returnImmediately: true,
  };
  const [response] = await subClient.pull(request);
  const messages = [...pulledMessages, ...response.receivedMessages];
  if (messages.length > NB_RANGES) { return messages.slice(0, NB_RANGES); }
  if (messages.length < NB_RANGES) {
    if (countRetry < 15) return pullMessages(messages, countRetry + 1);
  }
  return messages;
};

const getData = async (messages) => messages.map(({ message: { data } }) => data.toString());

const forkWorkers = async (datas) => Promise.all(datas.map((data) => cluster.fork({ data })));

const acknowledge = async (ackIds) => subClient.acknowledge({
  subscription: formattedSubscription,
  ackIds,
});

const resetAckDeadline = (ackIds) => subClient.modifyAckDeadline({
  subscription: formattedSubscription,
  ackIds,
  ackDeadlineSeconds: ACK_DEADLINE_SECONDS,
});

const handleChildExit = async ({ id }, code, messages) => {
  const messageIdx = id - 1;
  if (code === 0) {
    await acknowledge([messages[messageIdx]]);
    messages.splice(messageIdx, 1);
    if (!messages.length) { return process.exit(0); }
    return null;
  }
  const data = messages[messageIdx].message.data.toString();
  throw new Error(`A worker failed his job: ${data}`);
};

const sleep = async (timeout) => new Promise((resolve) => setTimeout(resolve, timeout));

module.exports = async () => {
  const messages = await pullMessages();
  const data = await getData(messages);
  await forkWorkers(data);
  cluster.on('exit', (worker, code) => handleChildExit(worker, code, messages));
  while (messages.length) {
    resetAckDeadline(messages.map(({ ackId }) => ackId));
    // eslint-disable-next-line no-await-in-loop
    await sleep(ACK_DEADLINE_SECONDS - 5);
  }
};
