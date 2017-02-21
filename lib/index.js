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
const async = require('async');
const fs = require('fs');

var products = {};

module.exports = function (input, outputPath) {
    var versionFuns = [],
        versionProps = {
            commit: input._meta.commit,
            branch: input._meta.branch
        };

    if (outputPath[outputPath.length - 1] !== '/') {
        outputPath += '/';
    }

    function cloneChildren(target, path) {
        //We need to do a deep merge because we have to rewrite the fullname
        if (!path) {
            return false;
        }

        var current = {children: input};

        path = path.split('.');
        
        path.forEach(function (p) {            
            current = current.children[p];
        });

        current = current ? current.children || {} : false;

        Object.keys(current).forEach(function (c) {
            //Check exclude list here..

            target.children[c] = {
                meta: {
                    fullname: current[c].meta.fullname || '',
                    name: current[c].meta.name,
                    line: current[c].meta.line,
                    column: current[c].meta.column,
                    filename: current[c].meta.filename,
                    inheritedFrom: path.join('.')
                },
                children: current[c].children || {},
                doclet: current[c].doclet || {}
            };
        });

        return true;
    }

    function sortAndArrayify(node) {
        var children = [];

        if (node.children) {
            Object.keys(node.children).forEach(function (child) {
                children.push({
                    shortName: child,
                    name: node.children[child].meta.fullname,
                    node: node.children[child],
                    version: versionProps
                });               
            });
        }

        children.sort(function (a, b) {
            return a.shortName.toLowerCase().localeCompare(b.shortName.toLowerCase());
        })

        node.children = children;
    }

    function merge(node) {
        //Take care of extensions
        if (node.doclet && node.doclet.extends) {
            node.doclet.extends.split(' ').forEach(function (parent) {
                //Duplicate children
                node.children = node.children || {};
                cloneChildren(node, parent);
            });
        }

        if (node.children) {
            Object.keys(node.children).forEach(function (c) {
                merge(node.children[c]);
            });
        }
    }

    //Do some transformations
    function transform(name, node, parentName, parent) {
        var s, v = false;

        node.meta = node.meta || {};

        if (node.doclet && node.doclet.description) {
            node.doclet.description = marked(node.doclet.description);
        }

        if (!node.meta.name) {            
            node.meta.name = name;
        }

        if (!node.meta.fullname) {
            node.meta.fullname = parentName ? parentName + '.' + name : name;
        }

        if (node.meta.filename) {
            node.meta.filename = node.meta.filename.substr(node.meta.filename.indexOf('highcharts/'));
            node.meta.filename = node.meta.filename.replace('highcharts/', '');
        }

        node.meta.commit = input._meta.commit;
        node.meta.branch = input._meta.branch;
        node.meta.date = input._meta.date;
        node.meta.version = input._meta.version;

        if (node.doclet && node.doclet.since && node.doclet.since.length > 0) {
            v = node.doclet.since;           
        }

        // Make product impact children unless overridden
        if (parent && parent.doclet && parent.doclet.products && node.doclet && !node.doclet.products) {
            node.doclet.products = parent.doclet.products;
        }

        if (node.doclet && node.doclet.products && node.doclet.products.length > 0) {
            s = node.doclet.products.split(' ');
            
            s.forEach(function (p) {
                products[p] = products[p] || {
                    current: true
                };
                if (v) {
                    products[p][v] = products[p][v] || {};
                } else {
                    products[p].current = products[p].current || {};
                }
            });
        }

        if (node.children && Object.keys(node.children).length > 0) {
            node.meta.hasChildren = true;

            name = parentName ? parentName + '.' + name : name;

            Object.keys(node.children).forEach(function (child) {
                transform(child, node.children[child], name, node);
            });            
        }
    }

    function filterByProductAndVersion(input, product, version) {
        var splitVersion = version ? version.split('.') : false;

        function validVersion(node) {
            var split, v;

            if (v === version) {
                return true;
            }
            
            if (node.doclet && node.doclet.since && version !== false) {
                v = node.doclet.since;
                split = v.split('.');
            } else {
                return true;
            }

            if (split.length === splitVersion.length && split.length === 3) {
                if (parseInt(split[0]) <= parseInt(splitVersion[0])) {
                    if (parseInt(split[1]) <= parseInt(splitVersion[1])) {
                        if (parseInt(split[2]) <= parseInt(splitVersion[2])) {
                            return true;
                        }
                    }                    
                }
            }

            return false;
        }

        function isAllowed(c) {            
            if (validVersion(c)) {
                if (c.doclet && c.doclet.products) {
                    return c.doclet.products.split(' ').filter(function (b) {
                        return b === product;
                    }).length > 0;
                }
                return false;                 
            }
            return false;
        }

        // Filter based on product + version
        function filterChildren(ns) {
            var res = {
                doclet: ns.doclet || {},
                meta: ns.meta || {},
                children: {}
            };

            if (!isAllowed(ns)) {
                //return;
            }

            if (ns.children) {
                Object.keys(ns.children).forEach(function (child) {
                    if (isAllowed(ns.children[child])) {                                            
                        res.children[child] = filterChildren(
                            ns.children[child]                                        
                        );                                   
                    }                        
                });
            }

            return res;
        }        

        return filterChildren(input);
    }

    function copyIncludes(outPath) {
        var incPath = __dirname + '/../include/';

        fs.readdir(incPath, function (err, files) {
            if (err) return false;

            files.forEach(function (f) {
                if (f[0] !== '.') { // Ignore .DS_Store etc.
                    fs.writeFile(outPath + f, fs.readFileSync(incPath + f));
                }
            });
        }); 
    }

    function generateDetails(name, node, opath) {
        var filename = (name || 'index') + '.html';

        if (node.children) {


            if (name && name.length > 0) {
                name += '.';
            }

            sortAndArrayify(node);

            node.children.forEach(function (child) {
                generateDetails(child.name, child.node, opath);
            });

            templates.dump('details_pane', (opath || outputPath) + filename, {
                node: node,
                date: new Date(),
                globalMeta: input._meta
            });
        } 
    }

    transform('', {children: input});
    merge({children: input});

    // Output each product in a separate folder, with the sub-folder being version numbers
    templates.load(function () {
        Object.keys(products).forEach(function (product) {
            mkdir(outputPath + product, function () {
                Object.keys(products[product]).forEach(function (version) {
                    var op = outputPath + product + '/' + version + '/';

                    if (version === 'current') {
                        version = false;
                        op = outputPath + product + '/';
                    }

                    console.log('outputting', op);

                    mkdir(op, function () {
                        var filtered = filterByProductAndVersion({
                                children: input
                            }, 
                            product,
                            version
                        );

                        Object.keys(filtered.children).forEach(function (key) {                
                            if (key !== 'meta' && key !== '_meta') {
                               // sortAndArrayify(filtered.children[key]);
                                generateDetails(key, filtered.children[key], op);
                            }
                        });

                        copyIncludes(op);
                    });                                
                });
            });
        });
    });


    // try {
    //     input = JSON.parse(input);
    // } catch (e) {        
    //     return false;
    // }


    // mkdir(outputPath, function () {
    //     templates.load(function () {
    //         var incPath = __dirname + '/../include/';

    //         Object.keys(input).forEach(function (key) {                
    //             if (key !== 'meta' && key !== '_meta') {
    //                 generateDetails(key, input[key]);
    //             }
    //         });

    //         templates.dump('main', outputPath + 'index.html', {
    //             meta: input._meta
    //         });

    //         // generateDetails('', {
    //         //     children: input
    //         // });

    //         fs.readdir(incPath, function (err, files) {
    //             if (err) return false;

    //             files.forEach(function (f) {
    //                 if (f[0] !== '.') {
    //                     fs.writeFile(outputPath + f, fs.readFileSync(incPath + f));
    //                 }
    //             });
    //         });

    //         fs.writeFile(outputPath + 'dump.json', JSON.stringify(input), function (err) {

    //         });
    //     });
    // });
};
