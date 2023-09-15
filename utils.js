"use strict";

const _ = require('underscore');

const SCALE = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's'];

function log(board, size) {
    let s = "";
    for (let i = 0; i < size * size; i++) {
        if (s.length >= size) {
            console.log(s);
            s = "";
        }
        if (board[i] == 0) {
            s = s + '.';
            continue;
        }
        if (board[i] > 0) {
            s = s + '*';
        } else {
            s = s + 'O';
        }
    }
    if (s.length > 0) console.log(s);
    console.log('');
}

function isFriend(x, player) {
    if (_.isUndefined(player)) player = 1;
    return x * player > 0.1;
}

function isEnemy(x, player) {
    if (_.isUndefined(player)) player = 1;
    return x * player < -0.1;
}

function isEmpty(x, player) {
    if (_.isUndefined(player)) player = 1;
    return !isEnemy(x, player) && !isFriend(x, player);
}

function navigate(ix, dir, size) {
    const r = ix + dir;
    if (r < 0) return -1;
    if (r >= size * size) return -1;
    if (Math.abs(dir) >= size) {
        if (((ix / size) | 0) != ((r / size) | 0)) return -1;
    }
    return r;
}

function fromFen(setup, size, ko) {
    let board = new Float32Array(16 * size * size);
    let row = 0; let col = 0;
    for (let i = 0; i < setup.length; i++) {
        let c = setup.charAt(i);
        if (c == '/') {
            row++;
            col = 0;
            continue;
        }
        if (c >= '0' && c <= '9') {
            col += parseInt(c);
            continue;
        }
        let piece = 0;
        const pos = row * size + col;
        switch (c) {
            case 'W': 
               piece = 1;
               break;
            case 'w': 
               piece = 1;
               break;
            case 'B': 
               piece = -1;
               break;
            case 'b': 
               piece = -1;
               break;
            case 'X':
               piece = 0;
               ko.push(pos);
               break;
        }
        board[pos] = piece;
        col++;
    }
    return board;
}

function toFen(board, size, ko, move) {
    if (_.isUndefined(ko)) ko = [];
    if (_.isUndefined(move)) move = -1;
    let r = "";
    for (let row = 0; row < size; row++) {
        if (row != 0) r += '/';
        let empty = 0;
        for (let col = 0; col < size; col++) {
            const pos = row * size + col;
            if (_.indexOf(ko, pos) >= 0) {
                r += 'X';
                continue;
            }
            const piece = board[pos];
            if (isEmpty(piece)) {
                if (empty > 8) {
                    r += empty;
                    empty = 0;
                }
                empty++;
            } else {
                if (empty != 0) 
                    r += empty;
                empty = 0;
                if (isFriend(piece, 1)) {
                    r += (move == pos) ? 'B' : 'b';
                } else {
                    r += (move == pos) ? 'W' : 'w';
                }
            }
        }
        if (empty != 0) {
            r += empty;
        }
    }
    return r;
}

function toMove(ix, size) {
    const col = move % size;
    const row = (move / size) | 0;
    return SCALE[col] + (size - row);
}

function getPos(str, size) {
    if (str.length != 2) return null;
    const x = _.indexOf(SCALE, str[0]);
    const y = _.indexOf(SCALE, str[1]);
    if ((x < 0) || (y < 0)) return null;
    return y * size + x;
}

function weight(p, min, max) {
    return (1 - p) * (max - min);
}

function normalize(result, size) {
    if (_.isUndefined(size)) size = result.length;
    let s = 0;
    for (let i = 0; i < size; i++) {
        s = s + result[i];
    }
    if (s > 0) {
        for (let i = 0; i < size; i++) {
            result[i] = result[i] / s;
        }
    }
    return s;
}

function flipX(pos, size) {
    const x = pos % size;
    pos -= x;
    return pos + (size - x - 1);
}

function flipY(pos, size) {
    const y = (pos / size) | 0;
    pos -= y * size;
    return (size - y - 1) * size + pos;
}

function toRight(pos, size) {
    const x = pos % size;
    const y = (pos / size) | 0;
    return x * size + (size - y - 1);
}

function toLeft(pos, size) {
    const x = pos % size;
    const y = (pos / size) | 0;
    return (size - x - 1) * size + y;
}

function rotate(pos, ix, size) {
    switch (ix) {
        case 1:
        case 9:
            pos = flipX(pos, size);
            break;
        case 2:
        case 10:
            pos = flipY(pos, size);
            break;
        case 3:
        case 11:
            pos = flipX(pos, size);
            pos = flipY(pos, size);
            break;
        case 4:
        case 12:
            pos = toRight(pos, size);
            break;
        case 5:
        case 13:
            pos = toLeft(pos, size);
            break;
        case 6:
        case 14:
            pos = toRight(pos, size);
            pos = flipX(pos, size);
            break;
        case 7:
        case 15:
            pos = toLeft(pos, size);
            pos = flipX(pos, size);
            break;
    }
    return pos;
}

module.exports.log = log;
module.exports.isFriend = isFriend;
module.exports.isEnemy = isEnemy;
module.exports.isEmpty = isEmpty;
module.exports.navigate = navigate;
module.exports.fromFen = fromFen;
module.exports.toFen = toFen;
module.exports.toMove = toMove;
module.exports.getPos = getPos;
module.exports.weight = weight;
module.exports.normalize = normalize;
module.exports.rotate = rotate;
