const cluster = require('cluster');

const doJobs = async () => {
  if (cluster.isMaster) {
    return require('./master')();
  }
  return require('./worker')();
};

doJobs()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    return process.exit(1);
  });
