(function () {
const host = document.getElementById("fig-turnstile");
if (!host || host.dataset.drawn) return;
host.dataset.drawn = "1";
const AZIMUTH = 45;
const ELEVATION = 30;
const SHADES = 4;
const RADIANS = Math.PI / 180;
const UNIT = Math.sqrt(1.6);
function cameraOf({ scale, azimuth = AZIMUTH, elevation = ELEVATION }) {
    const a = azimuth * RADIANS;
    const e = elevation * RADIANS;
    return { sinA: Math.sin(a), cosA: Math.cos(a), sinE: Math.sin(e), cosE: Math.cos(e), k: scale * UNIT };
}
function iso([x, y, z], projection) {
    const { origin } = projection;
    const { sinA, cosA, sinE, cosE, k } = cameraOf(projection);
    return [origin[0] + (x * sinA - y * cosA) * k, origin[1] + ((x * cosA + y * sinA) * sinE - z * cosE) * k];
}
function towardViewer(projection) {
    const { sinA, cosA } = cameraOf(projection);
    return [cosA, sinA];
}
function depthOf([x, y, z], projection) {
    const { sinA, cosA, sinE, cosE } = cameraOf(projection);
    return (x * cosA + y * sinA) * cosE + z * sinE;
}
const tenth = (value) => {
    const text = (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, "");
    return text === "-0" ? "0" : text;
};
function pathOf(points, closed = false) {
    if (!points.length)
        return "";
    return points.map(([x, y], at) => `${at ? "L" : "M"}${tenth(x)} ${tenth(y)}`).join("") + (closed ? "Z" : "");
}
const joinPaths = (paths) => paths.filter(Boolean).join("");
function roundedPlan({ x, y, w, d, r }, steps = 8) {
    const radius = Math.max(0, Math.min(r, w / 2, d / 2));
    const corners = [
        [x + w - radius, y + radius, -90],
        [x + w - radius, y + d - radius, 0],
        [x + radius, y + d - radius, 90],
        [x + radius, y + radius, 180],
    ];
    const out = [];
    for (const [cx, cy, start] of corners) {
        const count = radius > 0 ? steps : 0;
        for (let step = 0; step <= count; step++) {
            const angle = (start + (count ? (90 * step) / count : 45)) * RADIANS;
            out.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
        }
    }
    return out;
}
function signedArea(points) {
    let area = 0;
    for (let index = 0; index < points.length; index++) {
        const [ax, ay] = points[index];
        const [bx, by] = points[(index + 1) % points.length];
        area += ax * by - bx * ay;
    }
    return area / 2;
}
const oriented = (points) => (signedArea(points) < 0 ? [...points].reverse() : points);
function convexHull(points) {
    const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (sorted.length < 3)
        return sorted;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const point of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0)
            lower.pop();
        lower.push(point);
    }
    const upper = [];
    for (let index = sorted.length - 1; index >= 0; index--) {
        const point = sorted[index];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0)
            upper.pop();
        upper.push(point);
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
function runsOf(flags, want) {
    const count = flags.length;
    const runs = [];
    const start = flags.findIndex((flag, index) => flag !== flags[(index + count - 1) % count]);
    if (start < 0)
        return flags[0] === want ? [Array.from({ length: count + 1 }, (_, index) => index % count)] : [];
    let run = null;
    for (let step = 0; step < count; step++) {
        const index = (start + step) % count;
        if (flags[index] === want) {
            if (!run)
                run = [index];
            run.push((index + 1) % count);
        }
        else if (run) {
            runs.push(run);
            run = null;
        }
    }
    if (run)
        runs.push(run);
    return runs;
}
function extrude(ring, z, height, projection, options = {}) {
    const convex = options.convex ?? true;
    const count = ring.length;
    const counter = signedArea(ring) > 0;
    const [vx, vy] = towardViewer(projection);
    const { sinA, cosA } = cameraOf(projection);
    const normals = ring.map(([ax, ay], index) => {
        const [bx, by] = ring[(index + 1) % count];
        const dx = bx - ax;
        const dy = by - ay;
        const length = Math.hypot(dx, dy) || 1;
        return (counter ? [dy / length, -dx / length] : [-dy / length, dx / length]);
    });
    const facing = normals.map(([nx, ny]) => nx * vx + ny * vy > 1e-9);
    const top = ring.map(([x, y]) => iso([x, y, z + height], projection));
    const bottom = ring.map(([x, y]) => iso([x, y, z], projection));
    const outline = [];
    const crease = [];
    for (const run of runsOf(facing, false))
        outline.push(pathOf(run.map((index) => top[index])));
    for (const run of runsOf(facing, true)) {
        crease.push(pathOf(run.map((index) => top[index])));
        if (height > 0)
            outline.push(pathOf(run.map((index) => bottom[index])));
    }
    if (height > 0) {
        for (let index = 0; index < count; index++) {
            if (facing[(index + count - 1) % count] !== facing[index])
                outline.push(pathOf([top[index], bottom[index]]));
        }
    }
    let fill;
    if (convex) {
        fill = pathOf(convexHull([...top, ...bottom]), true);
    }
    else {
        const parts = [pathOf(oriented(top), true), pathOf(oriented(bottom), true)];
        for (let index = 0; index < count; index++) {
            if (!facing[index])
                continue;
            const next = (index + 1) % count;
            parts.push(pathOf(oriented([top[index], top[next], bottom[next], bottom[index]]), true));
        }
        fill = parts.join("");
    }
    const buckets = Array.from({ length: SHADES }, () => []);
    if (height > 0) {
        const [lx, ly] = [-sinA, cosA];
        for (let index = 0; index < count; index++) {
            if (!facing[index])
                continue;
            const [nx, ny] = normals[index];
            const lit = (nx * lx + ny * ly + 1) / 2;
            const shade = Math.min(SHADES - 1, Math.max(0, Math.floor(lit * SHADES)));
            const next = (index + 1) % count;
            buckets[shade].push(pathOf(oriented([top[index], top[next], bottom[next], bottom[index]]), true));
        }
    }
    let bevel;
    if (options.bevel && options.bevel > 0) {
        const by = options.bevel;
        const inset = ring.map(([x, y], index) => {
            const [ax, ay] = normals[(index + count - 1) % count];
            const [bx, by2] = normals[index];
            const mx = ax + bx;
            const my = ay + by2;
            const length = Math.hypot(mx, my) || 1;
            return [x - (mx / length) * by, y - (my / length) * by];
        });
        const insetTop = inset.map(([x, y]) => iso([x, y, z + height], projection));
        bevel = runsOf(facing, true)
            .map((run) => pathOf([top[run[0]], ...run.slice(1, -1).map((index) => insetTop[index]), top[run[run.length - 1]]]))
            .join("");
    }
    return {
        fill,
        outline: outline.join(""),
        crease: crease.join(""),
        top: pathOf(oriented(top), true),
        shades: buckets.map((paths) => paths.join("")),
        bevel,
    };
}
const ringOf = (plan, steps = 8) => roundedPlan(plan, steps);
function slabOf(plan, z, height, projection, steps = 8, bevel = 0) {
    return extrude(ringOf(plan, steps), z, height, projection, { convex: true, bevel });
}
function circleRing(cx, cy, radius, steps = 40) {
    return Array.from({ length: steps }, (_, step) => {
        const angle = (step / steps) * Math.PI * 2;
        return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
    });
}
function cylinder(cx, cy, radius, z, height, projection, steps = 32, bevel = 0) {
    return extrude(circleRing(cx, cy, radius, steps), z, height, projection, { convex: true, bevel });
}
const insetPlan = ({ x, y, w, d, r }, by) => ({ x: x + by, y: y + by, w: w - by * 2, d: d - by * 2, r: Math.max(0, r - by) });
function onTop(points, z, projection, closed = false) {
    return pathOf(points.map(([x, y]) => iso([x, y, z], projection)), closed);
}
const planOutline = (plan, z, projection, steps = 8) => onTop(ringOf(plan, steps), z, projection, true);
const lineOnTop = (from, to, z, projection) => onTop([from, to], z, projection);
const segment = (from, to, projection) => pathOf([iso(from, projection), iso(to, projection)]);
const rise = (at, from, to, projection) => segment([at[0], at[1], from], [at[0], at[1], to], projection);
const ring = (cx, cy, radius, z, projection, steps = 40) => onTop(circleRing(cx, cy, radius, steps), z, projection, true);
const pointsAt = (points, projection) => points.map((point) => iso(point, projection));
function dotGrid(x, y, columns, rows, gap, z, projection) {
    const dots = [];
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++)
            dots.push(iso([x + column * gap, y + row * gap, z], projection));
    }
    return dots;
}
function corners({ x, y, w, d }, inset = 0) {
    return [
        [x + inset, y + inset],
        [x + w - inset, y + inset],
        [x + inset, y + d - inset],
        [x + w - inset, y + d - inset],
    ];
}
function boxCorners({ x, y, w, d }, z0, z1) {
    const out = [];
    for (const px of [x, x + w])
        for (const py of [y, y + d])
            for (const z of [z0, z1])
                out.push([px, py, z]);
    return out;
}
function knurl(cx, cy, radius, z0, z1, count, projection, inset = 0.4) {
    const [vx, vy] = towardViewer(projection);
    const lines = [];
    for (let index = 0; index < count; index++) {
        const angle = (index / count) * Math.PI * 2;
        const nx = Math.cos(angle);
        const ny = Math.sin(angle);
        if (nx * vx + ny * vy < 0.15)
            continue;
        lines.push(segment([cx + radius * nx, cy + radius * ny, z0 + inset], [cx + radius * nx, cy + radius * ny, z1 - inset], projection));
    }
    return lines.join("");
}
function sideArc(cx, cy, radius, z, projection, steps = 24) {
    const [vx, vy] = towardViewer(projection);
    const facing = Math.atan2(vy, vx);
    const points = [];
    for (let step = 0; step <= steps; step++) {
        const angle = facing - Math.PI / 2 + (step / steps) * Math.PI;
        points.push(iso([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), z], projection));
    }
    return pathOf(points);
}
function ringSeam(ring, z, projection) {
    const count = ring.length;
    const counter = signedArea(ring) > 0;
    const [vx, vy] = towardViewer(projection);
    const facing = ring.map(([ax, ay], index) => {
        const [bx, by] = ring[(index + 1) % count];
        const dx = bx - ax;
        const dy = by - ay;
        const [nx, ny] = counter ? [dy, -dx] : [-dy, dx];
        return nx * vx + ny * vy > 1e-9;
    });
    return runsOf(facing, true).map((run) => pathOf(run.map((index) => iso([ring[index][0], ring[index][1], z], projection)))).join("");
}
const sideSeam = (plan, z, projection, steps = 8) => ringSeam(ringOf(plan, steps), z, projection);
function sideRing(center, radius, axis, projection, steps = 20) {
    const [px, py, pz] = center;
    const points = [];
    for (let step = 0; step < steps; step++) {
        const angle = (step / steps) * Math.PI * 2;
        const u = radius * Math.cos(angle);
        const v = radius * Math.sin(angle);
        points.push(iso(axis === "x" ? [px, py + u, pz + v] : [px + u, py, pz + v], projection));
    }
    return pathOf(points, true);
}
function coil(from, to, center, radius, turns, axis, projection, perTurn = 16) {
    const count = Math.max(1, Math.round(turns * perTurn));
    const back = [];
    const front = [];
    let run = [];
    let near = null;
    for (let index = 0; index <= count; index++) {
        const share = index / count;
        const angle = share * turns * Math.PI * 2;
        const u = radius * Math.cos(angle);
        const v = radius * Math.sin(angle);
        const along = from + (to - from) * share;
        const point = axis === "x" ? [along, center[0] + u, center[1] + v] : [center[0] + u, along, center[1] + v];
        const normal = axis === "x" ? [0, Math.cos(angle), Math.sin(angle)] : [Math.cos(angle), 0, Math.sin(angle)];
        const facing = depthOf(normal, projection) > 0;
        const flat = iso(point, projection);
        if (near === null)
            near = facing;
        if (facing !== near) {
            run.push(flat);
            (near ? front : back).push(pathOf(run));
            run = [flat];
            near = facing;
            continue;
        }
        run.push(flat);
    }
    if (run.length > 1)
        (near ? front : back).push(pathOf(run));
    return { back: back.join(""), front: front.join("") };
}
function topTicks(from, to, step, every, edge, z, lengths, projection, axis = "x") {
    const minor = [];
    const major = [];
    const first = Math.ceil(from / step) * step;
    for (let at = first, index = Math.round(first / step); at <= to + 1e-9; at += step, index++) {
        const big = index % every === 0;
        const length = big ? lengths[1] : lengths[0];
        const a = axis === "x" ? [at, edge] : [edge, at];
        const b = axis === "x" ? [at, edge + length] : [edge + length, at];
        (big ? major : minor).push(lineOnTop(a, b, z, projection));
    }
    return { minor: minor.join(""), major: major.join("") };
}
function sideTicks(from, to, step, every, face, top, lengths, projection, axis = "x") {
    const minor = [];
    const major = [];
    const first = Math.ceil(from / step) * step;
    for (let at = first, index = Math.round(first / step); at <= to + 1e-9; at += step, index++) {
        const big = index % every === 0;
        const length = big ? lengths[1] : lengths[0];
        const a = axis === "x" ? [at, face, top] : [face, at, top];
        const b = axis === "x" ? [at, face, top - length] : [face, at, top - length];
        (big ? major : minor).push(segment(a, b, projection));
    }
    return { minor: minor.join(""), major: major.join("") };
}
function radialTicks(cx, cy, radius, count, every, z, lengths, projection, from = 0, span = Math.PI * 2) {
    const minor = [];
    const major = [];
    const closed = Math.abs(span - Math.PI * 2) < 1e-9;
    const steps = closed ? count : count + 1;
    for (let index = 0; index < steps; index++) {
        const angle = from + (index / count) * span;
        const big = index % every === 0;
        const inner = radius - (big ? lengths[1] : lengths[0]);
        const sx = Math.sin(angle);
        const sy = -Math.cos(angle);
        (big ? major : minor).push(lineOnTop([cx + sx * inner, cy + sy * inner], [cx + sx * radius, cy + sy * radius], z, projection));
    }
    return { minor: minor.join(""), major: major.join("") };
}
const haloOf = (plan, z, height, projection) => slabOf(plan, z, height, projection).fill;
function axisVector(projection, [dx, dy, dz]) {
    const origin = iso([0, 0, 0], projection);
    const moved = iso([dx, dy, dz], projection);
    return [moved[0] - origin[0], moved[1] - origin[1]];
}
const fine = (value) => Math.round(value * 100) / 100;
function translateAlong(projection, by) {
    const [x, y] = axisVector(projection, by);
    return `translate(${fine(x)} ${fine(y)})`;
}
const thousandth = (value) => Math.round(value * 1000) / 1000;
function axesAt(at, z, projection) {
    const origin = iso([at[0], at[1], z], projection);
    const along = (point) => {
        const [px, py] = iso(point, projection);
        return [px - origin[0], py - origin[1]];
    };
    return { origin, x: along([at[0] + 1, at[1], z]), y: along([at[0], at[1] + 1, z]), z: along([at[0], at[1], z + 1]) };
}
const matrixOf = (u, v, origin) => `matrix(${thousandth(u[0])} ${thousandth(u[1])} ${thousandth(v[0])} ${thousandth(v[1])} ${thousandth(origin[0])} ${thousandth(origin[1])})`;
function holdStill(element, [dx, dy]) {
    const text = dx || dy ? `translate(${-dx} ${-dy})` : "";
    element.querySelectorAll("[data-hold]").forEach((node) => (text ? node.setAttribute("transform", text) : node.removeAttribute("transform")));
}
function topMatrix(at, z, projection, along = "x") {
    const { origin, x, y } = axesAt(at, z, projection);
    return along === "x" ? matrixOf(x, y, origin) : matrixOf([-y[0], -y[1]], x, origin);
}
function sideMatrix(at, z, projection, face) {
    const { origin, x, y, z: up } = axesAt(at, z, projection);
    const down = [-up[0], -up[1]];
    return face === "left" ? matrixOf(x, down, origin) : matrixOf([-y[0], -y[1]], down, origin);
}
function screenRise(height, projection) {
    const { cosE, k } = cameraOf(projection);
    return height * cosE * k;
}
function fitProjection(points, width, height, { pad = 24, headroom = 0, azimuth = AZIMUTH, elevation = ELEVATION } = {}) {
    const unit = { origin: [0, 0], scale: 1, azimuth, elevation };
    const flat = points.map((point) => iso(point, unit));
    const xs = flat.map(([x]) => x);
    const ys = flat.map(([, y]) => y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const up = Math.min(...ys);
    const down = Math.max(...ys);
    const scale = Math.min((width - pad * 2) / (right - left), (height - pad * 2 - headroom) / (down - up));
    return {
        origin: [width / 2 - ((left + right) / 2) * scale, headroom + (height - headroom) / 2 - ((up + down) / 2) * scale],
        scale,
        azimuth,
        elevation,
    };
}
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const attrs = (pairs) => Object.entries(pairs)
    .filter(([, value]) => value !== undefined && value !== false)
    .map(([key, value]) => ` ${key}="${escape(String(value))}"`)
    .join("");
function solidSvg(paths, { tone = "hi", crease = "faint", halo = false, lit = false, flat = false, className, inner = "" } = {}) {
    const parts = [];
    if (halo)
        parts.push(`<path class="iso-halo" d="${paths.fill}"/>`);
    parts.push(`<path class="iso-fill" d="${paths.fill}"/>`);
    if (!flat) {
        paths.shades.forEach((d, shade) => {
            if (d)
                parts.push(`<path class="iso-shade" data-shade="${shade}" d="${d}"/>`);
        });
        parts.push(`<path class="iso-top" d="${paths.top}"/>`);
    }
    if (crease !== "none" && paths.crease)
        parts.push(`<path class="iso-line iso-crease" data-tone="${crease}" d="${paths.crease}"/>`);
    if (crease !== "none" && paths.bevel)
        parts.push(`<path class="iso-line iso-bevel" data-tone="${crease}" d="${paths.bevel}"/>`);
    if (inner)
        parts.push(inner);
    parts.push(`<path class="iso-line iso-edge" data-tone="${tone}" d="${paths.outline}"/>`);
    return `<g${attrs({ class: className ? `iso-solid ${className}` : "iso-solid", "data-lit": lit ? "" : undefined, "data-seamless": paths.seamless ? "" : undefined })}>${parts.join("")}</g>`;
}
function lineSvg(d, { tone = "lo", dotted = false, dashed = false, flow = false, className, free } = {}) {
    if (!d)
        return "";
    return `<path${attrs({
        class: className ? `iso-line ${className}` : "iso-line",
        "data-tone": tone,
        "data-free": free === true ? "" : free || undefined,
        "data-dotted": dotted ? "" : undefined,
        "data-dashed": dashed ? "" : undefined,
        "data-flow": flow ? "" : undefined,
        d,
    })}/>`;
}
function dotsSvg(points, { size = 0.5, tone = "mid", pulse = false } = {}) {
    const dots = points
        .map(([x, y, alpha], index) => `<circle cx="${tenth(x)}" cy="${tenth(y)}" r="${size}"${alpha !== undefined && alpha < 1 ? ` fill-opacity="${Math.max(0, alpha).toFixed(2)}"` : ""}${pulse ? ` data-pulse="" style="--pulse-at:${(index * 137) % 1600}ms"` : ""}/>`)
        .join("");
    return `<g class="iso-dots" data-tone="${tone}">${dots}</g>`;
}
function fadedSvg(list, style = {}) {
    const groups = new Map();
    for (const entry of list) {
        const [d, alpha] = Array.isArray(entry) ? entry : [entry.d, entry.alpha];
        if (!d || !(alpha > 0.02))
            continue;
        const level = Math.min(1, Math.round(alpha * 20) / 20);
        groups.set(level, (groups.get(level) ?? "") + d);
    }
    return [...groups].map(([alpha, d]) => (alpha >= 1 ? lineSvg(d, style) : `<g opacity="${alpha.toFixed(2)}">${lineSvg(d, style)}</g>`)).join("");
}
function fadeLineSvg(points, { fade = [0, 0], tone = "lo", className, stops = 6 } = {}) {
    if (points.length < 2)
        return "";
    const ease = (t) => t * t * (3 - 2 * t);
    const hashOf = (text) => {
        let hash = 2166136261;
        for (let index = 0; index < text.length; index++)
            hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
        return (hash >>> 0).toString(36);
    };
    const lengths = [0];
    for (let index = 1; index < points.length; index++)
        lengths.push(lengths[index - 1] + Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]));
    const at = (length) => {
        let index = 1;
        while (index < points.length - 1 && lengths[index] < length)
            index++;
        const span = lengths[index] - lengths[index - 1] || 1;
        const t = Math.max(0, Math.min(1, (length - lengths[index - 1]) / span));
        return [points[index - 1][0] + (points[index][0] - points[index - 1][0]) * t, points[index - 1][1] + (points[index][1] - points[index - 1][1]) * t];
    };
    const pieceOf = (from, to) => [at(from), ...points.filter((_, index) => lengths[index] > from + 1e-6 && lengths[index] < to - 1e-6), at(to)];
    const total = lengths[lengths.length - 1];
    if (total < 1e-6)
        return "";
    let [start, end] = Array.isArray(fade) ? fade : [fade, fade];
    if (start + end > total) {
        const share = total / (start + end);
        start *= share;
        end *= share;
    }
    const paint = `var(--anatomy-${tone})`;
    const ramp = (piece, rising) => {
        const d = pathOf(piece);
        const [x1, y1] = piece[0];
        const [x2, y2] = piece[piece.length - 1];
        const id = `iso-fade-${hashOf(`${d}|${tone}|${rising}`)}`;
        const marks = Array.from({ length: stops + 1 }, (_, index) => {
            const t = index / stops;
            const alpha = ease(rising ? t : 1 - t);
            return `<stop offset="${t.toFixed(3)}" stop-opacity="${alpha.toFixed(3)}" style="stop-color:${paint}"/>`;
        }).join("");
        const gradient = `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${tenth(x1)}" y1="${tenth(y1)}" x2="${tenth(x2)}" y2="${tenth(y2)}">${marks}</linearGradient>`;
        return `<defs>${gradient}</defs><path${attrs({ class: className ? `iso-line ${className}` : "iso-line", "data-tone": tone, "data-free": rising ? "start" : "end", d, style: `stroke:url(#${id})` })}/>`;
    };
    const parts = [];
    if (start > 0.05)
        parts.push(ramp(pieceOf(0, start), true));
    if (total - end - start > 0.05)
        parts.push(lineSvg(pathOf(pieceOf(start, total - end)), { tone, className }));
    if (end > 0.05)
        parts.push(ramp(pieceOf(total - end, total), false));
    return `<g class="iso-fade">${parts.join("")}</g>`;
}
function wireSvg(from, to, { via = [], tone = "lo", dotted = false, dashed = false, flow = false, ends = "both", size = 1.2 } = {}) {
    const d = pathOf([from, ...via, to]);
    const end = ([x, y]) => `<circle class="iso-wire-end" cx="${tenth(x)}" cy="${tenth(y)}" r="${size}"/>`;
    return `<g class="iso-wire" data-tone="${tone}">${lineSvg(d, { tone, dotted, dashed, flow })}${ends === "both" || ends === "from" ? end(from) : ""}${ends === "both" || ends === "to" ? end(to) : ""}</g>`;
}
function faceTextSvg(transform, text, { size = 3, tone = "mid", anchor = "start" } = {}) {
    return `<text class="iso-face-text" data-tone="${tone}" transform="${transform}" font-size="${size}" text-anchor="${anchor}">${escape(text)}</text>`;
}
function groupSvg(children, extra = {}) {
    return `<g${attrs(extra)}>${Array.isArray(children) ? children.join("") : children}</g>`;
}
function figureSvg({ width, height, label, body, standalone = false, className }) {
    const style = standalone ? `<style>${ISO_CSS}</style>` : "";
    return `<svg${attrs({
        xmlns: "http://www.w3.org/2000/svg",
        class: `iso-svg${standalone ? " iso" : ""}${className ? ` ${className}` : ""}`,
        "data-theme": standalone || undefined,
        viewBox: `0 0 ${width} ${height}`,
        role: "img",
        "aria-label": label,
    })}>${style}${Array.isArray(body) ? body.join("") : body}</svg>`;
}
function swatchSvg(mark) {
    if (mark === "raised" || mark === "flat" || mark === "lit") {
        const body = mark === "flat" ? "M2 6.5 8 3.5 14 6.5 8 9.5Z" : "M2 4.5 8 1.5 14 4.5 14 6 8 9 2 6Z";
        const crease = mark === "flat" ? "" : `<path class="iso-swatch-crease" d="M2 4.5 8 7.5 14 4.5"/>`;
        return `<svg class="iso-swatch" data-mark="${mark}" viewBox="0 0 16 10" aria-hidden="true"><path d="${body}"/>${crease}</svg>`;
    }
    return `<svg class="iso-swatch" data-mark="${mark}" viewBox="0 0 16 10" aria-hidden="true"><path d="M1.5 5h13"/></svg>`;
}
function plateHtml({ fig, title, hint, readout = "", keys = [], caption, body }) {
    const corner = (name, text, extra = "") => `<span class="iso-plate-corner" data-corner="${name}"${extra}>${escape(text)}</span>`;
    const legend = keys.length || caption
        ? `<figcaption class="iso-legend">${keys.length ? `<span class="iso-keys">${keys.map((key) => `<span class="iso-key">${swatchSvg(key.mark)}${escape(key.label)}</span>`).join("")}</span>` : ""}${caption ? `<span class="iso-caption">${escape(caption)}</span>` : ""}</figcaption>`
        : "";
    return `<figure class="iso-figure"><div class="iso-plate"><div class="iso-plate-corners" aria-hidden="true">${corner("fig", fig)}${title ? corner("title", title) : ""}${hint ? corner("hint", hint) : ""}${corner("readout", readout, " data-readout")}</div>${body}</div>${legend}</figure>`;
}
function pageHtml({ title, theme = "dark", body, script = "", width = 650 }) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title><style>${ISO_CSS}${PAGE_CSS.replace("__WIDTH__", String(width))}</style></head><body class="iso" data-theme="${theme}"><main class="iso-page">${body}</main>${script ? `<script type="module">${script.replace(/<\/(script)/gi, "<\\/$1")}</script>` : ""}</body></html>`;
}
const PAGE_CSS = `
*{box-sizing:border-box}
html{color-scheme:dark}
body[data-theme="light"]{color-scheme:light}
body{margin:0;background:var(--anatomy-page);color:var(--anatomy-text);font:14px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.iso-page{width:min(__WIDTH__px,100% - 32px);margin:64px auto 96px}
`;
const ISO_CSS = `
.iso{
  --anatomy-page:#0b0b0b;--anatomy-card:#131313;--anatomy-text:#a3a3a3;--anatomy-strong:#e6e6e6;--anatomy-muted:#6e6e6e;
  --anatomy-paper:#131313;--anatomy-face:#1b1b1b;--anatomy-top:#1c1c1c;
  --anatomy-shade-0:#0f0f0f;--anatomy-shade-1:#121212;--anatomy-shade-2:#151515;--anatomy-shade-3:#181818;
  --anatomy-lit-top:#262626;--anatomy-lit-shade:#1d1d1d;
  --anatomy-hi:#d4d4d4;--anatomy-mid:#6a6a6a;--anatomy-lo:#3e3e3e;--anatomy-faint:#2a2a2a;--anatomy-lit:#ffffff;
  --anatomy-halo:#050505;--anatomy-halo-opacity:.9;--anatomy-dot:#e6e6e6;
  --anatomy-red:#ff6b6b;--anatomy-green:#6be0a0;--anatomy-blue:#6b9bff;
  --anatomy-weight:.6px;--anatomy-ease:cubic-bezier(.32,.72,0,1);
  --anatomy-mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  --anatomy-lift:inset 0 1px 0 0 #ffffff0a,inset 0 0 0 1px #ffffff06,0 0 0 1px #00000026,0 1px 1px -.5px #00000014,0 3px 3px -1.5px #00000014,0 6px 6px -3px #00000014,0 12px 12px -6px #00000014;
}
.iso[data-theme="light"]{
  --anatomy-page:#f2f2ef;--anatomy-card:#fbfbfa;--anatomy-text:#57575a;--anatomy-strong:#18181a;--anatomy-muted:#8c8c90;
  --anatomy-paper:#fbfbfa;--anatomy-face:#ffffff;--anatomy-top:#ffffff;
  --anatomy-shade-0:#dcdcd9;--anatomy-shade-1:#e5e5e2;--anatomy-shade-2:#ededea;--anatomy-shade-3:#f4f4f1;
  --anatomy-lit-top:#ffffff;--anatomy-lit-shade:#eeeeeb;
  --anatomy-hi:#26262a;--anatomy-mid:#8a8a8f;--anatomy-lo:#b4b4b8;--anatomy-faint:#d4d4d6;--anatomy-lit:#000000;
  --anatomy-halo:#8a8a80;--anatomy-halo-opacity:.32;--anatomy-dot:#3a3a3e;
  --anatomy-red:#e5484d;--anatomy-green:#30a46c;--anatomy-blue:#3e63dd;
  --anatomy-lift:inset 0 1px 0 0 #ffffff,0 0 0 1px #0000000f,0 1px 1px -.5px #0000000a,0 3px 3px -1.5px #0000000a,0 6px 6px -3px #0000000a,0 12px 12px -6px #0000000a;
}
.iso-svg{display:block;width:100%;height:auto;overflow:visible}
.iso-svg path,.iso-svg circle{vector-effect:non-scaling-stroke}
.iso-fill{fill:var(--anatomy-paper);stroke:none}
.iso-solid[data-lit]>.iso-fill{fill:var(--anatomy-face)}
.iso-shade,.iso-top{stroke:none}
.iso-shade[data-shade="0"]{fill:var(--anatomy-shade-0)}
.iso-shade[data-shade="1"]{fill:var(--anatomy-shade-1)}
.iso-shade[data-shade="2"]{fill:var(--anatomy-shade-2)}
.iso-shade[data-shade="3"]{fill:var(--anatomy-shade-3)}
.iso-top{fill:var(--anatomy-top)}
.iso-solid[data-lit]>.iso-top{fill:var(--anatomy-lit-top)}
.iso-solid[data-lit]>.iso-shade{fill:var(--anatomy-lit-shade)}
.iso-solid[data-seamless]>.iso-shade,.iso-solid[data-seamless]>.iso-top{stroke-width:.4;stroke-linejoin:round}
.iso-solid[data-seamless]>.iso-shade[data-shade="0"]{stroke:var(--anatomy-shade-0)}
.iso-solid[data-seamless]>.iso-shade[data-shade="1"]{stroke:var(--anatomy-shade-1)}
.iso-solid[data-seamless]>.iso-shade[data-shade="2"]{stroke:var(--anatomy-shade-2)}
.iso-solid[data-seamless]>.iso-shade[data-shade="3"]{stroke:var(--anatomy-shade-3)}
.iso-solid[data-seamless]>.iso-top{stroke:var(--anatomy-top)}
.iso-solid[data-seamless][data-lit]>.iso-top{stroke:var(--anatomy-lit-top)}
.iso-solid[data-seamless][data-lit]>.iso-shade{stroke:var(--anatomy-lit-shade)}
.iso-solid[data-lit]>.iso-edge{stroke:var(--anatomy-lit)}
.iso-halo{fill:var(--anatomy-halo);stroke:none;filter:blur(9px);opacity:var(--anatomy-halo-opacity);transform:translateY(3px)}
.iso-line{fill:none;stroke:var(--anatomy-lo);stroke-width:var(--anatomy-weight);stroke-linecap:round;stroke-linejoin:round}
.iso-line[data-tone="hi"]{stroke:var(--anatomy-hi)}
.iso-line[data-tone="mid"]{stroke:var(--anatomy-mid)}
.iso-line[data-tone="lo"]{stroke:var(--anatomy-lo)}
.iso-line[data-tone="faint"]{stroke:var(--anatomy-faint)}
.iso-line[data-tone="lit"]{stroke:var(--anatomy-lit)}
.iso-line[data-tone="red"]{stroke:var(--anatomy-red)}
.iso-line[data-tone="green"]{stroke:var(--anatomy-green)}
.iso-line[data-tone="blue"]{stroke:var(--anatomy-blue)}
.iso-line[data-dotted]{stroke-dasharray:.01 3.5;stroke-width:1}
.iso-line[data-dashed]{stroke-dasharray:3 3}
.iso-line[data-flow]{stroke-dasharray:2 6}
.iso-wire-end{fill:var(--anatomy-paper);stroke:var(--anatomy-lo);stroke-width:var(--anatomy-weight)}
.iso-wire[data-tone="hi"] .iso-wire-end{stroke:var(--anatomy-hi)}
.iso-wire[data-tone="mid"] .iso-wire-end{stroke:var(--anatomy-mid)}
.iso-wire[data-tone="faint"] .iso-wire-end{stroke:var(--anatomy-faint)}
.iso-wire[data-tone="lit"] .iso-wire-end{stroke:var(--anatomy-lit)}
.iso-dots circle{fill:var(--anatomy-dot);stroke:none;opacity:.32}
.iso-dots[data-tone="hi"] circle{opacity:.85}
.iso-dots[data-tone="mid"] circle{opacity:.45}
.iso-dots[data-tone="lo"] circle{opacity:.22}
.iso-dots[data-tone="faint"] circle{opacity:.12}
.iso-face-text{fill:var(--anatomy-mid);font-family:var(--anatomy-mono);letter-spacing:.04em}
.iso-face-text[data-tone="hi"]{fill:var(--anatomy-hi)}
.iso-face-text[data-tone="lo"]{fill:var(--anatomy-lo)}
.iso-face-text[data-tone="faint"]{fill:var(--anatomy-faint)}
.tb-body{fill:var(--anatomy-shade-2);stroke:none}
.tb-shine{fill:var(--anatomy-top);stroke:none}
.tb-shade{fill:var(--anatomy-shade-0);stroke:none}
.tb-ring{fill:none;stroke:var(--anatomy-lo);stroke-width:.45;stroke-linecap:butt;stroke-linejoin:round}
.tb-ring[data-tone="mid"]{stroke:var(--anatomy-mid)}
.tb-ring[data-tone="faint"]{stroke:var(--anatomy-faint)}
.tb-ring[data-tone="hi"]{stroke:var(--anatomy-hi)}
@keyframes iso-flow{to{stroke-dashoffset:-32}}
@keyframes iso-pulse{0%,100%{opacity:.18}12%{opacity:1}40%{opacity:.18}}
.iso-line[data-flow]{animation:iso-flow 1600ms linear infinite}
.iso-dots circle[data-pulse]{animation:iso-pulse 1600ms steps(1,end) infinite;animation-delay:var(--pulse-at,0ms)}
.iso-figure{margin:32px 0 36px}
.iso-plate{position:relative;padding:52px 24px;border-radius:0;background:var(--anatomy-card);box-shadow:0 0 0 1px var(--anatomy-mid);--anatomy-paper:var(--anatomy-card)}
.iso-plate-corners{position:absolute;inset:18px 20px;pointer-events:none}
.iso-plate-corner{position:absolute;color:var(--anatomy-muted);font-family:var(--anatomy-mono);font-size:10.5px;line-height:1;letter-spacing:.04em;white-space:nowrap}
.iso-plate-corner[data-corner="fig"]{top:0;left:0;color:var(--anatomy-text)}
.iso-plate-corner[data-corner="title"]{top:0;right:0;text-transform:uppercase;letter-spacing:.1em}
.iso-plate-corner[data-corner="hint"]{bottom:0;left:0;text-transform:uppercase;letter-spacing:.1em}
.iso-plate-corner[data-corner="readout"]{right:0;bottom:0;color:var(--anatomy-text);font-variant-numeric:tabular-nums}
.iso-plate .iso-svg{margin:0 auto}
.iso-legend{display:grid;gap:8px;margin-top:12px;color:var(--anatomy-muted);font-size:13px;line-height:1.55}
.iso-keys{display:flex;flex-wrap:wrap;gap:6px 18px}
.iso-key{display:inline-flex;align-items:center;gap:7px}
.iso-swatch{width:16px;height:10px;flex:none;overflow:visible}
.iso-swatch path{fill:none;stroke:var(--anatomy-hi);stroke-width:1;vector-effect:non-scaling-stroke;stroke-linejoin:round;stroke-linecap:round}
.iso-swatch[data-mark="raised"] path,.iso-swatch[data-mark="flat"] path{stroke:var(--anatomy-mid)}
.iso-swatch[data-mark="lit"] path{stroke:var(--anatomy-lit)}
.iso-swatch[data-mark="dim"] path{stroke:var(--anatomy-lo)}
.iso-swatch[data-mark="dotted"] path{stroke-dasharray:.01 3;stroke-width:1.4}
.iso-swatch[data-mark="dashed"] path{stroke-dasharray:3 2.5}
.iso-swatch[data-mark="red"] path{stroke:var(--anatomy-red)}
.iso-swatch[data-mark="green"] path{stroke:var(--anatomy-green)}
.iso-swatch[data-mark="blue"] path{stroke:var(--anatomy-blue)}
.iso-swatch-crease{stroke:var(--anatomy-lo)!important}
@media (max-width:560px){.iso-plate{padding:48px 12px 70px}.iso-plate-corner[data-corner="hint"]{bottom:18px}}
@media (prefers-reduced-motion:reduce){.iso-line[data-flow],.iso-dots circle[data-pulse]{animation:none}}
`;

if (!document.getElementById("iso-css")) { const s = document.createElement("style"); s.id = "iso-css"; s.textContent = ISO_CSS; document.head.appendChild(s); }
if (!document.getElementById("fig-turnstile-css")) { const s = document.createElement("style"); s.id = "fig-turnstile-css"; s.textContent = "/* Fig 2 on the site's dark band (#171717): the kit's dark tones moved up to\n   that paper, the brand pink as the one lit accent, the site's mono for the\n   card corners. */\n.fig-turnstile.iso {\n  --anatomy-page: #171717;\n  --anatomy-card: #171717;\n  --anatomy-text: #a3a3a3;\n  --anatomy-muted: #737373;\n  --anatomy-paper: #171717;\n  --anatomy-face: #212121;\n  --anatomy-top: #252525;\n  --anatomy-shade-0: #111111;\n  --anatomy-shade-1: #151515;\n  --anatomy-shade-2: #1a1a1a;\n  --anatomy-shade-3: #1e1e1e;\n  --anatomy-lit-top: #2c2c2c;\n  --anatomy-lit-shade: #232323;\n  --anatomy-hi: #e2e2e2;\n  --anatomy-mid: #7e7e7e;\n  --anatomy-lo: #4e4e4e;\n  --anatomy-faint: #343434;\n  --anatomy-lit: #ef285e;\n  --anatomy-halo: #050505;\n  --anatomy-mono: var(--font-data, ui-monospace, SFMono-Regular, Menlo, monospace);\n  --ts-screen: #0c0c0d;\n}\n.fig-turnstile .iso-figure { margin: 0; }\n.fig-turnstile .iso-plate {\n  padding: 44px 20px;\n  border-radius: 16px;\n  background: var(--anatomy-card);\n  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.07), 0 0 0 1px rgb(255 255 255 / 0.08);\n}\n.fig-turnstile .iso-plate-corners { inset: 16px 18px; }\n.fig-turnstile .ts-stage { outline: none; cursor: pointer; -webkit-tap-highlight-color: transparent; }\n.fig-turnstile .ts-stage:focus-visible { outline: 1px solid var(--anatomy-muted); outline-offset: 6px; border-radius: 8px; }\n.fig-turnstile .ts-slot { fill: #0a0a0a; stroke: none; }\n.fig-turnstile .ts-glass { fill: var(--ts-screen); stroke: none; }\n.fig-turnstile .ts-bezel { fill: #101010; stroke: none; }\n.fig-turnstile .ts-text { font-family: var(--anatomy-mono); letter-spacing: 0.02em; fill: var(--anatomy-hi); }\n.fig-turnstile .ts-text[data-tone=\"mid\"] { fill: var(--anatomy-mid); }\n.fig-turnstile .ts-text[data-tone=\"lit\"] { fill: var(--anatomy-lit); }\n.fig-turnstile .ts-glow { fill: var(--anatomy-lit); stroke: none; opacity: 0; filter: blur(2.5px); }\n.fig-turnstile .ts-head { fill: var(--anatomy-face); stroke: var(--anatomy-mid); stroke-width: var(--anatomy-weight); vector-effect: non-scaling-stroke; }\n.fig-turnstile .ts-band { fill: var(--anatomy-lit-top); stroke: none; }\n.fig-turnstile .ts-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }\n@media (max-width: 560px) {\n  /* The drawing is wider than tall: on a phone, let it run past the card's\n     side padding so the gate reads larger. */\n  .fig-turnstile .iso-plate { padding: 40px 8px 64px; overflow: hidden; }\n  .fig-turnstile .iso-svg.ts-svg { width: 124%; margin: 0 -12%; }\n  .fig-turnstile .iso-plate-corners { inset: 14px 14px; }\n}\n"; document.head.appendChild(s); }
host.innerHTML = "<figure class=\"iso-figure\"><div class=\"iso-plate\"><div class=\"iso-plate-corners\" aria-hidden=\"true\"><span class=\"iso-plate-corner\" data-corner=\"fig\">Fig 2</span><span class=\"iso-plate-corner\" data-corner=\"title\">Who gets in</span><span class=\"iso-plate-corner\" data-corner=\"hint\">Tap to change who gets in</span><span class=\"iso-plate-corner\" data-corner=\"readout\" data-readout>private · you in</span></div><div class=\"iso-stage ts-stage\" tabindex=\"0\" role=\"slider\" aria-valuemin=\"1\" aria-valuemax=\"4\" aria-valuenow=\"1\" aria-valuetext=\"Private: only you get in\" aria-label=\"The gate in front of a spawnpoint project. Tap, or press 1 to 4 or the arrow keys, to change who it lets in.\"><svg xmlns=\"http://www.w3.org/2000/svg\" class=\"iso-svg ts-svg\" viewBox=\"0 0 600 400\" role=\"img\" aria-label=\"An office speed gate on a floor plate: a cabinet with a glass paddle across the lane, a reader head with a screen and a badge slot, a slot on the far end where a badge comes out, and a dial with four positions for who may come in. Two files of badges stand on the floor, one at the entrance and one past the gate.\"><defs><clipPath id=\"ts-clip-in\"><path d=\"M249 67.5L282.2 80.5L283.2 -180.7L250.1 -193.6Z\"/></clipPath><clipPath id=\"ts-clip-out\"><path d=\"M396 143.2L429.2 156.2L430.2 -105L397 -118Z\"/></clipPath></defs><path class=\"iso-halo\" d=\"M107 261.8L107.5 260.4L108.6 259L110.1 257.8L210.1 193.8L212.2 192.7L214.6 191.9L217.3 191.3L220.2 190.9L223.1 190.9L226 191.2L228.8 191.7L231.3 192.5L487.3 292.5L489.4 293.5L491.1 294.7L492.3 296.1L492.9 297.5L493 299L493 312L492.5 313.4L491.4 314.8L489.9 316.1L389.9 380.1L387.8 381.1L385.4 382L382.7 382.6L379.8 382.9L376.9 382.9L374 382.7L371.2 382.2L368.7 381.4L112.7 281.4L110.6 280.3L108.9 279.1L107.7 277.8L107.1 276.3L107 274.9Z\"/><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M215.1 224.2L215.3 223L216.1 221.9L217.3 220.9L219 220L221 219.4L223.2 219L225.5 218.9L227.9 219L230.1 219.4L232.1 220L233.8 220.8L235.1 221.8L235.9 222.9L236.2 224.1L236.2 226.2L235.9 227.3L235.2 228.4L233.9 229.4L232.3 230.3L230.3 230.9L228.1 231.3L225.7 231.5L223.4 231.3L221.2 231L219.1 230.4L217.5 229.5L216.2 228.5L215.4 227.4L215.1 226.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M233.9 229.4L232.3 230.3L232.3 228.2L233.9 227.4ZM232.3 230.3L230.3 230.9L230.3 228.8L232.3 228.2ZM236.2 226.2L235.9 227.3L235.9 225.2L236.2 224.1ZM235.9 227.3L235.2 228.4L235.2 226.4L235.9 225.2ZM235.2 228.4L233.9 229.4L233.9 227.4L235.2 226.4Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M230.3 230.9L228.1 231.3L228.1 229.2L230.3 228.8ZM228.1 231.3L225.7 231.5L225.7 229.4L228.1 229.2Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M225.7 231.5L223.4 231.3L223.4 229.3L225.7 229.4ZM223.4 231.3L221.2 231L221.2 228.9L223.4 229.3Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M221.2 231L219.1 230.4L219.1 228.3L221.2 228.9ZM219.1 230.4L217.5 229.5L217.5 227.4L219.1 228.3ZM217.5 229.5L216.2 228.5L216.2 226.5L217.5 227.4ZM216.2 228.5L215.4 227.4L215.4 225.3L216.2 226.5ZM215.4 227.4L215.1 226.3L215.1 224.2L215.4 225.3Z\"/><path class=\"iso-top\" d=\"M233.9 227.4L232.3 228.2L230.3 228.8L228.1 229.2L225.7 229.4L223.4 229.3L221.2 228.9L219.1 228.3L217.5 227.4L216.2 226.5L215.4 225.3L215.1 224.2L215.3 223L216.1 221.9L217.3 220.9L219 220L221 219.4L223.2 219L225.5 218.9L227.9 219L230.1 219.4L232.1 220L233.8 220.8L235.1 221.8L235.9 222.9L236.2 224.1L235.9 225.2L235.2 226.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M236.2 224.1L235.9 225.2L235.2 226.4L233.9 227.4L232.3 228.2L230.3 228.8L228.1 229.2L225.7 229.4L223.4 229.3L221.2 228.9L219.1 228.3L217.5 227.4L216.2 226.5L215.4 225.3L215.1 224.2\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M215.1 224.2L215.3 223L216.1 221.9L217.3 220.9L219 220L221 219.4L223.2 219L225.5 218.9L227.9 219L230.1 219.4L232.1 220L233.8 220.8L235.1 221.8L235.9 222.9L236.2 224.1M236.2 226.2L235.9 227.3L235.2 228.4L233.9 229.4L232.3 230.3L230.3 230.9L228.1 231.3L225.7 231.5L223.4 231.3L221.2 231L219.1 230.4L217.5 229.5L216.2 228.5L215.4 227.4L215.1 226.3M215.1 224.2L215.1 226.3M236.2 224.1L236.2 226.2\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M217.5 219.7L217.7 218.8L218.3 218L219.2 217.2L220.5 216.5L222 216.1L223.7 215.7L225.5 215.6L227.4 215.7L229.1 216L230.6 216.5L231.9 217.1L232.9 217.9L233.5 218.7L233.7 219.7L233.7 224.1L233.6 225L233 225.8L232 226.6L230.8 227.3L229.2 227.8L227.5 228.1L225.7 228.2L223.9 228.1L222.2 227.8L220.6 227.3L219.3 226.7L218.3 225.9L217.7 225.1L217.5 224.2Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M232 226.6L230.8 227.3L230.8 222.8L232 222.2ZM230.8 227.3L229.2 227.8L229.2 223.3L230.8 222.8ZM233.7 224.1L233.6 225L233.6 220.6L233.7 219.7ZM233.6 225L233 225.8L233 221.4L233.6 220.6ZM233 225.8L232 226.6L232 222.2L233 221.4Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M229.2 227.8L227.5 228.1L227.5 223.6L229.2 223.3ZM227.5 228.1L225.7 228.2L225.7 223.8L227.5 223.6Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M225.7 228.2L223.9 228.1L223.9 223.7L225.7 223.8ZM223.9 228.1L222.2 227.8L222.2 223.4L223.9 223.7Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M222.2 227.8L220.6 227.3L220.6 222.9L222.2 223.4ZM220.6 227.3L219.3 226.7L219.3 222.3L220.6 222.9ZM219.3 226.7L218.3 225.9L218.3 221.5L219.3 222.3ZM218.3 225.9L217.7 225.1L217.7 220.6L218.3 221.5ZM217.7 225.1L217.5 224.2L217.5 219.7L217.7 220.6Z\"/><path class=\"iso-top\" d=\"M232 222.2L230.8 222.8L229.2 223.3L227.5 223.6L225.7 223.8L223.9 223.7L222.2 223.4L220.6 222.9L219.3 222.3L218.3 221.5L217.7 220.6L217.5 219.7L217.7 218.8L218.3 218L219.2 217.2L220.5 216.5L222 216.1L223.7 215.7L225.5 215.6L227.4 215.7L229.1 216L230.6 216.5L231.9 217.1L232.9 217.9L233.5 218.7L233.7 219.7L233.6 220.6L233 221.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M233.7 219.7L233.6 220.6L233 221.4L232 222.2L230.8 222.8L229.2 223.3L227.5 223.6L225.7 223.8L223.9 223.7L222.2 223.4L220.6 222.9L219.3 222.3L218.3 221.5L217.7 220.6L217.5 219.7\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M217.5 219.7L217.7 218.8L218.3 218L219.2 217.2L220.5 216.5L222 216.1L223.7 215.7L225.5 215.6L227.4 215.7L229.1 216L230.6 216.5L231.9 217.1L232.9 217.9L233.5 218.7L233.7 219.7M233.7 224.1L233.6 225L233 225.8L232 226.6L230.8 227.3L229.2 227.8L227.5 228.1L225.7 228.2L223.9 228.1L222.2 227.8L220.6 227.3L219.3 226.7L218.3 225.9L217.7 225.1L217.5 224.2M217.5 219.7L217.5 224.2M233.7 219.7L233.7 224.1\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M141 271.6L141.3 270.4L142 269.3L143.2 268.3L144.9 267.4L146.9 266.8L149.1 266.4L151.4 266.3L153.8 266.4L156 266.8L158 267.4L159.7 268.2L161 269.2L161.8 270.3L162.1 271.5L162.1 273.6L161.8 274.7L161.1 275.9L159.8 276.9L158.2 277.7L156.2 278.3L154 278.7L151.6 278.9L149.3 278.8L147.1 278.4L145.1 277.8L143.4 276.9L142.1 275.9L141.3 274.8L141 273.7Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M159.8 276.9L158.2 277.7L158.2 275.6L159.8 274.8ZM158.2 277.7L156.2 278.3L156.2 276.3L158.2 275.6ZM162.1 273.6L161.8 274.7L161.8 272.7L162.1 271.5ZM161.8 274.7L161.1 275.9L161.1 273.8L161.8 272.7ZM161.1 275.9L159.8 276.9L159.8 274.8L161.1 273.8Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M156.2 278.3L154 278.7L154 276.7L156.2 276.3ZM154 278.7L151.6 278.9L151.6 276.8L154 276.7Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M151.6 278.9L149.3 278.8L149.3 276.7L151.6 276.8ZM149.3 278.8L147.1 278.4L147.1 276.3L149.3 276.7Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M147.1 278.4L145.1 277.8L145.1 275.7L147.1 276.3ZM145.1 277.8L143.4 276.9L143.4 274.9L145.1 275.7ZM143.4 276.9L142.1 275.9L142.1 273.9L143.4 274.9ZM142.1 275.9L141.3 274.8L141.3 272.8L142.1 273.9ZM141.3 274.8L141 273.7L141 271.6L141.3 272.8Z\"/><path class=\"iso-top\" d=\"M159.8 274.8L158.2 275.6L156.2 276.3L154 276.7L151.6 276.8L149.3 276.7L147.1 276.3L145.1 275.7L143.4 274.9L142.1 273.9L141.3 272.8L141 271.6L141.3 270.4L142 269.3L143.2 268.3L144.9 267.4L146.9 266.8L149.1 266.4L151.4 266.3L153.8 266.4L156 266.8L158 267.4L159.7 268.2L161 269.2L161.8 270.3L162.1 271.5L161.8 272.7L161.1 273.8Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M162.1 271.5L161.8 272.7L161.1 273.8L159.8 274.8L158.2 275.6L156.2 276.3L154 276.7L151.6 276.8L149.3 276.7L147.1 276.3L145.1 275.7L143.4 274.9L142.1 273.9L141.3 272.8L141 271.6\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M141 271.6L141.3 270.4L142 269.3L143.2 268.3L144.9 267.4L146.9 266.8L149.1 266.4L151.4 266.3L153.8 266.4L156 266.8L158 267.4L159.7 268.2L161 269.2L161.8 270.3L162.1 271.5M162.1 273.6L161.8 274.7L161.1 275.9L159.8 276.9L158.2 277.7L156.2 278.3L154 278.7L151.6 278.9L149.3 278.8L147.1 278.4L145.1 277.8L143.4 276.9L142.1 275.9L141.3 274.8L141 273.7M141 271.6L141 273.7M162.1 271.5L162.1 273.6\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M143.4 267.1L143.6 266.2L144.2 265.4L145.1 264.6L146.4 264L147.9 263.5L149.7 263.2L151.5 263L153.3 263.1L155 263.4L156.5 263.9L157.8 264.5L158.8 265.3L159.4 266.2L159.7 267.1L159.7 271.5L159.5 272.4L158.9 273.3L157.9 274L156.7 274.7L155.1 275.2L153.4 275.5L151.6 275.6L149.8 275.5L148.1 275.2L146.5 274.7L145.2 274.1L144.3 273.3L143.6 272.5L143.4 271.6Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M157.9 274L156.7 274.7L156.7 270.3L157.9 269.6ZM156.7 274.7L155.1 275.2L155.1 270.7L156.7 270.3ZM159.7 271.5L159.5 272.4L159.5 268L159.7 267.1ZM159.5 272.4L158.9 273.3L158.9 268.8L159.5 268ZM158.9 273.3L157.9 274L157.9 269.6L158.9 268.8Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M155.1 275.2L153.4 275.5L153.4 271.1L155.1 270.7ZM153.4 275.5L151.6 275.6L151.6 271.2L153.4 271.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M151.6 275.6L149.8 275.5L149.8 271.1L151.6 271.2ZM149.8 275.5L148.1 275.2L148.1 270.8L149.8 271.1Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M148.1 275.2L146.5 274.7L146.5 270.3L148.1 270.8ZM146.5 274.7L145.2 274.1L145.2 269.7L146.5 270.3ZM145.2 274.1L144.3 273.3L144.3 268.9L145.2 269.7ZM144.3 273.3L143.6 272.5L143.6 268L144.3 268.9ZM143.6 272.5L143.4 271.6L143.4 267.1L143.6 268Z\"/><path class=\"iso-top\" d=\"M157.9 269.6L156.7 270.3L155.1 270.7L153.4 271.1L151.6 271.2L149.8 271.1L148.1 270.8L146.5 270.3L145.2 269.7L144.3 268.9L143.6 268L143.4 267.1L143.6 266.2L144.2 265.4L145.1 264.6L146.4 264L147.9 263.5L149.7 263.2L151.5 263L153.3 263.1L155 263.4L156.5 263.9L157.8 264.5L158.8 265.3L159.4 266.2L159.7 267.1L159.5 268L158.9 268.8Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M159.7 267.1L159.5 268L158.9 268.8L157.9 269.6L156.7 270.3L155.1 270.7L153.4 271.1L151.6 271.2L149.8 271.1L148.1 270.8L146.5 270.3L145.2 269.7L144.3 268.9L143.6 268L143.4 267.1\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M143.4 267.1L143.6 266.2L144.2 265.4L145.1 264.6L146.4 264L147.9 263.5L149.7 263.2L151.5 263L153.3 263.1L155 263.4L156.5 263.9L157.8 264.5L158.8 265.3L159.4 266.2L159.7 267.1M159.7 271.5L159.5 272.4L158.9 273.3L157.9 274L156.7 274.7L155.1 275.2L153.4 275.5L151.6 275.6L149.8 275.5L148.1 275.2L146.5 274.7L145.2 274.1L144.3 273.3L143.6 272.5L143.4 271.6M143.4 267.1L143.4 271.6M159.7 267.1L159.7 271.5\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M437.9 311.2L438.2 310L438.9 308.9L440.2 307.9L441.8 307.1L443.8 306.4L446 306L448.4 305.9L450.7 306L452.9 306.4L454.9 307L456.6 307.8L457.9 308.8L458.7 309.9L459 311.1L459 313.2L458.7 314.4L458 315.5L456.8 316.5L455.1 317.3L453.1 318L450.9 318.4L448.6 318.5L446.2 318.4L444 318L442 317.4L440.3 316.6L439 315.6L438.2 314.5L437.9 313.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M456.8 316.5L455.1 317.3L455.1 315.3L456.8 314.4ZM455.1 317.3L453.1 318L453.1 315.9L455.1 315.3ZM459 313.2L458.7 314.4L458.7 312.3L459 311.1ZM458.7 314.4L458 315.5L458 313.4L458.7 312.3ZM458 315.5L456.8 316.5L456.8 314.4L458 313.4Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M453.1 318L450.9 318.4L450.9 316.3L453.1 315.9ZM450.9 318.4L448.6 318.5L448.6 316.4L450.9 316.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M448.6 318.5L446.2 318.4L446.2 316.3L448.6 316.4ZM446.2 318.4L444 318L444 315.9L446.2 316.3Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M444 318L442 317.4L442 315.3L444 315.9ZM442 317.4L440.3 316.6L440.3 314.5L442 315.3ZM440.3 316.6L439 315.6L439 313.5L440.3 314.5ZM439 315.6L438.2 314.5L438.2 312.4L439 313.5ZM438.2 314.5L437.9 313.3L437.9 311.2L438.2 312.4Z\"/><path class=\"iso-top\" d=\"M456.8 314.4L455.1 315.3L453.1 315.9L450.9 316.3L448.6 316.4L446.2 316.3L444 315.9L442 315.3L440.3 314.5L439 313.5L438.2 312.4L437.9 311.2L438.2 310L438.9 308.9L440.2 307.9L441.8 307.1L443.8 306.4L446 306L448.4 305.9L450.7 306L452.9 306.4L454.9 307L456.6 307.8L457.9 308.8L458.7 309.9L459 311.1L458.7 312.3L458 313.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M459 311.1L458.7 312.3L458 313.4L456.8 314.4L455.1 315.3L453.1 315.9L450.9 316.3L448.6 316.4L446.2 316.3L444 315.9L442 315.3L440.3 314.5L439 313.5L438.2 312.4L437.9 311.2\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M437.9 311.2L438.2 310L438.9 308.9L440.2 307.9L441.8 307.1L443.8 306.4L446 306L448.4 305.9L450.7 306L452.9 306.4L454.9 307L456.6 307.8L457.9 308.8L458.7 309.9L459 311.1M459 313.2L458.7 314.4L458 315.5L456.8 316.5L455.1 317.3L453.1 318L450.9 318.4L448.6 318.5L446.2 318.4L444 318L442 317.4L440.3 316.6L439 315.6L438.2 314.5L437.9 313.3M437.9 311.2L437.9 313.3M459 311.1L459 313.2\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M440.3 306.8L440.5 305.9L441.1 305L442.1 304.2L443.3 303.6L444.9 303.1L446.6 302.8L448.4 302.7L450.2 302.8L451.9 303.1L453.5 303.5L454.8 304.2L455.7 304.9L456.4 305.8L456.6 306.7L456.6 311.1L456.4 312L455.8 312.9L454.9 313.7L453.6 314.3L452.1 314.8L450.3 315.1L448.5 315.2L446.7 315.1L445 314.8L443.5 314.4L442.2 313.7L441.2 313L440.6 312.1L440.3 311.2Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M454.9 313.7L453.6 314.3L453.6 309.9L454.9 309.2ZM453.6 314.3L452.1 314.8L452.1 310.4L453.6 309.9ZM456.6 311.1L456.4 312L456.4 307.6L456.6 306.7ZM456.4 312L455.8 312.9L455.8 308.5L456.4 307.6ZM455.8 312.9L454.9 313.7L454.9 309.2L455.8 308.5Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M452.1 314.8L450.3 315.1L450.3 310.7L452.1 310.4ZM450.3 315.1L448.5 315.2L448.5 310.8L450.3 310.7Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M448.5 315.2L446.7 315.1L446.7 310.7L448.5 310.8ZM446.7 315.1L445 314.8L445 310.4L446.7 310.7Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M445 314.8L443.5 314.4L443.5 309.9L445 310.4ZM443.5 314.4L442.2 313.7L442.2 309.3L443.5 309.9ZM442.2 313.7L441.2 313L441.2 308.5L442.2 309.3ZM441.2 313L440.6 312.1L440.6 307.7L441.2 308.5ZM440.6 312.1L440.3 311.2L440.3 306.8L440.6 307.7Z\"/><path class=\"iso-top\" d=\"M454.9 309.2L453.6 309.9L452.1 310.4L450.3 310.7L448.5 310.8L446.7 310.7L445 310.4L443.5 309.9L442.2 309.3L441.2 308.5L440.6 307.7L440.3 306.8L440.5 305.9L441.1 305L442.1 304.2L443.3 303.6L444.9 303.1L446.6 302.8L448.4 302.7L450.2 302.8L451.9 303.1L453.5 303.5L454.8 304.2L455.7 304.9L456.4 305.8L456.6 306.7L456.4 307.6L455.8 308.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M456.6 306.7L456.4 307.6L455.8 308.5L454.9 309.2L453.6 309.9L452.1 310.4L450.3 310.7L448.5 310.8L446.7 310.7L445 310.4L443.5 309.9L442.2 309.3L441.2 308.5L440.6 307.7L440.3 306.8\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M440.3 306.8L440.5 305.9L441.1 305L442.1 304.2L443.3 303.6L444.9 303.1L446.6 302.8L448.4 302.7L450.2 302.8L451.9 303.1L453.5 303.5L454.8 304.2L455.7 304.9L456.4 305.8L456.6 306.7M456.6 311.1L456.4 312L455.8 312.9L454.9 313.7L453.6 314.3L452.1 314.8L450.3 315.1L448.5 315.2L446.7 315.1L445 314.8L443.5 314.4L442.2 313.7L441.2 313L440.6 312.1L440.3 311.2M440.3 306.8L440.3 311.2M456.6 306.7L456.6 311.1\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M363.8 358.6L364.1 357.5L364.8 356.3L366.1 355.3L367.7 354.5L369.7 353.9L371.9 353.5L374.3 353.3L376.6 353.4L378.8 353.8L380.9 354.4L382.5 355.3L383.8 356.2L384.6 357.4L384.9 358.5L384.9 360.6L384.7 361.8L383.9 362.9L382.7 363.9L381 364.7L379 365.4L376.8 365.8L374.5 365.9L372.1 365.8L369.9 365.4L367.9 364.8L366.2 364L364.9 363L364.1 361.9L363.8 360.7Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M382.7 363.9L381 364.7L381 362.7L382.7 361.8ZM381 364.7L379 365.4L379 363.3L381 362.7ZM384.9 360.6L384.7 361.8L384.7 359.7L384.9 358.5ZM384.7 361.8L383.9 362.9L383.9 360.8L384.7 359.7ZM383.9 362.9L382.7 363.9L382.7 361.8L383.9 360.8Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M379 365.4L376.8 365.8L376.8 363.7L379 363.3ZM376.8 365.8L374.5 365.9L374.5 363.8L376.8 363.7Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M374.5 365.9L372.1 365.8L372.1 363.7L374.5 363.8ZM372.1 365.8L369.9 365.4L369.9 363.3L372.1 363.7Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M369.9 365.4L367.9 364.8L367.9 362.7L369.9 363.3ZM367.9 364.8L366.2 364L366.2 361.9L367.9 362.7ZM366.2 364L364.9 363L364.9 360.9L366.2 361.9ZM364.9 363L364.1 361.9L364.1 359.8L364.9 360.9ZM364.1 361.9L363.8 360.7L363.8 358.6L364.1 359.8Z\"/><path class=\"iso-top\" d=\"M382.7 361.8L381 362.7L379 363.3L376.8 363.7L374.5 363.8L372.1 363.7L369.9 363.3L367.9 362.7L366.2 361.9L364.9 360.9L364.1 359.8L363.8 358.6L364.1 357.5L364.8 356.3L366.1 355.3L367.7 354.5L369.7 353.9L371.9 353.5L374.3 353.3L376.6 353.4L378.8 353.8L380.9 354.4L382.5 355.3L383.8 356.2L384.6 357.4L384.9 358.5L384.7 359.7L383.9 360.8Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M384.9 358.5L384.7 359.7L383.9 360.8L382.7 361.8L381 362.7L379 363.3L376.8 363.7L374.5 363.8L372.1 363.7L369.9 363.3L367.9 362.7L366.2 361.9L364.9 360.9L364.1 359.8L363.8 358.6\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M363.8 358.6L364.1 357.5L364.8 356.3L366.1 355.3L367.7 354.5L369.7 353.9L371.9 353.5L374.3 353.3L376.6 353.4L378.8 353.8L380.9 354.4L382.5 355.3L383.8 356.2L384.6 357.4L384.9 358.5M384.9 360.6L384.7 361.8L383.9 362.9L382.7 363.9L381 364.7L379 365.4L376.8 365.8L374.5 365.9L372.1 365.8L369.9 365.4L367.9 364.8L366.2 364L364.9 363L364.1 361.9L363.8 360.7M363.8 358.6L363.8 360.7M384.9 358.5L384.9 360.6\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M366.3 354.2L366.4 353.3L367 352.4L368 351.7L369.2 351L370.8 350.5L372.5 350.2L374.3 350.1L376.1 350.2L377.8 350.5L379.4 351L380.7 351.6L381.7 352.4L382.3 353.2L382.5 354.1L382.5 358.5L382.3 359.4L381.7 360.3L380.8 361.1L379.5 361.7L378 362.2L376.3 362.5L374.5 362.6L372.6 362.5L370.9 362.3L369.4 361.8L368.1 361.1L367.1 360.4L366.5 359.5L366.3 358.6Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M380.8 361.1L379.5 361.7L379.5 357.3L380.8 356.7ZM379.5 361.7L378 362.2L378 357.8L379.5 357.3ZM382.5 358.5L382.3 359.4L382.3 355L382.5 354.1ZM382.3 359.4L381.7 360.3L381.7 355.9L382.3 355ZM381.7 360.3L380.8 361.1L380.8 356.7L381.7 355.9Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M378 362.2L376.3 362.5L376.3 358.1L378 357.8ZM376.3 362.5L374.5 362.6L374.5 358.2L376.3 358.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M374.5 362.6L372.6 362.5L372.6 358.1L374.5 358.2ZM372.6 362.5L370.9 362.3L370.9 357.8L372.6 358.1Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M370.9 362.3L369.4 361.8L369.4 357.4L370.9 357.8ZM369.4 361.8L368.1 361.1L368.1 356.7L369.4 357.4ZM368.1 361.1L367.1 360.4L367.1 355.9L368.1 356.7ZM367.1 360.4L366.5 359.5L366.5 355.1L367.1 355.9ZM366.5 359.5L366.3 358.6L366.3 354.2L366.5 355.1Z\"/><path class=\"iso-top\" d=\"M380.8 356.7L379.5 357.3L378 357.8L376.3 358.1L374.5 358.2L372.6 358.1L370.9 357.8L369.4 357.4L368.1 356.7L367.1 355.9L366.5 355.1L366.3 354.2L366.4 353.3L367 352.4L368 351.7L369.2 351L370.8 350.5L372.5 350.2L374.3 350.1L376.1 350.2L377.8 350.5L379.4 351L380.7 351.6L381.7 352.4L382.3 353.2L382.5 354.1L382.3 355L381.7 355.9Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M382.5 354.1L382.3 355L381.7 355.9L380.8 356.7L379.5 357.3L378 357.8L376.3 358.1L374.5 358.2L372.6 358.1L370.9 357.8L369.4 357.4L368.1 356.7L367.1 355.9L366.5 355.1L366.3 354.2\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M366.3 354.2L366.4 353.3L367 352.4L368 351.7L369.2 351L370.8 350.5L372.5 350.2L374.3 350.1L376.1 350.2L377.8 350.5L379.4 351L380.7 351.6L381.7 352.4L382.3 353.2L382.5 354.1M382.5 358.5L382.3 359.4L381.7 360.3L380.8 361.1L379.5 361.7L378 362.2L376.3 362.5L374.5 362.6L372.6 362.5L370.9 362.3L369.4 361.8L368.1 361.1L367.1 360.4L366.5 359.5L366.3 358.6M366.3 354.2L366.3 358.6M382.5 354.1L382.5 358.5\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M107 255.3L107.5 253.9L108.6 252.5L110.1 251.3L210.1 187.3L212.2 186.2L214.6 185.3L217.3 184.7L220.2 184.4L223.1 184.4L226 184.6L228.8 185.2L231.3 186L487.3 286L489.4 287L491.1 288.2L492.3 289.5L492.9 291L493 292.5L493 305.5L492.5 306.9L491.4 308.3L489.9 309.6L389.9 373.6L387.8 374.6L385.4 375.5L382.7 376.1L379.8 376.4L376.9 376.4L374 376.2L371.2 375.6L368.7 374.9L112.7 274.8L110.6 273.8L108.9 272.6L107.7 271.3L107.1 269.8L107 268.4Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M493 305.5L492.5 306.9L492.5 293.9L493 292.5ZM492.5 306.9L491.4 308.3L491.4 295.3L492.5 293.9ZM491.4 308.3L489.9 309.6L489.9 296.5L491.4 295.3ZM489.9 309.6L389.9 373.6L389.9 360.5L489.9 296.5ZM389.9 373.6L387.8 374.6L387.8 361.6L389.9 360.5ZM387.8 374.6L385.4 375.5L385.4 362.4L387.8 361.6Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M385.4 375.5L382.7 376.1L382.7 363L385.4 362.4ZM382.7 376.1L379.8 376.4L379.8 363.4L382.7 363ZM379.8 376.4L376.9 376.4L376.9 363.4L379.8 363.4Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M376.9 376.4L374 376.2L374 363.2L376.9 363.4ZM374 376.2L371.2 375.6L371.2 362.6L374 363.2Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M371.2 375.6L368.7 374.9L368.7 361.8L371.2 362.6ZM368.7 374.9L112.7 274.8L112.7 261.8L368.7 361.8ZM112.7 274.8L110.6 273.8L110.6 260.8L112.7 261.8ZM110.6 273.8L108.9 272.6L108.9 259.6L110.6 260.8ZM108.9 272.6L107.7 271.3L107.7 258.2L108.9 259.6ZM107.7 271.3L107.1 269.8L107.1 256.8L107.7 258.2ZM107.1 269.8L107 268.4L107 255.3L107.1 256.8Z\"/><path class=\"iso-top\" d=\"M487.3 286L489.4 287L491.1 288.2L492.3 289.5L492.9 291L493 292.5L492.5 293.9L491.4 295.3L489.9 296.5L389.9 360.5L387.8 361.6L385.4 362.4L382.7 363L379.8 363.4L376.9 363.4L374 363.2L371.2 362.6L368.7 361.8L112.7 261.8L110.6 260.8L108.9 259.6L107.7 258.2L107.1 256.8L107 255.3L107.5 253.9L108.6 252.5L110.1 251.3L210.1 187.3L212.2 186.2L214.6 185.3L217.3 184.7L220.2 184.4L223.1 184.4L226 184.6L228.8 185.2L231.3 186Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M493 292.5L492.5 293.9L491.4 295.3L489.9 296.5L389.9 360.5L387.8 361.6L385.4 362.4L382.7 363L379.8 363.4L376.9 363.4L374 363.2L371.2 362.6L368.7 361.8L112.7 261.8L110.6 260.8L108.9 259.6L107.7 258.2L107.1 256.8L107 255.3\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M493 292.5L490.2 293.6L489.3 294.7L487.9 295.8L388 359.7L386.3 360.7L384.2 361.4L382 361.9L379.5 362.2L377.1 362.2L374.6 362L372.3 361.5L370.1 360.8L114.3 260.9L112.4 260L111 259L110 257.9L109.4 256.7L107 255.3\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M493 297.7L492.5 299.1L491.4 300.5L489.9 301.7L389.9 365.7L387.8 366.8L385.4 367.7L382.7 368.3L379.8 368.6L376.9 368.6L374 368.4L371.2 367.8L368.7 367L112.7 267L110.6 266L108.9 264.8L107.7 263.5L107.1 262L107 260.5\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M107 255.3L107.5 253.9L108.6 252.5L110.1 251.3L210.1 187.3L212.2 186.2L214.6 185.3L217.3 184.7L220.2 184.4L223.1 184.4L226 184.6L228.8 185.2L231.3 186L487.3 286L489.4 287L491.1 288.2L492.3 289.5L492.9 291L493 292.5M493 305.5L492.5 306.9L491.4 308.3L489.9 309.6L389.9 373.6L387.8 374.6L385.4 375.5L382.7 376.1L379.8 376.4L376.9 376.4L374 376.2L371.2 375.6L368.7 374.9L112.7 274.8L110.6 273.8L108.9 272.6L107.7 271.3L107.1 269.8L107 268.4M493 292.5L493 305.5M107 255.3L107 268.4\"/></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M482.6 288.9L483.7 289.4L484.6 290L485.2 290.7L485.5 291.4L485.5 292.2L485.3 292.9L484.7 293.6L483.9 294.2L383.9 358.2L382.9 358.8L381.7 359.2L380.4 359.5L378.9 359.6L377.4 359.7L376 359.5L374.6 359.3L373.4 358.9L117.4 258.9L116.3 258.3L115.4 257.7L114.8 257.1L114.5 256.3L114.5 255.6L114.7 254.9L115.3 254.2L116.1 253.6L216.1 189.6L217.1 189L218.3 188.6L219.6 188.3L221.1 188.2L222.6 188.1L224 188.3L225.4 188.5L226.6 188.9Z\"/><path class=\"iso-line\" data-tone=\"lo\" d=\"M224.6 192.9L223.6 193.3L222.4 193.5L221.1 193.5L220 193.2L219.1 192.7L218.7 192.1L218.8 191.4L219.4 190.9L220.4 190.4L221.6 190.2L222.9 190.3L224 190.6L224.9 191.1L225.3 191.7L225.2 192.3ZM480.6 292.9L479.6 293.3L478.4 293.5L477.1 293.5L476 293.2L475.1 292.7L474.7 292.1L474.8 291.5L475.4 290.9L476.4 290.5L477.6 290.3L478.9 290.3L480.1 290.6L480.9 291.1L481.3 291.7L481.2 292.3ZM124.6 256.9L123.6 257.3L122.4 257.5L121.1 257.5L119.9 257.2L119.1 256.7L118.7 256.1L118.8 255.4L119.4 254.9L120.4 254.5L121.6 254.2L122.9 254.3L124 254.6L124.9 255.1L125.3 255.7L125.2 256.3ZM380.6 356.9L379.6 357.3L378.4 357.5L377.1 357.5L376 357.2L375.1 356.7L374.7 356.1L374.8 355.5L375.4 354.9L376.4 354.5L377.6 354.3L378.9 354.3L380 354.6L380.9 355.1L381.3 355.7L381.2 356.3Z\"/><g class=\"iso-dots\" data-tone=\"mid\"><circle cx=\"222\" cy=\"191.9\" r=\"0.5\"/><circle cx=\"478\" cy=\"291.9\" r=\"0.5\"/><circle cx=\"122\" cy=\"255.9\" r=\"0.5\"/><circle cx=\"378\" cy=\"355.9\" r=\"0.5\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M142.6 266.5L142.9 266.1L146.6 263.8L147.2 263.5L148 263.5L148.7 263.6L312.3 327.5L312.8 327.9L312.9 328.2L312.9 329L312.6 329.4L308.9 331.8L308.2 332L307.5 332L306.7 331.9L143.2 268L142.7 267.7L142.6 267.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M312.9 329L312.6 329.4L312.6 328.6L312.9 328.2ZM312.6 329.4L308.9 331.8L308.9 331L312.6 328.6ZM308.9 331.8L308.2 332L308.2 331.2L308.9 331Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M308.2 332L307.5 332L307.5 331.3L308.2 331.2Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M307.5 332L306.7 331.9L306.7 331.1L307.5 331.3Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M306.7 331.9L143.2 268L143.2 267.2L306.7 331.1ZM143.2 268L142.7 267.7L142.7 266.9L143.2 267.2ZM142.7 267.7L142.6 267.3L142.6 266.5L142.7 266.9Z\"/><path class=\"iso-top\" d=\"M312.3 327.5L312.8 327.9L312.9 328.2L312.6 328.6L308.9 331L308.2 331.2L307.5 331.3L306.7 331.1L143.2 267.2L142.7 266.9L142.6 266.5L142.9 266.1L146.6 263.8L147.2 263.5L148 263.5L148.7 263.6Z\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M142.6 266.5L142.9 266.1L146.6 263.8L147.2 263.5L148 263.5L148.7 263.6L312.3 327.5L312.8 327.9L312.9 328.2M312.9 329L312.6 329.4L308.9 331.8L308.2 332L307.5 332L306.7 331.9L143.2 268L142.7 267.7L142.6 267.3M312.9 328.2L312.9 329M142.6 266.5L142.6 267.3\"/></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M152.3 265L150.6 266.1M161.8 268.7L160.1 269.8M166.5 270.6L164.8 271.7M171.2 272.4L169.6 273.5M176 274.3L174.3 275.4M185.5 278L183.8 279.1M190.2 279.9L188.5 280.9M195 281.7L193.3 282.8M199.7 283.6L198 284.6M209.2 287.3L207.5 288.3M213.9 289.1L212.2 290.2M218.7 291L217 292M223.4 292.8L221.7 293.9M232.9 296.5L231.2 297.6M237.6 298.4L236 299.4M242.4 300.2L240.7 301.3M247.1 302.1L245.4 303.1M256.6 305.8L254.9 306.8M261.3 307.6L259.7 308.7M266.1 309.5L264.4 310.6M270.8 311.3L269.1 312.4M280.3 315L278.6 316.1M285 316.9L283.4 318M289.8 318.7L288.1 319.8M294.5 320.6L292.8 321.7M304 324.3L302.3 325.4M308.7 326.2L307.1 327.2\"/><path class=\"iso-line\" data-tone=\"mid\" d=\"M157 266.9L153.9 268.9M180.7 276.1L177.6 278.2M204.4 285.4L201.3 287.4M228.1 294.7L225 296.7M251.8 303.9L248.7 305.9M275.6 313.2L272.4 315.2M299.3 322.5L296.1 324.5\"/><g class=\"iso-dots\" data-tone=\"mid\"><circle cx=\"147.1\" cy=\"265.9\" r=\"0.45\"/><circle cx=\"308.3\" cy=\"328.9\" r=\"0.45\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M321.4 335.3L321.5 334.9L321.8 334.6L331.6 328.3L332.2 328.1L332.8 328L333.5 328L334.2 328.2L366.9 341L367.3 341.2L367.6 341.6L367.6 342.6L367.5 343L367.2 343.3L357.4 349.6L356.8 349.8L356.2 349.9L355.5 349.9L354.8 349.7L322.1 336.9L321.7 336.7L321.4 336.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M367.6 342.6L367.5 343L367.5 341.9L367.6 341.6ZM367.5 343L367.2 343.3L367.2 342.2L367.5 341.9ZM367.2 343.3L357.4 349.6L357.4 348.5L367.2 342.2ZM357.4 349.6L356.8 349.8L356.8 348.8L357.4 348.5Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M356.8 349.8L356.2 349.9L356.2 348.9L356.8 348.8Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M356.2 349.9L355.5 349.9L355.5 348.8L356.2 348.9ZM355.5 349.9L354.8 349.7L354.8 348.7L355.5 348.8Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M354.8 349.7L322.1 336.9L322.1 335.9L354.8 348.7ZM322.1 336.9L321.7 336.7L321.7 335.6L322.1 335.9ZM321.7 336.7L321.4 336.3L321.4 335.3L321.7 335.6Z\"/><path class=\"iso-top\" d=\"M366.9 341L367.3 341.2L367.6 341.6L367.5 341.9L367.2 342.2L357.4 348.5L356.8 348.8L356.2 348.9L355.5 348.8L354.8 348.7L322.1 335.9L321.7 335.6L321.4 335.3L321.5 334.9L321.8 334.6L331.6 328.3L332.2 328.1L332.8 328L333.5 328L334.2 328.2Z\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M321.4 335.3L321.5 334.9L321.8 334.6L331.6 328.3L332.2 328.1L332.8 328L333.5 328L334.2 328.2L366.9 341L367.3 341.2L367.6 341.6M367.6 342.6L367.5 343L367.2 343.3L357.4 349.6L356.8 349.8L356.2 349.9L355.5 349.9L354.8 349.7L322.1 336.9L321.7 336.7L321.4 336.3M367.6 341.6L367.6 342.6M321.4 335.3L321.4 336.3\"/></g><path class=\"iso-line\" data-tone=\"faint\" d=\"M364.9 341.7L355.8 347.5L324.1 335.1L333.2 329.3Z\"/><path class=\"iso-line\" data-tone=\"lo\" data-free=\"\" d=\"M333.8 331.9L355.1 340.2M331 333.6L345.2 339.2M328.2 335.4L346 342.4\"/><g class=\"iso-dots\" data-tone=\"mid\"><circle cx=\"361.1\" cy=\"342\" r=\"0.45\"/><circle cx=\"355.4\" cy=\"345.6\" r=\"0.45\"/></g><g class=\"ts-gate\"><g class=\"it\" data-name=\"cab.anchor.-1\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M221.3 209.7L221.5 209.3L228.7 204.7L229.3 204.5L230 204.6L235.7 206.9L236 207.2L236 209L235.8 209.3L228.6 213.9L228 214.1L227.3 214L221.6 211.8L221.3 211.5Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M236 209L235.8 209.3L235.8 207.5L236 207.2ZM235.8 209.3L228.6 213.9L228.6 212.1L235.8 207.5Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M228.6 213.9L228 214.1L228 212.3L228.6 212.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M228 214.1L227.3 214L227.3 212.2L228 212.3Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M227.3 214L221.6 211.8L221.6 210L227.3 212.2ZM221.6 211.8L221.3 211.5L221.3 209.7L221.6 210Z\"/><path class=\"iso-top\" d=\"M235.7 206.9L236 207.2L235.8 207.5L228.6 212.1L228 212.3L227.3 212.2L221.6 210L221.3 209.7L221.5 209.3L228.7 204.7L229.3 204.5L230 204.6Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M236 207.2L235.8 207.5L228.6 212.1L228 212.3L227.3 212.2L221.6 210L221.3 209.7\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M236 207.2L235.5 207.4L228.4 212L228 212.1L227.5 212.1L221.9 209.9L221.3 209.7\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M221.3 209.7L221.5 209.3L228.7 204.7L229.3 204.5L230 204.6L235.7 206.9L236 207.2M236 209L235.8 209.3L228.6 213.9L228 214.1L227.3 214L221.6 211.8L221.3 211.5M236 207.2L236 209M221.3 209.7L221.3 211.5\"/></g><g class=\"iso-dots\" data-tone=\"mid\"><circle cx=\"230.6\" cy=\"207.2\" r=\"0.4\"/><circle cx=\"226.7\" cy=\"209.7\" r=\"0.4\"/></g></g><g class=\"it\" data-name=\"cab.skirt\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M220.5 214.9L220.5 213.7L221.2 212.4L222.5 211.3L242.8 198.3L244.7 197.4L246.9 196.8L249.4 196.4L251.9 196.5L254.4 196.8L256.6 197.4L446.2 271.5L448 272.4L449.3 273.6L449.9 274.8L449.9 281.3L449.9 282.6L449.2 283.8L447.9 284.9L427.5 297.9L425.7 298.8L423.5 299.5L421 299.8L418.5 299.8L416 299.4L413.8 298.8L224.2 224.7L222.4 223.8L221.1 222.7L220.5 221.4Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M449.9 281.3L449.9 282.6L449.9 276.1L449.9 274.8ZM449.9 282.6L449.2 283.8L449.2 277.3L449.9 276.1ZM449.2 283.8L447.9 284.9L447.9 278.4L449.2 277.3ZM447.9 284.9L427.5 297.9L427.5 291.4L447.9 278.4ZM427.5 297.9L425.7 298.8L425.7 292.3L427.5 291.4Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M425.7 298.8L423.5 299.5L423.5 293L425.7 292.3ZM423.5 299.5L421 299.8L421 293.3L423.5 293Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M421 299.8L418.5 299.8L418.5 293.3L421 293.3ZM418.5 299.8L416 299.4L416 292.9L418.5 293.3Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M416 299.4L413.8 298.8L413.8 292.3L416 292.9ZM413.8 298.8L224.2 224.7L224.2 218.2L413.8 292.3ZM224.2 224.7L222.4 223.8L222.4 217.3L224.2 218.2ZM222.4 223.8L221.1 222.7L221.1 216.2L222.4 217.3ZM221.1 222.7L220.5 221.4L220.5 214.9L221.1 216.2Z\"/><path class=\"iso-top\" d=\"M446.2 271.5L448 272.4L449.3 273.6L449.9 274.8L449.9 276.1L449.2 277.3L447.9 278.4L427.5 291.4L425.7 292.3L423.5 293L421 293.3L418.5 293.3L416 292.9L413.8 292.3L224.2 218.2L222.4 217.3L221.1 216.2L220.5 214.9L220.5 213.7L221.2 212.4L222.5 211.3L242.8 198.3L244.7 197.4L246.9 196.8L249.4 196.4L251.9 196.5L254.4 196.8L256.6 197.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M449.9 274.8L449.9 276.1L449.2 277.3L447.9 278.4L427.5 291.4L425.7 292.3L423.5 293L421 293.3L418.5 293.3L416 292.9L413.8 292.3L224.2 218.2L222.4 217.3L221.1 216.2L220.5 214.9\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M220.5 214.9L220.5 213.7L221.2 212.4L222.5 211.3L242.8 198.3L244.7 197.4L246.9 196.8L249.4 196.4L251.9 196.5L254.4 196.8L256.6 197.4L446.2 271.5L448 272.4L449.3 273.6L449.9 274.8M449.9 281.3L449.9 282.6L449.2 283.8L447.9 284.9L427.5 297.9L425.7 298.8L423.5 299.5L421 299.8L418.5 299.8L416 299.4L413.8 298.8L224.2 224.7L222.4 223.8L221.1 222.7L220.5 221.4M449.9 274.8L449.9 281.3M220.5 214.9L220.5 221.4\"/></g></g><g class=\"it\" data-name=\"cab.ledge\"><g class=\"iso-dots\" data-tone=\"mid\"><circle cx=\"230.8\" cy=\"220.1\" r=\"0.4\"/><circle cx=\"266.3\" cy=\"234\" r=\"0.4\"/><circle cx=\"301.9\" cy=\"247.8\" r=\"0.4\"/><circle cx=\"361.2\" cy=\"271\" r=\"0.4\"/><circle cx=\"396.7\" cy=\"284.9\" r=\"0.4\"/></g></g><g class=\"it\" data-name=\"post.flange\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M317.5 266.9L317.6 266.2L318 265.6L318.5 265L319.2 264.5L320.1 264L321.1 263.6L322.2 263.3L323.5 263.1L324.7 262.9L326 262.9L327.3 263L328.6 263.1L329.8 263.4L330.8 263.8L331.8 264.2L332.6 264.7L333.2 265.3L333.7 265.9L334 266.5L334 267.2L334 269.8L333.9 270.4L333.5 271.1L333 271.6L332.3 272.2L331.4 272.7L330.4 273.1L329.2 273.4L328 273.6L326.8 273.7L325.5 273.8L324.2 273.7L322.9 273.5L321.7 273.3L320.7 272.9L319.7 272.5L318.9 271.9L318.2 271.4L317.8 270.8L317.5 270.1L317.5 269.5Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M332.3 272.2L331.4 272.7L331.4 270.1L332.3 269.6ZM331.4 272.7L330.4 273.1L330.4 270.5L331.4 270.1ZM334 269.8L333.9 270.4L333.9 267.8L334 267.2ZM333.9 270.4L333.5 271.1L333.5 268.4L333.9 267.8ZM333.5 271.1L333 271.6L333 269L333.5 268.4ZM333 271.6L332.3 272.2L332.3 269.6L333 269Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M330.4 273.1L329.2 273.4L329.2 270.8L330.4 270.5ZM329.2 273.4L328 273.6L328 271L329.2 270.8ZM328 273.6L326.8 273.7L326.8 271.1L328 271ZM326.8 273.7L325.5 273.8L325.5 271.2L326.8 271.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M325.5 273.8L324.2 273.7L324.2 271.1L325.5 271.2ZM324.2 273.7L322.9 273.5L322.9 270.9L324.2 271.1ZM322.9 273.5L321.7 273.3L321.7 270.6L322.9 270.9Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M321.7 273.3L320.7 272.9L320.7 270.3L321.7 270.6ZM320.7 272.9L319.7 272.5L319.7 269.9L320.7 270.3ZM319.7 272.5L318.9 271.9L318.9 269.3L319.7 269.9ZM318.9 271.9L318.2 271.4L318.2 268.8L318.9 269.3ZM318.2 271.4L317.8 270.8L317.8 268.2L318.2 268.8ZM317.8 270.8L317.5 270.1L317.5 267.5L317.8 268.2ZM317.5 270.1L317.5 269.5L317.5 266.9L317.5 267.5Z\"/><path class=\"iso-top\" d=\"M332.3 269.6L331.4 270.1L330.4 270.5L329.2 270.8L328 271L326.8 271.1L325.5 271.2L324.2 271.1L322.9 270.9L321.7 270.6L320.7 270.3L319.7 269.9L318.9 269.3L318.2 268.8L317.8 268.2L317.5 267.5L317.5 266.9L317.6 266.2L318 265.6L318.5 265L319.2 264.5L320.1 264L321.1 263.6L322.2 263.3L323.5 263.1L324.7 262.9L326 262.9L327.3 263L328.6 263.1L329.8 263.4L330.8 263.8L331.8 264.2L332.6 264.7L333.2 265.3L333.7 265.9L334 266.5L334 267.2L333.9 267.8L333.5 268.4L333 269Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M334 267.2L333.9 267.8L333.5 268.4L333 269L332.3 269.6L331.4 270.1L330.4 270.5L329.2 270.8L328 271L326.8 271.1L325.5 271.2L324.2 271.1L322.9 270.9L321.7 270.6L320.7 270.3L319.7 269.9L318.9 269.3L318.2 268.8L317.8 268.2L317.5 267.5L317.5 266.9\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M334 267.2L333.4 267.8L333.1 268.4L332.6 268.9L331.9 269.4L331.1 269.9L330.1 270.3L329 270.6L327.9 270.8L326.7 270.9L325.5 270.9L324.3 270.9L323.1 270.7L322 270.5L320.9 270.1L320 269.7L319.3 269.2L318.7 268.7L318.2 268.1L318 267.5L317.5 266.9\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M317.5 266.9L317.6 266.2L318 265.6L318.5 265L319.2 264.5L320.1 264L321.1 263.6L322.2 263.3L323.5 263.1L324.7 262.9L326 262.9L327.3 263L328.6 263.1L329.8 263.4L330.8 263.8L331.8 264.2L332.6 264.7L333.2 265.3L333.7 265.9L334 266.5L334 267.2M334 269.8L333.9 270.4L333.5 271.1L333 271.6L332.3 272.2L331.4 272.7L330.4 273.1L329.2 273.4L328 273.6L326.8 273.7L325.5 273.8L324.2 273.7L322.9 273.5L321.7 273.3L320.7 272.9L319.7 272.5L318.9 271.9L318.2 271.4L317.8 270.8L317.5 270.1L317.5 269.5M317.5 266.9L317.5 269.5M334 267.2L334 269.8\"/></g></g><g class=\"it\" data-name=\"post.bolts\"><g class=\"iso-dots\" data-tone=\"mid\"><circle cx=\"326.7\" cy=\"270.8\" r=\"0.4\"/><circle cx=\"318.3\" cy=\"267.5\" r=\"0.4\"/><circle cx=\"324.8\" cy=\"263.3\" r=\"0.4\"/><circle cx=\"333.2\" cy=\"266.6\" r=\"0.4\"/></g></g><g class=\"it\" data-name=\"cab.body\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M222.7 109.3L222.7 108.3L223.3 107.4L224.3 106.5L244.6 93.5L246 92.8L247.7 92.3L249.6 92.1L251.6 92.1L253.5 92.3L255.2 92.8L444.8 166.9L446.2 167.6L447.2 168.5L447.7 169.4L447.7 274.9L447.6 275.9L447.1 276.9L446.1 277.7L425.8 290.7L424.4 291.4L422.6 291.9L420.7 292.2L418.8 292.1L416.9 291.9L415.2 291.4L225.6 217.3L224.2 216.6L223.2 215.7L222.7 214.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M447.7 274.9L447.6 275.9L447.6 170.4L447.7 169.4ZM447.6 275.9L447.1 276.9L447.1 171.3L447.6 170.4ZM447.1 276.9L446.1 277.7L446.1 172.2L447.1 171.3ZM446.1 277.7L425.8 290.7L425.8 185.2L446.1 172.2ZM425.8 290.7L424.4 291.4L424.4 185.9L425.8 185.2Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M424.4 291.4L422.6 291.9L422.6 186.4L424.4 185.9ZM422.6 291.9L420.7 292.2L420.7 186.6L422.6 186.4Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M420.7 292.2L418.8 292.1L418.8 186.6L420.7 186.6ZM418.8 292.1L416.9 291.9L416.9 186.4L418.8 186.6Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M416.9 291.9L415.2 291.4L415.2 185.9L416.9 186.4ZM415.2 291.4L225.6 217.3L225.6 111.8L415.2 185.9ZM225.6 217.3L224.2 216.6L224.2 111.1L225.6 111.8ZM224.2 216.6L223.2 215.7L223.2 110.2L224.2 111.1ZM223.2 215.7L222.7 214.8L222.7 109.3L223.2 110.2Z\"/><path class=\"iso-top\" d=\"M444.8 166.9L446.2 167.6L447.2 168.5L447.7 169.4L447.6 170.4L447.1 171.3L446.1 172.2L425.8 185.2L424.4 185.9L422.6 186.4L420.7 186.6L418.8 186.6L416.9 186.4L415.2 185.9L225.6 111.8L224.2 111.1L223.2 110.2L222.7 109.3L222.7 108.3L223.3 107.4L224.3 106.5L244.6 93.5L246 92.8L247.7 92.3L249.6 92.1L251.6 92.1L253.5 92.3L255.2 92.8Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M447.7 169.4L447.6 170.4L447.1 171.3L446.1 172.2L425.8 185.2L424.4 185.9L422.6 186.4L420.7 186.6L418.8 186.6L416.9 186.4L415.2 185.9L225.6 111.8L224.2 111.1L223.2 110.2L222.7 109.3\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M222.7 109.3L222.7 108.3L223.3 107.4L224.3 106.5L244.6 93.5L246 92.8L247.7 92.3L249.6 92.1L251.6 92.1L253.5 92.3L255.2 92.8L444.8 166.9L446.2 167.6L447.2 168.5L447.7 169.4M447.7 274.9L447.6 275.9L447.1 276.9L446.1 277.7L425.8 290.7L424.4 291.4L422.6 291.9L420.7 292.2L418.8 292.1L416.9 291.9L415.2 291.4L225.6 217.3L224.2 216.6L223.2 215.7L222.7 214.8M447.7 169.4L447.7 274.9M222.7 109.3L222.7 214.8\"/></g></g><g class=\"it\" data-name=\"cab.kick\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M228.6 208.7L228.6 208.6L228.8 208.4L229.1 208.4L229.5 208.4L411.3 279.4L411.5 279.6L411.5 288.7L411.4 288.9L411.2 289L410.9 289.1L410.5 289L228.7 218L228.6 217.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M411.5 288.7L411.4 288.9L411.4 279.8L411.5 279.6ZM411.4 288.9L411.2 289L411.2 279.9L411.4 279.8Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M411.2 289L410.9 289.1L410.9 280L411.2 279.9Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M410.9 289.1L410.5 289L410.5 279.9L410.9 280Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M410.5 289L228.7 218L228.7 208.9L410.5 279.9ZM228.7 218L228.6 217.9L228.6 208.7L228.7 208.9Z\"/><path class=\"iso-top\" d=\"M411.3 279.4L411.5 279.6L411.4 279.8L411.2 279.9L410.9 280L410.5 279.9L228.7 208.9L228.6 208.7L228.6 208.6L228.8 208.4L229.1 208.4L229.5 208.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M411.5 279.6L411.4 279.8L411.2 279.9L410.9 280L410.5 279.9L228.7 208.9L228.6 208.7\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M228.6 208.7L228.6 208.6L228.8 208.4L229.1 208.4L229.5 208.4L411.3 279.4L411.5 279.6M411.5 288.7L411.4 288.9L411.2 289L410.9 289.1L410.5 289L228.7 218L228.6 217.9M411.5 279.6L411.5 288.7M228.6 208.7L228.6 217.9\"/></g><g class=\"iso-dots\" data-tone=\"mid\"><circle cx=\"236.6\" cy=\"216.6\" r=\"0.4\"/><circle cx=\"272.2\" cy=\"230.5\" r=\"0.4\"/><circle cx=\"307.7\" cy=\"244.4\" r=\"0.4\"/><circle cx=\"355.1\" cy=\"262.9\" r=\"0.4\"/><circle cx=\"390.7\" cy=\"276.8\" r=\"0.4\"/></g></g><g class=\"it\" data-name=\"cab.faces\"><path class=\"iso-line\" data-tone=\"lo\" d=\"M227.9 199.4L233.8 201.7L233.8 195.2L227.9 192.9ZM236.9 202.9L242.8 205.2L242.8 198.7L236.9 196.4ZM245.9 206.4L251.8 208.7L251.8 202.2L245.9 199.9ZM254.9 209.9L260.8 212.2L260.8 205.7L254.9 203.4ZM263.9 213.4L269.8 215.8L269.8 209.2L263.9 206.9ZM272.9 217L278.8 219.3L278.8 212.8L272.9 210.5Z\"/><path class=\"iso-line\" data-tone=\"lo\" d=\"M279.1 148.4L279 147.4L278.6 146.5L278 145.6L277.3 144.9L276.5 144.5L275.7 144.3L274.9 144.4L274.4 144.9L274 145.5L273.9 146.3L274 147.3L274.4 148.2L274.9 149.1L275.7 149.8L276.5 150.2L277.3 150.4L278 150.3L278.6 149.9L279 149.2ZM390.5 191.9L390.4 191L390 190L389.4 189.2L388.7 188.5L387.9 188L387.1 187.8L386.4 188L385.8 188.4L385.4 189L385.3 189.9L385.4 190.8L385.8 191.7L386.4 192.6L387.1 193.3L387.9 193.8L388.7 193.9L389.4 193.8L390 193.4L390.4 192.7Z\"/><path class=\"iso-line\" data-tone=\"mid\" d=\"M276.5 148.9L276.5 145.8M387.9 192.4L387.9 189.3\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M445.2 256.1L426.7 268L426.7 195.1L445.2 183.2Z\"/><path class=\"iso-line\" data-tone=\"lo\" d=\"M434.1 200.8L434.2 199.9L434.5 199L434.9 198.2L435.4 197.5L436 197L436.6 196.7L437.1 196.8L437.5 197.1L437.8 197.6L437.9 198.4L437.8 199.2L437.5 200.1L437.1 201L436.6 201.7L436 202.2L435.4 202.4L434.9 202.4L434.5 202.1L434.2 201.5Z\"/><g class=\"iso-dots\" data-tone=\"mid\"><circle cx=\"436\" cy=\"199.6\" r=\"0.5\"/></g><text class=\"iso-face-text\" data-tone=\"lo\" transform=\"matrix(0.926 -0.593 0 1.303 428.775 273.884)\" font-size=\"2.8\" text-anchor=\"start\">spawnpoint</text></g><g class=\"it\" data-name=\"post.bracket.16\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M328 237.8L328.1 237.6L330.2 236.3L330.5 236.2L330.8 236.3L333.6 237.4L333.8 237.5L333.8 245.4L333.7 245.5L331.6 246.9L331.3 246.9L331 246.9L328.2 245.8L328 245.6Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M333.8 245.4L333.7 245.5L333.7 237.7L333.8 237.5ZM333.7 245.5L331.6 246.9L331.6 239L333.7 237.7Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M331.6 246.9L331.3 246.9L331.3 239.1L331.6 239Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M331.3 246.9L331 246.9L331 239.1L331.3 239.1Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M331 246.9L328.2 245.8L328.2 238L331 239.1ZM328.2 245.8L328 245.6L328 237.8L328.2 238Z\"/><path class=\"iso-top\" d=\"M333.6 237.4L333.8 237.5L333.7 237.7L331.6 239L331.3 239.1L331 239.1L328.2 238L328 237.8L328.1 237.6L330.2 236.3L330.5 236.2L330.8 236.3Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M333.8 237.5L333.7 237.7L331.6 239L331.3 239.1L331 239.1L328.2 238L328 237.8\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M328 237.8L328.1 237.6L330.2 236.3L330.5 236.2L330.8 236.3L333.6 237.4L333.8 237.5M333.8 245.4L333.7 245.5L331.6 246.9L331.3 246.9L331 246.9L328.2 245.8L328 245.6M333.8 237.5L333.8 245.4M328 237.8L328 245.6\"/></g></g><g class=\"it\" data-name=\"post.shaft.low\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M319 235.6L319.1 235.1L319.4 234.6L319.8 234.1L320.4 233.7L321.1 233.3L322 233L322.9 232.7L323.9 232.5L324.9 232.4L326 232.4L327 232.4L328.1 232.6L329 232.8L329.9 233.1L330.7 233.5L331.4 233.9L331.9 234.3L332.2 234.8L332.5 235.4L332.5 235.9L332.5 267.1L332.4 267.7L332.1 268.2L331.7 268.7L331.1 269.1L330.4 269.5L329.5 269.8L328.6 270.1L327.6 270.3L326.6 270.4L325.5 270.4L324.5 270.4L323.4 270.2L322.5 270L321.6 269.7L320.8 269.3L320.1 268.9L319.6 268.5L319.2 268L319 267.4L319 266.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M331.1 269.1L330.4 269.5L330.4 238.2L331.1 237.9ZM330.4 269.5L329.5 269.8L329.5 238.6L330.4 238.2ZM332.5 267.1L332.4 267.7L332.4 236.4L332.5 235.9ZM332.4 267.7L332.1 268.2L332.1 236.9L332.4 236.4ZM332.1 268.2L331.7 268.7L331.7 237.4L332.1 236.9ZM331.7 268.7L331.1 269.1L331.1 237.9L331.7 237.4Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M329.5 269.8L328.6 270.1L328.6 238.8L329.5 238.6ZM328.6 270.1L327.6 270.3L327.6 239L328.6 238.8ZM327.6 270.3L326.6 270.4L326.6 239.1L327.6 239ZM326.6 270.4L325.5 270.4L325.5 239.1L326.6 239.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M325.5 270.4L324.5 270.4L324.5 239.1L325.5 239.1ZM324.5 270.4L323.4 270.2L323.4 238.9L324.5 239.1ZM323.4 270.2L322.5 270L322.5 238.7L323.4 238.9Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M322.5 270L321.6 269.7L321.6 238.4L322.5 238.7ZM321.6 269.7L320.8 269.3L320.8 238.1L321.6 238.4ZM320.8 269.3L320.1 268.9L320.1 237.7L320.8 238.1ZM320.1 268.9L319.6 268.5L319.6 237.2L320.1 237.7ZM319.6 268.5L319.2 268L319.2 236.7L319.6 237.2ZM319.2 268L319 267.4L319 236.2L319.2 236.7ZM319 267.4L319 266.9L319 235.6L319 236.2Z\"/><path class=\"iso-top\" d=\"M331.1 237.9L330.4 238.2L329.5 238.6L328.6 238.8L327.6 239L326.6 239.1L325.5 239.1L324.5 239.1L323.4 238.9L322.5 238.7L321.6 238.4L320.8 238.1L320.1 237.7L319.6 237.2L319.2 236.7L319 236.2L319 235.6L319.1 235.1L319.4 234.6L319.8 234.1L320.4 233.7L321.1 233.3L322 233L322.9 232.7L323.9 232.5L324.9 232.4L326 232.4L327 232.4L328.1 232.6L329 232.8L329.9 233.1L330.7 233.5L331.4 233.9L331.9 234.3L332.2 234.8L332.5 235.4L332.5 235.9L332.4 236.4L332.1 236.9L331.7 237.4Z\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M332.5 254L332.4 254.5L332.2 255L331.8 255.5L331.2 256L330.5 256.4L329.7 256.7L328.8 257L327.8 257.2L326.8 257.3L325.7 257.4L324.7 257.3L323.7 257.2L322.7 257L321.8 256.7L321 256.4L320.3 256L319.7 255.5L319.3 255L319.1 254.5L319 254\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M319 235.6L319.1 235.1L319.4 234.6L319.8 234.1L320.4 233.7L321.1 233.3L322 233L322.9 232.7L323.9 232.5L324.9 232.4L326 232.4L327 232.4L328.1 232.6L329 232.8L329.9 233.1L330.7 233.5L331.4 233.9L331.9 234.3L332.2 234.8L332.5 235.4L332.5 235.9M332.5 267.1L332.4 267.7L332.1 268.2L331.7 268.7L331.1 269.1L330.4 269.5L329.5 269.8L328.6 270.1L327.6 270.3L326.6 270.4L325.5 270.4L324.5 270.4L323.4 270.2L322.5 270L321.6 269.7L320.8 269.3L320.1 268.9L319.6 268.5L319.2 268L319 267.4L319 266.9M319 235.6L319 266.9M332.5 235.9L332.5 267.1\"/></g></g><g class=\"it\" data-name=\"post.collar.low\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M316.7 230.4L316.9 229.7L317.3 229L317.9 228.4L318.6 227.8L319.6 227.3L320.7 226.8L321.9 226.5L323.3 226.2L324.6 226.1L326.1 226L327.5 226.1L328.8 226.3L330.1 226.6L331.3 227L332.3 227.5L333.2 228L333.9 228.6L334.4 229.3L334.7 230L334.8 230.7L334.8 235.9L334.6 236.6L334.2 237.3L333.6 238L332.9 238.5L331.9 239.1L330.8 239.5L329.6 239.9L328.2 240.1L326.8 240.2L325.4 240.3L324 240.2L322.7 240L321.4 239.7L320.2 239.3L319.1 238.8L318.3 238.3L317.6 237.7L317.1 237L316.8 236.3L316.7 235.6Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M332.9 238.5L331.9 239.1L331.9 233.9L332.9 233.3ZM331.9 239.1L330.8 239.5L330.8 234.3L331.9 233.9ZM334.8 235.9L334.6 236.6L334.6 231.4L334.8 230.7ZM334.6 236.6L334.2 237.3L334.2 232.1L334.6 231.4ZM334.2 237.3L333.6 238L333.6 232.7L334.2 232.1ZM333.6 238L332.9 238.5L332.9 233.3L333.6 232.7Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M330.8 239.5L329.6 239.9L329.6 234.6L330.8 234.3ZM329.6 239.9L328.2 240.1L328.2 234.9L329.6 234.6ZM328.2 240.1L326.8 240.2L326.8 235L328.2 234.9ZM326.8 240.2L325.4 240.3L325.4 235.1L326.8 235Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M325.4 240.3L324 240.2L324 235L325.4 235.1ZM324 240.2L322.7 240L322.7 234.8L324 235ZM322.7 240L321.4 239.7L321.4 234.5L322.7 234.8Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M321.4 239.7L320.2 239.3L320.2 234.1L321.4 234.5ZM320.2 239.3L319.1 238.8L319.1 233.6L320.2 234.1ZM319.1 238.8L318.3 238.3L318.3 233.1L319.1 233.6ZM318.3 238.3L317.6 237.7L317.6 232.5L318.3 233.1ZM317.6 237.7L317.1 237L317.1 231.8L317.6 232.5ZM317.1 237L316.8 236.3L316.8 231.1L317.1 231.8ZM316.8 236.3L316.7 235.6L316.7 230.4L316.8 231.1Z\"/><path class=\"iso-top\" d=\"M332.9 233.3L331.9 233.9L330.8 234.3L329.6 234.6L328.2 234.9L326.8 235L325.4 235.1L324 235L322.7 234.8L321.4 234.5L320.2 234.1L319.1 233.6L318.3 233.1L317.6 232.5L317.1 231.8L316.8 231.1L316.7 230.4L316.9 229.7L317.3 229L317.9 228.4L318.6 227.8L319.6 227.3L320.7 226.8L321.9 226.5L323.3 226.2L324.6 226.1L326.1 226L327.5 226.1L328.8 226.3L330.1 226.6L331.3 227L332.3 227.5L333.2 228L333.9 228.6L334.4 229.3L334.7 230L334.8 230.7L334.6 231.4L334.2 232.1L333.6 232.7Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M334.8 230.7L334.6 231.4L334.2 232.1L333.6 232.7L332.9 233.3L331.9 233.9L330.8 234.3L329.6 234.6L328.2 234.9L326.8 235L325.4 235.1L324 235L322.7 234.8L321.4 234.5L320.2 234.1L319.1 233.6L318.3 233.1L317.6 232.5L317.1 231.8L316.8 231.1L316.7 230.4\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M334.8 230.7L334.2 231.4L333.8 232L333.2 232.6L332.5 233.2L331.6 233.7L330.5 234.1L329.4 234.4L328.1 234.7L326.8 234.8L325.4 234.8L324.1 234.8L322.8 234.6L321.6 234.3L320.5 233.9L319.5 233.5L318.6 233L318 232.4L317.5 231.7L317.2 231.1L316.7 230.4\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M316.7 230.4L316.9 229.7L317.3 229L317.9 228.4L318.6 227.8L319.6 227.3L320.7 226.8L321.9 226.5L323.3 226.2L324.6 226.1L326.1 226L327.5 226.1L328.8 226.3L330.1 226.6L331.3 227L332.3 227.5L333.2 228L333.9 228.6L334.4 229.3L334.7 230L334.8 230.7M334.8 235.9L334.6 236.6L334.2 237.3L333.6 238L332.9 238.5L331.9 239.1L330.8 239.5L329.6 239.9L328.2 240.1L326.8 240.2L325.4 240.3L324 240.2L322.7 240L321.4 239.7L320.2 239.3L319.1 238.8L318.3 238.3L317.6 237.7L317.1 237L316.8 236.3L316.7 235.6M316.7 230.4L316.7 235.6M334.8 230.7L334.8 235.9\"/></g></g><g class=\"it\" data-name=\"lane.mat\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M176.1 257.4L177 256.3L212.2 233.8L214 233.1L216.4 232.9L218.5 233.4L401 304.7L402.5 305.6L402.7 306.8L402.7 307.8L401.8 308.9L366.6 331.4L364.8 332.1L362.4 332.3L360.3 331.8L177.8 260.5L176.4 259.6L176.1 258.4Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M402.7 307.8L401.8 308.9L401.8 307.9L402.7 306.8ZM401.8 308.9L366.6 331.4L366.6 330.4L401.8 307.9ZM366.6 331.4L364.8 332.1L364.8 331.1L366.6 330.4Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M364.8 332.1L362.4 332.3L362.4 331.2L364.8 331.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M362.4 332.3L360.3 331.8L360.3 330.8L362.4 331.2Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M360.3 331.8L177.8 260.5L177.8 259.5L360.3 330.8ZM177.8 260.5L176.4 259.6L176.4 258.5L177.8 259.5ZM176.4 259.6L176.1 258.4L176.1 257.4L176.4 258.5Z\"/><path class=\"iso-top\" d=\"M401 304.7L402.5 305.6L402.7 306.8L401.8 307.9L366.6 330.4L364.8 331.1L362.4 331.2L360.3 330.8L177.8 259.5L176.4 258.5L176.1 257.4L177 256.3L212.2 233.8L214 233.1L216.4 232.9L218.5 233.4Z\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M176.1 257.4L177 256.3L212.2 233.8L214 233.1L216.4 232.9L218.5 233.4L401 304.7L402.5 305.6L402.7 306.8M402.7 307.8L401.8 308.9L366.6 331.4L364.8 332.1L362.4 332.3L360.3 331.8L177.8 260.5L176.4 259.6L176.1 258.4M402.7 306.8L402.7 307.8M176.1 257.4L176.1 258.4\"/></g><path class=\"iso-line\" data-tone=\"faint\" d=\"M387.8 306.2L388.1 306.4L388.2 306.7L388 306.9L388 306.9L387.6 307.1L387 307.1L386.5 307L217.5 241L217.2 240.8L217.1 240.5L217.3 240.3L217.3 240.3L217.7 240.1L218.3 240.1L218.8 240.2ZM380.2 311.1L380.5 311.3L380.6 311.5L380.4 311.8L380.4 311.8L380 312L379.4 312L378.9 311.9L209.9 245.9L209.6 245.6L209.5 245.4L209.7 245.1L209.7 245.1L210.1 245L210.7 244.9L211.2 245ZM372.6 315.9L372.9 316.1L373 316.4L372.8 316.7L372.8 316.7L372.4 316.8L371.8 316.9L371.3 316.7L202.3 250.7L202 250.5L201.9 250.2L202.1 250L202.1 250L202.6 249.8L203.1 249.8L203.6 249.9ZM365 320.8L365.4 321L365.4 321.3L365.2 321.5L365.2 321.5L364.8 321.7L364.2 321.7L363.7 321.6L194.7 255.6L194.4 255.4L194.3 255.1L194.5 254.8L194.5 254.8L195 254.7L195.5 254.6L196 254.8Z\"/><path class=\"iso-line\" data-tone=\"lo\" d=\"M206.7 259.3L213.4 264.8L201.1 262.9L206.7 262.2ZM220.9 264.9L227.6 270.3L215.3 268.4L220.9 267.7ZM325.2 305.6L331.9 311.1L319.6 309.2L325.3 308.5ZM339.4 311.2L346.1 316.6L333.9 314.7L339.5 314Z\"/></g><g class=\"it\" data-name=\"lane.ramp\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M273.1 296.7L275.4 294.7L316.2 268.7L322.3 271.1L324.7 274.9L284 300.9Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M324.7 274.9L322.3 271.1L281.6 297.2L284 300.9Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M273.1 296.7L284 300.9L281.6 297.2L275.4 294.7Z\"/><path class=\"iso-top\" d=\"M322.3 271.1L316.2 268.7L275.4 294.7L281.6 297.2Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M284 300.9L281.6 297.2M322.3 271.1L281.6 297.2M281.6 297.2L275.4 294.7\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M318 269.4L277.2 295.4M320.6 270.4L279.8 296.5\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M273.1 296.7L275.4 294.7L316.2 268.7L322.3 271.1L324.7 274.9L284 300.9Z\"/></g></g><g class=\"it\" data-name=\"cab.top\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M220.5 102.9L220.5 101.6L221.2 100.4L222.5 99.3L242.8 86.3L244.7 85.4L246.9 84.7L249.4 84.4L251.9 84.4L254.4 84.8L256.6 85.4L446.2 159.5L448 160.4L449.3 161.5L449.9 162.8L449.9 169.3L449.9 170.6L449.2 171.8L447.9 172.9L427.5 185.9L425.7 186.8L423.5 187.4L421 187.8L418.5 187.8L416 187.4L413.8 186.8L224.2 112.7L222.4 111.8L221.1 110.7L220.5 109.4Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M449.9 169.3L449.9 170.6L449.9 164L449.9 162.8ZM449.9 170.6L449.2 171.8L449.2 165.3L449.9 164ZM449.2 171.8L447.9 172.9L447.9 166.4L449.2 165.3ZM447.9 172.9L427.5 185.9L427.5 179.4L447.9 166.4ZM427.5 185.9L425.7 186.8L425.7 180.3L427.5 179.4Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M425.7 186.8L423.5 187.4L423.5 180.9L425.7 180.3ZM423.5 187.4L421 187.8L421 181.2L423.5 180.9Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M421 187.8L418.5 187.8L418.5 181.2L421 181.2ZM418.5 187.8L416 187.4L416 180.9L418.5 181.2Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M416 187.4L413.8 186.8L413.8 180.2L416 180.9ZM413.8 186.8L224.2 112.7L224.2 106.2L413.8 180.2ZM224.2 112.7L222.4 111.8L222.4 105.3L224.2 106.2ZM222.4 111.8L221.1 110.7L221.1 104.1L222.4 105.3ZM221.1 110.7L220.5 109.4L220.5 102.9L221.1 104.1Z\"/><path class=\"iso-top\" d=\"M446.2 159.5L448 160.4L449.3 161.5L449.9 162.8L449.9 164L449.2 165.3L447.9 166.4L427.5 179.4L425.7 180.3L423.5 180.9L421 181.2L418.5 181.2L416 180.9L413.8 180.2L224.2 106.2L222.4 105.3L221.1 104.1L220.5 102.9L220.5 101.6L221.2 100.4L222.5 99.3L242.8 86.3L244.7 85.4L246.9 84.7L249.4 84.4L251.9 84.4L254.4 84.8L256.6 85.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M449.9 162.8L449.9 164L449.2 165.3L447.9 166.4L427.5 179.4L425.7 180.3L423.5 180.9L421 181.2L418.5 181.2L416 180.9L413.8 180.2L224.2 106.2L222.4 105.3L221.1 104.1L220.5 102.9\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M449.9 162.8L448.7 164L448.1 165L446.9 166L426.6 179L425 179.8L423 180.4L420.9 180.7L418.6 180.6L416.5 180.3L414.5 179.8L225 105.7L223.3 104.9L222.2 103.9L220.5 102.9\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M220.5 102.9L220.5 101.6L221.2 100.4L222.5 99.3L242.8 86.3L244.7 85.4L246.9 84.7L249.4 84.4L251.9 84.4L254.4 84.8L256.6 85.4L446.2 159.5L448 160.4L449.3 161.5L449.9 162.8M449.9 169.3L449.9 170.6L449.2 171.8L447.9 172.9L427.5 185.9L425.7 186.8L423.5 187.4L421 187.8L418.5 187.8L416 187.4L413.8 186.8L224.2 112.7L222.4 111.8L221.1 110.7L220.5 109.4M449.9 162.8L449.9 169.3M220.5 102.9L220.5 109.4\"/></g><path class=\"iso-line\" data-tone=\"faint\" d=\"M442.5 161.9L443.2 162.2L443.7 162.7L443.9 163.1L443.9 163.6L443.7 164.1L443.2 164.5L422.8 177.6L422.1 177.9L421.2 178.1L420.3 178.3L419.3 178.3L418.4 178.1L417.5 177.9L227.9 103.8L227.2 103.4L226.7 103L226.4 102.5L226.5 102.1L226.7 101.6L227.2 101.2L247.6 88.1L248.3 87.8L249.1 87.5L250.1 87.4L251.1 87.4L252 87.5L252.9 87.8Z\"/></g><g class=\"it\" data-name=\"head.body\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M226.4 69.7L226.5 68.8L227.3 68L245.8 56.2L247.1 55.6L248.8 55.3L250.6 55.4L252.1 55.8L299.6 74.3L300.7 75L301.3 75.8L301.3 107.1L301.1 107.9L300.3 108.7L281.8 120.6L280.5 121.1L278.8 121.4L277.1 121.4L275.5 121L228.1 102.4L226.9 101.8L226.4 100.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M301.3 107.1L301.1 107.9L301.1 76.7L301.3 75.8ZM301.1 107.9L300.3 108.7L300.3 77.5L301.1 76.7ZM300.3 108.7L281.8 120.6L281.8 89.3L300.3 77.5ZM281.8 120.6L280.5 121.1L280.5 89.9L281.8 89.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M280.5 121.1L278.8 121.4L278.8 90.2L280.5 89.9Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M278.8 121.4L277.1 121.4L277.1 90.1L278.8 90.2ZM277.1 121.4L275.5 121L275.5 89.7L277.1 90.1Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M275.5 121L228.1 102.4L228.1 71.2L275.5 89.7ZM228.1 102.4L226.9 101.8L226.9 70.5L228.1 71.2ZM226.9 101.8L226.4 100.9L226.4 69.7L226.9 70.5Z\"/><path class=\"iso-top\" d=\"M299.6 74.3L300.7 75L301.3 75.8L301.1 76.7L300.3 77.5L281.8 89.3L280.5 89.9L278.8 90.2L277.1 90.1L275.5 89.7L228.1 71.2L226.9 70.5L226.4 69.7L226.5 68.8L227.3 68L245.8 56.2L247.1 55.6L248.8 55.3L250.6 55.4L252.1 55.8Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M301.3 75.8L301.1 76.7L300.3 77.5L281.8 89.3L280.5 89.9L278.8 90.2L277.1 90.1L275.5 89.7L228.1 71.2L226.9 70.5L226.4 69.7\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M301.3 75.8L300 76.5L299.3 77.1L280.9 88.9L279.9 89.4L278.7 89.6L277.4 89.5L276.1 89.2L228.9 70.7L228 70.2L226.4 69.7\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M226.4 69.7L226.5 68.8L227.3 68L245.8 56.2L247.1 55.6L248.8 55.3L250.6 55.4L252.1 55.8L299.6 74.3L300.7 75L301.3 75.8M301.3 107.1L301.1 107.9L300.3 108.7L281.8 120.6L280.5 121.1L278.8 121.4L277.1 121.4L275.5 121L228.1 102.4L226.9 101.8L226.4 100.9M301.3 75.8L301.3 107.1M226.4 69.7L226.4 100.9\"/></g><path class=\"ts-slot\" d=\"M280.7 77.8L281.2 78.1L281.3 78.5L281 78.9L280.8 79L280.2 79.2L279.4 79.3L278.7 79.1L252.6 68.9L252.1 68.6L252 68.2L252.3 67.9L252.5 67.7L253.1 67.5L253.9 67.5L254.6 67.6Z\"/><path class=\"iso-line\" data-tone=\"lo\" d=\"M280.7 77.8L281.2 78.1L281.3 78.5L281 78.9L280.8 79L280.2 79.2L279.4 79.3L278.7 79.1L252.6 68.9L252.1 68.6L252 68.2L252.3 67.9L252.5 67.7L253.1 67.5L253.9 67.5L254.6 67.6Z\"/><path class=\"ts-glow\" data-part=\"glow\" d=\"M284.6 75.3L286.6 76.5L287.5 77.9L287.3 79.4L285.9 80.8L285.8 80.9L283.4 81.9L280.5 82.4L277.5 82.3L274.8 81.6L248.7 71.4L246.7 70.3L245.8 68.8L246 67.3L247.4 65.9L247.5 65.8L249.9 64.8L252.7 64.3L255.8 64.4L258.5 65.1Z\"/><path class=\"iso-line ts-lamp\" data-part=\"lamp\" data-tone=\"lo\" d=\"M283.1 76.3L284.5 77.1L285.2 78.1L285 79.1L284 80.1L283.9 80.2L282.3 80.9L280.3 81.2L278.1 81.1L276.3 80.7L250.2 70.5L248.8 69.7L248.1 68.7L248.3 67.6L249.2 66.7L249.4 66.5L251 65.9L253 65.5L255.1 65.6L257 66.1Z\"/><g class=\"iso-dots\" data-tone=\"lo\"><circle cx=\"282.8\" cy=\"71.6\" r=\"0.45\"/><circle cx=\"285.9\" cy=\"72.8\" r=\"0.45\"/><circle cx=\"289\" cy=\"74\" r=\"0.45\"/><circle cx=\"292.1\" cy=\"75.2\" r=\"0.45\"/><circle cx=\"280.4\" cy=\"73.1\" r=\"0.45\"/><circle cx=\"283.5\" cy=\"74.3\" r=\"0.45\"/><circle cx=\"286.6\" cy=\"75.5\" r=\"0.45\"/><circle cx=\"289.7\" cy=\"76.7\" r=\"0.45\"/></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M251 58.6L250.2 58.9L249.2 58.9L248.3 58.7L247.7 58.3L247.5 57.8L247.9 57.4L248.7 57.1L249.7 57L250.7 57.2L251.3 57.6L251.4 58.1ZM233.2 70L232.4 70.3L231.4 70.3L230.5 70.1L229.9 69.7L229.8 69.2L230.2 68.7L231 68.4L232 68.4L232.9 68.6L233.5 69L233.6 69.5ZM279.7 88.1L278.9 88.4L277.9 88.5L277 88.3L276.3 87.9L276.2 87.4L276.6 86.9L277.4 86.6L278.4 86.5L279.4 86.7L280 87.1L280.1 87.6Z\"/><g class=\"iso-dots\" data-tone=\"mid\"><circle cx=\"249.5\" cy=\"58\" r=\"0.4\"/><circle cx=\"231.7\" cy=\"69.3\" r=\"0.4\"/><circle cx=\"278.2\" cy=\"87.5\" r=\"0.4\"/></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M297.6 98.8L295.2 100.3L295.2 87.3L297.6 85.8ZM293.4 101.5L290.9 103.1L290.9 90L293.4 88.5ZM289.1 104.3L286.7 105.8L286.7 92.8L289.1 91.2Z\"/><g transform=\"matrix(1.185 0.463 0.000 1.303 224.47 69.82)\"><path class=\"ts-bezel\" d=\"M42.2 1.6L43.04 1.77L43.76 2.24L44.23 2.96L44.4 3.8L44.4 18.2L44.23 19.04L43.76 19.76L43.04 20.23L42.2 20.4L3.8 20.4L2.96 20.23L2.24 19.76L1.77 19.04L1.6 18.2L1.6 3.8L1.77 2.96L2.24 2.24L2.96 1.77L3.8 1.6Z\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M42.2 1.6L43.04 1.77L43.76 2.24L44.23 2.96L44.4 3.8L44.4 18.2L44.23 19.04L43.76 19.76L43.04 20.23L42.2 20.4L3.8 20.4L2.96 20.23L2.24 19.76L1.77 19.04L1.6 18.2L1.6 3.8L1.77 2.96L2.24 2.24L2.96 1.77L3.8 1.6Z\"/><clipPath id=\"ts-screen-clip\"><path d=\"M41.8 3L42.26 3.09L42.65 3.35L42.91 3.74L43 4.2L43 17.8L42.91 18.26L42.65 18.65L42.26 18.91L41.8 19L4.2 19L3.74 18.91L3.35 18.65L3.09 18.26L3 17.8L3 4.2L3.09 3.74L3.35 3.35L3.74 3.09L4.2 3Z\"/></clipPath><path class=\"ts-glass\" d=\"M41.8 3L42.26 3.09L42.65 3.35L42.91 3.74L43 4.2L43 17.8L42.91 18.26L42.65 18.65L42.26 18.91L41.8 19L4.2 19L3.74 18.91L3.35 18.65L3.09 18.26L3 17.8L3 4.2L3.09 3.74L3.35 3.35L3.74 3.09L4.2 3Z\"/><g clip-path=\"url(#ts-screen-clip)\" data-part=\"screen\"><text class=\"ts-text\" data-line=\"0\" data-tone=\"mid\" x=\"6\" y=\"7.3\" font-size=\"2.9\">PRIVATE</text><text class=\"ts-text\" data-line=\"1\" data-tone=\"hi\" x=\"6\" y=\"12.4\" font-size=\"4\"></text><text class=\"ts-text\" data-line=\"2\" data-tone=\"hi\" x=\"6\" y=\"17\" font-size=\"2.9\"></text></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M41.8 3L42.26 3.09L42.65 3.35L42.91 3.74L43 4.2L43 17.8L42.91 18.26L42.65 18.65L42.26 18.91L41.8 19L4.2 19L3.74 18.91L3.35 18.65L3.09 18.26L3 17.8L3 4.2L3.09 3.74L3.35 3.35L3.74 3.09L4.2 3Z\"/></g></g><g class=\"it\" data-name=\"cable.reader.shell0\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M295.4 104L295.5 103.3L295.7 102.5L296 101.8L296.4 101.1L296.9 100.5L297.4 100.1L297.9 99.9L298.3 99.8L301.5 101L301.9 101.2L302.2 101.6L302.4 102.1L302.4 102.8L302.4 103.5L302.2 104.3L301.9 105.1L301.5 105.8L301 106.3L300.5 106.7L300 107L299.5 107L296.4 105.8L296 105.6L295.7 105.2L295.5 104.7Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M296.4 105.8L296 105.6L295.7 105.2L298.8 106.5L299.1 106.8L299.5 107ZM298.6 105.3L298.6 104.5L298.8 103.7L299.1 103L299.5 102.3L300 101.7L300.5 101.3L301 101.1L301.5 101L301.9 101.2L302.2 101.6L302.4 102.1L302.4 102.8L302.4 103.5L302.2 104.3L301.9 105.1L301.5 105.8L301 106.3L300.5 106.7L300 107L299.5 107L299.1 106.8L298.8 106.5L298.6 105.9L298.6 105.3L300.5 104L300.5 104L300.5 104L300.5 104L300.5 104L300.5 104L300.5 104L300.5 104L300.5 104L300.5 104L300.5 104L300.5 104L300.5 104L300.5 104L300.5 104L300.5 104L300.5 104L300.5 104L300.5 104L300.5 104L300.5 104L300.5 104L300.5 104L300.5 104L300.5 104Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M295.7 105.2L295.5 104.7L298.6 105.9L298.8 106.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M295.5 104.7L295.4 104L298.6 105.3L298.6 105.9Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M295.4 104L295.5 103.3L298.6 104.5L298.6 105.3ZM297.9 99.9L298.3 99.8L301.5 101L301 101.1Z\"/><path class=\"iso-top\" d=\"M295.5 103.3L295.7 102.5L296 101.8L296.4 101.1L296.9 100.5L297.4 100.1L297.9 99.9L301 101.1L300.5 101.3L300 101.7L299.5 102.3L299.1 103L298.8 103.7L298.6 104.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M299.4 107L298.8 106.4L298.6 105.4L298.7 104.1L299.2 102.8L300 101.7L300.9 101.1L301.6 101.1\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M299.4 107L298.9 106L298.8 104.9L299.1 103.5L299.8 102.2L300.7 101.5L301.6 101.1\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M295.4 104L295.5 103.3L295.7 102.5L296 101.8L296.4 101.1L296.9 100.5L297.4 100.1L297.9 99.9L298.3 99.8L301.5 101L301.9 101.2L302.2 101.6L302.4 102.1L302.4 102.8L302.4 103.5L302.2 104.3L301.9 105.1L301.5 105.8L301 106.3L300.5 106.7L300 107L299.5 107L296.4 105.8L296 105.6L295.7 105.2L295.5 104.7Z\"/></g></g><g class=\"it\" data-name=\"cable.reader:0\"><g class=\"tb\"><path class=\"tb-body\" d=\"M299.9 105.6L300.7 105.9L301.9 106.4L303 106.9L304 107.7L305 108.7L306.1 110L307.2 111.2L308.2 112.5L309.4 113.8L310.8 115L311.5 115.4L313.2 112.5L312.7 112.3L311.7 111.4L310.7 110.3L309.7 109L308.6 107.8L307.5 106.5L306.3 105.2L304.8 104.1L303.3 103.3L301.9 102.8L301.1 102.5ZM300.9 102.5L300.7 102.5L300.5 102.6L300.2 102.8L300 103.1L299.8 103.4L299.7 103.7L299.6 104.1L299.5 104.4L299.5 104.7L299.5 105L299.6 105.3L299.7 105.5L299.9 105.6L300.1 105.6L300.3 105.6L300.5 105.4L300.8 105.2L301 105L301.2 104.7L301.3 104.3L301.4 104L301.5 103.6L301.5 103.3L301.5 103L301.4 102.8L301.3 102.6L301.1 102.5Z\"/><path class=\"tb-shine\" d=\"M300.5 104L301.3 104.3L302.6 104.9L303.9 105.6L305 106.6L306 107.8L307.1 109.1L308.2 110.3L309.3 111.6L310.4 112.8L311.7 113.8L312.9 114.3L313.3 113.6L312.1 113.1L311 112.2L309.9 111L308.8 109.8L307.7 108.6L306.6 107.3L305.5 106L304.3 104.9L302.9 104.1L301.6 103.6L300.8 103.3L300.1 103L300 103.1L299.8 103.4L299.7 103.7Z\"/><path class=\"tb-shade\" d=\"M300.2 104.9L301 105.2L302.3 105.7L303.5 106.1L304.8 106.9L305.9 108L307 109.2L308.1 110.4L309.1 111.7L310.2 113L311.3 114.2L312.5 115.1L312.8 114.5L311.7 113.7L310.7 112.5L309.6 111.2L308.6 110L307.5 108.8L306.4 107.5L305.2 106.4L303.9 105.6L302.5 105.1L301.2 104.6L300.4 104.3L299.6 104L299.6 104.1L299.5 104.4L299.5 104.6Z\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M302.1 102.9L301.9 102.9M300.8 105.8L300.9 105.9M303.6 103.5L303.4 103.6M302.1 106.3L302.2 106.5\" opacity=\"0.25\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M301.9 102.9L301.7 103M300.7 105.6L300.8 105.8M303.4 103.6L303.2 103.6M302.1 106.1L302.1 106.3\" opacity=\"0.75\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M301.7 103L301.5 103.2M301.5 103.2L301.3 103.3M301.3 103.3L301.1 103.6M301.1 103.6L301 103.9M301 103.9L300.8 104.1M300.8 104.1L300.7 104.5M300.7 104.5L300.6 104.8M300.6 104.8L300.6 105.1M300.6 105.1L300.6 105.3M300.6 105.3L300.7 105.6M303.2 103.6L303 103.8M303 103.8L302.8 103.9M302.8 103.9L302.6 104.2M302.6 104.2L302.5 104.4M302.5 104.4L302.3 104.7M302.3 104.7L302.2 105M302.2 105L302.1 105.3M302.1 105.3L302.1 105.6M302.1 105.6L302 105.9M302 105.9L302.1 106.1M305 104.6L304.8 104.7M304.8 104.7L304.6 104.9M304.6 104.9L304.4 105.1M304.4 105.1L304.2 105.3M304.2 105.3L304 105.5M304 105.5L303.8 105.8M303.8 105.8L303.6 106.1M303.6 106.1L303.5 106.3M303.5 106.3L303.4 106.6M303.4 106.6L303.4 106.8M306.6 106L306.4 106.1M306.4 106.1L306.2 106.2M306.2 106.2L306 106.4M306 106.4L305.8 106.6M305.8 106.6L305.5 106.8M305.5 106.8L305.3 107.1M305.3 107.1L305.1 107.3M305.1 107.3L304.9 107.5M304.9 107.5L304.7 107.7M304.7 107.7L304.6 107.9M307.9 107.4L307.7 107.5M307.7 107.5L307.5 107.6M307.5 107.6L307.2 107.8M307.2 107.8L307 108M307 108L306.7 108.2M306.7 108.2L306.5 108.4M306.5 108.4L306.3 108.6M306.3 108.6L306.1 108.8M306.1 108.8L305.9 109M305.9 109L305.8 109.2M309 108.7L308.8 108.8M308.8 108.8L308.6 109M308.6 109L308.4 109.2M308.4 109.2L308.2 109.3M308.2 109.3L307.9 109.6M307.9 109.6L307.7 109.8M307.7 109.8L307.4 110M307.4 110L307.2 110.2M307.2 110.2L307.1 110.4M307.1 110.4L306.9 110.5M310.2 110.1L310 110.2M310 110.2L309.8 110.3M309.8 110.3L309.6 110.5M309.6 110.5L309.3 110.7M309.3 110.7L309.1 110.9M309.1 110.9L308.8 111.1M308.8 111.1L308.6 111.3M308.6 111.3L308.4 111.5M308.4 111.5L308.2 111.7M308.2 111.7L308.1 111.9M311.3 111.3L311.1 111.4M311.1 111.4L310.9 111.6M310.9 111.6L310.6 111.8M310.6 111.8L310.4 112M310.4 112L310.2 112.2M310.2 112.2L309.9 112.4M309.9 112.4L309.7 112.6M309.7 112.6L309.6 112.9M309.6 112.9L309.4 113.1M309.4 113.1L309.3 113.2M312.2 112.3L312 112.4M312 112.4L311.8 112.6M311.8 112.6L311.6 112.8M311.6 112.8L311.4 113M311.4 113L311.2 113.3M311.2 113.3L311 113.5M311 113.5L310.9 113.8M310.9 113.8L310.8 114.1M310.8 114.1L310.7 114.3M310.7 114.3L310.6 114.5\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M305.3 104.5L305.2 104.5M303.4 107L303.4 107.1M312.6 112.2L312.4 112.2M310.6 114.7L310.6 114.8\" opacity=\"0.30\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M305.2 104.5L305 104.6M303.4 106.8L303.4 107M312.4 112.2L312.2 112.3M310.6 114.5L310.6 114.7\" opacity=\"0.85\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M306.9 105.9L306.8 105.9M304.5 108L304.5 108.1M308.1 107.3L308 107.3M305.7 109.3L305.6 109.4M309.3 108.6L309.2 108.7M306.9 110.7L306.8 110.8M310.4 110L310.3 110M308 112L308 112.1M311.5 111.3L311.4 111.3M309.2 113.4L309.2 113.5\" opacity=\"0.35\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M306.8 105.9L306.6 106M304.6 107.9L304.5 108M308 107.3L307.9 107.4M305.8 109.2L305.7 109.3M309.2 108.7L309 108.7M306.9 110.5L306.9 110.7M310.3 110L310.2 110.1M308.1 111.9L308 112M311.4 111.3L311.3 111.3M309.3 113.2L309.2 113.4\" opacity=\"0.90\"/><path class=\"iso-line tb-edge\" data-tone=\"mid\" d=\"M299.9 105.6L300.7 105.9L301.9 106.4L303 106.9L304 107.7L305 108.7L306.1 110L307.2 111.2L308.2 112.5L309.4 113.8L310.8 115L311.5 115.4M301.1 102.5L301.9 102.8L303.3 103.3L304.8 104.1L306.3 105.2L307.5 106.5L308.6 107.8L309.7 109L310.7 110.3L311.7 111.4L312.7 112.3L313.2 112.5M299.9 105.6L299.7 105.5L299.6 105.3L299.5 105L299.5 104.7L299.5 104.4L299.6 104.1L299.7 103.7L299.8 103.4L300 103.1L300.2 102.8L300.5 102.6L300.7 102.5L300.9 102.5L301.1 102.5\"/></g></g><g class=\"it\" data-name=\"cable.reader:1\"><g class=\"tb\"><path class=\"tb-body\" d=\"M310.1 114.4L310.8 115L312.3 115.9L313.7 116.4L315.1 117L316.4 117.5L317.7 118L319 118.5L320.3 119L321.6 119.5L322.9 120L323.7 120.3L324.9 117.3L324.1 117L322.8 116.4L321.5 115.9L320.2 115.4L318.9 114.9L317.6 114.4L316.3 113.9L315 113.4L313.8 112.9L312.7 112.3L312.3 111.9ZM324.7 117.2L324.5 117.3L324.3 117.4L324 117.6L323.8 117.8L323.6 118.1L323.5 118.5L323.4 118.8L323.3 119.2L323.3 119.5L323.3 119.8L323.4 120L323.5 120.2L323.7 120.3L323.9 120.4L324.1 120.3L324.3 120.2L324.6 120L324.8 119.7L325 119.4L325.1 119.1L325.2 118.8L325.3 118.4L325.3 118.1L325.3 117.8L325.2 117.5L325.1 117.4L324.9 117.3Z\"/><path class=\"tb-shine\" d=\"M310.5 112.9L311.7 113.8L313 114.4L314.4 114.9L315.7 115.4L317 115.9L318.3 116.4L319.6 116.9L320.9 117.4L322.2 118L323.5 118.5L324.3 118.8L323.5 118.4L323.6 118.1L323.8 117.8L323.9 117.8L324.6 118L323.8 117.7L322.5 117.2L321.2 116.7L319.9 116.2L318.6 115.7L317.3 115.2L316 114.7L314.7 114.2L313.4 113.7L312.1 113.1L311 112.3Z\"/><path class=\"tb-shade\" d=\"M310.3 113.1L311.3 114.2L312.7 115.2L314 115.8L315.3 116.3L316.6 116.8L318 117.3L319.3 117.8L320.6 118.3L321.9 118.8L323.2 119.4L324 119.7L323.3 119.4L323.3 119.2L323.4 118.8L323.4 118.7L324.2 119L323.4 118.7L322.1 118.2L320.8 117.7L319.5 117.2L318.2 116.7L316.9 116.2L315.6 115.7L314.3 115.1L313 114.6L311.7 113.7L310.7 112.6Z\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M312.6 112.2L312.4 112.2M310.6 114.7L310.6 114.8\" opacity=\"0.30\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M312.4 112.2L312.2 112.3M310.6 114.5L310.6 114.7\" opacity=\"0.85\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M312.2 112.3L312 112.4M312 112.4L311.8 112.6M311.8 112.6L311.6 112.8M311.6 112.8L311.4 113M311.4 113L311.2 113.3M311.2 113.3L311 113.5M311 113.5L310.9 113.8M310.9 113.8L310.8 114.1M310.8 114.1L310.7 114.3M310.7 114.3L310.6 114.5M313.3 113L313.1 113.1M313.1 113.1L312.9 113.3M312.9 113.3L312.7 113.5M312.7 113.5L312.5 113.8M312.5 113.8L312.4 114.1M312.4 114.1L312.2 114.3M312.2 114.3L312.1 114.6M312.1 114.6L312.1 114.9M312.1 114.9L312.1 115.2M312.1 115.2L312.1 115.4M314.6 113.5L314.4 113.7M314.4 113.7L314.2 113.8M314.2 113.8L314 114.1M314 114.1L313.8 114.4M313.8 114.4L313.7 114.6M313.7 114.6L313.6 115M313.6 115L313.5 115.3M313.5 115.3L313.5 115.6M313.5 115.6L313.5 115.8M313.5 115.8L313.6 116.1M316 114.1L315.8 114.2M315.8 114.2L315.6 114.4M315.6 114.4L315.4 114.6M315.4 114.6L315.3 114.9M315.3 114.9L315.1 115.2M315.1 115.2L315 115.5M315 115.5L315 115.8M315 115.8L314.9 116.1M314.9 116.1L314.9 116.4M314.9 116.4L315 116.6M317.4 114.6L317.2 114.8M317.2 114.8L317 115M317 115L316.8 115.2M316.8 115.2L316.7 115.5M316.7 115.5L316.5 115.8M316.5 115.8L316.4 116.1M316.4 116.1L316.4 116.4M316.4 116.4L316.3 116.7M316.3 116.7L316.4 116.9M316.4 116.9L316.4 117.2M318.8 115.2L318.6 115.3M318.6 115.3L318.4 115.5M318.4 115.5L318.3 115.8M318.3 115.8L318.1 116M318.1 116L318 116.3M318 116.3L317.9 116.6M317.9 116.6L317.8 116.9M317.8 116.9L317.8 117.2M317.8 117.2L317.8 117.5M317.8 117.5L317.8 117.7M320.3 115.7L320.1 115.9M320.1 115.9L319.9 116.1M319.9 116.1L319.7 116.3M319.7 116.3L319.5 116.6M319.5 116.6L319.4 116.9M319.4 116.9L319.3 117.2M319.3 117.2L319.2 117.5M319.2 117.5L319.2 117.8M319.2 117.8L319.2 118.1M319.2 118.1L319.3 118.3M321.7 116.3L321.5 116.4M321.5 116.4L321.3 116.6M321.3 116.6L321.1 116.9M321.1 116.9L320.9 117.1M320.9 117.1L320.8 117.4M320.8 117.4L320.7 117.7M320.7 117.7L320.6 118M320.6 118L320.6 118.3M320.6 118.3L320.6 118.6M320.6 118.6L320.7 118.9M323.1 116.8L322.9 117M322.9 117L322.7 117.2M322.7 117.2L322.5 117.4M322.5 117.4L322.4 117.7M322.4 117.7L322.2 118M322.2 118L322.1 118.3M322.1 118.3L322.1 118.6M322.1 118.6L322 118.9M322 118.9L322 119.2M322 119.2L322.1 119.4\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M313.7 112.9L313.5 112.9M312.2 115.6L312.3 115.8M315 113.4L314.8 113.4M313.6 116.3L313.8 116.4M316.4 114L316.2 114M315.1 116.8L315.2 117M317.8 114.5L317.6 114.5M316.5 117.4L316.6 117.5M319.2 115.1L319 115.1M317.9 117.9L318 118.1M320.6 115.6L320.5 115.6M319.3 118.5L319.5 118.6M322.1 116.2L321.9 116.2M320.8 119.1L320.9 119.2M323.5 116.7L323.3 116.8M322.2 119.6L322.3 119.8\" opacity=\"0.25\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M313.5 112.9L313.3 113M312.1 115.4L312.2 115.6M314.8 113.4L314.6 113.5M313.6 116.1L313.6 116.3M316.2 114L316 114.1M315 116.6L315.1 116.8M317.6 114.5L317.4 114.6M316.4 117.2L316.5 117.4M319 115.1L318.8 115.2M317.8 117.7L317.9 117.9M320.5 115.6L320.3 115.7M319.3 118.3L319.3 118.5M321.9 116.2L321.7 116.3M320.7 118.9L320.8 119.1M323.3 116.8L323.1 116.8M322.1 119.4L322.2 119.6\" opacity=\"0.75\"/><path class=\"iso-line tb-edge\" data-tone=\"mid\" d=\"M310.1 114.4L310.8 115L312.3 115.9L313.7 116.4L315.1 117L316.4 117.5L317.7 118L319 118.5L320.3 119L321.6 119.5L322.9 120L323.7 120.3M312.3 111.9L312.7 112.3L313.8 112.9L315 113.4L316.3 113.9L317.6 114.4L318.9 114.9L320.2 115.4L321.5 115.9L322.8 116.4L324.1 117L324.9 117.3M324.9 117.3L325.1 117.4L325.2 117.5L325.3 117.8L325.3 118.1L325.3 118.4L325.2 118.8L325.1 119.1L325 119.4L324.8 119.7L324.6 120L324.3 120.2L324.1 120.3L323.9 120.4L323.7 120.3M323.7 120.3L323.5 120.2L323.4 120L323.3 119.8L323.3 119.5L323.3 119.2L323.4 118.8L323.5 118.5L323.6 118.1L323.8 117.8L324 117.6L324.3 117.4L324.5 117.3L324.7 117.2L324.9 117.3\"/></g></g><g class=\"it\" data-name=\"cable.clip.-14\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M321.4 119.3L321.6 119.1L327 115.6L327.5 115.5L328 115.6L329.9 116.3L330.2 116.6L330.2 120.3L330 120.6L324.7 124.1L324.2 124.2L323.6 124.1L321.7 123.4L321.4 123.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M330.2 120.3L330 120.6L330 116.8L330.2 116.6ZM330 120.6L324.7 124.1L324.7 120.3L330 116.8Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M324.7 124.1L324.2 124.2L324.2 120.4L324.7 120.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M324.2 124.2L323.6 124.1L323.6 120.3L324.2 120.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M323.6 124.1L321.7 123.4L321.7 119.6L323.6 120.3ZM321.7 123.4L321.4 123.1L321.4 119.3L321.7 119.6Z\"/><path class=\"iso-top\" d=\"M329.9 116.3L330.2 116.6L330 116.8L324.7 120.3L324.2 120.4L323.6 120.3L321.7 119.6L321.4 119.3L321.6 119.1L327 115.6L327.5 115.5L328 115.6Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M330.2 116.6L330 116.8L324.7 120.3L324.2 120.4L323.6 120.3L321.7 119.6L321.4 119.3\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M330.2 116.6L329.8 116.8L324.5 120.2L324.1 120.3L323.8 120.2L321.9 119.5L321.4 119.3\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M321.4 119.3L321.6 119.1L327 115.6L327.5 115.5L328 115.6L329.9 116.3L330.2 116.6M330.2 120.3L330 120.6L324.7 124.1L324.2 124.2L323.6 124.1L321.7 123.4L321.4 123.1M330.2 116.6L330.2 120.3M321.4 119.3L321.4 123.1\"/></g><g class=\"iso-dots\" data-tone=\"mid\"><circle cx=\"328.2\" cy=\"116.4\" r=\"0.35\"/><circle cx=\"323.4\" cy=\"119.5\" r=\"0.35\"/></g></g><g class=\"it\" data-name=\"cable.reader:2\"><g class=\"tb\"><path class=\"tb-body\" d=\"M326.8 121.5L326.9 121.6L328.2 122.1L329.5 122.6L330.8 123.1L332.1 123.6L333.4 124.1L334.7 124.6L336 125.2L337.3 125.7L338.7 126.2L340 126.7L341.3 127.2L342.6 127.7L342.9 127.8L344.1 124.8L343.8 124.6L342.5 124.1L341.2 123.6L339.9 123.1L338.5 122.6L337.2 122.1L335.9 121.6L334.6 121L333.3 120.5L332 120L330.7 119.5L329.4 119L328.1 118.5L328 118.5ZM327.8 118.4L327.6 118.5L327.3 118.6L327.1 118.8L326.9 119L326.7 119.3L326.6 119.7L326.4 120L326.4 120.4L326.4 120.7L326.4 121L326.5 121.2L326.6 121.4L326.8 121.5L327 121.6L327.2 121.5L327.4 121.4L327.6 121.2L327.9 121L328 120.7L328.2 120.3L328.3 120L328.4 119.6L328.4 119.3L328.4 119L328.3 118.7L328.1 118.6L328 118.5Z\"/><path class=\"tb-shine\" d=\"M327.4 120L327.5 120L328.8 120.5L330.1 121L331.4 121.5L332.7 122.1L334 122.6L335.3 123.1L336.6 123.6L338 124.1L339.3 124.6L340.6 125.1L341.9 125.6L343.2 126.1L344.1 126.5L344.4 125.8L343.5 125.4L342.2 124.9L340.9 124.4L339.6 123.9L338.2 123.4L336.9 122.8L335.6 122.3L334.3 121.8L333 121.3L331.7 120.8L330.4 120.3L329.1 119.8L327.8 119.3L327.7 119.2L327 119L326.9 119L326.7 119.3L326.6 119.7Z\"/><path class=\"tb-shade\" d=\"M327 120.9L327.1 120.9L328.4 121.4L329.7 121.9L331.1 122.4L332.4 122.9L333.7 123.4L335 124L336.3 124.5L337.6 125L338.9 125.5L340.2 126L341.5 126.5L342.9 127L343.8 127.4L344 126.8L343.1 126.4L341.8 125.9L340.5 125.4L339.2 124.9L337.9 124.4L336.5 123.9L335.2 123.3L333.9 122.8L332.6 122.3L331.3 121.8L330 121.3L328.7 120.8L327.4 120.3L327.3 120.2L326.5 119.9L326.4 120L326.4 120.4L326.4 120.6Z\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M329.2 119L329 119M327.9 121.8L328 122M330.6 119.5L330.4 119.5M329.3 122.4L329.4 122.5M332 120.1L331.8 120.1M330.7 122.9L330.8 123.1M333.4 120.6L333.3 120.6M332.1 123.5L332.3 123.6M334.9 121.2L334.7 121.2M333.6 124.1L333.7 124.2M336.3 121.7L336.1 121.8M335 124.6L335.1 124.8M337.7 122.3L337.5 122.3M336.4 125.2L336.5 125.3M339.1 122.8L338.9 122.9M337.8 125.7L337.9 125.9M340.6 123.4L340.4 123.4M339.3 126.3L339.4 126.4M342 124L341.8 124M340.7 126.8L340.8 127M343.4 124.5L343.2 124.5M342.1 127.4L342.2 127.5\" opacity=\"0.25\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M329 119L328.8 119.1M327.8 121.6L327.9 121.8M330.4 119.5L330.2 119.6M329.2 122.2L329.3 122.4M331.8 120.1L331.6 120.2M330.6 122.7L330.7 122.9M333.3 120.6L333.1 120.7M332.1 123.3L332.1 123.5M334.7 121.2L334.5 121.3M333.5 123.9L333.6 124.1M336.1 121.8L335.9 121.8M334.9 124.4L335 124.6M337.5 122.3L337.3 122.4M336.3 125L336.4 125.2M338.9 122.9L338.7 123M337.7 125.5L337.8 125.7M340.4 123.4L340.2 123.5M339.2 126.1L339.3 126.3M341.8 124L341.6 124.1M340.6 126.6L340.7 126.8M343.2 124.5L343 124.6M342 127.2L342.1 127.4\" opacity=\"0.75\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M328.8 119.1L328.6 119.2M328.6 119.2L328.4 119.4M328.4 119.4L328.2 119.6M328.2 119.6L328.1 119.9M328.1 119.9L327.9 120.2M327.9 120.2L327.8 120.5M327.8 120.5L327.8 120.8M327.8 120.8L327.7 121.1M327.7 121.1L327.7 121.4M327.7 121.4L327.8 121.6M330.2 119.6L330 119.8M330 119.8L329.8 120M329.8 120L329.6 120.2M329.6 120.2L329.5 120.5M329.5 120.5L329.3 120.8M329.3 120.8L329.2 121.1M329.2 121.1L329.2 121.4M329.2 121.4L329.1 121.7M329.1 121.7L329.2 121.9M329.2 121.9L329.2 122.2M331.6 120.2L331.4 120.3M331.4 120.3L331.2 120.5M331.2 120.5L331.1 120.8M331.1 120.8L330.9 121M330.9 121L330.8 121.3M330.8 121.3L330.7 121.6M330.7 121.6L330.6 121.9M330.6 121.9L330.6 122.2M330.6 122.2L330.6 122.5M330.6 122.5L330.6 122.7M333.1 120.7L332.9 120.9M332.9 120.9L332.7 121.1M332.7 121.1L332.5 121.3M332.5 121.3L332.3 121.6M332.3 121.6L332.2 121.9M332.2 121.9L332.1 122.2M332.1 122.2L332 122.5M332 122.5L332 122.8M332 122.8L332 123.1M332 123.1L332.1 123.3M334.5 121.3L334.3 121.4M334.3 121.4L334.1 121.6M334.1 121.6L333.9 121.9M333.9 121.9L333.7 122.1M333.7 122.1L333.6 122.4M333.6 122.4L333.5 122.7M333.5 122.7L333.4 123M333.4 123L333.4 123.3M333.4 123.3L333.4 123.6M333.4 123.6L333.5 123.9M335.9 121.8L335.7 122M335.7 122L335.5 122.2M335.5 122.2L335.3 122.4M335.3 122.4L335.2 122.7M335.2 122.7L335 123M335 123L334.9 123.3M334.9 123.3L334.9 123.6M334.9 123.6L334.8 123.9M334.8 123.9L334.8 124.2M334.8 124.2L334.9 124.4M337.3 122.4L337.1 122.5M337.1 122.5L336.9 122.7M336.9 122.7L336.7 123M336.7 123L336.6 123.2M336.6 123.2L336.5 123.5M336.5 123.5L336.4 123.8M336.4 123.8L336.3 124.2M336.3 124.2L336.3 124.5M336.3 124.5L336.3 124.7M336.3 124.7L336.3 125M338.7 123L338.5 123.1M338.5 123.1L338.4 123.3M338.4 123.3L338.2 123.5M338.2 123.5L338 123.8M338 123.8L337.9 124.1M337.9 124.1L337.8 124.4M337.8 124.4L337.7 124.7M337.7 124.7L337.7 125M337.7 125L337.7 125.3M337.7 125.3L337.7 125.5M340.2 123.5L340 123.7M340 123.7L339.8 123.8M339.8 123.8L339.6 124.1M339.6 124.1L339.4 124.4M339.4 124.4L339.3 124.7M339.3 124.7L339.2 125M339.2 125L339.1 125.3M339.1 125.3L339.1 125.6M339.1 125.6L339.1 125.8M339.1 125.8L339.2 126.1M341.6 124.1L341.4 124.2M341.4 124.2L341.2 124.4M341.2 124.4L341 124.6M341 124.6L340.9 124.9M340.9 124.9L340.7 125.2M340.7 125.2L340.6 125.5M340.6 125.5L340.6 125.8M340.6 125.8L340.5 126.1M340.5 126.1L340.5 126.4M340.5 126.4L340.6 126.6M343 124.6L342.8 124.8M342.8 124.8L342.6 125M342.6 125L342.4 125.2M342.4 125.2L342.3 125.5M342.3 125.5L342.1 125.8M342.1 125.8L342 126.1M342 126.1L342 126.4M342 126.4L341.9 126.7M341.9 126.7L342 126.9M342 126.9L342 127.2\"/><path class=\"iso-line tb-edge\" data-tone=\"mid\" d=\"M326.8 121.5L326.9 121.6L328.2 122.1L329.5 122.6L330.8 123.1L332.1 123.6L333.4 124.1L334.7 124.6L336 125.2L337.3 125.7L338.7 126.2L340 126.7L341.3 127.2L342.6 127.7L342.9 127.8M328 118.5L328.1 118.5L329.4 119L330.7 119.5L332 120L333.3 120.5L334.6 121L335.9 121.6L337.2 122.1L338.5 122.6L339.9 123.1L341.2 123.6L342.5 124.1L343.8 124.6L344.1 124.8M326.8 121.5L326.6 121.4L326.5 121.2L326.4 121L326.4 120.7L326.4 120.4L326.4 120L326.6 119.7L326.7 119.3L326.9 119L327.1 118.8L327.3 118.6L327.6 118.5L327.8 118.4L328 118.5\"/></g></g><g class=\"it\" data-name=\"cable.reader:3\"><g class=\"tb\"><path class=\"tb-body\" d=\"M341.8 127.4L342.6 127.7L343.9 128.2L345.2 128.7L346.5 129.2L347.8 129.8L349.1 130.3L350.4 130.8L351.8 131.3L353.1 131.8L354.4 132.3L355.7 132.8L357 133.3L358.3 133.9L358.5 133.9L359.7 130.8L359.5 130.8L358.2 130.3L356.9 129.7L355.6 129.2L354.3 128.7L353 128.2L351.7 127.7L350.3 127.2L349 126.7L347.7 126.2L346.4 125.7L345.1 125.1L343.8 124.6L343 124.3Z\"/><path class=\"tb-shine\" d=\"M341.8 125.6L341.9 125.6L343.2 126.1L344.5 126.7L345.8 127.2L347.1 127.7L348.4 128.2L349.7 128.7L351.1 129.2L352.4 129.7L353.7 130.2L355 130.8L356.3 131.3L357.6 131.8L358.9 132.3L359.7 132.6L360 131.9L359.2 131.6L357.9 131L356.6 130.5L355.3 130L354 129.5L352.7 129L351.3 128.5L350 128L348.7 127.5L347.4 126.9L346.1 126.4L344.8 125.9L343.5 125.4L342.2 124.9L342.1 124.9Z\"/><path class=\"tb-shade\" d=\"M341.4 126.5L341.5 126.5L342.9 127L344.2 127.5L345.5 128.1L346.8 128.6L348.1 129.1L349.4 129.6L350.7 130.1L352 130.6L353.3 131.1L354.6 131.6L356 132.2L357.3 132.7L358.6 133.2L359.4 133.5L359.6 132.9L358.8 132.6L357.5 132L356.2 131.5L354.9 131L353.6 130.5L352.3 130L351 129.5L349.6 129L348.3 128.5L347 128L345.7 127.4L344.4 126.9L343.1 126.4L341.8 125.9L341.7 125.9Z\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M343.4 124.5L343.2 124.5M342.1 127.4L342.2 127.5M344.8 125.1L344.6 125.1M343.5 127.9L343.6 128.1M346.2 125.6L346.1 125.6M344.9 128.5L345.1 128.6M347.7 126.2L347.5 126.2M346.4 129.1L346.5 129.2M349.1 126.7L348.9 126.8M347.8 129.6L347.9 129.8M350.5 127.3L350.3 127.3M349.2 130.2L349.3 130.3M351.9 127.8L351.7 127.9M350.6 130.7L350.7 130.9M353.4 128.4L353.2 128.4M352.1 131.3L352.2 131.4M354.8 129L354.6 129M353.5 131.8L353.6 132M356.2 129.5L356 129.5M354.9 132.4L355 132.5M357.6 130.1L357.4 130.1M356.3 132.9L356.4 133.1M359 130.6L358.9 130.6M357.7 133.5L357.9 133.6\" opacity=\"0.25\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M343.2 124.5L343 124.6M342 127.2L342.1 127.4M344.6 125.1L344.4 125.2M343.4 127.7L343.5 127.9M346.1 125.6L345.9 125.7M344.9 128.3L344.9 128.5M347.5 126.2L347.3 126.3M346.3 128.9L346.4 129.1M348.9 126.8L348.7 126.8M347.7 129.4L347.8 129.6M350.3 127.3L350.1 127.4M349.1 130L349.2 130.2M351.7 127.9L351.5 128M350.5 130.5L350.6 130.7M353.2 128.4L353 128.5M352 131.1L352.1 131.3M354.6 129L354.4 129.1M353.4 131.6L353.5 131.8M356 129.5L355.8 129.6M354.8 132.2L354.9 132.4M357.4 130.1L357.2 130.2M356.2 132.7L356.3 132.9M358.9 130.6L358.7 130.7M357.7 133.3L357.7 133.5\" opacity=\"0.75\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M343 124.6L342.8 124.8M342.8 124.8L342.6 125M342.6 125L342.4 125.2M342.4 125.2L342.3 125.5M342.3 125.5L342.1 125.8M342.1 125.8L342 126.1M342 126.1L342 126.4M342 126.4L341.9 126.7M341.9 126.7L342 126.9M342 126.9L342 127.2M344.4 125.2L344.2 125.3M344.2 125.3L344 125.5M344 125.5L343.9 125.8M343.9 125.8L343.7 126M343.7 126L343.6 126.3M343.6 126.3L343.5 126.6M343.5 126.6L343.4 126.9M343.4 126.9L343.4 127.2M343.4 127.2L343.4 127.5M343.4 127.5L343.4 127.7M345.9 125.7L345.7 125.9M345.7 125.9L345.5 126.1M345.5 126.1L345.3 126.3M345.3 126.3L345.1 126.6M345.1 126.6L345 126.9M345 126.9L344.9 127.2M344.9 127.2L344.8 127.5M344.8 127.5L344.8 127.8M344.8 127.8L344.8 128.1M344.8 128.1L344.9 128.3M347.3 126.3L347.1 126.4M347.1 126.4L346.9 126.6M346.9 126.6L346.7 126.9M346.7 126.9L346.5 127.1M346.5 127.1L346.4 127.4M346.4 127.4L346.3 127.7M346.3 127.7L346.2 128M346.2 128L346.2 128.3M346.2 128.3L346.2 128.6M346.2 128.6L346.3 128.9M348.7 126.8L348.5 127M348.5 127L348.3 127.2M348.3 127.2L348.1 127.4M348.1 127.4L348 127.7M348 127.7L347.8 128M347.8 128L347.7 128.3M347.7 128.3L347.7 128.6M347.7 128.6L347.6 128.9M347.6 128.9L347.6 129.2M347.6 129.2L347.7 129.4M350.1 127.4L349.9 127.5M349.9 127.5L349.7 127.7M349.7 127.7L349.5 128M349.5 128L349.4 128.2M349.4 128.2L349.3 128.5M349.3 128.5L349.2 128.8M349.2 128.8L349.1 129.2M349.1 129.2L349.1 129.5M349.1 129.5L349.1 129.7M349.1 129.7L349.1 130M351.5 128L351.3 128.1M351.3 128.1L351.2 128.3M351.2 128.3L351 128.5M351 128.5L350.8 128.8M350.8 128.8L350.7 129.1M350.7 129.1L350.6 129.4M350.6 129.4L350.5 129.7M350.5 129.7L350.5 130M350.5 130L350.5 130.3M350.5 130.3L350.5 130.5M353 128.5L352.8 128.7M352.8 128.7L352.6 128.9M352.6 128.9L352.4 129.1M352.4 129.1L352.2 129.4M352.2 129.4L352.1 129.7M352.1 129.7L352 130M352 130L351.9 130.3M351.9 130.3L351.9 130.6M351.9 130.6L351.9 130.8M351.9 130.8L352 131.1M354.4 129.1L354.2 129.2M354.2 129.2L354 129.4M354 129.4L353.8 129.6M353.8 129.6L353.7 129.9M353.7 129.9L353.5 130.2M353.5 130.2L353.4 130.5M353.4 130.5L353.4 130.8M353.4 130.8L353.3 131.1M353.3 131.1L353.3 131.4M353.3 131.4L353.4 131.6M355.8 129.6L355.6 129.8M355.6 129.8L355.4 130M355.4 130L355.2 130.2M355.2 130.2L355.1 130.5M355.1 130.5L354.9 130.8M354.9 130.8L354.8 131.1M354.8 131.1L354.8 131.4M354.8 131.4L354.7 131.7M354.7 131.7L354.8 131.9M354.8 131.9L354.8 132.2M357.2 130.2L357 130.3M357 130.3L356.8 130.5M356.8 130.5L356.7 130.8M356.7 130.8L356.5 131M356.5 131L356.4 131.3M356.4 131.3L356.3 131.6M356.3 131.6L356.2 131.9M356.2 131.9L356.2 132.2M356.2 132.2L356.2 132.5M356.2 132.5L356.2 132.7M358.7 130.7L358.5 130.9M358.5 130.9L358.3 131.1M358.3 131.1L358.1 131.3M358.1 131.3L357.9 131.6M357.9 131.6L357.8 131.9M357.8 131.9L357.7 132.2M357.7 132.2L357.6 132.5M357.6 132.5L357.6 132.8M357.6 132.8L357.6 133.1M357.6 133.1L357.7 133.3\"/><path class=\"iso-line tb-edge\" data-tone=\"mid\" d=\"M341.8 127.4L342.6 127.7L343.9 128.2L345.2 128.7L346.5 129.2L347.8 129.8L349.1 130.3L350.4 130.8L351.8 131.3L353.1 131.8L354.4 132.3L355.7 132.8L357 133.3L358.3 133.9L358.5 133.9M343 124.3L343.8 124.6L345.1 125.1L346.4 125.7L347.7 126.2L349 126.7L350.3 127.2L351.7 127.7L353 128.2L354.3 128.7L355.6 129.2L356.9 129.7L358.2 130.3L359.5 130.8L359.7 130.8\"/></g></g><g class=\"it\" data-name=\"cab.anchor.1\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M433.5 292.5L433.6 292.2L440.9 287.6L441.5 287.4L442.1 287.5L447.8 289.7L448.2 290L448.2 291.9L448 292.2L440.8 296.8L440.2 297L439.5 296.9L433.8 294.7L433.5 294.4Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M448.2 291.9L448 292.2L448 290.4L448.2 290ZM448 292.2L440.8 296.8L440.8 295L448 290.4Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M440.8 296.8L440.2 297L440.2 295.2L440.8 295Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M440.2 297L439.5 296.9L439.5 295.1L440.2 295.2Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M439.5 296.9L433.8 294.7L433.8 292.8L439.5 295.1ZM433.8 294.7L433.5 294.4L433.5 292.5L433.8 292.8Z\"/><path class=\"iso-top\" d=\"M447.8 289.7L448.2 290L448 290.4L440.8 295L440.2 295.2L439.5 295.1L433.8 292.8L433.5 292.5L433.6 292.2L440.9 287.6L441.5 287.4L442.1 287.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M448.2 290L448 290.4L440.8 295L440.2 295.2L439.5 295.1L433.8 292.8L433.5 292.5\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M448.2 290L447.7 290.3L440.6 294.9L440.1 295L439.6 294.9L434 292.7L433.5 292.5\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M433.5 292.5L433.6 292.2L440.9 287.6L441.5 287.4L442.1 287.5L447.8 289.7L448.2 290M448.2 291.9L448 292.2L440.8 296.8L440.2 297L439.5 296.9L433.8 294.7L433.5 294.4M448.2 290L448.2 291.9M433.5 292.5L433.5 294.4\"/></g><g class=\"iso-dots\" data-tone=\"mid\"><circle cx=\"442.8\" cy=\"290\" r=\"0.4\"/><circle cx=\"438.9\" cy=\"292.5\" r=\"0.4\"/></g></g><g class=\"it\" data-name=\"post.bracket.62\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M328 177.9L328.1 177.7L330.2 176.4L330.5 176.3L330.8 176.4L333.6 177.5L333.8 177.6L333.8 185.4L333.7 185.6L331.6 186.9L331.3 187L331 187L328.2 185.9L328 185.7Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M333.8 185.4L333.7 185.6L333.7 177.8L333.8 177.6ZM333.7 185.6L331.6 186.9L331.6 179.1L333.7 177.8Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M331.6 186.9L331.3 187L331.3 179.2L331.6 179.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M331.3 187L331 187L331 179.2L331.3 179.2Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M331 187L328.2 185.9L328.2 178L331 179.2ZM328.2 185.9L328 185.7L328 177.9L328.2 178Z\"/><path class=\"iso-top\" d=\"M333.6 177.5L333.8 177.6L333.7 177.8L331.6 179.1L331.3 179.2L331 179.2L328.2 178L328 177.9L328.1 177.7L330.2 176.4L330.5 176.3L330.8 176.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M333.8 177.6L333.7 177.8L331.6 179.1L331.3 179.2L331 179.2L328.2 178L328 177.9\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M328 177.9L328.1 177.7L330.2 176.4L330.5 176.3L330.8 176.4L333.6 177.5L333.8 177.6M333.8 185.4L333.7 185.6L331.6 186.9L331.3 187L331 187L328.2 185.9L328 185.7M333.8 177.6L333.8 185.4M328 177.9L328 185.7\"/></g></g><g class=\"it\" data-name=\"cab.lightbar\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M236.9 121.3L237 121.1L237.1 121L237.4 120.9L237.8 121L403 185.5L403.2 185.7L403.2 189.1L403.1 189.2L403 189.3L402.7 189.4L402.3 189.3L237.1 124.8L236.9 124.6Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M403.2 189.1L403.1 189.2L403.1 185.8L403.2 185.7ZM403.1 189.2L403 189.3L403 185.9L403.1 185.8Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M403 189.3L402.7 189.4L402.7 186L403 185.9Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M402.7 189.4L402.3 189.3L402.3 185.9L402.7 186Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M402.3 189.3L237.1 124.8L237.1 121.4L402.3 185.9ZM237.1 124.8L236.9 124.6L236.9 121.3L237.1 121.4Z\"/><path class=\"iso-top\" d=\"M403 185.5L403.2 185.7L403.1 185.8L403 185.9L402.7 186L402.3 185.9L237.1 121.4L236.9 121.3L237 121.1L237.1 121L237.4 120.9L237.8 121Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M403.2 185.7L403.1 185.8L403 185.9L402.7 186L402.3 185.9L237.1 121.4L236.9 121.3\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M236.9 121.3L237 121.1L237.1 121L237.4 120.9L237.8 121L403 185.5L403.2 185.7M403.2 189.1L403.1 189.2L403 189.3L402.7 189.4L402.3 189.3L237.1 124.8L236.9 124.6M403.2 185.7L403.2 189.1M236.9 121.3L236.9 124.6\"/></g></g><g class=\"it\" data-name=\"post.shaft\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M319 160.1L319.1 159.6L319.4 159.1L319.8 158.6L320.4 158.1L321.1 157.7L322 157.4L322.9 157.1L323.9 157L324.9 156.9L326 156.8L327 156.9L328.1 157L329 157.3L329.9 157.5L330.7 157.9L331.4 158.3L331.9 158.8L332.2 159.3L332.5 159.8L332.5 160.3L332.5 230.7L332.4 231.2L332.1 231.7L331.7 232.2L331.1 232.6L330.4 233L329.5 233.4L328.6 233.6L327.6 233.8L326.6 233.9L325.5 233.9L324.5 233.9L323.4 233.7L322.5 233.5L321.6 233.2L320.8 232.9L320.1 232.4L319.6 232L319.2 231.5L319 231L319 230.4Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M331.1 232.6L330.4 233L330.4 162.7L331.1 162.3ZM330.4 233L329.5 233.4L329.5 163L330.4 162.7ZM332.5 230.7L332.4 231.2L332.4 160.9L332.5 160.3ZM332.4 231.2L332.1 231.7L332.1 161.4L332.4 160.9ZM332.1 231.7L331.7 232.2L331.7 161.9L332.1 161.4ZM331.7 232.2L331.1 232.6L331.1 162.3L331.7 161.9Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M329.5 233.4L328.6 233.6L328.6 163.3L329.5 163ZM328.6 233.6L327.6 233.8L327.6 163.5L328.6 163.3ZM327.6 233.8L326.6 233.9L326.6 163.6L327.6 163.5ZM326.6 233.9L325.5 233.9L325.5 163.6L326.6 163.6Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M325.5 233.9L324.5 233.9L324.5 163.5L325.5 163.6ZM324.5 233.9L323.4 233.7L323.4 163.4L324.5 163.5ZM323.4 233.7L322.5 233.5L322.5 163.2L323.4 163.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M322.5 233.5L321.6 233.2L321.6 162.9L322.5 163.2ZM321.6 233.2L320.8 232.9L320.8 162.5L321.6 162.9ZM320.8 232.9L320.1 232.4L320.1 162.1L320.8 162.5ZM320.1 232.4L319.6 232L319.6 161.6L320.1 162.1ZM319.6 232L319.2 231.5L319.2 161.1L319.6 161.6ZM319.2 231.5L319 231L319 160.6L319.2 161.1ZM319 231L319 230.4L319 160.1L319 160.6Z\"/><path class=\"iso-top\" d=\"M331.1 162.3L330.4 162.7L329.5 163L328.6 163.3L327.6 163.5L326.6 163.6L325.5 163.6L324.5 163.5L323.4 163.4L322.5 163.2L321.6 162.9L320.8 162.5L320.1 162.1L319.6 161.6L319.2 161.1L319 160.6L319 160.1L319.1 159.6L319.4 159.1L319.8 158.6L320.4 158.1L321.1 157.7L322 157.4L322.9 157.1L323.9 157L324.9 156.9L326 156.8L327 156.9L328.1 157L329 157.3L329.9 157.5L330.7 157.9L331.4 158.3L331.9 158.8L332.2 159.3L332.5 159.8L332.5 160.3L332.4 160.9L332.1 161.4L331.7 161.9Z\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M319 160.1L319.1 159.6L319.4 159.1L319.8 158.6L320.4 158.1L321.1 157.7L322 157.4L322.9 157.1L323.9 157L324.9 156.9L326 156.8L327 156.9L328.1 157L329 157.3L329.9 157.5L330.7 157.9L331.4 158.3L331.9 158.8L332.2 159.3L332.5 159.8L332.5 160.3M332.5 230.7L332.4 231.2L332.1 231.7L331.7 232.2L331.1 232.6L330.4 233L329.5 233.4L328.6 233.6L327.6 233.8L326.6 233.9L325.5 233.9L324.5 233.9L323.4 233.7L322.5 233.5L321.6 233.2L320.8 232.9L320.1 232.4L319.6 232L319.2 231.5L319 231L319 230.4M319 160.1L319 230.4M332.5 160.3L332.5 230.7\"/></g></g><g class=\"it\" data-name=\"cable.reader:4\"><g class=\"tb\"><path class=\"tb-body\" d=\"M357.3 133.5L358.3 133.9L359.6 134.4L360.9 134.9L362.2 135.4L363.6 135.9L364.9 136.4L366.2 136.9L367.5 137.4L368.8 138L370.1 138.5L371.4 139L372.7 139.5L373.5 139.8L374.7 136.7L373.9 136.4L372.6 135.9L371.3 135.4L370 134.9L368.7 134.4L367.4 133.8L366.1 133.3L364.8 132.8L363.4 132.3L362.1 131.8L360.8 131.3L359.5 130.8L358.5 130.4ZM374.5 136.7L374.3 136.7L374 136.8L373.8 137L373.6 137.3L373.4 137.6L373.3 137.9L373.1 138.3L373.1 138.6L373.1 138.9L373.1 139.2L373.2 139.5L373.3 139.7L373.5 139.8L373.7 139.8L373.9 139.8L374.1 139.6L374.3 139.4L374.6 139.2L374.7 138.9L374.9 138.6L375 138.2L375.1 137.9L375.1 137.5L375.1 137.2L375 137L374.8 136.8L374.7 136.7Z\"/><path class=\"tb-shine\" d=\"M357.3 131.7L357.6 131.8L358.9 132.3L360.2 132.8L361.5 133.3L362.9 133.8L364.2 134.3L365.5 134.9L366.8 135.4L368.1 135.9L369.4 136.4L370.7 136.9L372 137.4L373.3 137.9L374.1 138.2L373.3 137.9L373.4 137.6L373.6 137.3L373.7 137.2L374.4 137.5L373.6 137.2L372.3 136.7L371 136.2L369.7 135.6L368.4 135.1L367.1 134.6L365.8 134.1L364.5 133.6L363.1 133.1L361.8 132.6L360.5 132.1L359.2 131.6L357.9 131L357.6 130.9Z\"/><path class=\"tb-shade\" d=\"M357 132.6L357.3 132.7L358.6 133.2L359.9 133.7L361.2 134.2L362.5 134.7L363.8 135.2L365.1 135.7L366.4 136.2L367.8 136.8L369.1 137.3L370.4 137.8L371.7 138.3L373 138.8L373.7 139.1L373.1 138.8L373.1 138.6L373.1 138.3L373.2 138.2L374 138.5L373.2 138.2L371.9 137.7L370.6 137.2L369.3 136.7L368 136.1L366.7 135.6L365.4 135.1L364.1 134.6L362.7 134.1L361.4 133.6L360.1 133.1L358.8 132.6L357.5 132L357.2 131.9Z\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M359 130.6L358.9 130.6M357.7 133.5L357.9 133.6M360.5 131.2L360.3 131.2M359.2 134.1L359.3 134.2M361.9 131.7L361.7 131.8M360.6 134.6L360.7 134.8M363.3 132.3L363.1 132.3M362 135.2L362.1 135.3M364.7 132.8L364.5 132.9M363.4 135.7L363.6 135.9M366.2 133.4L366 133.4M364.9 136.3L365 136.4M367.6 134L367.4 134M366.3 136.8L366.4 137M369 134.5L368.8 134.5M367.7 137.4L367.8 137.5M370.4 135.1L370.2 135.1M369.1 137.9L369.2 138.1M371.8 135.6L371.7 135.7M370.5 138.5L370.7 138.6M373.3 136.2L373.1 136.2M372 139.1L372.1 139.2\" opacity=\"0.25\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M358.9 130.6L358.7 130.7M357.7 133.3L357.7 133.5M360.3 131.2L360.1 131.3M359.1 133.9L359.2 134.1M361.7 131.8L361.5 131.8M360.5 134.4L360.6 134.6M363.1 132.3L362.9 132.4M361.9 135L362 135.2M364.5 132.9L364.3 133M363.3 135.5L363.4 135.7M366 133.4L365.8 133.5M364.8 136.1L364.9 136.3M367.4 134L367.2 134.1M366.2 136.6L366.3 136.8M368.8 134.5L368.6 134.6M367.6 137.2L367.7 137.4M370.2 135.1L370 135.2M369 137.7L369.1 137.9M371.7 135.7L371.5 135.7M370.5 138.3L370.5 138.5M373.1 136.2L372.9 136.3M371.9 138.9L372 139.1\" opacity=\"0.75\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M358.7 130.7L358.5 130.9M358.5 130.9L358.3 131.1M358.3 131.1L358.1 131.3M358.1 131.3L357.9 131.6M357.9 131.6L357.8 131.9M357.8 131.9L357.7 132.2M357.7 132.2L357.6 132.5M357.6 132.5L357.6 132.8M357.6 132.8L357.6 133.1M357.6 133.1L357.7 133.3M360.1 131.3L359.9 131.4M359.9 131.4L359.7 131.6M359.7 131.6L359.5 131.9M359.5 131.9L359.3 132.1M359.3 132.1L359.2 132.4M359.2 132.4L359.1 132.7M359.1 132.7L359 133M359 133L359 133.3M359 133.3L359 133.6M359 133.6L359.1 133.9M361.5 131.8L361.3 132M361.3 132L361.1 132.2M361.1 132.2L360.9 132.4M360.9 132.4L360.8 132.7M360.8 132.7L360.6 133M360.6 133L360.5 133.3M360.5 133.3L360.5 133.6M360.5 133.6L360.4 133.9M360.4 133.9L360.4 134.2M360.4 134.2L360.5 134.4M362.9 132.4L362.7 132.5M362.7 132.5L362.5 132.7M362.5 132.7L362.4 133M362.4 133L362.2 133.2M362.2 133.2L362.1 133.5M362.1 133.5L362 133.8M362 133.8L361.9 134.2M361.9 134.2L361.9 134.5M361.9 134.5L361.9 134.7M361.9 134.7L361.9 135M364.3 133L364.1 133.1M364.1 133.1L364 133.3M364 133.3L363.8 133.5M363.8 133.5L363.6 133.8M363.6 133.8L363.5 134.1M363.5 134.1L363.4 134.4M363.4 134.4L363.3 134.7M363.3 134.7L363.3 135M363.3 135L363.3 135.3M363.3 135.3L363.3 135.5M365.8 133.5L365.6 133.7M365.6 133.7L365.4 133.9M365.4 133.9L365.2 134.1M365.2 134.1L365 134.4M365 134.4L364.9 134.7M364.9 134.7L364.8 135M364.8 135L364.7 135.3M364.7 135.3L364.7 135.6M364.7 135.6L364.7 135.8M364.7 135.8L364.8 136.1M367.2 134.1L367 134.2M367 134.2L366.8 134.4M366.8 134.4L366.6 134.6M366.6 134.6L366.5 134.9M366.5 134.9L366.3 135.2M366.3 135.2L366.2 135.5M366.2 135.5L366.2 135.8M366.2 135.8L366.1 136.1M366.1 136.1L366.1 136.4M366.1 136.4L366.2 136.6M368.6 134.6L368.4 134.8M368.4 134.8L368.2 135M368.2 135L368 135.2M368 135.2L367.9 135.5M367.9 135.5L367.7 135.8M367.7 135.8L367.6 136.1M367.6 136.1L367.6 136.4M367.6 136.4L367.6 136.7M367.6 136.7L367.6 136.9M367.6 136.9L367.6 137.2M370 135.2L369.8 135.3M369.8 135.3L369.6 135.5M369.6 135.5L369.5 135.8M369.5 135.8L369.3 136M369.3 136L369.2 136.3M369.2 136.3L369.1 136.6M369.1 136.6L369 136.9M369 136.9L369 137.2M369 137.2L369 137.5M369 137.5L369 137.7M371.5 135.7L371.3 135.9M371.3 135.9L371.1 136.1M371.1 136.1L370.9 136.3M370.9 136.3L370.7 136.6M370.7 136.6L370.6 136.9M370.6 136.9L370.5 137.2M370.5 137.2L370.4 137.5M370.4 137.5L370.4 137.8M370.4 137.8L370.4 138.1M370.4 138.1L370.5 138.3M372.9 136.3L372.7 136.4M372.7 136.4L372.5 136.6M372.5 136.6L372.3 136.9M372.3 136.9L372.1 137.1M372.1 137.1L372 137.4M372 137.4L371.9 137.7M371.9 137.7L371.8 138M371.8 138L371.8 138.3M371.8 138.3L371.8 138.6M371.8 138.6L371.9 138.9\"/><path class=\"iso-line tb-edge\" data-tone=\"mid\" d=\"M357.3 133.5L358.3 133.9L359.6 134.4L360.9 134.9L362.2 135.4L363.6 135.9L364.9 136.4L366.2 136.9L367.5 137.4L368.8 138L370.1 138.5L371.4 139L372.7 139.5L373.5 139.8M358.5 130.4L359.5 130.8L360.8 131.3L362.1 131.8L363.4 132.3L364.8 132.8L366.1 133.3L367.4 133.8L368.7 134.4L370 134.9L371.3 135.4L372.6 135.9L373.9 136.4L374.7 136.7M374.7 136.7L374.8 136.8L375 137L375.1 137.2L375.1 137.5L375.1 137.9L375 138.2L374.9 138.6L374.7 138.9L374.6 139.2L374.3 139.4L374.1 139.6L373.9 139.8L373.7 139.8L373.5 139.8M373.5 139.8L373.3 139.7L373.2 139.5L373.1 139.2L373.1 138.9L373.1 138.6L373.1 138.3L373.3 137.9L373.4 137.6L373.6 137.3L373.8 137L374 136.8L374.3 136.7L374.5 136.7L374.7 136.7\"/></g></g><g class=\"it\" data-name=\"cab.hinge.26\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M445.1 243.1L445.3 242.8L445.8 242.6L446.4 242.6L447 242.7L447.4 242.9L447.5 243.2L447.5 251.1L447.2 251.3L446.7 251.5L446.1 251.6L445.5 251.5L445.2 251.2L445.1 250.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M447.2 251.3L446.7 251.5L446.7 243.7L447.2 243.5ZM447.5 251.1L447.2 251.3L447.2 243.5L447.5 243.2Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M446.7 251.5L446.1 251.6L446.1 243.8L446.7 243.7Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M446.1 251.6L445.5 251.5L445.5 243.6L446.1 243.8Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M445.5 251.5L445.2 251.2L445.2 243.4L445.5 243.6ZM445.2 251.2L445.1 250.9L445.1 243.1L445.2 243.4Z\"/><path class=\"iso-top\" d=\"M447.2 243.5L446.7 243.7L446.1 243.8L445.5 243.6L445.2 243.4L445.1 243.1L445.3 242.8L445.8 242.6L446.4 242.6L447 242.7L447.4 242.9L447.5 243.2Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M447.5 243.2L447.2 243.5L446.7 243.7L446.1 243.8L445.5 243.6L445.2 243.4L445.1 243.1\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M445.1 243.1L445.3 242.8L445.8 242.6L446.4 242.6L447 242.7L447.4 242.9L447.5 243.2M447.5 251.1L447.2 251.3L446.7 251.5L446.1 251.6L445.5 251.5L445.2 251.2L445.1 250.9M445.1 243.1L445.1 250.9M447.5 243.2L447.5 251.1\"/></g></g><g class=\"it\" data-name=\"dial.plate\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M324.1 138.5L324.1 137.7L324.3 137L324.6 136.3L325.1 135.6L325.7 134.9L326.4 134.2L327.3 133.6L328.2 133.1L329.3 132.6L330.5 132.1L331.7 131.7L333 131.4L334.4 131.1L335.8 130.9L337.3 130.8L338.8 130.8L340.2 130.8L341.7 130.9L343.1 131L344.5 131.3L345.9 131.6L347.2 131.9L348.4 132.3L349.5 132.8L350.5 133.4L351.4 133.9L352.2 134.6L352.9 135.2L353.4 135.9L353.8 136.6L354 137.4L354.2 138.1L354.2 139.9L354.1 140.7L353.9 141.4L353.6 142.1L353.1 142.8L352.5 143.5L351.8 144.1L351 144.7L350 145.3L348.9 145.8L347.8 146.2L346.5 146.6L345.2 147L343.8 147.2L342.4 147.4L340.9 147.6L339.5 147.6L338 147.6L336.5 147.5L335.1 147.3L333.7 147.1L332.3 146.8L331.1 146.4L329.9 146L328.7 145.5L327.7 145L326.8 144.4L326 143.8L325.4 143.1L324.8 142.5L324.4 141.7L324.2 141L324.1 140.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M351 144.7L350 145.3L350 143.5L351 142.9ZM350 145.3L348.9 145.8L348.9 144L350 143.5ZM348.9 145.8L347.8 146.2L347.8 144.4L348.9 144ZM347.8 146.2L346.5 146.6L346.5 144.8L347.8 144.4ZM354.2 139.9L354.1 140.7L354.1 138.8L354.2 138.1ZM354.1 140.7L353.9 141.4L353.9 139.6L354.1 138.8ZM353.9 141.4L353.6 142.1L353.6 140.3L353.9 139.6ZM353.6 142.1L353.1 142.8L353.1 141L353.6 140.3ZM353.1 142.8L352.5 143.5L352.5 141.7L353.1 141ZM352.5 143.5L351.8 144.1L351.8 142.3L352.5 141.7ZM351.8 144.1L351 144.7L351 142.9L351.8 142.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M346.5 146.6L345.2 147L345.2 145.1L346.5 144.8ZM345.2 147L343.8 147.2L343.8 145.4L345.2 145.1ZM343.8 147.2L342.4 147.4L342.4 145.6L343.8 145.4ZM342.4 147.4L340.9 147.6L340.9 145.7L342.4 145.6ZM340.9 147.6L339.5 147.6L339.5 145.8L340.9 145.7Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M339.5 147.6L338 147.6L338 145.8L339.5 145.8ZM338 147.6L336.5 147.5L336.5 145.7L338 145.8ZM336.5 147.5L335.1 147.3L335.1 145.5L336.5 145.7ZM335.1 147.3L333.7 147.1L333.7 145.3L335.1 145.5ZM333.7 147.1L332.3 146.8L332.3 145L333.7 145.3ZM332.3 146.8L331.1 146.4L331.1 144.6L332.3 145Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M331.1 146.4L329.9 146L329.9 144.2L331.1 144.6ZM329.9 146L328.7 145.5L328.7 143.7L329.9 144.2ZM328.7 145.5L327.7 145L327.7 143.2L328.7 143.7ZM327.7 145L326.8 144.4L326.8 142.6L327.7 143.2ZM326.8 144.4L326 143.8L326 142L326.8 142.6ZM326 143.8L325.4 143.1L325.4 141.3L326 142ZM325.4 143.1L324.8 142.5L324.8 140.6L325.4 141.3ZM324.8 142.5L324.4 141.7L324.4 139.9L324.8 140.6ZM324.4 141.7L324.2 141L324.2 139.2L324.4 139.9ZM324.2 141L324.1 140.3L324.1 138.5L324.2 139.2Z\"/><path class=\"iso-top\" d=\"M351 142.9L350 143.5L348.9 144L347.8 144.4L346.5 144.8L345.2 145.1L343.8 145.4L342.4 145.6L340.9 145.7L339.5 145.8L338 145.8L336.5 145.7L335.1 145.5L333.7 145.3L332.3 145L331.1 144.6L329.9 144.2L328.7 143.7L327.7 143.2L326.8 142.6L326 142L325.4 141.3L324.8 140.6L324.4 139.9L324.2 139.2L324.1 138.5L324.1 137.7L324.3 137L324.6 136.3L325.1 135.6L325.7 134.9L326.4 134.2L327.3 133.6L328.2 133.1L329.3 132.6L330.5 132.1L331.7 131.7L333 131.4L334.4 131.1L335.8 130.9L337.3 130.8L338.8 130.8L340.2 130.8L341.7 130.9L343.1 131L344.5 131.3L345.9 131.6L347.2 131.9L348.4 132.3L349.5 132.8L350.5 133.4L351.4 133.9L352.2 134.6L352.9 135.2L353.4 135.9L353.8 136.6L354 137.4L354.2 138.1L354.1 138.8L353.9 139.6L353.6 140.3L353.1 141L352.5 141.7L351.8 142.3Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M354.2 138.1L354.1 138.8L353.9 139.6L353.6 140.3L353.1 141L352.5 141.7L351.8 142.3L351 142.9L350 143.5L348.9 144L347.8 144.4L346.5 144.8L345.2 145.1L343.8 145.4L342.4 145.6L340.9 145.7L339.5 145.8L338 145.8L336.5 145.7L335.1 145.5L333.7 145.3L332.3 145L331.1 144.6L329.9 144.2L328.7 143.7L327.7 143.2L326.8 142.6L326 142L325.4 141.3L324.8 140.6L324.4 139.9L324.2 139.2L324.1 138.5\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M354.2 138.1L353.5 138.8L353.3 139.5L353 140.2L352.6 140.9L352 141.5L351.3 142.1L350.5 142.7L349.6 143.3L348.5 143.7L347.4 144.2L346.2 144.6L345 144.9L343.6 145.1L342.3 145.3L340.9 145.4L339.5 145.5L338 145.5L336.6 145.4L335.3 145.2L333.9 145L332.6 144.7L331.4 144.4L330.2 144L329.2 143.5L328.2 143L327.3 142.4L326.5 141.8L325.9 141.2L325.4 140.5L325 139.8L324.8 139.2L324.1 138.5\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M324.1 138.5L324.1 137.7L324.3 137L324.6 136.3L325.1 135.6L325.7 134.9L326.4 134.2L327.3 133.6L328.2 133.1L329.3 132.6L330.5 132.1L331.7 131.7L333 131.4L334.4 131.1L335.8 130.9L337.3 130.8L338.8 130.8L340.2 130.8L341.7 130.9L343.1 131L344.5 131.3L345.9 131.6L347.2 131.9L348.4 132.3L349.5 132.8L350.5 133.4L351.4 133.9L352.2 134.6L352.9 135.2L353.4 135.9L353.8 136.6L354 137.4L354.2 138.1M354.2 139.9L354.1 140.7L353.9 141.4L353.6 142.1L353.1 142.8L352.5 143.5L351.8 144.1L351 144.7L350 145.3L348.9 145.8L347.8 146.2L346.5 146.6L345.2 147L343.8 147.2L342.4 147.4L340.9 147.6L339.5 147.6L338 147.6L336.5 147.5L335.1 147.3L333.7 147.1L332.3 146.8L331.1 146.4L329.9 146L328.7 145.5L327.7 145L326.8 144.4L326 143.8L325.4 143.1L324.8 142.5L324.4 141.7L324.2 141L324.1 140.3M324.1 138.5L324.1 140.3M354.2 138.1L354.2 139.9\"/></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M349.3 142.3L348.5 142.7L347.6 143.2L346.6 143.6L345.5 143.9L344.4 144.2L343.2 144.4L341.9 144.6L340.7 144.7L339.4 144.7L338.2 144.7L336.9 144.6L335.7 144.5L334.5 144.3L333.3 144L332.2 143.7L331.2 143.4L330.2 143L329.3 142.5L328.5 142L327.9 141.5L327.3 140.9L326.8 140.3L326.5 139.7L326.3 139.1L326.2 138.4L326.2 137.8L326.4 137.2L326.7 136.5L327 135.9L327.6 135.4L328.2 134.8L328.9 134.3L329.8 133.8L330.7 133.4L331.7 133L332.7 132.6L333.9 132.4L335.1 132.1L336.3 132L337.5 131.9L338.8 131.8L340.1 131.8L341.3 131.9L342.6 132L343.8 132.2L344.9 132.5L346 132.8L347.1 133.2L348 133.6L348.9 134L349.7 134.6L350.4 135.1L350.9 135.7L351.4 136.2L351.7 136.9L352 137.5L352 138.1L352 138.8L351.9 139.4L351.6 140L351.2 140.6L350.7 141.2L350 141.7Z\"/><path class=\"iso-line\" data-tone=\"lo\" data-mark=\"0\" d=\"M342.1 143.2L342.9 144.5\"/><path class=\"iso-line\" data-tone=\"lo\" data-mark=\"1\" d=\"M336.8 143.3L336.2 144.6\"/><path class=\"iso-line\" data-tone=\"lo\" data-mark=\"2\" d=\"M332.1 142L330.3 143\"/><path class=\"iso-line\" data-tone=\"lo\" data-mark=\"3\" d=\"M329.3 139.8L326.7 140.2\"/><path class=\"iso-line\" data-tone=\"lo\" d=\"M352.7 136.8L352 137.1L351.3 137.1L350.6 137L350.1 136.7L350 136.3L350.3 135.9L350.9 135.7L351.7 135.6L352.4 135.8L352.9 136.1L353 136.5ZM341 132.3L340.4 132.5L339.6 132.6L338.9 132.4L338.4 132.1L338.3 131.7L338.6 131.3L339.2 131.1L340 131.1L340.7 131.2L341.2 131.5L341.3 131.9Z\"/><g class=\"iso-dots\" data-tone=\"mid\"><circle cx=\"351.5\" cy=\"136.4\" r=\"0.35\"/><circle cx=\"339.8\" cy=\"131.8\" r=\"0.35\"/></g></g><g class=\"it\" data-name=\"dial.skirt\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M328.9 135.6L329 135L329.3 134.3L329.7 133.7L330.3 133.1L331.1 132.5L331.9 132L333 131.6L334.1 131.2L335.3 130.9L336.6 130.7L337.9 130.6L339.2 130.6L340.5 130.6L341.8 130.7L343.1 131L344.3 131.3L345.4 131.6L346.4 132.1L347.3 132.6L348 133.1L348.6 133.8L349 134.4L349.3 135L349.3 135.7L349.3 138.3L349.2 139L349 139.6L348.5 140.3L347.9 140.9L347.2 141.4L346.3 141.9L345.3 142.4L344.2 142.7L342.9 143L341.7 143.2L340.4 143.3L339 143.4L337.7 143.3L336.4 143.2L335.1 143L333.9 142.7L332.8 142.3L331.8 141.9L330.9 141.3L330.2 140.8L329.6 140.2L329.2 139.6L329 138.9L328.9 138.2Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M347.2 141.4L346.3 141.9L346.3 139.3L347.2 138.8ZM346.3 141.9L345.3 142.4L345.3 139.8L346.3 139.3ZM345.3 142.4L344.2 142.7L344.2 140.1L345.3 139.8ZM349.3 138.3L349.2 139L349.2 136.4L349.3 135.7ZM349.2 139L349 139.6L349 137L349.2 136.4ZM349 139.6L348.5 140.3L348.5 137.7L349 137ZM348.5 140.3L347.9 140.9L347.9 138.3L348.5 137.7ZM347.9 140.9L347.2 141.4L347.2 138.8L347.9 138.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M344.2 142.7L342.9 143L342.9 140.4L344.2 140.1ZM342.9 143L341.7 143.2L341.7 140.6L342.9 140.4ZM341.7 143.2L340.4 143.3L340.4 140.7L341.7 140.6ZM340.4 143.3L339 143.4L339 140.8L340.4 140.7Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M339 143.4L337.7 143.3L337.7 140.7L339 140.8ZM337.7 143.3L336.4 143.2L336.4 140.6L337.7 140.7ZM336.4 143.2L335.1 143L335.1 140.4L336.4 140.6ZM335.1 143L333.9 142.7L333.9 140.1L335.1 140.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M333.9 142.7L332.8 142.3L332.8 139.7L333.9 140.1ZM332.8 142.3L331.8 141.9L331.8 139.3L332.8 139.7ZM331.8 141.9L330.9 141.3L330.9 138.7L331.8 139.3ZM330.9 141.3L330.2 140.8L330.2 138.2L330.9 138.7ZM330.2 140.8L329.6 140.2L329.6 137.6L330.2 138.2ZM329.6 140.2L329.2 139.6L329.2 136.9L329.6 137.6ZM329.2 139.6L329 138.9L329 136.3L329.2 136.9ZM329 138.9L328.9 138.2L328.9 135.6L329 136.3Z\"/><path class=\"iso-top\" d=\"M347.2 138.8L346.3 139.3L345.3 139.8L344.2 140.1L342.9 140.4L341.7 140.6L340.4 140.7L339 140.8L337.7 140.7L336.4 140.6L335.1 140.4L333.9 140.1L332.8 139.7L331.8 139.3L330.9 138.7L330.2 138.2L329.6 137.6L329.2 136.9L329 136.3L328.9 135.6L329 135L329.3 134.3L329.7 133.7L330.3 133.1L331.1 132.5L331.9 132L333 131.6L334.1 131.2L335.3 130.9L336.6 130.7L337.9 130.6L339.2 130.6L340.5 130.6L341.8 130.7L343.1 131L344.3 131.3L345.4 131.6L346.4 132.1L347.3 132.6L348 133.1L348.6 133.8L349 134.4L349.3 135L349.3 135.7L349.2 136.4L349 137L348.5 137.7L347.9 138.3Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M349.3 135.7L349.2 136.4L349 137L348.5 137.7L347.9 138.3L347.2 138.8L346.3 139.3L345.3 139.8L344.2 140.1L342.9 140.4L341.7 140.6L340.4 140.7L339 140.8L337.7 140.7L336.4 140.6L335.1 140.4L333.9 140.1L332.8 139.7L331.8 139.3L330.9 138.7L330.2 138.2L329.6 137.6L329.2 136.9L329 136.3L328.9 135.6\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M349.3 135.7L348.8 136.3L348.5 137L348.1 137.6L347.5 138.1L346.8 138.7L346 139.2L345 139.6L343.9 139.9L342.8 140.2L341.6 140.4L340.3 140.5L339 140.6L337.8 140.5L336.5 140.4L335.3 140.2L334.2 139.9L333.1 139.5L332.1 139.1L331.3 138.6L330.6 138.1L330.1 137.5L329.7 136.9L329.4 136.3L328.9 135.6\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M328.9 135.6L329 135L329.3 134.3L329.7 133.7L330.3 133.1L331.1 132.5L331.9 132L333 131.6L334.1 131.2L335.3 130.9L336.6 130.7L337.9 130.6L339.2 130.6L340.5 130.6L341.8 130.7L343.1 131L344.3 131.3L345.4 131.6L346.4 132.1L347.3 132.6L348 133.1L348.6 133.8L349 134.4L349.3 135L349.3 135.7M349.3 138.3L349.2 139L349 139.6L348.5 140.3L347.9 140.9L347.2 141.4L346.3 141.9L345.3 142.4L344.2 142.7L342.9 143L341.7 143.2L340.4 143.3L339 143.4L337.7 143.3L336.4 143.2L335.1 143L333.9 142.7L332.8 142.3L331.8 141.9L330.9 141.3L330.2 140.8L329.6 140.2L329.2 139.6L329 138.9L328.9 138.2M328.9 135.6L328.9 138.2M349.3 135.7L349.3 138.3\"/></g></g><g class=\"it\" data-name=\"cable.clip.28\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M371.2 138.8L371.4 138.5L376.7 135.1L377.2 134.9L377.8 135L379.7 135.8L380 136L380 139.8L379.8 140.1L374.5 143.5L374 143.6L373.4 143.6L371.5 142.8L371.2 142.6Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M380 139.8L379.8 140.1L379.8 136.3L380 136ZM379.8 140.1L374.5 143.5L374.5 139.7L379.8 136.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M374.5 143.5L374 143.6L374 139.9L374.5 139.7Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M374 143.6L373.4 143.6L373.4 139.8L374 139.9Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M373.4 143.6L371.5 142.8L371.5 139L373.4 139.8ZM371.5 142.8L371.2 142.6L371.2 138.8L371.5 139Z\"/><path class=\"iso-top\" d=\"M379.7 135.8L380 136L379.8 136.3L374.5 139.7L374 139.9L373.4 139.8L371.5 139L371.2 138.8L371.4 138.5L376.7 135.1L377.2 134.9L377.8 135Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M380 136L379.8 136.3L374.5 139.7L374 139.9L373.4 139.8L371.5 139L371.2 138.8\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M380 136L379.6 136.2L374.3 139.6L373.9 139.7L373.5 139.7L371.7 138.9L371.2 138.8\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M371.2 138.8L371.4 138.5L376.7 135.1L377.2 134.9L377.8 135L379.7 135.8L380 136M380 139.8L379.8 140.1L374.5 143.5L374 143.6L373.4 143.6L371.5 142.8L371.2 142.6M380 136L380 139.8M371.2 138.8L371.2 142.6\"/></g><g class=\"iso-dots\" data-tone=\"mid\"><circle cx=\"378\" cy=\"135.9\" r=\"0.35\"/><circle cx=\"373.2\" cy=\"138.9\" r=\"0.35\"/></g></g><g class=\"it\" data-name=\"dial.knob\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M331.9 127.8L332 127.3L332.2 126.9L332.5 126.4L332.9 126L333.4 125.6L334.1 125.3L334.8 125L335.6 124.7L336.4 124.5L337.3 124.4L338.2 124.3L339.2 124.2L340.1 124.3L341 124.4L341.9 124.5L342.8 124.7L343.6 125L344.3 125.3L344.9 125.7L345.4 126.1L345.8 126.5L346.1 126.9L346.3 127.4L346.3 127.9L346.3 135.7L346.3 136.2L346.1 136.6L345.8 137.1L345.3 137.5L344.8 137.9L344.2 138.2L343.5 138.5L342.7 138.8L341.8 139L340.9 139.2L340 139.2L339.1 139.3L338.1 139.2L337.2 139.1L336.3 139L335.5 138.8L334.7 138.5L334 138.2L333.3 137.8L332.8 137.4L332.4 137L332.1 136.6L331.9 136.1L331.9 135.6Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M344.8 137.9L344.2 138.2L344.2 130.4L344.8 130.1ZM344.2 138.2L343.5 138.5L343.5 130.7L344.2 130.4ZM343.5 138.5L342.7 138.8L342.7 131L343.5 130.7ZM346.3 135.7L346.3 136.2L346.3 128.4L346.3 127.9ZM346.3 136.2L346.1 136.6L346.1 128.8L346.3 128.4ZM346.1 136.6L345.8 137.1L345.8 129.3L346.1 128.8ZM345.8 137.1L345.3 137.5L345.3 129.7L345.8 129.3ZM345.3 137.5L344.8 137.9L344.8 130.1L345.3 129.7Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M342.7 138.8L341.8 139L341.8 131.2L342.7 131ZM341.8 139L340.9 139.2L340.9 131.3L341.8 131.2ZM340.9 139.2L340 139.2L340 131.4L340.9 131.3ZM340 139.2L339.1 139.3L339.1 131.5L340 131.4Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M339.1 139.3L338.1 139.2L338.1 131.4L339.1 131.5ZM338.1 139.2L337.2 139.1L337.2 131.3L338.1 131.4ZM337.2 139.1L336.3 139L336.3 131.2L337.2 131.3ZM336.3 139L335.5 138.8L335.5 131L336.3 131.2Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M335.5 138.8L334.7 138.5L334.7 130.7L335.5 131ZM334.7 138.5L334 138.2L334 130.4L334.7 130.7ZM334 138.2L333.3 137.8L333.3 130L334 130.4ZM333.3 137.8L332.8 137.4L332.8 129.6L333.3 130ZM332.8 137.4L332.4 137L332.4 129.2L332.8 129.6ZM332.4 137L332.1 136.6L332.1 128.8L332.4 129.2ZM332.1 136.6L331.9 136.1L331.9 128.3L332.1 128.8ZM331.9 136.1L331.9 135.6L331.9 127.8L331.9 128.3Z\"/><path class=\"iso-top\" d=\"M344.8 130.1L344.2 130.4L343.5 130.7L342.7 131L341.8 131.2L340.9 131.3L340 131.4L339.1 131.5L338.1 131.4L337.2 131.3L336.3 131.2L335.5 131L334.7 130.7L334 130.4L333.3 130L332.8 129.6L332.4 129.2L332.1 128.8L331.9 128.3L331.9 127.8L332 127.3L332.2 126.9L332.5 126.4L332.9 126L333.4 125.6L334.1 125.3L334.8 125L335.6 124.7L336.4 124.5L337.3 124.4L338.2 124.3L339.2 124.2L340.1 124.3L341 124.4L341.9 124.5L342.8 124.7L343.6 125L344.3 125.3L344.9 125.7L345.4 126.1L345.8 126.5L346.1 126.9L346.3 127.4L346.3 127.9L346.3 128.4L346.1 128.8L345.8 129.3L345.3 129.7Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M346.3 127.9L346.3 128.4L346.1 128.8L345.8 129.3L345.3 129.7L344.8 130.1L344.2 130.4L343.5 130.7L342.7 131L341.8 131.2L340.9 131.3L340 131.4L339.1 131.5L338.1 131.4L337.2 131.3L336.3 131.2L335.5 131L334.7 130.7L334 130.4L333.3 130L332.8 129.6L332.4 129.2L332.1 128.8L331.9 128.3L331.9 127.8\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M331.9 127.8L332 127.3L332.2 126.9L332.5 126.4L332.9 126L333.4 125.6L334.1 125.3L334.8 125L335.6 124.7L336.4 124.5L337.3 124.4L338.2 124.3L339.2 124.2L340.1 124.3L341 124.4L341.9 124.5L342.8 124.7L343.6 125L344.3 125.3L344.9 125.7L345.4 126.1L345.8 126.5L346.1 126.9L346.3 127.4L346.3 127.9M346.3 135.7L346.3 136.2L346.1 136.6L345.8 137.1L345.3 137.5L344.8 137.9L344.2 138.2L343.5 138.5L342.7 138.8L341.8 139L340.9 139.2L340 139.2L339.1 139.3L338.1 139.2L337.2 139.1L336.3 139L335.5 138.8L334.7 138.5L334 138.2L333.3 137.8L332.8 137.4L332.4 137L332.1 136.6L331.9 136.1L331.9 135.6M331.9 127.8L331.9 135.6M346.3 127.9L346.3 135.7\"/></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M344.8 136.7L344.8 130.5M343.8 137.3L343.8 131M342.5 137.7L342.5 131.4M341.1 138L341.1 131.7M339.6 138.1L339.6 131.8M338.1 138.1L338.1 131.8M336.6 137.9L336.6 131.6M335.3 137.6L335.3 131.3M334.1 137.1L334.1 130.8M333.1 136.5L333.1 130.3M332.4 135.8L332.4 129.6M332 135.1L332 128.9M346.1 135.4L346.1 129.1M345.6 136.1L345.6 129.8\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M346.3 134.9L346.3 135.4L346.1 135.8L345.8 136.3L345.4 136.7L344.8 137.1L344.2 137.4L343.5 137.7L342.7 138L341.9 138.2L341 138.4L340.1 138.5L339.1 138.5L338.2 138.5L337.2 138.4L336.4 138.2L335.5 138L334.7 137.7L334 137.4L333.4 137.1L332.9 136.7L332.4 136.3L332.1 135.8L332 135.4L331.9 134.9\"/><path class=\"iso-line\" data-tone=\"hi\" data-part=\"pointer\" data-free=\"end\" d=\"M339.5 128.5L340.9 130.8\" style=\"stroke-width:1\"/><g class=\"iso-dots\" data-tone=\"hi\"><circle cx=\"339.1\" cy=\"127.9\" r=\"0.5\"/></g></g><g class=\"it\" data-name=\"cable.reader:5\"><g class=\"tb\"><path class=\"tb-body\" d=\"M376.6 141L376.7 141L378 141.5L379.3 142L380.6 142.6L381.9 143.1L383.2 143.6L384.5 144.1L385.8 144.6L387.1 145.1L388.1 145.5L389.3 142.4L388.3 142L387 141.5L385.7 141L384.4 140.5L383.1 140L381.8 139.5L380.5 139L379.2 138.5L377.9 137.9L377.8 137.9ZM377.6 137.9L377.3 137.9L377.1 138L376.9 138.2L376.7 138.5L376.5 138.8L376.3 139.1L376.2 139.5L376.2 139.8L376.1 140.2L376.2 140.4L376.3 140.7L376.4 140.9L376.6 141L376.8 141L377 141L377.2 140.8L377.4 140.7L377.6 140.4L377.8 140.1L378 139.8L378.1 139.4L378.2 139.1L378.2 138.7L378.1 138.4L378.1 138.2L377.9 138L377.8 137.9Z\"/><path class=\"tb-shine\" d=\"M377.2 139.4L377.3 139.5L378.6 140L379.9 140.5L381.2 141L382.5 141.5L383.8 142L385.1 142.5L386.4 143L387.8 143.6L389.1 144.1L389.3 144.2L389.6 143.4L389.4 143.3L388 142.8L386.7 142.3L385.4 141.8L384.1 141.3L382.8 140.8L381.5 140.3L380.2 139.7L378.9 139.2L377.6 138.7L377.5 138.7L376.7 138.4L376.7 138.5L376.5 138.8L376.3 139.1Z\"/><path class=\"tb-shade\" d=\"M376.8 140.3L376.9 140.3L378.2 140.9L379.5 141.4L380.9 141.9L382.2 142.4L383.5 142.9L384.8 143.4L386.1 143.9L387.4 144.4L388.7 144.9L389 145L389.2 144.4L389 144.3L387.6 143.8L386.3 143.3L385 142.8L383.7 142.3L382.4 141.8L381.1 141.3L379.8 140.7L378.5 140.2L377.2 139.7L377.1 139.7L376.3 139.4L376.2 139.5L376.2 139.8L376.1 140Z\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M379 138.4L378.8 138.4M377.7 141.3L377.8 141.4M380.4 139L380.2 139M379.1 141.8L379.2 142M381.8 139.5L381.6 139.5M380.5 142.4L380.6 142.5M383.2 140.1L383 140.1M381.9 142.9L382 143.1M384.6 140.6L384.5 140.7M383.3 143.5L383.5 143.6M386.1 141.2L385.9 141.2M384.8 144.1L384.9 144.2M387.5 141.7L387.3 141.8M386.2 144.6L386.3 144.8M388.9 142.3L388.7 142.3M387.6 145.2L387.7 145.3\" opacity=\"0.25\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M378.8 138.4L378.6 138.5M377.6 141.1L377.7 141.3M380.2 139L380 139.1M379 141.6L379.1 141.8M381.6 139.5L381.4 139.6M380.4 142.2L380.5 142.4M383 140.1L382.8 140.2M381.8 142.7L381.9 142.9M384.5 140.7L384.3 140.7M383.3 143.3L383.3 143.5M385.9 141.2L385.7 141.3M384.7 143.9L384.8 144.1M387.3 141.8L387.1 141.8M386.1 144.4L386.2 144.6M388.7 142.3L388.5 142.4M387.5 145L387.6 145.2\" opacity=\"0.75\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M378.6 138.5L378.4 138.7M378.4 138.7L378.2 138.9M378.2 138.9L378 139.1M378 139.1L377.8 139.4M377.8 139.4L377.7 139.7M377.7 139.7L377.6 140M377.6 140L377.5 140.3M377.5 140.3L377.5 140.6M377.5 140.6L377.5 140.8M377.5 140.8L377.6 141.1M380 139.1L379.8 139.2M379.8 139.2L379.6 139.4M379.6 139.4L379.4 139.6M379.4 139.6L379.3 139.9M379.3 139.9L379.1 140.2M379.1 140.2L379 140.5M379 140.5L379 140.8M379 140.8L378.9 141.1M378.9 141.1L378.9 141.4M378.9 141.4L379 141.6M381.4 139.6L381.2 139.8M381.2 139.8L381 140M381 140L380.8 140.2M380.8 140.2L380.7 140.5M380.7 140.5L380.5 140.8M380.5 140.8L380.4 141.1M380.4 141.1L380.4 141.4M380.4 141.4L380.4 141.7M380.4 141.7L380.4 141.9M380.4 141.9L380.4 142.2M382.8 140.2L382.6 140.3M382.6 140.3L382.4 140.5M382.4 140.5L382.3 140.8M382.3 140.8L382.1 141M382.1 141L382 141.3M382 141.3L381.9 141.6M381.9 141.6L381.8 141.9M381.8 141.9L381.8 142.2M381.8 142.2L381.8 142.5M381.8 142.5L381.8 142.7M384.3 140.7L384.1 140.9M384.1 140.9L383.9 141.1M383.9 141.1L383.7 141.3M383.7 141.3L383.5 141.6M383.5 141.6L383.4 141.9M383.4 141.9L383.3 142.2M383.3 142.2L383.2 142.5M383.2 142.5L383.2 142.8M383.2 142.8L383.2 143.1M383.2 143.1L383.3 143.3M385.7 141.3L385.5 141.4M385.5 141.4L385.3 141.6M385.3 141.6L385.1 141.9M385.1 141.9L384.9 142.1M384.9 142.1L384.8 142.4M384.8 142.4L384.7 142.7M384.7 142.7L384.6 143M384.6 143L384.6 143.3M384.6 143.3L384.6 143.6M384.6 143.6L384.7 143.9M387.1 141.8L386.9 142M386.9 142L386.7 142.2M386.7 142.2L386.5 142.4M386.5 142.4L386.4 142.7M386.4 142.7L386.2 143M386.2 143L386.1 143.3M386.1 143.3L386.1 143.6M386.1 143.6L386 143.9M386 143.9L386.1 144.2M386.1 144.2L386.1 144.4M388.5 142.4L388.3 142.5M388.3 142.5L388.1 142.7M388.1 142.7L388 143M388 143L387.8 143.2M387.8 143.2L387.7 143.5M387.7 143.5L387.6 143.9M387.6 143.9L387.5 144.2M387.5 144.2L387.5 144.5M387.5 144.5L387.5 144.7M387.5 144.7L387.5 145\"/><path class=\"iso-line tb-edge\" data-tone=\"mid\" d=\"M376.6 141L376.7 141L378 141.5L379.3 142L380.6 142.6L381.9 143.1L383.2 143.6L384.5 144.1L385.8 144.6L387.1 145.1L388.1 145.5M377.8 137.9L377.9 137.9L379.2 138.5L380.5 139L381.8 139.5L383.1 140L384.4 140.5L385.7 141L387 141.5L388.3 142L389.3 142.4M376.6 141L376.4 140.9L376.3 140.7L376.2 140.4L376.1 140.2L376.2 139.8L376.2 139.5L376.3 139.1L376.5 138.8L376.7 138.5L376.9 138.2L377.1 138L377.3 137.9L377.6 137.9L377.8 137.9\"/></g></g><g class=\"it\" data-name=\"mate.foot\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M259.1 302.5L260.5 300.9L265.1 297.9L267.9 296.9L271.4 296.7L274.6 297.3L280.6 299.7L282.7 301.1L283.1 302.8L283.1 304.7L281.7 306.4L277.1 309.3L274.3 310.4L270.8 310.6L267.6 309.9L261.7 307.6L259.6 306.2L259.1 304.5Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M283.1 304.7L281.7 306.4L281.7 304.4L283.1 302.8ZM281.7 306.4L277.1 309.3L277.1 307.4L281.7 304.4ZM277.1 309.3L274.3 310.4L274.3 308.4L277.1 307.4Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M274.3 310.4L270.8 310.6L270.8 308.6L274.3 308.4Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M270.8 310.6L267.6 309.9L267.6 308L270.8 308.6Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M267.6 309.9L261.7 307.6L261.7 305.6L267.6 308ZM261.7 307.6L259.6 306.2L259.6 304.2L261.7 305.6ZM259.6 306.2L259.1 304.5L259.1 302.5L259.6 304.2Z\"/><path class=\"iso-top\" d=\"M280.6 299.7L282.7 301.1L283.1 302.8L281.7 304.4L277.1 307.4L274.3 308.4L270.8 308.6L267.6 308L261.7 305.6L259.6 304.2L259.1 302.5L260.5 300.9L265.1 297.9L267.9 296.9L271.4 296.7L274.6 297.3Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M283.1 302.8L281.7 304.4L277.1 307.4L274.3 308.4L270.8 308.6L267.6 308L261.7 305.6L259.6 304.2L259.1 302.5\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M259.1 302.5L260.5 300.9L265.1 297.9L267.9 296.9L271.4 296.7L274.6 297.3L280.6 299.7L282.7 301.1L283.1 302.8M283.1 304.7L281.7 306.4L277.1 309.3L274.3 310.4L270.8 310.6L267.6 309.9L261.7 307.6L259.6 306.2L259.1 304.5M283.1 302.8L283.1 304.7M259.1 302.5L259.1 304.5\"/></g><g class=\"iso-dots\" data-tone=\"mid\"><circle cx=\"269.7\" cy=\"296.9\" r=\"0.4\"/><circle cx=\"282.5\" cy=\"301.9\" r=\"0.4\"/><circle cx=\"259.7\" cy=\"303.3\" r=\"0.4\"/><circle cx=\"272.5\" cy=\"308.3\" r=\"0.4\"/></g></g><g class=\"it\" data-name=\"cable.reader:6\"><g class=\"tb\"><path class=\"tb-body\" d=\"M386.9 145L387.1 145.1L388.5 145.6L389.8 146.1L391.3 146.7L392.9 146.9L394.3 146.8L395.5 146.7L396.7 146.6L397.6 146.5L398.2 146.6L399 143.4L397.9 143.2L396.4 143.3L395.2 143.4L394 143.5L393 143.6L392.1 143.5L390.9 143.1L389.7 142.5L388.3 142L388.1 141.9ZM398.7 143.4L398.5 143.5L398.3 143.6L398 143.9L397.9 144.1L397.7 144.5L397.6 144.8L397.6 145.2L397.6 145.5L397.6 145.9L397.7 146.2L397.8 146.4L398 146.6L398.2 146.7L398.4 146.7L398.7 146.6L398.9 146.4L399.1 146.2L399.3 145.9L399.5 145.6L399.6 145.3L399.6 144.9L399.6 144.5L399.6 144.2L399.5 143.9L399.3 143.7L399.2 143.5L398.9 143.4Z\"/><path class=\"tb-shine\" d=\"M386.9 143.2L387.8 143.6L389.1 144.1L390.4 144.6L391.7 145L392.9 145L394.1 144.9L395.3 144.8L396.5 144.7L397.8 144.7L398.6 144.9L397.6 144.7L397.7 144.5L397.9 144.1L398 144L398.8 144.2L397.9 143.9L396.5 143.9L395.3 144L394.1 144.1L393 144.2L391.9 144.2L390.7 143.8L389.4 143.3L388 142.8L387.2 142.5Z\"/><path class=\"tb-shade\" d=\"M386.6 144.1L387.4 144.4L388.7 144.9L390 145.5L391.4 146.1L392.9 146.4L394.3 146.4L395.5 146.3L396.6 146.1L397.7 146L398.3 146L397.6 145.9L397.6 145.5L397.6 145.2L397.6 145.2L398.5 145.4L397.7 145.3L396.6 145.5L395.4 145.6L394.2 145.7L392.9 145.7L391.6 145.4L390.3 144.9L389 144.3L387.6 143.8L386.8 143.5Z\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M387.5 141.7L387.3 141.8M386.2 144.6L386.3 144.8M388.9 142.3L388.7 142.3M387.6 145.2L387.7 145.3M390.3 142.8L390.1 142.9M389 145.7L389.2 145.9\" opacity=\"0.25\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M387.3 141.8L387.1 141.8M386.1 144.4L386.2 144.6M388.7 142.3L388.5 142.4M387.5 145L387.6 145.2M390.1 142.9L389.9 143M388.9 145.5L389 145.7\" opacity=\"0.75\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M387.1 141.8L386.9 142M386.9 142L386.7 142.2M386.7 142.2L386.5 142.4M386.5 142.4L386.4 142.7M386.4 142.7L386.2 143M386.2 143L386.1 143.3M386.1 143.3L386.1 143.6M386.1 143.6L386 143.9M386 143.9L386.1 144.2M386.1 144.2L386.1 144.4M388.5 142.4L388.3 142.5M388.3 142.5L388.1 142.7M388.1 142.7L388 143M388 143L387.8 143.2M387.8 143.2L387.7 143.5M387.7 143.5L387.6 143.9M387.6 143.9L387.5 144.2M387.5 144.2L387.5 144.5M387.5 144.5L387.5 144.7M387.5 144.7L387.5 145M389.9 143L389.7 143.1M389.7 143.1L389.5 143.3M389.5 143.3L389.4 143.5M389.4 143.5L389.2 143.8M389.2 143.8L389.1 144.1M389.1 144.1L389 144.4M389 144.4L388.9 144.7M388.9 144.7L388.9 145M388.9 145L388.9 145.3M388.9 145.3L388.9 145.5M391.2 143.5L391 143.6M391 143.6L390.8 143.8M390.8 143.8L390.7 144.1M390.7 144.1L390.5 144.4M390.5 144.4L390.4 144.7M390.4 144.7L390.3 145M390.3 145L390.3 145.3M390.3 145.3L390.3 145.6M390.3 145.6L390.3 145.9M390.3 145.9L390.4 146.1M392 144L391.9 144.2M391.9 144.2L391.8 144.5M391.8 144.5L391.7 144.8M391.7 144.8L391.6 145.1M391.6 145.1L391.6 145.5M391.6 145.5L391.7 145.8M391.7 145.8L391.8 146.1M391.8 146.1L391.9 146.3M393.1 144L393 144.3M393 144.3L392.9 144.6M392.9 144.6L392.9 144.9M392.9 144.9L392.9 145.2M392.9 145.2L393 145.6M393 145.6L393 145.9M393 145.9L393.2 146.1M393.2 146.1L393.3 146.4M394.4 143.9L394.3 144.2M394.3 144.2L394.2 144.5M394.2 144.5L394.2 144.8M394.2 144.8L394.2 145.1M394.2 145.1L394.3 145.4M394.3 145.4L394.4 145.8M394.4 145.8L394.5 146M394.5 146L394.6 146.3M395.8 143.8L395.6 144.1M395.6 144.1L395.6 144.3M395.6 144.3L395.5 144.7M395.5 144.7L395.5 145M395.5 145L395.6 145.3M395.6 145.3L395.6 145.6M395.6 145.6L395.8 145.9M395.8 145.9L395.9 146.1M397.4 143.6L397.2 143.9M397.2 143.9L397.1 144.1M397.1 144.1L397 144.4M397 144.4L396.9 144.8M396.9 144.8L396.9 145.1M396.9 145.1L396.9 145.4M396.9 145.4L397 145.7M397 145.7L397.1 146\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M391.6 143.3L391.4 143.4M390.5 146.3L390.7 146.4M398 143.3L397.8 143.3M397.4 146.4L397.6 146.5\" opacity=\"0.20\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M391.4 143.4L391.2 143.5M390.4 146.1L390.5 146.3\" opacity=\"0.70\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M392.6 143.6L392.4 143.6M392.2 146.7L392.4 146.8M393.7 143.5L393.5 143.7M393.7 146.7L394 146.8M395 143.4L394.8 143.5M395 146.6L395.3 146.7M396.3 143.3L396.1 143.4M396.3 146.5L396.5 146.5\" opacity=\"0.15\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M392.4 143.6L392.2 143.8M392 146.5L392.2 146.7\" opacity=\"0.60\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M392.2 143.8L392 144M391.9 146.3L392 146.5M397.6 143.5L397.4 143.6M397.1 146L397.2 146.2\" opacity=\"0.95\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M393.5 143.7L393.3 143.8M393.5 146.6L393.7 146.7M394.8 143.5L394.6 143.7M394.8 146.5L395 146.6M396.1 143.4L395.9 143.6M396.1 146.3L396.3 146.5\" opacity=\"0.55\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M393.3 143.8L393.1 144M393.3 146.4L393.5 146.6M394.6 143.7L394.4 143.9M394.6 146.3L394.8 146.5M395.9 143.6L395.8 143.8M395.9 146.1L396.1 146.3\" opacity=\"0.90\"/><path class=\"tb-ring\" data-tone=\"lo\" d=\"M397.8 143.3L397.6 143.5M397.2 146.2L397.4 146.4\" opacity=\"0.65\"/><path class=\"iso-line tb-edge\" data-tone=\"mid\" d=\"M386.9 145L387.1 145.1L388.5 145.6L389.8 146.1L391.3 146.7L392.9 146.9L394.3 146.8L395.5 146.7L396.7 146.6L397.6 146.5L398.2 146.6M388.1 141.9L388.3 142L389.7 142.5L390.9 143.1L392.1 143.5L393 143.6L394 143.5L395.2 143.4L396.4 143.3L397.9 143.2L399 143.4M398.9 143.4L399.2 143.5L399.3 143.7L399.5 143.9L399.6 144.2L399.6 144.5L399.6 144.9L399.6 145.3L399.5 145.6L399.3 145.9L399.1 146.2L398.9 146.4L398.7 146.6L398.4 146.7L398.2 146.7M398.2 146.7L398 146.6L397.8 146.4L397.7 146.2L397.6 145.9L397.6 145.5L397.6 145.2L397.6 144.8L397.7 144.5L397.9 144.1L398 143.9L398.3 143.6L398.5 143.5L398.7 143.4L398.9 143.4\"/></g></g><g class=\"it\" data-name=\"cable.reader.shell1\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M396.6 146.2L396.7 145.4L396.9 144.6L397.2 143.9L397.6 143.2L398 142.6L398.5 142.2L399 142L399.5 142L402.6 143.2L403 143.4L403.4 143.7L403.5 144.3L403.6 144.9L403.5 145.7L403.4 146.4L403 147.2L402.6 147.9L402.2 148.5L401.7 148.9L401.2 149.1L400.7 149.1L397.6 147.9L397.2 147.7L396.9 147.4L396.7 146.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M397.6 147.9L397.2 147.7L396.9 147.4L400 148.6L400.3 149L400.7 149.1ZM399.7 147.4L399.8 146.6L400 145.9L400.3 145.1L400.7 144.4L401.2 143.8L401.7 143.4L402.2 143.2L402.6 143.2L403 143.4L403.4 143.7L403.5 144.3L403.6 144.9L403.5 145.7L403.4 146.4L403 147.2L402.6 147.9L402.2 148.5L401.7 148.9L401.2 149.1L400.7 149.1L400.3 149L400 148.6L399.8 148.1L399.7 147.4L401.7 146.2L401.7 146.2L401.7 146.2L401.7 146.2L401.7 146.2L401.7 146.2L401.7 146.2L401.7 146.2L401.7 146.2L401.7 146.2L401.7 146.2L401.7 146.2L401.7 146.2L401.7 146.2L401.7 146.2L401.7 146.2L401.7 146.2L401.7 146.2L401.7 146.2L401.7 146.2L401.7 146.2L401.7 146.2L401.7 146.2L401.7 146.2L401.7 146.2Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M396.9 147.4L396.7 146.8L399.8 148.1L400 148.6Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M396.7 146.8L396.6 146.2L399.7 147.4L399.8 148.1Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M396.6 146.2L396.7 145.4L399.8 146.6L399.7 147.4ZM399 142L399.5 142L402.6 143.2L402.2 143.2Z\"/><path class=\"iso-top\" d=\"M396.7 145.4L396.9 144.6L397.2 143.9L397.6 143.2L398 142.6L398.5 142.2L399 142L402.2 143.2L401.7 143.4L401.2 143.8L400.7 144.4L400.3 145.1L400 145.9L399.8 146.6Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M400.5 149.1L400 148.5L399.7 147.5L399.9 146.2L400.4 144.9L401.2 143.9L402 143.3L402.8 143.2\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M400.5 149.1L400.1 148.2L399.9 147L400.3 145.6L401 144.4L401.9 143.6L402.8 143.2\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M396.6 146.2L396.7 145.4L396.9 144.6L397.2 143.9L397.6 143.2L398 142.6L398.5 142.2L399 142L399.5 142L402.6 143.2L403 143.4L403.4 143.7L403.5 144.3L403.6 144.9L403.5 145.7L403.4 146.4L403 147.2L402.6 147.9L402.2 148.5L401.7 148.9L401.2 149.1L400.7 149.1L397.6 147.9L397.2 147.7L396.9 147.4L396.7 146.8Z\"/></g></g><g class=\"it\" data-name=\"paddle\"><g data-part=\"paddle\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M278 189.3L319.9 162.5L322.7 163.6L322.7 234L280.9 260.7L278 259.6Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M280.9 190.4L322.7 163.6L322.7 234L280.9 260.7Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M278 189.3L280.9 190.4L280.9 260.7L278 259.6Z\"/><path class=\"iso-top\" d=\"M322.7 163.6L280.9 190.4L278 189.3L319.9 162.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M278 189.3L280.9 190.4L322.7 163.6\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M278 189.3L280.8 190.1L322.7 163.6\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M319 231.1L284.6 253.2L284.6 193.3L319 171.2Z\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M322.7 163.6L319.9 162.5L278 189.3M278 259.6L280.9 260.7L322.7 234M278 189.3L278 259.6M322.7 163.6L322.7 234\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M277.4 190L277.4 189.6L277.8 189.2L278.4 188.9L279.2 188.8L280 188.8L280.7 189L281.3 189.3L281.5 189.7L281.5 260.1L281.5 260.5L281.1 260.8L280.5 261.1L279.7 261.2L278.9 261.2L278.1 261L277.6 260.7L277.4 260.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M281.1 260.8L280.5 261.1L280.5 190.8L281.1 190.5ZM281.5 260.1L281.5 260.5L281.5 190.1L281.5 189.7ZM281.5 260.5L281.1 260.8L281.1 190.5L281.5 190.1Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M280.5 261.1L279.7 261.2L279.7 190.9L280.5 190.8Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M279.7 261.2L278.9 261.2L278.9 190.9L279.7 190.9ZM278.9 261.2L278.1 261L278.1 190.7L278.9 190.9Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M278.1 261L277.6 260.7L277.6 190.4L278.1 190.7ZM277.6 260.7L277.4 260.3L277.4 190L277.6 190.4Z\"/><path class=\"iso-top\" d=\"M281.1 190.5L280.5 190.8L279.7 190.9L278.9 190.9L278.1 190.7L277.6 190.4L277.4 190L277.4 189.6L277.8 189.2L278.4 188.9L279.2 188.8L280 188.8L280.7 189L281.3 189.3L281.5 189.7L281.5 190.1Z\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M277.4 190L277.4 189.6L277.8 189.2L278.4 188.9L279.2 188.8L280 188.8L280.7 189L281.3 189.3L281.5 189.7M281.5 260.1L281.5 260.5L281.1 260.8L280.5 261.1L279.7 261.2L278.9 261.2L278.1 261L277.6 260.7L277.4 260.3M277.4 190L277.4 260.3M281.5 189.7L281.5 260.1\"/></g></g></g><g class=\"it\" data-name=\"post.collar.top\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M316.7 157.5L316.9 156.7L317.3 156.1L317.9 155.4L318.6 154.8L319.6 154.3L320.7 153.9L321.9 153.5L323.3 153.3L324.6 153.1L326.1 153.1L327.5 153.2L328.8 153.4L330.1 153.7L331.3 154.1L332.3 154.5L333.2 155.1L333.9 155.7L334.4 156.4L334.7 157.1L334.8 157.8L334.8 160.4L334.6 161.1L334.2 161.8L333.6 162.4L332.9 163L331.9 163.5L330.8 164L329.6 164.3L328.2 164.6L326.8 164.7L325.4 164.7L324 164.6L322.7 164.5L321.4 164.2L320.2 163.8L319.1 163.3L318.3 162.7L317.6 162.1L317.1 161.5L316.8 160.8L316.7 160.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M332.9 163L331.9 163.5L331.9 160.9L332.9 160.4ZM331.9 163.5L330.8 164L330.8 161.4L331.9 160.9ZM334.8 160.4L334.6 161.1L334.6 158.5L334.8 157.8ZM334.6 161.1L334.2 161.8L334.2 159.2L334.6 158.5ZM334.2 161.8L333.6 162.4L333.6 159.8L334.2 159.2ZM333.6 162.4L332.9 163L332.9 160.4L333.6 159.8Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M330.8 164L329.6 164.3L329.6 161.7L330.8 161.4ZM329.6 164.3L328.2 164.6L328.2 161.9L329.6 161.7ZM328.2 164.6L326.8 164.7L326.8 162.1L328.2 161.9ZM326.8 164.7L325.4 164.7L325.4 162.1L326.8 162.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M325.4 164.7L324 164.6L324 162L325.4 162.1ZM324 164.6L322.7 164.5L322.7 161.8L324 162ZM322.7 164.5L321.4 164.2L321.4 161.6L322.7 161.8Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M321.4 164.2L320.2 163.8L320.2 161.2L321.4 161.6ZM320.2 163.8L319.1 163.3L319.1 160.7L320.2 161.2ZM319.1 163.3L318.3 162.7L318.3 160.1L319.1 160.7ZM318.3 162.7L317.6 162.1L317.6 159.5L318.3 160.1ZM317.6 162.1L317.1 161.5L317.1 158.9L317.6 159.5ZM317.1 161.5L316.8 160.8L316.8 158.2L317.1 158.9ZM316.8 160.8L316.7 160.1L316.7 157.5L316.8 158.2Z\"/><path class=\"iso-top\" d=\"M332.9 160.4L331.9 160.9L330.8 161.4L329.6 161.7L328.2 161.9L326.8 162.1L325.4 162.1L324 162L322.7 161.8L321.4 161.6L320.2 161.2L319.1 160.7L318.3 160.1L317.6 159.5L317.1 158.9L316.8 158.2L316.7 157.5L316.9 156.7L317.3 156.1L317.9 155.4L318.6 154.8L319.6 154.3L320.7 153.9L321.9 153.5L323.3 153.3L324.6 153.1L326.1 153.1L327.5 153.2L328.8 153.4L330.1 153.7L331.3 154.1L332.3 154.5L333.2 155.1L333.9 155.7L334.4 156.4L334.7 157.1L334.8 157.8L334.6 158.5L334.2 159.2L333.6 159.8Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M334.8 157.8L334.6 158.5L334.2 159.2L333.6 159.8L332.9 160.4L331.9 160.9L330.8 161.4L329.6 161.7L328.2 161.9L326.8 162.1L325.4 162.1L324 162L322.7 161.8L321.4 161.6L320.2 161.2L319.1 160.7L318.3 160.1L317.6 159.5L317.1 158.9L316.8 158.2L316.7 157.5\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M334.8 157.8L334.2 158.4L333.8 159.1L333.2 159.7L332.5 160.2L331.6 160.7L330.5 161.2L329.4 161.5L328.1 161.7L326.8 161.9L325.4 161.9L324.1 161.8L322.8 161.6L321.6 161.4L320.5 161L319.5 160.5L318.6 160L318 159.4L317.5 158.8L317.2 158.1L316.7 157.5\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M316.7 157.5L316.9 156.7L317.3 156.1L317.9 155.4L318.6 154.8L319.6 154.3L320.7 153.9L321.9 153.5L323.3 153.3L324.6 153.1L326.1 153.1L327.5 153.2L328.8 153.4L330.1 153.7L331.3 154.1L332.3 154.5L333.2 155.1L333.9 155.7L334.4 156.4L334.7 157.1L334.8 157.8M334.8 160.4L334.6 161.1L334.2 161.8L333.6 162.4L332.9 163L331.9 163.5L330.8 164L329.6 164.3L328.2 164.6L326.8 164.7L325.4 164.7L324 164.6L322.7 164.5L321.4 164.2L320.2 163.8L319.1 163.3L318.3 162.7L317.6 162.1L317.1 161.5L316.8 160.8L316.7 160.1M316.7 157.5L316.7 160.1M334.8 157.8L334.8 160.4\"/></g></g><g class=\"it\" data-name=\"cab.hinge.68\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M445.1 188.4L445.3 188.1L445.8 187.9L446.4 187.9L447 188L447.4 188.2L447.5 188.5L447.5 196.4L447.2 196.6L446.7 196.8L446.1 196.9L445.5 196.7L445.2 196.5L445.1 196.2Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M447.2 196.6L446.7 196.8L446.7 189L447.2 188.8ZM447.5 196.4L447.2 196.6L447.2 188.8L447.5 188.5Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M446.7 196.8L446.1 196.9L446.1 189L446.7 189Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M446.1 196.9L445.5 196.7L445.5 188.9L446.1 189Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M445.5 196.7L445.2 196.5L445.2 188.7L445.5 188.9ZM445.2 196.5L445.1 196.2L445.1 188.4L445.2 188.7Z\"/><path class=\"iso-top\" d=\"M447.2 188.8L446.7 189L446.1 189L445.5 188.9L445.2 188.7L445.1 188.4L445.3 188.1L445.8 187.9L446.4 187.9L447 188L447.4 188.2L447.5 188.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M447.5 188.5L447.2 188.8L446.7 189L446.1 189L445.5 188.9L445.2 188.7L445.1 188.4\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M445.1 188.4L445.3 188.1L445.8 187.9L446.4 187.9L447 188L447.4 188.2L447.5 188.5M447.5 196.4L447.2 196.6L446.7 196.8L446.1 196.9L445.5 196.7L445.2 196.5L445.1 196.2M445.1 188.4L445.1 196.2M447.5 188.5L447.5 196.4\"/></g></g><g class=\"it\" data-name=\"exit.block\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M386.1 149.4L386.3 148.5L387 147.7L403.7 137L405 136.5L406.7 136.2L408.5 136.2L410 136.6L440.9 148.7L442 149.4L442.6 150.2L442.6 163.2L442.4 164.1L441.6 164.9L425 175.5L423.6 176.1L422 176.4L420.2 176.3L418.6 175.9L387.8 163.9L386.7 163.2L386.1 162.4Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M442.6 163.2L442.4 164.1L442.4 151.1L442.6 150.2ZM442.4 164.1L441.6 164.9L441.6 151.9L442.4 151.1ZM441.6 164.9L425 175.5L425 162.5L441.6 151.9ZM425 175.5L423.6 176.1L423.6 163.1L425 162.5Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M423.6 176.1L422 176.4L422 163.4L423.6 163.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M422 176.4L420.2 176.3L420.2 163.3L422 163.4ZM420.2 176.3L418.6 175.9L418.6 162.9L420.2 163.3Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M418.6 175.9L387.8 163.9L387.8 150.9L418.6 162.9ZM387.8 163.9L386.7 163.2L386.7 150.2L387.8 150.9ZM386.7 163.2L386.1 162.4L386.1 149.4L386.7 150.2Z\"/><path class=\"iso-top\" d=\"M440.9 148.7L442 149.4L442.6 150.2L442.4 151.1L441.6 151.9L425 162.5L423.6 163.1L422 163.4L420.2 163.3L418.6 162.9L387.8 150.9L386.7 150.2L386.1 149.4L386.3 148.5L387 147.7L403.7 137L405 136.5L406.7 136.2L408.5 136.2L410 136.6Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M442.6 150.2L442.4 151.1L441.6 151.9L425 162.5L423.6 163.1L422 163.4L420.2 163.3L418.6 162.9L387.8 150.9L386.7 150.2L386.1 149.4\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M442.6 150.2L441.6 150.9L440.9 151.6L424.3 162.2L423.2 162.7L421.9 162.9L420.5 162.9L419.1 162.5L388.4 150.5L387.5 150L386.1 149.4\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M386.1 149.4L386.3 148.5L387 147.7L403.7 137L405 136.5L406.7 136.2L408.5 136.2L410 136.6L440.9 148.7L442 149.4L442.6 150.2M442.6 163.2L442.4 164.1L441.6 164.9L425 175.5L423.6 176.1L422 176.4L420.2 176.3L418.6 175.9L387.8 163.9L386.7 163.2L386.1 162.4M442.6 150.2L442.6 163.2M386.1 149.4L386.1 162.4\"/></g><path class=\"ts-slot\" d=\"M427.7 153.5L428.1 153.8L428.2 154.2L427.9 154.5L427.8 154.6L427.1 154.9L426.4 154.9L425.6 154.8L399.6 144.6L399.1 144.3L399 143.9L399.3 143.5L399.5 143.4L400.1 143.2L400.9 143.1L401.6 143.3Z\"/><path class=\"iso-line\" data-tone=\"lo\" d=\"M427.7 153.5L428.1 153.8L428.2 154.2L427.9 154.5L427.8 154.6L427.1 154.9L426.4 154.9L425.6 154.8L399.6 144.6L399.1 144.3L399 143.9L399.3 143.5L399.5 143.4L400.1 143.2L400.9 143.1L401.6 143.3Z\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M429.9 152L431.2 152.8L431.8 153.7L431.7 154.7L430.8 155.6L430.6 155.7L429.1 156.4L427.2 156.7L425.2 156.6L423.4 156.2L397.3 146L396 145.2L395.4 144.3L395.6 143.3L396.5 142.4L396.6 142.3L398.2 141.6L400.1 141.3L402 141.4L403.8 141.8Z\"/><path class=\"iso-line\" data-tone=\"lo\" d=\"M408.9 139.2L408.1 139.5L407 139.6L406.1 139.4L405.5 139L405.4 138.5L405.8 138L406.6 137.7L407.6 137.7L408.5 137.9L409.1 138.3L409.3 138.8ZM422.9 161.5L422.1 161.8L421.1 161.9L420.2 161.7L419.6 161.3L419.4 160.8L419.8 160.3L420.6 160L421.6 159.9L422.6 160.1L423.2 160.6L423.3 161.1Z\"/><g class=\"iso-dots\" data-tone=\"mid\"><circle cx=\"407.3\" cy=\"138.6\" r=\"0.4\"/><circle cx=\"421.4\" cy=\"160.9\" r=\"0.4\"/></g></g><g class=\"it\" data-name=\"mate.pad\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M271.8 193.2L272 193L272.7 192.5L273.1 192.4L273.5 192.4L280.9 195.3L281.1 195.5L281.1 260.6L281 260.9L280.3 261.3L279.9 261.5L279.4 261.4L272.1 258.5L271.8 258.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M281.1 260.6L281 260.9L281 195.7L281.1 195.5ZM281 260.9L280.3 261.3L280.3 196.2L281 195.7Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M280.3 261.3L279.9 261.5L279.9 196.3L280.3 196.2Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M279.9 261.5L279.4 261.4L279.4 196.3L279.9 196.3Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M279.4 261.4L272.1 258.5L272.1 193.4L279.4 196.3ZM272.1 258.5L271.8 258.3L271.8 193.2L272.1 193.4Z\"/><path class=\"iso-top\" d=\"M280.9 195.3L281.1 195.5L281 195.7L280.3 196.2L279.9 196.3L279.4 196.3L272.1 193.4L271.8 193.2L272 193L272.7 192.5L273.1 192.4L273.5 192.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M281.1 195.5L281 195.7L280.3 196.2L279.9 196.3L279.4 196.3L272.1 193.4L271.8 193.2\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M271.8 193.2L272 193L272.7 192.5L273.1 192.4L273.5 192.4L280.9 195.3L281.1 195.5M281.1 260.6L281 260.9L280.3 261.3L279.9 261.5L279.4 261.4L272.1 258.5L271.8 258.3M281.1 195.5L281.1 260.6M271.8 193.2L271.8 258.3\"/></g></g><g class=\"it\" data-name=\"mate.body\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M262.1 190.5L262.2 189.8L262.9 189.1L267.5 186.2L268.6 185.7L270 185.5L271.5 185.5L272.8 185.8L278.7 188.2L279.7 188.7L280.1 189.4L280.1 302.1L280 302.8L279.3 303.5L274.7 306.4L273.6 306.9L272.2 307.2L270.8 307.1L269.4 306.8L263.5 304.5L262.6 303.9L262.1 303.2Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M280.1 302.1L280 302.8L280 190.1L280.1 189.4ZM280 302.8L279.3 303.5L279.3 190.8L280 190.1ZM279.3 303.5L274.7 306.4L274.7 193.8L279.3 190.8ZM274.7 306.4L273.6 306.9L273.6 194.2L274.7 193.8Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M273.6 306.9L272.2 307.2L272.2 194.5L273.6 194.2Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M272.2 307.2L270.8 307.1L270.8 194.4L272.2 194.5ZM270.8 307.1L269.4 306.8L269.4 194.1L270.8 194.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M269.4 306.8L263.5 304.5L263.5 191.8L269.4 194.1ZM263.5 304.5L262.6 303.9L262.6 191.2L263.5 191.8ZM262.6 303.9L262.1 303.2L262.1 190.5L262.6 191.2Z\"/><path class=\"iso-top\" d=\"M278.7 188.2L279.7 188.7L280.1 189.4L280 190.1L279.3 190.8L274.7 193.8L273.6 194.2L272.2 194.5L270.8 194.4L269.4 194.1L263.5 191.8L262.6 191.2L262.1 190.5L262.2 189.8L262.9 189.1L267.5 186.2L268.6 185.7L270 185.5L271.5 185.5L272.8 185.8Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M280.1 189.4L280 190.1L279.3 190.8L274.7 193.8L273.6 194.2L272.2 194.5L270.8 194.4L269.4 194.1L263.5 191.8L262.6 191.2L262.1 190.5\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M262.1 190.5L262.2 189.8L262.9 189.1L267.5 186.2L268.6 185.7L270 185.5L271.5 185.5L272.8 185.8L278.7 188.2L279.7 188.7L280.1 189.4M280.1 302.1L280 302.8L279.3 303.5L274.7 306.4L273.6 306.9L272.2 307.2L270.8 307.1L269.4 306.8L263.5 304.5L262.6 303.9L262.1 303.2M280.1 189.4L280.1 302.1M262.1 190.5L262.1 303.2\"/></g></g><g class=\"it\" data-name=\"mate.cap\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M261.2 185.4L261.3 184.5L262.2 183.6L266.8 180.7L268.2 180.1L269.9 179.8L271.7 179.9L273.3 180.3L279.3 182.6L280.4 183.3L281 184.2L281 189.4L280.9 190.3L280.1 191.1L275.4 194L274.1 194.6L272.3 194.9L270.5 194.9L268.9 194.4L263 192.1L261.8 191.4L261.2 190.6Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M281 189.4L280.9 190.3L280.9 185.1L281 184.2ZM280.9 190.3L280.1 191.1L280.1 185.9L280.9 185.1ZM280.1 191.1L275.4 194L275.4 188.8L280.1 185.9ZM275.4 194L274.1 194.6L274.1 189.4L275.4 188.8Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M274.1 194.6L272.3 194.9L272.3 189.7L274.1 189.4Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M272.3 194.9L270.5 194.9L270.5 189.6L272.3 189.7ZM270.5 194.9L268.9 194.4L268.9 189.2L270.5 189.6Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M268.9 194.4L263 192.1L263 186.9L268.9 189.2ZM263 192.1L261.8 191.4L261.8 186.2L263 186.9ZM261.8 191.4L261.2 190.6L261.2 185.4L261.8 186.2Z\"/><path class=\"iso-top\" d=\"M279.3 182.6L280.4 183.3L281 184.2L280.9 185.1L280.1 185.9L275.4 188.8L274.1 189.4L272.3 189.7L270.5 189.6L268.9 189.2L263 186.9L261.8 186.2L261.2 185.4L261.3 184.5L262.2 183.6L266.8 180.7L268.2 180.1L269.9 179.8L271.7 179.9L273.3 180.3Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M281 184.2L280.9 185.1L280.1 185.9L275.4 188.8L274.1 189.4L272.3 189.7L270.5 189.6L268.9 189.2L263 186.9L261.8 186.2L261.2 185.4\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M281 184.2L280.2 185L279.4 185.7L274.9 188.6L273.7 189.1L272.2 189.3L270.7 189.3L269.3 188.9L263.5 186.6L262.4 186L261.2 185.4\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M261.2 185.4L261.3 184.5L262.2 183.6L266.8 180.7L268.2 180.1L269.9 179.8L271.7 179.9L273.3 180.3L279.3 182.6L280.4 183.3L281 184.2M281 189.4L280.9 190.3L280.1 191.1L275.4 194L274.1 194.6L272.3 194.9L270.5 194.9L268.9 194.4L263 192.1L261.8 191.4L261.2 190.6M281 184.2L281 189.4M261.2 185.4L261.2 190.6\"/></g></g></g><g data-file=\"queue\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M163.7 228.2L164.1 227.4L181.7 216.1L183.2 215.7L184.9 215.9L212.1 226.6L213 227.3L213 228.9L212.5 229.7L194.9 241L193.4 241.4L191.8 241.2L164.5 230.5L163.7 229.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M213 228.9L212.5 229.7L212.5 228.1L213 227.3ZM212.5 229.7L194.9 241L194.9 239.4L212.5 228.1Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M194.9 241L193.4 241.4L193.4 239.8L194.9 239.4Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M193.4 241.4L191.8 241.2L191.8 239.6L193.4 239.8Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M191.8 241.2L164.5 230.5L164.5 228.9L191.8 239.6ZM164.5 230.5L163.7 229.8L163.7 228.2L164.5 228.9Z\"/><path class=\"iso-top\" d=\"M212.1 226.6L213 227.3L212.5 228.1L194.9 239.4L193.4 239.8L191.8 239.6L164.5 228.9L163.7 228.2L164.1 227.4L181.7 216.1L183.2 215.7L184.9 215.9Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M213 227.3L212.5 228.1L194.9 239.4L193.4 239.8L191.8 239.6L164.5 228.9L163.7 228.2\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M163.7 228.2L164.1 227.4L181.7 216.1L183.2 215.7L184.9 215.9L212.1 226.6L213 227.3M213 228.9L212.5 229.7L194.9 241L193.4 241.4L191.8 241.2L164.5 230.5L163.7 229.8M213 227.3L213 228.9M163.7 228.2L163.7 229.8\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M182.2 199.2L182.4 199L182.7 198.8L183.1 198.7L183.6 198.7L213.4 210.4L213.7 210.6L213.7 227.3L213.5 227.5L213.2 227.7L212.8 227.8L212.3 227.8L182.5 216.1L182.2 215.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M213.7 227.3L213.5 227.5L213.5 210.8L213.7 210.6ZM213.5 227.5L213.2 227.7L213.2 211.1L213.5 210.8Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M213.2 227.7L212.8 227.8L212.8 211.2L213.2 211.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M212.8 227.8L212.3 227.8L212.3 211.1L212.8 211.2Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M212.3 227.8L182.5 216.1L182.5 199.4L212.3 211.1ZM182.5 216.1L182.2 215.9L182.2 199.2L182.5 199.4Z\"/><path class=\"iso-top\" d=\"M213.4 210.4L213.7 210.6L213.5 210.8L213.2 211.1L212.8 211.2L212.3 211.1L182.5 199.4L182.2 199.2L182.4 199L182.7 198.8L183.1 198.7L183.6 198.7Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M213.7 210.6L213.5 210.8L213.2 211.1L212.8 211.2L212.3 211.1L182.5 199.4L182.2 199.2\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M213.7 210.6L213.1 210.7L212.9 210.9L212.7 210.9L212.5 210.9L182.8 199.3L182.2 199.2\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M182.2 199.2L182.4 199L182.7 198.8L183.1 198.7L183.6 198.7L213.4 210.4L213.7 210.6M213.7 227.3L213.5 227.5L213.2 227.7L212.8 227.8L212.3 227.8L182.5 216.1L182.2 215.9M213.7 210.6L213.7 227.3M182.2 199.2L182.2 215.9\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M163 211.6L163.1 211.3L182.7 198.8L183.1 198.7L183.6 198.7L184.1 198.9L184.3 199.1L184.3 215.8L184.2 216L164.5 228.6L164.1 228.7L163.7 228.6L163.2 228.4L163 228.2Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M184.3 215.8L184.2 216L184.2 199.3L184.3 199.1ZM184.2 216L164.5 228.6L164.5 211.9L184.2 199.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M164.5 228.6L164.1 228.7L164.1 212L164.5 211.9Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M164.1 228.7L163.7 228.6L163.7 211.9L164.1 212Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M163.7 228.6L163.2 228.4L163.2 211.8L163.7 211.9ZM163.2 228.4L163 228.2L163 211.6L163.2 211.8Z\"/><path class=\"iso-top\" d=\"M184.1 198.9L184.3 199.1L184.2 199.3L164.5 211.9L164.1 212L163.7 211.9L163.2 211.8L163 211.6L163.1 211.3L182.7 198.8L183.1 198.7L183.6 198.7Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M184.3 199.1L184.2 199.3L164.5 211.9L164.1 212L163.7 211.9L163.2 211.8L163 211.6\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M184.3 199.1L183.8 199.2L164.2 211.7L164.1 211.8L163.9 211.7L163.5 211.6L163 211.6\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M163 211.6L163.1 211.3L182.7 198.8L183.1 198.7L183.6 198.7L184.1 198.9L184.3 199.1M184.3 215.8L184.2 216L164.5 228.6L164.1 228.7L163.7 228.6L163.2 228.4L163 228.2M184.3 199.1L184.3 215.8M163 211.6L163 228.2\"/></g><g data-cards=\"queue\"></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M192.4 223L192.5 222.8L212.1 210.3L212.5 210.1L213 210.2L213.4 210.4L213.7 210.6L213.7 227.3L213.5 227.5L193.9 240.1L193.5 240.2L193.1 240.1L192.6 239.9L192.4 239.7Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M213.7 227.3L213.5 227.5L213.5 210.8L213.7 210.6ZM213.5 227.5L193.9 240.1L193.9 223.4L213.5 210.8Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M193.9 240.1L193.5 240.2L193.5 223.5L193.9 223.4Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M193.5 240.2L193.1 240.1L193.1 223.4L193.5 223.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M193.1 240.1L192.6 239.9L192.6 223.2L193.1 223.4ZM192.6 239.9L192.4 239.7L192.4 223L192.6 223.2Z\"/><path class=\"iso-top\" d=\"M213.4 210.4L213.7 210.6L213.5 210.8L193.9 223.4L193.5 223.5L193.1 223.4L192.6 223.2L192.4 223L192.5 222.8L212.1 210.3L212.5 210.1L213 210.2Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M213.7 210.6L213.5 210.8L193.9 223.4L193.5 223.5L193.1 223.4L192.6 223.2L192.4 223\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M213.7 210.6L213.1 210.7L193.6 223.2L193.5 223.3L193.3 223.2L192.9 223.1L192.4 223\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M192.4 223L192.5 222.8L212.1 210.3L212.5 210.1L213 210.2L213.4 210.4L213.7 210.6M213.7 227.3L213.5 227.5L193.9 240.1L193.5 240.2L193.1 240.1L192.6 239.9L192.4 239.7M213.7 210.6L213.7 227.3M192.4 223L192.4 239.7\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M163 211.6L163.1 211.3L163.5 211.1L163.9 211L164.3 211.1L194.2 222.7L194.4 222.9L194.4 239.6L194.3 239.8L193.9 240.1L193.5 240.2L193.1 240.1L163.2 228.4L163 228.2Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M194.4 239.6L194.3 239.8L194.3 223.1L194.4 222.9ZM194.3 239.8L193.9 240.1L193.9 223.4L194.3 223.1Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M193.9 240.1L193.5 240.2L193.5 223.5L193.9 223.4Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M193.5 240.2L193.1 240.1L193.1 223.4L193.5 223.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M193.1 240.1L163.2 228.4L163.2 211.8L193.1 223.4ZM163.2 228.4L163 228.2L163 211.6L163.2 211.8Z\"/><path class=\"iso-top\" d=\"M194.2 222.7L194.4 222.9L194.3 223.1L193.9 223.4L193.5 223.5L193.1 223.4L163.2 211.8L163 211.6L163.1 211.3L163.5 211.1L163.9 211L164.3 211.1Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M194.4 222.9L194.3 223.1L193.9 223.4L193.5 223.5L193.1 223.4L163.2 211.8L163 211.6\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M194.4 222.9L193.9 223L193.6 223.2L193.5 223.3L193.3 223.2L163.5 211.6L163 211.6\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M163 211.6L163.1 211.3L163.5 211.1L163.9 211L164.3 211.1L194.2 222.7L194.4 222.9M194.4 239.6L194.3 239.8L193.9 240.1L193.5 240.2L193.1 240.1L163.2 228.4L163 228.2M194.4 222.9L194.4 239.6M163 211.6L163 228.2\"/></g><path class=\"iso-line\" data-tone=\"faint\" d=\"M169.8 223L186.4 229.5L186.4 233.6L169.8 227.2Z\"/></g><g data-file=\"done\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M388.9 316.2L389.3 315.3L406.9 304.1L408.4 303.7L410.1 303.9L437.3 314.5L438.2 315.3L438.2 316.8L437.7 317.7L420.1 328.9L418.6 329.4L417 329.1L389.7 318.5L388.9 317.7Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M438.2 316.8L437.7 317.7L437.7 316.1L438.2 315.3ZM437.7 317.7L420.1 328.9L420.1 327.4L437.7 316.1Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M420.1 328.9L418.6 329.4L418.6 327.8L420.1 327.4Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M418.6 329.4L417 329.1L417 327.6L418.6 327.8Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M417 329.1L389.7 318.5L389.7 316.9L417 327.6ZM389.7 318.5L388.9 317.7L388.9 316.2L389.7 316.9Z\"/><path class=\"iso-top\" d=\"M437.3 314.5L438.2 315.3L437.7 316.1L420.1 327.4L418.6 327.8L417 327.6L389.7 316.9L388.9 316.2L389.3 315.3L406.9 304.1L408.4 303.7L410.1 303.9Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M438.2 315.3L437.7 316.1L420.1 327.4L418.6 327.8L417 327.6L389.7 316.9L388.9 316.2\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M388.9 316.2L389.3 315.3L406.9 304.1L408.4 303.7L410.1 303.9L437.3 314.5L438.2 315.3M438.2 316.8L437.7 317.7L420.1 328.9L418.6 329.4L417 329.1L389.7 318.5L388.9 317.7M438.2 315.3L438.2 316.8M388.9 316.2L388.9 317.7\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M407.4 287.2L407.6 287L407.9 286.8L408.3 286.6L408.8 286.7L438.6 298.4L438.9 298.6L438.9 315.2L438.8 315.5L438.4 315.7L438 315.8L437.5 315.8L407.7 304.1L407.4 303.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M438.9 315.2L438.8 315.5L438.8 298.8L438.9 298.6ZM438.8 315.5L438.4 315.7L438.4 299L438.8 298.8Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M438.4 315.7L438 315.8L438 299.1L438.4 299Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M438 315.8L437.5 315.8L437.5 299.1L438 299.1Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M437.5 315.8L407.7 304.1L407.7 287.4L437.5 299.1ZM407.7 304.1L407.4 303.9L407.4 287.2L407.7 287.4Z\"/><path class=\"iso-top\" d=\"M438.6 298.4L438.9 298.6L438.8 298.8L438.4 299L438 299.1L437.5 299.1L407.7 287.4L407.4 287.2L407.6 287L407.9 286.8L408.3 286.6L408.8 286.7Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M438.9 298.6L438.8 298.8L438.4 299L438 299.1L437.5 299.1L407.7 287.4L407.4 287.2\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M438.9 298.6L438.3 298.7L438.1 298.9L437.9 298.9L437.7 298.9L408 287.3L407.4 287.2\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M407.4 287.2L407.6 287L407.9 286.8L408.3 286.6L408.8 286.7L438.6 298.4L438.9 298.6M438.9 315.2L438.8 315.5L438.4 315.7L438 315.8L437.5 315.8L407.7 304.1L407.4 303.9M438.9 298.6L438.9 315.2M407.4 287.2L407.4 303.9\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M388.2 299.5L388.3 299.3L407.9 286.8L408.3 286.6L408.8 286.7L409.3 286.9L409.5 287.1L409.5 303.8L409.4 304L389.7 316.5L389.3 316.7L388.9 316.6L388.4 316.4L388.2 316.2Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M409.5 303.8L409.4 304L409.4 287.3L409.5 287.1ZM409.4 304L389.7 316.5L389.7 299.9L409.4 287.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M389.7 316.5L389.3 316.7L389.3 300L389.7 299.9Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M389.3 316.7L388.9 316.6L388.9 299.9L389.3 300Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M388.9 316.6L388.4 316.4L388.4 299.7L388.9 299.9ZM388.4 316.4L388.2 316.2L388.2 299.5L388.4 299.7Z\"/><path class=\"iso-top\" d=\"M409.3 286.9L409.5 287.1L409.4 287.3L389.7 299.9L389.3 300L388.9 299.9L388.4 299.7L388.2 299.5L388.3 299.3L407.9 286.8L408.3 286.6L408.8 286.7Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M409.5 287.1L409.4 287.3L389.7 299.9L389.3 300L388.9 299.9L388.4 299.7L388.2 299.5\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M409.5 287.1L409 287.2L389.4 299.7L389.3 299.8L389.1 299.7L388.7 299.6L388.2 299.5\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M388.2 299.5L388.3 299.3L407.9 286.8L408.3 286.6L408.8 286.7L409.3 286.9L409.5 287.1M409.5 303.8L409.4 304L389.7 316.5L389.3 316.7L388.9 316.6L388.4 316.4L388.2 316.2M409.5 287.1L409.5 303.8M388.2 299.5L388.2 316.2\"/></g><g data-cards=\"done\"></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M417.6 311L417.7 310.8L437.3 298.2L437.7 298.1L438.2 298.2L438.6 298.4L438.9 298.6L438.9 315.2L438.8 315.5L419.1 328L418.7 328.1L418.3 328.1L417.8 327.9L417.6 327.7Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M438.9 315.2L438.8 315.5L438.8 298.8L438.9 298.6ZM438.8 315.5L419.1 328L419.1 311.4L438.8 298.8Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M419.1 328L418.7 328.1L418.7 311.5L419.1 311.4Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M418.7 328.1L418.3 328.1L418.3 311.4L418.7 311.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M418.3 328.1L417.8 327.9L417.8 311.2L418.3 311.4ZM417.8 327.9L417.6 327.7L417.6 311L417.8 311.2Z\"/><path class=\"iso-top\" d=\"M438.6 298.4L438.9 298.6L438.8 298.8L419.1 311.4L418.7 311.5L418.3 311.4L417.8 311.2L417.6 311L417.7 310.8L437.3 298.2L437.7 298.1L438.2 298.2Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M438.9 298.6L438.8 298.8L419.1 311.4L418.7 311.5L418.3 311.4L417.8 311.2L417.6 311\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M438.9 298.6L438.3 298.7L418.8 311.2L418.7 311.2L418.5 311.2L418.1 311.1L417.6 311\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M417.6 311L417.7 310.8L437.3 298.2L437.7 298.1L438.2 298.2L438.6 298.4L438.9 298.6M438.9 315.2L438.8 315.5L419.1 328L418.7 328.1L418.3 328.1L417.8 327.9L417.6 327.7M438.9 298.6L438.9 315.2M417.6 311L417.6 327.7\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M388.2 299.5L388.3 299.3L388.7 299.1L389.1 299L389.5 299L419.4 310.7L419.6 310.9L419.6 327.6L419.5 327.8L419.1 328L418.7 328.1L418.3 328.1L388.4 316.4L388.2 316.2Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M419.6 327.6L419.5 327.8L419.5 311.1L419.6 310.9ZM419.5 327.8L419.1 328L419.1 311.4L419.5 311.1Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M419.1 328L418.7 328.1L418.7 311.5L419.1 311.4Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M418.7 328.1L418.3 328.1L418.3 311.4L418.7 311.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M418.3 328.1L388.4 316.4L388.4 299.7L418.3 311.4ZM388.4 316.4L388.2 316.2L388.2 299.5L388.4 299.7Z\"/><path class=\"iso-top\" d=\"M419.4 310.7L419.6 310.9L419.5 311.1L419.1 311.4L418.7 311.5L418.3 311.4L388.4 299.7L388.2 299.5L388.3 299.3L388.7 299.1L389.1 299L389.5 299Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M419.6 310.9L419.5 311.1L419.1 311.4L418.7 311.5L418.3 311.4L388.4 299.7L388.2 299.5\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M419.6 310.9L419.1 311L418.8 311.2L418.7 311.2L418.5 311.2L388.7 299.6L388.2 299.5\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M388.2 299.5L388.3 299.3L388.7 299.1L389.1 299L389.5 299L419.4 310.7L419.6 310.9M419.6 327.6L419.5 327.8L419.1 328L418.7 328.1L418.3 328.1L388.4 316.4L388.2 316.2M419.6 310.9L419.6 327.6M388.2 299.5L388.2 316.2\"/></g><path class=\"iso-line\" data-tone=\"faint\" d=\"M395 311L411.6 317.4L411.6 321.6L395 315.1Z\"/></g><g data-part=\"fly\"></g><g data-part=\"lips\"><path class=\"iso-line\" data-tone=\"lo\" d=\"M252.6 68.9L278.7 79.1\"/><path class=\"iso-line\" data-tone=\"lo\" d=\"M399.6 144.6L425.6 154.8\"/></g><g hidden data-part=\"deck\"><g class=\"ts-card\" data-card=\"you\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M284.3 238L284.4 237.8L284.5 237.7L284.8 237.6L285.2 237.7L308.2 246.7L308.3 246.8L308.3 280.7L308.2 280.8L308.1 281L307.8 281L307.4 281L284.4 272L284.3 271.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M308.3 280.7L308.2 280.8L308.2 247L308.3 246.8ZM308.2 280.8L308.1 281L308.1 247.1L308.2 247Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M308.1 281L307.8 281L307.8 247.2L308.1 247.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M307.8 281L307.4 281L307.4 247.1L307.8 247.2Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M307.4 281L284.4 272L284.4 238.1L307.4 247.1ZM284.4 272L284.3 271.9L284.3 238L284.4 238.1Z\"/><path class=\"iso-top\" d=\"M308.2 246.7L308.3 246.8L308.2 247L308.1 247.1L307.8 247.2L307.4 247.1L284.4 238.1L284.3 238L284.4 237.8L284.5 237.7L284.8 237.6L285.2 237.7Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M308.3 246.8L308.2 247L308.1 247.1L307.8 247.2L307.4 247.1L284.4 238.1L284.3 238\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M284.3 238L284.4 237.8L284.5 237.7L284.8 237.6L285.2 237.7L308.2 246.7L308.3 246.8M308.3 280.7L308.2 280.8L308.1 281L307.8 281L307.4 281L284.4 272L284.3 271.9M308.3 246.8L308.3 280.7M284.3 238L284.3 271.9\"/></g><g transform=\"matrix(1.185 0.463 0.000 1.303 284.05 238.02)\"><path class=\"ts-band\" d=\"M0 20.6H20V26H0Z\"/><path class=\"iso-line\" data-tone=\"lo\" d=\"M12 1.8L12.31 1.86L12.57 2.03L12.74 2.29L12.8 2.6L12.8 2.6L12.74 2.91L12.57 3.17L12.31 3.34L12 3.4L8 3.4L7.69 3.34L7.43 3.17L7.26 2.91L7.2 2.6L7.2 2.6L7.26 2.29L7.43 2.03L7.69 1.86L8 1.8Z\"/><path class=\"iso-line\" data-tone=\"mid\" d=\"M8.4 5.6L8.71 5.66L8.97 5.83L9.14 6.09L9.2 6.4L9.2 13.4L9.14 13.71L8.97 13.97L8.71 14.14L8.4 14.2L3.2 14.2L2.89 14.14L2.63 13.97L2.46 13.71L2.4 13.4L2.4 6.4L2.46 6.09L2.63 5.83L2.89 5.66L3.2 5.6Z\"/><circle class=\"ts-head\" cx=\"5.8\" cy=\"9\" r=\"1.5\"/><path class=\"iso-line\" data-tone=\"mid\" d=\"M3.3 14.2C3.5 11.5 4.6 11.2 5.8 11.2S8.1 11.5 8.3 14.2\"/><path class=\"iso-line\" data-tone=\"lo\" data-free=\"\" d=\"M11 8H17M11 10.4H15.4M11 12.8H17.4\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M0 19.2H20\"/><path class=\"iso-line\" data-tone=\"lo\" data-free=\"\" d=\"M2.4 23H8.4\"/></g></g><g class=\"ts-card\" data-card=\"bob\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M284.3 238L284.4 237.8L284.5 237.7L284.8 237.6L285.2 237.7L308.2 246.7L308.3 246.8L308.3 280.7L308.2 280.8L308.1 281L307.8 281L307.4 281L284.4 272L284.3 271.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M308.3 280.7L308.2 280.8L308.2 247L308.3 246.8ZM308.2 280.8L308.1 281L308.1 247.1L308.2 247Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M308.1 281L307.8 281L307.8 247.2L308.1 247.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M307.8 281L307.4 281L307.4 247.1L307.8 247.2Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M307.4 281L284.4 272L284.4 238.1L307.4 247.1ZM284.4 272L284.3 271.9L284.3 238L284.4 238.1Z\"/><path class=\"iso-top\" d=\"M308.2 246.7L308.3 246.8L308.2 247L308.1 247.1L307.8 247.2L307.4 247.1L284.4 238.1L284.3 238L284.4 237.8L284.5 237.7L284.8 237.6L285.2 237.7Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M308.3 246.8L308.2 247L308.1 247.1L307.8 247.2L307.4 247.1L284.4 238.1L284.3 238\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M284.3 238L284.4 237.8L284.5 237.7L284.8 237.6L285.2 237.7L308.2 246.7L308.3 246.8M308.3 280.7L308.2 280.8L308.1 281L307.8 281L307.4 281L284.4 272L284.3 271.9M308.3 246.8L308.3 280.7M284.3 238L284.3 271.9\"/></g><g transform=\"matrix(1.185 0.463 0.000 1.303 284.05 238.02)\"><path class=\"iso-line\" data-tone=\"lo\" d=\"M12 1.8L12.31 1.86L12.57 2.03L12.74 2.29L12.8 2.6L12.8 2.6L12.74 2.91L12.57 3.17L12.31 3.34L12 3.4L8 3.4L7.69 3.34L7.43 3.17L7.26 2.91L7.2 2.6L7.2 2.6L7.26 2.29L7.43 2.03L7.69 1.86L8 1.8Z\"/><path class=\"iso-line\" data-tone=\"mid\" d=\"M8.4 5.6L8.71 5.66L8.97 5.83L9.14 6.09L9.2 6.4L9.2 13.4L9.14 13.71L8.97 13.97L8.71 14.14L8.4 14.2L3.2 14.2L2.89 14.14L2.63 13.97L2.46 13.71L2.4 13.4L2.4 6.4L2.46 6.09L2.63 5.83L2.89 5.66L3.2 5.6Z\"/><circle class=\"ts-head\" cx=\"5.8\" cy=\"9\" r=\"1.5\"/><path class=\"iso-line\" data-tone=\"mid\" d=\"M3.3 14.2C3.5 11.5 4.6 11.2 5.8 11.2S8.1 11.5 8.3 14.2\"/><path class=\"iso-line\" data-tone=\"lo\" data-free=\"\" d=\"M11 8H17.8M11 10.4H14.8M11 12.8H16.4\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M0 19.2H20\"/><path class=\"iso-line\" data-tone=\"lo\" data-free=\"\" d=\"M2.4 23H6.8\"/></g></g><g class=\"ts-card\" data-card=\"ana\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M284.3 238L284.4 237.8L284.5 237.7L284.8 237.6L285.2 237.7L308.2 246.7L308.3 246.8L308.3 280.7L308.2 280.8L308.1 281L307.8 281L307.4 281L284.4 272L284.3 271.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M308.3 280.7L308.2 280.8L308.2 247L308.3 246.8ZM308.2 280.8L308.1 281L308.1 247.1L308.2 247Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M308.1 281L307.8 281L307.8 247.2L308.1 247.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M307.8 281L307.4 281L307.4 247.1L307.8 247.2Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M307.4 281L284.4 272L284.4 238.1L307.4 247.1ZM284.4 272L284.3 271.9L284.3 238L284.4 238.1Z\"/><path class=\"iso-top\" d=\"M308.2 246.7L308.3 246.8L308.2 247L308.1 247.1L307.8 247.2L307.4 247.1L284.4 238.1L284.3 238L284.4 237.8L284.5 237.7L284.8 237.6L285.2 237.7Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M308.3 246.8L308.2 247L308.1 247.1L307.8 247.2L307.4 247.1L284.4 238.1L284.3 238\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M284.3 238L284.4 237.8L284.5 237.7L284.8 237.6L285.2 237.7L308.2 246.7L308.3 246.8M308.3 280.7L308.2 280.8L308.1 281L307.8 281L307.4 281L284.4 272L284.3 271.9M308.3 246.8L308.3 280.7M284.3 238L284.3 271.9\"/></g><g transform=\"matrix(1.185 0.463 0.000 1.303 284.05 238.02)\"><path class=\"iso-line\" data-tone=\"lo\" d=\"M12 1.8L12.31 1.86L12.57 2.03L12.74 2.29L12.8 2.6L12.8 2.6L12.74 2.91L12.57 3.17L12.31 3.34L12 3.4L8 3.4L7.69 3.34L7.43 3.17L7.26 2.91L7.2 2.6L7.2 2.6L7.26 2.29L7.43 2.03L7.69 1.86L8 1.8Z\"/><path class=\"iso-line\" data-tone=\"mid\" d=\"M8.4 5.6L8.71 5.66L8.97 5.83L9.14 6.09L9.2 6.4L9.2 13.4L9.14 13.71L8.97 13.97L8.71 14.14L8.4 14.2L3.2 14.2L2.89 14.14L2.63 13.97L2.46 13.71L2.4 13.4L2.4 6.4L2.46 6.09L2.63 5.83L2.89 5.66L3.2 5.6Z\"/><circle class=\"ts-head\" cx=\"5.8\" cy=\"9\" r=\"1.5\"/><path class=\"iso-line\" data-tone=\"mid\" d=\"M3.3 14.2C3.5 11.5 4.6 11.2 5.8 11.2S8.1 11.5 8.3 14.2\"/><path class=\"iso-line\" data-tone=\"lo\" data-free=\"\" d=\"M11 8H16M11 10.4H17M11 12.8H15\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M0 19.2H20\"/><path class=\"iso-line\" data-tone=\"lo\" data-free=\"\" d=\"M2.4 23H6.8\"/></g></g><g class=\"ts-card\" data-card=\"sam\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M284.3 238L284.4 237.8L284.5 237.7L284.8 237.6L285.2 237.7L308.2 246.7L308.3 246.8L308.3 280.7L308.2 280.8L308.1 281L307.8 281L307.4 281L284.4 272L284.3 271.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M308.3 280.7L308.2 280.8L308.2 247L308.3 246.8ZM308.2 280.8L308.1 281L308.1 247.1L308.2 247Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M308.1 281L307.8 281L307.8 247.2L308.1 247.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M307.8 281L307.4 281L307.4 247.1L307.8 247.2Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M307.4 281L284.4 272L284.4 238.1L307.4 247.1ZM284.4 272L284.3 271.9L284.3 238L284.4 238.1Z\"/><path class=\"iso-top\" d=\"M308.2 246.7L308.3 246.8L308.2 247L308.1 247.1L307.8 247.2L307.4 247.1L284.4 238.1L284.3 238L284.4 237.8L284.5 237.7L284.8 237.6L285.2 237.7Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M308.3 246.8L308.2 247L308.1 247.1L307.8 247.2L307.4 247.1L284.4 238.1L284.3 238\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M284.3 238L284.4 237.8L284.5 237.7L284.8 237.6L285.2 237.7L308.2 246.7L308.3 246.8M308.3 280.7L308.2 280.8L308.1 281L307.8 281L307.4 281L284.4 272L284.3 271.9M308.3 246.8L308.3 280.7M284.3 238L284.3 271.9\"/></g><g transform=\"matrix(1.185 0.463 0.000 1.303 284.05 238.02)\"><path class=\"iso-line\" data-tone=\"lo\" d=\"M12 1.8L12.31 1.86L12.57 2.03L12.74 2.29L12.8 2.6L12.8 2.6L12.74 2.91L12.57 3.17L12.31 3.34L12 3.4L8 3.4L7.69 3.34L7.43 3.17L7.26 2.91L7.2 2.6L7.2 2.6L7.26 2.29L7.43 2.03L7.69 1.86L8 1.8Z\"/><path class=\"iso-line\" data-tone=\"mid\" d=\"M8.4 5.6L8.71 5.66L8.97 5.83L9.14 6.09L9.2 6.4L9.2 13.4L9.14 13.71L8.97 13.97L8.71 14.14L8.4 14.2L3.2 14.2L2.89 14.14L2.63 13.97L2.46 13.71L2.4 13.4L2.4 6.4L2.46 6.09L2.63 5.83L2.89 5.66L3.2 5.6Z\"/><circle class=\"ts-head\" cx=\"5.8\" cy=\"9\" r=\"1.5\"/><path class=\"iso-line\" data-tone=\"mid\" d=\"M3.3 14.2C3.5 11.5 4.6 11.2 5.8 11.2S8.1 11.5 8.3 14.2\"/><path class=\"iso-line\" data-tone=\"lo\" data-free=\"\" d=\"M11 8H17.2M11 10.4H14.2M11 12.8H16\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M0 19.2H20\"/><path class=\"iso-line\" data-tone=\"lo\" data-free=\"\" d=\"M2.4 23H6.8\"/></g></g></g></svg><span class=\"ts-sr\" role=\"status\" aria-live=\"polite\" data-status></span></div></div></figure>";
const PADDLE_GEOM = {"POST":[10,-19],"PADDLE":{"r0":4.8,"r1":50,"t":2.4,"z0":30,"z1":84,"tip":1.4},"V":[0.5331784777634264,0.6824373310787413]};
// The live half of Fig 2. Runs inside the figure's IIFE with the kit in
// scope (translateAlong, extrude, cylinder, solidSvg, lineSvg, lineOnTop,
// iso, pathOf). One loop moves the dial, the badges, the lamp, the screen
// and the paddle; everything it shows comes from verdict() in model.mjs.
const D = {"P":{"origin":[296.2958225953301,276.26548034624545],"scale":1.1891313170411753,"azimuth":52,"elevation":30},"V":[0.5331784777634264,0.6824373310787413,0.49999999999999994],"card":{"w":20,"h":26,"t":0.8},"cardY":-43.5,"slotIn":{"x":-59,"top":115},"slotOut":{"x":65,"top":101},"queue":[[-95,2.8,1.2],[-95,-0.6000000000000001,1.2],[-95,-4,1.2],[-95,-7.3999999999999995,1.2]],"done":[[95,-12.4,1.2],[95,-9,1.2],[95,-5.6000000000000005,1.2],[95,-2.200000000000001,1.2]],"fileTop":14,"dial":{"c":[8,-36],"r":4.8,"z":100.4,"detents":[125,155,185,215]},"post":[10,-19],"paddle":{"r0":4.8,"r1":50,"t":2.4,"z0":30,"z1":84,"tip":1.4},"modes":[{"id":"private","word":"private","screen":"PRIVATE","say":"Private: only you get in"},{"id":"people","word":"ana only","screen":"ANA@ACME.COM","say":"Shared with ana@acme.com: only she gets in, with a code by email"},{"id":"domain","word":"@acme.com","screen":"@ACME.COM","say":"Shared with @acme.com: anyone at acme.com gets in, with a code by email"},{"id":"public","word":"public","screen":"PUBLIC","say":"Public: anyone with the link gets in"}],"people":[{"id":"you","email":"you@acme.com","owner":true},{"id":"bob","email":"bob@gmail.com"},{"id":"ana","email":"ana@acme.com"},{"id":"sam","email":"sam@acme.com"}],"listed":["ana@acme.com"],"domain":"acme.com","tour":["private","private","people","people","domain","domain","public"]};
const LISTED = D.listed;
const DOMAIN = D.domain;
const verdict = function verdict(mode, person) {
  if (person.owner) return "owner";
  if (mode === "public") return "open";
  if (mode === "people" && LISTED.includes(person.email)) return "code";
  if (mode === "domain" && person.email.endsWith("@" + DOMAIN)) return "code";
  return "out";
};
const P = D.P;

const stage = host.querySelector(".ts-stage");
const svg = stage.querySelector("svg");
const readout = host.querySelector("[data-readout]");
const status = host.querySelector("[data-status]");
const $ = (sel) => svg.querySelector(sel);
const paddleG = $('[data-part="paddle"]');
const pointer = $('[data-part="pointer"]');
const marks = [...svg.querySelectorAll("[data-mark]")];
const lamp = $('[data-part="lamp"]');
const glow = $('[data-part="glow"]');
const lines = [...svg.querySelectorAll("[data-line]")];
const fly = $('[data-part="fly"]');
const fileEl = { queue: $('[data-cards="queue"]'), done: $('[data-cards="done"]') };
const still = matchMedia("(prefers-reduced-motion: reduce)");

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const lerp3 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
const follow = (x, target, dt, tau) => (still.matches ? target : x + (target - x) * (1 - Math.exp(-dt / tau)));
const modeOf = (id) => D.modes.find((m) => m.id === id);
const personOf = (id) => D.people.find((p) => p.id === id);
const whoOf = (person) => (person.owner ? "you" : person.email);
const SUMMARY = { private: "only you", people: "ana and you", domain: "anyone at " + DOMAIN, public: "anyone with the link" };
const SCREEN_SUMMARY = { private: "ONLY YOU", people: "ANA + YOU", domain: "ALL @" + DOMAIN.toUpperCase(), public: "ANYONE" };

// ---- badges ----
const cards = {};
svg.querySelectorAll("[data-card]").forEach((el) => {
  const wrap = document.createElementNS("http://www.w3.org/2000/svg", "g");
  wrap.appendChild(el);
  cards[el.dataset.card] = { id: el.dataset.card, el, wrap, pos: [0, 0, 0], where: "", anim: null };
});
const deck = $('[data-part="deck"]');
let queue = D.people.map((p) => p.id);
let done = [];
function place(card) {
  card.el.setAttribute("transform", translateAlong(P, card.pos));
}
function settleFiles() {
  queue.forEach((id, i) => {
    const card = cards[id];
    if (!card.anim) card.target = D.queue[i];
  });
  done.forEach((id, i) => {
    const card = cards[id];
    if (!card.anim) card.target = D.done[i];
  });
  // Back to front inside each file: the queue's back is its last badge.
  const order = { queue: [...queue].reverse(), done: [...done] };
  for (const name of ["queue", "done"]) {
    for (const id of order[name]) {
      const card = cards[id];
      if (card.anim && card.where === "fly") continue;
      if (card.wrap.parentNode !== fileEl[name] || card.wrap.nextSibling) fileEl[name].appendChild(card.wrap);
      card.where = name;
    }
  }
}
queue.forEach((id, i) => {
  cards[id].pos = D.queue[i].slice();
  cards[id].target = D.queue[i];
});
deck.remove();
settleFiles();
Object.values(cards).forEach(place);

function toFly(card, clip) {
  if (card.wrap.parentNode !== fly) fly.appendChild(card.wrap);
  card.where = "fly";
  if (clip) card.wrap.setAttribute("clip-path", `url(#${clip})`);
  else card.wrap.removeAttribute("clip-path");
}

// ---- the dial, the screen and the lamp ----
let modeId = D.tour[0];
let pointerDeg = D.dial.detents[0];
function modeIndex(id) {
  return D.modes.findIndex((m) => m.id === id);
}
function pointerAt(deg) {
  const a = (deg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const [cx, cy] = D.dial.c;
  return lineOnTop([cx + dx * 0.9, cy + dy * 0.9], [cx + dx * (D.dial.r - 0.7), cy + dy * (D.dial.r - 0.7)], D.dial.z, P);
}
function screen(l0, l1, l2, tone2 = "hi") {
  const text = [l0, l1, l2];
  lines.forEach((el, i) => {
    if (el.textContent !== text[i]) el.textContent = text[i];
  });
  lines[2].setAttribute("data-tone", tone2);
}
function say(text) {
  if (readout.textContent !== text) readout.textContent = text;
}
function setMode(id, by) {
  if (id === modeId && !by) return;
  modeId = id;
  const mode = modeOf(id);
  const index = modeIndex(id);
  marks.forEach((el, i) => el.setAttribute("data-tone", i === index ? "hi" : "lo"));
  stage.setAttribute("aria-valuenow", String(index + 1));
  stage.setAttribute("aria-valuetext", mode.say);
  if (by) status.textContent = mode.say;
  if (by || !trip || trip.phase === "rest" || trip.phase === "lift" || trip.phase === "toSlot") say(`${mode.word} · ${SUMMARY[id]}`);
  if (!trip || trip.phase === "rest" || trip.phase === "lift" || trip.phase === "toSlot") screen(mode.screen, "", SCREEN_SUMMARY[id]);
  else lines[0].textContent = mode.screen;
}

// ---- the paddle ----
const PG = PADDLE_GEOM;
let paddle = { x: 0, v: 0 };
let shakeAt = -1;
let paddleDrawn = null;
function paddleSvg(deg) {
  const a = (deg * Math.PI) / 180;
  const d = [Math.sin(a), Math.cos(a)];
  const n = [Math.cos(a), -Math.sin(a)];
  const t = PG.PADDLE.t / 2;
  const p = (s, w) => [PG.POST[0] + d[0] * s + n[0] * w, PG.POST[1] + d[1] * s + n[1] * w];
  const ring = [p(PG.PADDLE.r0, -t), p(PG.PADDLE.r1, -t), p(PG.PADDLE.r1, t), p(PG.PADDLE.r0, t)];
  const panel = extrude(ring, PG.PADDLE.z0, PG.PADDLE.z1 - PG.PADDLE.z0, P, { bevel: 0.4 });
  const facing = n[0] * PG.V[0] + n[1] * PG.V[1] > 0 ? 1 : -1;
  const w = facing * (t + 0.02);
  const inset = [
    [...p(PG.PADDLE.r0 + 4, w), PG.PADDLE.z0 + 4],
    [...p(PG.PADDLE.r1 - 4, w), PG.PADDLE.z0 + 4],
    [...p(PG.PADDLE.r1 - 4, w), PG.PADDLE.z1 - 4],
    [...p(PG.PADDLE.r0 + 4, w), PG.PADDLE.z1 - 4],
  ];
  const tip = p(PG.PADDLE.r1, 0);
  const bumper = cylinder(tip[0], tip[1], PG.PADDLE.tip, PG.PADDLE.z0, PG.PADDLE.z1 - PG.PADDLE.z0, P, 16);
  const insetD = pathOf(inset.map((q) => iso(q, P)), true);
  return solidSvg(panel, { tone: "hi", crease: "lo", inner: lineSvg(insetD, { tone: "faint" }) }) + solidSvg(bumper, { tone: "lo", crease: "none" });
}
function drawPaddle(deg) {
  const key = Math.round(deg * 20) / 20;
  if (key === paddleDrawn) return;
  paddleDrawn = key;
  paddleG.innerHTML = paddleSvg(key);
}

// ---- trips: one badge at a time from the queue to the gate and on ----
const T = { lift: 0.28, toSlot: 0.62, down: 0.4, read: 0.45, owner: 0.35, open: 0.3, codeSent: 0.6, codeOk: 0.3, out: 0.85, up: 0.4, toFile: 0.62, drop: 0.28, rest: 0.45 };
let trip = null;
let tripIndex = 0;
let resetting = null;
let clock = 0;
let gateOpen = false;
let lampLevel = 0;
let lampTone = "lo";
let pulse = 0;

function arcPos(from, to, u, lift) {
  const p = lerp3(from, to, ease(u));
  p[2] += Math.sin(Math.PI * u) * lift;
  return p;
}
function startTrip() {
  if (!queue.length) return startReset();
  if (touring) setMode(D.tour[tripIndex % D.tour.length]);
  const id = queue.shift();
  const card = cards[id];
  const person = personOf(id);
  trip = { id, card, person, phase: "lift", t: 0, from: card.pos.slice(), verdict: null };
  card.anim = true;
  settleFiles();
}
function startReset() {
  if (touring) setMode(D.tour[0]);
  const order = D.people.map((p) => p.id).filter((id) => done.includes(id));
  resetting = order.map((id, i) => ({ id, card: cards[id], at: i * 0.22, t: -i * 0.22, from: null, spot: D.queue[i], phase: "wait" }));
  queue = [];
  trip = null;
}
function phase(next) {
  trip.phase = next;
  trip.t = 0;
  trip.from = trip.card.pos.slice();
}
function stepTrip(dt) {
  const tr = trip;
  const card = tr.card;
  const mode = modeOf(modeId);
  tr.t += dt;
  const u = clamp(tr.t / (T[tr.phase] || 1), 0, 1);
  const top = (slot) => [slot.x, D.cardY, slot.top + 3];
  const inside = (slot) => [slot.x, D.cardY, slot.top - D.card.h - 1];
  switch (tr.phase) {
    case "lift": {
      card.pos = lerp3(tr.from, [tr.from[0], tr.from[1], D.fileTop + 6], ease(u));
      if (u >= 1) {
        toFly(card);
        phase("toSlot");
      }
      break;
    }
    case "toSlot": {
      card.pos = arcPos(tr.from, top(D.slotIn), u, 26);
      if (u >= 1) {
        toFly(card, "ts-clip-in");
        phase("down");
      }
      break;
    }
    case "down": {
      card.pos = lerp3(tr.from, inside(D.slotIn), ease(u));
      if (u >= 1) {
        // A public project lets anyone in without a check.
        if (verdict(modeId, tr.person) === "open") {
          tr.verdict = "open";
          phase("open");
          screen(mode.screen, tr.person.email.toUpperCase(), "OPEN TO ALL", "lit");
          grant();
        } else {
          phase("read");
          say(`${mode.word} · reading ${whoOf(tr.person)}`);
          screen(mode.screen, tr.person.email.toUpperCase(), "READING");
        }
      }
      break;
    }
    case "read": {
      pulse = 1;
      if (u >= 1) {
        tr.verdict = verdict(modeId, tr.person);
        const v = tr.verdict;
        if (v === "owner") {
          phase("owner");
          screen(mode.screen, tr.person.email.toUpperCase(), "OWNER", "lit");
          grant();
        } else if (v === "open") {
          phase("open");
          screen(mode.screen, tr.person.email.toUpperCase(), "OPEN TO ALL", "lit");
          grant();
        } else if (v === "code") {
          phase("codeSent");
          say(`${mode.word} · code sent to ${whoOf(tr.person)}`);
          screen(mode.screen, tr.person.email.toUpperCase(), "CODE SENT");
        } else {
          phase("out");
          shakeAt = clock;
          lampTone = "mid";
          say(`${mode.word} · ${whoOf(tr.person)} kept out`);
          screen(mode.screen, tr.person.email.toUpperCase(), "NOT SHARED", "mid");
        }
      }
      break;
    }
    case "codeSent": {
      if (u >= 1) {
        phase("codeOk");
        screen(mode.screen, tr.person.email.toUpperCase(), "CODE OK", "lit");
        grant();
      }
      break;
    }
    case "owner":
    case "open":
    case "codeOk": {
      if (u >= 1) {
        card.pos = inside(D.slotOut);
        toFly(card, "ts-clip-out");
        phase("up");
        tr.exit = "out";
        say(`${mode.word} · ${whoOf(tr.person)} in`);
      }
      break;
    }
    case "out": {
      if (u >= 1) {
        phase("up");
        tr.exit = "back";
      }
      break;
    }
    case "up": {
      const slot = tr.exit === "out" ? D.slotOut : D.slotIn;
      card.pos = lerp3(tr.from, top(slot), ease(u));
      if (u >= 1) {
        toFly(card);
        if (tr.exit === "out") {
          done.push(tr.id);
          tr.spot = D.done[done.length - 1];
          tr.file = "done";
        } else {
          queue.push(tr.id);
          tr.spot = D.queue[queue.length - 1];
          tr.file = "queue";
        }
        phase("toFile");
      }
      break;
    }
    case "toFile": {
      const above = [tr.spot[0], tr.spot[1], D.fileTop + 6];
      card.pos = arcPos(tr.from, above, u, 22);
      if (tr.exit === "out" && tr.t > 0.35 && modeId !== "public") gateOpen = false;
      if (u >= 1) {
        card.anim = null;
        settleFiles();
        card.anim = true;
        fileEl[tr.file].appendChild(card.wrap);
        settleFiles();
        phase("drop");
      }
      break;
    }
    case "drop": {
      card.pos = lerp3(tr.from, tr.spot, ease(u));
      if (u >= 1) {
        card.anim = null;
        card.pos = tr.spot.slice();
        settleFiles();
        if (modeId !== "public") gateOpen = false;
        lampTone = "lo";
        phase("rest");
      }
      break;
    }
    case "rest": {
      if (u >= 1) {
        trip = null;
        tripIndex++;
        if (tripIndex >= D.tour.length && !queue.length) tripIndex = 0;
      }
      break;
    }
  }
  place(card);
}
function grant() {
  gateOpen = true;
  lampTone = "lit";
  lampLevel = 1;
}
function stepReset(dt) {
  let busy = false;
  for (const r of resetting) {
    r.t += dt;
    if (r.t < 0) {
      busy = true;
      continue;
    }
    const card = r.card;
    if (r.phase === "wait") {
      r.phase = "lift";
      r.from = card.pos.slice();
      r.t = 0;
      card.anim = true;
    }
    const dur = { lift: 0.22, fly: 0.55, drop: 0.22 }[r.phase];
    const u = clamp(r.t / dur, 0, 1);
    if (r.phase === "lift") {
      card.pos = lerp3(r.from, [r.from[0], r.from[1], D.fileTop + 6], ease(u));
      if (u >= 1) {
        done = done.filter((id) => id !== r.id);
        toFly(card);
        r.phase = "fly";
        r.t = 0;
        r.from = card.pos.slice();
      }
    } else if (r.phase === "fly") {
      card.pos = arcPos(r.from, [r.spot[0], r.spot[1], D.fileTop + 6], u, 18);
      if (u >= 1) {
        queue.push(r.id);
        fileEl.queue.appendChild(card.wrap);
        card.where = "queue";
        r.phase = "drop";
        r.t = 0;
        r.from = card.pos.slice();
      }
    } else if (r.phase === "drop") {
      card.pos = lerp3(r.from, r.spot, ease(u));
      if (u >= 1) {
        r.phase = "home";
        card.anim = null;
        card.pos = r.spot.slice();
        settleFiles();
      }
    }
    if (r.phase !== "home") busy = true;
    place(card);
  }
  if (!busy) {
    resetting = null;
    tripIndex = 0;
    queue = D.people.map((p) => p.id);
    settleFiles();
    restAt = clock;
  }
}

// ---- the loop ----
let frame = 0;
let last = 0;
let visible = false;
let touring = !still.matches;
let idleTimer = 0;
let restAt = -1;
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  clock += dt;
  if (!still.matches) {
    if (resetting) stepReset(dt);
    else if (trip) stepTrip(dt);
    else if (clock - restAt > 0.6) startTrip();
  }
  // Badges waiting in a file slide forward when the one in front leaves.
  for (const card of Object.values(cards)) {
    if (card.anim || !card.target) continue;
    const before = card.pos[1];
    card.pos = [card.target[0], follow(card.pos[1], card.target[1], dt, 0.16), card.target[2]];
    if (Math.abs(card.pos[1] - card.target[1]) < 0.01) card.pos[1] = card.target[1];
    if (card.pos[1] !== before) place(card);
  }
  // The dial follows the mode.
  const want = D.dial.detents[modeIndex(modeId)];
  pointerDeg = follow(pointerDeg, want, dt, 0.16);
  if (Math.abs(pointerDeg - want) < 0.05) pointerDeg = want;
  pointer.setAttribute("d", pointerAt(pointerDeg));
  // The paddle: a damped spring toward open or shut, plus a short shake when
  // someone is kept out.
  const open = gateOpen || modeId === "public";
  const target = open ? 90 : 0;
  if (still.matches) paddle = { x: target, v: 0 };
  else {
    for (let i = 0; i < 4; i++) {
      const a = (target - paddle.x) * 140 - paddle.v * 21;
      paddle.v += (a * dt) / 4;
      paddle.x += (paddle.v * dt) / 4;
    }
    if (Math.abs(target - paddle.x) < 0.02 && Math.abs(paddle.v) < 0.02) paddle = { x: target, v: 0 };
  }
  let shake = 0;
  if (shakeAt >= 0 && !still.matches) {
    const age = clock - shakeAt;
    shake = age < 0.7 ? 2.2 * Math.sin(age * Math.PI * 2 * 6) * Math.exp(-age / 0.16) * Math.min(1, age / 0.04) : 0;
    if (age >= 0.7) shakeAt = -1;
  }
  drawPaddle(clamp(paddle.x + shake, 0, 92));
  // The lamp: a pulse while reading, pink while someone is let in.
  pulse = Math.max(0, pulse - dt * 2);
  const reading = trip && trip.phase === "read";
  const glowLevel = lampTone === "lit" ? 0.55 : reading ? 0.25 + 0.25 * Math.sin(clock * 14) : 0;
  lampLevel = follow(lampLevel, glowLevel, dt, 0.12);
  glow.style.opacity = lampLevel.toFixed(3);
  const tone = lampTone === "lit" || reading ? "lit" : lampTone;
  if (lamp.getAttribute("data-tone") !== tone) lamp.setAttribute("data-tone", tone);
  const moving = trip || resetting || paddle.v !== 0 || paddle.x !== target || pointerDeg !== want || shakeAt >= 0 || lampLevel > 0.002 || Object.values(cards).some((c) => !c.anim && c.target && c.pos[1] !== c.target[1]);
  frame = visible && (moving || touring || !still.matches) ? requestAnimationFrame(tick) : 0;
}
const run = () => {
  if (!frame && visible) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
};
new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) run();
}, { rootMargin: "120px 0px" }).observe(stage);

function steer(id) {
  touring = false;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    touring = !still.matches;
    run();
  }, 9000);
  setMode(id, true);
  if (still.matches) {
    const mode = modeOf(id);
    say(`${mode.word} · ${SUMMARY[id]}`);
    screen(mode.screen, "", SCREEN_SUMMARY[id]);
  }
  run();
}
const next = (step) => D.modes[(modeIndex(modeId) + step + D.modes.length) % D.modes.length].id;
stage.style.touchAction = "pan-y";
stage.addEventListener("click", () => steer(next(1)));
stage.addEventListener("keydown", (event) => {
  let id = null;
  if (/^[1-4]$/.test(event.key)) id = D.modes[Number(event.key) - 1].id;
  if (event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === " " || event.key === "Enter") id = next(1);
  if (event.key === "ArrowLeft" || event.key === "ArrowDown") id = next(-1);
  if (event.key === "Home") id = D.modes[0].id;
  if (event.key === "End") id = D.modes[D.modes.length - 1].id;
  if (!id) return;
  event.preventDefault();
  steer(id);
});
setMode(modeId);
say(`${modeOf(modeId).word} · ${SUMMARY[modeId]}`);
drawPaddle(0);
pointer.setAttribute("d", pointerAt(pointerDeg));

})();
