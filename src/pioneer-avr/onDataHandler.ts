// src/pioneer-avr/onDataHandler.ts

import { AVState } from './pioneerAvr';

export function onDataHandler(pioneerThis: PioneerAvr) {
    return function (error: any, data: string, callback: Function = () => {}) {
        pioneerThis.pioneerThis.log.debug("Receive data: %s", data);

        if (error) {
            pioneerThis.log.error(error);
            try {
                callback(error, data);
            } catch (e) {
                pioneerThis.log.debug("onData", e);
            }
            return;
        }

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
            handleInputErrors(data, pioneerThis);
        } else if (data.indexOf("RGB") > -1) {
            handleInputDiscovery(data, pioneerThis, callback);
        }
    };
}

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

    setTimeout(() => {
        try {
            pioneerThis.functionSetPowerState(pioneerThis.state.on);
        } catch (e) {
            pioneerThis.log.debug("functionSetPowerState", e);
        }
    }, 2);

    setTimeout(() => {
        try {
            pioneerThis.functionSetLightbulbMuted(pioneerThis.state.muted);
        } catch (e) {
            pioneerThis.log.debug("functionSetLightbulbMuted", e);
        }
    }, 20);
}

function handleMuteStatus(data: string, pioneerThis: PioneerAvr, callback: Function) {
    data = data.substring(data.indexOf("MUT"));
    pioneerThis.state.muted = parseInt(data[3], 10) === 0;

    pioneerThis.log.debug("Receive Mute status: %s (%s -> %s)", pioneerThis.state.muted ? "Muted" : "Not Muted", data[3], data);

    try {
        callback(null, pioneerThis.state.muted);
    } catch (e) {
        pioneerThis.log.debug("onData", e);
    }

    setTimeout(() => {
        try {
            pioneerThis.functionSetLightbulbMuted(pioneerThis.state.muted);
        } catch (e) {
            pioneerThis.log.debug("functionSetLightbulbMuted", e);
        }
    }, 2);
}

function handleListeningMode(data: string, pioneerThis: PioneerAvr, callback: Function, modeKey: string) {
    data = data.substring(data.indexOf(modeKey === 'listeningMode' ? "SR" : "LM"));
    pioneerThis.state[modeKey] = data.substr(2, 4); // SR0018 -> 0018
    try {
        callback(null, data);
    } catch (e) {
        pioneerThis.log.debug("onData", e);
    }
}

function handleVolumeStatus(data: string, pioneerThis: PioneerAvr, callback: Function) {
    data = data.substring(data.indexOf("VOL"));
    let vol = data.substr(3, 3);
    let volPctF = calculateVolumePercentage(vol, pioneerThis.state);

    if (vol.length === 3 && !isNaN(volPctF)) {
        pioneerThis.state.volume = Math.floor(volPctF);
        setTimeout(() => {
            try {
                pioneerThis.functionSetLightbulbVolume(pioneerThis.state.volume);
            } catch (e) {
                pioneerThis.log.debug("functionSetLightbulbVolume", e);
            }
        }, 3);
    }

    pioneerThis.log.debug("Volume is %s (%s%%)", vol, volPctF);

    try {
        callback(null, pioneerThis.state.volume);
    } catch (e) {
        pioneerThis.log.debug("onData", e);
    }
}

function calculateVolumePercentage(vol: string, pioneerThis: PioneerAvr) {
    let volPctF = 0;
    if (pioneerThis.state.maxVolumeSet > pioneerThis.state.minVolumeSet) {
        const minVolumeIn185 = (pioneerThis.state.minVolumeSet / 100) * 185;
        const maxVolumeIn185 = (pioneerThis.state.maxVolumeSet / 100) * 185;
        const parsedVol = parseInt(vol, 10);
        const adjustedVol = Math.min(Math.max(parsedVol, minVolumeIn185), maxVolumeIn185);
        volPctF = Math.floor(((adjustedVol - minVolumeIn185) / (maxVolumeIn185 - minVolumeIn185)) * 100);
    } else {
        volPctF = Math.floor(parseInt(vol, 10) * 100 / 185);
    }
    return volPctF;
}

function handleInputStatus(data: string, pioneerThis: PioneerAvr, callback: Function) {
    data = data.substring(data.indexOf("FN"));
    pioneerThis.log.debug("Receive Input status: %s", data);

    let inputId = data.substr(2, 2);
    let inputIndex = null;

    for (let x in pioneerThis.state.inputs) {
        if (pioneerThis.state.inputs[x].id === inputId) {
            inputIndex = x;
            break;
        }
    }

    if (inputIndex === null) {
        try {
            callback(null, 0);
        } catch (e) {
            pioneerThis.log.debug("onData", e);
        }
        return;
    }

    pioneerThis.state.input = inputIndex;
    setTimeout(() => {
        try {
            pioneerThis.functionSetActiveIdentifier(pioneerThis.state.input);
        } catch (e) {
            pioneerThis.log.debug("functionSetActiveIdentifier", e);
        }
    }, 2);

    try {
        callback(null, inputIndex);
    } catch (e) {
        pioneerThis.log.debug(e);
    }
}

function handleInputErrors(data: string, pioneerThis: PioneerAvr) {
    data = data.substring(data.indexOf("RGB"));
    let thisId = data.substr(3, 2);

    // Handle input error removal and state updates here
    // Implementation depends on your specific logic
}

function handleInputDiscovery(data: string, pioneerThis: PioneerAvr, callback: Function) {
    // Extrahiere und analysiere RGB-Daten, um Eingaben zu erkennen
    data = data.substring(data.indexOf("RGB"));
    let tmpInput = {
        id: data.substr(3, 2),
        name: data.substr(6).trim(),
        type: pioneerThis.state.inputToType[data.substr(3, 2)],
    };

    // Überprüfen, ob das gefundene tmpInput dem inputBeingAdded entspricht
    if (typeof pioneerThis.inputBeingAdded === 'string' && pioneerThis.inputBeingAdded === tmpInput.id) {
        pioneerThis.inputBeingAdded = false;  // Rücksetzen nach erfolgreicher Entdeckung
        pioneerThis.inputBeingAddedWaitCount = 0;
    }

    // Prüfen, ob das tmpInput bereits existiert
    let alreadyExists = false;
    for (let x in pioneerThis.state.inputs) {
        if (String(pioneerThis.state.inputs[x].id) === tmpInput.id) {
            pioneerThis.log.debug(`[${tmpInput.id}] INPUT ALREADY EXISTS (programmer error)`, tmpInput, pioneerThis.state.inputs[x]);
            pioneerThis.state.inputs[x] = tmpInput;  // Vorhandenes Input aktualisieren
            alreadyExists = true;
            break;
        }
    }

    // Falls das tmpInput gefiltert werden soll, entferne es aus inputMissing
    const filter = ['CYCLE', 'NET'];
    for (let i in filter) {
        if (tmpInput.name.indexOf(filter[i]) > -1) {
            pioneerThis.log.debug(
                `[filtered out] Input [${tmpInput.name}] discovered (id: ${tmpInput.id}, type: ${tmpInput.type}). InitCount=${pioneerThis.initCount}/${Object.keys(pioneerThis.state.inputToType).length}, inputMissing: ${pioneerThis.inputMissing}`
            );

            alreadyExists = true;
            removeFromInputMissing(pioneerThis, tmpInput.id);
            break;
        }
    }

    // Falls das Input neu ist, füge es hinzu und aktualisiere inputMissing
    if (!alreadyExists) {
        pioneerThis.state.inputs.push(tmpInput);
        removeFromInputMissing(pioneerThis, tmpInput.id);
        pioneerThis.initCount += 1;
        pioneerThis.lastInputDiscovered = Date.now();
        pioneerThis.log.debug(
            `Input [${tmpInput.name}] discovered (id: ${tmpInput.id}, type: ${tmpInput.type}). InitCount=${pioneerThis.initCount}/${Object.keys(pioneerThis.state.inputToType).length}, inputMissing: ${pioneerThis.inputMissing}`
        );
    }

    // Wenn der Input-Index gefunden wurde, rufe den Callback auf
    let inputIndex = pioneerThis.state.inputs.findIndex(input => input.id === tmpInput.id);
    if (inputIndex !== -1) {
        try {
            callback(null, inputIndex);
        } catch (e) {
            pioneerThis.log.debug("onData", e);
        }
    }
}

function removeFromInputMissing(pioneerThis: PioneerAvr, inputId: string) {
    let indexMissing = pioneerThis.inputMissing.findIndex(missingInput => missingInput.indexOf(inputId) > -1);
    if (indexMissing !== -1) {
        pioneerThis.inputMissing.splice(indexMissing, 1);
    }
}
