
var hapi = {};


hapi.ajax = function (p) {
    var props = {
        url: p.url || false,
        type: p.type || 'GET',
        dataType: p.dataType || 'json',
        success: p.success || function () {}, 
        error: p.error || function () {}
      },
      headers = {
        json: 'application/json',
        xml: 'application/xml',
        text: 'text/plain',
        octet: 'application/octet-stream'
      },
      r = new XMLHttpRequest()
    ;

    if (!props.url) return false;

    r.open(props.type, props.url, true);
    r.setRequestHeader('Content-Type', headers[props.dataType] || headers.text);

    r.onreadystatechange = function () {        
        if (r.readyState === 4 && r.status === 200) {         
          if (props.dataType === 'json') {        
            try {
              var json = JSON.parse(r.responseText);
              if (props.success) {
                props.success(json);        
              }              
            } catch(e) {
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


(function () {

    function cr(name, className, inner) {
        var el = document.createElement(name);
        el.className = className || '';
        el.innerHTML = inner || '';
        return el;
    }

    function on(target, event, callback) {
        var s = [];

        if (!target) {
            return function () {};
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
            children.forEach(function (child) {
                if (typeof child !== 'undefined' && typeof child.appendChild !== 'undefined') {
                    target.appendChild(child);                  
                } 
            });
        }
        return target;
    }

    function createNode(parent, def, state) {

        var title = cr('div', 'title', def.name),
            nextLevel = cr('div', 'node'),
            expanded = false,
            hasNext = false
        ;

        ap(parent,
            title,
            nextLevel
        );

        function expand() {
            nextLevel.className = 'node-level collapsed';

        if (!hasNext) {
            getNext();
        }
        
        expanded = true;

    }

        function collapse() {
            nextLevel.className = 'node-level expanded';
            expanded = false;
        }

        function toggle() {
            expanded = !expanded;
            if (expanded) return expand();
            collapse();
        }

        function getNext() {
            hapi.ajax({
                url: 'nav/' + def.fullname + '.json',
                dataType: 'json',
                success: function (def) {
                    def.forEach(function (def) {
                        createNode(nextLevel, def, state);
                    });
                    hasNext = true;
                }
            })
        }
        if (!def.isLeaf){
            on(title, 'click', toggle);
        }

        if (state && state.length && state[0] === def.name) {
            expand();
            state.slice(0, 1);
        }
    }


    hapi.createNavigation = function (target, initial, state) {
        function buildInitial(data) {
            data.forEach(function (def) {
                createNode(target, def, state.split('.'));
            });     
        }

        if (initial) {
            return buildInitial(initial);
        }

        hapi.ajax({
            url: 'nav/undefined.json', //undefined.json
            success: function (initial) {
                buildInitial(initial);      
            }
        });
    };

})();
