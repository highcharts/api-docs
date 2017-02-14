#!/bin/env node

/*        
 * Copyright (c) 2017, Highcharts
 * All rights reserved.
 *
 * Original author: Chris Vasseng
 *
 */

const args = process.argv;
const generate = require('./../lib/index.js');
const fs = require('fs');

console.log('API Docs Generator'.green);

if (args.length < 4) {
    console.log(
        'Usage:'.bold, 
        '<input file>',
        '[output folder]'
    );

    process.exit(1);
}

console.log('Generating into', args[2], 'from', args[3]);

generate(JSON.parse(fs.readFileSync(args[2], 'utf8')), args[3], function () {
    console.log('All done!'.green);
});
