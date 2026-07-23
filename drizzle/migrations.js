// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_short_umar.sql';
import m0001 from './0001_lovely_blazing_skull.sql';
import m0002 from './0002_reflective_mantis.sql';
import m0003 from './0003_bent_gamora.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003
    }
  }
  