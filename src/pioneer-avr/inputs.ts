// src/pioneer-avr/inputs.ts

import * as fs from 'fs';
import * as path from 'path';
import PioneerAvr from './pioneerAvr';
import { TelnetAvr } from '../telnet-avr/telnetAvr';
import { API, Logging, Service, Characteristic } from 'homebridge';

const inputToType: { [key: string]: number } = {};

class InputManagementMethods extends PioneerAvr {
    public prefsDir: string = '';
    public inputVisibilityFile: string = '';
    public savedVisibility: { [key: string]: number } = {};
    public inputBeingAdded: string | boolean = false;
    public inputBeingAddedWaitCount: number = 0;
    public inputMissing: string[][] = [];
    public inputs: any[] = [];
    public tvService!: Service;
    public enabledServices: Service[] = [];
    public telnetAvr!: TelnetAvr;
    public isReady: boolean = false;

    constructor(api: API, log: Logging, host: string, port: number, maxVolumeSet: number, minVolumeSet: number, service: Service, characteristic: Characteristic, pioneerAvrClassCallback?: () => Promise<void>) {
        super(api, log, host, port, maxVolumeSet, minVolumeSet, service, characteristic, pioneerAvrClassCallback);

        this.prefsDir = this.getStoragePath();
        this.inputVisibilityFile = path.join(this.prefsDir, `inputsVisibility_${this.host}`);
        this.inputs = [];

        this.initializeVisibilityFile();

        this.telnetAvr.addOnConnectCallback(async () => {
            await this.loadInputs(() => {
                this.__updateInput(() => {});
            });
        });
    }

    private getStoragePath(): string {
        return path.resolve('./data');
    }

    private initializeVisibilityFile() {
        try {
            if (!fs.existsSync(this.prefsDir)) {
                fs.mkdirSync(this.prefsDir, { recursive: true });
            }

            fs.access(this.inputVisibilityFile, fs.constants.F_OK, (err) => {
                if (err) {
                    fs.writeFile(this.inputVisibilityFile, "{}", (err) => {
                        if (err) {
                            this.log.error("Error creating the Input visibility file:", err);
                        } else {
                            this.log.debug("Input visibility file successfully created.");
                            this.loadSavedVisibility();
                        }
                    });
                } else {
                    this.log.debug("The Input visibility file already exists:", this.inputVisibilityFile);
                    this.loadSavedVisibility();
                }
            });
        } catch (err) {
            this.log.debug("Input visibility file could not be created (%s)", err);
        }
    }

    private loadSavedVisibility() {
        try {
            const fileData = fs.readFileSync(this.inputVisibilityFile, 'utf-8');
            this.savedVisibility = JSON.parse(fileData);
        } catch (err) {
            this.log.debug("Input visibility file does not exist or JSON parsing failed (%s)", err);
        }
    }

    public async loadInputs(callback?: () => void) {
        for (let i = 1; i <= 60; i++) {
            let key = i.toString().padStart(2, '0');
            let value = 0;

            if ([2, 18, 38].includes(i)) value = 2;
            else if ([19, 20, 21, 22, 23, 24, 25, 26, 31, 5, 6, 15].includes(i)) value = 3;
            else if (i === 10) value = 4;
            else if (i === 14) value = 6;
            else if (i === 17) value = 9;
            else if (i === 26) value = 10;
            else if (i === 46) value = 8;

            inputToType[key] = value;

            if (typeof this.inputBeingAdded === 'string' && this.inputBeingAddedWaitCount++ < 30) {
                await new Promise(resolve => setTimeout(resolve, 10));
                this.inputBeingAddedWaitCount = 0;

                while (typeof this.inputBeingAdded === 'string' && this.inputBeingAddedWaitCount++ < 30) {
                    await new Promise(resolve => setTimeout(resolve, 150));
                }
            }

            this.inputBeingAdded = String(key);

            let index: number = -1;

            for (let i in this.inputMissing) {
                if (this.inputMissing[i].indexOf(key) > -1) {
                    index = parseInt(i, 10);
                    break;
                }
            }

            if (index === -1) {
                this.inputMissing.push([key]);
            }

            await this.telnetAvr.sendMessage(`?RGB${key}`, `RGB${key}`, this.addInputSourceService.bind(this));
            await new Promise(resolve => setTimeout(resolve, 150));
        }

        if (typeof this.inputBeingAdded === 'string' && this.inputBeingAddedWaitCount++ < 30) {
            await new Promise(resolve => setTimeout(resolve, 10));
            this.inputBeingAddedWaitCount = 0;

            while (typeof this.inputBeingAdded === 'string' && this.inputBeingAddedWaitCount++ < 30) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        let inputMissingWhileMax = 0;
        while (this.inputMissing.length > 0 && inputMissingWhileMax++ < 30) {
            for (let thiskey in this.inputMissing) {
                let key = this.inputMissing[thiskey][0];

                if (typeof this.inputBeingAdded === 'string' && this.inputBeingAddedWaitCount++ < 30) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                    this.inputBeingAddedWaitCount = 0;

                    while (typeof this.inputBeingAdded === 'string' && this.inputBeingAddedWaitCount++ < 30) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }

                key = String(key);
                this.inputBeingAdded = key;

                this.log.debug('inputMissing called key', key, this.inputMissing);

                await this.telnetAvr.sendMessage(`?RGB${key}`, `RGB${key}`, this.addInputSourceService.bind(this));
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        if (this.inputMissing.length === 0 && Object.keys(inputToType).length > 0) {
            this.isReady = true;
        }

        if (callback) {
            callback();
        }
    }

    private async __updateInput(callback: () => void) {
        this.telnetAvr.sendMessage("?F", "FN", callback);
    }

    public async renameInput(id: string, newName: string) {
        if (!this.telnetAvr || !this.telnetAvr.connectionReady || !this.state.on) return;

        let shrinkName = newName.replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 14);
        this.telnetAvr.sendMessage(`${shrinkName}1RGB${id}`);
    }

    public addInputSourceService(this: InputManagementMethods, inputKey: string): void {
        const key = parseInt(inputKey, 10);

        if (typeof this.inputs[key] === "undefined") {
            this.log.error("addInputSourceService key undefined %s (input: %s)", key, inputKey);
            return;
        }

        this.log.info("Add input n°%s - %s", key, this.inputs[key].name);
        let savedInputVisibility = this.savedVisibility[this.inputs[key].id] ?? this.characteristic.CurrentVisibilityState.SHOWN;

        const tmpInput = new Service.InputSource(
            this.inputs[key].name.replace(/[^a-zA-Z0-9]/g, ""),
            "tvInputService" + String(key)
        );

        tmpInput
            .setCharacteristic(this.characteristic.Identifier, key)
            .setCharacteristic(this.characteristic.ConfiguredName, this.inputs[key].name.replace(/[^a-zA-Z0-9 ]/g, ""))
            .setCharacteristic(this.characteristic.IsConfigured, this.characteristic.IsConfigured.CONFIGURED)
            .setCharacteristic(this.characteristic.InputSourceType, this.inputs[key].type)
            .setCharacteristic(this.characteristic.CurrentVisibilityState, savedInputVisibility)
            .setCharacteristic(this.characteristic.TargetVisibilityState, savedInputVisibility);

        tmpInput
            .getCharacteristic(this.characteristic.TargetVisibilityState)
            .on("set", (state: number, callback: () => void) => {
                this.log.debug("Set %s TargetVisibilityState %s", this.inputs[key].name, state);
                this.savedVisibility[this.inputs[key].id] = state;
                fs.writeFile(this.inputVisibilityFile, JSON.stringify(this.savedVisibility), (err) => {
                    if (err) this.log.debug("Error: Could not write input visibility %s", err);
                    else this.log.debug("Input visibility successfully saved");
                });
                tmpInput.setCharacteristic(this.characteristic.CurrentVisibilityState, state);
                callback();
            });

        tmpInput
            .getCharacteristic(this.characteristic.ConfiguredName)
            .on("set", (name: string, callback: () => void) => {
                this.log.info("Rename input %s to %s", this.inputs[key].name, name.replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 14));
                this.inputs[key].name = name.replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 14);
                this.renameInput(this.inputs[key].id, name);
                callback();
            });

        this.tvService.addLinkedService(tmpInput);
        this.enabledServices.push(tmpInput);
    }
}

export const initializeInputs = function (this: PioneerAvr) {
    const extendedInstance = new InputManagementMethods(this.api, this.log, this.host, this.port, this.maxVolumeSet, this.minVolumeSet, this.service, this.characteristic, this.pioneerAvrClassCallback);
    Object.assign(this, extendedInstance);
};
