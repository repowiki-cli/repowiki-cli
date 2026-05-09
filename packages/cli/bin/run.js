#!/usr/bin/env node
const oclif = require('@oclif/core');
oclif.run(process.argv.slice(2)).then(oclif.flush).catch(oclif.handle);
