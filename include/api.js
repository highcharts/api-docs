var hapi = {};


hapi.ajax = function(p) {
    var props = {
            url: p.url || false,
            type: p.type || 'GET',
            dataType: p.dataType || 'json',
            success: p.success || function() {},
            error: p.error || function(error) {
                console.error(error);
            }
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
                    props.success(JSON.parse(r.responseText));
                } catch (e) {
                    props.error(e.stack, r.responseText);
                }
            } else {
                props.success(r.responseText);
            }
        } else if (r.readyState === 4) {
            props.error(r.responseURL + ' ' + r.statusText, r.responseText);
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

    function addClass(target, cls) {
        if (target.className.indexOf(cls) < 0) {
            target.className += ' ' + cls;
        }
    }

    function removeClass(target, cls) {
        if (target.className) {
            target.className = target.className.replace(' ' + cls, '');
        }
    }

    function defined(variable, stringCheck) {
        var defined = variable !== undefined && variable !== null;
        if (defined && stringCheck) {
            defined = variable !== 'undefined' && variable !== 'null';
        }
        return defined;
    }

    function mdLinkToObject(mdLink) {
        function extractPart(mdLink, lb, rb) {
            return mdLink.substr(
                mdLink.indexOf(lb), mdLink.indexOf(rb)
            );
        }
        function removeBrackets(mdLink, lb, rb) {
            return mdLink.replace(lb, '').replace(rb, '');
        }
        return {
            text: removeBrackets(extractPart(mdLink, '[', ']'), '[', ']'),
            href: removeBrackets(extractPart(mdLink, '(', ')'), '(', ')'),
        }
    }

    function scrollTo(container, target, duration) {
        var targetY = target.getBoundingClientRect().top,
        startingY = window.pageYOffset,
        diff = targetY - startingY - container.getBoundingClientRect().top,
        start;
        function step(timestamp) {
            if (!start) {
                start = timestamp;
            }
            var time = timestamp - start,
            percent = Math.min(time / duration, 1);
            
            window.scrollTo(0, startingY + diff * percent);
            
            if (time < duration) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }

    function updateTitle(member, product) {
        return document.title = member + ' | ' + product + ' API Reference';
    }

    function historyEnabled() {
        return defined(window.history) && defined(window.history.pushState);
    }

    function updateHistory(def, product) {
        var title,
            currentURL = location.pathname,
            newURL = '/' + product.toLowerCase() + '/' + def.fullname + '.html';
        if (currentURL !== newURL) {
            title = updateTitle(def.fullname, product);
            if (historyEnabled()) {
                history.pushState({
                    product: product,
                    member: def.fullname,
                    hasChildren: !def.isLeaf
                }, title, def.fullname + '.html');
            }
        }
    }
    
    function buildBody(current, isParent, callback) {
        hapi.createBody('#body', current, isParent, callback);
    }

    function highlight(targetClass, containerClass, resetClass) {
        var container = document.querySelector(containerClass),
            target = container.querySelector(targetClass),
            resets = resetClass && document.querySelectorAll(resetClass);
        if (resets) {
            resets.forEach(function(otherNode) {
                removeClass(otherNode, 'highlighted');
            });
        }
        if (target) {
            addClass(target, 'highlighted');
            scrollTo(container, target, 300);
        }
    }
    
    function toClassName (optionFullName) {
        return 'option-' + optionFullName.replace(/\./g, '-')
    }

    function createNode(parent, def, state, origState, product) {
        var isCurrent = def.fullname === origState,
            optionClass = toClassName(def.fullname),
            node = cr('div', 'node collapsed ' + optionClass),
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

        node.className += def.isLeaf ? ' leaf' : ' parent';

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
                'default type-' + (
                    defined(def.default, true) &&
                    def.typeList && def.typeList.names ?
                    def.typeList.names[0].toLowerCase() :
                    'undefined'
                ),
                def.default || 'undefined');
        }

        ap(parent,
            ap(node,
                ap(
                    title,
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

        function getNext(callback) {
            hapi.ajax({
                url: 'nav/' + def.fullname + '.json',
                dataType: 'json',
                success: function(data) {
                    data.children.forEach(function(def) {
                        createNode(children, def, state, origState, product);
                    });
                    hasNext = true;
                    
                    if (callback) {
                        callback();
                    }
                }
            })
        }

        function expand() {

            function getChildrenEmHeight(children) {
                var height = (children.childNodes.length * 1.5) + 0.5;

                children.childNodes.forEach(function (childNode) {
                    var childrenOfChild = childNode.querySelector('.children');
                    if (childrenOfChild) {
                        height += getChildrenEmHeight(childrenOfChild);
                    }
                });

                return height;
            }
            function slideDown() {
                node.className = node.className.replace(
                    'collapsed',
                    'expanded'
                );
                children.style.maxHeight = getChildrenEmHeight(children) + 'em';
                setTimeout(
                    function() {
                        children.style.maxHeight = 'none';
                    },
                    1000 * parseFloat(
                        getComputedStyle(children)['transitionDuration']
                    )
                );
            }

            if (!def.isLeaf) {
                if (!hasNext) {
                    getNext(slideDown);
                } else {
                    slideDown();
                }
            }
            updateTitle(def.fullname, product);

            expanded = true;
        }

        function collapse() {
            node.className = node.className.replace(
                'expanded',
                'collapsed'
            );

            children.style.maxHeight = children.clientHeight + 'px';

            expanded = false;
            setTimeout(
                function() {
                    
                },
                1000 * parseFloat(
                    getComputedStyle(children)['transitionDuration']
                )
            );
            children.style.maxHeight = 0;
        }

        function toggle(e) {
            expanded = !expanded;
            if (expanded) return expand();
            collapse();
        }

        function loadNode() {
            highlight('.node.' + optionClass, '.sidebar', '.node');
            updateTitle(def.fullname, product);
            if (!def.isLeaf) {
                highlight('.option.' + optionClass, 'body', '.option');
            } else {
                buildBody(def.fullname, !def.isLeaf, function () {
                    highlight('.option.' + optionClass, 'body', '.option');
                });
            }
        }

        on(title, 'click', function (e) {
            e.preventDefault();
            loadNode();
            toggle();
            updateHistory(def, product);
        });

        if (state && state.length && state[0] === def.name) {
            expand();
            state.shift();
        }
        if (isCurrent) {
            loadNode();
        }
    }

    function createOption(target, def, state, origState) {
        var option = cr('div', 'option ' + toClassName(def.fullname)),
            title = cr('h2', 'title'),
            titleLink,
            titleText = cr('span', null, def.name),
            types,
            typeStr,
            defaultvalue,
            description = cr('p', 'description', def.description),
            extend,
            inheritedFrom,
            since,
            samples,
            sampleList,
            see,
            seeList,
            definedIn,
            definedInLink;

        if (!def.isLeaf) {
            titleLink = cr('a');
            titleLink.href = def.fullname + '.html';
            titleText = ap(titleLink, titleText);
        } else {
            if (def.typeList) {
                types = cr('span', 'type-list', ': ');
                def.typeList.names.forEach(function(type, index) {
                    typeStr = index ? ', ' + type : type;
                    ap(types, cr('span', 'type type-' + type.toLowerCase(), typeStr));
                });
            }

            if (defined(def.default, true) && def.default.length) {
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

        if (def.samples) {
            samples = cr('div', 'samples');
            sampleList = cr('ul');
            ap(samples,
                cr('h4', null, 'Try it'),
                sampleList
            );
            Object.keys(def.samples).forEach(function (key) {
                var a = cr('a', null, key);
                a.href = def.samples[key];
                ap(sampleList,
                    ap(cr('li', 'sample'),
                        a
                    )
                );
            });
        }

        if (def.see) {
            see = cr('div', 'see');
            seeList = cr('ul');
            ap(see,
                cr('h4', null, 'See'),
                seeList
            );
            def.see.forEach(function (seeItem) {
                seeItem = mdLinkToObject(seeItem);
                var a = cr('a', null, seeItem.text);
                a.href = seeItem.href.replace('#', '') + '.html';
                ap(seeList,
                    ap(cr('li', 'see-item'),
                        a
                    )
                );
            });
        }

        if (def.filename) {
            definedIn = cr('i', 'defined-in', 'Defined in ');
            definedInLink = cr('a', null, def.filename + ':' + def.line);
            definedInLink.href = 'https://github.com/highcharts/highcharts/blob/' +
                def.version + '/' + // TODO: version (see dumpNav() version param in index.js)
                def.filename + '#L' +
                def.line;
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

    hapi.createNavigation = function(options, globals, state, product) {
        globals = document.querySelector(globals);
        options = document.querySelector(options);

        function build(data) {
            globals.innerHTML = '';
            options.innerHTML = '';
            data.children.forEach(function(def) {
                if (['global', 'lang'].indexOf(def.fullname) >= 0) {
                    createNode(globals, def, state.split('.'), state, product);
                } else {
                    createNode(options, def, state.split('.'), state, product);
                }
            });
        }

        hapi.ajax({
            url: 'nav/index.json',
            success: function(data) {
                build(data);
            }
        });
    };

    hapi.createBody = function(target, state, hasChildren, callback) {
        target = document.querySelector(target);
        if (state.length > 0) {
            var origState = state;
            if (!hasChildren) {
                if (state.indexOf('.') >= 0) {
                    state = state.substr(0, state.lastIndexOf('.'));
                } else {
                    state = 'index';
                }
            }

            function build(data) {
                var optionList = document.getElementById('option-list'),
                    option = cr('div', 'option option-header'),
                    title = cr('h1', 'title'),
                    description = cr('p', 'description', data.description);

                state.split('.').forEach(function(titlePart, i) {
                    ap(title,
                        cr('span', null, (i > 0 ? '.' : '') + titlePart)
                    );
                });

                optionList.innerHTML = '';
                addClass(target, 'loaded');

                ap(target,
                    ap(optionList,
                        ap(option,
                            title,
                            description
                        )
                    )
                );
                data.children.forEach(function(def) {
                    createOption(optionList, def, state, origState);
                });
                if (typeof callback === 'function') {
                    callback();
                }
            }

            hapi.ajax({
                url: 'nav/' + state + '.json', //undefined.json
                success: build
            });
        } else {
            removeClass(target, 'loaded');
        }
    };

    hapi.initializeDropdowns = function(dropdownQ, linkQ) {
        var dropdowns = document.querySelectorAll(dropdownQ);
        dropdowns.forEach(function(dropdown) {
            var link = dropdown.querySelector(linkQ),
                expanded = false;

            dropdown.setAttribute('expanded', expanded);

            on(link, 'click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                expanded = !expanded;
                dropdown.setAttribute('expanded', expanded);
            });

            on(document, 'click', function(e) {
                expanded = false;
                dropdown.setAttribute('expanded', expanded);
            });
        });
    };

    hapi.initializeSidebar = function(sidebarQ, linkQ) {
        var sidebar = document.querySelector(sidebarQ),
            link = document.querySelector(linkQ),
            expanded = false;

        sidebar.setAttribute('expanded', expanded);

        on(link, 'click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            expanded = !expanded;
            sidebar.setAttribute('expanded', expanded);
        });

        on(sidebar, 'click', function(e) {
            e.stopPropagation();
        });

        on(window, 'click', function() {
            expanded = false;
            sidebar.setAttribute('expanded', expanded);
        });
    };

    hapi.initializeSearchBar = function(searchBarQ, resultsQ, indexUrl, minLength, maxElements) {
        var searchBar = document.querySelector(searchBarQ),
            results = document.querySelector(resultsQ),
            minLength = minLength || 2,
            maxElements = maxElements || 15,
            members = [],
            query = '';

        function markMatch(string, query) {
            re = new RegExp(query, 'g');
            return string.replace(re, '<span class="sub-match">$&</span>');
        }

        function createMatch(member, query) {
            var a = cr('a', null, markMatch(member, query));

            a.href = member + '.html';

            return ap(cr('li', 'match'),
                a
            );
        }

        function checkResult(member) {
            if (member.indexOf(query) >= 0 && results.childElementCount <= maxElements) {
                ap(results,
                    createMatch(member, query)
                );
            }
        }

        function search() {
            results.innerHTML = '';
            query = searchBar.value;
            if (query.length >= minLength) {
                members.forEach(checkResult);
            }
        }

        hapi.ajax({
            url: indexUrl,
            success: function(data) {
                members = data;
                on(searchBar, 'input', search);
            }
        });
    };

    /**
     * Adds simulation of history navigation by detecting changes to the history
     * state.
     *
     * @return [undefined] - nothing
     */
    hapi.simulateHistory = function() {

        if (historyEnabled()) {
            /**
             * Updates the history with memberClick().
             *
             * If it is stored in the history state, the page will be used to
             * update. If not, the global PAGE variable will be used.
             *
             * @param e - the event that triggered the history update
             */
            window.onpopstate = function(e) {
                var state = e.state;
                if (state !== undefined && state !== null) {
                    hapi.createNavigation('#options', '#global-options', state.member, state.product);
                }
            }
        }
    };

})();
