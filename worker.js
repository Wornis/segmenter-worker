const { getData } = require('./controllers/get-data');

module.exports = async () => getData(JSON.parse(process.env.data))
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(new Error(e));
    process.exit(1);
  });
