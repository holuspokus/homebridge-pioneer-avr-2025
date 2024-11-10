// src/pioneer-avr/onDataHandler.ts

import PioneerAvr from './pioneerAvr';

export function onDataHandler(pioneerThis: PioneerAvr) {

      // Ensure `initCount` is initialized
    if (!(pioneerThis as any).initCount) {
      (pioneerThis as any).initCount = 0;
    }

    return function (error: any, data: string, callback: Function = () => {}) {
        // (pioneerThis as any).log.debug("Receive data: %s", data);

        if (error) {
            (pioneerThis as any).log.error(error);
            try {
                callback(error, data);
            } catch (e) {
                (pioneerThis as any).log.debug("onData", e);
            }
            return;
        }

        if (data.startsWith("E") && !data.startsWith("E06RGB") && !data.startsWith("E04RGB")) {
            (pioneerThis as any).log.debug("Receive error: " + String(data));
            try {
                callback(String(data), data);
            } catch (e) {
                (pioneerThis as any).log.debug("onData", e);
            }
        } else if (data.indexOf("VD:SENT") > -1 || data.indexOf("VU:SENT") > -1 || data.indexOf("MO:SENT") > -1) {
            try {
                callback(error, data);
            } catch (e) {
                (pioneerThis as any).log.debug("onData", e);
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

function handlePowerStatus(data: string, pioneerThis: PioneerAvr, callback: Function) {
    data = data.substring(data.indexOf("PWR"));
    (pioneerThis as any).state.on = parseInt(data[3], 10) === 0;
    (pioneerThis as any).log.debug("Receive Power status: %s (%s)", (pioneerThis as any).state.on ? "On" : "Off", data);
    (pioneerThis as any).state.lastGetPowerStatus = Date.now();

    try {
        callback(null, data);
    } catch (e) {
        (pioneerThis as any).log.debug("onData", e);
    }

    setTimeout(() => {
        try {
            (pioneerThis as any).functionSetPowerState((pioneerThis as any).state.on);
        } catch (e) {
            (pioneerThis as any).log.debug("functionSetPowerState", e);
        }
    }, 2);

    setTimeout(() => {
        try {
            (pioneerThis as any).functionSetLightbulbMuted((pioneerThis as any).state.muted);
        } catch (e) {
            (pioneerThis as any).log.debug("functionSetLightbulbMuted", e);
        }
    }, 20);
}

function handleMuteStatus(data: string, pioneerThis: PioneerAvr, callback: Function) {
    data = data.substring(data.indexOf("MUT"));
    (pioneerThis as any).state.muted = parseInt(data[3], 10) === 0;

    (pioneerThis as any).log.debug("Receive Mute status: %s (%s -> %s)", (pioneerThis as any).state.muted ? "Muted" : "Not Muted", data[3], data);

    try {
        callback(null, (pioneerThis as any).state.muted);
    } catch (e) {
        (pioneerThis as any).log.debug("onData", e);
    }

    setTimeout(() => {
        try {
            (pioneerThis as any).functionSetLightbulbMuted((pioneerThis as any).state.muted);
        } catch (e) {
            (pioneerThis as any).log.debug("functionSetLightbulbMuted", e);
        }
    }, 2);
}

function handleListeningMode(data: string, pioneerThis: PioneerAvr, callback: Function, modeKey: string) {
    data = data.substring(data.indexOf(modeKey === 'listeningMode' ? "SR" : "LM"));
    (pioneerThis as any).state[modeKey] = data.substr(2, 4);
    try {
        callback(null, data);
    } catch (e) {
        (pioneerThis as any).log.debug("onData", e);
    }
}

function handleVolumeStatus(data: string, pioneerThis: PioneerAvr, callback: Function) {
    data = data.substring(data.indexOf("VOL"));
    let vol = data.substr(3, 3);
    let volPctF = calculateVolumePercentage(vol, pioneerThis);

    if (vol.length === 3 && !isNaN(volPctF)) {
        (pioneerThis as any).state.volume = Math.floor(volPctF);
        setTimeout(() => {
            try {
                (pioneerThis as any).functionSetLightbulbVolume((pioneerThis as any).state.volume);
            } catch (e) {
                (pioneerThis as any).log.debug("functionSetLightbulbVolume", e);
            }
        }, 3);
    }

    (pioneerThis as any).log.debug("Volume is %s (%s%%)", vol, volPctF);

    try {
        callback(null, (pioneerThis as any).state.volume);
    } catch (e) {
        (pioneerThis as any).log.debug("onData", e);
    }
}

function calculateVolumePercentage(vol: string, pioneerThis: PioneerAvr) {
    let volPctF = 0;
    if ((pioneerThis as any).maxVolumeSet > (pioneerThis as any).minVolumeSet) {
        const minVolumeIn185 = ((pioneerThis as any).minVolumeSet / 100) * 185;
        const maxVolumeIn185 = ((pioneerThis as any).maxVolumeSet / 100) * 185;
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
    (pioneerThis as any).log.debug("Receive Input status: %s", data);

    let inputId = data.substr(2, 2);
    let inputIndex = (pioneerThis as any).inputs.findIndex(input => input.id === inputId);

    if (inputIndex === -1) {
        try {
            callback(null, 0);
        } catch (e) {
            (pioneerThis as any).log.debug("onData", e);
        }
        return;
    }

    (pioneerThis as any).state.input = inputIndex;
    setTimeout(() => {
        try {
            (pioneerThis as any).functionSetActiveIdentifier((pioneerThis as any).state.input);
        } catch (e) {
            (pioneerThis as any).log.debug("functionSetActiveIdentifier", e);
        }
    }, 2);

    try {
        callback(null, inputIndex);
    } catch (e) {
        (pioneerThis as any).log.debug(String(e));
    }
}

function handleInputErrors(data: string, pioneerThis: PioneerAvr, callback: Function) {
  try {
        data = data.substring(data.indexOf("RGB"));
        let thisId = data.substr(3, 2);

        for (let key in (pioneerThis as any).inputToType) {
            if (String(key) === String(thisId)) {
                delete (pioneerThis as any).inputToType[key];

                let indexMissing = (pioneerThis as any).inputMissing.findIndex(missingInput => missingInput.includes(thisId));
                if (indexMissing !== -1) {
                    (pioneerThis as any).inputMissing.splice(indexMissing, 1);
                }

                if (String((pioneerThis as any).inputBeingAdded) === String(key)) {
                    (pioneerThis as any).inputBeingAdded = false;
                    (pioneerThis as any).inputBeingAddedWaitCount = 0;
                }
                break;
            }
        }


        callback(String(data), data);
    } catch (e) {
        (pioneerThis as any).log.debug("onData", e);
    }
}

function handleInputDiscovery(data: string, pioneerThis: PioneerAvr, callback: Function) {
    data = data.substring(data.indexOf("RGB"));
    let tmpInput = {
        id: data.substr(3, 2),
        name: data.substr(6).trim(),
        type: (pioneerThis as any).inputToType[data.substr(3, 2)],
    };

    if (typeof (pioneerThis as any).inputBeingAdded === 'string' && (pioneerThis as any).inputBeingAdded === tmpInput.id) {
        (pioneerThis as any).inputBeingAdded = false;
        (pioneerThis as any).inputBeingAddedWaitCount = 0;
    }

    let alreadyExists = (pioneerThis as any).inputs.some(input => input.id === tmpInput.id);

    if (!alreadyExists) {
        (pioneerThis as any).inputs.push(tmpInput);
        removeFromInputMissing(pioneerThis, tmpInput.id);
        (pioneerThis as any).initCount += 1;
        (pioneerThis as any).lastInputDiscovered = Date.now();
        (pioneerThis as any).log.info(
            `Input [${tmpInput.name}] discovered (id: ${tmpInput.id}, type: ${tmpInput.type}). InitCount=${(pioneerThis as any).initCount}/${Object.keys((pioneerThis as any).inputToType).length}` +
            ((pioneerThis as any).inputMissing.length > 0 ? `, inputMissing: ${(pioneerThis as any).inputMissing}` : '')
        );

    }

    let inputIndex = (pioneerThis as any).inputs.findIndex(input => input.id === tmpInput.id);
    if (inputIndex !== -1) {
        try {
            callback(null, inputIndex);
        } catch (e) {
            (pioneerThis as any).log.debug("onData", e);
        }
    }
}

function removeFromInputMissing(pioneerThis: PioneerAvr, inputId: string) {
    let indexMissing = (pioneerThis as any).inputMissing.findIndex(missingInput => missingInput.includes(inputId));
    if (indexMissing !== -1) {
        (pioneerThis as any).inputMissing.splice(indexMissing, 1);
    }
}
