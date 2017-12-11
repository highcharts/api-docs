#!/bin/env node

/*
 * Copyright (c) 2017, Highcharts
 * All rights reserved.
 *
 * Original author: Chris Vasseng
 *
 */

// NOTE have a look at commander as an alternative to yargs.
const argv = require('yargs').argv;
const generate = require('./../lib/index.js');
const fs = require('fs');
const express = require('express');
const app = express();

console.log('API Docs Generator'.green);

if (!argv._[0] || !argv._[1]) {
    console.log(
        'Usage:'.bold,
        '<input file>',
        '[output folder]'
    );

    process.exit(1);
}

console.log('Generating into', argv._[1], 'from', argv._[0]);
console.log();

function doGen(a, e) {
    if (typeof e !== 'undefined') {
        console.log('Files refreshed, regenerating'.yellow);
    }
    const pathTreeJSON = argv._[0];
    const pathOutput = argv._[1];
    const currentOnly = !argv.allVersions;
    const cb = () => { console.log('All done!'.green) };
    const input = JSON.parse(fs.readFileSync(pathTreeJSON, 'utf8'));
    let products = { highcharts: true, highstock: true, highmaps: true };
    if (argv.p) {
      products = argv.p.split(',')
        .reduce((obj, p) => { obj[p] = true; return obj; }, {});
    }
    generate(input, pathOutput, currentOnly, products, cb);
}

doGen();

fs.watch(__dirname + '/../include', doGen);
fs.watch(__dirname + '/../templates', doGen);

app.use('/', express.static(__dirname + '/../docs'));

app.listen(9700);
