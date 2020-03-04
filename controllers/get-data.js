const Bigtable = require('@google-cloud/bigtable');
const { Storage } = require('@google-cloud/storage');
const { formatFilterInput, writePayload, formatRange } = require('../utils/tools');

const TMP_BUCKET = 'tmp_ultimator';
const projectId = 'ad4screen-us';
const bigTable = new Bigtable({ projectId });
const gcs = new Storage({ projectId });

exports.getData = ({
  appId,
  start = null,
  end = null,
  name,
  filters = [],
  getters = ['idfa'],
  workIndex,
  params,
}) => new Promise((resolve, reject) => {
  const bucket = gcs.bucket(TMP_BUCKET);
  const table = bigTable.instance('bia-bigtable').table(`application${appId}`);
  const bigTableStream = table.createReadStream(formatRange(start, end));
  const blob = bucket.file(`tmp/${name}.csv`);
  const blobStream = blob.createWriteStream();
  let count = 0;

  blobStream.on('error', (err) => {
    console.error({
      err: err.message,
      msg: 'Problem writing file to Google Storage',
      full: err,
      workIndex,
    });
    blobStream.end();
    reject();
  });
  bigTableStream.on('data', async (row) => {
    const gettersWithValue = {};
    if (!row.data.de || !row.data.pe || !row.data.pe.idfa) return;
    getters.forEach((getter) => {
      const field = getter === 'idfa' ? 'pe' : 'de';
      Object.assign(gettersWithValue, {
        [`${getter}`]: (row.data[field][`${getter}`] && row.data[field][`${getter}`][0].value) ? row.data[field][`${getter}`][0].value : '',
      });
    });
    try {
      if (!filters || !filters.length) {
        await writePayload(gettersWithValue, blobStream);
        count += 1;
      } else {
        const falsyFilterIndex = filters.map((filter, i) => {
          if (filter.type === 'or') {
            return (require(`./filters/${filter.type}`)(filter, row, params[i]));
          }
          return (require(`./filters/${filter.type}`)[`${filter.name}`])(
            formatFilterInput({ filter, row, params: params[i][`${filter.type}`] }),
          );
        }).findIndex((f) => !f);
        if (falsyFilterIndex === -1) {
          await writePayload(gettersWithValue, blobStream);
          count += 1;
        }
      }
    } catch (e) {
      console.error(e);
    }
  })
    .on('error', reject)
    .on('end', () => blobStream.end(() => resolve({ count })));
});
