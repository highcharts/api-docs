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

/*
    Note that there's a lot of sync file writing here.
    The reason is that everything goes haywire with async because we're 
    writing 16k+ files, which causes a lot of open handles at any given time.
 */

module.exports = function (input, outputPath, currentOnly, fn) {
    var versionFuns = [],
        versionProps = {
            commit: input._meta.commit,
            branch: input._meta.branch,
            version: input._meta.version
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
            if (!current) {
                current = {};
            }

            if (!current.children) {
                current.children = {};
            }  

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

    // Extract array type
    function extractArrayType(def) {
        var s = def.indexOf('<'),
            s2 = def.indexOf('>'),
            res
        ;

        if (s >= 0 && s2 >= 0) {
            res = def.substr(s + 1, s2 - s - 1);

            return res;
        }

        return 'object';
    }

    //Do some transformations
    function transform(name, node, parentName, parent) {
        var s, v = false;

        node.meta = node.meta || {};
        node.doclet = node.doclet || {};

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

        if (node.meta.default) {
            node.doclet.defaultvalue = node.meta.default;            
        }

        node.meta.commit = input._meta.commit;
        node.meta.branch = input._meta.branch;
        node.meta.date = input._meta.date;
        node.meta.version = input._meta.version;

        if (!currentOnly && node.doclet && node.doclet.since && node.doclet.since.length > 0) {
            v = node.doclet.since;           
        }

        // Make product impact children unless overridden
        if (parent && parent.doclet && parent.doclet.products && node.doclet && !node.doclet.products) {
            node.doclet.products = parent.doclet.products;
        }

        if (!node.doclet.products) {
            node.doclet.products = [
                'highcharts',
                'highstock',
                'highmaps'
            ];   
        }

        if (node.doclet && node.doclet.products && node.doclet.products.length > 0) {
            if (node.doclet.products.forEach) {
                s = node.doclet.products;
            } else {
                s = node.doclet.products.split(' ');                
            }
            
            s.forEach(function (p) {
                products[p] = products[p] || {
                    current: true
                };
                if (v) {
                    products[p][v] = products[p][v] || true;
                } else {
                    products[p].current = products[p].current || true;
                }
            });
        }

        if (node.doclet && node.doclet.type) {
            node.doclet.types = {};
            
            node.doclet.type.names.forEach(function (t) {
                if (t.toLowerCase().trim().indexOf('array') === 0) {
                    node.doclet.types['array'] = extractArrayType(t).toLowerCase();
                } else {
                    node.doclet.types[t] = 1;                    
                }
            });
        }

        if (node.children && Object.keys(node.children).length > 0) {
            node.meta.hasChildren = true;

            name = parentName ? parentName + '.' + name : name;

            Object.keys(node.children).forEach(function (child) {
                if (child !== '_meta' && child) {
                    transform(child, node.children[child], name, node);                    
                }             
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
                    return c.doclet.products.filter(function (b) {
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
                    fs.writeFileSync(outPath + f, fs.readFileSync(incPath + f));
                }
            });
        }); 
    }

    function dumpNav(node, opath, version) {
        opath += 'nav/';

        if (node.children && node.children.length > 0) {
            fs.writeFileSync(
                opath + (node.meta.fullname || 'index') + '.json',
                JSON.stringify({
                    description: node.doclet.description,
                    children: node.children.map(function (child) {
                        return {
                            name: child.node.meta.name,
                            fullname: child.node.meta.fullname,
                            isLeaf: !child.node.children || child.node.children.length === 0,
                            default: child.node.doclet.defaultvalue,
                            typeMap: child.node.doclet.types,
                            typeList: child.node.doclet.type,
                            description: child.node.doclet.description,
                            extends: child.node.doclet.extends,
                            inheritedFrom: child.node.meta.inheritedFrom,
                            since: child.node.doclet.since,
                            samples: child.node.doclet.samples,
                            see: child.node.doclet.see,
                            filename: child.node.meta.filename,
                            line: child.node.meta.line,
                            version: version
                        };
                    })
                })
            );
        }
    }

    function generateDetails(name, node, opath, product, version, toc, constr) {
        var filename = (name || 'index') + '.html';

        if (node.children) {

            // if (name && name.length > 0) {
            //     name += '.';
            // }

            sortAndArrayify(node);

            node.children.forEach(function (child) {
                generateDetails(
                    child.name, 
                    child.node, 
                    opath, 
                    product, 
                    version,
                    toc,
                    constr
                );
            });

            templates.dump('main', (opath || outputPath) + filename, {
                initial: false,
                node: node,
                date: new Date(),
                version: version === 'current' ? versionProps.version : version,
                product: product[0].toUpperCase() + product.substr(1),
                versionProps: versionProps,
                productVersionStr: product + '-' + version,
                toc: toc,
                constr
            });
            // Dump navigation for the node            
            dumpNav(node, opath, version === 'current' ? versionProps.commit : version);
        } 
    }

    transform('', {children: input});
    merge({children: input});

    // Output each product in a separate folder, 
    // with the sub-folder being version numbers

    templates.load(function () {
        Object.keys(products).forEach(function (product) {            
            mkdir(outputPath + product, function () {
                Object.keys(products[product]).forEach(function (version) {
                    var op = outputPath + product + '/' + version + '/',
                        productToc = {}
                    ;

                    // Generate a TOC with relative paths to this product
                    Object.keys(products).forEach(function (p) {
                        var entry = productToc[p] = {
                                displayName: p[0].toUpperCase() + p.substr(1),
                                versions: {}
                            },
                            v = entry.versions,
                            versionArr = []
                        ;

                        Object.keys(products[p]).forEach(function (prod) {
                            versionArr.push(prod);
                        });

                        versionArr.sort(function (a, b) {
                            return b.localeCompare(a);
                        });
                        
                        versionArr.forEach(function (ver) {
                            var path = '', 
                                vstr = ver
                            ;
 
                            if (p === product && version === ver) {
                                //It's the page we're standing on
                                v[vstr] = '';
                                return;
                            } else if (p === product && version !== ver && version !== 'current') {
                                //On same product, but different version
                                path = '../';
                            } else if (p === product && version !== ver) {
                                //On same product, but in current
                                path = '';
                            } else if (p !== product && version !== 'current') {
                                //Different product, and not in current
                                path = '../../' + p + '/';
                            } else if (p !== product) {
                                //Different product, and in current
                                path = '../' + p + '/';
                            }

                            if (ver === 'current') {
                                v.current = path;                                
                            } else {
                                v[vstr] = path + ver + '/';
                            }

                        });
                    });

                    if (version === 'current') {
                        version = false;
                        op = outputPath + product + '/';                        
                    }

                    console.log('generating docs:', op);

                    mkdir(op, function () {
                        mkdir(op + 'nav/', function () {
                            var filtered = filterByProductAndVersion({
                                        children: input
                                    }, 
                                    product,
                                    version
                                ),
                                constr = (function (product) {
                                    return {
                                        highcharts: 'chart',
                                        highstock: 'stockChart',
                                        highmaps: 'mapChart',
                                        gantt: 'ganttChart',
                                    }[product]
                                })(product)
                            ;

                            fs.writeFileSync(
                                op + 'products.json',
                                JSON.stringify(
                                    {
                                        activeProduct: product,
                                        activeVersion: version === false ? 'current' : version,
                                        library: productToc
                                    }
                                )
                            );

                            generateDetails(
                                'index', 
                                filtered, 
                                op, 
                                product, 
                                version === false ? 'current' : version,
                                productToc,
                                constr
                            );

                            copyIncludes(op);
                        });
                    });                                
                });
            });
        });
    });
};
