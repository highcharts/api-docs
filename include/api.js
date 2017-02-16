
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


})();