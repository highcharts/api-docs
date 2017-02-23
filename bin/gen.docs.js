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
const express = require('express');
const app = express();

console.log('API Docs Generator'.green);

if (args.length < 4) {
    console.log(
        'Usage:'.bold, 
        '<input file>',
        '[output folder]'
    );

    process.exit(1);
}

console.log('Generating into', args[3], 'from', args[2]);
console.log();

function doGen(a, e) {
    if (typeof e !== 'undefinefd') {
        console.log('Files refreshed, regenerating'.yellow);
    }

    generate(JSON.parse(fs.readFileSync(args[2], 'utf8')), args[3], function () {
        console.log('All done!'.green);
    });    
}

doGen();

fs.watch(__dirname + '/../include', doGen);
fs.watch(__dirname + '/../templates', doGen);

app.use('/', express.static(__dirname + '/../docs'));

app.listen(9700);