/* Sea-angel swimming and deformation. Pure math, shared by the browser and QA.
   Original implementation for the approved sea-angel silhouette. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;
  else root.createSeaAngelSchool = factory;
})(typeof window === "object" ? window : this, function createSchool(options) {
  "use strict";
  var cfg = options.settings, W = options.width, H = options.height;
  var zones = options.zones, source = options.shape, TAU = Math.PI * 2;
  var seed = cfg.seed, elapsed = 0, fish = [], paths = [], total = 0;
  var rig = typeof module === "object" && module.exports ? require("./rig.js") : window.SeaAngelRig;
  var encounters = new Map();
  var stats = { steps: 0, corrections: 0, maxCorrection: 0, maxVisibleCorrection: 0, respawns: 0 };
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function smooth(v) { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); }
  function rand() { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; }
  function range(r) { return r[0] + rand() * (r[1] - r[0]); }
  function angle(v) { return Math.atan2(Math.sin(v), Math.cos(v)); }

  ["body", "highlight"].forEach(function (name, tone) {
    source[name].forEach(function (points) {
      paths.push({ start: total, count: points.length, tone: tone + 1 });
      total += points.length;
    });
  });
  var originals = new Float32Array(total * 2);
  var k = 0;
  ["body", "highlight"].forEach(function (name) {
    source[name].forEach(function (p) { p.forEach(function (v) { originals[k++] = v[0]; originals[k++] = v[1]; }); });
  });
  var content = zones.filter(function (z) { return z.kind !== "nav"; });
  var left = Math.min.apply(null, content.map(function (z) { return z.left; }));
  var right = Math.max.apply(null, content.map(function (z) { return z.right; }));
  var navBottom = Math.max.apply(null, zones.filter(function (z) { return z.kind === "nav"; }).map(function (z) { return z.bottom; }).concat([72]));

  function waypoint(a, theta) {
    // A sequence of smooth perimeter waypoints. Each orbit has a different
    // aspect, phase and gentle long-period variation, rather than shared lanes.
    var wobble = Math.sin(theta * 2 + a.phase * 0.13) * 12;
    var x = a.cx + a.rx * Math.cos(theta) + wobble;
    var y = a.cy + a.ry * Math.sin(theta) + Math.sin(theta * 3 + a.phase * 0.09) * 20;
    return { x: a.side < 0 ? x : W - x, y: y };
  }

  function make(i) {
    var side = i % 2 ? 1 : -1;
    var room = side < 0 ? left : W - right;
    var tier = i < 2 ? "large" : i < 6 ? "medium" : "small";
    var span = range(W <= 1200 ? cfg.population.tabletSize : cfg.population.sizes[tier]);
    var scale = span / 269, half = Math.min(3, Math.ceil(options.population / 2));
    var theta = (i < 6 ? -0.7 + Math.floor(i / 2) * TAU / half : 0.35) + (side > 0 ? 0.65 : 0);
    var inner = room - span * 0.69 - 18;
    var outer = -span * 0.65 - 36;
    var upper = navBottom + span * 0.6 + 35;
    var bottom = H + span * 0.30;
    var a = {
      id: i, side: side, span: span, scale: scale, tier: tier,
      phase: rand() * TAU, period: range(cfg.wings.period),
      cruise: range(cfg.swim.cruise), speed: 0, turn: 0, angularVelocity: 0, vx: 0, vy: 0,
      rhythm: range([7, 12]), temperament: range([0.88, 1.12]),
      theta: theta, direction: side < 0 ? -1 : 1,
      cx: (inner + outer) / 2, rx: (inner - outer) / 2,
      cy: (upper + bottom) / 2 + range([-24, 24]), ry: (bottom - upper) / 2,
      x: 0, y: 0, heading: 0, nodes: new Float32Array(18), spine: new Float32Array(18), normals: new Float32Array(18),
      points: new Float32Array(total * 2), previous: new Float32Array(total * 2),
      bounds: { left: 0, top: 0, right: 0, bottom: 0 }, stroke: 0
    };
    var p = waypoint(a, theta), next = waypoint(a, theta + a.direction * 0.02);
    a.x = p.x; a.y = p.y; a.heading = Math.atan2(next.y - p.y, next.x - p.x);
    a.speed = a.cruise; a.vx = Math.cos(a.heading) * a.speed; a.vy = Math.sin(a.heading) * a.speed;
    for (var n = 0; n < 9; n++) {
      var distance = (120 - n * 32.5) * scale;
      a.nodes[n * 2] = a.x + Math.cos(a.heading) * distance;
      a.nodes[n * 2 + 1] = a.y + Math.sin(a.heading) * distance;
    }
    deform(a);
    protect(a, true);
    a.previous.set(a.points);
    return a;
  }

  function buildSpine(a) {
    var strength = cfg.tail.amplitude * a.temperament * clamp(a.speed / a.cruise, 0.8, 1.15);
    for (var n = 0; n < 9; n++) {
      var s = n / 8, before = Math.max(0, n - 1), after = Math.min(8, n + 1);
      var tx = a.nodes[after * 2] - a.nodes[before * 2];
      var ty = a.nodes[after * 2 + 1] - a.nodes[before * 2 + 1];
      var length = Math.hypot(tx, ty) || 1;
      // A traveling wave, not a rigid offset: the tip reaches each phase last.
      var envelope = Math.pow(smooth((s - 0.34) / 0.66), 1.35);
      var wave = strength * envelope * Math.sin(a.phase - s * cfg.tail.waveLag);
      a.spine[n * 2] = a.nodes[n * 2] - ty / length * wave;
      a.spine[n * 2 + 1] = a.nodes[n * 2 + 1] + tx / length * wave;
    }
    // Bound the final curvature as well as the following spine. Reconstruct
    // segment lengths so the lower body cannot stretch or fold over itself.
    var prev = Math.atan2(a.spine[3] - a.spine[1], a.spine[2] - a.spine[0]);
    for (var j = 2; j < 9; j++) {
      var dx = a.spine[j * 2] - a.spine[(j - 1) * 2];
      var dy = a.spine[j * 2 + 1] - a.spine[(j - 1) * 2 + 1];
      var heading = prev + clamp(angle(Math.atan2(dy, dx) - prev), -cfg.turning.jointLimit, cfg.turning.jointLimit);
      var seg = 32.5 * a.scale;
      a.spine[j * 2] = a.spine[(j - 1) * 2] + Math.cos(heading) * seg;
      a.spine[j * 2 + 1] = a.spine[(j - 1) * 2 + 1] + Math.sin(heading) * seg;
      prev = heading;
    }
  }

  function deform(a) {
    buildSpine(a);
    var bounds = a.bounds;
    bounds.left = bounds.top = Infinity; bounds.right = bounds.bottom = -Infinity;
    rig.prepare(a);
    for (var i = 0; i < total; i++) {
      var x = originals[i * 2], y = originals[i * 2 + 1], side = x < 0 ? -1 : 1;
      var reach = clamp((Math.abs(x) - 22) / 114, 0, 1);
      var wing = smooth((y + 38) / 20) * (1 - smooth((y - 48) / 30));
      var phase = a.phase - reach * 1.35 + side * 0.12;
      var fold = cfg.wings.fold * (0.5 + 0.5 * Math.cos(phase + 0.6));
      var lateral = x - side * reach * 114 * fold * wing;
      var wingPower = clamp(a.speed / a.cruise, 0.72, 1.15);
      var longitudinal = wing * reach * reach * cfg.wings.bend * wingPower * Math.sin(phase);
      longitudinal += wing * reach * (y + 16) * 0.18 * Math.cos(phase - 0.5);
      rig.project(a, y, lateral, longitudinal, a.points, i * 2);
      var px = a.points[i * 2], py = a.points[i * 2 + 1];
      if (i < source.body[0].length) {
        bounds.left = Math.min(bounds.left, px); bounds.right = Math.max(bounds.right, px);
        bounds.top = Math.min(bounds.top, py); bounds.bottom = Math.max(bounds.bottom, py);
      }
    }
  }

  function overlaps(a, b, margin) {
    return a.right > b.left - margin && a.left < b.right + margin && a.bottom > b.top - margin && a.top < b.bottom + margin;
  }
  function translate(a, dx, dy) {
    a.x += dx; a.y += dy;
    for (var i = 0; i < 18; i += 2) { a.nodes[i] += dx; a.nodes[i + 1] += dy; a.spine[i] += dx; a.spine[i + 1] += dy; }
    for (var j = 0; j < a.points.length; j += 2) { a.points[j] += dx; a.points[j + 1] += dy; a.previous[j] += dx; a.previous[j + 1] += dy; }
    a.shoulder[0] += dx; a.shoulder[1] += dy;
    a.bounds.left += dx; a.bounds.right += dx; a.bounds.top += dy; a.bounds.bottom += dy;
  }
  function protect(a, initial) {
    var moved = false;
    // Reserve an additional tile around the complete moving bounds. Normal
    // steering starts farther out; this geometric constraint cannot cut a fish.
    for (var pass = 0; pass < 3; pass++) {
      for (var i = 0; i < zones.length; i++) {
        var z = zones[i];
        if (!overlaps(a.bounds, z, cfg.grid.tile)) continue;
        var dx = 0, dy = 0;
        if (z.kind === "nav") dy = z.bottom + cfg.grid.tile - a.bounds.top;
        else {
          var outward = a.side < 0 ? z.left - cfg.grid.tile - a.bounds.right : z.right + cfg.grid.tile - a.bounds.left;
          var below = z.bottom + cfg.grid.tile - a.bounds.top;
          // Bottom passes can use the free area below the terminal.
          if (a.bounds.top > z.bottom - 45 && below < Math.abs(outward)) dy = below;
          else dx = outward;
        }
        if (!initial && a.bounds.right > 0 && a.bounds.left < W && a.bounds.bottom > 0 && a.bounds.top < H) {
          stats.maxVisibleCorrection = Math.max(stats.maxVisibleCorrection, Math.hypot(dx, dy));
        }
        translate(a, dx, dy); moved = true;
        if (!initial) { stats.corrections++; stats.maxCorrection = Math.max(stats.maxCorrection, Math.hypot(dx, dy)); }
      }
    }
    // Rebuild from the translated Float32 spine so cached replay inputs and
    // the live pose agree exactly, including on a clearance correction step.
    if (moved) deform(a);
  }

  function envelope(a) {
    // A stroke-independent hull: the complete torso stroke plus all spine
    // nodes with room for the traveling wave and curvature reconstruction.
    var nx = a.shoulder[2], ny = a.shoulder[3];
    var ex = (Math.abs(nx) * 145 + Math.abs(ny) * 110) * a.scale;
    var ey = (Math.abs(ny) * 145 + Math.abs(nx) * 110) * a.scale;
    var b = { left: a.shoulder[0] - ex, right: a.shoulder[0] + ex,
      top: a.shoulder[1] - ey, bottom: a.shoulder[1] + ey };
    var pad = Math.max(36 * a.scale, cfg.tail.amplitude * 2.4);
    for (var n = 0; n < 9; n++) {
      b.left = Math.min(b.left, a.nodes[n * 2] - pad); b.right = Math.max(b.right, a.nodes[n * 2] + pad);
      b.top = Math.min(b.top, a.nodes[n * 2 + 1] - pad); b.bottom = Math.max(b.bottom, a.nodes[n * 2 + 1] + pad);
    }
    return b;
  }
  function intentions() {
    var snapshots = fish.map(function (a) { return { id:a.id, x:a.x, y:a.y, vx:a.vx, vy:a.vy,
      heading:a.heading, span:a.span, side:a.side, envelope:envelope(a), sx:0, sy:0, yield:0 }; }).sort(function(a,b){return a.id-b.id;});
    // Every pair reads the same start-of-step positions, never partially moved
    // neighbours. Passing preferences persist until the encounter is over.
    for (var i=0;i<snapshots.length;i++) for (var j=i+1;j<snapshots.length;j++) {
      var a=snapshots[i], b=snapshots[j], dx=a.x-b.x, dy=a.y-b.y, dvx=a.vx-b.vx, dvy=a.vy-b.vy;
      var spacing=(a.span+b.span)*cfg.separation.spacing, distance=Math.hypot(dx,dy);
      var closest=clamp(-(dx*dvx+dy*dvy)/(dvx*dvx+dvy*dvy||1),0,cfg.separation.lookAhead);
      var predicted=Math.hypot(dx+dvx*closest,dy+dvy*closest), key=a.id+":"+b.id, pair=encounters.get(key);
      if(pair && distance>spacing*cfg.separation.release && predicted>spacing*cfg.separation.release){encounters.delete(key);pair=null;}
      if(!pair && Math.min(distance,predicted)<spacing*cfg.separation.enter){
        var crossA=Math.cos(a.heading)*dy-Math.sin(a.heading)*dx;
        var crossB=Math.cos(b.heading)*(-dy)-Math.sin(b.heading)*(-dx);
        pair={low:Math.abs(crossA)>1?Math.sign(crossA):1,high:Math.abs(crossB)>1?Math.sign(crossB):-1};encounters.set(key,pair);
      }
      if(!pair)continue;
      var strength=smooth((cfg.separation.release-Math.min(distance,predicted)/spacing)/0.7);
      a.sx += -Math.sin(a.heading)*pair.low*strength*0.08; a.sy += Math.cos(a.heading)*pair.low*strength*0.08;
      b.sx += -Math.sin(b.heading)*pair.high*strength*2.5; b.sy += Math.cos(b.heading)*pair.high*strength*2.5;
      var away=strength*3.0;
      b.sx-=dx/(distance||1)*away; b.sy-=dy/(distance||1)*away;
      b.yield=Math.max(b.yield,strength);

    }
    var targets=new Map();
    snapshots.forEach(function(s){
      var a=fish.find(function(f){return f.id===s.id;});
      var goal=waypoint(a,a.theta+a.direction*0.24), dx=goal.x-a.x,dy=goal.y-a.y,len=Math.hypot(dx,dy)||1;
      var vx=dx/len,vy=dy/len,look=cfg.turning.lookAhead*a.speed;
      var future={left:s.envelope.left+Math.cos(a.heading)*look,right:s.envelope.right+Math.cos(a.heading)*look,
        top:s.envelope.top+Math.sin(a.heading)*look,bottom:s.envelope.bottom+Math.sin(a.heading)*look};
      zones.forEach(function(z){
        if(!overlaps(future,z,z.kind==='nav'?100:36))return;
        if(z.kind==='nav'){var navPressure=smooth((z.bottom+100-future.top)/140);vy+=Math.max(0,-vy)*navPressure+0.25*navPressure;}
        else {
          var depth=a.side<0?future.right-z.left:z.right-future.left;
          var pressure=smooth(Math.min(depth+36,z.bottom+36-future.top)/90);
          var below=smooth((s.envelope.top-z.bottom+100)/140);
          vx+=a.side*2.5*pressure*(1-below);vy+=1.5*pressure*below;
        }
      });
      var cycle=(elapsed/a.rhythm+a.id*0.27)%1,burst=Math.pow(Math.max(0,Math.cos(cycle*TAU)),10),glide=Math.pow(Math.max(0,Math.cos((cycle-0.23)*TAU)),6);
      var cruise=a.cruise+(cfg.swim.burst-a.cruise)*burst-8*glide;
      targets.set(a.id,{heading:Math.atan2(vy+s.sy,vx+s.sx),speed:Math.max(16,cruise*(1-s.yield*0.6))});
    });
    return targets;
  }
  function advance(a, dt, target) {
    a.previous.set(a.points);
    a.speed += (target.speed-a.speed)*Math.min(1,dt*1.4);
    a.phase += dt*TAU/a.period*clamp(a.speed/a.cruise,0.75,1.25);
    var arc=Math.hypot(a.rx*Math.sin(a.theta),a.ry*Math.cos(a.theta));
    a.theta+=a.direction*dt*a.speed/Math.max(arc,60);
    var wanted=clamp(angle(target.heading-a.heading)/cfg.turning.response,-cfg.turning.rate,cfg.turning.rate);
    a.angularVelocity+=clamp(wanted-a.angularVelocity,-cfg.turning.acceleration*dt,cfg.turning.acceleration*dt);
    a.heading+=a.angularVelocity*dt; a.turn=a.angularVelocity;
    a.vx=Math.cos(a.heading)*a.speed;a.vy=Math.sin(a.heading)*a.speed;
    a.x+=a.vx*dt;a.y+=a.vy*dt;
    a.nodes[0] = a.x + Math.cos(a.heading) * 120 * a.scale;
    a.nodes[1] = a.y + Math.sin(a.heading) * 120 * a.scale;
    var preceding = a.heading + Math.PI, segment = 32.5 * a.scale;
    for (var n = 1; n < 9; n++) {
      var nx = a.nodes[n * 2] - a.nodes[(n - 1) * 2];
      var ny = a.nodes[n * 2 + 1] - a.nodes[(n - 1) * 2 + 1];
      var turn = clamp(angle(Math.atan2(ny, nx) - preceding), -cfg.turning.jointLimit, cfg.turning.jointLimit);
      var direction = preceding + turn;
      a.nodes[n * 2] = a.nodes[(n - 1) * 2] + Math.cos(direction) * segment;
      a.nodes[n * 2 + 1] = a.nodes[(n - 1) * 2 + 1] + Math.sin(direction) * segment;
      preceding = direction;
    }
    deform(a);
    protect(a, false);
  }

  for (var i = 0; i < options.population; i++) fish.push(make(i));
  return {
    fish: fish, paths: paths, stats: stats,
    // Recompute a pose without advancing steering or time (also used by QA).
    pose: deform,
    strokeEnvelope: envelope,
    step: function (dt) { elapsed += dt; var targets=intentions(); fish.forEach(function (a) { advance(a, dt, targets.get(a.id)); }); stats.steps++; },
    boundsIntersect: overlaps,
    get time() { return elapsed; }
  };
});
