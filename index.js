/*
    Pioneer AVR TV Accessory Module for homebridge
*/
const PioneerAvr = require("./pioneer-avr");
const ppath = require("persist-path");
const fs = require("fs");
const mkdirp = require("mkdirp");

let initP = function(){},
    initPTimeout = null,
    thisThis = null

let Service;
let Characteristic;

module.exports = function (homebridge) {
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

function pioneerAvrAccessory(log, config) {
    // Main accessory initialization
    this.log = log;
    this.config = config;

    this.name = config.name = config.name.replace(/[^a-zA-Z0-9 ]/g, "");
    this.host = config.host;
    this.port = config.port;
    
    if(Object.hasOwn(config, 'maxVolumeSet') || typeof(config.maxVolumeSet) == 'undefined'){
        this.maxVolumeSet = config.maxVolumeSet;
    }else{
        this.maxVolumeSet = 70;
    }

    this.maxVolumeSet = parseInt(String(this.maxVolumeSet).replace(/[^0-9]/g, ""), 10);
    if (this.maxVolumeSet > 100) { this.maxVolumeSet = 100; }
    if (this.maxVolumeSet < 0) { this.maxVolumeSet = 0; }

    this.model =
        config.model.replace(/[^a-zA-Z0-9]/g, "") ||
        config.name.replace(/[^a-zA-Z0-9]/g, "") ||
        "VSX923";
    this.prefsDir = config.prefsDir || ppath("pioneerAvr/");

    log.debug("Preferences directory : %s", this.prefsDir);
    this.manufacturer = "Pioneer";
    this.version = "0.0.6";

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
            mkdirp(this.prefsDir);
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
        if(thisThis.avr && thisThis.avr.s){
            thisThis.avr.s.disconnect()
            require("deasync").sleep(10050);
        }
    } catch (err) {
        thisThis.log.debug("error disconnecting before connecting", err);
    }

    try {
        thisThis.avr = new PioneerAvr(thisThis.log, thisThis.host, thisThis.port, thisThis.maxVolumeSet, function(){
            try{
                thisThis.enabledServices = [];
                require("deasync").sleep(1050);
                thisThis.prepareInformationService();
                require("deasync").sleep(50);
                thisThis.prepareTvService();
                require("deasync").sleep(50);
                thisThis.prepareTvSpeakerService();
                require("deasync").sleep(50);
                thisThis.prepareInputSourceService();

                thisThis.log.debug('thisThis.maxVolumeSet', thisThis.maxVolumeSet)
                if (thisThis.maxVolumeSet !== 0){
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

pioneerAvrAccessory.prototype.prepareInformationService = function () {
    // Set accessory informations
    this.informationService = new Service.AccessoryInformation();
    this.informationService
        .setCharacteristic(
            Characteristic.Name,
            this.name.replace(/[^a-zA-Z0-9 ]/g, ""),
        )
        .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
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

pioneerAvrAccessory.prototype.prepareTvService = function () {
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

    // this.log.info('set ActiveIdentifier to 0');
    // this.tvService.setCharacteristic(Characteristic.ActiveIdentifier, 0);

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

    let thisThis = this

    // (function(){
        thisThis.avr.functionSetPowerState = function(set){

            // if (!thisThis.avr.s || !thisThis.avr.s.connectionReady || !thisThis.avr.state.on) { thisThis.log.debug('update power canceled ' + String(set)); return; }

            clearTimeout(updatePowerStateTimeout)
            updatePowerStateTimeout = setTimeout(function(){
                thisThis.log.debug('functionSetPowerState called')
                try {
                    thisThis.tvService
                    .getCharacteristic(Characteristic.Active)
                    .updateValue(set);

                } catch (e) {
                    thisThis.log.debug('functionSetPowerState Error', e)
                }
            }, 50)
        }
    // })()
}


pioneerAvrAccessory.prototype.prepareVolumeService = function () {
    // let thisThis = this;
    // Volume

    this.volumeServiceLightbulb = new Service.Lightbulb(this.name, 'volumeInput');
				this.volumeServiceLightbulb
					.getCharacteristic(Characteristic.On)
					.on('get', this.getMuted.bind(this))
					.on('set', this.getMuted.bind(this));
				this.volumeServiceLightbulb
					.getCharacteristic(Characteristic.Brightness)
					.on('get', this.getVolume.bind(this))
					.on('set', this.setVolume.bind(this));
          // .setValue(78);

          // this.volumeServiceLightbulb
					// .getCharacteristic(Characteristic.Brightness)
					// .updateValue(78);

          this.volumeServiceLightbulb
						.getCharacteristic(Characteristic.Brightness)
						.updateValue(78);

    this.tvService.addLinkedService(this.volumeServiceLightbulb);
    this.enabledServices.push(this.volumeServiceLightbulb);

    // this.volumeServiceSpeaker = new Service.Speaker(this.name, 'volumeInput');
		// 		this.volumeServiceSpeaker
		// 			.getCharacteristic(Characteristic.On)
    //       .on("get", this.getMuted.bind(this))
    //       .on("set", this.setMuted.bind(this));
		// 		this.volumeServiceSpeaker
		// 			.getCharacteristic(Characteristic.Brightness)
		// 			.on("get", this.getVolume.bind(this))
		// 			.on("set", this.setVolume.bind(this));
    //
    // this.enabledServices.push(this.volumeServiceSpeaker);

    // this.functionSetLightbulbMuted(true)
    // this.functionSetLightbulbVolume(79)

    let thisThis = this

    // (function () {

        thisThis.avr.functionSetLightbulbVolume = function(set){
          // thisThis.log.debug('functionSetLightbulbVolume called...', String(set),  thisThis.volumeServiceLightbulb.getCharacteristic(Characteristic.Brightness).value)

            // if (!thisThis.avr.s || !thisThis.avr.s.connectionReady || !thisThis.avr.state.on) { thisThis.log.debug('update vol canceled ' + String(set)); return; }

            if(thisThis.volumeServiceLightbulb.getCharacteristic(Characteristic.Brightness).value != set){
                clearTimeout(functionSetLightbulbVolumeTimeout)
                functionSetLightbulbVolumeTimeout = setTimeout(function(){

                    thisThis.log.debug('set vol to ' + String(set))
                    try {
                      thisThis.volumeServiceLightbulb
                      .getCharacteristic(Characteristic.Brightness)
                      .updateValue(set);

                      // thisThis.volumeServiceSpeaker
                      // .setCharacteristic(Characteristic.Brightness)
                      // .updateValue(set); // volume
                    } catch (e) {
                        thisThis.log.debug('updateValueVol', e)
                    }
                }, 50)
            }
        }


        thisThis.avr.functionSetLightbulbMuted = function(set){

            // if (!thisThis.avr.s || !thisThis.avr.s.connectionReady || !thisThis.avr.state.on) { thisThis.log.debug('update mute canceled ' + String(set)); return; }

            clearTimeout(volumeServiceLightbulbTimeout)
            volumeServiceLightbulbTimeout = setTimeout(function(){
                // thisThis.log.debug('functionSetLightbulbMuted called')
                try {
                    thisThis.volumeServiceLightbulb
                    .getCharacteristic(Characteristic.On)
                    .updateValue(set); // muted or not

                    // thisThis.volumeServiceSpeaker
                    // .getCharacteristic(Characteristic.On)
                    // .updateValue(set); // muted or not
                } catch (e) {
                    thisThis.log.debug('functionSetLightbulbMuted Error', e)
                }
            }, 50)
        }

        thisThis.avr.functionSetInputState = function(set){

            // if (!thisThis.avr.s || !thisThis.avr.s.connectionReady || !thisThis.avr.state.on) { thisThis.log.debug('update mute canceled ' + String(set)); return; }

            clearTimeout(volumeServiceLightbulbTimeout)
            volumeServiceLightbulbTimeout = setTimeout(function(){
                thisThis.log.debug('functionSetInputState called')
                try {
                    thisThis.volumeServiceLightbulb
                    .getCharacteristic(Characteristic.On)
                    .updateValue(set); // muted or not

                    // thisThis.volumeServiceSpeaker
                    // .getCharacteristic(Characteristic.On)
                    // .updateValue(set); // muted or not
                } catch (e) {
                    thisThis.log.debug('functionSetInputState Error', e)
                }
            }, 50)
        }


    // })()


};

pioneerAvrAccessory.prototype.prepareTvSpeakerService = function () {
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

pioneerAvrAccessory.prototype.prepareInputSourceService = function () {
    // Run avr.loadInputs with addInputSourceService callback to create each input service
    this.log.info("Discovering inputs");
    let thisThis = this;
    this.avr.loadInputs(function (key) {
        if (String(key).startsWith('E')) { return;  }
        thisThis.addInputSourceService(key);
    });
};

pioneerAvrAccessory.prototype.addInputSourceService = function (inputkey) {
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
pioneerAvrAccessory.prototype.getPowerOn = function (callback) {
    if (!this.avr || !this.avr.s || !this.avr.s.connectionReady) { callback(null, false); return; }

    this.log.info("Get power status");
    this.avr.powerStatus(callback);
};

pioneerAvrAccessory.prototype.setPowerOn = function (on, callback) {
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

pioneerAvrAccessory.prototype.getActiveIdentifier = function (callback) {
    // Update current unput
    this.log.info("Get input status");
    this.avr.inputStatus(callback);
    lastgetActiveIdentifierTime = Date.now();
};

let lastsetActiveIdentifierTime = undefined;
let lastsetActiveIdentifierTimeout = null;
let lastInputSet = null;
pioneerAvrAccessory.prototype.setActiveIdentifier = function (
    newValue,
    callback,
) {
    if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on) { callback(); return; }

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
    let thisThis = this;

    let minTimeElapsed = 6000;
    if (
        lastsetActiveIdentifierTime !== undefined &&
        Date.now() - lastsetActiveIdentifierTime < minTimeElapsed
    ) {
        timeoutTimer =
            minTimeElapsed - (Date.now() - lastsetActiveIdentifierTime);
    }

    (function (setInput) {
        lastsetActiveIdentifierTimeout = setTimeout(function () {
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
pioneerAvrAccessory.prototype.setVolumeSwitch = function (
    state,
    callback,
    isUp,
) {
    if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on) { callback();  return; }
    // Manage volume buttons in remote control center
    if (isUp) {
        this.log.info("Volume up");
        this.avr.volumeUp();
    } else {
        this.log.info("Volume down");
        this.avr.volumeDown();
    }

    callback();
};

pioneerAvrAccessory.prototype.listeningMode = function (callback) {
    if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on) { callback(); return; }
    // Get listening Mode
    this.log.info("Get listening Mode");
    this.avr.listeningMode(callback);
};

pioneerAvrAccessory.prototype.toggleListeningMode = function (mode, callback) {
    if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on) { callback(); return; }
    this.avr.toggleListeningMode();
    callback();
};

pioneerAvrAccessory.prototype.getMuted = function (callback) {

    if (typeof(callback) !== "function"){
        callback = function(){}
    }

    if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on) { callback(null, false); return; }

    // Get mute status
    this.log.info("Get mute status");
    this.avr.muteStatus(callback);
};

pioneerAvrAccessory.prototype.setMuted = function (mute, callback) {
    if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on) { callback(); return; }
    // Set mute on/off
    if (mute) {
        this.log.info("Mute on");
        this.avr.muteOn();
    } else {
        this.log.info("Mute off");
        this.avr.muteOff();
    }

    callback();
};

pioneerAvrAccessory.prototype.getVolume = function (callback) {
    // Get volume status
    if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on) { callback(30); return; }
    this.log.info("Get volume status");
    this.avr.volumeStatus(callback);
};

pioneerAvrAccessory.prototype.setVolume = function (volume, callback) {
    // Set volume status
    if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on) { callback(); return; }
    this.log.info("Set volume to %s", volume);
    this.avr.setVolume(volume, callback);
};

// Callback for Remote key
pioneerAvrAccessory.prototype.remoteKeyPress = function (remoteKey, callback) {
    this.log.info("Remote key pressed : %s", remoteKey);

    if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on) { callback(); return; }

    switch (remoteKey) {
        default:
            callback();
        case Characteristic.RemoteKey.REWIND:
            this.log.info("Rewind remote key not implemented");
            break;
        case Characteristic.RemoteKey.FAST_FORWARD:
            this.log.info("Fast forward remote key not implemented");
            break;
        case Characteristic.RemoteKey.NEXT_TRACK:
            this.log.info("Next track remote key not implemented");
            callback();
            break;
        case Characteristic.RemoteKey.PREVIOUS_TRACK:
            this.log.info("Previous track remote key not implemented");
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

pioneerAvrAccessory.prototype.getServices = function () {
    // This method is called once on startup. We need to wait for accessory to be ready
    // ie all inputs are created

    let whilecounter = 0;
    while ((!this.avr || this.avr.isReady == false) && whilecounter++ < 1000) {
        require("deasync").sleep(1000);
        if(whilecounter % 10 === 0){
            this.log.debug("Waiting for pioneerAvrAccessory to be ready");
        }
        if(this.avr && this.avr.inputMissing.length > 0){
          this.log.debug("inputMissing:", this.avr.inputMissing.join(', '));
        }
    }

    while (!this.avr || this.avr.isReady == false ) {
        require("deasync").sleep(10000);
    }

    if (this.avr && this.avr.isReady == false) {
        this.log.info("Accessory %s NOT ready", this.name);
    }else{
        this.log.info("Accessory %s ready", this.name);
    }


    this.log.debug("Enabled services : %s", this.enabledServices.length);

    return this.enabledServices;
};
