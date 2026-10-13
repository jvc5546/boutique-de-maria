// CloudFront Function (viewer request), runtime cloudfront-js-2.0.
// 1. Redirects www.<domain> to the apex with a 301.
// 2. Maps clean URLs to Astro's files: /catalogo and /catalogo/ -> /catalogo/index.html

function queryString(q) {
  var parts = [];
  for (var key in q) {
    var v = q[key];
    if (v.multiValue) {
      for (var i = 0; i < v.multiValue.length; i++) {
        parts.push(key + '=' + v.multiValue[i].value);
      }
    } else {
      parts.push(v.value === '' ? key : key + '=' + v.value);
    }
  }
  return parts.length ? '?' + parts.join('&') : '';
}

function handler(event) {
  var request = event.request;
  var host = request.headers.host ? request.headers.host.value : '';

  if (host.indexOf('www.') === 0) {
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        location: { value: 'https://' + host.substring(4) + request.uri + queryString(request.querystring) },
        'cache-control': { value: 'max-age=3600' },
      },
    };
  }

  var uri = request.uri;
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  } else if (uri.lastIndexOf('.') < uri.lastIndexOf('/') + 1) {
    // No file extension in the last path segment: treat it as a folder.
    request.uri = uri + '/index.html';
  }
  return request;
}
