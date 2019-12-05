# bcgov / eagle-api

API for acting as a central authenticated data service for all EPIC front-ends

## Data Generation Guide

The following guide explains how to populate data into an EPIC mongo database.

### Development

If developers are using a common set of generated data that is the same every time it is created, then this can help by having systems that behave similarly due to the same data sets.  Developers and Testers can talk about the "Powlowski - O'Reilly Mine" and know that they are looking at the same object.

#### Backup before any other steps

Take a snapshot of your existing local database first:

```bash
#!/bin/bash
cd ~;
mkdir dump;
cd dump;
mkdir epic-local-dump;
mongodump -d epic -o ~/dump/epic-local-dump/dump201912011610;
```

#### Populating on top of existing data

If you simply wish to add some data to an existing system, use the following:

```bash
#!/bin/bash
./generate.sh 10 Random Saved;
```

#### Populating fresh with the same data as other systems

To create consistent data on a completely empty database use the following (very destructive) steps:

```bash
#!/bin/bash
mongo;
```

Will completely remove ALL your EPIC data:

```mongo
use epic;
db.epic.remove({});
exit;
```

Repopulate your DB with generated data:

```bash
#!/bin/bash
./generate.sh 100 Static Saved;
```

#### Recovery to pre-generation state

To recover your initial database state from prior to data generation:

```bash
#!/bin/bash
mongorestore -d epic ~/dump/dump201912011610/epic;
```

#### Data generation for unit-testing purposes

Jest unit testing of the API needs to have data in order to verify that the API calls respond as expected when called with certain data.

The unit tests (which currently do not exist yet) will generate a set of data (or subset of the full DB) in order to check that data pitched via the API is what is expected per what was generated in the Mockgoose in memory DB at the start of the test.

In practice when the Mockgoose in-memory database will be used for real unit tests it will be called from within test classes.  It can also be used from the command line as follows:

```bash
#!/bin/bash
./generate.sh 10 Static Unsaved;
```

or

```bash
#!/bin/bash
./generate.sh 10 Random Unsaved;
```
