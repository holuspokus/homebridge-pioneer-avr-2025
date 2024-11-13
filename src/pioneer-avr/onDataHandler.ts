// src/pioneer-avr/onDataHandler.ts

import PioneerAvr from './pioneerAvr';

export function onDataHandler(pioneerThis: PioneerAvr) {
    // Ensure `initCount` is initialized
    if (!pioneerThis.initCount) {
        pioneerThis.initCount = 0;
    }

    return function (error: any, data: string, callback: Function = () => {}) {
        // Log the received data if needed
        // pioneerThis.log.debug("Receive data: %s", data);

        if (error) {
            pioneerThis.log.error(error);
            try {
                callback(error, data);
            } catch (e) {
                pioneerThis.log.debug("onData", e);
            }
            return;
        }

        // Handle different data responses based on prefixes
        if (data.startsWith("E") && !data.startsWith("E06RGB") && !data.startsWith("E04RGB")) {
            pioneerThis.log.debug("Receive error: " + String(data));
            try {
                callback(String(data), data);
            } catch (e) {
                pioneerThis.log.debug("onData", e);
            }
        } else if (data.indexOf("VD:SENT") > -1 || data.indexOf("VU:SENT") > -1 || data.indexOf("MO:SENT") > -1) {
            try {
                callback(error, data);
            } catch (e) {
                pioneerThis.log.debug("onData", e);
            }
        } else if (data.indexOf(":SENT") > -1) {
            // Placeholder for additional handling if needed
        } else if (data.indexOf("PWR") > -1) {
            handlePowerStatus(data, pioneerThis, callback);
        } else if (data.indexOf("MUT") > -1) {
            handleMuteStatus(data, pioneerThis, callback);
        } else if (data.indexOf("SR") > -1 && data.length === 6) {
            handleListeningMode(data, pioneerThis, callback, 'listeningMode');
        } else if (data.indexOf("LM") > -1 && data.length === 6) {
            handleListeningMode(data, pioneerThis, callback, 'listeningModeLM');
        } else if (data.indexOf("VOL") > -1) {
            handleVolumeStatus(data, pioneerThis, callback);
        } else if (data.indexOf("FN") > -1) {
            handleInputStatus(data, pioneerThis, callback);
        } else if (data.startsWith("E06RGB") || data.startsWith("E04RGB")) {
            handleInputErrors(data, pioneerThis, callback);
        } else if (data.indexOf("RGB") > -1) {
            handleInputDiscovery(data, pioneerThis, callback);
        }
    };
}

/**
 * Handles power status response and triggers necessary actions
 * @param data - The received data string
 * @param pioneerThis - The current instance of PioneerAvr
 * @param callback - Callback function for further actions
 */
function handlePowerStatus(data: string, pioneerThis: PioneerAvr, callback: Function) {
    data = data.substring(data.indexOf("PWR"));
    pioneerThis.state.on = parseInt(data[3], 10) === 0;
    pioneerThis.log.debug("Receive Power status: %s (%s)", pioneerThis.state.on ? "On" : "Off", data);
    pioneerThis.state.lastGetPowerStatus = Date.now();

    try {
        callback(null, data);
    } catch (e) {
        pioneerThis.log.debug("onData", e);
    }

    // Update power state
    pioneerThis.functionSetPowerState(pioneerThis.state.on);

    // Update mute state
    pioneerThis.functionSetLightbulbMuted(pioneerThis.state.muted);
}

/**
 * Handles mute status response and triggers necessary actions
 * @param data - The received data string
 * @param pioneerThis - The current instance of PioneerAvr
 * @param callback - Callback function for further actions
 */
function handleMuteStatus(data: string, pioneerThis: PioneerAvr, callback: Function) {
    data = data.substring(data.indexOf("MUT"));
    pioneerThis.state.muted = parseInt(data[3], 10) === 0;
    pioneerThis.log.debug("Receive Mute status: %s (%s -> %s)", pioneerThis.state.muted ? "Muted" : "Not Muted", data[3], data);

    try {
        callback(null, pioneerThis.state.muted);
    } catch (e) {
        pioneerThis.log.debug("onData", e);
    }

    // Update mute state
    pioneerThis.functionSetLightbulbMuted(pioneerThis.state.muted);
}

/**
 * Handles listening mode response and updates the corresponding state
 * @param data - The received data string
 * @param pioneerThis - The current instance of PioneerAvr
 * @param callback - Callback function for further actions
 * @param modeKey - The mode key for updating state
 */
function handleListeningMode(data: string, pioneerThis: PioneerAvr, callback: Function, modeKey: string) {
    data = data.substring(data.indexOf(modeKey === 'listeningMode' ? "SR" : "LM"));
    pioneerThis.state[modeKey] = data.substr(2, 4);
    try {
        callback(null, data);
    } catch (e) {
        pioneerThis.log.debug("onData", e);
    }
}

/**
 * Handles volume status response, converts to percentage, and updates state
 * @param data - The received data string
 * @param pioneerThis - The current instance of PioneerAvr
 * @param callback - Callback function for further actions
 */
function handleVolumeStatus(data: string, pioneerThis: PioneerAvr, callback: Function) {
    data = data.substring(data.indexOf("VOL"));
    let vol = data.substr(3, 3);
    let volPctF = calculateVolumePercentage(vol, pioneerThis);

    if (vol.length === 3 && !isNaN(volPctF)) {
        pioneerThis.state.volume = Math.floor(volPctF);
        pioneerThis.functionSetLightbulbVolume(pioneerThis.state.volume);
    }

    pioneerThis.log.debug("Volume is %s (%s%%)", vol, volPctF);

    try {
        callback(null, pioneerThis.state.volume);
    } catch (e) {
        pioneerThis.log.debug("onData", e);
    }
}

/**
 * Converts the received volume value to a percentage
 * @param vol - Volume in the AVR scale
 * @param pioneerThis - The current instance of PioneerAvr
 * @returns Calculated volume percentage
 */
function calculateVolumePercentage(vol: string, pioneerThis: PioneerAvr) {
    let volPctF = 0;
    if (pioneerThis.maxVolumeSet > pioneerThis.minVolumeSet) {
        const minVolumeIn185 = (pioneerThis.minVolumeSet / 100) * 185;
        const maxVolumeIn185 = (pioneerThis.maxVolumeSet / 100) * 185;
        const parsedVol = parseInt(vol, 10);
        const adjustedVol = Math.min(Math.max(parsedVol, minVolumeIn185), maxVolumeIn185);
        volPctF = Math.floor(((adjustedVol - minVolumeIn185) / (maxVolumeIn185 - minVolumeIn185)) * 100);
    } else {
        volPctF = Math.floor(parseInt(vol, 10) * 100 / 185);
    }
    return volPctF;
}

/**
 * Handles input status response and triggers necessary actions
 * @param data - The received data string
 * @param pioneerThis - The current instance of PioneerAvr
 * @param callback - Callback function for further actions
 */
function handleInputStatus(data: string, pioneerThis: PioneerAvr, callback: Function) {
    data = data.substring(data.indexOf("FN"));
    pioneerThis.log.debug("Receive Input status: %s", data);

    let inputId = data.substr(2, 2);
    let inputIndex = pioneerThis.inputs.findIndex(input => input.id === inputId);

    if (inputIndex === -1) {
        try {
            callback(null, 0);
        } catch (e) {
            pioneerThis.log.debug("onData", e);
        }
        return;
    }

    pioneerThis.state.input = inputIndex;

    pioneerThis.functionSetActiveIdentifier(pioneerThis.state.input);

    try {
        callback(null, inputIndex);
    } catch (e) {
        pioneerThis.log.debug(String(e));
    }
}

/**
 * Handles errors during input discovery
 * @param data - The received data string
 * @param pioneerThis - The current instance of PioneerAvr
 * @param callback - Callback function for further actions
 */
function handleInputErrors(data: string, pioneerThis: PioneerAvr, callback: Function) {
    try {
        data = data.substring(data.indexOf("RGB"));
        let thisId = data.substr(3, 2);

        for (let key in pioneerThis.inputToType) {
            if (String(key) === String(thisId)) {
                delete pioneerThis.inputToType[key];

                let indexMissing = pioneerThis.inputMissing.findIndex(missingInput => missingInput.includes(thisId));
                if (indexMissing !== -1) {
                    pioneerThis.inputMissing.splice(indexMissing, 1);
                }

                if (String(pioneerThis.inputBeingAdded) === String(key)) {
                    pioneerThis.inputBeingAdded = false;
                    pioneerThis.inputBeingAddedWaitCount = 0;
                }
                break;
            }
        }

        callback(String(data), data);
    } catch (e) {
        pioneerThis.log.debug("onData", e);
    }
}

/**
 * Handles input discovery and updates the input list
 * @param data - The received data string
 * @param pioneerThis - The current instance of PioneerAvr
 * @param callback - Callback function for further actions
 */
function handleInputDiscovery(data: string, pioneerThis: PioneerAvr, callback: Function) {
    data = data.substring(data.indexOf("RGB"));
    let tmpInput = {
        id: data.substr(3, 2),
        name: data.substr(6).trim(),
        type: pioneerThis.inputToType[data.substr(3, 2)],
    };

    if (tmpInput.name.length === 0) {
        handleInputErrors(data, pioneerThis, callback);
        return;
    }

    if (typeof pioneerThis.inputBeingAdded === 'string' && pioneerThis.inputBeingAdded === tmpInput.id) {
        pioneerThis.inputBeingAdded = false;
        pioneerThis.inputBeingAddedWaitCount = 0;
    }

    let alreadyExists = pioneerThis.inputs.some(input => input.id === tmpInput.id);

    if (!alreadyExists) {
        pioneerThis.inputs.push(tmpInput);
        removeFromInputMissing(pioneerThis, tmpInput.id);
        pioneerThis.initCount += 1;
        // pioneerThis.log.info(
        //     `Input [${tmpInput.name}] discovered (id: ${tmpInput.id}, type: ${tmpInput.type}). InitCount=${pioneerThis.initCount}/${Object.keys(pioneerThis.inputToType).length}` +
        //     (pioneerThis.inputMissing.length > 0 ? `, inputMissing: ${pioneerThis.inputMissing}` : '')
        // );
        pioneerThis.log.info(
            `Input [${tmpInput.name}] discovered`
        );
    }

    let inputIndex = pioneerThis.inputs.findIndex(input => input.id === tmpInput.id);
    if (inputIndex !== -1) {
        try {
            callback(null, inputIndex);
        } catch (e) {
            pioneerThis.log.debug("onData", e);
        }
    }
}

/**
 * Removes an input from the missing list
 * @param pioneerThis - The current instance of PioneerAvr
 * @param inputId - The input ID to remove from missing list
 */
function removeFromInputMissing(pioneerThis: PioneerAvr, inputId: string) {
    let indexMissing = pioneerThis.inputMissing.findIndex(missingInput => missingInput.includes(inputId));
    if (indexMissing !== -1) {
        pioneerThis.inputMissing.splice(indexMissing, 1);
    }
}
