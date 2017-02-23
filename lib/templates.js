/******************************************************************************

Copyright (c) 2017, Highsoft

All rights reserved.

******************************************************************************/

const handlebars = require('handlebars');
const fs = require('fs');
const async = require('async');

var templates = {};

handlebars.registerHelper('notempty', function (conditional, options) {
    if (options && options.root && Object.keys(options.root.node).length > 0) {
        return options.fn(this);
    }
    return options.inverse(this);
});

handlebars.registerHelper('selected', function(foo, bar) {
  return foo === bar ? ' selected ' : '';
});

function pushFile(path, file) {
    var pname = file.replace('.handlebars', '');

    return function (next) {
        fs.readFile(path + file, 'utf8', function (err, data) {
            if (!err) {
                templates[pname] = handlebars.compile(data);

                handlebars.registerPartial(pname, data);
            }

            next(err);
        });
    };
}

module.exports = {

    load: function (fn) {
        var p = __dirname + '/../templates/',
            funs = []
        ;

        fs.readdir(p, function (err, files) {
            if (err) return console.log('Error reading path:', err);

            files.forEach(function (file) {
                if (file.indexOf('.handlebars') > 0) {
                    funs.push(pushFile(p, file));
                }
            });

            // Load templates
            async.waterfall(funs, fn);
        });
    },

    dump: function (name, output, data) {
        var res = module.exports.compile(name, data);
        if (res) {
            fs.writeFileSync(output, res, 'utf8');
        }
    },

    compile: function (name, data) {
        if (templates[name]) {
            return templates[name](data);
        }
        console.log('[error]'.red, 'tried compiling non-existant template', name);
        return false;
    }
};