"use strict";

const ai = require('./go');
const axios = require('axios');
const _ = require('underscore');

const joseki = require('./joseki');

const STATE = {
    INIT: 1,
    TURN: 2,
    MOVE: 3,
    WAIT: 4,
    STOP: 5,
    RECO: 6,
    GETM: 7,
    RQST: 8,
    LERN: 9,
    CLOS: 10
};

const SERVICE  = 'https://127.0.0.1:3000';
const USERNAME = 'GoBot';
const PASSWORD = 'GoBot';

let TOKEN   = null;
let sid     = null;
let uid     = null;
let setup   = null;
let turn    = null;
let last    = null;

var winston = require('winston');
require('winston-daily-rotate-file');

const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'HH:mm:ss'
    }),
    winston.format.printf(
        info => `${info.level}: ${info.timestamp} - ${info.message}`
    )
);

var transport = new winston.transports.DailyRotateFile({
    dirname: '',
    filename: 'gobot-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d'
});

var logger = winston.createLogger({
    format: logFormat,
    transports: [
      transport
    ]
});

function App() {
    this.state  = STATE.INIT;
    this.states = [];
}

let app = new App();

let init = function(app) {
    console.log('INIT');
    logger.info('INIT');
    app.state = STATE.WAIT;
    axios.post(SERVICE + '/api/auth/login', {
        username: USERNAME,
        password: PASSWORD
    })
    .then(function (response) {
      TOKEN = response.data.access_token;
      app.state = STATE.TURN;
    })
    .catch(function (error) {
      console.log('INIT ERROR: ' + error);
      logger.error('INIT ERROR: ' + error);
      app.state  = STATE.STOP;
    });
    return true;
}

let recovery = function(app) {
    //  console.log('RECO');
    app.state = STATE.WAIT;
    axios.post(SERVICE + '/api/session/recovery', {
        id: sid,
        setup_required: true
    }, {
        headers: { Authorization: `Bearer ${TOKEN}` }
    })
    .then(function (response) {
        console.log(response.data);
        uid = response.data.uid;
        app.state = STATE.GETM;
      })
      .catch(function (error) {
        console.log('RECO ERROR: ' + error);
        logger.error('RECO ERROR: ' + error);
        app.state  = STATE.INIT;
      });
      return true;
}
    
let closeSession = function(app) {
    console.log('CLOS');
    app.state = STATE.WAIT;
    axios.post(SERVICE + '/api/session/close', {
        id: sid
    }, {
        headers: { Authorization: `Bearer ${TOKEN}` }
    }).then(function (response) {
        app.state = STATE.MOVE;
    }).catch(function (error) {
      console.log('TURN ERROR: ' + error);
        logger.error('TURN ERROR: ' + error);
        app.state  = STATE.INIT;
      });
      return true;
}

let getConfirmed = function(app) {
    //  console.log('GETM');
    app.state = STATE.WAIT;
    axios.get(SERVICE + '/api/move/confirmed/' + uid, {
        headers: { Authorization: `Bearer ${TOKEN}` }
    })
    .then(function (response) {
        if ((response.data.length > 0) && response.data[0].result_id) {
            console.log(response.data);
            app.state = STATE.CLOS;
        } else {
            app.state = STATE.MOVE;
        }
    })
    .catch(function (error) {
        console.log('GETM ERROR: ' + error);
        logger.error('GETM ERROR: ' + error);
        app.state  = STATE.INIT;
    });
    return true;
}

let learn = function(app) {
    //  console.log('LERN');    
    app.state = STATE.WAIT;
    axios.delete(SERVICE + '/api/ai/fit/2/12800', {
        headers: { Authorization: `Bearer ${TOKEN}` }
    })
    .then(function (response) {
        if (response.data.length > 0) {
            let data = [];
            _.each(response.data, function(d) {
                const result = d.setup.match(/[?&]setup=(.*)/);
                if (result && (d.move < 19 * 19)) {
                    data.push({
                        fen: result[1],
                        pos: d.move
                    });
                }
            });
            if (data.length > 0) {
                ai.Fit(data, logger, SERVICE);
            }
        } 
        app.state = STATE.RQST;
    })
    .catch(function (error) {
        console.log('RQST ERROR: ' + error);
        logger.error('RQST ERROR: ' + error);
        app.state  = STATE.INIT;
    });
    return true;
}

function AdvisorCallback(moves, time) {
    _.each(moves, function(m) {
        console.log('move = ' + m.move + ', value=' + m.weight + ', time = ' + time);
        logger.info('move = ' + m.move + ', value=' + m.weight + ', time = ' + time);
    });
    app.state  = STATE.WAIT;
    axios.post(SERVICE + '/api/ai', moves , {
        headers: { Authorization: `Bearer ${TOKEN}` }
    })
    .then(function (response) {
        app.state  = STATE.RQST;
    })
    .catch(function (error) {
        console.log('RQST ERROR: ' + error);
        logger.error('RQST ERROR: ' + error);
        app.state  = STATE.INIT;
    });
}

let request = function(app) {
    //  console.log('RQST');
    app.state = STATE.WAIT;
    axios.get(SERVICE + '/api/ai/2', {
        headers: { Authorization: `Bearer ${TOKEN}` }
    })
    .then(function (response) {
        if (response.data.length > 0) {
            const sid = response.data[0].sid;
            const setup = response.data[0].setup;
            let coeff = response.data[0].coeff;
            if (!coeff) coeff = 5;
            const result = setup.match(/[?&]setup=(.*)/);
            if (result) {
                let fen = result[1];
                console.log('[' + sid + '] fen = ' + fen + ', coeff = ' + coeff);
                logger.info('[' + sid + '] fen = ' + fen);
                ai.Advisor(sid, fen, coeff, AdvisorCallback);
            } else {
                app.state = STATE.TURN;
            }
        } else {
            app.state = STATE.TURN;
        }
    })
    .catch(function (error) {
        console.log('RQST ERROR: ' + error);
        logger.error('RQST ERROR: ' + error);
        app.state  = STATE.INIT;
    });
    return true;
}

let checkTurn = function(app) {
    //  console.log('TURN');
    app.state = STATE.WAIT;
    axios.get(SERVICE + '/api/session/current', {
        headers: { Authorization: `Bearer ${TOKEN}` }
    })
    .then(function (response) {
        if (response.data.length > 0) {
//          console.log(response.data);
            sid = response.data[0].id;
            setup = response.data[0].last_setup;
            last = response.data[0].last_turn;
            app.state = STATE.RECO;
        } else {
            app.state = STATE.RQST; // STATE.LERN;
        }
    })
    .catch(function (error) {
        console.log('TURN ERROR: ' + error);
        logger.error('TURN ERROR: ' + error);
        app.state  = STATE.INIT;
    });
    return true;
}

function getSetup(fen) {
    let r = '?turn=';
    if (turn == 0) {
        r += '1;&setup=' + fen;
    } else {
        r += '0;&setup=' + fen;
    }
    return r;
}

function FailTurnCallback(time) {
    console.log('uid = ' + uid + ', time = ' + time);
    logger.info('uid = ' + uid + ', time = ' + time);
    axios.post(SERVICE + '/api/session/close', {
        loser: uid
    }, {
        headers: { Authorization: `Bearer ${TOKEN}` }
    })
    .then(function (response) {
        app.state  = STATE.TURN;
    })
    .catch(function (error) {
        console.log('MOVE ERROR: ' + error);
        logger.error('MOVE ERROR: ' + error);
        app.state  = STATE.INIT;
    });
}

function FinishTurnCallback(bestMove, fen, value, time) {
    let move = ai.FormatMove(bestMove);
    const result = setup.match(/[?&]turn=(\d+)/);
    if (result) {
        turn = result[1];
    }
    console.log('move = ' + move + ', value=' + value + ', time = ' + time);
    logger.info('move = ' + move + ', value=' + value + ', time = ' + time);
    app.state  = STATE.WAIT;
    let tn = null;
    if (last !== null) {
        last++;
        tn = last;
    }
    axios.post(SERVICE + '/api/move', {
        uid: uid,
        next_player: (turn == 0) ? 2 : 1,
        move_str: move,
        setup_str: getSetup(fen),
        turn_num: tn,
        note: 'value=' + value + ', time = ' + time
    }, {
        headers: { Authorization: `Bearer ${TOKEN}` }
    })
    .then(function (response) {
        app.state  = STATE.TURN;
    })
    .catch(function (error) {
        console.log('MOVE ERROR: ' + error);
        logger.error('MOVE ERROR: ' + error);
        app.state  = STATE.INIT;
    });
}

let LoggerInfo = function(s) {
    logger.info(s);
}

let sendMove = function(app) {
    //  console.log('MOVE');
    app.state  = STATE.WAIT;
    const result = setup.match(/[?&]setup=(.*)/);
    if (result) {
        let fen = result[1];
        console.log('[' + sid + '] fen = ' + fen);
        logger.info('[' + sid + '] fen = ' + fen);
        ai.FindMove(fen, FinishTurnCallback, FailTurnCallback, LoggerInfo);
    } else {
        app.state  = STATE.STOP;
    }
    return true;
}

let wait = function(app) {
//  console.log('WAIT');
    return true;
}
    
let stop = function(app) {
    console.log('STOP');
    return false;
}
    
App.prototype.exec = function() {
    if (_.isUndefined(this.states[this.state])) return true;
    return this.states[this.state](this);
}
        
app.states[STATE.INIT] = init;
app.states[STATE.WAIT] = wait;
app.states[STATE.STOP] = stop;
app.states[STATE.TURN] = checkTurn;
app.states[STATE.MOVE] = sendMove;
app.states[STATE.RECO] = recovery;
app.states[STATE.GETM] = getConfirmed;
app.states[STATE.RQST] = request;
app.states[STATE.LERN] = learn;
app.states[STATE.CLOS] = closeSession;

joseki.create();

let run = function() {
    if (app.exec()) {
        setTimeout(run, 1000);
    }
}
run();
