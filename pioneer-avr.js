/*
    Helper module for controlling Pioneer AVR

    läuft mit HB: v1.7.0, v2
    GUI v4.55.1
    Node.js Version	 v18.19.0, 20, 22

*/

const TelnetAvr = require("./telnet-avr");


let missingInputErrorCounter = {};
let allInterval = null;
let lastUserInteraction = null;


// Reference fot input id -> Characteristic.InputSourceType
let inputToTypeList = [
        ['25', 3], // BD -> Characteristic.InputSourceType.HDMI --> Apple TV
        ['04', 0], // DVD -> Characteristic.InputSourceType.OTHER ---> NintendoSwitch
        ['01', 0], // CD -> Characteristic.InputSourceType.OTHER
        ['20', 3], // HDMI2 -> Characteristic.InputSourceType.HDMI
        ['19', 3], // HDMI1 -> Characteristic.InputSourceType.HDMI
        ['21', 3], // HDMI3 -> Characteristic.InputSourceType.HDMI
        ['22', 3], // HDMI4 -> Characteristic.InputSourceType.HDMI
        ['23', 3], // HDMI5 -> Characteristic.InputSourceType.HDMI
        ['24', 3], // HDMI6 -> Characteristic.InputSourceType.HDMI
        ['34', 3], // HDMI7-> Characteristic.InputSourceType.HDMI
        ['35', 3], // HDMI8-> Characteristic.InputSourceType.HDMI
        ['00', 0], // PHONO -> Characteristic.InputSourceType.OTHER
        ['02', 2], // TUNER -> Characteristic.InputSourceType.TUNER
        ['03', 0], // TAPE -> Characteristic.InputSourceType.OTHER
        ['05', 3], // TV -> Characteristic.InputSourceType.HDMI
        ['06', 3], // CBL/SAT -> Characteristic.InputSourceType.HDMI
        ['10', 4], // VIDEO -> Characteristic.InputSourceType.COMPOSITE_VIDEO
        ['12', 0], // MULTI CH IN -> Characteristic.InputSourceType.OTHER
        ['13', 0], // USB-DAC -> Characteristic.InputSourceType.OTHER
        ['14', 6], // VIDEOS2 -> Characteristic.InputSourceType.COMPONENT_VIDEO
        ['15', 3], // DVR/BDR -> Characteristic.InputSourceType.HDMI
        ['17', 9], // USB/iPod -> Characteristic.InputSourceType.USB
        ['18', 2], // XM RADIO -> Characteristic.InputSourceType.TUNER
        ['26', 10], // MEDIA GALLERY -> Characteristic.InputSourceType.APPLICATION
        ['27', 0], // SIRIUS -> Characteristic.InputSourceType.OTHER
        ['31', 3], // HDMI CYCLE -> Characteristic.InputSourceType.HDMI
        ['33', 0], // ADAPTER -> Characteristic.InputSourceType.OTHER
        ['38', 2], // NETRADIO -> Characteristic.InputSourceType.TUNER
        ['40', 0], // SIRIUS -> Characteristic.InputSourceType.OTHER
        ['41', 0], // PANDORA -> Characteristic.InputSourceType.OTHER
        ['44', 0], // MEDIA SERVER -> Characteristic.InputSourceType.OTHER
        ['45', 0], // FAVORITE -> Characteristic.InputSourceType.OTHER
        ['46', 8], // AIRPLAY -> Characteristic.InputSourceType.AIRPLAY
        ['48', 0], // MHL -> Characteristic.InputSourceType.OTHER
        ['49', 0], // GAME -> Characteristic.InputSourceType.OTHER
        ['53', 0], // SPOTIFY -> Characteristic.InputSourceType.OTHER
        ['57', 0] // SPOTIFY -> Characteristic.InputSourceType.OTHER
    ],
    inputToType = {}

function PioneerAvr(log, host, port, maxVolumeSet, minVolumeSet, connectionReadyCallback) {
    let thisThis = this;
    this.log = log;
    this.host = host;
    this.port = port;
    this.maxVolumeSet = parseInt(maxVolumeSet, 10)
    this.minVolumeSet = parseInt(minVolumeSet, 10)

    if (isNaN(this.maxVolumeSet)) {
        this.maxVolumeSet = 60
    }

    if (isNaN(this.minVolumeSet)) {
        this.minVolumeSet = 0
    }

    this.lastInputDiscovered = null

    this.inputMissing = []

    this.setVolumeTimeout = null

    if (typeof connectionReadyCallback !== "function") {
        connectionReadyCallback = function() {
            thisThis.log.debug('PioneerAvr() conn ready')
        };
    }

    this.functionSetLightbulbMuted = function() {
        thisThis.log.debug('dummy functionSetLightbulbMuted called')
    };

    this.functionSetLightbulbVolume = function() {
        thisThis.log.debug('dummy functionSetLightbulbVolume called')
    };

    this.functionSetPowerState = function() {
        thisThis.log.debug('dummy functionSetPowerState called')
    };

    this.functionSetActiveIdentifier = function() {
        thisThis.log.debug('dummy functionSetActiveIdentifier called')
    };


    // Current AV status
    this.state = {
        volume: 30,
        on: false,
        muted: true,
        input: 0,
        listeningMode: null,
        listeningModeLM: null,
        lastGetPowerStatus: null
    };

    this.onData = function(error, data, callback) {
        thisThis.log.debug("Receive data : %s", data);

        if (typeof callback !== "function") {
            callback = function() {};
        }

        if (error) {
            thisThis.log.error(error);
            try {
                callback(error, data);
            } catch (e) {
                thisThis.log.debug("onData", e);
            }
            return;

            // E06 is returned when input not exists, E06RGB is separate, sometimes E04RGBB
        } else if (data.startsWith("E") && !data.startsWith("E06RGB") && !data.startsWith("E04RGB")) {
            thisThis.log.debug("Receive error: " + String(data));
            try {
                callback(String(data), data);
            } catch (e) {
                thisThis.log.debug("onData", e);
            }
        } else if (
            data.indexOf("VD:SENT") > -1 ||
            data.indexOf("VU:SENT") > -1 ||
            data.indexOf("MO:SENT") > -1
        ) {
            try {
                callback(error, data);
            } catch (e) {
                thisThis.log.debug("onData", e);
            }
        } else if (data.indexOf(":SENT") > -1) {
            // try {
            //   callback()
            // } catch (e) {
            //   thisThis.log.debug("onData", e)
            // };
        } else if (data.indexOf("PWR") > -1) {
            data = data.substring(data.indexOf("PWR"));
            thisThis.state.on = parseInt(data[3], 10) === 0;
            thisThis.log.debug(
                "Receive Power status : %s (%s)",
                thisThis.state.on ? "On" : "off",
                data,
            );
            thisThis.state.lastGetPowerStatus = Date.now();
            try {
                callback(error, data);
            } catch (e) {
                thisThis.log.debug("onData", e);
            }


            setTimeout(function() {
                try {
                    thisThis.functionSetPowerState(thisThis.state.on)
                } catch (e) {
                    thisThis.log.debug("functionSetPowerState", e);
                }
            }, 2)

            setTimeout(function() {
                try {
                    thisThis.functionSetLightbulbMuted(thisThis.state.muted)
                } catch (e) {
                    thisThis.log.debug("functionSetLightbulbMuted", e);
                }
            }, 20)
        }

        // Data returned for mute status
        else if (data.indexOf("MUT") > -1) {
            data = data.substring(data.indexOf("MUT"));
            thisThis.state.muted = parseInt(data[3], 10) === 0;
            setTimeout(function() {
                try {
                    thisThis.functionSetLightbulbMuted(thisThis.state.muted)
                } catch (e) {
                    thisThis.log.debug("functionSetLightbulbMuted", e);
                }
            }, 2)

            thisThis.log.debug(
                "Receive Mute status: %s (%s -> %s)",
                thisThis.state.muted ? "Muted" : "Not Muted",
                data[3],
                data,
            );
            try {
                callback(error, thisThis.state.muted);
            } catch (e) {
                thisThis.log.debug("onData", e);
            }
        }

        // get LISTENING MODE
        else if (data.indexOf("SR") > -1 && data.length === 6) {
            data = data.substring(data.indexOf("SR"));
            thisThis.state.listeningMode = data.substr(2, 4); // SR0018 -> 0018
            try {
                callback(error, data);
            } catch (e) {
                thisThis.log.debug("onData", e);
            }
        } else if (data.indexOf("LM") > -1 && data.length === 6) {
            data = data.substring(data.indexOf("LM"));
            thisThis.state.listeningModeLM = data.substr(2, 4); // SR0018 -> 0018
            try {
                callback(error, data);
            } catch (e) {
                thisThis.log.debug("onData", e);
            }
        }

        // Data returned for volume status2
        else if (data.indexOf("VOL") > -1) {
            data = data.substring(data.indexOf("VOL"));
            let vol = data.substr(3, 3);

            var volPctF = 0

            if (thisThis.maxVolumeSet > thisThis.minVolumeSet) {
                // Calculate the min and max values in relation to the range 0-185
                const minVolumeIn185 = (thisThis.minVolumeSet / 100) * 185;
                const maxVolumeIn185 = (thisThis.maxVolumeSet / 100) * 185;

                // Parse the input 'vol' to a number and constrain it within the range
                const parsedVol = parseInt(vol, 10);
                const adjustedVol = Math.min(Math.max(parsedVol, minVolumeIn185), maxVolumeIn185);

                // Calculate the percentage of the adjusted volume in the new range (0-100)
                volPctF = Math.floor(((adjustedVol - minVolumeIn185) / (maxVolumeIn185 - minVolumeIn185)) * 100);
            } else {
                volPctF = Math.floor(parseInt(vol, 10) * 100 / 185);
            }


            if (vol.length === 3 && !isNaN(volPctF)) {
                thisThis.state.volume = Math.floor(volPctF);
                setTimeout(function() {
                    try {
                        thisThis.functionSetLightbulbVolume(thisThis.state.volume)
                    } catch (e) {
                        thisThis.log.debug("functionSetLightbulbVolume", e);
                    }
                }, 3)
            }
            thisThis.log.debug(
                "Volume is %s (%s%)",
                vol,
                volPctF,
            );
            try {
                callback(error, thisThis.state.volume);
            } catch (e) {
                thisThis.log.debug("onData", e);
            }
        }

        // Data returned for input status
        else if (data.indexOf("FN") > -1) {
            // FN25
            data = data.substring(data.indexOf("FN"));

            thisThis.log.debug("Receive Input status : %s", data);

            let inputId = data.substr(2, 2);
            let inputIndex = null;
            for (let x in thisThis.inputs) {
                if (thisThis.inputs[x].id == inputId) {
                    inputIndex = x;
                    break;
                }
            }

            if (inputIndex == null) {
                try {
                    callback(error, 0);
                } catch (e) {
                    thisThis.log.debug("onData", e);
                }
                return;
            }
            thisThis.state.input = inputIndex;
            setTimeout(function() {
                try {
                    thisThis.functionSetActiveIdentifier(thisThis.state.input)
                } catch (e) {
                    thisThis.log.debug("functionSetActiveIdentifier", e);
                }
            }, 2)

            try {
                callback(error, inputIndex);
            } catch (e) {
                thisThis.log.debug(e);
            }
        }

        // Data returned for input queries
        else if (data.startsWith("E06RGB") || data.startsWith("E04RGB")) {
            data = data.substring(data.indexOf("RGB"));
            let thisid = data.substr(3, 2);

            for (let key in inputToType) {
                if (String(key) == String(thisid)) {
                    // thisThis.log.debug(
                    //     " [DEBUG] Input Error, removing Input:",
                    //     thisid,
                    //     inputToType[key],
                    // );
                    delete inputToType[key];

                    let indexMissing = -1
                    for (let i in thisThis.inputMissing) {
                        if (thisThis.inputMissing[i].indexOf(String(thisid)) > -1) {
                            let i = indexMissing
                            break
                        }
                    }

                    if (indexMissing !== -1) {
                        thisThis.inputMissing.splice(indexMissing, 1);
                    }

                    if (String(inputBeingAdded) == String(key)) {
                        inputBeingAdded = false;
                        inputBeingAddedWaitCount = 0;
                    }

                    // if (thisThis.initCount == Object.keys(inputToType).length){
                    //     thisThis.isReady = true;
                    // }

                    break;
                }
            }

        } else if (data.indexOf("RGB") > -1) {
            data = data.substring(data.indexOf("RGB"));
            let tmpInput = {
                id: data.substr(3, 2),
                name: data.substr(6).trim(),
                type: inputToType[data.substr(3, 2)],
            };

            if (String(inputBeingAdded) == String(tmpInput.id)) {
                inputBeingAdded = false;
                inputBeingAddedWaitCount = 0;
            }

            // check if already in
            let alreadyExists = false;
            for (let x in thisThis.inputs) {
                if (String(thisThis.inputs[x].id) == String(tmpInput.id)) {
                    thisThis.log.debug(' [' + String(tmpInput.id) + '] INPUT ALREADY EXISTS (programmer error)', tmpInput, thisThis.inputs[x])
                    //update!
                    thisThis.inputs[x] = tmpInput;
                    alreadyExists = true;
                    break;
                }
            }
            let filter = ['CYCLE', 'NET']
            for (let i in filter) {
                if (tmpInput.name.indexOf(filter[i]) > -1) {
                    thisThis.log.debug(
                        "[filteret out] Input [%s] discovered (id: %s, type: %s). InitCount=%s/%s, inputMissing: %s",
                        tmpInput.name,
                        tmpInput.id,
                        tmpInput.type,
                        thisThis.initCount,
                        Object.keys(inputToType).length,
                        thisThis.inputMissing,
                    );

                    alreadyExists = true;

                    let indexMissing = -1
                    for (let i in thisThis.inputMissing) {
                        if (thisThis.inputMissing[i].indexOf(String(data.substr(3, 2))) > -1) {
                            let i = indexMissing
                            break
                        }
                    }
                    if (indexMissing !== -1) {
                        thisThis.inputMissing.splice(indexMissing, 1);
                    }

                    for (let key in inputToType) {
                        if (String(key) == String(data.substr(3, 2))) {
                            delete inputToType[key];
                        }
                    }
                }
            }

            if (alreadyExists === false) {
                thisThis.inputs.push(tmpInput);

                let indexMissing = -1
                for (let i in thisThis.inputMissing) {
                    if (thisThis.inputMissing[i].indexOf(String(data.substr(3, 2))) > -1) {
                        let i = indexMissing
                        break
                    }
                }
                if (indexMissing !== -1) {
                    thisThis.inputMissing.splice(indexMissing, 1);
                }

                if (!thisThis.isReady) {
                    thisThis.lastInputDiscovered = Date.now()
                    thisThis.initCount = thisThis.initCount + 1;
                    thisThis.log.debug(
                        "Input [%s] discovered (id: %s, type: %s). InitCount=%s/%s, inputMissing: %s",
                        tmpInput.name,
                        tmpInput.id,
                        tmpInput.type,
                        thisThis.initCount,
                        Object.keys(inputToType).length,
                        thisThis.inputMissing,
                    );

                    // if (thisThis.initCount == Object.keys(inputToType).length){
                    //     thisThis.isReady = true;
                    // }
                }

                for (let x in thisThis.inputs) {
                    if (String(thisThis.inputs[x].id) == String(tmpInput.id)) {
                        try {
                            callback(x);
                        } catch (e) {
                            thisThis.log.debug("onData", e);
                        }
                        break;
                    }
                }
            }

        }


    };

    // Inputs' list
    this.inputs = [];

    // Web interface ?
    this.web = false;
    this.webStatusUrl = "http://" + this.host + "/StatusHandler.asp";
    this.webEventHandlerBaseUrl =
        "http://" + this.host + "/EventHandler.asp?WebToHostItem=";


      (async () => {

          try {

              let fetch = (await import("node-fetch")).default;

              fetch(this.webStatusUrl, {
                      method: 'GET'
                  })
                  .then(response => {
                      if (response.status === 200) {
                          thisThis.log.info("Web Interface enabled");
                          thisThis.web = true;
                      }else{
                          thisThis.log.debug(response)
                      }
                  })
                  .catch(error => {
                      thisThis.log.debug("Error fetching web interface:", error);
                  });

          } catch (e) {
              this.log.debug('check web enabled ERROR', e);
          }
      })();



    // Communication Initialization
    this.s = new TelnetAvr(this.host, this.port);
    this.s.fallbackOnData = this.onData; //.bind({})

    try {
        this.s.connect();
    } catch (e) {
        this.log.debug('pioneer-avr this.s.connect', e);
    }

    thisThis.log.debug("wait until telnet connected");

    this.s.onDisconnect = function() {
        thisThis.state.on = false
        setTimeout(function() {
            try {
                thisThis.functionSetPowerState(thisThis.state.on)
            } catch (e) {
                thisThis.log.debug("functionSetPowerState", e);
            }
        }, 2)

        // thisThis.state.muted = true
        // setTimeout(function(){
        //     try {
        //         thisThis.functionSetLightbulbMuted(thisThis.state.muted)
        //     } catch (e) {
        //         thisThis.log.debug("functionSetLightbulbMuted", e);
        //     }
        // }, 2)
    }

    this.s.onConnect = function() {
        thisThis.powerStatus(function() {});

        // thisThis.state.muted = true
        // setTimeout(function(){
        //     try {
        //         thisThis.functionSetLightbulbMuted(thisThis.state.muted)
        //     } catch (e) {
        //         thisThis.log.debug("functionSetLightbulbMuted", e);
        //     }
        // }, 2)
    }

    // Dealing with input's initialization
    this.initCount = 0;
    this.isReady = false;

    this.s.displayChanged = function(error, text) {
        if (error) {
            thisThis.log.error(error);
        }
        if (text) {
            thisThis.log.debug("[DISPLAY] " + text);
        }
    };

    clearInterval(allInterval);
    allInterval = setInterval(function() {
        try {
            if (lastUserInteraction !== null && Date.now() - lastUserInteraction > (48 * 60 * 60 * 1000)) { // telnet-avr.js timeout: 2*60*60*1000
                return;
            }
            if (
                thisThis.s.connectionReady &&
                thisThis.isReady &&
                thisThis.state.on == true &&
                thisThis.state.lastGetPowerStatus !== null
            ) {
                thisThis.__updateVolume(() => {});
                // thisThis.__updateListeningMode(() => {});
            }
            if (thisThis.isReady && thisThis.s.connectionReady) {
                thisThis.__updatePower(() => {});

            }
        } catch (e) {
            thisThis.log.debug("allInterval", e);
        }
    }, 29000);

    setTimeout(function() {
        try {
            while (!thisThis.s || !thisThis.s.connectionReady) {
                try {
                    require("deasync").sleep(250);
                } catch (e) {
                    thisThis.log.debug("pioneer-avr waitready1", e);
                }
            }



            // require("deasync").sleep(100);

            thisThis.__updatePower(() => {});

            while (!thisThis.s || !thisThis.s.connectionReady || thisThis.state.lastGetPowerStatus === null) {
                try {
                    require("deasync").sleep(250);
                } catch (e) {
                    thisThis.log.debug("pioneer-avr waitready2", e);
                }
            }

            if (thisThis.s.connectionReady) {
                thisThis.log.info("Telnet connected");

                require("deasync").sleep(50);
                thisThis.__updateListeningMode(() => {});

                //reset input locks
                thisThis.sendCommand("0PKL");
                require("deasync").sleep(250);
                thisThis.sendCommand("0RML");

                require("deasync").sleep(500);
                let runThis = connectionReadyCallback.bind({})
                try {
                    runThis()
                } catch (e) {
                    thisThis.log.debug("connectionReadyCallback() Error", e);
                }

                thisThis.__updateInput(() => {});
                thisThis.__updateVolume(() => {});
                thisThis.__updateMute(() => {});
            }
        } catch (e) {
            thisThis.log.debug("connectionReadyCallback timeout Error", e);
        }
    }, 100);
}


module.exports = PioneerAvr;

let inputBeingAdded = false,
    inputBeingAddedWaitCount = 0;
PioneerAvr.prototype.loadInputs = function(callback) {
    // Queue and send all inputs discovery commands
    // this.log.debug('loadInputs -> %s', Object.keys(inputToType).join(', '))

    for (let inputi in inputToTypeList) {
        let key = String(inputToTypeList[inputi][0]),
            value = String(inputToTypeList[inputi][1])
        inputToType[key] = value
        if (inputBeingAdded !== false && inputBeingAddedWaitCount++ < 30) {
            require("deasync").sleep(10);
            inputBeingAddedWaitCount = 0;
            while (
                inputBeingAdded !== false &&
                inputBeingAddedWaitCount++ < 30
            ) {
                require("deasync").sleep(150);
            }
        }

        inputBeingAdded = String(key);

        let index = -1
        for (let i in this.inputMissing) {
            if (this.inputMissing[i].indexOf(key) > -1) {
                let i = index
                break
            }
        }
        if (index !== -1) {
            this.inputMissing.push([key]);
        }

        this.sendCommand(`?RGB${key}`, `RGB${key}`, callback);
        require("deasync").sleep(150);
    }

    if (inputBeingAdded !== false && inputBeingAddedWaitCount++ < 30) {
        require("deasync").sleep(10);
        inputBeingAddedWaitCount = 0;
        while (inputBeingAdded !== false && inputBeingAddedWaitCount++ < 30) {
            require("deasync").sleep(500);
        }
    }

    let inputMissingWhileMax = 0;
    while (this.inputMissing.length > 0 && inputMissingWhileMax++ < 30) {
        for (let thiskey in this.inputMissing) {
            let key = this.inputMissing[thiskey][0];
            if (inputBeingAdded !== false && inputBeingAddedWaitCount++ < 30) {
                require("deasync").sleep(10);
                inputBeingAddedWaitCount = 0;
                while (
                    inputBeingAdded !== false &&
                    inputBeingAddedWaitCount++ < 30
                ) {
                    require("deasync").sleep(500);
                }
            }
            key = String(key);
            inputBeingAdded = key;

            this.log.debug('inputMissing called key', key, this.inputMissing)

            this.sendCommand(`?RGB${key}`, `RGB${key}`, callback);
            require("deasync").sleep(500);
        }
    }

    if (this.inputMissing.length === 0 && Object.keys(inputToType).length > 0) {
        this.isReady = true;
    }
};

// Power methods
PioneerAvr.prototype.__updatePower = function(callback) {
    this.sendCommand("?P", "PWR", callback);
};
PioneerAvr.prototype.powerStatus = function(callback) {
    let thisThis = this;

    if (thisThis.state.on !== null) {
        try {
            callback(null, thisThis.state.on);
        } catch (e) {
            thisThis.log.debug("powerStatus", e);
        }
        return;
    }

    this.__updatePower(() => {
        // require('deasync').sleep(10);
        try {
            callback(null, thisThis.state.on);
        } catch (e) {
            thisThis.log.debug("powerStatus2", e);
        }
    });
};

PioneerAvr.prototype.powerOn = function() {
    this.log.debug("Power on");

    if (this.web) {
      (async () => {
          let fetch = (await import("node-fetch")).default;
          fetch(this.webEventHandlerBaseUrl + "PO", {
              method: 'GET'
          })
      })();

    } else {
        this.sendCommand("PO");
    }
    lastUserInteraction = Date.now();
    let thisThis = this;
    setTimeout(() => {
        thisThis.powerStatus(() => {});
    }, 500);
};

PioneerAvr.prototype.powerOff = function() {
    this.log.debug("Power off");
    if (this.web) {
      (async () => {
          let fetch = (await import("node-fetch")).default;
          fetch(this.webEventHandlerBaseUrl + "PF", {
              method: 'GET'
          })
      })();
    } else {
        this.sendCommand("PF");
    }
    lastUserInteraction = Date.now()
    let thisThis = this;
    setTimeout(function() {
        thisThis.powerStatus(function() {});
    }, 500);
};

// Volume methods
PioneerAvr.prototype.__updateVolume = function(callback) {
    this.sendCommand("?V", "VOL", callback);
};

PioneerAvr.prototype.volumeStatus = function(callback) {
    if (this !== null && this.state.volume !== null) {
        callback(null, this.state.volume);
        return;
    }

    let thisThis = this;
    this.__updateVolume(() => {
        try {
            callback(null, thisThis.state.volume);
        } catch (e) {
            thisThis.log.debug("__updateVolume", e);
        }
    });
};


let lastSetVol = null
PioneerAvr.prototype.setVolume = function(targetVolume, callback) {
    if (!this.s || !this.s.connectionReady || !this.state.on) {
        return;
    }
    let thisThis = this;

    targetVolume = parseInt(targetVolume, 10)

    if (isNaN(targetVolume)) {
        try {
            callback();
        } catch (e) {
            thisThis.log.debug("setVolume", e);
        }
        return
    }

    if (Math.floor(targetVolume) == thisThis.state.volume || lastSetVol === targetVolume) {
        try {
            callback();
        } catch (e) {
            thisThis.log.debug("setVolume same c", e);
        }
        return
    }

    lastSetVol = targetVolume

    let vsxVol = 0;

    if (thisThis.maxVolumeSet > 0) {
        const minVolumeIn185 = (thisThis.minVolumeSet / 100) * 185; // e.g., 30% of 185 = 55.5
        const maxVolumeIn185 = (thisThis.maxVolumeSet / 100) * 185; // e.g., 80% of 185 = 148

        // Calculate vsxVol considering minVolumeSet and maxVolumeSet
        vsxVol = ((targetVolume / 100) * (maxVolumeIn185 - minVolumeIn185)) + minVolumeIn185;
    } else {
        vsxVol = (targetVolume * 185) / 100; // Fallback case
    }

    vsxVol = Math.floor(vsxVol);
    let pad = "000";
    let vsxVolStr =
        pad.substring(0, pad.length - vsxVol.toString().length) +
        vsxVol.toString();
    if (thisThis.setVolumeTimeout === null) {
        thisThis.sendCommand(`${vsxVolStr}VL`);
        thisThis.setVolumeTimeout = setTimeout(() => {
            thisThis.setVolumeTimeout = null
        }, 30)
    } else {
        clearTimeout(thisThis.setVolumeTimeout)
        thisThis.setVolumeTimeout = setTimeout(() => {
            thisThis.sendCommand(`${vsxVolStr}VL`);
            thisThis.setVolumeTimeout = null
        }, 30)
    }

    lastUserInteraction = Date.now()
    try {
        callback();
    } catch (e) {
        thisThis.log.debug("setVolume", e);
    }
};

let changeVolBlocked = false;
let blocktimer = false;
let updateVolumeTimeout = false;
PioneerAvr.prototype.volumeUp = function() {
    lastUserInteraction = Date.now()
    if (!this.s || !this.s.connectionReady || !this.state.on) {
        return;
    }
    this.log.debug("Volume up", !changeVolBlocked);
    let thisThis = this;
    clearTimeout(updateVolumeTimeout);
    changeVolBlocked = true;
    blocktimer = setTimeout(function() {
        changeVolBlocked = false;
        clearTimeout(updateVolumeTimeout);
        updateVolumeTimeout = setTimeout(function() {
            thisThis.__updateVolume(() => {});
            thisThis.__updateMute(() => {});
        }, 1000);
    }, 500);

    if (this.web) {
        (async () => {

            fetch(this.webEventHandlerBaseUrl + "PO", {
                method: 'GET'
            }).then(() => {
                clearTimeout(blocktimer);
                changeVolBlocked = false;
                clearTimeout(updateVolumeTimeout);
                updateVolumeTimeout = setTimeout(function() {
                    thisThis.__updateVolume(() => {});
                    thisThis.__updateMute(() => {});
                }, 1000);
            });
        })();
    } else {
        this.sendCommand("VU", function() {
            clearTimeout(blocktimer);
            changeVolBlocked = false;
            clearTimeout(updateVolumeTimeout);
            updateVolumeTimeout = setTimeout(function() {
                thisThis.__updateVolume(() => {});
                thisThis.__updateMute(() => {});
            }, 1000);
        });
    }
};

PioneerAvr.prototype.volumeDown = function() {
    lastUserInteraction = Date.now()
    if (!this.s || !this.s.connectionReady || !this.state.on) {
        return;
    }
    let thisThis = this;
    this.log.debug("Volume down", !changeVolBlocked);
    clearTimeout(updateVolumeTimeout);

    if (true) {
        changeVolBlocked = true;
        blocktimer = setTimeout(function() {
            changeVolBlocked = false;
            clearTimeout(updateVolumeTimeout);
            updateVolumeTimeout = setTimeout(function() {
                thisThis.__updateVolume(() => {});
                thisThis.__updateMute(() => {});
            }, 1000);
        }, 500);

        if (this.web) {
            (async () => {
                fetch(this.webEventHandlerBaseUrl + "VD", {
                    method: 'GET'
                }).then(() => {
                    require("deasync").sleep(100);
                    fetch(this.webEventHandlerBaseUrl + "VD", {
                        method: 'GET'
                    }).then(() => {
                        require("deasync").sleep(100);
                        fetch(this.webEventHandlerBaseUrl + "VD", {
                            method: 'GET'
                        }).then(() => {
                            clearTimeout(blocktimer);
                            changeVolBlocked = false;
                            clearTimeout(updateVolumeTimeout);
                            updateVolumeTimeout = setTimeout(function() {
                                thisThis.__updateVolume(() => {});
                                thisThis.__updateMute(() => {});
                            }, 1000);
                        }, );
                    }, );
                });
            })();
        } else {
            this.sendCommand("VD", function() {
                require("deasync").sleep(100);
                thisThis.sendCommand("VD", function() {
                    require("deasync").sleep(100);
                    thisThis.sendCommand("VD", function() {
                        clearTimeout(blocktimer);
                        changeVolBlocked = false;
                        clearTimeout(updateVolumeTimeout);
                        updateVolumeTimeout = setTimeout(function() {
                            thisThis.__updateVolume(() => {});
                            thisThis.__updateMute(() => {});
                        }, 1000);
                    });
                });
            });
        }
    }
};

// request listening mode
PioneerAvr.prototype.__updateListeningMode = function(callback) {
    this.sendCommand("?S", "SR", callback);
};

PioneerAvr.prototype.getListeningMode = function(callback) {
    let thisThis = this;

    this.__updateListeningMode(() => {
        try {
            callback(null, thisThis.state.listeningMode);
        } catch (e) {
            thisThis.log.debug("getListeningMode", e);
        }
    });
};

// set Listeing Mode toggle [EXTENDED STEREO]
PioneerAvr.prototype.toggleListeningMode = function(callback) {
    lastUserInteraction = Date.now()

    let thisThis = this;

    if (thisThis === null || !thisThis.isReady) {
        try {
            callback();
        } catch (e) {
            thisThis.log.debug("toggleListeningMode", e);
        }
        return;
    }

    // 0013SR: PRO LOGIC2x MOVIE
    // 0100SR: EXTENDED STEREO
    // 0101SR: Action

    this.log.debug("toggleListeningMode now:", thisThis.state.listeningMode);
    if (["0013", "0101"].indexOf(thisThis.state.listeningMode) > -1) {
        // from PL2 to ext stereo
        thisThis.sendCommand("0112SR");
        thisThis.state.listeningMode = "0112";
        require("deasync").sleep(100);
        try {
            callback();
        } catch (e) {
            thisThis.log.debug("toggleListeningMode", e);
        }
    } else {
        // from ext. stero to PL2
        thisThis.state.listeningMode = "0013";
        thisThis.sendCommand("!0013SR", "SR", function(error, data) {
            if (error) {
                //fallback to Listeningmode "Action"
                thisThis.state.listeningMode = "0101";
                thisThis.sendCommand("0101SR");
            }
        });

        thisThis.log.debug(
            "toggleListeningMode now:",
            thisThis.state.listeningMode,
        );
        require("deasync").sleep(100);
        try {
            callback();
        } catch (e) {
            thisThis.log.debug("toggleListeningMode2", e);
        }
    }
};

// Mute methods
PioneerAvr.prototype.__updateMute = function(callback) {
    this.sendCommand("?M", "MUT", callback);
};

let lastMuteStatus = null;
PioneerAvr.prototype.muteStatus = function(callback) {
    // if (!this.s || !this.s.connectionReady || !this.state.on) { callback(null, false); return; }

    let thisThis = this;

    // if (lastMuteStatus !== null && Date.now() - lastMuteStatus < 100000) {
    if (thisThis.state.muted !== null) {
        try {
            callback(null, thisThis.state.muted);
        } catch (e) {
            thisThis.log.debug("muteStatus", e);
        }
        return;
    }

    this.__updateMute(() => {
        try {
            callback(null, thisThis.state.muted);
        } catch (e) {
            thisThis.log.debug("__updateMute", e);
        }
    });
};

PioneerAvr.prototype.muteOn = function() {
    lastUserInteraction = Date.now()
    if (!this.s || !this.s.connectionReady || !this.state.on || this.state.muted === true) {
        return;
    }
    this.log.debug("Mute on");
    if (this.web) {
        (async () => {
            fetch(this.webEventHandlerBaseUrl + "MO", {
                method: 'GET'
            })
        })();
    } else {
        this.sendCommand("MO");
    }
};

PioneerAvr.prototype.muteOff = function() {
    lastUserInteraction = Date.now()
    if (!this.s || !this.s.connectionReady || !this.state.on || this.state.muted === false) {
        return;
    }
    this.log.debug("Mute off");
    if (this.web) {
      (async () => {
          fetch(this.webEventHandlerBaseUrl + "MF", {
              method: 'GET'
          })
      })();
    } else {
        this.sendCommand("MF");
    }
};

// Input management method
PioneerAvr.prototype.__updateInput = function(callback) {
    this.sendCommand("?F", "FN", callback);
};

PioneerAvr.prototype.inputStatus = function(callback) {
    // if (!this.s || !this.s.connectionReady || !this.state.on || this.state.input === null) { callback(null, 0); return; }

    this.log.debug("inputStatus updated %s", this.state.input);
    try {
        callback(null, this.state.input);
    } catch (e) {
        this.log.debug("__updateInput", e);
    }

    // this.__updateInput(() => {    });

    // let thisThis = this;
    // this.__updateInput(() => {
    //     thisThis.log.debug("inputStatus updated %s", thisThis.state.input);
    //     try {
    //         callback(null, thisThis.state.input);
    //     } catch (e) {
    //         thisThis.log.debug("__updateInput", e);
    //     }
    // });
};

PioneerAvr.prototype.setInput = function(id) {
    lastUserInteraction = Date.now()
    if (!this.s || !this.s.connectionReady || !this.state.on) {
        return;
    }
    if (this.web) {
        (async () => {
            fetch(this.webEventHandlerBaseUrl + `${id}FN`, {
                method: 'GET'
            })
        })();
    } else {
        this.sendCommand(`${id}FN`);
    }
};

PioneerAvr.prototype.renameInput = function(id, newName) {
    if (!this.s || !this.s.connectionReady || !this.state.on) {
        return;
    }
    let shrinkName = newName.replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 14);
    this.sendCommand(`${shrinkName}1RGB${id}`);
};

// Remote Key methods
PioneerAvr.prototype.remoteKey = function(rk) {
    lastUserInteraction = Date.now()
    if (!this.s || !this.s.connectionReady || !this.state.on) {
        return;
    }
    // Implemented key from CURSOR OPERATION
    switch (rk) {
        case "UP":
            this.sendCommand("CUP");
            break;
        case "DOWN":
            this.sendCommand("CDN");
            break;
        case "LEFT":
            this.sendCommand("CLE");
            break;
        case "RIGHT":
            this.sendCommand("CRI");
            break;
        case "ENTER":
            this.sendCommand("CEN");
            break;
        case "RETURN":
            this.sendCommand("CRT");
            break;
        case "HOME_MENU":
            this.sendCommand("HM");
            break;
        default:
            this.log.info("Unhandled remote key : %s", rk);
    }
};

// Send command and process return
PioneerAvr.prototype.sendCommand = function(
    command,
    callbackChars,
    callback,
) {
    // Main method to send a command to AVR
    let thisThis = this;

    if (typeof callback !== "function") {
        callback = function() {};
    }

    this.log.debug("Send command : %s", command);
    if (typeof callbackChars === "function") {
        this.s.sendMessage(command, undefined, function(error, data) {
            thisThis.onData(error, data, callbackChars);
        });
    } else {
        this.s.sendMessage(command, callbackChars, function(error, data) {
            thisThis.onData(error, data, callback);
        });
    }
};
