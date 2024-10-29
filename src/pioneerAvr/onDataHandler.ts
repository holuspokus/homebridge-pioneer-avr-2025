import { AVState } from './pioneerAvr';

export function onDataHandler(log: any, state: AVState) {
    return function (error: any, data: string, callback: Function = () => {}) {
        log.debug("Receive data: %s", data);

        if (error) {
            log.error(error);
            try {
                callback(error, data);
            } catch (e) {
                log.debug("onData", e);
            }
            return;
        }

        if (data.startsWith("E") && !data.startsWith("E06RGB") && !data.startsWith("E04RGB")) {
            log.debug("Receive error: " + String(data));
            try {
                callback(String(data), data);
            } catch (e) {
                log.debug("onData", e);
            }
        } else if (data.indexOf("VD:SENT") > -1 || data.indexOf("VU:SENT") > -1 || data.indexOf("MO:SENT") > -1) {
            try {
                callback(error, data);
            } catch (e) {
                log.debug("onData", e);
            }
        } else if (data.indexOf(":SENT") > -1) {
            // Placeholder for additional handling if needed
        } else if (data.indexOf("PWR") > -1) {
            handlePowerStatus(data, log, state, callback);
        } else if (data.indexOf("MUT") > -1) {
            handleMuteStatus(data, log, state, callback);
        } else if (data.indexOf("SR") > -1 && data.length === 6) {
            handleListeningMode(data, log, state, callback, 'listeningMode');
        } else if (data.indexOf("LM") > -1 && data.length === 6) {
            handleListeningMode(data, log, state, callback, 'listeningModeLM');
        } else if (data.indexOf("VOL") > -1) {
            handleVolumeStatus(data, log, state, callback);
        } else if (data.indexOf("FN") > -1) {
            handleInputStatus(data, log, state, callback);
        } else if (data.startsWith("E06RGB") || data.startsWith("E04RGB")) {
            handleInputErrors(data, log, state);
        } else if (data.indexOf("RGB") > -1) {
            handleInputDiscovery(data, log, state, callback);
        }
    };
}

function handlePowerStatus(data: string, log: any, state: AVState, callback: Function) {
    data = data.substring(data.indexOf("PWR"));
    state.on = parseInt(data[3], 10) === 0;
    log.debug("Receive Power status: %s (%s)", state.on ? "On" : "Off", data);
    state.lastGetPowerStatus = Date.now();

    try {
        callback(null, data);
    } catch (e) {
        log.debug("onData", e);
    }

    setTimeout(() => {
        try {
            functionSetPowerState(state.on);
        } catch (e) {
            log.debug("functionSetPowerState", e);
        }
    }, 2);

    setTimeout(() => {
        try {
            functionSetLightbulbMuted(state.muted);
        } catch (e) {
            log.debug("functionSetLightbulbMuted", e);
        }
    }, 20);
}

function handleMuteStatus(data: string, log: any, state: AVState, callback: Function) {
    data = data.substring(data.indexOf("MUT"));
    state.muted = parseInt(data[3], 10) === 0;

    log.debug("Receive Mute status: %s (%s -> %s)", state.muted ? "Muted" : "Not Muted", data[3], data);

    try {
        callback(null, state.muted);
    } catch (e) {
        log.debug("onData", e);
    }

    setTimeout(() => {
        try {
            functionSetLightbulbMuted(state.muted);
        } catch (e) {
            log.debug("functionSetLightbulbMuted", e);
        }
    }, 2);
}

function handleListeningMode(data: string, log: any, state: AVState, callback: Function, modeKey: string) {
    data = data.substring(data.indexOf(modeKey === 'listeningMode' ? "SR" : "LM"));
    state[modeKey] = data.substr(2, 4); // SR0018 -> 0018
    try {
        callback(null, data);
    } catch (e) {
        log.debug("onData", e);
    }
}

function handleVolumeStatus(data: string, log: any, state: AVState, callback: Function) {
    data = data.substring(data.indexOf("VOL"));
    let vol = data.substr(3, 3);
    let volPctF = calculateVolumePercentage(vol, state);

    if (vol.length === 3 && !isNaN(volPctF)) {
        state.volume = Math.floor(volPctF);
        setTimeout(() => {
            try {
                functionSetLightbulbVolume(state.volume);
            } catch (e) {
                log.debug("functionSetLightbulbVolume", e);
            }
        }, 3);
    }

    log.debug("Volume is %s (%s%%)", vol, volPctF);

    try {
        callback(null, state.volume);
    } catch (e) {
        log.debug("onData", e);
    }
}

function calculateVolumePercentage(vol: string, state: AVState) {
    let volPctF = 0;
    if (state.maxVolumeSet > state.minVolumeSet) {
        const minVolumeIn185 = (state.minVolumeSet / 100) * 185;
        const maxVolumeIn185 = (state.maxVolumeSet / 100) * 185;
        const parsedVol = parseInt(vol, 10);
        const adjustedVol = Math.min(Math.max(parsedVol, minVolumeIn185), maxVolumeIn185);
        volPctF = Math.floor(((adjustedVol - minVolumeIn185) / (maxVolumeIn185 - minVolumeIn185)) * 100);
    } else {
        volPctF = Math.floor(parseInt(vol, 10) * 100 / 185);
    }
    return volPctF;
}

function handleInputStatus(data: string, log: any, state: AVState, callback: Function) {
    data = data.substring(data.indexOf("FN"));
    log.debug("Receive Input status: %s", data);

    let inputId = data.substr(2, 2);
    let inputIndex = null;

    for (let x in state.inputs) {
        if (state.inputs[x].id === inputId) {
            inputIndex = x;
            break;
        }
    }

    if (inputIndex === null) {
        try {
            callback(null, 0);
        } catch (e) {
            log.debug("onData", e);
        }
        return;
    }

    state.input = inputIndex;
    setTimeout(() => {
        try {
            functionSetActiveIdentifier(state.input);
        } catch (e) {
            log.debug("functionSetActiveIdentifier", e);
        }
    }, 2);

    try {
        callback(null, inputIndex);
    } catch (e) {
        log.debug(e);
    }
}

function handleInputErrors(data: string, log: any, state: AVState) {
    data = data.substring(data.indexOf("RGB"));
    let thisId = data.substr(3, 2);

    // Handle input error removal and state updates here
    // Implementation depends on your specific logic
}

function handleInputDiscovery(data: string, log: any, state: AVState, callback: Function) {
    data = data.substring(data.indexOf("RGB"));
    let tmpInput = {
        id: data.substr(3, 2),
        name: data.substr(6).trim(),
        type: state.inputToType[data.substr(3, 2)],
    };

    // Check if already exists
    let alreadyExists = false;
    for (let x in state.inputs) {
        if (String(state.inputs[x].id) === String(tmpInput.id)) {
            log.debug('[' + String(tmpInput.id) + '] INPUT ALREADY EXISTS (programmer error)', tmpInput, state.inputs[x]);
            // Update existing input
            state.inputs[x] = tmpInput;
            alreadyExists = true;
            break;
        }
    }

    if (!alreadyExists) {
        state.inputs.push(tmpInput);
        log.debug("Input [%s] discovered (id: %s, type: %s)", tmpInput.name, tmpInput.id, tmpInput.type);

        // Additional logic for input discovery can be added here
        try {
            callback(null, tmpInput);
        } catch (e) {
            log.debug("onData", e);
        }
    }
}
