// src/pioneer-avr/power.ts

import fetch from "node-fetch";
import PioneerAvr from './pioneerAvr';
import { TelnetAvr } from '../telnet-avr/telnetAvr';
import { API, Logging, Service, Characteristic } from 'homebridge';


class PowerManagementMethods extends PioneerAvr {
    public telnetAvr!: TelnetAvr;

    constructor(api: API, log: Logging, host: string, port: number, maxVolumeSet: number, minVolumeSet: number, service: Service, characteristic: Characteristic, pioneerAvrClassCallback?: () => Promise<void>) {
        super(api, log, host, port, maxVolumeSet, minVolumeSet, service, characteristic, pioneerAvrClassCallback);


        // Handle disconnection
        this.telnetAvr.addOnDisconnectCallback(() => {
            this.state.on = false;
            try {
                this.functionSetPowerState(this.state.on);
            } catch (e) {
                this.log.debug("functionSetPowerState", e);
            }
        });

        // Handle connection
        this.telnetAvr.addOnConnectCallback(async () => {
            try {
                this.functionSetPowerState(this.state.on);
            } catch (e) {
                this.log.debug("functionSetPowerState", e);
            }
        });
    }

    // Dummy method placeholders
    public functionSetPowerState(state: boolean) {
        // Implement your logic here
    }

    __updatePower = async function (callback: () => void) {
        this.telnetAvr.sendMessage("?P", "PWR", () => {
            this.state.lastGetPowerStatus = Date.now();
            try {
                callback()
            } catch (e) {
                this.log.debug("__updatePower callback", e);
            }
        });
    };

    powerStatus = async function (callback: (err: any, status?: boolean) => void) {
        if (this.state.on !== null) {
            try {
                callback(null, this.state.on);
            } catch (e) {
                this.log.debug("powerStatus", e);
            }
            return;
        }

        this.__updatePower(() => {
            try {
                callback(null, this.state.on);
            } catch (e) {
                this.log.debug("powerStatus2", e);
            }
        });
    };

    powerOn = async function () {
        this.log.debug("Power on");

        if (this.web) {
            await fetch(this.webEventHandlerBaseUrl + "PO", { method: 'GET' });
        } else {
            this.telnetAvr.sendMessage("PO"); // Direkter Aufruf von sendMessage
        }
        this.lastUserInteraction = Date.now(); // Sicherstellen, dass 'lastUserInteraction' korrekt referenziert wird
        setTimeout(() => {
            this.powerStatus(() => {});
        }, 500);
    };

    powerOff = async function () {
        this.log.debug("Power off");

        if (this.web) {
            await fetch(this.webEventHandlerBaseUrl + "PF", { method: 'GET' });
        } else {
            this.telnetAvr.sendMessage("PF"); // Direkter Aufruf von sendMessage
        }
        this.lastUserInteraction = Date.now(); // Sicherstellen, dass 'lastUserInteraction' korrekt referenziert wird
        setTimeout(() => {
            this.powerStatus(() => {});
        }, 500);
    };
}

// Funktion zum Initialisieren der Power-Methoden
export const initializePower = function (this: PioneerAvr) {
    const extendedInstance = new PowerManagementMethods(this.api, this.log, this.host, this.port, this.maxVolumeSet, this.minVolumeSet, this.service, this.characteristic, this.pioneerAvrClassCallback);
    Object.assign(this, extendedInstance); // Bindet die Methoden an die aktuelle PioneerAvr-Instanz
};
