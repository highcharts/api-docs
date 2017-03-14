var hapi = {};


hapi.ajax = function(p) {
    var props = {
            url: p.url || false,
            type: p.type || 'GET',
            dataType: p.dataType || 'json',
            success: p.success || function() {},
            error: p.error || function() {}
        },
        headers = {
            json: 'application/json',
            xml: 'application/xml',
            text: 'text/plain',
            octet: 'application/octet-stream'
        },
        r = new XMLHttpRequest();

    if (!props.url) return false;

    r.open(props.type, props.url, true);
    r.setRequestHeader('Content-Type', headers[props.dataType] || headers.text);

    r.onreadystatechange = function() {
        if (r.readyState === 4 && r.status === 200) {
            if (props.dataType === 'json') {
                try {
                    var json = JSON.parse(r.responseText);
                    if (props.success) {
                        props.success(json);
                    }
                } catch (e) {
                    if (props.error) {
                        props.error(e.toString(), r.responseText);
                    }
                }
            } else {
                if (props.success) {
                    props.success(r.responseText);
                }
            }
        } else if (r.readyState === 4) {
            if (props.error) {
                props.error(r.status, r.statusText);
            }
        }
    };

    r.send(true);
};


(function() {

    function cr(name, className, inner) {
        var el = document.createElement(name);
        el.className = className || '';
        el.innerHTML = inner || '';
        return el;
    }

    function on(target, event, callback) {
        var s = [];

        if (!target) {
            return function() {};
        }

        if (target.addEventListener) {
            target.addEventListener(event, callback, false);
        } else {
            target.attachEvent('on' + event, callback, false);
        }
    }

    function ap(target) {
        var children = (Array.prototype.slice.call(arguments));
        children.splice(0, 1);

        if (target && typeof target.appendChild !== 'undefined') {
            children.forEach(function(child) {
                if (typeof child !== 'undefined' && typeof child.appendChild !== 'undefined') {
                    target.appendChild(child);
                }
            });
        }
        return target;
    }

    function updateHistory(path) {
        if (location.href !== path + '.html') {
            history.pushState(null, path, path + '.html');
        }
    }

    function createNode(parent, def, state) {
        var node = cr('div', 'node collapsed ' + (def.isLeaf ? 'leaf' : 'parent')),
            arrow,
            title = cr('a', 'title', def.name + ':'),
            postfix,
            startBracket,
            dots,
            children,
            endBracket1,
            endBracket2,
            expanded = false,
            hasNext = false;

        title.href = def.fullname + '.html'

        if (!def.isLeaf) {
            arrow = cr('i', 'fa fa-caret-right');
            children = cr('div', 'children');
            dots = cr('span', 'dots', '...');

            if (def.typeMap && def.typeMap.array) {
                startBracket = cr('span', 'bracket start', '[{');
                endBracket1 = cr('span', 'bracket end first', '}]');
                endBracket2 = cr('span', 'bracket end second', '}]');
            } else {
                startBracket = cr('span', 'bracket start', '{');
                endBracket1 = cr('span', 'bracket end first', '}');
                endBracket2 = cr('span', 'bracket end second', '}');
            }
        } else {
            postfix = cr(
                'span',
                'default type-' + (def.typeList && def.typeList.names ?
                    def.typeList.names[0].toLowerCase() :
                    'undefined'),
                def.default || 'undefined');
        }

        ap(parent,
            ap(node,
                ap(title,
                    arrow
                ),
                postfix,
                startBracket,
                dots,
                endBracket1,
                children,
                endBracket2
            )
        );

        function expand() {
            if (!hasNext) {
                getNext();
            }
            updateHistory(def.fullname);
            node.className = node.className.replace('collapsed', 'expanded');
            expanded = true;
        }

        function collapse() {
            node.className = node.className.replace('expanded', 'collapsed');
            expanded = false;
        }

        function toggle(e) {
            e.preventDefault();
            expanded = !expanded;
            if (expanded) return expand();
            collapse();
        }

        function getNext() {
            hapi.ajax({
                url: 'nav/' + def.fullname + '.json',
                dataType: 'json',
                success: function(def) {
                    def.forEach(function(def) {
                        createNode(children, def, state);
                    });
                    hasNext = true;
                }
            })
        }
        if (!def.isLeaf) {
            on(title, 'click', toggle);
        } else {
            on(title, 'click', function (e) {
                e.preventDefault();
                updateHistory(def.fullname);
            });
        }

        if (state && state.length && state[0] === def.name) {
            expand();
            state.shift();
        }
    }
    
    function createOption(target, def, state) {
        var option = cr('div', 'option'),
            title = cr('h2', 'title'),
            titleLink,
            titleText = cr('span', null, def.fullname),
            types,
            typeStr,
            defaultvalue,
            description = cr('p', 'description', def.description),
            extend,
            inheritedFrom,
            since,
            samples = cr('div', 'samples'),
            see = cr('div', 'see'),
            definedIn,
            definedInLink;
        
        if (!def.isLeaf) {
            titleLink = cr('a');
            titleLink.href = def.fullname + '.html';
            titleText = ap(titleLink, titleText);
        } else {
            if (def.typeList) {
                types = cr('span', 'type-list', ': ');
                def.typeList.names.forEach(function (type, index) {
                    typeStr = index ? ', ' + type : type;
                    ap(types, cr('span', 'type type-' + type.toLowerCase(), typeStr));
                });
            }
            def.default = def.default.trim();
            if (def.default && def.default.length && def.default !== 'undefined') {
                defaultvalue = cr(
                    'span',
                    'default type-' + (def.typeList && def.typeList.names ?
                        def.typeList.names[0].toLowerCase() :
                        'undefined'),
                    'Defaults to ' + def.default);
            }
        }
        
        if (def.extends) {
            extend = cr('p', 'extends', 'Extends: ' + def.extends);
        }
        
        if (def.inheritedFrom) {
            inheritedFrom = cr('p', 'inherited-from', 'Inherited from ' + def.inheritedFrom);
        }
        
        if (def.since) {
            since = cr('p', 'since', 'Since ' + def.since);
        }
        
        if (def.filename) {
            definedIn = cr('i', 'defined-in', 'Defined in ');
            definedInLink = cr('a', null, def.filename + ':' + def.line);
        }
        

        ap(target,
            ap(option,
                ap(title,
                    titleText,
                    types
                ),
                description,
                defaultvalue,
                extend,
                inheritedFrom,
                since,
                samples,
                see,
                ap(definedIn,
                    definedInLink
                )
            )
        );
    }


    hapi.createNavigation = function(target, initial, state) {
        function build(data) {
            data.forEach(function(def) {
                createNode(target, def, state.split('.'));
            });
        }

        if (initial) {
            return build(initial);
        }

        hapi.ajax({
            url: 'nav/undefined.json', //undefined.json
            success: function(data) {
                build(data);
            }
        });
    };
    
    hapi.createBody = function (target, initial, state) {
        function build(data) {
            data.forEach(function(def) {
                createOption(target, def, state);
            });
        }

        if (initial) {
            return build(initial);
        }

        hapi.ajax({
            url: 'nav/' + state + '.json', //undefined.json
            success: function(data) {
                build(data);
            }
        });
    }

})();
