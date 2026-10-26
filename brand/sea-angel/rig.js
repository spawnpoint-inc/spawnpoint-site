/* Shared body coordinates for the hero and every Motion Lab stroke. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SeaAngelRig = factory();
})(typeof window === 'object' ? window : this, function () {
  'use strict';
  function smooth(v) { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); }
  function weight(y) { return smooth((y + 65) / 27) * (1 - smooth((y - 60) / 40)); }
  function normals(nodes, out) {
    for (var n = 0; n < 9; n++) {
      var b = Math.max(0, n - 1), e = Math.min(8, n + 1);
      var dx = nodes[e * 2] - nodes[b * 2], dy = nodes[e * 2 + 1] - nodes[b * 2 + 1], length = Math.hypot(dx, dy) || 1;
      out[n * 2] = dy / length; out[n * 2 + 1] = -dx / length;
    }
  }
  function sample(nodes, ns, y, scale, out) {
    var s = (y + 80) / 32.5, j = Math.max(0, Math.min(7, Math.floor(s))), u = s - j;
    var u2 = u * u, u3 = u2 * u, h0 = 2 * u3 - 3 * u2 + 1, h1 = -2 * u3 + 3 * u2;
    var m0 = (u3 - 2 * u2 + u) * 32.5 * scale, m1 = (u3 - u2) * 32.5 * scale;
    out[0] = h0 * nodes[j * 2] + h1 * nodes[(j + 1) * 2] - m0 * ns[j * 2 + 1] - m1 * ns[(j + 1) * 2 + 1];
    out[1] = h0 * nodes[j * 2 + 1] + h1 * nodes[(j + 1) * 2 + 1] + m0 * ns[j * 2] + m1 * ns[(j + 1) * 2];
    out[2] = ns[j * 2] * (1 - u) + ns[(j + 1) * 2] * u;
    out[3] = ns[j * 2 + 1] * (1 - u) + ns[(j + 1) * 2 + 1] * u;
    return out;
  }
  function prepare(a) {
    if (!a.torsoNormals) a.torsoNormals = new Float32Array(18);
    if (!a.shoulder) a.shoulder = new Float64Array(4);
    normals(a.nodes, a.torsoNormals); normals(a.spine, a.normals);
    sample(a.nodes, a.torsoNormals, 20, a.scale, a.shoulder);
    var length = Math.hypot(a.shoulder[2], a.shoulder[3]) || 1;
    a.shoulder[2] /= length; a.shoulder[3] /= length;
  }
  function frame(a, y, out) {
    var w = weight(y), shoulder = a.shoulder;
    var px = shoulder[0] - shoulder[3] * (y - 20) * a.scale;
    var py = shoulder[1] + shoulder[2] * (y - 20) * a.scale;
    if (w === 1) { out[0] = px; out[1] = py; out[2] = shoulder[2]; out[3] = shoulder[3]; }
    else {
      sample(a.spine, a.normals, y, a.scale, out);
      out[0] += (px - out[0]) * w; out[1] += (py - out[1]) * w;
      out[2] += (shoulder[2] - out[2]) * w; out[3] += (shoulder[3] - out[3]) * w;
    }
    return out;
  }
  var scratch = new Float64Array(4);
  function project(a, y, lateral, longitudinal, out, index) {
    frame(a, y, scratch);
    out[index] = scratch[0] + (scratch[2] * lateral - scratch[3] * longitudinal) * a.scale;
    out[index + 1] = scratch[1] + (scratch[3] * lateral + scratch[2] * longitudinal) * a.scale;
  }
  return { prepare: prepare, frame: frame, project: project, weight: weight };
});
