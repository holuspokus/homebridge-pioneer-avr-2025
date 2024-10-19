"use strict";

const net = require("net");



const PORT = 23;
const HOST = "127.0.0.1";

let disconnectTimeout = null;

let connectionReady = false;

let thisThis = null;
let reconnectCounter = 0;

let tryToReconnectTimeout = null;
let checkQueueInterval = null;
let checkQueueIntervalIsRunning = null

let disconnectOnExitFunction = function (err) {
    if (err && String(err).length > 3) {
        console.error((new Date).toUTCString() + ' uncaughtException:', err.message)
        console.error(err.stack)
    }
    console.log("nothing to disconnect, connectionReady:", connectionReady);
};

class TelnetAvr {
    constructor(host, port) {
        this.host = host || HOST;
        this.port = port || PORT;
        this.display = null;
        this.displayChanged = function (error, data) {
            console.log(" ++ displayChanged called.", error, data);
        };
        this.queueLock = false;
        this.connectionReady = false;
        this.queueLockDate = Date.now();
        this.lastWrite = null;
        this.lastMessageRecieved = null
        this.queue = [];
        this.queueCallbackChars = {};
        this.queueQuerys = [];
        this.clearQueueTimeout = null
        this.clearQueue = function(){
            thisThis.queue = [];
            thisThis.queueCallbackChars = {};
            thisThis.queueQuerys = [];
        }

        this.socket = null;

        this.fallbackOnData = function (error, data) {
            console.log(" ++ fallbackOnData called.", error, data);
        };

        thisThis = this;
    }

    disconnect() {
        try {
            this.clearQueue();
            if (this.socket != null) {
                this.socket.end();
                this.socket.destroy();
                setTimeout(function () {
                    thisThis.socket = null;
                }, 200);
                clearInterval(checkQueueInterval);
            }

        } catch (e) {
            console.error(e);
        }
    }

    connect(callback) {
        if (typeof callback !== "function") {
            callback = function () {};
        }

        if (
            connectionReady === false &&
            thisThis.socket !== null &&
            thisThis !== null
        ) {
            // when connect() called again
            try {
                this.socket.connect(thisThis.port, thisThis.host, () => {
                    reconnectCounter = 0
                    connectionReady = true;
                    require("deasync").sleep(10);
                    thisThis.connectionReady = true;
                    try {
                        callback();
                    } catch (e) {
                        console.error(e);
                    }
                });
            } catch (e) {
                console.error(e);
            }
        } else {
            // when connect() called the first time
            if (thisThis.socket === null && thisThis !== null) {
                disconnectOnExitFunction = function (err) {
                    if (err && String(err).length > 3) {
                        console.error((new Date).toUTCString() + ' uncaughtException:', err.message)
                        console.error(err.stack)
                    }
                    if (connectionReady === true) {
                        // console.log(
                        //     "disconnecting from telnet",
                        //     connectionReady,
                        // );
                        thisThis.disconnect();
                    }
                };

                process.stdin.resume();
                // so the program will not close instantly

                // do something when app is closing
                process.on("exit", disconnectOnExitFunction.bind({}));

                // catches ctrl+c event
                process.on("SIGINT", disconnectOnExitFunction.bind({}));

                // catches "kill pid" (for example: nodemon restart)
                process.on("SIGUSR1", disconnectOnExitFunction.bind({}));
                process.on("SIGUSR2", disconnectOnExitFunction.bind({}));

                // catches uncaught exceptions
                process.on(
                    "uncaughtException",
                    disconnectOnExitFunction.bind({}),
                );

                clearInterval(checkQueueInterval);
                checkQueueInterval = setInterval(function () {
                    if (connectionReady && thisThis.lastWrite !== null && thisThis.lastWrite - thisThis.lastMessageRecieved > (60*1000)) {
                        // no response? not connectet anymore?
                        connectionReady = false
                        thisThis.queue = []
                    }
                    if (
                        checkQueueIntervalIsRunning === true ||
                        thisThis === null ||
                        thisThis.queue.length === 0 ||
                        connectionReady !== true
                    ) {
                        return;
                    }

                    checkQueueIntervalIsRunning = true

                    try {

                        if (
                            thisThis !== null &&
                            thisThis.queueLock !== false &&
                            Date.now() - thisThis.queueLockDate > 5000
                        ) {
                            thisThis.queueLock = false;
                        }
                        if (
                            thisThis !== null &&
                            thisThis.queueLock === false &&
                            connectionReady === true &&
                            thisThis.queue.length > 0
                        ) {
                            (function (message) {
                                if (
                                    !message.startsWith("?") &&
                                    !message.startsWith("!")
                                ) {
                                    if (Date.now() - thisThis.lastWrite < 38) {
                                        while (
                                            Date.now() - thisThis.lastWrite <
                                            39
                                        ) {
                                            require("deasync").sleep(10);
                                        }
                                    }
                                    thisThis.socket.write(message + "\r\n");
                                    thisThis.lastWrite = Date.now();
                                } else {
                                    if (message.startsWith("!")) {
                                        message = message.substring(1);
                                    }
                                    thisThis.queueLock = true;
                                    thisThis.queueLockDate = Date.now();
                                    if (Date.now() - thisThis.lastWrite < 38) {
                                        while (
                                            Date.now() - thisThis.lastWrite <
                                            39
                                        ) {
                                            require("deasync").sleep(10);
                                        }
                                    }
                                    thisThis.socket.write(message + "\r\n");
                                    thisThis.lastWrite = Date.now();
                                }
                            })(thisThis.queue[0][0]);
                        }

                    } catch (e) {
                        console.error(e);
                    }
                    checkQueueIntervalIsRunning = false
                }, 50);

                this.socket = net.Socket();
                this.socket.setTimeout(2 * 60 * 60 * 1000, () =>
                    this.socket.destroy(),
                );
                this.socket.once("connect", () =>
                    this.socket.setTimeout(2 * 60 * 60 * 1000),
                );
                this.socket.connect(thisThis.port, thisThis.host, () => {
                    reconnectCounter = 0
                    connectionReady = true;
                    require("deasync").sleep(10);
                    thisThis.connectionReady = true;
                    try {
                        callback();
                    } catch (e) {
                        console.error(e);
                    }
                });

                this.socket.on("close", () => {
                    connectionReady = false;
                    thisThis.connectionReady = false;


                    console.log(
                        (new Date).toUTCString() +
                        " [" + String(reconnectCounter) + "] sendMessage:Close"
                    )

                    try {
                        thisThis.disconnect();
                    } catch (e) {
                        // console.log(e);
                    }


                    // try to reconnect, hold connection
                    let sleepTime = reconnectCounter + 1;
                    if (sleepTime > 100) {
                        sleepTime = 60 * 60;
                    } else if (sleepTime > 30) {
                        sleepTime = 60;
                    }
                    clearTimeout(tryToReconnectTimeout);
                    tryToReconnectTimeout = setTimeout(function(){
                      console.log(
                          (new Date).toUTCString() +
                          " try to connect ..."
                      );
                      reconnectCounter++;
                      thisThis.connect(function () {
                          //only called when successfully
                          reconnectCounter = 0
                      });
                    }, sleepTime * 1000);

                });

                this.socket.on("data", (d) => {
                    let callbackCalled = false;
                    thisThis.lastMessageRecieved = Date.now()
                    try {
                        let data = d
                            .toString()
                            .replace("\n", "")
                            .replace("\r", "")
                            .trim();
                        if (data.startsWith("FL")) {
                            // message on display
                            // data = FL0020204558542E53544552454F2020
                            let displayedMessage = data
                                    .substr(2)
                                    .trim()
                                    .match(/(..?)/g),
                                displayChars = {
                                    '00': ' ', '01': '[🔁🔀]', '02': '🔁', '03': '🔀', '04': '↕️', '05': '', '06': '', '07': 'I', '08': 'II', '09': '<', '0a': '>', '0b': '❤️', '0c': '.', '0d': '.0', '0e': '.5', '0f': 'Ω', '10': '0', '11': '1', '12': '2', '13': '3', '14': '4', '15': '5', '16': '6', '17': '7', '18': '8', '19': '9', '1a': 'A', '1b': 'B', '1c': 'C', '1d': 'F', '1e': 'M', '1f': '-', '20': ' ', '21': '!', '22': '"', '23': '#', '24': '$', '25': '%', '26': '&', '27': '\'', '28': '(', '29': ')', '2a': '*', '2b': '+', '2c': ',', '2d': '-', '2e': '.', '2f': '/', '30': '0', '31': '1', '32': '2', '33': '3', '34': '4', '35': '5', '36': '6', '37': '7', '38': '8', '39': '9', '3a': ':', '3b': ';', '3c': '<', '3d': '=', '3e': '>', '3f': '?', '40': '@', '41': 'A', '42': 'B', '43': 'C', '44': 'D', '45': 'E', '46': 'F', '47': 'G', '48': 'H', '49': 'I', '4a': 'J', '4b': 'K', '4c': 'L', '4d': 'M', '4e': 'N', '4f': 'O', '50': 'P', '51': 'Q', '52': 'R', '53': 'S', '54': 'T', '55': 'U', '56': 'V', '57': 'W', '58': 'X', '59': 'Y', '5a': 'Z', '5b': '[', '5c': '\\', '5d': ']', '5e': '^', '5f': '_', '60': '||', '61': 'a', '62': 'b', '63': 'c', '64': 'd', '65': 'e', '66': 'f', '67': 'g', '68': 'h', '69': 'i', '6a': 'j', '6b': 'k', '6c': 'l', '6d': 'm', '6e': 'n', '6f': 'o', '70': 'p', '71': 'q', '72': 'r', '73': 's', '74': 't', '75': 'u', '76': 'v', '77': 'w', '78': 'x', '79': 'y', '7a': 'z', '7b': '{', '7c': '|', '7d': '}', '7e': '~', '7f': '◼︎', '80': 'Œ', '81': 'œ', '82': 'Ĳ', '83': 'ĳ', '84': '∏', '85': '∓', '86': ' ', '87': ' ', '88': ' ', '89': ' ', '8a': ' ', '8b': ' ', '8c': '←', '8d': '↑', '8e': '→', '8f': '↓', '90': '+', '91': '♪', '92': '📁', '93': ' ', '94': ' ', '95': ' ', '96': ' ', '97': ' ', '98': ' ', '99': ' ', '9a': ' ', '9b': ' ', '9c': ' ', '9d': ' ', '9e': ' ', '9f': ' ', 'a0': ' ', 'a1': '¡', 'a2': '¢', 'a3': '£', 'a4': '⦻', 'a5': '¥', 'a6': ':', 'a7': '', 'a8': '¨', 'a9': '©', 'aa': 'a', 'ab': '<<', 'ac': ' ', 'ad': ' ', 'ae': '®', 'af': ' ', 'b0': '°', 'b1': '±', 'b2': '', 'b3': '', 'b4': '', 'b5': '', 'b6': '', 'b7': '', 'b8': '', 'b9': '', 'ba': '', 'bb': '', 'bc': '', 'bd': '', 'be': '', 'bf': '', 'c0': '', 'c1': '', 'c2': '', 'c3': '', 'c4': '', 'c5': '', 'c6': '', 'c7': '', 'c8': '', 'c9': '', 'ca': '', 'cb': '', 'cc': '', 'cd': '', 'ce': '', 'cf': '', 'd0': '', 'd1': '', 'd2': '', 'd3': '', 'd4': '', 'd5': '', 'd6': '', 'd7': '', 'd8': '', 'd9': '', 'da': '', 'db': '', 'dc': 'Ü', 'dd': '', 'de': '', 'df': 'ß', 'e0': '', 'e1': '', 'e2': '', 'e3': '', 'e4': 'ä', 'e5': '', 'e6': '', 'e7': '', 'e8': '', 'e9': '', 'ea': '', 'eb': '', 'ec': '', 'ed': '', 'ee': '', 'ef': '', 'f0': '', 'f1': '', 'f2': '', 'f3': '', 'f4': '', 'f5': '', 'f6': 'ö', 'f7': '', 'f8': '', 'f9': '', 'fa': '', 'fb': '', 'fc': 'ü', 'fd': '', 'fe': '', 'ff': ''
                                };

                            let displayCharsKeys = Object.keys(displayChars),
                                outMessage = "";
                            for (let pair in displayedMessage) {
                                pair = String(
                                    displayedMessage[pair],
                                ).toLowerCase();
                                if (displayCharsKeys.indexOf(pair) > -1) {
                                    outMessage += displayChars[pair];
                                }
                            }
                            outMessage = outMessage.trim();
                            data = "FL" + outMessage;

                            thisThis.display = outMessage;

                            try {
                                thisThis.displayChanged(null, outMessage);
                            } catch (e) {
                                console.log("[DISPLAY] " + outMessage);
                                console.error(e);
                            }
                        }

                        if (
                            thisThis.queueLock === true &&
                            thisThis.queue.length > 0
                        ) {
                            let callbackKeys = Object.keys(
                                thisThis.queueCallbackChars,
                            );
                            for (let callbackKey in callbackKeys) {
                                if (
                                    data.indexOf(callbackKeys[callbackKey]) > -1
                                ) {
                                    for (let i in thisThis.queueCallbackChars[
                                        callbackKeys[callbackKey]
                                    ]) {
                                        let runThis =
                                            thisThis.queueCallbackChars[
                                                callbackKeys[callbackKey]
                                            ][i];
                                        if (typeof runThis == "function") {
                                            try {
                                                let runThisThis = runThis.bind(
                                                    {},
                                                );
                                                runThisThis(null, data);
                                                callbackCalled = true;
                                            } catch (e) {
                                                console.error(e);
                                            }
                                        }
                                        thisThis.queueCallbackChars[
                                            callbackKeys[callbackKey]
                                        ].splice(i, 1);

                                        for (let u in thisThis.queue) {
                                            if (
                                                thisThis.queue[u][1] ==
                                                callbackKeys[callbackKey]
                                            ) {
                                                thisThis.queueQuerys.splice(
                                                    thisThis.queueQuerys.indexOf(
                                                        thisThis.queue[u][0],
                                                    ),
                                                    1,
                                                );
                                                thisThis.queue.splice(u, 1);
                                                thisThis.queueLock = false;
                                            }
                                        }
                                    }
                                }
                            }

                            if (
                                callbackCalled === false &&
                                thisThis.queueLock !== false &&
                                data.startsWith("E")
                            ) {
                                let thisCallbackKey = thisThis.queue[0][1];
                                if (
                                    Object.keys(
                                        thisThis.queueCallbackChars,
                                    ).indexOf(thisCallbackKey) > -1
                                ) {
                                    for (let i in thisThis.queueCallbackChars[
                                        thisCallbackKey
                                    ]) {
                                        let runThis =
                                            thisThis.queueCallbackChars[
                                                thisCallbackKey
                                            ][i];
                                        if (typeof runThis == "function") {
                                            try {
                                                let runThisThis = runThis.bind(
                                                    {},
                                                );
                                                runThisThis(
                                                    null,
                                                    data + thisCallbackKey,
                                                );
                                                callbackCalled = true;
                                            } catch (e) {
                                                console.error(e);
                                            }
                                        }
                                        thisThis.queueCallbackChars[
                                            thisCallbackKey
                                        ].splice(i, 1);

                                        for (let u in thisThis.queue) {
                                            if (
                                                thisThis.queue[u][1] ==
                                                thisCallbackKey
                                            ) {
                                                thisThis.queueQuerys.splice(
                                                    thisThis.queueQuerys.indexOf(
                                                        thisThis.queue[u][0],
                                                    ),
                                                    1,
                                                );
                                                thisThis.queue.splice(u, 1);
                                                thisThis.queueLock = false;
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        if (
                            callbackCalled === false &&
                            !data.startsWith("FL") &&
                            !data.startsWith("R") &&
                            !data.startsWith("ST") &&
                            ["RGC","RGD","GBH","GHH","VTA","AUA","AUB","GEH"].indexOf(data.substr(0, 3)) === -1
                        ) {
                            try {
                                let runThisOnData = this.fallbackOnData.bind(
                                    {},
                                );
                                runThisOnData(null, data);
                            } catch (e) {
                                console.error(e);
                            }
                        }
                    } catch (e) {
                        console.error(e);
                    }
                });

                this.socket.on("error", (err) => {
                    console.log("sendMessage:Error " + String(err));
                });
            }
        }
    }

    sendMessage(message, callbackChars, onData) {
        if (connectionReady && thisThis.lastWrite !== null && thisThis.lastWrite - thisThis.lastMessageRecieved > (60*1000)) {
            // no response? not connectet anymore?
            connectionReady = false
        }

        if (callbackChars === undefined) {
            if (Date.now() - thisThis.lastWrite < 38) {
                while (Date.now() - thisThis.lastWrite < 38) {
                    require("deasync").sleep(10);
                }
            }
            thisThis.socket.write(message + "\r\n");
            thisThis.lastWrite = Date.now();

            try {
                onData(null, message + ":SENT");
            } catch (e) {
                console.error(e);
            }

            return;
        }

        clearTimeout(this.clearQueueTimeout)
        this.clearQueueTimeout = setTimeout( () => { thisThis.clearQueue(); }, (5*60*1000))

        if (this.queueQuerys.indexOf(message) === -1) {
            this.queue.push([message, callbackChars]);
        }

        if (Object.keys(this.queueCallbackChars).indexOf(callbackChars) == -1) {
            this.queueCallbackChars[callbackChars] = [];
        }
        this.queueCallbackChars[callbackChars].push(onData);
        this.queueQuerys.push(message);

        if (connectionReady === false) {
            setTimeout(function () {
                thisThis.connect(function () {});
            }, 0);
        }

        let whileCounter = 0;
        while (connectionReady === false && whileCounter++ <= 5) {
            require("deasync").sleep(1000);
        }

        thisThis.connect(function () {});

        whileCounter = 0;
        while (connectionReady === false && whileCounter++ < 50) {
            require("deasync").sleep(100);
        }

        if (connectionReady === false) {
            console.error("connection still not ready...");
            return;
        }
        clearTimeout(disconnectTimeout);
        disconnectTimeout = setTimeout(thisThis.disconnect, 2 * 60 * 60 * 1000);
    }
}

module.exports = TelnetAvr;
