/*
 * Copyright (c) 2017, Highcharts
 * All rights reserved.
 *
 * For licensing terms, please see the bundled LICENSE file.
 *
 * Original author: Chris Vasseng
 *
 */

const async = require('async');
const colors = require('colors');
const fs = require('fs');
const join = require('path').join;
const marked = require('marked'); // markdown parser
const mkdir = require('mkdirp');
const templates = require('./templates');

const manualSearchBoost = {
    'plotOptions.series': 100,
    'plotOptions.column': 95,
    'plotOptions.line': 95,
    'plotOptions.pie': 95,
    'series.column': 95,
    'series.line': 95,
    'series.pie': 95
};
const urlRoot = 'https://api.highcharts.com/'

let products = {};

/*
    Note that there's a lot of sync file writing here.
    The reason is that everything goes haywire with async because we're
    writing 16k+ files, which causes a lot of open handles at any given time.
 */

function isNull (what) {
    return (typeof what === 'undefined' || what === null);
};

function isStr (what) {
    return (typeof what === 'string' || what instanceof String);
};

function isNum(what) {
    return !isNaN(parseFloat(what)) && isFinite(what);
};

function isFn (what) {
    return (what && (typeof what === 'function') || (what instanceof Function));
};

function isArr (what) {
    return (!isNull(what) && what.constructor.toString().indexOf("Array") > -1);
};

function isBool (what) {
    return (what === true || what === false);
};

function isObj (what) {
  return typeof what === 'object' && !isArr(what);
};

function isBasic (what) {
    return !isArr(what) && (isStr(what) || isNum(what) || isBool(what) || isFn(what));
};

function markdown (s) {
    var has = false;
    // Support space after parentheses in markdown link, for example [link](
    // https://example.com).
    s = s.replace(/\]\(\s+/g, '](');
    
    s = marked(s);

    return s;
}

function mergeObj(a, b, ignoreEmpty, excludeMap, noOverwrite) {
    if (!a || !b) return a || Object.assign({}, b);

    if (ignoreEmpty && Object.keys(b).length === 0) {
        return;
    }

    Object.keys(b).forEach(function (bk) {
        if (excludeMap && typeof excludeMap[bk] !== 'undefined') {

        // } else if (noOverwrite && typeof a[bk] !== 'undefined') {

        } else if (isNull(b[bk]) || isBasic(b[bk])) {
            if (noOverwrite && typeof a[bk] !== 'undefined') {
              return;
            }

            a[bk] = b[bk];
        } else if (isArr(b[bk])) {

            if (noOverwrite && typeof a[bk] !== 'undefined') {
              return;
            }

            a[bk] = [];

            b[bk].forEach(function (i) {
             if (isNull(i) || isBasic(i)) {
               a[bk].push(i);
             } else {
               a[bk].push(mergeObj(isArr(i) ? [] : {}, i));
             }
            });
        } else {

            if (ignoreEmpty && Object.keys(b[bk]).length === 0) {
                return;
            }

            a[bk] = a[bk] || {};
            mergeObj(a[bk], b[bk], ignoreEmpty, excludeMap, noOverwrite);
        }
    });
    return a;
}

function getExcludeMap(node) {
  var map = {};

  ((node && node.doclet && node.doclet.tags) || []).forEach(function (tag) {
    if (tag.title === 'excluding' || tag.title === 'exclude') {
        tag.value.split(',').forEach(function (p) {
        map[p.trim()] = true;
      });
    }
  });

  return map;
}

function getSearchBoost(optionPath) {

    if (!optionPath) {
        return 0;
    }

    let manualBoost = manualSearchBoost[optionPath];

    if (manualBoost) {
        return manualBoost;
    }

    let optionPathLength = optionPath.length;
        optionSpaceCount = (optionPath.split('.').length - 1);

    manualBoost = (
        (optionSpaceCount >= 10 ?
            0 : (50 - (optionSpaceCount * 5))) +
        (optionPathLength >= 100 ?
            0 : (50 - Math.round(optionPathLength / 2)))
    );

    Object.keys(manualSearchBoost).some(path => {
        if (optionPath.indexOf(path + '.') === 0 &&
            manualSearchBoost[path] >= 50
        ) {
            manualBoost += 5;
            return true;
        } else {
            return false;
        }
    });

    return manualBoost;

}

function getSearchTitle(node) {
    if (!node.meta.fullname) {
        return 'API Overview';
    }
    if (node.doclet.defaultvalue) {
        return node.meta.fullname + ': ' + node.doclet.defaultvalue;
    } else if (node.children &&
        node.children.length > 0
    ) {
        return node.meta.fullname + ': {...}';
    }
    return node.meta.fullname + ': undefined';
}

function toFlatDump(input) {
  var res = [];

  const visit = (node, nodeName, parentKey) => {
    var key = '';
    var pn = parentKey;
    var fullName = '';
    var myProducts = {};

    if (parentKey === 'series') {
      key = pn = 'series<' + nodeName + '>';
      nodeName = '';
    }

    node.doclet = node.doclet || {};
    node.meta = node.meta || {};

    (node.doclet.products || []).forEach((p) => {
      myProducts[p] = 1;
    });

    if (node.children && Object.keys(node.children).length) {

      if (nodeName && nodeName.length) {
        key = (pn ? pn + '-' : '') + nodeName;
      }

      Object.keys(node.children).forEach((id) => {

        // Check the child products. If it contains something *not* in the parent,
        // trim it away.
        node.children[id].doclet.products = (node.children[id].doclet.products || []).filter((p) => {
          return myProducts[p];
        });

        visit(
          node.children[id],
          id,
          key
        );
      });
    } else if (nodeName && nodeName.length) {
      key = (pn ? pn + '--' : '') + nodeName;
    }

    if (key.length) {
      res.push({
        description: node.doclet.description,
        parent: parentKey,
        title: nodeName,
        extends: node.doclet.extends,
        demo: (node.doclet.samples || []).map((e) => {
          return '<a href="https://jsfiddle.net/gh/library/pure/highcharts/highcharts/tree/master/samples/' + e.value + '">' + e.name + '</a>';
        }).join('\n'),
        since: node.doclet.since,
        isParent: Object.keys(node.children).length > 0,
        context: node.doclet.context,
        defaults: node.doclet.defaultvalue || node.meta.default,
        deprecated: node.doclet.deprecated === true,
        returnType: node.doclet.type ? node.doclet.type.names.join('|') : undefined,
        seeAlso: (node.doclet.see || []).join('\n'),
        products: node.doclet.products,
        values: node.doclet.values,
        name: key,
        fullname: key.replace(/--/g, '.').replace(/-/g, '.')
      });
    }
  };

  Object.keys(input.children).forEach((id) => {
    if (id && id !== '_meta') {
      visit(input.children[id], id);
    }
  });

  return res;
}

function toSearch(product, flatListKeys) {
    return JSON.stringify(flatListKeys.sort().sort(function (a, b) {
        let aBoost = getSearchBoost(a),
            bBoost = getSearchBoost(b);
        return (aBoost > bBoost ? -1 : aBoost < bBoost ? 1 : 0)// DESC boost
//            a < b ? -1 : a > b ? 1 : 0); // ASC keys
    }));
}

function toSitemap(product, flatListKeys) {
    let option,
        options = flatListKeys.sort(),
        sitemap = [];

    for (let i = 0, ie = options.length; i < ie; ++i) {
        option = options[i];
        sitemap.push('<url><loc>');
        sitemap.push(urlRoot + product + '/' + option);
        sitemap.push('</loc><priority>');
        sitemap.push(Math.round(getSearchBoost(option) / 100));
        sitemap.push('</priority></url>');
    }

    return (
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + (
            sitemap.join('')
        ) + '</urlset>'
    );
}

function mergeNode(achildren, bchildren, fullExclude) {

  let valid = {
    meta: {
      default: 1,
      fullname: 1,
      name: 1,
      line: 1,
      lineEnd: 1,
      columnd: 1,
      filename: 1
    },
    doclet: {
      defaultvalue: 1,
      description: 1,
      productdesc: 1,
      samples: 1,
      extends: 1,
      excludes: 1,
      products: 1,
      since: 1,
      type: 1,
      values: 1
    }
  };

  Object.keys(bchildren).forEach((bk) => {

    let bchild = bchildren[bk];
    let achild = achildren[bk];

    // ((achild && achild.doclet && achild.doclet.tags) || []).forEach(function (tag) {
    //   if (tag.title === 'excluding' || tag.title === 'exclude') {
    //       tag.value.split(',').forEach(function (p) {
    //       fullExclude[p.trim()] = true;
    //     });
    //   }
    // });

    if (fullExclude && fullExclude[bk]) {
      return;
    }

    if (!achild) {
      achild = achildren[bk] = {};
    }

    achild.meta = achild.meta || {};
    achild.doclet = achild.doclet || {};

    if (typeof achild.meta.default !== 'undefined' && typeof achild.doclet.defaultvalue === 'undefined') {
      achild.doclet.defaultvalue = achild.meta.default;
    }

    Object.keys(valid.meta).forEach((key) => {
      achild.meta[key] = typeof achild.meta[key] !== 'undefined' ? achild.meta[key] : bchild.meta[key];
    });

    Object.keys(valid.doclet).forEach((key) => {
      achild.doclet[key] = typeof achild.doclet[key] !== 'undefined' ? achild.doclet[key] : bchild.doclet[key];
    });

    if (bchild.children) {
      achild.children = achild.children || {};
      mergeNode(achild.children, bchild.children);
    }
  });
}

/**
 * Promisify functions which has the error-first callback style.
 * In NodeJS v8 this polyfill can be replaced with util.promisify.
 *
 * @param {Function} fn The original function.
 * @returns {Function} Returns a promisified function.
 */
const promisify = (fn) => {
    return function () {
        const ctx = this;
        const args = Array.from(arguments);
        return new Promise((resolve, reject) => {
            args.push((err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
            fn.apply(ctx, args);
        });
    };
};

const lstat = promisify(fs.lstat);
const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const copyFile = (from, to) => {
    return readFile(from)
        .then((data) => writeFile(to, data));
};

const copyDir = (from, to) => {
    return readdir(from)
        .then((files) => {
            const promises = files.map((filename) => {
                const pathFrom = join(from, filename);
                const pathTo = join(to, filename);
                return lstat(pathFrom)
                    .then((stats) => (
                        stats.isDirectory() ?
                        mkdirPromise(pathTo).then(() => copyDir(pathFrom, pathTo)) :
                        copyFile(pathFrom, pathTo)
                    ));
            });

            return Promise.all(promises);
        });
};

module.exports = function (input, outputPath, currentOnly, fn) {
    // work around #8260
    function filterUndefined(node, name) {
        if (node.children) {
            for (var c in node.children) {
                if (c === '' || c === 'undefined'){
                    console.error('filterUndefined found something in ' + name);
                    delete node.children[c];
                    continue;
                }
                filterUndefined(node.children[c], c);
            }
        }
    }
    filterUndefined({children:input});
    var versionFuns = [],
        commonSeries = {},
        stringifiedInput = JSON.stringify(input),
        versionProps = {
            commit: input._meta.commit,
            branch: input._meta.branch,
            version: input._meta.version
        },
        platforms = isObj(input._meta.platforms) ? input_meta.platforms : {
            JS: '/highcharts',
            iOS: '/ios/highcharts',
            Android: '/android/highcharts'
        },
        platform = isStr(input._meta.platform) ? input_meta.platform : 'JS',
        includeProducts = isObj(input._meta.products) ? input._meta.products : {
            highcharts: true,
            highstock: true,
            highmaps: true,
            gantt: true
        },
        productsArray = Object.keys(includeProducts);

    // NOTE this can be replaced with "outputPath.endsWith('/')"
    if (outputPath[outputPath.length - 1] !== '/') {
        outputPath += '/';
    }

    // Start series hack
    Object.keys(input.series.children).forEach(function (child) {
        var node = input.series.children[child];

        if ((node.doclet.extends || []).length === 0 &&
            Object.keys(node.children).length === 0
        ) {
            commonSeries[child] = mergeObj({}, node);
            delete input.series.children[child];
        }
    });

    Object.keys(input.series.children).forEach(function (k) {
        var node = input.series.children[k];

        Object.keys(commonSeries).forEach(function (c) {
            if (c !== 'data') {
                node.children[c] = mergeObj({}, commonSeries[c]);
            }
        });
    });

    // End series hack

    function cloneChildren(target, path, trigger) {

        var exclude = {
           // 'default': true,
          // defaultvalue: true,
          // 'samples': true,
          // products: true
        };

        // var excludeIfExists = {
        //   // default: true,
        //   defaultvalue: true,
        //   samples: true
        // };


        target.doclet = target.doclet || {};

        // let old = {
        //   meta: Object.assign({}, target.meta),
        //   doclet: Object.assign({}, target.doclet)
        // };

        (target.doclet.tags || []).forEach(function (tag) {
            if (tag.title === 'excluding' || tag.title === 'exclude') {
                tag.value.split(',').forEach(function (p) {
                  exclude[p.trim()] = true;
                });
            }
        });

        if (target.doclet.exclude) {
          (target.doclet.exclude || []).forEach(function (name) {
            exclude[name] = true;
          });
        }

        //We need to do a deep merge because we have to rewrite the fullname
        if (!path) {
            return false;
        }

        var current = {
            children: input
        };

        target.doclet.extends = target.doclet.extends.replace(path, '');

        path = path.split('.');

        path.some(function (p) {
            if (current.children[p]) {
                current = current.children[p];
            } else {
                console.info(
                    'Unable to resolve path for merge:'.red,
                    path.join('.'),
                    '->',
                    trigger
                );

                current = false;
                return true;
            }
        });

        if (current) {
            merge(current);

            if (!current.children) {
                current.children = {};
            }

            // mergeObj(target.children, current.children, false, exclude, true);
            mergeNode(target.children, current.children, exclude);

            // target.doclet.defaultvalue = old.doclet.defaultvalue || target.doclet.defaultvalue;

            return true;
        }
        return false;
    }

    function sortAndArrayify(node) {
        var children = [];

        if (node.children) {
            Object.keys(node.children).forEach(function (child) {
                // node.children[child].meta = node.children[child].meta || {};
                // node.children[child].doclet = node.children[child].doclet || {};

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

    function merge(node, trigger, fullname, inheritedExcludes) {
        fullname = fullname || '';

        var exclude = {
            // 'default': true,
            'defaultvalue': true,
            // 'samples': true,
            products: true
        };

        node.doclet = node.doclet || {};
        node.meta = node.meta || {};

        if (node.doclet && node.doclet.exclude) {
            (node.doclet.exclude || []).forEach(function (name) {
                exclude[name] = true;
            });
        }

        // Take care of extensions
        if (node.doclet &&
            node.doclet.extends &&
            node.doclet.extends.length > 0
        ) {
            if (node.doclet.extends.indexOf('series,') === 0) {
                node.doclet.extends = 'plotOptions.' + node.doclet.extends;
            }

            if (trigger === 'series') {
                node.doclet.extends = node.doclet.extends.replace('series,', '');
                node.doclet.extends += 'plotOptions.series';
            }

            // Should always extend plotOptions.series last
            let ext = node.doclet.extends
                .replace('{', '')
                .replace('}', '')
                .replace('<', '.')
                .replace(/\s/g, ',')
                .replace('>', '')
                //.replace('series,', 'plotOptions.series')
                .split(',');

            ext.sort((a, b) => {
                if (a === 'plotOptions.series') return 1;
                return 0;
            });

            ext.forEach(function (parent) {
                //Duplicate children
                if (parent && parent.length > 0) {
                    //console.log('Merging', parent, 'into', fullname);
                    node.children = node.children || {};
                    cloneChildren(node, parent, fullname);
                }
            });
        }

        if (node.children) {
            Object.keys(node.children).forEach(function (c) {
                if (exclude[c]) {
                    node.children[c] = undefined;
                    delete node.children[c];
                    return;
                }
                merge(node.children[c], false, (fullname.length > 0 ? fullname + '.' : '') + c, exclude);
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
            node.doclet.description = markdown(node.doclet.description);
        }
        if (node.doclet && node.doclet.productdesc) {
            node.doclet.productdesc.value = markdown(node.doclet.productdesc.value);
        }

        if (node.doclet && node.doclet.see) {
          if (node.doclet.see.forEach) {
            node.doclet.see = node.doclet.see.map(function (t) {
              return markdown(t);
            });
          }
        }

        // Inherit the since tag from parent
        if (typeof node.doclet.since === 'undefined' && parent && parent.doclet && typeof parent.doclet.since !== 'undefined') {
          node.doclet.since = parent.doclet.since;
        }

        if (!node.meta.name) {
            node.meta.name = name;
        }


        // if (parentName === 'series') {
            // node.meta.fullname = parentName + '<' + name + '>';
        // } else {
            node.meta.fullname = parentName ? parentName + '.' + name : name;
        // }

        if (node.meta.filename) {
            node.meta.filename = node.meta.filename.replace(/\\/g, '/').replace(/\/\//g, '/');
            node.meta.filename = node.meta.filename.substr(node.meta.filename.indexOf('highcharts/'));
            node.meta.filename = node.meta.filename.replace('highcharts/', '');
        }

        // if (typeof node.meta.default !== 'undefined' && typeof node.doclet.defaultvalue === 'undefined') {
        //    node.doclet.defaultvalue = node.meta.default;
        //}

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
            node.doclet.products = productsArray;
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

        // Guess types from default values
        if (node.doclet && !node.doclet.type) {
            let defaultvalueForType = node.doclet.defaultvalue;
            if (typeof node.meta.default !== 'undefined' && typeof node.doclet.defaultvalue === 'undefined') {
                defaultvalueForType = node.meta.default;
            }

            node.doclet.type = { names: [] };
            if (isBool(defaultvalueForType)) {
                node.doclet.type.names.push('Boolean');
            }
            if (isNum(defaultvalueForType)) {
                node.doclet.type.names.push('Number');
            }
            if (isStr(defaultvalueForType)) {
                node.doclet.type.names.push('String');
            }
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

    function filterByProductAndVersion(input, product, version, flatList) {
        var splitVersion = version ? version.split('.') : false;

        flatList = flatList || {};

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

            //if (!isAllowed(ns)) {
                //return;
            // }

            if (ns.children) {
                Object.keys(ns.children).forEach(function (child) {
                    if (isAllowed(ns.children[child])) {
                        flatList[ns.children[child].meta.fullname] = 1;
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
        return copyDir(incPath, outPath);
    }

    /**
     * Return the value if the products object is undefined or includes the
     * product.
     */
    function productFilter(doclet, key, product) {
        var ret = [];

        function filter(valueOb) {
            if (!valueOb || !valueOb.products || valueOb.products.indexOf(product) > -1) {
                return valueOb;
            }
        }

        if (doclet[key] && typeof doclet[key].length === 'number') { // array
            doclet[key].forEach(function (valueOb) {
                var val = filter(valueOb);
                if (val) {
                    ret.push(val);
                }
            });
            if (ret.length === 0) {
                ret = undefined;
            }
        } else {
            ret = filter(doclet[key]);
        }
        return ret;
    }

    function resolveDefaultByProduct(node, product) {
      if (node.doclet) {

        if (Object.keys(node.doclet.defaultByProduct || {}).length > 0) {
          return node.doclet.defaultByProduct[product] || node.doclet.defaultByProduct.highcharts;
        }

        if (node.doclet.defaultvalue) {
          return node.doclet.defaultvalue;
        }

        if (node.doclet.default &&
            node.doclet.default.value
        ) {
            return node.doclet.default.value;
        }
      }

      if (node.meta) {
        return node.meta.default;
      }

    }

    function templateize(name) {
      // Enable this to use e.g. series<type> rather than series.type
      return name;

      name = name || '';

      if (name.indexOf('<') > 0) {
        return name;
      }

      if (
          name.indexOf('series') === 0 &&
          name.indexOf('.') >= 0
        ) {

        name = name.replace(/\./, '<');

        if (name.indexOf('.') > 0) {
          name = name.replace(/\./, '>.');
        } else {
          name += '>';
        }
      }

      return name;
    }

    function dumpNav(node, opath, product, version) {
        opath += 'nav/';

        if ((node.children || []).length === 0) {
            return;
        }

        if (node.meta && node.meta.fullname) {
            node.meta.fullname = templateize(node.meta.fullname);
        }

        fs.writeFileSync(
            opath + (node.meta.fullname || 'index') + '.json',
            JSON.stringify({
                description: node.doclet.description,
                productdesc: productFilter(node.doclet, 'productdesc', product),
                samples: productFilter(node.doclet, 'samples', product),
                children: node.children.map(function (child) {
                    return {
                        name: child.node.meta.name,
                        fullname: child.node.meta.fullname,
                        isLeaf: !child.node.children || child.node.children.length === 0,
                        context: child.node.doclet.context,
                        default: resolveDefaultByProduct(child.node, product),
                        typeMap: child.node.doclet.types,
                        typeList: child.node.doclet.type,
                        description: child.node.doclet.description,
                        productdesc: productFilter(child.node.doclet, 'productdesc', product),
                        extends: child.node.doclet.extends,
                        inheritedFrom: child.node.meta.inheritedFrom,
                        deprecated: child.node.doclet.deprecated,
                        since: child.node.doclet.since,
                        samples: productFilter(child.node.doclet, 'samples', product),
                        see: child.node.doclet.see,
                        filename: (child.node.meta.filename || ''),
                        line: child.node.meta.line,
                        lineEnd: child.node.meta.lineEnd,
                        version: version
                    };
                })
            })
        );
    }

    function generateDetails(name, node, opath, product, version, toc, constr) {
        name = templateize(name);

        // work around #8260:
        if (name.indexOf('undefined') > 0) {
            return;
        }

        if (node.meta && node.meta.fullname) {
            node.meta.fullname = templateize(node.meta.fullname);
        }

        // merge(node, node.meta.fullname);

        if (!node.children) {
            return;
        }

        var filename = (name || 'index') + '.html',
            productTitle = (product[0].toUpperCase() + product.substr(1)),
            opengraph = {
                description: 'Interactive charts for your web pages.',
                determiner: '',
                image: (urlRoot + product + '/mstile-310x310.png'),
                sitename: 'Highcharts',
                title: (productTitle + ' API Options'),
                type: 'website',
                url: (urlRoot + product + '/')
            },
            twitter = {
                card: 'summary',
                creator: '@highcharts',
                site: '@highcharts'
            };

        if (node.meta && node.meta.fullname) {
            opengraph.determiner = 'auto';
            opengraph.title = opengraph.title.replace(
                'Options', 'Option: ' + node.meta.fullname
            );
            opengraph.url += node.meta.fullname;                
        }

        if (node.doclet && node.doclet.description) {
            opengraph.description = node.doclet.description
                .replace(/<([^>]+)>/ig, '')
                .replace(/\r\n|\n|\r/g, ' ')
                .trim();
            if (opengraph.description.length > 140) {
                var pointIndex = opengraph.description.indexOf('.');
                if (pointIndex > 40 && pointIndex < 140) {
                    opengraph.description = opengraph.description
                        .substr(0, pointIndex + 1);
                } else {
                    opengraph.description = opengraph.description
                        .substr(0, 139)
                        .trim();
                    opengraph.description += '…';
                }
            }
        }

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
            date: new Date(),
            includeClassReference: (platform === 'JS'),
            initial: false,
            node: node,
            opengraph: opengraph,
            platforms: platforms,
            platform: platform,
            product: productTitle,
            productVersionStr: product + '-' + version,
            searchBoost: (getSearchBoost(node.meta.fullname) * 100),
            searchTitle: getSearchTitle(node),
            toc: toc,
            twitter: twitter,
            version: version === 'current' ? versionProps.version : version,
            versionProps: versionProps,
            year: (new Date()).getFullYear(),
            constr
        });
        // Dump navigation for the node
        dumpNav(node, opath, product, version === 'current' ? versionProps.commit : version);
    }


    merge({children: input});
    transform('', {children: input});
    let oldDump = toFlatDump({children: input});

    /**
     * mkdirPromise - A Promise based version of mkdir.
     * @param path Path to the directory.
     * @return Returns a Promise which resolves when the directory is created.
     */
    mkdirPromise = promisify(mkdir);

    // Output each product in a separate folder,
    // with the sub-folder being version numbers
    templates.load(function () {
        const sitemapIndex = [];
        const promisesProducts = Object.keys(products).map(function (product) {
            return mkdirPromise(outputPath + product)
            .then(function () {

                // Copy the input (tree.json) to the product folders
                fs.writeFile(outputPath + product + '/tree.json', stringifiedInput, (err) => {

                });

                // Old-style dump
                fs.writeFile(outputPath + product + '/dump.json', JSON.stringify(oldDump, false, '  '), (err) => {

                });
                const promisesVersions = Object.keys(products[product])
                .map(function (version) {
                    var op = outputPath + product + '/' + version + '/',
                        productToc = {}
                    ;

                    // Generate a TOC with relative paths to this product
                    Object.keys(products).forEach(function (p) {
                        var entry = productToc[p] = {
                                displayName: p[0].toUpperCase() + p.substr(1),
                                versions: {},
                                active: product === p
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

                    return mkdirPromise(op)
                    .then(function () {
                        return mkdirPromise(op + 'nav/')
                        .then(function () {
                            var flatList = {},
                                filtered = filterByProductAndVersion({
                                        children: input
                                    },
                                    product,
                                    version,
                                    flatList
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

                            fs.writeFileSync(
                                op + 'search.json',
                                toSearch(product, Object.keys(flatList))
                            );

                            fs.writeFileSync(
                                op + 'sitemap.xml',
                                toSitemap(product, Object.keys(flatList))
                            );

                            sitemapIndex.push(
                                '<sitemap><loc>https://api.highcharts.com/' + (
                                    product + (version ? '/' + version : '')
                                ) + '/sitemap.xml</loc></sitemap>'
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
                        })
                        .then(() => copyIncludes(op));
                    });
                });
                return Promise.all(promisesVersions)
                .then(() => {
                    console.info(('Created ' + product + ' API reference').green);
                });
            });
        });

        return Promise.all(promisesProducts)
        .then(() => new Promise((resolve, reject) => {
            fs.writeFile(
                outputPath + 'sitemap.xml',
                '<?xml version="1.0" encoding="UTF-8"?><sitemapindex' + 
                ' xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
                sitemapIndex.sort().join('') +
                '</sitemapindex>',
                function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            )
        }))
        .then(() => {
            console.info(('Created sitemaps').green);
        })
        // After each product has been outputted, execute the callback.
        .then(() => fn())
        .catch((e) => {
            console.error(e)
        });
    });
};
