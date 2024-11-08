// src/pioneer-avr/initialize.ts

import { onDataHandler } from './onDataHandler';
import PioneerAvr from './pioneerAvr';
import { TelnetAvr } from '../telnet-avr/telnetAvr';
// import typeof { API, Logging, Service, Characteristic } from 'homebridge';

class InitializePioneerAvrClass extends PioneerAvr {
    public web: boolean = false;
    public webStatusUrl: string | null = null;
    public webEventHandlerBaseUrl: string | null = null;
    private allInterval!: NodeJS.Timeout;
    public telnetAvr!: TelnetAvr;
    // public isReady: boolean = false;
    public lastUserInteraction!: number;
    public onData: (error: any, data: string, callback?: Function) => void;
    public __updateVolume!: any;
    public __updatePower!: any;

    public functionSetPowerState!: any;
    public functionSetLightbulbMuted!: any;

    constructor(accessory: any, pioneerAvrClassCallback?: () => Promise<void>) {
        super(accessory, pioneerAvrClassCallback);

        this.onData = onDataHandler(this); // Ensure type consistency
        this.initialize(); // Call the async initialize method after instantiation
    }

    private async initialize() {
        this.log.debug('Initializing Pioneer AVR...');

        this.state = {
            volume: 30,
            on: false,
            muted: true,
            input: 0,
            listeningMode: null,
            listeningModeLM: null,
            lastGetPowerStatus: null
        };

        this.lastUserInteraction = Date.now();

        this.telnetAvr = new TelnetAvr(this.host, this.port, this.log);
        this.telnetAvr.onData = this.onData;

        try {
            this.telnetAvr.connect();
        } catch (e) {
            this.log.debug('Pioneer AVR connection error', e);
        }

        this.log.debug("Wait until telnet connected");

        this.telnetAvr.addOnDisconnectCallback(() => {
            console.log("Disconnected! Performing cleanup...");
        });

        this.telnetAvr.addOnConnectCallback(async () => {
            this.telnetAvr.sendMessage("?P", "PWR", async () => {
                this.log.info("Telnet connected");
                await new Promise(resolve => setTimeout(resolve, 50));

                setTimeout(() => {
                    try {
                        const runThis = this.pioneerAvrClassCallback.bind(this);
                        runThis();
                    } catch (e) {
                        this.log.debug("connectionReadyCallback() Error", e);
                    }
                }, 1500);
            });
        });

        this.isReady = false;

        this.telnetAvr.displayChanged = (text: string) => {
            if (text) {
                this.log.debug("[DISPLAY] " + text);
            }
        };

        clearInterval(this.allInterval);
        this.allInterval = setInterval(async () => {
            try {
                if (this.lastUserInteraction !== null && Date.now() - this.lastUserInteraction > (48 * 60 * 60 * 1000)) {
                    return;
                }
                if (
                    this.telnetAvr.connectionReady &&
                    this.isReady &&
                    this.state.on &&
                    this.state.lastGetPowerStatus !== null
                ) {
                    this.__updateVolume(() => {});
                }
                if (this.isReady && this.telnetAvr.connectionReady) {
                    this.__updatePower(() => {});
                }
            } catch (e) {
                this.log.debug("Polling error", e);
            }
        }, 29000);
    }
}

// Function to initialize the Pioneer AVR with additional methods
export const initializePioneerAvr = function (this: PioneerAvr) {
    const extendedInstance = new InitializePioneerAvrClass(
        this.accessory,
        this.pioneerAvrClassCallback
    );
    Object.assign(this, extendedInstance as Omit<typeof extendedInstance, keyof PioneerAvr>);
};
