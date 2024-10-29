// src/pioneerAvr/inputs.ts

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

let inputBeingAdded = false;
let inputBeingAddedWaitCount = 0;

// Input management method
export const loadInputs = async function (this: PioneerAvr, callback: () => void) {
    for (let inputi in inputToTypeList) {
        let key = String(inputToTypeList[inputi][0]);
        let value = String(inputToTypeList[inputi][1]);
        inputToType[key] = value;

        if (inputBeingAdded !== false && inputBeingAddedWaitCount++ < 30) {
            await new Promise(resolve => setTimeout(resolve, 10));
            inputBeingAddedWaitCount = 0;

            while (inputBeingAdded !== false && inputBeingAddedWaitCount++ < 30) {
                await new Promise(resolve => setTimeout(resolve, 150));
            }
        }

        inputBeingAdded = String(key);

        let index = -1;
        for (let i in this.inputMissing) {
            if (this.inputMissing[i].indexOf(key) > -1) {
                index = i;
                break;
            }
        }
        if (index !== -1) {
            this.inputMissing.push([key]);
        }

        await this.sendCommand(`?RGB${key}`, `RGB${key}`, callback);
        await new Promise(resolve => setTimeout(resolve, 150));
    }

    if (inputBeingAdded !== false && inputBeingAddedWaitCount++ < 30) {
        await new Promise(resolve => setTimeout(resolve, 10));
        inputBeingAddedWaitCount = 0;

        while (inputBeingAdded !== false && inputBeingAddedWaitCount++ < 30) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    let inputMissingWhileMax = 0;
    while (this.inputMissing.length > 0 && inputMissingWhileMax++ < 30) {
        for (let thiskey in this.inputMissing) {
            let key = this.inputMissing[thiskey][0];

            if (inputBeingAdded !== false && inputBeingAddedWaitCount++ < 30) {
                await new Promise(resolve => setTimeout(resolve, 10));
                inputBeingAddedWaitCount = 0;

                while (inputBeingAdded !== false && inputBeingAddedWaitCount++ < 30) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            key = String(key);
            inputBeingAdded = key;

            this.log.debug('inputMissing called key', key, this.inputMissing);

            await this.sendCommand(`?RGB${key}`, `RGB${key}`, callback);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    if (this.inputMissing.length === 0 && Object.keys(inputToType).length > 0) {
        this.isReady = true;
    }
};

// Input management methods
export const inputManagementMethods = (pioneerAvr: PioneerAvr) => {
    pioneerAvr.__updateInput = async function (callback: () => void) {
        this.sendCommand("?F", "FN", callback);
    };

    pioneerAvr.inputStatus = async function (callback: (err: any, status?: number) => void) {
        this.log.debug("inputStatus updated %s", this.state.input);
        try {
            callback(null, this.state.input);
        } catch (e) {
            this.log.debug("__updateInput", e);
        }
    };

    pioneerAvr.setInput = async function (id: string) {
        lastUserInteraction = Date.now();
        if (!this.s || !this.s.connectionReady || !this.state.on) { return; }
        if (this.web) {
            await fetch(this.webEventHandlerBaseUrl + `${id}FN`, { method: 'GET' });
        } else {
            this.sendCommand(`${id}FN`);
        }
    };

    pioneerAvr.renameInput = async function (id: string, newName: string) {
        if (!this.s || !this.s.connectionReady || !this.state.on) { return; }
        let shrinkName = newName.replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 14);
        this.sendCommand(`${shrinkName}1RGB${id}`);
    };
};

// Optional: Methode zur Initialisierung in PioneerAvr
export const initializeInputs = (pioneerAvr: PioneerAvr) => {
    pioneerAvr.loadInputs = loadInputs.bind(pioneerAvr);
    inputManagementMethods(pioneerAvr);
};
