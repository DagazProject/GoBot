"use strict";

const _ = require('underscore');
const fs = require('fs');
const sgf = require('./sgf');
const zobrist = require('./zobrist');
const utils = require('./utils');

const FILE = "./data/joseki.sgf";
const SIZE = 19;

const RANGES = [{
    minX: 0,
    maxX: 10,
    minY: 0,
    maxY: 10
},
{
    minX: 8,
    maxX: 18,
    minY: 0,
    maxY: 10
},
{
    minX: 0,
    maxX: 10,
    minY: 8,
    maxY: 18
},
{
    minX: 8,
    maxX: 18,
    minY: 8,
    maxY: 18
}];

let instance = null;

function load(text, size, storage, z) {
    const sz = size ? size : MAX_SIZE;
    const data = sgf.parse(text);
    if (data === null) return false;
    let board = new Int8Array(sz * sz);
    let undo = [];
    parse(data, board, size, undo, storage, z);
    return true;
}

function apply(board, size, pos, player, undo) {
    if (board[pos] != 0) return false;
    board[pos] = player;
    undo.push({
        pos: pos,
        value: 0
    });
    let captured = []; let dame = 0; let group = [pos];
    _.each([1, -1, size, -size], function(dir) {
        const p = utils.navigate(pos, dir, size);
        if (p === null) return;
        if (board[p] == 0) {
            dame++;
            return;
        }
        if (board[p] != player) {
            let g = [p]; let d = 0;
            for (let i = 0; i < g.length; i++) {
                _.each([1, -1, size, -size], function(delta) {
                    const q = utils.navigate(g[i], delta, size);
                    if (q === null) return;
                    if (_.indexOf(g, q) >= 0) return;
                    if (board[q] == 0) {
                        d++;
                        return;
                    }
                    if (board[q] == player) return;
                    g.push(q);
                });
            }
            if (d == 0) {
                captured = _.union(captured, g);
            }
            return;
        }
        group.push(p);
    });
    if (captured.length > 0) {
        _.each(captured, function(p) {
            undo.push({
                pos: p,
                value: board[p]
            });
            board[p] = 0;
        });
        return true;
    }
    if (dame == 0) {
        for (let i = 0; i < group.length; i++) {
            _.each([1, -1, size, -size], function(dir) {
                const p = utils.navigate(group[i], dir, size);
                if (p === null) return;
                if (_.indexOf(group, p) >= 0) return;
                if (board[p] != player) return;
                if (board[p] == 0) {
                    dame++;
                    return;
                }
                group.push(p);
            });
        }
        if (dame == 0) {
            undo.pop();
            board[pos] = 0;
            return false;
        }
    }
    return true;
}

function parse(data, board, size, undo, storage, z) {
    const mark = undo.length;
    for (let i = 0; i < data.length; i++) {
        if (_.isArray(data[i])) {
            parse(data[i], board, size, undo, storage, z);
            continue;
        }
        if (data[i].name == 'SZ') {
            size = +data[i].arg[0];
            continue;
        }
        if ((data[i].name == 'W') || (data[i].name == 'B')) {
            const player = (data[i].name == 'B') ? 1 : -1;
            const pos = utils.getPos(data[i].arg[0], size);
            if (pos === null) continue;
            if (undo.length > 1) {
                const fen = utils.toFen(board, size);
                const id = toZ(board, size, z);
//              console.log(fen + ' [' + id + ']: ' + pos);
                for (let ix = 0; ix < 8; ix ++) {
                    const h = toZ(board, size, z, ix);
                    const p = utils.rotate(pos, ix, size);
//                  if (h == 538941316) console.log('***');
                    if (!storage[h]) {
                        storage[h] = [p];
                    } else {
                        if (_.indexOf(storage[h], p) < 0) storage[h].push(p);
                    }
                }
            }
            if (!apply(board, size, pos, player, undo)) break;
        }
    }
    while (undo.length > mark) {
        const u = undo.pop();
        board[u.pos] = u.value;
    }
}

function toZ(board, size, z, ix) {
    let h = 0;
    if (_.isUndefined(ix)) ix = 0;
    for (let pos = 0; pos < size * size; pos++) {
        if (board[pos] == 0) continue;
        h = h ^ z.hash(board[pos], utils.rotate(pos, ix, size));
    }
    return h;
}

function load(text, size, storage, z) {
    const sz = size ? size : MAX_SIZE;
    const data = sgf.parse(text);
    if (data === null) return false;
    let board = new Int8Array(sz * sz);
    let undo = [];
    parse(data, board, size, undo, storage, z);
    return true;
}

function joseki(file, size) {
    this.z = new zobrist.create();
    this.size = size;
    this.storage = [];
    fs.readFile(file, (err, data) => {
        if (err) {
            console.log(err);
            return;
        }
        load(data.toString(), size, this.storage, this.z);
    });
}

function create() {
    if (instance === null) {
        instance = new joseki(FILE, SIZE);
    }
    return instance;
}

joseki.prototype.advise = function(fen, result) {
    const board = utils.fromFen(fen, SIZE, []);
    for (let ix = 0; ix < RANGES.length; ix++) {
        let h = 0; let c = 0;
        for (let y = RANGES[ix].minY; y <= RANGES[ix].maxY; y++) {
            for (let x = RANGES[ix].minX; x <= RANGES[ix].maxX; x++) {
                const pos = y * SIZE + x;
                if (board[pos] == 0) continue;
                h = h ^ this.z.hash(board[pos], pos);
                c++;
//              console.log('IX = ' + ix + ', pos = ' + pos + ', piece = ' + board[pos] + ', h = ' + this.z.hash(board[pos], pos));
            }
        }
//      if (h != 0) console.log('H = ' + h);
        if (this.storage[h] && (c > 1)) {
            _.each(this.storage[h], function(p) {
                result[p] = 0.9;
            });
        }
    
    }
}

module.exports.create = create;
