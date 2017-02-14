/*        
 * Copyright (c) 2017, Highcharts
 * All rights reserved.
 *
 * Original author: Chris Vasseng
 *
 */

require('colors');

const templates = require('./templates');
const mkdir = require('mkdirp');
const marked = require('marked');
const fs = require('fs');

module.exports = function (input, outputPath) {    
    if (outputPath[outputPath.length - 1] !== '/') {
        outputPath += '/';
    }

    //Do some transformations
    function transform(name, node, parentName) {
        node.meta = node.meta || {};
       // node.meta.hasChildren = false;

        if (node.doclet && node.doclet.description) {
            node.doclet.description = marked(node.doclet.description);
        }

        if (!node.meta.name) {            
            node.meta.name = name;
        }

        if (!node.meta.fullname) {
            node.meta.fullname = parentName ? parentName + '.' + name : name;
        }

        if (node.children && Object.keys(node.children).length > 0) {
            node.meta.hasChildren = true;

            name = parentName ? parentName + '.' + name : name;

            Object.keys(node.children).forEach(function (child) {
                transform(child, node.children[child], name);
            });            
        }
    }

    transform('', {children: input});

    // try {
    //     input = JSON.parse(input);
    // } catch (e) {        
    //     return false;
    // }

    function generateDetails(name, node) {
        var filename = (name || 'index') + '.html';

        if (node.children) {

            templates.dump('details_pane', outputPath + filename, {
                node: node,
                date: new Date()
            });

            if (name && name.length > 0) {
                name += '.';
            }

            Object.keys(node.children).forEach(function (child) {
                generateDetails(name + child, node.children[child]);
            });

        } else {
            console.log('no children', name, node.meta);
        }
    }

    mkdir(outputPath, function () {
        templates.load(function () {
            var incPath = __dirname + '/../include/';

            Object.keys(input).forEach(function (key) {                
                if (key !== 'meta') {
                    generateDetails(key, input[key]);
                }
            });

            // generateDetails('', {
            //     children: input
            // });

            fs.readdir(incPath, function (err, files) {
                if (err) return false;

                files.forEach(function (f) {
                    if (f[0] !== '.') {
                        fs.writeFile(outputPath + f, fs.readFileSync(incPath));
                    }
                });
            });
        });
    });
};
