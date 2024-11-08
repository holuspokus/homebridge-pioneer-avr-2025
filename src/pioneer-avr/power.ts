// src/pioneer-avr/power.ts

import PioneerAvr from './pioneerAvr';
import { TelnetAvr } from '../telnet-avr/telnetAvr';
import { addExitHandler } from '../exitHandler';

class PowerManagementMethods extends PioneerAvr {
    public telnetAvr!: TelnetAvr;

    constructor(accessory: any, pioneerAvrClassCallback?: () => Promise<void>) {
        super(accessory, pioneerAvrClassCallback);

        // Handle disconnection
        this.telnetAvr.addOnDisconnectCallback(() => {
            this.state.on = false;
            try {
                (this as any).functionSetPowerState(this.state.on);
            } catch (e) {
                this.log.debug("functionSetPowerState", e);
            }
        });

        // Handle connection
        this.telnetAvr.addOnConnectCallback(async () => {
            try {
                (this as any).functionSetPowerState(this.state.on);
            } catch (e) {
                this.log.debug("functionSetPowerState", e);
            }
        });

        // Handle exit
        addExitHandler(() => {
            this.state.on = false;
            (this as any).functionSetPowerState(this.state.on);
        }, this);
    }

    // Dummy method placeholders
    public functionSetPowerState() {
        // Implement your logic here
    }

    public async __updatePower (callback: () => void) {
        this.telnetAvr.sendMessage("?P", "PWR", () => {
            this.state.lastGetPowerStatus = Date.now();
            try {
                callback();
            } catch (e) {
                this.log.debug("__updatePower callback", e);
            }
        });
    };

    public async powerStatus (callback: (err: any, status?: boolean) => void) {
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

    public async powerOn () {
        this.log.debug("Power on");

        this.telnetAvr.sendMessage("PO");

        (this as any).lastUserInteraction = Date.now();
        setTimeout(() => {
            this.powerStatus(() => {});
        }, 500);
    };

    public async powerOff () {
        this.log.debug("Power off");

        this.telnetAvr.sendMessage("PF");
        (this as any).lastUserInteraction = Date.now();
        setTimeout(() => {
            this.powerStatus(() => {});
        }, 500);
    };
}

// Initialize power methods and add them to the current instance
export const initializePower = function (this: PioneerAvr) {
    const extendedInstance = new PowerManagementMethods(
        this.accessory,
        this.pioneerAvrClassCallback
    );

    Object.assign(this, extendedInstance as Omit<typeof extendedInstance, keyof PioneerAvr>); // Merging methods into the PioneerAvr instance
};
