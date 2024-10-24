/*
    Pioneer AVR TV Accessory Module for homebridge
*/
const PioneerAvr = require("./pioneer-avr");
const ppath = require("persist-path");
const fs = require("fs");

let initP = function() {},
    initPTimeout = null,
    thisThis = null

let Service;
let Characteristic;

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory(
        "homebridge-pioneer-avr-2025",
        "pioneerAvrAccessory",
        pioneerAvrAccessory,
    );
};

let functionSetLightbulbVolumeTimeout = null
let volumeServiceLightbulbTimeout = null
let updatePowerStateTimeout = null
let functionSetActiveIdentifierTimeout = null

function pioneerAvrAccessory(log, config) {
    // Main accessory initialization
    this.log = log;
    this.config = config;

    this.name = config.name = config.name.replace(/[^a-zA-Z0-9 ]/g, "");
    this.host = config.host;
    this.port = config.port;

    if (Object.hasOwn(config, 'maxVolumeSet') || typeof(config.maxVolumeSet) == 'undefined') {
        this.maxVolumeSet = config.maxVolumeSet;
    } else {
        this.maxVolumeSet = 80;
    }

    this.maxVolumeSet = parseInt(String(this.maxVolumeSet).replace(/[^0-9]/g, ""), 10);
    if (this.maxVolumeSet > 100) {
        this.maxVolumeSet = 100;
    }
    if (this.maxVolumeSet < 0) {
        this.maxVolumeSet = 0;
    }

    if (Object.hasOwn(config, 'minVolumeSet') || typeof(config.minVolumeSet) == 'undefined') {
        this.minVolumeSet = config.minVolumeSet;
    } else {
        this.minVolumeSet = 20;
    }

    this.minVolumeSet = parseInt(String(this.minVolumeSet).replace(/[^0-9]/g, ""), 10);
    if (this.minVolumeSet > this.maxVolumeSet - 20) {
        this.minVolumeSet = this.maxVolumeSet - 20;
    }
    if (this.minVolumeSet < 0) {
        this.minVolumeSet = 0;
    }

    this.model = config.model || config.name || "VSX923";
    this.prefsDir = config.prefsDir || ppath("pioneerAvr/");

    log.debug("Preferences directory : %s", this.prefsDir);
    this.manufacturer = "Pioneer";
    this.version = "0.1.2";

    // check if prefs directory ends with a /, if not then add it
    if (this.prefsDir.endsWith("/") === false) {
        this.prefsDir = this.prefsDir + "/";
    }

    this.inputVisibilityFile = this.prefsDir + "inputsVisibility_" + this.host;
    this.savedVisibility = {};

    thisThis = this;

    try {
        // check if the preferences directory exists, if not then create it
        if (fs.existsSync(this.prefsDir) === false) {
            fs.mkdirSync(this.prefsDir, {
                recursive: true
            });
        }

        fs.access(thisThis.inputVisibilityFile, fs.constants.F_OK, (err) => {
            if (err) {
                fs.writeFile(thisThis.inputVisibilityFile, "{}", (err) => {
                    if (err) {
                        thisThis.log.error(
                            "Error creating the Input visibility file:",
                            err,
                        );
                    } else {
                        thisThis.log.debug(
                            "Input visibility file successfully created.",
                        );
                        try {
                            thisThis.savedVisibility = JSON.parse(
                                fs.readFileSync(this.inputVisibilityFile),
                            );
                        } catch (err) {
                            thisThis.log.debug(
                                "Input visibility file does not exist or JSON parsing failed (%s)",
                                err,
                            );
                        }
                    }
                });
            } else {
                thisThis.log.debug(
                    "The Input visibility file already exists. %s",
                    this.inputVisibilityFile,
                );
                try {
                    thisThis.savedVisibility = JSON.parse(
                        fs.readFileSync(this.inputVisibilityFile),
                    );
                } catch (err) {
                    thisThis.log.debug(
                        "Input visibility file does not exist or JSON parsing failed (%s)",
                        err,
                    );
                }
            }
        });
    } catch (err) {
        this.log.debug("Input visibility file could not be created (%s)", err);
    }


    try {
        if (thisThis.avr && thisThis.avr.s) {
            thisThis.avr.s.disconnect()
            require("deasync").sleep(10050);
        }
    } catch (err) {
        thisThis.log.debug("error disconnecting before connecting", err);
    }

    try {
        thisThis.avr = new PioneerAvr(thisThis.log, thisThis.host, thisThis.port, thisThis.maxVolumeSet, thisThis.minVolumeSet, function() {
            try {
                thisThis.enabledServices = [];
                require("deasync").sleep(1050);
                thisThis.prepareInformationService();
                require("deasync").sleep(50);
                thisThis.prepareTvService();
                require("deasync").sleep(50);
                thisThis.prepareTvSpeakerService();
                require("deasync").sleep(50);
                thisThis.prepareInputSourceService();

                if (thisThis.maxVolumeSet !== 0) {
                    require("deasync").sleep(50);
                    thisThis.prepareVolumeService();
                }

            } catch (err) {
                thisThis.log.debug("new PioneerAvr() Callback-Error (%s)", err);
            }
        });

    } catch (err) {
        thisThis.log.debug("new PioneerAvr() Error (%s)", err);
    }

}

pioneerAvrAccessory.prototype.prepareInformationService = function() {
    // Set accessory informations
    this.informationService = new Service.AccessoryInformation();
    this.informationService
        .setCharacteristic(
            Characteristic.Name,
            this.name.replace(/[^a-zA-Z0-9 ]/g, ""),
        )
        .setCharacteristic(Characteristic.Manufacturer, this.manufacturer.replace(/[^a-zA-Z0-9 ]/g, ""))
        .setCharacteristic(
            Characteristic.Model,
            this.model.replace(/[^a-zA-Z0-9]/g, ""),
        )
        .setCharacteristic(Characteristic.SerialNumber, this.host)
        .setCharacteristic(Characteristic.FirmwareRevision, this.version)

        // https://github.com/homebridge/homebridge/issues/3703
        .setCharacteristic(
            Characteristic.ConfiguredName,
            this.name.replace(/[^a-zA-Z0-9 ']/g, ""),
        ); // required for iOS18

    this.enabledServices.push(this.informationService);
};

pioneerAvrAccessory.prototype.prepareTvService = function() {
    // Create TV service for homekit

    this.tvService = new Service.Television(
        this.name.replace(/[^a-zA-Z0-9]/g, ""),
        "tvService",
    );
    this.tvService.setCharacteristic(
        Characteristic.ConfiguredName,
        this.name.replace(/[^a-zA-Z0-9 ]/g, ""),
    );
    this.tvService.setCharacteristic(
        Characteristic.SleepDiscoveryMode,
        Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE,
    );

    // Set Active charateristic to power on or off AVR
    this.tvService
        .getCharacteristic(Characteristic.Active)
        .on("get", this.getPowerOn.bind(this))
        .on("set", this.setPowerOn.bind(this));

    // ActiveIdentifier show and set current input on TV badge in homekit
    this.tvService
        .getCharacteristic(Characteristic.ActiveIdentifier)
        .on("get", this.getActiveIdentifier.bind(this))
        .on("set", this.setActiveIdentifier.bind(this));

    // Remote Key
    this.tvService
        .getCharacteristic(Characteristic.RemoteKey)
        .on("set", this.remoteKeyPress.bind(this));

    this.enabledServices.push(this.tvService);

    // let thisThis = this
    thisThis.avr.functionSetPowerState = function(set) {
        clearTimeout(updatePowerStateTimeout)
        updatePowerStateTimeout = setTimeout(function() {
            // thisThis.log.debug('functionSetPowerState called')
            try {
                thisThis.tvService
                    .getCharacteristic(Characteristic.Active)
                    .updateValue(set);

            } catch (e) {
                thisThis.log.debug('functionSetPowerState Error', e)
            }
        }, 50)
    }

    thisThis.avr.functionSetActiveIdentifier = function(set) {
        clearTimeout(functionSetActiveIdentifierTimeout)
        functionSetActiveIdentifierTimeout = setTimeout(function() {
            // thisThis.log.debug('functionSetActiveIdentifierTimeout called')
            try {
                thisThis.tvService
                    .getCharacteristic(Characteristic.ActiveIdentifier)
                    .updateValue(set);
            } catch (e) {
                thisThis.log.debug('functionSetActiveIdentifierTimeout Error', e)
            }
        }, 50)
    }
}


pioneerAvrAccessory.prototype.prepareVolumeService = function() {
    // Volume

    this.volumeServiceLightbulb = new Service.Lightbulb(this.name.replace(/[^a-zA-Z0-9]/g, "") + " VolumeBulb", 'volumeInput');
    this.volumeServiceLightbulb
        .getCharacteristic(Characteristic.On)
        .on("get", this.getMutedInverted.bind(this))
        .on("set", this.setMutedInverted.bind(this));
    this.volumeServiceLightbulb
        .getCharacteristic(Characteristic.Brightness)
        .on("get", this.getVolume.bind(this))
        .on("set", this.setVolume.bind(this));

    this.volumeServiceLightbulb
        .getCharacteristic(Characteristic.On)
        // .updateValue(true);
        .updateValue((thisThis.avr.state.muted || !thisThis.avr.state.on) ? false : true);

    this.volumeServiceLightbulb
        .getCharacteristic(Characteristic.Brightness)
        .updateValue(70);

    this.tvService.addLinkedService(this.volumeServiceLightbulb);
    this.enabledServices.push(this.volumeServiceLightbulb);

    thisThis.avr.functionSetLightbulbVolume = function(set) {

        if (thisThis.volumeServiceLightbulb.getCharacteristic(Characteristic.Brightness).value != set) {
            clearTimeout(functionSetLightbulbVolumeTimeout)
            functionSetLightbulbVolumeTimeout = setTimeout(function() {

                try {
                    thisThis.volumeServiceLightbulb
                        .getCharacteristic(Characteristic.On)
                        .updateValue((thisThis.avr.state.muted || !thisThis.avr.state.on) ? false : true);

                    thisThis.volumeServiceLightbulb
                        .getCharacteristic(Characteristic.Brightness)
                        .updateValue(set);

                } catch (e) {
                    thisThis.log.debug('updateValueVol', e)
                }
            }, 50)
        }
    }


    thisThis.avr.functionSetLightbulbMuted = function(set) {
        clearTimeout(volumeServiceLightbulbTimeout)
        volumeServiceLightbulbTimeout = setTimeout(function() {
            try {
                thisThis.volumeServiceLightbulb
                    .getCharacteristic(Characteristic.On)
                    .updateValue((thisThis.avr.state.muted || !thisThis.avr.state.on) ? false : true);
            } catch (e) {
                thisThis.log.debug('functionSetLightbulbMuted Error', e)
            }
        }, 50)
    }

};

pioneerAvrAccessory.prototype.prepareTvSpeakerService = function() {
    // Create Service.TelevisionSpeaker and  associate to tvService
    this.tvSpeakerService = new Service.TelevisionSpeaker(
        this.name.replace(/[^a-zA-Z0-9]/g, "") + " Volume",
        "tvSpeakerService",
    );
    this.tvSpeakerService
        .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
        .setCharacteristic(
            Characteristic.VolumeControlType,
            Characteristic.VolumeControlType.ABSOLUTE,
        );
    this.tvSpeakerService
        .getCharacteristic(Characteristic.VolumeSelector)
        .on("set", (state, callback) => {
            this.log.debug(
                "Volume change over the remote control (VolumeSelector), pressed: %s",
                state === 1 ? "Down" : "Up",
            );
            this.setVolumeSwitch(state, callback, !state);
        });
    this.tvSpeakerService
        .getCharacteristic(Characteristic.Mute)
        .on("get", this.getMuted.bind(this))
        .on("set", this.setMuted.bind(this));
    this.tvSpeakerService
        .addCharacteristic(Characteristic.Volume)
        .on("get", this.getVolume.bind(this))
        .on("set", this.setVolume.bind(this));

    this.tvService.addLinkedService(this.tvSpeakerService);
    this.enabledServices.push(this.tvSpeakerService);
};

pioneerAvrAccessory.prototype.prepareInputSourceService = function() {
    // Run avr.loadInputs with addInputSourceService callback to create each input service
    this.log.info("Discovering inputs");
    this.avr.loadInputs(function(key) {
        if (String(key).startsWith('E')) {
            return;
        }
        thisThis.addInputSourceService(key);
    });
};

pioneerAvrAccessory.prototype.addInputSourceService = function(inputkey) {
    // Create an inout service from the informations in avr.inputs
    let key = parseInt(inputkey, 10);
    if (typeof this.avr.inputs[key] == "undefined") {
        this.log.error(
            "addInputSourceService key undefined %s (input: %s)",
            key,
            inputkey,
        );
        return;
    }
    let me = this;
    this.log.info(
        "Add input n°%s - Name: %s Id: %s Type: %s",
        key,
        this.avr.inputs[key].name,
        this.avr.inputs[key].id,
        this.avr.inputs[key].type,
    );

    let savedInputVisibility;
    if (this.avr.inputs[key].id in this.savedVisibility) {
        savedInputVisibility = this.savedVisibility[this.avr.inputs[key].id];
    } else {
        savedInputVisibility = Characteristic.CurrentVisibilityState.SHOWN;
    }
    let tmpInput = new Service.InputSource(
        this.avr.inputs[key].name.replace(/[^a-zA-Z0-9]/g, ""),
        "tvInputService" + String(key),
    );
    tmpInput
        .setCharacteristic(Characteristic.Identifier, key)
        .setCharacteristic(
            Characteristic.ConfiguredName,
            this.avr.inputs[key].name.replace(/[^a-zA-Z0-9 ]/g, ""),
        ) // Name in home app
        .setCharacteristic(
            Characteristic.IsConfigured,
            Characteristic.IsConfigured.CONFIGURED,
        )
        .setCharacteristic(
            Characteristic.InputSourceType,
            this.avr.inputs[key].type,
        )
        .setCharacteristic(
            Characteristic.CurrentVisibilityState,
            savedInputVisibility,
        ) // Show in input list
        .setCharacteristic(
            Characteristic.TargetVisibilityState,
            savedInputVisibility,
        ); // Enable show selection
    tmpInput
        .getCharacteristic(Characteristic.TargetVisibilityState)
        .on("set", (state, callback) => {
            me.log.debug(
                "Set %s TargetVisibilityState %s",
                me.avr.inputs[key].name,
                state,
            );
            me.savedVisibility[me.avr.inputs[key].id] = state;
            try {
                fs.writeFile(
                    me.inputVisibilityFile,
                    JSON.stringify(me.savedVisibility),
                    (err) => {
                        if (err) {
                            me.log.debug(
                                "Error : Could not write input visibility %s",
                                err,
                            );
                        } else {
                            me.log.debug("Input visibility successfully saved");
                        }
                    },
                );
            } catch (err) {
                me.log.debug(
                    "Input visibility file does not exist or JSON parsing failed (%s)",
                    err,
                );
            }

            tmpInput.setCharacteristic(
                Characteristic.CurrentVisibilityState,
                state,
            );
            callback();
        });
    tmpInput
        .getCharacteristic(Characteristic.ConfiguredName)
        .on("set", (name, callback) => {
            // Rename inout
            me.log.info(
                "Rename input %s to %s",
                me.avr.inputs[key].name,
                name.replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 14),
            );
            me.avr.inputs[key].name = name
                .replace(/[^a-zA-Z0-9 ]/g, "")
                .substring(0, 14);
            me.avr.renameInput(me.avr.inputs[key].id, name);
            callback();
        });

    this.tvService.addLinkedService(tmpInput);
    this.enabledServices.push(tmpInput);
};

// Callback methods
// Callbacks for InformationService
pioneerAvrAccessory.prototype.getPowerOn = function(callback) {
    if (!this.avr || !this.avr.s || !this.avr.s.connectionReady) {
        callback(null, false);
        return;
    }

    this.log.debug("Get power status");
    this.avr.powerStatus(callback);
};

pioneerAvrAccessory.prototype.setPowerOn = function(on, callback) {
    // Set power on/off
    if (on) {
        this.log.info("Power on");
        this.avr.powerOn();
    } else {
        this.log.info("Power off");
        this.avr.powerOff();
    }

    callback();
};

let lastgetActiveIdentifierTime = undefined;

pioneerAvrAccessory.prototype.getActiveIdentifier = function(callback) {
    // Update current unput
    this.log.debug("Get input status");
    this.avr.inputStatus(callback);
    lastgetActiveIdentifierTime = Date.now();
};


let lastsetActiveIdentifierTime = undefined;
let lastsetActiveIdentifierTimeout = null;
let lastInputSet = null;
pioneerAvrAccessory.prototype.setActiveIdentifier = function(
    newValue,
    callback,
) {
    if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on) {
        callback();
        return;
    }

    this.log.debug(
        "setActiveIdentifier called",
        String(lastInputSet) == String(newValue),
        String(lastInputSet),
        String(newValue),
    );
    if (
        this.avr.isReady == true &&
        lastInputSet != null &&
        String(lastInputSet) == String(newValue)
    ) {
        callback();
        return;
    }

    // Change input
    lastInputSet = newValue;
    clearTimeout(lastsetActiveIdentifierTimeout);
    let timeoutTimer = 0;
    // let thisThis = this;

    let minTimeElapsed = 6000;
    if (
        lastsetActiveIdentifierTime !== undefined &&
        Date.now() - lastsetActiveIdentifierTime < minTimeElapsed
    ) {
        timeoutTimer =
            minTimeElapsed - (Date.now() - lastsetActiveIdentifierTime);
    }

    (function(setInput) {
        lastsetActiveIdentifierTimeout = setTimeout(function() {
            if (setInput in Object.keys(thisThis.avr.inputs)) {
                thisThis.log.info(
                    "set active identifier %s:%s (%s)",
                    setInput,
                    thisThis.avr.inputs[setInput].id,
                    thisThis.avr.inputs[setInput].name,
                );
                thisThis.avr.setInput(thisThis.avr.inputs[setInput].id);
                lastInputSet = setInput;
            }
        }, timeoutTimer);
    })(newValue, this);

    callback();
    lastsetActiveIdentifierTime = Date.now();
};

// Callbacks for TelevisionSpeaker service
pioneerAvrAccessory.prototype.setVolumeSwitch = function(
    state,
    callback,
    isUp,
) {
    if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on) {
        callback();
        return;
    }
    // Manage volume buttons in remote control center
    if (isUp) {
        this.log.debug("Volume up");
        this.avr.volumeUp();
    } else {
        this.log.debug("Volume down");
        this.avr.volumeDown();
    }

    callback();
};

pioneerAvrAccessory.prototype.listeningMode = function(callback) {
    if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on) {
        callback();
        return;
    }
    // Get listening Mode
    this.log.debug("Get listening Mode");
    this.avr.listeningMode(callback);
};

pioneerAvrAccessory.prototype.toggleListeningMode = function(mode, callback) {
    if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on) {
        callback();
        return;
    }
    this.avr.toggleListeningMode();
    callback();
};

pioneerAvrAccessory.prototype.getMuted = function(callback) {

    if (typeof(callback) !== "function") {
        callback = function() {}
    }

    if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on) {
        callback(null, true);
        return;
    }

    // Get mute status
    this.log.debug("Get mute status");
    this.avr.muteStatus(callback);
};

pioneerAvrAccessory.prototype.getMutedInverted = function(callback) {

    if (typeof(callback) !== "function") {
        callback = function() {}
    }

    // Get mute status
    // this.log.debug("getMutedInverted mute status");
    callback(null, !(this.avr.state.muted || !this.avr.state.on));
};

pioneerAvrAccessory.prototype.setMutedInverted = function(mute, callback) {
    if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on) {
        callback();
        return;
    }
    // Set mute on/off for home app icon
    if (!mute) {
        // this.log.info("Mute on");
        this.avr.muteOn();
    } else {
        // this.log.info("Mute off");
        this.avr.muteOff();
    }

    callback();
};

pioneerAvrAccessory.prototype.setMuted = function(mute, callback) {
    if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on) {
        callback();
        return;
    }
    // Set mute on/off
    if (mute) {
        this.log.debug("Mute on");
        this.avr.muteOn();
    } else {
        this.log.debug("Mute off");
        this.avr.muteOff();
    }

    callback();
};

pioneerAvrAccessory.prototype.getVolume = function(callback) {
    // Get volume status
    if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on) {
        callback(30);
        return;
    }
    this.log.debug("Get volume status");
    this.avr.volumeStatus(callback);
};

pioneerAvrAccessory.prototype.setVolume = function(volume, callback) {
    // Set volume status
    if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on || this.avr.state.volume == volume) {
        callback();
        return;
    }

    this.log.debug("Set volume to %s, isMuted: %s", volume, this.avr.state.muted);
    this.avr.setVolume(volume, callback);

    if (volume <= 0 && !this.avr.state.muted) {
        this.log.debug("Set mute by volume %s", volume);
        this.setMuted(true, function() {})
    } else
    if (volume > 0 && this.avr.state.muted) {
        this.log.debug("Set UNmute by volume %s", volume);
        this.setMuted(false, function() {})
    }
};

// Callback for Remote key
pioneerAvrAccessory.prototype.remoteKeyPress = function(remoteKey, callback) {
    this.log.debug("Remote key pressed : %s", remoteKey);

    if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on) {
        callback();
        return;
    }

    switch (remoteKey) {
        default:
            callback();
        case Characteristic.RemoteKey.REWIND:
            this.log.debug("Rewind remote key not implemented");
            break;
        case Characteristic.RemoteKey.FAST_FORWARD:
            this.log.debug("Fast forward remote key not implemented");
            break;
        case Characteristic.RemoteKey.NEXT_TRACK:
            this.log.info("Next track remote key not implemented");
            callback();
            break;
        case Characteristic.RemoteKey.PREVIOUS_TRACK:
            this.log.debug("Previous track remote key not implemented");
            callback();
            break;
        case Characteristic.RemoteKey.ARROW_UP:
            this.avr.remoteKey("UP");
            callback();
            break;
        case Characteristic.RemoteKey.ARROW_DOWN:
            this.avr.remoteKey("DOWN");
            callback();
            break;
        case Characteristic.RemoteKey.ARROW_LEFT:
            this.avr.remoteKey("LEFT");
            callback();
            break;
        case Characteristic.RemoteKey.ARROW_RIGHT:
            this.avr.remoteKey("RIGHT");
            callback();
            break;
        case Characteristic.RemoteKey.SELECT:
            this.avr.remoteKey("ENTER");
            callback();
            break;
        case Characteristic.RemoteKey.BACK:
            this.avr.remoteKey("RETURN");
            callback();
            break;
        case Characteristic.RemoteKey.EXIT:
            this.avr.remoteKey("RETURN");
            callback();
            break;
        case Characteristic.RemoteKey.PLAY_PAUSE:
            // this.log.info('Play/Pause remote key not implemented');
            this.avr.toggleListeningMode(callback);
            // try{
            //     callback();
            // } catch (e) {
            //   console.log(e)
            // }
            break;
        case Characteristic.RemoteKey.INFORMATION:
            this.avr.remoteKey("HOME_MENU");
            callback();
            break;
    }
};

pioneerAvrAccessory.prototype.getServices = function() {
    // This method is called once on startup. We need to wait for accessory to be ready
    // ie all inputs are created

    let whilecounter = 0;
    while ((!this.avr || this.avr.isReady == false) && whilecounter++ < 1000) {
        require("deasync").sleep(1000);
        if (whilecounter % 10 === 0) {
            this.log.debug("Waiting for pioneerAvrAccessory to be ready");
        }
        if (this.avr && this.avr.inputMissing.length > 0) {
            this.log.debug("inputMissing:", this.avr.inputMissing.join(', '));
        }
    }

    while (!this.avr || this.avr.isReady == false) {
        require("deasync").sleep(10000);
    }

    if (this.avr && this.avr.isReady == false) {
        this.log.info("Accessory %s NOT ready", this.name);
    } else {
        this.log.info("Accessory %s ready", this.name);
    }


    this.log.debug("Enabled services : %s", this.enabledServices.length);

    return this.enabledServices;
};
