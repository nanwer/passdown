// Passdown nginx helpers (njs). Loaded by nginx.conf with js_import.

// Identical to the Caddyfile's request>uri filter; scripts/check-proxy.mjs
// requires the two to stay equal. By route, not by what a token looks like:
// a protected route keeps only its prefix, a URI with a percent-escape is cut
// at the first %, any other query string is replaced, and non-canonical or
// absolute targets are removed entirely.
var URI_FILTER =
  /^(?:[^/]|\/\/).*$|^.*(?:\/\.{1,2}\/|\/\/).*$|^(\/(?:invite|reset|api\/invitations|api\/password-resets|api\/admin|api\/setup)(?:\/|$|\?)).*$|^([^%?]*)%.*$|(\?).*$/i;

function redactedUri(r) {
  return r.variables.request_uri.replace(URI_FILTER, function (_, a, b, c) {
    return (a || '') + (b || '') + (c || '') + '[redacted]';
  });
}

// Limits apply per IPv4 address and per IPv6 /64, so cycling through the
// addresses of one IPv6 network does not multiply a client's allowance.
function expand(address) {
  var halves = address.split('::');
  var left = halves[0] ? halves[0].split(':') : [];
  var right = halves.length > 1 && halves[1] ? halves[1].split(':') : [];
  var fill = [];
  for (var i = left.length + right.length; i < 8; i++) fill.push('0');
  return halves.length > 1 ? left.concat(fill, right) : left;
}
function clientKey(r) {
  var address = r.variables.remote_addr;
  if (address.indexOf(':') < 0) return address;
  // IPv4-mapped IPv6 addresses are IPv4 clients.
  var mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return mapped[1];
  return (
    expand(address.toLowerCase())
      .slice(0, 4)
      .map(function (group) {
        return group.replace(/^0+(?=.)/, '');
      })
      .join(':') + '::/64'
  );
}

export default { redactedUri, clientKey, URI_FILTER };
