// src/pioneer-avr/inputs.ts

import PioneerAvr from './pioneerAvr';
import { TelnetAvr } from '../telnet-avr/telnetAvr';
import {Service } from 'homebridge';

class InputManagementMethods extends PioneerAvr {
    public prefsDir: string = '';
    public inputBeingAdded: string | boolean = false;
    public inputBeingAddedWaitCount: number = 0;
    public inputMissing: string[][] = [];
    public inputs: any[] = [];
    public tvService!: Service;
    public enabledServices: Service[] = [];
    public telnetAvr!: TelnetAvr;
    public isReady: boolean = false;
    public inputToType: { [key: string]: number } = {};

    constructor(accessory: any, pioneerAvrClassCallback?: () => Promise<void>) {
        super(accessory, pioneerAvrClassCallback);

        this.prefsDir = accessory.prefsDir
        this.inputs = [];

        this.telnetAvr.addOnConnectCallback(async () => {
            await this.loadInputs(() => {
                this.__updateInput(() => {});
            });
        });
    }

    // Method to retrieve the current input status
    public inputStatus(callback: (err: any, inputStatus?: number) => void) {
        if (!this.telnetAvr || !this.telnetAvr.connectionReady || !this.state.on || this.state.input === null) {
            callback(null, 0);
            return;
        }

        this.log.debug("inputStatus updated %s", this.state.input);
        try {
            callback(null, this.state.input);
        } catch (e) {
            this.log.debug("inputStatus callback error", e);
        }
    }

    // Method to set a specific input
    public setInput(id: string) {
        (this as any).lastUserInteraction = Date.now();

        if (!this.telnetAvr || !this.telnetAvr.connectionReady || !this.state.on) {
            return;
        }

        this.telnetAvr.sendMessage(`${id}FN`);
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

            (this as any).inputToType[key] = value;

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

        if (this.inputMissing.length === 0 && Object.keys((this as any).inputToType).length > 0) {
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

    public addInputSourceService(): void {
        // needs to be externally overwritten
    }
}

// Function to initialize input methods and add them to the current instance
export const initializeInputs = function (this: PioneerAvr) {
    const extendedInstance = new InputManagementMethods(
        this.accessory,
        this.pioneerAvrClassCallback
    );
    Object.assign(this, extendedInstance as Omit<typeof extendedInstance, keyof PioneerAvr>);
};
