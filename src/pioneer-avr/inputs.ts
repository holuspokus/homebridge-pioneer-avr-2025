// src/pioneer-avr/inputs.ts

import PioneerAvr from './pioneerAvr';

// Reference for input id -> Characteristic.InputSourceType
const inputToTypeList = [
    ['25', 3], // BD -> Characteristic.InputSourceType.HDMI
    ['04', 0], // DVD -> Characteristic.InputSourceType.OTHER
    ['01', 0], // CD -> Characteristic.InputSourceType.OTHER
    ['20', 3], // HDMI2 -> Characteristic.InputSourceType.HDMI
    ['19', 3], // HDMI1 -> Characteristic.InputSourceType.HDMI
    ['21', 3], // HDMI3 -> Characteristic.InputSourceType.HDMI
    ['22', 3], // HDMI4 -> Characteristic.InputSourceType.HDMI
    ['23', 3], // HDMI5 -> Characteristic.InputSourceType.HDMI
    ['24', 3], // HDMI6 -> Characteristic.InputSourceType.HDMI
    ['34', 3], // HDMI7 -> Characteristic.InputSourceType.HDMI
    ['35', 3], // HDMI8 -> Characteristic.InputSourceType.HDMI
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
    ['57', 0]  // SPOTIFY -> Characteristic.InputSourceType.OTHER
];

const inputToType: { [key: string]: number } = {};

// Input management method
export const loadInputs = async function (pioneerThis: PioneerAvr, callback: () => void) {
    for (let inputi in inputToTypeList) {
        let key = String(inputToTypeList[inputi][0]);
        let value = Number(inputToTypeList[inputi][1]);
        inputToType[key] = value;

        if (typeof pioneerThis.inputBeingAdded === 'string' && pioneerThis.inputBeingAddedWaitCount++ < 30) {
            await new Promise(resolve => setTimeout(resolve, 10));
            pioneerThis.inputBeingAddedWaitCount = 0;

            while (typeof pioneerThis.inputBeingAdded === 'string' && pioneerThis.inputBeingAddedWaitCount++ < 30) {
                await new Promise(resolve => setTimeout(resolve, 150));
            }
        }

        pioneerThis.inputBeingAdded = String(key);

        let index: number = -1; // Set index as number

        // Loop through the inputMissing array
        for (let i in pioneerThis.inputMissing) {
            // Check if the key exists in the inner array
            if (pioneerThis.inputMissing[i].indexOf(key) > -1) {
                index = parseInt(i, 10); // Convert i to number
                break;
            }
        }

        // If the key is not found, push it as a new inner array
        if (index === -1) {
            pioneerThis.inputMissing.push([key]);
        }



        await this.telnetAvr.sendMessage(`?RGB${key}`, `RGB${key}`, callback);
        await new Promise(resolve => setTimeout(resolve, 150));
    }

    if (typeof pioneerThis.inputBeingAdded === 'string' && pioneerThis.inputBeingAddedWaitCount++ < 30) {
        await new Promise(resolve => setTimeout(resolve, 10));
        pioneerThis.inputBeingAddedWaitCount = 0;

        while (typeof pioneerThis.inputBeingAdded === 'string' && pioneerThis.inputBeingAddedWaitCount++ < 30) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    let inputMissingWhileMax = 0;
    while (pioneerThis.inputMissing.length > 0 && inputMissingWhileMax++ < 30) {
        for (let pioneerThiskey in pioneerThis.inputMissing) {
            let key = pioneerThis.inputMissing[pioneerThiskey][0];

            if (typeof pioneerThis.inputBeingAdded === 'string' && pioneerThis.inputBeingAddedWaitCount++ < 30) {
                await new Promise(resolve => setTimeout(resolve, 10));
                pioneerThis.inputBeingAddedWaitCount = 0;

                while (typeof pioneerThis.inputBeingAdded === 'string' && pioneerThis.inputBeingAddedWaitCount++ < 30) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            key = String(key);
            pioneerThis.inputBeingAdded = key;

            pioneerThis.log.debug('inputMissing called key', key, pioneerThis.inputMissing);

            await this.telnetAvr.sendMessage(`?RGB${key}`, `RGB${key}`, callback);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    if (pioneerThis.inputMissing.length === 0 && Object.keys(inputToType).length > 0) {
        pioneerThis.isReady = true;
    }
};

// Input management methods
export const inputManagementMethods = (pioneerThis: PioneerAvr) => {
    pioneerThis.__updateInput = async function (callback: () => void) {
        this.telnetAvr.sendMessage("?F", "FN", callback);
    };

    pioneerThis.inputStatus = async function (callback: (err: any, status?: number) => void) {
        pioneerThis.log.debug("inputStatus updated %s", pioneerThis.state.input);
        try {
            callback(null, pioneerThis.state.input);
        } catch (e) {
            pioneerThis.log.debug("__updateInput", e);
        }
    };

    pioneerThis.setInput = async function (id: string) {
        lastUserInteraction = Date.now();
        if (!pioneerThis.telnetAvr || !pioneerThis.telnetAvr.connectionReady || !pioneerThis.state.on) { return; }
        if (pioneerThis.web) {
            await fetch(pioneerThis.webEventHandlerBaseUrl + `${id}FN`, { method: 'GET' });
        } else {
            this.telnetAvr.sendMessage(`${id}FN`);
        }
    };

    pioneerThis.renameInput = async function (id: string, newName: string) {
        if (!pioneerThis.telnetAvr || !pioneerThis.telnetAvr.connectionReady || !pioneerThis.state.on) { return; }
        let shrinkName = newName.replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 14);
        this.telnetAvr.sendMessage(`${shrinkName}1RGB${id}`);
    };
};

// Optional: Methode zur Initialisierung in PioneerAvr
export const initializeInputs = (pioneerThis: PioneerAvr) => {
    pioneerThis.loadInputs = loadInputs.bind(pioneerThis);
    inputManagementMethods(pioneerThis);
};
