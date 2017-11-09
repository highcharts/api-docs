
const fs = require('fs');
const args = process.argv;

console.log('dump2tree - convert old-style dumps to new style tree');

const createPlaceholder = () => {
  return {
    doclet: {},
    meta: {},
    children: {}
  };
};

const parseSamples = (sampleStr) => {
  let res = [];
  let s = (sampleStr || '').split('</a>');

  s.forEach((p) => {
    let ind = p.lastIndexOf('>');
    let name = p.substr(ind + 1).trim();

    p =
      p.replace('<a href="https://jsfiddle.net/gh/library/pure/highcharts/highcharts/tree/master/samples/', '')
      .replace(/\"/g, '');

    p = p.substr(0, p.indexOf('>')).trim();

    let allowAdd = true;

    // Trim out dupes
    res.some((o) => {
      if (o.name === name && o.value === p) {
        allowAdd = false;
        return true;
      }
    });

    if (p && name && allowAdd) {
      res.push({
        name: name,
        value: p
      });
    }
  });

  return res.length ? res : undefined;
};

const augment = (target, node) => {
  target.doclet = {
    description: node.description,
    type: node.returnType ? {
      names: [
        node.returnType
      ]
    } : undefined,
    since: node.since,
    defaultvalue: node.defaults,
    deprecated: node.deprecated,
    samples: parseSamples(node.demo),
    values: node.values
  };
};

const treeify = (input) => {

  let output = {
    children: {}
  };

  // Visit an old style node
  const visit = (entry, count) => {

    entry.fullname = entry.fullname.replace(/\</g, '.').replace(/\>/g, '');

    let path = (entry.fullname || '').split('.');
    let current = output;

    path.forEach((p, i) => {
      if (!current.children[p]) {
        current.children[p] = createPlaceholder();
      }

      current = current.children[p];

      if (i === path.length - 1) {
        augment(current, entry);
      }
    });
  };

  (input || []).forEach(visit);

  output.children._meta = {
    commit: '',
    branch: '',
    version: '',
    date: new Date()
  };

  return output.children;
};


if (args.length < 3) {
  console.log('Usage: dump2tree <input dump> [output name]');
} else {

  let input = args[2];
  let output = args[3] || 'generated_tree.json';
  let inputObj;

  console.log('Converting', input, 'to tree (' + output + ')');

  try {
    inputObj = require(input);
  } catch (e) {
    console.log('Invalid input:', e);
  }

  if (inputObj) {
    let outputObj = treeify(inputObj);

    fs.writeFile(output, JSON.stringify(outputObj, false, '  '), (err) => {
      if (err) return console.log(err);
      console.log('All done!');
      console.log('Wrote output to', output);
    });
  }
}

