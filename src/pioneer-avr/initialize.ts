// src/pioneer-avr/initialize.ts

import { onDataHandler } from './onDataHandler';
import type { Logging } from 'homebridge';
import type { AVState } from './pioneerAvr';
import { TelnetAvr } from '../telnet-avr/telnetAvr';

/**
 * This mixin adds initialization and connection handling capabilities to a base class.
 * It includes methods to handle connection status, set up data handling, and regular state polling.
 * @param Base - The base class to extend.
 * @returns A new class that extends the base class with added initialization logic.
 */
export function InitializeMixin<TBase extends new (...args: any[]) => {
    log: Logging;
    host: string;
    port: number;
    state: AVState;
    pioneerAvrClassCallback?: () => Promise<void>;
    isReady: boolean;
    lastUserInteraction: number;
}>(Base: TBase) {
    return class extends Base {
        public allInterval!: NodeJS.Timeout; // Holds an interval for regular updates
        public telnetAvr!: TelnetAvr;
        public onData!: (error: any, data: string, callback?: Function) => void;
        public __updateVolume!: any;
        public __updatePower!: any;
        public functionSetPowerState!: any;
        public functionSetLightbulbMuted!: any;
        public pioneerAvrClassCallbackCalled: boolean = false;

        constructor(...args: any[]) {
            super(...args);
            // this.setupTelnetConnection();
        }

        /**
         * Sets up the Telnet connection, handling connect/disconnect events.
         */
        public setupTelnetConnection() {
            if (!this.host || !this.port) {
                this.log.error("Host or port information is missing, cannot initialize TelnetAvr.");
                return;
            }

            this.telnetAvr = new TelnetAvr(this.host, this.port, this.log);
            this.onData = onDataHandler(this as any);

            try {
                this.telnetAvr.onData = this.onData;
                this.telnetAvr.connect(() => this.setupConnectionCallbacks());
            } catch (e) {
                this.log.debug('Pioneer AVR connection error', e);
            }

            this.log.debug("Waiting until Telnet is connected", this.host, this.port);
        }

        /**
         * Sets up connection and disconnection callbacks for the Telnet connection.
         */
        public setupConnectionCallbacks() {
            if (!this.telnetAvr) {
                this.log.error("TelnetAvr instance is not initialized.");
                return;
            }

            this.telnetAvr.addOnDisconnectCallback(() => {
                this.log.info("Telnet Disconnected!");
            });

            this.telnetAvr.addOnConnectCallback(async () => {
                this.telnetAvr.sendMessage("?P", "PWR", async () => {
                    this.log.info("Telnet connected");

                    if (!this.pioneerAvrClassCallbackCalled) {
                        this.pioneerAvrClassCallbackCalled = true;
                        await new Promise(resolve => setTimeout(resolve, 50));

                        setTimeout(() => {
                            try {
                                const runThis = this.pioneerAvrClassCallback?.bind(this);
                                if (runThis) {
                                    runThis();
                                }
                            } catch (e) {
                                this.log.debug("connectionReadyCallback() Error", e);
                            }
                        }, 1500);
                    }
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
                    if (this.lastUserInteraction && Date.now() - this.lastUserInteraction > 48 * 60 * 60 * 1000) {
                        return;
                    }
                    if (this.telnetAvr.connectionReady && this.isReady && this.state.on && this.state.lastGetPowerStatus !== null) {
                        this.__updateVolume?.(() => {});
                    }
                    if (this.isReady && this.telnetAvr.connectionReady) {
                        this.__updatePower?.(() => {});
                    }
                } catch (e) {
                    this.log.debug("Polling error", e);
                }
            }, 29000);
        }
    };
}
