'use strict';

const items = [
  {
    type: 'author',
    _schemaName: 'List',
    legislation: 2018,
    name: 'BC-CEA',
    read: ['public', 'staff', 'sysadmin'],
    write: ['staff', 'sysadmin']
  }
];

module.exports = {
  async up(db, client) {
    const epicCollection = db.collection('epic');
    // Check if BC-CEA already exists to avoid duplicates
    const existing = await epicCollection.findOne({
      _schemaName: 'List',
      type: 'author',
      legislation: 2018,
      name: 'BC-CEA'
    });
    if (!existing) {
      await epicCollection.insertMany(items);
      console.log('Successfully inserted BC-CEA as an Author for 2018 legislation.');
    } else {
      console.log('BC-CEA Author already exists.');
    }
  },

  async down(db, client) {
    const epicCollection = db.collection('epic');
    await epicCollection.deleteMany({
      _schemaName: 'List',
      type: 'author',
      legislation: 2018,
      name: 'BC-CEA'
    });
    console.log('Successfully removed BC-CEA as an Author.');
  }
};
