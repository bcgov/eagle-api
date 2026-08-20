'use strict';

const items = [
  {
    type: 'applicableRegulations',
    _schemaName: 'List',
    legislation: 2018,
    name: 'Renewable Energy Projects Act (REPA)',
    item: 'https://www.bc-er.ca/data-reports/data-centre/',
    listOrder: 0,
    read: ['public', 'staff', 'sysadmin'],
    write: ['staff', 'sysadmin']
  },
  {
    type: 'applicableRegulations',
    _schemaName: 'List',
    legislation: 2002,
    name: 'Renewable Energy Projects Act (REPA)',
    item: 'https://www.bc-er.ca/data-reports/data-centre/',
    listOrder: 0,
    read: ['public', 'staff', 'sysadmin'],
    write: ['staff', 'sysadmin']
  }
];

module.exports = {
  async up(db, client) {
    const epicCollection = db.collection('epic');
    for (const item of items) {
      const existing = await epicCollection.findOne({
        _schemaName: 'List',
        type: 'applicableRegulations',
        legislation: item.legislation,
        name: item.name
      });
      if (!existing) {
        await epicCollection.insertOne(item);
        console.log(`Inserted applicableRegulation '${item.name}' for legislation ${item.legislation}`);
      }
    }
  },

  async down(db, client) {
    const epicCollection = db.collection('epic');
    await epicCollection.deleteMany({
      _schemaName: 'List',
      type: 'applicableRegulations'
    });
  }
};
