// src/pioneer-avr/initialize.ts

import { onDataHandler } from './onDataHandler'; // Import onDataHandler
import PioneerAvr from './pioneerAvr';
import { TelnetAvr } from '../telnet-avr/telnetAvr';
import { API, Logging, Service, Characteristic } from 'homebridge';


class InitializePioneerAvrClass extends PioneerAvr {
    public web: boolean = false;
    public webStatusUrl: string | null = null;
    public webEventHandlerBaseUrl: string | null = null;
    private allInterval!: NodeJS.Timeout;
    public telnetAvr!: TelnetAvr;
    public isReady: boolean = false;
    public lastUserInteraction!: number;
    public onData: (error: any, data: string, callback?: Function) => void; // Type matches onDataHandler

    public __updateVolume: (callback: Function) => void = () => {}; // Empty placeholder
    public __updatePower: (callback: Function) => void = () => {}; // Empty placeholder

    constructor(api: API, log: Logging, host: string, port: number, maxVolumeSet: number, minVolumeSet: number, service: Service, characteristic: Characteristic, pioneerAvrClassCallback?: () => Promise<void>) {
        super(api, log, host, port, maxVolumeSet, minVolumeSet, service, characteristic, pioneerAvrClassCallback);

        // Initialize onData with the onDataHandler function
        this.onData = onDataHandler(this); // Ensure type consistency
        this.initialize(); // Call the async initialize method after instantiation
    }

    private async initialize() {
        this.log.debug('Initializing Pioneer AVR...');

        // Initialize instance variables
        this.webStatusUrl = `http://${this.host}/StatusHandler.asp`;
        this.webEventHandlerBaseUrl = `http://${this.host}/EventHandler.asp?WebToHostItem=`;
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

        // Web interface check
        try {
            const response = await fetch(this.webStatusUrl, { method: 'GET' });
            if (response.status === 200) {
                this.log.info("Web Interface enabled");
                this.web = true;
            }
        } catch (e) {
            this.log.debug('Check web enabled ERROR', e);
        }

        // Communication Initialization
        this.telnetAvr = new TelnetAvr(this.host, this.port, this.log);
        this.telnetAvr.onData = this.onData; // Set onData as fallback

        try {
            this.telnetAvr.connect();
        } catch (e) {
            this.log.debug('Pioneer AVR connection error', e);
        }

        this.log.debug("Wait until telnet connected");

        // Handle disconnection
        this.telnetAvr.addOnDisconnectCallback(() => {
            console.log("Disconnected! Performing cleanup...");
        });

        // Handle connection
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

        // Input initialization handling
        this.initCount = 0;
        this.isReady = false;

        // Display change handling
        this.telnetAvr.displayChanged = (error: any, text: string) => {
            if (error) {
                this.log.error(error);
            }
            if (text) {
                this.log.debug("[DISPLAY] " + text);
            }
        };

        // Polling for updates
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
    const extendedInstance = new InitializePioneerAvrClass(this.api, this.log, this.host, this.port, this.maxVolumeSet, this.minVolumeSet, this.service, this.characteristic, this.pioneerAvrClassCallback) as PioneerAvr;
    Object.assign(this, extendedInstance);
};
