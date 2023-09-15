"use strict";

function Pattern(exec) {
    this.exec = exec;
    this.then = function (transform) {
        return new Pattern(function (str, pos) {
            const r = exec(str, pos);
            return r && { res: transform(r.res), end: r.end };
        });
    };
}

function txt(text) {
    return new Pattern(function (str, pos) {
        if (str.substr(pos, text.length) == text)
            return { res: text, end: pos + text.length };
    });
}

function term(end, esc) {
    return new Pattern(function (str, pos) {
       let f = false;
       for (let i = pos; i < str.length; i++) {
           if (str.charAt(i) == esc) {
               f = true;
               continue;
           }
           if (!f && (str.charAt(i) == end)) {
               return { res: str.substr(pos, (i - pos)), end: i };
           }
           f = false;
       }
    });
}

function rgx(regexp) {
    return new Pattern(function (str, pos) {
        const m = regexp.exec(str.slice(pos));
        if (m && m.index == 0)
            return { res: m[0], end: pos + m[0].length };
    });
}

function opt(pattern) {
    return new Pattern(function (str, pos) {
        return pattern.exec(str, pos) || { res: void 0, end: pos };
    });
}

function any(patterns) {
    return new Pattern(function (str, pos) {
        for (let r, i = 0; i < patterns.length; i++)
            if (r = patterns[i].exec(str, pos))
                return r;
    });
}

function seq(patterns) {
    return new Pattern(function (str, pos) {
        let i, r, end = pos, res = [];
        for (i = 0; i < patterns.length; i++) {
            r = patterns[i].exec(str, end);
            if (!r) return;
            res.push(r.res);
            end = r.end;
        }
        return { res: res, end: end };
    });
}

function rep(pattern, separator) {
    const separated = !separator ? pattern :
        seq([separator, pattern]).then(function(r) {return r[1];});
    return new Pattern(function (str, pos) {
        let res = [], end = pos, r = pattern.exec(str, end);
        while (r && r.end > end) {
            res.push(r.res);
            end = r.end;
            r = separated.exec(str, end);
        }
        return { res: res, end: end };
    });
}

const wsp = rgx(/\s+/);

const arg = seq([txt('['),
              term(']', '\\'),
              txt(']')
          ])
         .then(function(r) {return r[1];});

const name = rgx(/\w[\w\d]*/);
const cmd = seq([opt(txt(';')), opt(wsp),
              name, opt(wsp),
              rep(arg, opt(wsp))
          ])
         .then(function(r) {return {name: r[2], arg: r[4]};});

const subseq = new Pattern(function(str, pos) {return sgf.exec(str, pos);});

const sgf = seq([txt('('), opt(wsp),
              rep(any([cmd, subseq]), opt(wsp)),
              txt(')')
          ])
         .then(function(r) {return r[2];});

function parse(text) {
    const r = sgf.exec(text, 0);
    if (r) {
        return r.res;
    } else {
        return null;
    }
}

module.exports.parse = parse;
